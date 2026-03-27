import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function medioPagoLabel(v: string | null) {
  if (!v) return "";
  const x = String(v).toUpperCase();
  if (x === "BANCO_CHILE") return "Banco de Chile";
  if (x === "BANCO_ESTADO") return "Banco Estado";
  if (x === "EFECTIVO") return "Efectivo";
  if (x === "CREDITO") return "Crédito";
  return v;
}

type GuiaRow = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  orden_compra: string | null;
  chofer: string | null;
  patente: string | null;
  valor_flete: number | null;
  medio_pago: string | null;
  estado_facturacion: string | null;
  clientes?: { nombre: string } | { nombre: string }[] | null;
  transportes?: { nombre: string } | { nombre: string }[] | null;
};

type ItemRow = {
  guia_id: string;
  producto_id: string | null;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

type ProductoRow = {
  id: string;
  nombre: string;
};

function getNombre(rel?: { nombre: string } | { nombre: string }[] | null): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nombre ?? "";
  return rel.nombre ?? "";
}

async function fetchGuiasEnRango(desde: string, hasta: string) {
  const { data, error } = await supabase
    .from("guias")
    .select(`
      id,
      numero,
      fecha,
      faena,
      orden_compra,
      chofer,
      patente,
      valor_flete,
      medio_pago,
      estado_facturacion,
      clientes(nombre),
      transportes(nombre)
    `)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .neq("estado_facturacion", "ANULADA")
    .order("fecha", { ascending: true });

  if (error) throw error;
  return (data ?? []) as GuiaRow[];
}

async function fetchItemsPorGuias(guiaIds: string[]) {
  if (guiaIds.length === 0) return [] as ItemRow[];

  const chunkSize = 200;
  const allRows: ItemRow[] = [];

  for (let i = 0; i < guiaIds.length; i += chunkSize) {
    const chunk = guiaIds.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from("guia_items")
      .select(`
        guia_id,
        producto_id,
        cantidad_m3,
        precio_m3
      `)
      .in("guia_id", chunk);

    if (error) throw error;

    allRows.push(...((data ?? []) as ItemRow[]));
  }

  return allRows;
}

async function fetchProductosMap(productoIds: string[]) {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(productoIds)).filter(Boolean);

  if (ids.length === 0) return map;

  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from("productos")
      .select("id, nombre")
      .in("id", chunk);

    if (error) throw error;

    for (const p of (data ?? []) as ProductoRow[]) {
      map.set(p.id, p.nombre);
    }
  }

  return map;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: "Faltan parámetros desde/hasta" },
        { status: 400 }
      );
    }

    const guias = await fetchGuiasEnRango(desde, hasta);
    const guiaIds = guias.map((g) => g.id);

    const items = await fetchItemsPorGuias(guiaIds);
    const productosMap = await fetchProductosMap(items.map((it) => it.producto_id ?? ""));

    const guiaMap = new Map<string, GuiaRow>();
    for (const g of guias) guiaMap.set(g.id, g);

    const rows = items.map((it) => {
      const g = guiaMap.get(it.guia_id);

      if (!g) {
        return {
          Cliente: "",
          Fecha: "",
          NumeroGuia: "",
          Faena: "",
          Orden_compra: "",
          Transporte: "",
          Chofer: "",
          Patente: "",
          Producto: "",
          m3: 0,
          Precio: 0,
          Total_material: 0,
          Valor_flete: 0,
          Total_ganancia: 0,
          Medio_pago: "",
          Estado: "",
        };
      }

      const m3 = safeNum(it.cantidad_m3);
      const precio = safeNum(it.precio_m3);
      const totalMaterial = m3 * precio;
      const valorFlete = safeNum(g.valor_flete);
      const totalGanancia = totalMaterial - valorFlete;

      return {
        Cliente: getNombre(g.clientes) ?? "",
        Fecha: g.fecha ?? "",
        NumeroGuia: g.numero ?? "",
        Faena: g.faena ?? "",
        Orden_compra: g.orden_compra ?? "",
        Transporte: getNombre(g.transportes) || "ARIGRAV",
        Chofer: g.chofer ?? "",
        Patente: g.patente ?? "",
        Producto: productosMap.get(it.producto_id ?? "") ?? "",
        m3,
        Precio: precio,
        Total_material: totalMaterial,
        Valor_flete: valorFlete,
        Total_ganancia: totalGanancia,
        Medio_pago: medioPagoLabel(g.medio_pago),
        Estado: g.estado_facturacion ?? "",
      };
    });

    const headers = [
      "Cliente",
      "Fecha",
      "NumeroGuia",
      "Faena",
      "Orden_compra",
      "Transporte",
      "Chofer",
      "Patente",
      "Producto",
      "m3",
      "Precio",
      "Total_material",
      "Valor_flete",
      "Total_ganancia",
      "Medio_pago",
      "Estado",
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturacion");

    const buffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename=Facturacion_${desde}_${hasta}.xlsx`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bad Request" },
      { status: 400 }
    );
  }
}