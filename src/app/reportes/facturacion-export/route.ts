import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"

function safeNum(v:any){
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function GET(req:Request){

  const {searchParams} = new URL(req.url)

  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")

  const {data:guias} = await supabase
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
    estado_facturacion,
    clientes(nombre),
    transportes(nombre)
  `)
  .gte("fecha",desde)
  .lte("fecha",hasta)

  const guiaIds = guias?.map(g=>g.id) ?? []

  const {data:items} = await supabase
  .from("guia_items")
  .select(`
    guia_id,
    producto_id,
    cantidad_m3,
    precio_m3
  `)
  .in("guia_id",guiaIds)

  const productoIds = [...new Set(items?.map(i=>i.producto_id))]

  const {data:productos} = await supabase
  .from("productos")
  .select("id,nombre")
  .in("id",productoIds)

  const prodMap = new Map()

  productos?.forEach(p=>{
    prodMap.set(p.id,p.nombre)
  })

  const guiaMap = new Map()

  guias?.forEach(g=>{
    guiaMap.set(g.id,g)
  })

  const rows = items?.map(it=>{

    const g = guiaMap.get(it.guia_id)

    const m3 = safeNum(it.cantidad_m3)
    const precio = safeNum(it.precio_m3)

    const neto = m3 * precio
    const flete = safeNum(g?.valor_flete)

    return {

      Cliente : g?.clientes?.nombre ?? "",
      Fecha : g?.fecha ?? "",
      NumeroGuia : g?.numero ?? "",
      Faena : g?.faena ?? "",
      Transporte : g?.transportes?.nombre ?? "ARIGRAV",
      Chofer : g?.chofer ?? "",
      Patente : g?.patente ?? "",
      Producto : prodMap.get(it.producto_id) ?? "",
      m3 : m3,
      Precio_m3 : precio,
      Neto_material : neto,
      Valor_flete : flete,
      Total_linea : neto + flete,
      Medio_pago : g?.medio_pago ?? "",
      Estado : g?.estado_facturacion ?? ""

    }

  }) ?? []

  const ws = XLSX.utils.json_to_sheet(rows)

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    "Facturacion"
  )

  const buffer = XLSX.write(
    wb,
    {type:"buffer",bookType:"xlsx"}
  )

  return new NextResponse(buffer,{
    headers:{
      "Content-Disposition":
      `attachment; filename=Facturacion_${desde}_${hasta}.xlsx`,
      "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  })

}