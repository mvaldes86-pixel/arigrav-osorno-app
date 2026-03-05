import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISOOrDefault(v: string | null, fallback: string) {
  if (!v) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return fallback;
}

function csvEscape(s: any) {
  const str = String(s ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hoy = todayISO();
  const defaultDesde = addDaysISO(hoy, -7);

  const desde = parseISOOrDefault(url.searchParams.get("desde"), defaultDesde);
  const hasta = parseISOOrDefault(url.searchParams.get("hasta"), hoy);

  const { data, error } = await supabase.rpc("report_facturacion_resumen", {
    p_desde: desde,
    p_hasta: hasta,
  });

  if (error) {
    console.error(
      `CSV facturacion error: message="${error.message}" code="${error.code}" details="${error.details}" hint="${error.hint}"`,
      error
    );
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as any[];

  const header = [
    "cliente",
    "guias_total",
    "m3_total",
    "total_clp",
    "guias_pendientes",
    "m3_pendiente",
    "total_pendiente_clp",
    "guias_facturadas",
    "m3_facturado",
    "total_facturado_clp",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.cliente_nombre),
        csvEscape(r.guias_total),
        csvEscape(r.m3_total),
        csvEscape(r.total_clp),
        csvEscape(r.guias_pendientes),
        csvEscape(r.m3_pendiente),
        csvEscape(r.total_pendiente_clp),
        csvEscape(r.guias_facturadas),
        csvEscape(r.m3_facturado),
        csvEscape(r.total_facturado_clp),
      ].join(",")
    );
  }

  const csv = lines.join("\n");
  const filename = `facturacion_${desde}_a_${hasta}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}