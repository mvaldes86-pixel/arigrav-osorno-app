import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type NombreRel = { nombre: string } | { nombre: string }[] | null;

type GuiaRow = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  chofer: string | null;
  patente: string | null;
  valor_flete: number | null;
  medio_pago: string | null;
  clientes?: NombreRel;
  transportes?: NombreRel;
};

type ItemRow = {
  guia_id: string;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getNombre(rel?: NombreRel): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nombre ?? "";
  return rel.nombre ?? "";
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Fechas requeridas" }, { status: 400 });
  }

  const { data: guiasData, error: guiasError } = await supabase
    .from("guias")
    .select(`
      id,
      numero,
      fecha,
      faena,
      chofer,
      patente,
      valor_flete,
      medio_pago,
      clientes(nombre),
      transportes(nombre)
    `)
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (guiasError) {
    return NextResponse.json({ error: guiasError.message }, { status: 500 });
  }

  const guias = ((guiasData ?? []) as unknown as GuiaRow[]).filter(
    (g) => safeNum(g.valor_flete) > 0
  );

  const guiaIds = guias.map((g) => g.id);

  let items: ItemRow[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("guia_items")
      .select("guia_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    items = (itemsData ?? []) as ItemRow[];
  }

  const detalleMap = new Map<
    string,
    {
      GUIA: number | string;
      FECHA: string;
      CLIENTE: string;
      FAENA: string;
      TRANSPORTE: string;
      CHOFER: string;
      PATENTE: string;
      METODO_PAGO: string;
      M3: number;
      VALOR_FLETE: number;
      TOTAL_MATERIAL: number;
      TOTAL_GUIA: number;
    }
  >();

  for (const g of guias) {
    const valorFlete = safeNum(g.valor_flete);
    if (valorFlete <= 0) continue;

    detalleMap.set(g.id, {
      GUIA: g.numero ?? "-",
      FECHA: g.fecha ?? "-",
      CLIENTE: getNombre(g.clientes),
      FAENA: g.faena ?? "-",
      TRANSPORTE: getNombre(g.transportes) || "ARIGRAV",
      CHOFER: g.chofer ?? "-",
      PATENTE: g.patente ?? "-",
      METODO_PAGO: medioPagoLabel(g.medio_pago),
      M3: 0,
      VALOR_FLETE: valorFlete,
      TOTAL_MATERIAL: 0,
      TOTAL_GUIA: valorFlete,
    });
  }

  for (const it of items) {
    const row = detalleMap.get(it.guia_id);
    if (!row) continue;

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);

    row.M3 += m3;
    row.TOTAL_MATERIAL += m3 * precio;
    row.TOTAL_GUIA = row.TOTAL_MATERIAL + row.VALOR_FLETE;
  }

  const detalle = Array.from(detalleMap.values()).sort((a, b) => {
    if (a.FECHA === b.FECHA) {
      return String(a.GUIA).localeCompare(String(b.GUIA), "es", { numeric: true });
    }
    return a.FECHA.localeCompare(b.FECHA);
  });

  const resumenTransporteMap = new Map<
    string,
    {
      TRANSPORTE: string;
      VIAJES: number;
      TOTAL_M3: number;
      TOTAL_FLETES: number;
      PROM_FLETE_VIAJE: number;
    }
  >();

  const resumenChoferMap = new Map<
    string,
    {
      CHOFER: string;
      VIAJES: number;
      TOTAL_M3: number;
      TOTAL_FLETES: number;
      PROM_FLETE_VIAJE: number;
    }
  >();

  for (const r of detalle) {
    if (safeNum(r.VALOR_FLETE) <= 0) continue;

    const keyT = String(r.TRANSPORTE || "SIN TRANSPORTE").trim().toUpperCase();
    if (!resumenTransporteMap.has(keyT)) {
      resumenTransporteMap.set(keyT, {
        TRANSPORTE: r.TRANSPORTE || "SIN TRANSPORTE",
        VIAJES: 0,
        TOTAL_M3: 0,
        TOTAL_FLETES: 0,
        PROM_FLETE_VIAJE: 0,
      });
    }

    const aggT = resumenTransporteMap.get(keyT)!;
    aggT.VIAJES += 1;
    aggT.TOTAL_M3 += safeNum(r.M3);
    aggT.TOTAL_FLETES += safeNum(r.VALOR_FLETE);
    aggT.PROM_FLETE_VIAJE = aggT.VIAJES > 0 ? aggT.TOTAL_FLETES / aggT.VIAJES : 0;

    const keyC = String(r.CHOFER || "SIN CHOFER").trim().toUpperCase();
    if (!resumenChoferMap.has(keyC)) {
      resumenChoferMap.set(keyC, {
        CHOFER: r.CHOFER || "SIN CHOFER",
        VIAJES: 0,
        TOTAL_M3: 0,
        TOTAL_FLETES: 0,
        PROM_FLETE_VIAJE: 0,
      });
    }

    const aggC = resumenChoferMap.get(keyC)!;
    aggC.VIAJES += 1;
    aggC.TOTAL_M3 += safeNum(r.M3);
    aggC.TOTAL_FLETES += safeNum(r.VALOR_FLETE);
    aggC.PROM_FLETE_VIAJE = aggC.VIAJES > 0 ? aggC.TOTAL_FLETES / aggC.VIAJES : 0;
  }

  const resumenTransporte = Array.from(resumenTransporteMap.values()).sort(
    (a, b) => b.TOTAL_FLETES - a.TOTAL_FLETES
  );

  const resumenChofer = Array.from(resumenChoferMap.values()).sort(
    (a, b) => b.TOTAL_FLETES - a.TOTAL_FLETES
  );

  const wb = XLSX.utils.book_new();

  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Fletes");

  const wsTransporte = XLSX.utils.json_to_sheet(resumenTransporte);
  wsTransporte["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTransporte, "Resumen Transporte");

  const wsChofer = XLSX.utils.json_to_sheet(resumenChofer);
  wsChofer["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChofer, "Resumen Chofer");

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=RESUMEN_FLETES_${desde}_${hasta}.xlsx`,
    },
  });
}