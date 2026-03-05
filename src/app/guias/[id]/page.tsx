import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Guia = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  chofer: string | null;
  patente: string | null;
  medio_pago: "BANCO_CHILE" | "BANCO_ESTADO" | "EFECTIVO" | "CREDITO" | string | null;
  tipo_operacion: string | null;
  estado_facturacion: string | null;
  sector: string | null;
  total: number | null;
  clientes?: { nombre: string } | null;
};

type GuiaItem = {
  id: string;
  producto_id: string;
  cantidad_m3: number;
  precio_m3: number;
  subtotal: number;
};

type Producto = {
  id: string;
  nombre: string;
};

function medioPagoLabel(v: string | null) {
  if (!v) return "-";
  if (v === "BANCO_CHILE") return "Banco de Chile";
  if (v === "BANCO_ESTADO") return "Banco Estado";
  if (v === "EFECTIVO") return "Efectivo";
  if (v === "CREDITO") return "Crédito";
  return v;
}

function logSupabaseError(tag: string, err: any) {
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  const details = err?.details ?? "";
  const hint = err?.hint ?? "";
  console.error(`${tag} message="${msg}" code="${code}" details="${details}" hint="${hint}"`, err);
}

export default async function GuiaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: guia, error: guiaErr } = await supabase
    .from("guias")
    .select(
      "id, numero, fecha, faena, chofer, patente, medio_pago, tipo_operacion, estado_facturacion, sector, total, clientes(nombre)"
    )
    .eq("id", id)
    .single();

  if (guiaErr || !guia) {
    if (guiaErr) logSupabaseError("Supabase error guia:", guiaErr);
    return notFound();
  }

  const { data: itemsData, error: itemsErr } = await supabase
    .from("guia_items")
    .select("id, producto_id, cantidad_m3, precio_m3, subtotal")
    .eq("guia_id", id)
    .order("id", { ascending: true });

  if (itemsErr) {
    logSupabaseError("Supabase error items:", itemsErr);
  }

  const items = (itemsData ?? []) as GuiaItem[];

  const productoIds = Array.from(new Set(items.map((x) => x.producto_id))).filter(Boolean);
  let productosMap = new Map<string, string>();

  if (productoIds.length > 0) {
    const { data: prodsData, error: prodsErr } = await supabase
      .from("productos")
      .select("id, nombre")
      .in("id", productoIds);

    if (prodsErr) {
      logSupabaseError("Supabase error productos:", prodsErr);
    } else {
      const prods = (prodsData ?? []) as Producto[];
      productosMap = new Map(prods.map((p) => [p.id, p.nombre]));
    }
  }

  const g = guia as Guia;

  const totalCalc = items.reduce((acc, it) => acc + Number(it.subtotal ?? 0), 0);
  const totalShow = (g.total ?? 0) > 0 ? Number(g.total) : totalCalc;

  return (
    <div style={{ padding: "2rem" }}>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <Link href="/guias" className="underline">
          ← Volver
        </Link>
        <Link href={`/guias/${g.id}/print`} target="_blank" className="underline">
          🖨️ Imprimir Ticket
        </Link>
      </div>

      <div style={{ border: "1px solid #000", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
          Guía N° {g.numero ?? "-"}
        </h1>

        <p>
          <strong>Fecha:</strong> {g.fecha ?? "-"}
        </p>
        <p>
          <strong>Cliente:</strong> {g.clientes?.nombre ?? "-"}
        </p>
        <p>
          <strong>Faena:</strong> {g.faena ?? "-"}
        </p>

        <p>
          <strong>Tipo operación:</strong> {g.tipo_operacion ?? "-"} &nbsp; | &nbsp;
          <strong>Sector:</strong> {g.sector ?? "-"} &nbsp; | &nbsp;
          <strong>Facturación:</strong> {g.estado_facturacion ?? "-"}
        </p>

        <hr style={{ margin: "1rem 0" }} />

        <h2 style={{ fontWeight: 700 }}>Detalle</h2>

        {items.length === 0 ? (
          <p>No hay productos asociados.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #000", padding: "0.5rem" }}>
                  Producto
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #000", padding: "0.5rem" }}>
                  Cant. (m³)
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #000", padding: "0.5rem" }}>
                  Precio/m³
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #000", padding: "0.5rem" }}>
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const nombre = productosMap.get(it.producto_id) ?? "(producto no encontrado)";
                return (
                  <tr key={it.id}>
                    <td style={{ padding: "0.5rem", borderBottom: "1px solid #ddd" }}>{nombre}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", borderBottom: "1px solid #ddd" }}>
                      {Number(it.cantidad_m3).toFixed(2).replace(".", ",")}
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right", borderBottom: "1px solid #ddd" }}>
                      ${Math.round(Number(it.precio_m3 ?? 0)).toLocaleString("es-CL")}
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right", borderBottom: "1px solid #ddd" }}>
                      ${Math.round(Number(it.subtotal ?? 0)).toLocaleString("es-CL")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "1rem", textAlign: "right", fontWeight: 700, fontSize: "1.25rem" }}>
          Total: ${Math.round(totalShow).toLocaleString("es-CL")}
        </div>

        <hr style={{ margin: "1rem 0" }} />

        <p>
          <strong>Chofer:</strong> {g.chofer ?? "-"}
        </p>
        <p>
          <strong>Patente:</strong> {g.patente ?? "-"}
        </p>

        <hr style={{ margin: "1rem 0" }} />

        <p>
          <strong>Medio de Pago:</strong> {medioPagoLabel(g.medio_pago)}
        </p>

        <hr style={{ margin: "2rem 0" }} />
        <p>
          <strong>Firma Recepción:</strong>
        </p>
        <div style={{ height: "80px" }} />

        <hr style={{ margin: "2rem 0" }} />
        <p>Copia 1: Cliente / Copia 2: Planta / Copia 3: Control Interno</p>

        <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", opacity: 0.8 }}>ID: {g.id}</p>
      </div>
    </div>
  );
}