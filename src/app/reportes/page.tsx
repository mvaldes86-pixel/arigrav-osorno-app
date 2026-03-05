import Link from "next/link";
import { supabase } from "@/lib/supabase";

type MedioPago = "BANCO_CHILE" | "BANCO_ESTADO" | "EFECTIVO" | "CREDITO" | string;
type EstadoFact = "PENDIENTE" | "PAGADO" | "FACTURADO" | string;

type Guia = {
  id: string;
  fecha: string | null;
  cliente_id: string | null;
  medio_pago: MedioPago | null;
  estado_facturacion: EstadoFact | null;
  tipo_operacion: string | null;
  sector: string | null;
  clientes?: { nombre: string } | null;
};

type GuiaItem = {
  id: string;
  guia_id: string;
  producto_id: string;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

type Producto = {
  id: string;
  nombre: string;
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}

function numCL(n: number) {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function medioPagoLabel(v: string | null) {
  if (!v) return "-";
  if (v === "BANCO_CHILE") return "Banco de Chile";
  if (v === "BANCO_ESTADO") return "Banco Estado";
  if (v === "EFECTIVO") return "Efectivo";
  if (v === "CREDITO") return "Crédito";
  return v;
}

function isFacturado(estado: string | null) {
  return estado === "PAGADO" || estado === "FACTURADO";
}

function isPendiente(estado: string | null) {
  return !isFacturado(estado);
}

function buildUrl(path: string, params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) sp.set(k, String(v));
  });
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    desde?: string;
    hasta?: string;
    quick?: string;
    soloPendientes?: string;
  }>;
}) {
  const sp = await searchParams;

  const tab = sp.tab === "facturacion" ? "facturacion" : "dashboard";

  const today = new Date();
  const todayISO = toISODate(today);

  // rango
  let desde = sp.desde || todayISO;
  let hasta = sp.hasta || todayISO;

  // filtro: solo pendientes (para Facturación)
  const soloPendientes = sp.soloPendientes === "1";

  // quick shortcuts
  if (sp.quick === "hoy") {
    desde = todayISO;
    hasta = todayISO;
  }
  if (sp.quick === "ayer") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const iso = toISODate(d);
    desde = iso;
    hasta = iso;
  }
  if (sp.quick === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    desde = toISODate(d);
    hasta = todayISO;
  }
  if (sp.quick === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    desde = toISODate(d);
    hasta = todayISO;
  }

  // Traer guías del rango
  const { data: guiasData, error: guiasErr } = await supabase
    .from("guias")
    .select("id, fecha, cliente_id, medio_pago, estado_facturacion, tipo_operacion, sector, clientes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  const guias = (guiasData ?? []) as Guia[];

  // Traer items de esas guías
  const guiaIds = guias.map((g) => g.id);
  let items: GuiaItem[] = [];
  let productosMap = new Map<string, string>();

  if (!guiasErr && guiaIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("guia_items")
      .select("id, guia_id, producto_id, cantidad_m3, precio_m3")
      .in("guia_id", guiaIds);

    items = (itemsData ?? []) as GuiaItem[];

    const productoIds = Array.from(new Set(items.map((x) => x.producto_id))).filter(Boolean);
    if (productoIds.length > 0) {
      const { data: prodsData } = await supabase.from("productos").select("id, nombre").in("id", productoIds);
      const prods = (prodsData ?? []) as Producto[];
      productosMap = new Map(prods.map((p) => [p.id, p.nombre]));
    }
  }

  // Helpers de totales
  const guiaIdToItems = new Map<string, GuiaItem[]>();
  for (const it of items) {
    const arr = guiaIdToItems.get(it.guia_id) ?? [];
    arr.push(it);
    guiaIdToItems.set(it.guia_id, arr);
  }

  const guiaTotalCLP = (g: Guia) => {
    const its = guiaIdToItems.get(g.id) ?? [];
    let total = 0;
    for (const it of its) {
      const m3 = Number(it.cantidad_m3 ?? 0);
      const p = Number(it.precio_m3 ?? 0);
      total += m3 * p;
    }
    return total;
  };

  // =========================
  // DASHBOARD
  // =========================
  const totalM3 = items.reduce((acc, it) => acc + Number(it.cantidad_m3 ?? 0), 0);
  const totalGuias = guias.length;
  const clientesDistintos = new Set(guias.map((g) => g.clientes?.nombre ?? "").filter(Boolean)).size;
  const promedioM3 = totalGuias > 0 ? totalM3 / totalGuias : 0;

  // Top productos por m3
  const prodAgg = new Map<string, number>();
  for (const it of items) {
    const key = it.producto_id;
    const cur = prodAgg.get(key) ?? 0;
    prodAgg.set(key, cur + Number(it.cantidad_m3 ?? 0));
  }
  const topProductos = Array.from(prodAgg.entries())
    .map(([producto_id, m3]) => ({
      producto: productosMap.get(producto_id) ?? "(producto)",
      m3,
    }))
    .sort((a, b) => b.m3 - a.m3)
    .slice(0, 5);

  // Top clientes por m3
  const clienteAgg = new Map<string, number>();
  for (const g of guias) {
    const nombre = g.clientes?.nombre ?? "(sin cliente)";
    const its = guiaIdToItems.get(g.id) ?? [];
    const m3 = its.reduce((acc, it) => acc + Number(it.cantidad_m3 ?? 0), 0);
    clienteAgg.set(nombre, (clienteAgg.get(nombre) ?? 0) + m3);
  }
  const topClientes = Array.from(clienteAgg.entries())
    .map(([cliente, m3]) => ({ cliente, m3 }))
    .sort((a, b) => b.m3 - a.m3)
    .slice(0, 5);

  // Medio de pago (conteo guías)
  const mpCount = new Map<string, number>();
  for (const g of guias) {
    const k = medioPagoLabel(g.medio_pago);
    mpCount.set(k, (mpCount.get(k) ?? 0) + 1);
  }
  const medioPagoCountRows = Array.from(mpCount.entries())
    .map(([medio, guias]) => ({ medio, guias }))
    .sort((a, b) => b.guias - a.guias);

  // =========================
  // FACTURACIÓN
  // =========================
  type ClienteRow = {
    cliente: string;
    facturado: number;
    pendiente: number;
    estado: "OK" | "Pendiente";
  };

  const clienteMoney = new Map<string, { facturado: number; pendiente: number }>();

  for (const g of guias) {
    const cliente = g.clientes?.nombre ?? "(sin cliente)";
    const total = guiaTotalCLP(g);
    const bucket = clienteMoney.get(cliente) ?? { facturado: 0, pendiente: 0 };

    if (isFacturado(g.estado_facturacion)) bucket.facturado += total;
    else bucket.pendiente += total;

    clienteMoney.set(cliente, bucket);
  }

  const clientesFactRowsAll: ClienteRow[] = Array.from(clienteMoney.entries())
    .map(([cliente, v]) => ({
      cliente,
      facturado: v.facturado,
      pendiente: v.pendiente,
      estado: v.pendiente > 0 ? "Pendiente" : "OK",
    }))
    .sort((a, b) => b.pendiente - a.pendiente || b.facturado - a.facturado);

  const topDeuda = clientesFactRowsAll
    .filter((r) => r.pendiente > 0)
    .sort((a, b) => b.pendiente - a.pendiente)
    .slice(0, 5);

  const clientesFactRows = soloPendientes ? clientesFactRowsAll.filter((r) => r.pendiente > 0) : clientesFactRowsAll;

  const totalFacturado = clientesFactRowsAll.reduce((acc, r) => acc + r.facturado, 0);
  const totalPendiente = clientesFactRowsAll.reduce((acc, r) => acc + r.pendiente, 0);

  const guiasCredito = guias.filter((g) => g.medio_pago === "CREDITO").length;
  const guiasPorCobrar = guias.filter((g) => isPendiente(g.estado_facturacion)).length;

  // Medios de pago (guías y $ total)
  const mpMoney = new Map<string, { guias: number; total: number; pendientes: number }>();
  for (const g of guias) {
    const k = medioPagoLabel(g.medio_pago);
    const total = guiaTotalCLP(g);
    const cur = mpMoney.get(k) ?? { guias: 0, total: 0, pendientes: 0 };
    cur.guias += 1;
    cur.total += total;
    if (isPendiente(g.estado_facturacion)) cur.pendientes += 1;
    mpMoney.set(k, cur);
  }
  const medioPagoMoneyRows = Array.from(mpMoney.entries())
    .map(([medio, v]) => ({ medio, guias: v.guias, total: v.total, pendientes: v.pendientes }))
    .sort((a, b) => b.total - a.total);

  // URLs helpers
  const urlDashboard = buildUrl("/reportes", { tab: "dashboard", desde, hasta });
  const urlFacturacion = buildUrl("/reportes", { tab: "facturacion", desde, hasta, soloPendientes: soloPendientes ? "1" : undefined });
  const urlFactSoloPend = buildUrl("/reportes", { tab: "facturacion", desde, hasta, soloPendientes: soloPendientes ? undefined : "1" });

  const quickUrl = (q: string) =>
    buildUrl("/reportes", {
      tab,
      quick: q,
      soloPendientes: tab === "facturacion" ? (soloPendientes ? "1" : undefined) : undefined,
    });

  // Link a /guias filtrado por cliente + rango (no rompe nada si tu /guias ignora params)
  const guiasClienteUrl = (cliente: string) =>
    buildUrl("/guias", {
      desde,
      hasta,
      cliente, // opción A
      cliente_like: cliente, // opción B
    });

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="pageTitle">Reportes</div>
          <div className="muted">
            Mostrando desde <b>{desde}</b> hasta <b>{hasta}</b>
          </div>
        </div>

        <Link className="btn" href="/guias">
          ← Volver a Guías
        </Link>
      </div>

      <div className="spacer" />

      <div className="card">
        <div className="toolbar">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Rango</div>

          <div className="row">
            <div>
              <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>
                Desde
              </div>

              <form action="/reportes" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="tab" value={tab} />
                {tab === "facturacion" && <input type="hidden" name="soloPendientes" value={soloPendientes ? "1" : ""} />}
                <input className="input" type="date" name="desde" defaultValue={desde} />
                <div className="muted" style={{ fontWeight: 700 }}>
                  Hasta
                </div>
                <input className="input" type="date" name="hasta" defaultValue={hasta} />
                <button className="btn btnPrimary" type="submit">
                  Aplicar
                </button>
              </form>
            </div>

            <div style={{ marginLeft: "auto" }} className="row">
              <Link className="btn" href={quickUrl("hoy")}>
                Hoy
              </Link>
              <Link className="btn" href={quickUrl("ayer")}>
                Ayer
              </Link>
              <Link className="btn" href={quickUrl("7d")}>
                Últimos 7 días
              </Link>
              <Link className="btn" href={quickUrl("30d")}>
                Últimos 30 días
              </Link>
            </div>
          </div>

          <div className="spacer" />

          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div className="row">
              <Link className={`btn ${tab === "dashboard" ? "btnPrimary" : ""}`} href={urlDashboard}>
                Dashboard
              </Link>
              <Link className={`btn ${tab === "facturacion" ? "btnPrimary" : ""}`} href={urlFacturacion}>
                Facturación
              </Link>

              {tab === "facturacion" && (
                <Link className={`btn ${soloPendientes ? "btnPrimary" : ""}`} href={urlFactSoloPend}>
                  {soloPendientes ? "Mostrando: Solo pendientes" : "Filtrar: Solo pendientes"}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          {tab === "dashboard" ? (
            <>
              <div className="row" style={{ gap: 14 }}>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Total m³
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900 }}>{numCL(totalM3)}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Guías
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900 }}>{totalGuias}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Clientes atendidos
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900 }}>{clientesDistintos}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Promedio m³ / guía
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900 }}>{numCL(promedioM3)}</div>
                </div>
              </div>

              <div className="spacer" />

              <div className="row" style={{ alignItems: "stretch", gap: 14 }}>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Top 5 productos por m³</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: "right" }}>m³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductos.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.producto}</td>
                          <td style={{ textAlign: "right" }}>{numCL(r.m3)}</td>
                        </tr>
                      ))}
                      {topProductos.length === 0 && (
                        <tr>
                          <td className="muted" colSpan={2}>
                            Sin datos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Top 5 clientes por m³</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th style={{ textAlign: "right" }}>m³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClientes.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.cliente}</td>
                          <td style={{ textAlign: "right" }}>{numCL(r.m3)}</td>
                        </tr>
                      ))}
                      {topClientes.length === 0 && (
                        <tr>
                          <td className="muted" colSpan={2}>
                            Sin datos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Medio de pago (cantidad de guías)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Medio</th>
                        <th style={{ textAlign: "right" }}>Guías</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medioPagoCountRows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.medio}</td>
                          <td style={{ textAlign: "right" }}>{r.guias}</td>
                        </tr>
                      ))}
                      {medioPagoCountRows.length === 0 && (
                        <tr>
                          <td className="muted" colSpan={2}>
                            Sin datos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 42, fontWeight: 900, marginBottom: 6 }}>Reporte de Facturación</div>
              <div className="muted" style={{ marginBottom: 16 }}>
                Resumen por cliente: facturado vs pendiente (sin planillas extra)
              </div>

              <div className="row" style={{ gap: 14 }}>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Total facturado (rango)
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>{clp(totalFacturado)}</div>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Total pendiente
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>{clp(totalPendiente)}</div>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Guías en crédito
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>{guiasCredito}</div>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div className="muted" style={{ fontWeight: 800 }}>
                    Guías por cobrar (pendientes)
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>{guiasPorCobrar}</div>
                </div>
              </div>

              <div className="spacer" />

              <div className="row" style={{ alignItems: "stretch", gap: 14 }}>
                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Top 5 deuda (clientes con más pendiente)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th style={{ textAlign: "right" }}>Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDeuda.map((r) => (
                        <tr key={r.cliente}>
                          <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                          <td style={{ textAlign: "right", fontWeight: 900 }}>{clp(r.pendiente)}</td>
                        </tr>
                      ))}
                      {topDeuda.length === 0 && (
                        <tr>
                          <td className="muted" colSpan={2}>
                            No hay deuda en el rango
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="card" style={{ flex: 1, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Medios de pago (guías y $)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Medio</th>
                        <th style={{ textAlign: "right" }}>Guías</th>
                        <th style={{ textAlign: "right" }}>$ total</th>
                        <th style={{ textAlign: "right" }}>Pendientes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medioPagoMoneyRows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.medio}</td>
                          <td style={{ textAlign: "right" }}>{r.guias}</td>
                          <td style={{ textAlign: "right" }}>{clp(r.total)}</td>
                          <td style={{ textAlign: "right" }}>{r.pendientes}</td>
                        </tr>
                      ))}
                      {medioPagoMoneyRows.length === 0 && (
                        <tr>
                          <td className="muted" colSpan={4}>
                            Sin datos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="spacer" />

              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Resumen por cliente</div>
                <div className="muted" style={{ marginBottom: 12 }}>
                  Calculado como suma de (m³ * precio por m³) de los items de cada guía.
                  {soloPendientes ? " (Filtro activo: solo clientes con pendiente > 0)" : ""}
                </div>

                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th style={{ textAlign: "right" }}>Facturado</th>
                      <th style={{ textAlign: "right" }}>Pendiente</th>
                      <th>Estado</th>
                      <th style={{ width: 160 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFactRows.map((r) => (
                      <tr key={r.cliente}>
                        <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                        <td style={{ textAlign: "right" }}>{clp(r.facturado)}</td>
                        <td style={{ textAlign: "right" }}>{clp(r.pendiente)}</td>
                        <td style={{ fontWeight: 900 }}>{r.estado}</td>
                        <td>
                          <Link className="btn btnGhost" href={guiasClienteUrl(r.cliente)}>
                            Ver guías
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {clientesFactRows.length === 0 && (
                      <tr>
                        <td className="muted" colSpan={5}>
                          Sin datos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="muted" style={{ marginTop: 10 }}>
                  Este botón abre la lista de guías filtrada por cliente + rango (ideal para revisar y cobrar).
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}