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

function isGuiaActiva(estado: string | null) {
  return String(estado ?? "").toUpperCase() !== "ANULADA";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Faltan parámetros desde/hasta" },
      { status: 400 }
    );
  }

  const { data: guiasRaw, error: guiasError } = await supabase
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
    .order("fecha", { ascending: true });

  if (guiasError) {
    return NextResponse.json(
      { error: guiasError.message ?? "No se pudieron leer las guías" },
      { status: 500 }
    );
  }

  const guias = (guiasRaw ?? []).filter((g: any) =>
    isGuiaActiva(g?.estado_facturacion ?? null)
  );

  const guiaIds = guias.map((g: any) => g.id);

  if (guiaIds.length === 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [
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
      ],
    ]);
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
  }

  const { data: items, error: itemsError } = await supabase
    .from("guia_items")
    .select(`
      guia_id,
      producto_id,
      cantidad_m3,
      precio_m3
    `)
    .in("guia_id", guiaIds);

  if (itemsError) {
    return NextResponse.json(
      { error: itemsError.message ?? "No se pudieron leer los items" },
      { status: 500 }
    );
  }

  const productoIds = [
    ...new Set((items ?? []).map((i: any) => i.producto_id).filter(Boolean)),
  ];

  let productos: any[] = [];
  if (productoIds.length > 0) {
    const { data: productosData, error: productosError } = await supabase
      .from("productos")
      .select("id, nombre")
      .in("id", productoIds);

    if (productosError) {
      return NextResponse.json(
        { error: productosError.message ?? "No se pudieron leer los productos" },
        { status: 500 }
      );
    }

    productos = productosData ?? [];
  }

  const prodMap = new Map<string, string>();
  productos.forEach((p: any) => {
    prodMap.set(p.id, p.nombre);
  });

  const guiaMap = new Map<string, any>();
  guias.forEach((g: any) => {
    guiaMap.set(g.id, g);
  });

  const rows =
    (items ?? []).map((it: any) => {
      const g = guiaMap.get(it.guia_id);
      if (!g) return null;

      const m3 = safeNum(it.cantidad_m3);
      const precio = safeNum(it.precio_m3);
      const totalMaterial = m3 * precio;
      const valorFlete = safeNum(g?.valor_flete);
      const totalGanancia = totalMaterial - valorFlete;

      return {
        Cliente: g?.clientes?.nombre ?? "",
        Fecha: g?.fecha ?? "",
        NumeroGuia: g?.numero ?? "",
        Faena: g?.faena ?? "",
        Orden_compra: g?.orden_compra ?? "",
        Transporte: g?.transportes?.nombre ?? "ARIGRAV",
        Chofer: g?.chofer ?? "",
        Patente: g?.patente ?? "",
        Producto: prodMap.get(it.producto_id) ?? "",
        m3,
        Precio: precio,
        Total_material: totalMaterial,
        Valor_flete: valorFlete,
        Total_ganancia: totalGanancia,
        Medio_pago: medioPagoLabel(g?.medio_pago ?? ""),
        Estado: g?.estado_facturacion ?? "",
      };
    }).filter(Boolean) ?? [];

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
}