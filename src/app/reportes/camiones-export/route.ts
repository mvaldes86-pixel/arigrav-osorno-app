import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type GuiaRow = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  chofer: string | null;
  patente: string | null;
  medio_pago: string | null;
  valor_flete: number | null;
  clientes?: { nombre: string } | null;
  transportes?: { nombre: string } | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  producto_id: string | null;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

type ProductoRow = {
  id: string;
  nombre: string;
};

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function medioPagoLabel(v: string | null) {
  if (!v) return "-";
  const x = String(v).toUpperCase();
  if (x === "BANCO_CHILE") return "Banco de Chile";
  if (x === "BANCO_ESTADO") return "Banco Estado";
  if (x === "EFECTIVO") return "Efectivo";
  if (x === "CREDITO") return "Crédito";
  return v;
}

function getClientName(g: GuiaRow) {
  return g.clientes?.nombre ?? "";
}

function getTransporteName(g: GuiaRow) {
  return g.transportes?.nombre ?? "ARIGRAV";
}

function pozoPagoLabel(g: GuiaRow) {
  const faena = (g.faena ?? "").trim();
  const pago = medioPagoLabel(g.medio_pago);
  if (faena && pago && pago !== "-") return `${faena} / ${pago}`;
  if (faena) return faena;
  if (pago && pago !== "-") return pago;
  return "-";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Fechas requeridas" }, { status: 400 });
  }

  const { data: guiasData, error: guiasError } = await supabase
    .from("guias")
    .select(
      "id, numero, fecha, faena, chofer, patente, medio_pago, valor_flete, clientes(nombre), transportes(nombre)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (guiasError) {
    return NextResponse.json({ error: guiasError.message }, { status: 500 });
  }

  const guias = (guiasData ?? []) as unknown as GuiaRow[];
  const guiaIds = guias.map((g) => g.id);

  let items: ItemRow[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("guia_items")
      .select("id, guia_id, producto_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    items = (itemsData ?? []) as ItemRow[];
  }

  const productoIds = Array.from(new Set(items.map((it) => it.producto_id).filter(Boolean))) as string[];

  const productosMap = new Map<string, string>();
  if (productoIds.length > 0) {
    const { data: productosData, error: productosError } = await supabase
      .from("productos")
      .select("id, nombre")
      .in("id", productoIds);

    if (productosError) {
      return NextResponse.json({ error: productosError.message }, { status: 500 });
    }

    for (const p of (productosData ?? []) as ProductoRow[]) {
      productosMap.set(p.id, p.nombre);
    }
  }

  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const rows = items.map((it) => {
    const g = guiaMap.get(it.guia_id);
    const cubos = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);
    const neto = cubos * precio;
    const flete = g ? safeNum(g.valor_flete) : 0;
    const total = neto - flete;

    return {
      TRANSPORTE: g ? getTransporteName(g) : "",
      EMPRESA: g ? getClientName(g) : "",
      MATERIAL: productosMap.get(it.producto_id ?? "") ?? "",
      CUBOS: cubos,
      FECHA: g?.fecha ?? "",
      PRECIO: precio,
      NETO: neto,
      FLETE: flete,
      TOTAL: total,
      REPORT: g?.numero ?? "",
      CHOFER: g?.chofer ?? "",
      PATENTE: g?.patente ?? "",
      "POZO/PAGO": g ? pozoPagoLabel(g) : "-",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Resumen Semana");

  ws["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 32 },
  ];

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  });

  const nombreArchivo = `RESUMEN_SEMANA_${desde}_AL_${hasta}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${nombreArchivo}`,
    },
  });
}
