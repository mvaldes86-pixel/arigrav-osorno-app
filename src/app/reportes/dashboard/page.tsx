import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Guia = {
  id: string;
  fecha: string | null;
  cliente_id: string | null;
  medio_pago: string | null;
  clientes?: { nombre: string } | null;
};

type Item = {
  id: string;
  guia_id: string;
  producto_id: string;
  cantidad_m3: number;
};

type Producto = { id: string; nombre: string };

function fmtCL(n: number) {
  return n.toFixed(2).replace(".", ",");
}

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ReporteDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const hoy = new Date();
  const desde = sp.desde ?? yyyyMmDd(hoy);
  const hasta = sp.hasta ?? yyyyMmDd(hoy);

  // Guías del rango
  const { data: guias, error: gErr } = await supabase
    .from("guias")
    .select("id, fecha, cliente_id, medio_pago, clientes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (gErr) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Dashboard Operativo</h2>
        <div className="muted">Error consultando guías: {gErr.message}</div>
      </div>
    );
  }

  const guiaList = (guias ?? []) as Guia[];
  const guiaIds = guiaList.map((g) => g.id);

  // Items del rango (por IN)
  let items: Item[] = [];
  if (guiaIds.length > 0) {
    const { data: itemsData, error: iErr } = await supabase
      .from("guia_items")
      .select("id, guia_id, producto_id, cantidad_m3")
      .in("guia_id", guiaIds);

    if (!iErr) items = (itemsData ?? []) as Item[];
  }

  const totalM3 = items.reduce((acc, it) => acc + Number(it.cantidad_m3 || 0), 0);
  const totalGuias = guiaList.length;
  const clientesDistintos = new Set(guiaList.map((g) => g.cliente_id).filter(Boolean)).size;
  const promM3 = totalGuias > 0 ? totalM3 / totalGuias : 0;

  // Top productos por m3
  const byProd = new Map<string, number>();
  for (const it of items) byProd.set(it.producto_id, (byProd.get(it.producto_id) ?? 0) + Number(it.cantidad_m3 || 0));
  const topProdIds = [...byProd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);

  let prodMap = new Map<string, string>();
  if (topProdIds.length > 0) {
    const { data: prods } = await supabase.from("productos").select("id, nombre").in("id", topProdIds);
    const list = (prods ?? []) as Producto[];
    prodMap = new Map(list.map((p) => [p.id, p.nombre]));
  }

  const topProductos = [...byProd.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, m3]) => ({ nombre: prodMap.get(id) ?? "Producto", m3 }));

  // Top clientes por m3 (sumando items de sus guías)
  const guiaToCliente = new Map<string, string>();
  for (const g of guiaList) if (g.id && g.clientes?.nombre) guiaToCliente.set(g.id, g.clientes.nombre);

  const byCliente = new Map<string, number>();
  for (const it of items) {
    const cli = guiaToCliente.get(it.guia_id) ?? "Sin cliente";
    byCliente.set(cli, (byCliente.get(cli) ?? 0) + Number(it.cantidad_m3 || 0));
  }
  const topClientes = [...byCliente.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, m3]) => ({ nombre, m3 }));

  // Medio de pago (cantidad de guías)
  const byPago = new Map<string, number>();
  for (const g of guiaList) {
    const k = g.medio_pago ?? "SIN";
    byPago.set(k, (byPago.get(k) ?? 0) + 1);
  }

  const pagoLabel = (v: string) => {
    if (v === "BANCO_CHILE") return "Banco de Chile";
    if (v === "BANCO_ESTADO") return "Banco Estado";
    if (v === "EFECTIVO") return "Efectivo";
    if (v === "CREDITO") return "Crédito";
    if (v === "SIN") return "—";
    return v;
  };

  return (
    <div>
      <div className="muted" style={{ marginTop: -6 }}>
        Mostrando desde <b>{desde}</b> hasta <b>{hasta}</b>
      </div>

      <div className="spacer" />

      <form className="card" style={{ padding: 14, marginBottom: 14 }} action="/reportes/dashboard" method="get">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Rango</div>

        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="muted" style={{ fontWeight: 700 }}>Desde</div>
            <input className="input" type="date" name="desde" defaultValue={desde} />
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700 }}>Hasta</div>
            <input className="input" type="date" name="hasta" defaultValue={hasta} />
          </div>
          <button className="btn btnPrimary" type="submit">Aplicar</button>

          <div style={{ flex: 1 }} />

          <Link className="btn" href={`/reportes/dashboard?desde=${yyyyMmDd(hoy)}&hasta=${yyyyMmDd(hoy)}`}>Hoy</Link>
          <Link
            className="btn"
            href={`/reportes/dashboard?desde=${yyyyMmDd(new Date(hoy.getTime() - 86400000))}&hasta=${yyyyMmDd(new Date(hoy.getTime() - 86400000))}`}
          >
            Ayer
          </Link>
          <Link className="btn" href={`/reportes/dashboard?desde=${yyyyMmDd(new Date(hoy.getTime() - 6 * 86400000))}&hasta=${yyyyMmDd(hoy)}`}>
            Últimos 7 días
          </Link>
          <Link className="btn" href={`/reportes/dashboard?desde=${yyyyMmDd(new Date(hoy.getTime() - 29 * 86400000))}&hasta=${yyyyMmDd(hoy)}`}>
            Últimos 30 días
          </Link>
        </div>
      </form>

      <div className="grid4">
        <div className="kpi card">
          <div className="kpiLabel">Total m³</div>
          <div className="kpiValue">{fmtCL(totalM3)}</div>
        </div>
        <div className="kpi card">
          <div className="kpiLabel">Guías</div>
          <div className="kpiValue">{totalGuias}</div>
        </div>
        <div className="kpi card">
          <div className="kpiLabel">Clientes atendidos</div>
          <div className="kpiValue">{clientesDistintos}</div>
        </div>
        <div className="kpi card">
          <div className="kpiLabel">Promedio m³ / guía</div>
          <div className="kpiValue">{fmtCL(promM3)}</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="grid3">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Top 5 productos por m³</div>
          <table className="table">
            <thead>
              <tr><th>Producto</th><th style={{ textAlign: "right" }}>m³</th></tr>
            </thead>
            <tbody>
              {topProductos.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.nombre}</td>
                  <td style={{ textAlign: "right" }}>{fmtCL(r.m3)}</td>
                </tr>
              ))}
              {topProductos.length === 0 && (
                <tr><td colSpan={2} className="muted">Sin datos en el rango</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Top 5 clientes por m³</div>
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th style={{ textAlign: "right" }}>m³</th></tr>
            </thead>
            <tbody>
              {topClientes.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.nombre}</td>
                  <td style={{ textAlign: "right" }}>{fmtCL(r.m3)}</td>
                </tr>
              ))}
              {topClientes.length === 0 && (
                <tr><td colSpan={2} className="muted">Sin datos en el rango</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Medio de pago (cantidad de guías)</div>
          <table className="table">
            <thead>
              <tr><th>Medio</th><th style={{ textAlign: "right" }}>Guías</th></tr>
            </thead>
            <tbody>
              {[...byPago.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}>
                  <td>{pagoLabel(k)}</td>
                  <td style={{ textAlign: "right" }}>{v}</td>
                </tr>
              ))}
              {byPago.size === 0 && (
                <tr><td colSpan={2} className="muted">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="spacer" />

      <div className="row">
        <Link className="btn" href="/guias">Ver guías</Link>
        <Link className="btn btnPrimary" href="/guias/nueva">+ Nueva guía</Link>
        <Link className="btn" href="/reportes/facturacion">Ir a Facturación</Link>
      </div>
    </div>
  );
}