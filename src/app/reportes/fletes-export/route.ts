import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"

function n(v: any) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function GET(req: Request) {

  const { searchParams } = new URL(req.url)

  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")

  const { data: guias } = await supabase
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
    .lte("fecha", hasta)

  const guiaIds = guias?.map(g => g.id) ?? []

  const { data: items } = await supabase
    .from("guia_items")
    .select(`
      guia_id,
      producto_id,
      cantidad_m3,
      precio_m3
    `)
    .in("guia_id", guiaIds)

  const { data: productos } = await supabase
    .from("productos")
    .select("id,nombre")

  const prodMap = new Map()
  productos?.forEach(p => prodMap.set(p.id, p.nombre))

  const guiaMap = new Map()
  guias?.forEach(g => guiaMap.set(g.id, g))

  /* ================================
     DETALLE FLETES
  ================================= */

  const detalle = items?.map(it => {

    const g = guiaMap.get(it.guia_id)

    const m3 = n(it.cantidad_m3)
    const precio = n(it.precio_m3)

    const totalMaterial = m3 * precio
    const flete = n(g?.valor_flete)

    const ganancia = totalMaterial - flete

    return {
      Numero_guia: g?.numero,
      Fecha: g?.fecha,
      Cliente: g?.clientes?.nombre ?? "",
      Faena: g?.faena ?? "",
      Transporte: g?.transportes?.nombre ?? "ARIGRAV",
      Chofer: g?.chofer ?? "",
      Patente: g?.patente ?? "",
      Producto: prodMap.get(it.producto_id) ?? "",
      m3,
      Precio: precio,
      Total_material: totalMaterial,
      Valor_flete: flete,
      Total_ganancia: ganancia,
      Medio_pago: g?.medio_pago ?? ""
    }

  }) ?? []

  /* ================================
     RESUMEN TRANSPORTE
  ================================= */

  const transporteMap = new Map()

  detalle.forEach(r => {

    const key = r.Transporte

    if (!transporteMap.has(key)) {

      transporteMap.set(key, {
        Transporte: key,
        Viajes: 0,
        m3: 0,
        Total_fletes: 0
      })

    }

    const row = transporteMap.get(key)

    row.Viajes += 1
    row.m3 += r.m3
    row.Total_fletes += r.Valor_flete

  })

  const resumenTransporte = Array.from(transporteMap.values())

  /* ================================
     RESUMEN CHOFER
  ================================= */

  const choferMap = new Map()

  detalle.forEach(r => {

    const key = r.Chofer

    if (!choferMap.has(key)) {

      choferMap.set(key, {
        Chofer: key,
        Viajes: 0,
        m3: 0,
        Total_fletes: 0
      })

    }

    const row = choferMap.get(key)

    row.Viajes += 1
    row.m3 += r.m3
    row.Total_fletes += r.Valor_flete

  })

  const resumenChofer = Array.from(choferMap.values())

  /* ================================
     EXCEL
  ================================= */

  const wb = XLSX.utils.book_new()

  const wsDetalle = XLSX.utils.json_to_sheet(detalle)
  const wsTransporte = XLSX.utils.json_to_sheet(resumenTransporte)
  const wsChofer = XLSX.utils.json_to_sheet(resumenChofer)

  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Fletes")
  XLSX.utils.book_append_sheet(wb, wsTransporte, "Resumen Transporte")
  XLSX.utils.book_append_sheet(wb, wsChofer, "Resumen Chofer")

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx"
  })

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename=Fletes_${desde}_${hasta}.xlsx`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  })

}