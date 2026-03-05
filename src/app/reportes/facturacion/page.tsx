import Link from "next/link";
import { supabase } from "@/lib/supabase";

type GuiaRow = {
  id: string;
  fecha: string | null;
  cliente_id: string | null;
  medio_pago: string | null; // incluye CREDITO
  estado_facturacion: string | null; // FACTURADO | PENDIENTE (o null)
  clientes?: { nombre: string } | null;
};

type ItemRow = {
  guia_id: string;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateParam(v: string | string[] | undefined) {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  // esperamos YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function moneyCLP(n: number) {
  // sin decimales, formato CLP
  return n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}

function isFacturado(v: string | null) {
  return (v ?? "").toUpperCase() === "FACTURADO";
}

export default async function ReporteFacturacionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Rango por querystring: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
  const hoy = new Date();
  const defaultDesde = ymd(hoy);
  const defaultHasta = ymd(hoy);

  const desde = parseDateParam(sp.desde) ?? defaultDesde;
  const hasta = parseDateParam(sp.hasta) ?? defaultHasta;

  // 1) Traer guías del rango (incluye nombre cliente)
  const { data: guiasData, error: guiasErr } = await supabase
    .from("guias")
    .select("id, fecha, cliente_id, medio_pago, estado_facturacion, clientes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (guiasErr) {
    return (
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="pageTitle">Reporte de Facturación</h1>
            <div className="muted">Mostrando desde {desde} hasta {hasta}</div>
          </div>
          <Link href="/guias" className="btn btnGhost">
            ← Volver a Guías
          </Link>
        </div>

        <div className="spacer" />
        <div className="card section">
          <h2 style={{ marginTop: 0 }}>Error</h2>
          <div className="muted">
            No se pudo leer la tabla <b>guias</b>.
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            message: {(guiasErr as any)?.message ?? "-"} / code: {(guiasErr as any)?.code ?? "-"}
          </div>
        </div>
      </div>
    );
  }

  const guias = (guiasData ?? []) as unknown as GuiaRow[];
  const guiaIds = guias.map((g) => g.id);

  // 2) Traer items para calcular $ (cantidad_m3 * precio_m3)
  //    OJO: esto asume que guia_items tiene columnas: guia_id, cantidad_m3, precio_m3
  let items: ItemRow[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: itemsErr } = await supabase
      .from("guia_items")
      .select("guia_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    if (!itemsErr) {
      items = (itemsData ?? []) as ItemRow[];
    }
  }

  // 3) Total por guía
  const totalPorGuia = new Map<string, number>();
  for (const it of items) {
    const gid = it.guia_id;
    const m3 = Number(it.cantidad_m3 ?? 0);
    const precio = Number(it.precio_m3 ?? 0);
    const subtotal = m3 * precio;

    totalPorGuia.set(gid, (totalPorGuia.get(gid) ?? 0) + subtotal);
  }

  // 4) KPIs
  const totalFacturado = guias.reduce((acc, g) => {
    const t = totalPorGuia.get(g.id) ?? 0;
    return isFacturado(g.estado_facturacion) ? acc + t : acc;
  }, 0);

  const totalPendiente = guias.reduce((acc, g) => {
    const t = totalPorGuia.get(g.id) ?? 0;
    return isFacturado(g.estado_facturacion) ? acc : acc + t;
  }, 0);

  const guiasCredito = guias.filter((g) => (g.medio_pago ?? "").toUpperCase() === "CREDITO").length;

  // 5) Resumen por cliente
  type RowCliente = {
    cliente: string;
    facturado: number;
    pendiente: number;
    estado: "OK" | "Pendiente";
  };

  const mapCliente = new Map<string, RowCliente>();

  for (const g of guias) {
    const nombre = g.clientes?.nombre ?? "(Sin cliente)";
    const key = nombre;
    const row = mapCliente.get(key) ?? {
      cliente: nombre,
      facturado: 0,
      pendiente: 0,
      estado: "OK",
    };

    const total = totalPorGuia.get(g.id) ?? 0;

    if (isFacturado(g.estado_facturacion)) row.facturado += total;
    else row.pendiente += total;

    row.estado = row.pendiente > 0 ? "Pendiente" : "OK";
    mapCliente.set(key, row);
  }

  const filasClientes = Array.from(mapCliente.values()).sort((a, b) => {
    // primero pendientes altos, luego facturado
    if (b.pendiente !== a.pendiente) return b.pendiente - a.pendiente;
    return b.facturado - a.facturado;
  });

  // UI
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="pageTitle">Reporte de Facturación</h1>
          <div className="muted">
            Resumen por cliente: <b>facturado vs pendiente</b> (sin planillas extra)
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Mostrando desde <b>{desde}</b> hasta <b>{hasta}</b>
          </div>
        </div>

        <Link href="/guias" className="btn btnGhost">
          ← Volver a Guías
        </Link>
      </div>

      <div className="spacer" />

      {/* KPIs */}
      <div className="row">
        <div className="card section" style={{ flex: "1 1 240px" }}>
          <div className="muted">Total facturado (rango)</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>${moneyCLP(totalFacturado)}</div>
        </div>

        <div className="card section" style={{ flex: "1 1 240px" }}>
          <div className="muted">Total pendiente</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>${moneyCLP(totalPendiente)}</div>
        </div>

        <div className="card section" style={{ flex: "1 1 240px" }}>
          <div className="muted">Guías en crédito / por cobrar</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{guiasCredito}</div>
        </div>
      </div>

      <div className="spacer" />

      {/* Tabla por cliente */}
      <div className="card">
        <div className="toolbar">
          <div style={{ fontWeight: 900, fontSize: 18 }}>Resumen por cliente</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Calculado como suma de (m³ * precio por m³) en los items de cada guía.
          </div>
        </div>

        <div className="section">
          {filasClientes.length === 0 ? (
            <div className="muted">No hay guías en este rango.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: "right" }}>Facturado</th>
                  <th style={{ textAlign: "right" }}>Pendiente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasClientes.map((r) => (
                  <tr key={r.cliente}>
                    <td style={{ fontWeight: 800 }}>{r.cliente}</td>
                    <td style={{ textAlign: "right" }}>${moneyCLP(r.facturado)}</td>
                    <td style={{ textAlign: "right" }}>${moneyCLP(r.pendiente)}</td>
                    <td style={{ fontWeight: 800 }}>{r.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="spacer" />

          <div className="muted">
            Siguiente paso (cuando quieras): exportar CSV y botón “Marcar como facturado” directo desde esta tabla.
          </div>
        </div>
      </div>
    </div>
  );
}