import { supabase } from "@/lib/supabase";

type Guia = {
  id: string;
  fecha: string | null;
  medio_pago: string | null;
  estado_facturacion: string | null;
  clientes?: { nombre: string } | null;
};

type Item = {
  id: string;
  guia_id: string;
  cantidad_m3: number;
  precio_m3: number | null;
};

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoneyCLP(n: number) {
  const rounded = Math.round(n);
  return "$ " + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default async function ReporteFacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const hoy = new Date();
  const desde = sp.desde ?? yyyyMmDd(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hasta = sp.hasta ?? yyyyMmDd(hoy);

  // 1) Guías con cliente + estado + medio_pago
  const { data: guiasData, error: gErr } = await supabase
    .from("guias")
    .select("id, fecha, medio_pago, estado_facturacion, clientes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (gErr) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Reporte de Facturación</h2>
        <div className="muted">Error consultando guías: {gErr.message}</div>
      </div>
    );
  }

  const guias = (guiasData ?? []) as Guia[];
  const guiaIds = guias.map((g) => g.id);

  // 2) Items con precio (para calcular montos)
  let items: Item[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: iErr } = await supabase
      .from("guia_items")
      .select("id, guia_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    if (!iErr) items = (itemsData ?? []) as Item[];
  }

  // 3) Total por guía = sum(cantidad_m3 * precio_m3)
  const totalPorGuia = new Map<string, number>();
  for (const it of items) {
    const precio = Number(it.precio_m3 ?? 0);
    const cant = Number(it.cantidad_m3 ?? 0);
    totalPorGuia.set(it.guia_id, (totalPorGuia.get(it.guia_id) ?? 0) + cant * precio);
  }

  // 4) Agrupar por cliente (equivalente a “Clientes Febrero 2026”)
  type Row = { cliente: string; facturado: number; pendiente: number; creditoGuias: number };
  const byCliente = new Map<string, Row>();

  let totalFacturado = 0;
  let totalPendiente = 0;
  let guiasCredito = 0;

  for (const g of guias) {
    const cli = g.clientes?.nombre ?? "SIN CLIENTE";
    const estado = (g.estado_facturacion ?? "PENDIENTE").toUpperCase();
    const pago = (g.medio_pago ?? "").toUpperCase();
    const total = totalPorGuia.get(g.id) ?? 0;

    if (!byCliente.has(cli)) byCliente.set(cli, { cliente: cli, facturado: 0, pendiente: 0, creditoGuias: 0 });
    const row = byCliente.get(cli)!;

    if (pago === "CREDITO") {
      row.creditoGuias += 1;
      guiasCredito += 1;
    }

    if (estado === "FACTURADO") {
      row.facturado += total;
      totalFacturado += total;
    } else {
      row.pendiente += total;
      totalPendiente += total;
    }
  }

  const rows = [...byCliente.values()].sort((a, b) => (b.facturado + b.pendiente) - (a.facturado + a.pendiente));

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Reporte de Facturación</h2>
          <div className="muted">
            Resumen por cliente: facturado vs pendiente (equivalente a tu planilla “Clientes Febrero 2026”)
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Mostrando desde <b>{desde}</b> hasta <b>{hasta}</b>
          </div>
        </div>

        <form action="/reportes/facturacion" method="get" className="row">
          <div>
            <div className="muted" style={{ fontWeight: 700 }}>Desde</div>
            <input className="input" type="date" name="desde" defaultValue={desde} />
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700 }}>Hasta</div>
            <input className="input" type="date" name="hasta" defaultValue={hasta} />
          </div>
          <button className="btn btnPrimary" type="submit">Aplicar</button>
        </form>
      </div>

      <div className="spacer" />

      <div className="grid3">
        <div className="kpi card">
          <div className="kpiLabel">Total facturado (rango)</div>
          <div className="kpiValue">{fmtMoneyCLP(totalFacturado)}</div>
        </div>
        <div className="kpi card">
          <div className="kpiLabel">Total pendiente</div>
          <div className="kpiValue">{fmtMoneyCLP(totalPendiente)}</div>
        </div>
        <div className="kpi card">
          <div className="kpiLabel">Guías en crédito / por cobrar</div>
          <div className="kpiValue">{guiasCredito}</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Resumen por cliente</div>

        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th style={{ textAlign: "right" }}>Facturado</th>
              <th style={{ textAlign: "right" }}>Pendiente</th>
              <th style={{ textAlign: "right" }}>Crédito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cliente}>
                <td style={{ fontWeight: 800 }}>{r.cliente}</td>
                <td style={{ textAlign: "right" }}>{fmtMoneyCLP(r.facturado)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoneyCLP(r.pendiente)}</td>
                <td style={{ textAlign: "right" }}>{r.creditoGuias}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Sin datos en el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="spacer" />

        <div className="row">
          <button className="btn" disabled>
            Exportar CSV (próximo)
          </button>
          <button className="btn" disabled>
            Marcar como facturado (próximo)
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Este reporte se arma 100% desde las guías (sin planillas extra).
        </div>
      </div>
    </div>
  );
}