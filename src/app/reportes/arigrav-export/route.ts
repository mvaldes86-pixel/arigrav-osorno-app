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
  clientes?: { nombre: string } | null;
  transportes?: { nombre: string } | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getClientName(g: GuiaRow) {
  return g.clientes?.nombre ?? "";
}

function getTransporteName(g: GuiaRow) {
  return (g.transportes?.nombre ?? "").trim().toUpperCase();
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
    .select("id, numero, fecha, faena, chofer, patente, clientes(nombre), transportes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (guiasError) {
    return NextResponse.json({ error: guiasError.message }, { status: 500 });
  }

  const guias = ((guiasData ?? []) as GuiaRow[]).filter(
    (g) => getTransporteName(g) === "ARIGRAV"
  );

  const guiaIds = guias.map((g) => g.id);

  let items: ItemRow[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("guia_items")
      .select("id, guia_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    items = (itemsData ?? []) as ItemRow[];
  }

  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const detalleMap = new Map<
    string,
    {
      numero_guia: number | string;
      faena: string;
      cliente_empresa: string;
      chofer: string;
      patente: string;
      m3: number;
      total_material: number;
      total_vueltas_viajes: number;
    }
  >();

  for (const g of guias) {
    detalleMap.set(g.id, {
      numero_guia: g.numero ?? "",
      faena: g.faena ?? "",
      cliente_empresa: getClientName(g),
      chofer: g.chofer ?? "",
      patente: g.patente ?? "",
      m3: 0,
      total_material: 0,
      total_vueltas_viajes: 1,
    });
  }

  for (const it of items) {
    const row = detalleMap.get(it.guia_id);
    if (!row) continue;

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);

    row.m3 += m3;
    row.total_material += m3 * precio;
  }

  const detalleRows = Array.from(detalleMap.values()).sort((a, b) => {
    return String(a.numero_guia).localeCompare(String(b.numero_guia), "es", { numeric: true });
  });

  const resumenChoferMap = new Map<
    string,
    {
      chofer: string;
      viajes: number;
      m3: number;
      total_material: number;
    }
  >();

  for (const r of detalleRows) {
    const key = (r.chofer || "(sin chofer)").trim().toUpperCase();

    if (!resumenChoferMap.has(key)) {
      resumenChoferMap.set(key, {
        chofer: r.chofer || "(sin chofer)",
        viajes: 0,
        m3: 0,
        total_material: 0,
      });
    }

    const agg = resumenChoferMap.get(key)!;
    agg.viajes += 1;
    agg.m3 += safeNum(r.m3);
    agg.total_material += safeNum(r.total_material);
  }

  const resumenChoferRows = Array.from(resumenChoferMap.values()).sort((a, b) => {
    if (b.viajes !== a.viajes) return b.viajes - a.viajes;
    return b.m3 - a.m3;
  });

  const wb = XLSX.utils.book_new();

  const wsDetalle = XLSX.utils.json_to_sheet(
    detalleRows.map((r) => ({
      NUMERO_GUIA: r.numero_guia,
      FAENA: r.faena,
      CLIENTE_EMPRESA: r.cliente_empresa,
      CHOFER: r.chofer,
      PATENTE: r.patente,
      M3: r.m3,
      TOTAL_MATERIAL: r.total_material,
      TOTAL_VUELTAS_VIAJES: r.total_vueltas_viajes,
    }))
  );

  wsDetalle["!cols"] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Arigrav");

  const wsResumen = XLSX.utils.json_to_sheet(
    resumenChoferRows.map((r) => ({
      CHOFER: r.chofer,
      VIAJES: r.viajes,
      M3: r.m3,
      TOTAL_MATERIAL: r.total_material,
    }))
  );

  wsResumen["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Chofer");

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  });

  const nombreArchivo = `ARIGRAV_${desde}_AL_${hasta}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${nombreArchivo}`,
    },
  });
}