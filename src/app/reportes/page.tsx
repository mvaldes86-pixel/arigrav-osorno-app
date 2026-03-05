import Link from "next/link";
import { supabase } from "@/lib/supabase";

/**
 * Reportes (6 tabs):
 * 1) Dashboard Operativo
 * 2) Facturación
 * 3) Producción por día
 * 4) Camiones / Choferes
 * 5) Productos
 * 6) Clientes
 *
 * IMPORTANTE:
 * - NO usamos guias.cliente_manual (no existe en tu BD)
 * - trabajamos con cliente_id y join clientes(nombre)
 */

type TabKey =
  | "dashboard"
  | "facturacion"
  | "produccion"
  | "camiones"
  | "productos"
  | "clientes";

type GuiaRow = {
  id: string;
  fecha: string | null; // YYYY-MM-DD
  cliente_id: string | null;
  clientes?: { nombre: string } | null;

  // Para reportes varios
  medio_pago:
    | "BANCO_CHILE"
    | "BANCO_ESTADO"
    | "EFECTIVO"
    | "CREDITO"
    | string
    | null;

  estado_facturacion: "PENDIENTE" | "PAGADO" | string | null;

  // Para camiones/choferes
  chofer: string | null;
  patente: string | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  producto_id: string | null;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

type ProductoRow = {
  id: string;
  nombre: string;
};

/* ======================
   HELPERS
   ====================== */
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatNumber(n: number, decimals = 2) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(decimals).replace(".", ",");
}

function medioPagoLabel(v: string | null) {
  if (!v) return "-";
  const x = String(v).toUpperCase();
  if (x === "BANCO_CHILE") return "Banco de Chile";
  if (x === "BANCO_ESTADO") return "Banco Estado";
  if (x === "EFECTIVO") return "Efectivo";
  if (x === "CREDITO") return "Crédito";
  return v;
}

// Normalización “suave” (sin DB): para que ranking no se duplique por may/min y espacios
function normName(v: string | null) {
  if (!v) return "";
  return v
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normPatente(v: string | null) {
  if (!v) return "";
  return v.trim().replace(/\s+/g, "").toUpperCase();
}

function getClientName(g: GuiaRow) {
  return g.clientes?.nombre ?? "(sin cliente)";
}

/* ======================
   FETCH
   ====================== */
async function fetchGuiasEnRango(desde: string, hasta: string) {
  const { data, error } = await supabase
    .from("guias")
    .select(
      "id, fecha, cliente_id, medio_pago, estado_facturacion, chofer, patente, clientes(nombre)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) throw error;
  return (data ?? []) as GuiaRow[];
}

async function fetchItemsPorGuias(guiaIds: string[]) {
  if (guiaIds.length === 0) return [] as ItemRow[];

  const { data, error } = await supabase
    .from("guia_items")
    .select("id, guia_id, producto_id, cantidad_m3, precio_m3")
    .in("guia_id", guiaIds);

  if (error) throw error;
  return (data ?? []) as ItemRow[];
}

async function fetchProductosMap(productoIds: string[]) {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(productoIds)).filter(Boolean);
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre")
    .in("id", ids);

  if (error) throw error;

  const rows = (data ?? []) as ProductoRow[];
  for (const p of rows) map.set(p.id, p.nombre);
  return map;
}

/* ======================
   UI SHARED
   ====================== */
function Tabs({ tab, desde, hasta }: { tab: TabKey; desde: string; hasta: string }) {
  const mk = (t: TabKey) => `/reportes?tab=${t}&desde=${desde}&hasta=${hasta}`;

  return (
    <div className="reportsTop card">
      <div className="toolbar">
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            Selecciona el tipo de reporte
          </div>
          <div className="muted">Reportes base del Plan Control Operativo</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/guias" className="btn">
            ← Volver a Guías
          </Link>
        </div>
      </div>

      <div className="section">
        <div className="tabs">
          <Link className={`tab ${tab === "dashboard" ? "active" : ""}`} href={mk("dashboard")}>
            Dashboard
          </Link>
          <Link
            className={`tab ${tab === "facturacion" ? "active" : ""}`}
            href={mk("facturacion")}
          >
            Facturación
          </Link>
          <Link
            className={`tab ${tab === "produccion" ? "active" : ""}`}
            href={mk("produccion")}
          >
            Producción
          </Link>
          <Link
            className={`tab ${tab === "camiones" ? "active" : ""}`}
            href={mk("camiones")}
          >
            Camiones / Choferes
          </Link>
          <Link
            className={`tab ${tab === "productos" ? "active" : ""}`}
            href={mk("productos")}
          >
            Productos
          </Link>
          <Link
            className={`tab ${tab === "clientes" ? "active" : ""}`}
            href={mk("clientes")}
          >
            Clientes
          </Link>
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: después agregamos más pestañas sin tocar el diseño (pagos, obras/faenas, etc.)
        </div>
      </div>
    </div>
  );
}

function RangeBox({ tab, desde, hasta }: { tab: TabKey; desde: string; hasta: string }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <div className="muted" style={{ marginBottom: 10 }}>
          Mostrando desde <strong>{desde}</strong> hasta <strong>{hasta}</strong>
        </div>

        <div className="rangeBox">
          <div className="rangeLeft">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Rango</div>

            <form className="row" action="/reportes" method="get">
              <input type="hidden" name="tab" value={tab} />

              <div className="field">
                <div className="fieldLabel">Desde</div>
                <input className="input" type="date" name="desde" defaultValue={desde} />
              </div>

              <div className="field">
                <div className="fieldLabel">Hasta</div>
                <input className="input" type="date" name="hasta" defaultValue={hasta} />
              </div>

              <button className="btn btnPrimary" type="submit">
                Aplicar
              </button>
            </form>
          </div>

          <div className="rangeQuick">
            <Link
              className="btn"
              href={`/reportes?tab=${tab}&desde=${toISODate(new Date())}&hasta=${toISODate(new Date())}`}
            >
              Hoy
            </Link>
            <Link
              className="btn"
              href={`/reportes?tab=${tab}&desde=${addDaysISO(toISODate(new Date()), -1)}&hasta=${addDaysISO(
                toISODate(new Date()),
                -1
              )}`}
            >
              Ayer
            </Link>
            <Link
              className="btn"
              href={`/reportes?tab=${tab}&desde=${addDaysISO(toISODate(new Date()), -6)}&hasta=${toISODate(
                new Date()
              )}`}
            >
              Últimos 7 días
            </Link>
            <Link
              className="btn"
              href={`/reportes?tab=${tab}&desde=${addDaysISO(toISODate(new Date()), -29)}&hasta=${toISODate(
                new Date()
              )}`}
            >
              Últimos 30 días
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpiCard">
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="bar">
      <div className="barFill" style={{ width: `${p}%` }} />
    </div>
  );
}

/* ======================
   TAB 1: DASHBOARD
   ====================== */
function buildDashboard(guias: GuiaRow[], items: ItemRow[], productosMap: Map<string, string>) {
  const guiaIds = new Set(guias.map((g) => g.id));
  const itemsOk = items.filter((it) => guiaIds.has(it.guia_id));

  const totalM3 = itemsOk.reduce((s, it) => s + safeNum(it.cantidad_m3), 0);
  const guiasCount = guias.length;

  const clientesDistintos = new Set(
    guias.map((g) => (g.cliente_id ? `ID:${g.cliente_id}` : `TXT:${getClientName(g)}`))
  ).size;

  const promM3Guia = guiasCount > 0 ? totalM3 / guiasCount : 0;

  // Top productos por m3
  const prodAgg = new Map<string, number>();
  for (const it of itemsOk) {
    const pid = it.producto_id ?? "";
    if (!pid) continue;
    prodAgg.set(pid, (prodAgg.get(pid) ?? 0) + safeNum(it.cantidad_m3));
  }
  const topProductos = Array.from(prodAgg.entries())
    .map(([pid, m3]) => ({ producto: productosMap.get(pid) ?? "(producto)", m3 }))
    .sort((a, b) => b.m3 - a.m3)
    .slice(0, 5);

  // Top clientes por m3
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const cliAgg = new Map<string, number>();
  for (const it of itemsOk) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;
    const key = getClientName(g);
    cliAgg.set(key, (cliAgg.get(key) ?? 0) + safeNum(it.cantidad_m3));
  }
  const topClientes = Array.from(cliAgg.entries())
    .map(([cliente, m3]) => ({ cliente, m3 }))
    .sort((a, b) => b.m3 - a.m3)
    .slice(0, 5);

  // Medio de pago (cantidad de guías)
  const mpAgg = new Map<string, number>();
  for (const g of guias) {
    const k = medioPagoLabel(g.medio_pago ?? null);
    mpAgg.set(k, (mpAgg.get(k) ?? 0) + 1);
  }
  const mediosPago = Array.from(mpAgg.entries())
    .map(([medio, guias]) => ({ medio, guias }))
    .sort((a, b) => b.guias - a.guias);

  return { totalM3, guiasCount, clientesDistintos, promM3Guia, topProductos, topClientes, mediosPago };
}

function DashboardTab({
  desde,
  hasta,
  data,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildDashboard>;
}) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Dashboard Operativo</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Vista general rápida del desempeño (base para el Plan 1)
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total m³" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Guías" value={String(data.guiasCount)} />
          <KPI label="Clientes atendidos" value={String(data.clientesDistintos)} />
          <KPI label="Promedio m³ / guía" value={formatNumber(data.promM3Guia, 2)} />
        </div>

        <div className="spacer" />

        <div className="grid3">
          <div className="cardInner">
            <div className="cardTitle">Top 5 productos por m³</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>m³</th>
                </tr>
              </thead>
              <tbody>
                {data.topProductos.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.topProductos.map((r, i) => (
                    <tr key={i}>
                      <td>{r.producto}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {formatNumber(r.m3, 2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="cardInner">
            <div className="cardTitle">Top 5 clientes por m³</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: "right" }}>m³</th>
                </tr>
              </thead>
              <tbody>
                {data.topClientes.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.topClientes.map((r, i) => (
                    <tr key={i}>
                      <td>{r.cliente}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {formatNumber(r.m3, 2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="cardInner">
            <div className="cardTitle">Medio de pago (cantidad de guías)</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Medio</th>
                  <th style={{ textAlign: "right" }}>Guías</th>
                </tr>
              </thead>
              <tbody>
                {data.mediosPago.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.mediosPago.map((r, i) => (
                    <tr key={i}>
                      <td>{r.medio}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{r.guias}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="spacer" />

        <div className="row">
          <Link className="btn" href={`/guias?desde=${desde}&hasta=${hasta}`}>
            Ver guías
          </Link>
          <Link className="btn btnPrimary" href="/guias/nueva">
            + Nueva guía
          </Link>
          <Link className="btn" href={`/reportes?tab=facturacion&desde=${desde}&hasta=${hasta}`}>
            Ir a Facturación
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ======================
   TAB 2: FACTURACIÓN
   ====================== */
function buildFacturacion(guias: GuiaRow[], items: ItemRow[]) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  type CliAgg = { facturado: number; pendiente: number; estado: string };
  const byCliente = new Map<string, CliAgg>();

  let totalFacturado = 0;
  let totalPendiente = 0;

  // Conteo de guías por medio de pago
  const mpCount = new Map<string, number>();
  for (const g of guias) {
    const k = medioPagoLabel(g.medio_pago ?? null);
    mpCount.set(k, (mpCount.get(k) ?? 0) + 1);
  }

  const guiasCredito = guias.filter((g) => String(g.medio_pago ?? "").toUpperCase() === "CREDITO")
    .length;

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const cliente = getClientName(g);
    const subtotal = safeNum(it.cantidad_m3) * safeNum(it.precio_m3);

    if (!byCliente.has(cliente)) byCliente.set(cliente, { facturado: 0, pendiente: 0, estado: "Pendiente" });
    const agg = byCliente.get(cliente)!;

    const est = String(g.estado_facturacion ?? "").toUpperCase();
    if (est === "PAGADO") {
      agg.facturado += subtotal;
      totalFacturado += subtotal;
    } else {
      agg.pendiente += subtotal;
      totalPendiente += subtotal;
    }

    agg.estado = agg.pendiente > 0 ? "Pendiente" : "OK";
  }

  const tabla = Array.from(byCliente.entries())
    .map(([cliente, v]) => ({ cliente, ...v }))
    .sort((a, b) => b.pendiente - a.pendiente);

  const medios = Array.from(mpCount.entries())
    .map(([medio, guias]) => ({ medio, guias }))
    .sort((a, b) => b.guias - a.guias);

  const getCount = (label: string) => String(medios.find((x) => x.medio === label)?.guias ?? 0);

  return {
    totalFacturado,
    totalPendiente,
    guiasCredito,
    tabla,
    medios,
    bancoChile: getCount("Banco de Chile"),
    bancoEstado: getCount("Banco Estado"),
    efectivo: getCount("Efectivo"),
  };
}

function FacturacionTab({
  desde,
  hasta,
  data,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildFacturacion>;
}) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Reporte de Facturación</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Resumen por cliente: facturado vs pendiente (sin planillas extra)
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Mostrando desde <strong>{desde}</strong> hasta <strong>{hasta}</strong>
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total facturado (rango)" value={formatCLP(data.totalFacturado)} />
          <KPI label="Total pendiente" value={formatCLP(data.totalPendiente)} />
          <KPI label="Guías en crédito / por cobrar" value={String(data.guiasCredito)} />
          <KPI label="Guías Banco Chile" value={data.bancoChile} />
          <KPI label="Guías Banco Estado" value={data.bancoEstado} />
          <KPI label="Guías Efectivo" value={data.efectivo} />
        </div>

        <div className="spacer" />

        <div className="card" style={{ border: "1px solid var(--line)" }}>
          <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 900 }}>Resumen por cliente</div>
            <div className="muted">
              Calculado como suma de (m³ * precio por m³) en los items de cada guía.
            </div>
          </div>

          <div className="section" style={{ paddingTop: 10 }}>
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
                {data.tabla.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 14 }}>
                      No hay datos en este rango.
                    </td>
                  </tr>
                ) : (
                  data.tabla.map((r) => (
                    <tr key={r.cliente}>
                      <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {formatCLP(r.facturado)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {formatCLP(r.pendiente)}
                      </td>
                      <td style={{ fontWeight: 900 }}>{r.estado}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="spacer" />

            <div className="muted">
              Siguiente paso (cuando quieras): exportar CSV y botón “Marcar como facturado” desde esta tabla.
            </div>
          </div>
        </div>

        <div className="spacer" />

        <div className="row">
          <Link className="btn" href={`/guias?desde=${desde}&hasta=${hasta}`}>
            Ver guías del rango
          </Link>
          <Link className="btn btnPrimary" href="/guias/nueva">
            + Nueva guía
          </Link>
          <Link className="btn" href={`/reportes?tab=dashboard&desde=${desde}&hasta=${hasta}`}>
            Ir a Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ======================
   TAB 3: PRODUCCIÓN
   ====================== */
function buildProduccionPorDia(guias: GuiaRow[], items: ItemRow[]) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const byDay = new Map<
    string,
    { guiaIds: Set<string>; clientes: Set<string>; m3: number; total: number; pendiente: number }
  >();

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const fecha = g.fecha ?? "";
    if (!fecha) continue;

    if (!byDay.has(fecha)) {
      byDay.set(fecha, { guiaIds: new Set(), clientes: new Set(), m3: 0, total: 0, pendiente: 0 });
    }

    const agg = byDay.get(fecha)!;
    agg.guiaIds.add(g.id);
    agg.clientes.add(getClientName(g));

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);
    const subtotal = m3 * precio;

    agg.m3 += m3;
    agg.total += subtotal;

    if (String(g.estado_facturacion ?? "").toUpperCase() === "PENDIENTE") {
      agg.pendiente += subtotal;
    }
  }

  const days = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, v]) => {
      const guiasCount = v.guiaIds.size;
      return {
        fecha,
        m3: v.m3,
        guias: guiasCount,
        clientes: v.clientes.size,
        totalCLP: v.total,
        pendienteCLP: v.pendiente,
        avgM3PorGuia: guiasCount > 0 ? v.m3 / guiasCount : 0,
        avgCLPPorGuia: guiasCount > 0 ? v.total / guiasCount : 0,
      };
    });

  const totalM3 = days.reduce((s, d) => s + d.m3, 0);
  const totalGuias = days.reduce((s, d) => s + d.guias, 0);
  const totalCLP = days.reduce((s, d) => s + d.totalCLP, 0);
  const totalPendiente = days.reduce((s, d) => s + d.pendienteCLP, 0);

  const best = [...days].sort((a, b) => b.m3 - a.m3)[0] ?? null;
  const worst = [...days].sort((a, b) => a.m3 - b.m3)[0] ?? null;

  return { days, totalM3, totalGuias, totalCLP, totalPendiente, best, worst };
}

function ProduccionTab({
  desde,
  hasta,
  data,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildProduccionPorDia>;
}) {
  const maxM3 = Math.max(1, ...data.days.map((d) => d.m3));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Producción por día</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Tendencia diaria de m³, guías, clientes y $ (total / pendiente)
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total m³ (rango)" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Guías (rango)" value={String(data.totalGuias)} />
          <KPI label="Total $" value={formatCLP(data.totalCLP)} />
          <KPI label="Pendiente $" value={formatCLP(data.totalPendiente)} />
          <KPI
            label="Prom. m³ / guía"
            value={formatNumber(data.totalGuias > 0 ? data.totalM3 / data.totalGuias : 0, 2)}
          />
          <KPI
            label="Prom. $ / guía"
            value={formatCLP(data.totalGuias > 0 ? data.totalCLP / data.totalGuias : 0)}
          />
        </div>

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted">
            Rango: <strong>{desde}</strong> → <strong>{hasta}</strong>
          </div>

          <div className="row">
            {data.best && (
              <div className="pill">
                🟢 Mejor día: <strong>{data.best.fecha}</strong> ({formatNumber(data.best.m3, 2)} m³)
              </div>
            )}
            {data.worst && (
              <div className="pill">
                🔴 Día más bajo: <strong>{data.worst.fecha}</strong> ({formatNumber(data.worst.m3, 2)} m³)
              </div>
            )}
          </div>
        </div>

        <div className="spacer" />

        <div className="card" style={{ border: "1px solid var(--line)" }}>
          <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 900 }}>Detalle por día</div>
            <div className="muted">Se calcula desde items (m³ * precio/m³) agrupado por fecha</div>
          </div>

          <div className="section" style={{ paddingTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Fecha</th>
                  <th style={{ width: 140 }}>m³</th>
                  <th style={{ width: 90 }}>Guías</th>
                  <th style={{ width: 110 }}>Clientes</th>
                  <th style={{ width: 140 }}>Total $</th>
                  <th style={{ width: 140 }}>Pendiente $</th>
                  <th style={{ width: 160 }}>Prom. m³/guía</th>
                  <th style={{ width: 160 }}>Prom. $/guía</th>
                </tr>
              </thead>
              <tbody>
                {data.days.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted" style={{ padding: 14 }}>
                      No hay datos en este rango.
                    </td>
                  </tr>
                ) : (
                  data.days.map((d) => (
                    <tr key={d.fecha}>
                      <td style={{ fontWeight: 900 }}>{d.fecha}</td>
                      <td>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 900 }}>{formatNumber(d.m3, 2)}</div>
                          <Bar pct={(d.m3 / maxM3) * 100} />
                        </div>
                      </td>
                      <td>{d.guias}</td>
                      <td>{d.clientes}</td>
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.totalCLP)}</td>
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.pendienteCLP)}</td>
                      <td>{formatNumber(d.avgM3PorGuia, 2)}</td>
                      <td>{formatCLP(d.avgCLPPorGuia)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="spacer" />

            <div className="row">
              <Link className="btn" href={`/guias?desde=${desde}&hasta=${hasta}`}>
                Ver guías del rango
              </Link>
              <Link className="btn btnPrimary" href="/guias/nueva">
                + Nueva guía
              </Link>
            </div>
          </div>
        </div>

        <div className="spacer" />
        <div className="muted">Próximo paso: comparación vs periodo anterior (misma tabla).</div>
      </div>
    </div>
  );
}

/* ======================
   TAB 4: CAMIONES / CHOFERES
   ====================== */
function buildCamionesChoferes(guias: GuiaRow[], items: ItemRow[]) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const totalM3 = items.reduce((s, it) => s + safeNum(it.cantidad_m3), 0);
  const totalGuias = guias.length;
  const promM3Viaje = totalGuias > 0 ? totalM3 / totalGuias : 0;

  // Ranking Camiones (por patente) + chofer principal
  type CamAgg = { patente: string; m3: number; viajes: number; choferCounts: Map<string, number> };
  const byPatente = new Map<string, CamAgg>();

  for (const g of guias) {
    const pat = normPatente(g.patente);
    if (!pat) continue;

    if (!byPatente.has(pat)) {
      byPatente.set(pat, { patente: pat, m3: 0, viajes: 0, choferCounts: new Map() });
    }
    byPatente.get(pat)!.viajes += 1;

    const ch = normName(g.chofer);
    if (ch) byPatente.get(pat)!.choferCounts.set(ch, (byPatente.get(pat)!.choferCounts.get(ch) ?? 0) + 1);
  }

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;
    const pat = normPatente(g.patente);
    if (!pat || !byPatente.has(pat)) continue;
    byPatente.get(pat)!.m3 += safeNum(it.cantidad_m3);
  }

  const rankingCamiones = Array.from(byPatente.values())
    .map((c) => {
      let choferPrincipal = "-";
      let best = 0;
      for (const [k, v] of c.choferCounts.entries()) {
        if (v > best) {
          best = v;
          choferPrincipal = k;
        }
      }
      return {
        patente: c.patente,
        choferPrincipal,
        viajes: c.viajes,
        m3: c.m3,
        prom: c.viajes > 0 ? c.m3 / c.viajes : 0,
      };
    })
    .sort((a, b) => b.m3 - a.m3);

  // Ranking Choferes por viajes
  type ChoAgg = { chofer: string; viajes: number; m3: number };
  const byChofer = new Map<string, ChoAgg>();

  for (const g of guias) {
    const ch = normName(g.chofer);
    if (!ch) continue;
    if (!byChofer.has(ch)) byChofer.set(ch, { chofer: ch, viajes: 0, m3: 0 });
    byChofer.get(ch)!.viajes += 1;
  }

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;
    const ch = normName(g.chofer);
    if (!ch || !byChofer.has(ch)) continue;
    byChofer.get(ch)!.m3 += safeNum(it.cantidad_m3);
  }

  const rankingChoferes = Array.from(byChofer.values())
    .map((c) => ({
      chofer: c.chofer,
      viajes: c.viajes,
      m3: c.m3,
      prom: c.viajes > 0 ? c.m3 / c.viajes : 0,
    }))
    .sort((a, b) => b.viajes - a.viajes);

  return { totalM3, totalGuias, promM3Viaje, rankingCamiones, rankingChoferes };
}

function CamionesTab({
  data,
}: {
  data: ReturnType<typeof buildCamionesChoferes>;
}) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Camiones / Choferes</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Ranking por m³ y eficiencia por viaje (desde guías, sin planillas).
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total m³ transportados" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Total guías (rango)" value={String(data.totalGuias)} />
          <KPI label="Promedio m³ / viaje" value={formatNumber(data.promM3Viaje, 2)} />
        </div>

        <div className="spacer" />

        <div className="grid2">
          <div className="cardInner">
            <div className="cardTitle">Ranking de camiones por m³</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Patente</th>
                  <th>Chofer (principal)</th>
                  <th style={{ textAlign: "right" }}>Viajes</th>
                  <th style={{ textAlign: "right" }}>m³</th>
                  <th style={{ textAlign: "right" }}>Prom</th>
                </tr>
              </thead>
              <tbody>
                {data.rankingCamiones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.rankingCamiones.map((r) => (
                    <tr key={r.patente}>
                      <td style={{ fontWeight: 900 }}>{r.patente}</td>
                      <td style={{ fontWeight: 900 }}>{r.choferPrincipal}</td>
                      <td style={{ textAlign: "right" }}>{r.viajes}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                      <td style={{ textAlign: "right" }}>{formatNumber(r.prom, 2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="cardInner">
            <div className="cardTitle">Ranking de choferes por viajes</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Chofer</th>
                  <th style={{ textAlign: "right" }}>Viajes</th>
                  <th style={{ textAlign: "right" }}>m³</th>
                  <th style={{ textAlign: "right" }}>Prom</th>
                </tr>
              </thead>
              <tbody>
                {data.rankingChoferes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.rankingChoferes.map((r) => (
                    <tr key={r.chofer}>
                      <td style={{ fontWeight: 900 }}>{r.chofer}</td>
                      <td style={{ textAlign: "right" }}>{r.viajes}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                      <td style={{ textAlign: "right" }}>{formatNumber(r.prom, 2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="spacer" />
            <div className="muted">
              Nota: normalizamos chofer/patente en mayúscula para evitar duplicados.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================
   TAB 5: PRODUCTOS
   ====================== */
function buildProductos(guias: GuiaRow[], items: ItemRow[], productosMap: Map<string, string>) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const totalM3 = items.reduce((s, it) => s + safeNum(it.cantidad_m3), 0);
  const totalCLP = items.reduce((s, it) => s + safeNum(it.cantidad_m3) * safeNum(it.precio_m3), 0);

  type ProdAgg = {
    producto: string;
    m3: number;
    guias: Set<string>;
    clientes: Set<string>;
    totalCLP: number;
  };

  const byProd = new Map<string, ProdAgg>();

  for (const it of items) {
    const pid = it.producto_id ?? "";
    const nombre = pid ? (productosMap.get(pid) ?? "(producto)") : "(producto)";
    const key = `${pid}:${nombre}`;

    if (!byProd.has(key)) {
      byProd.set(key, {
        producto: nombre,
        m3: 0,
        guias: new Set(),
        clientes: new Set(),
        totalCLP: 0,
      });
    }

    const g = guiaMap.get(it.guia_id);
    if (g) {
      byProd.get(key)!.guias.add(g.id);
      byProd.get(key)!.clientes.add(getClientName(g));
    }

    const m3 = safeNum(it.cantidad_m3);
    const subtotal = m3 * safeNum(it.precio_m3);
    byProd.get(key)!.m3 += m3;
    byProd.get(key)!.totalCLP += subtotal;
  }

  const rows = Array.from(byProd.values())
    .map((p) => ({
      producto: p.producto,
      m3: p.m3,
      guias: p.guias.size,
      clientes: p.clientes.size,
      totalCLP: p.totalCLP,
      precioProm: p.m3 > 0 ? p.totalCLP / p.m3 : 0,
    }))
    .sort((a, b) => b.m3 - a.m3);

  const productosDistintos = rows.length;

  return {
    totalM3,
    totalCLP,
    productosDistintos,
    top10: rows.slice(0, 10),
  };
}

function ProductosTab({
  desde,
  hasta,
  data,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildProductos>;
}) {
  const maxM3 = Math.max(1, ...data.top10.map((x) => x.m3));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Productos</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Ranking por m³, total $ y clientes (desde guías + items).
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="m³ total (rango)" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Total $" value={formatCLP(data.totalCLP)} />
          <KPI label="Productos distintos" value={String(data.productosDistintos)} />
          <KPI label="Desde" value={desde} />
          <KPI label="Hasta" value={hasta} />
          <KPI label="Top mostrados" value={String(data.top10.length)} />
        </div>

        <div className="spacer" />

        <div className="card" style={{ border: "1px solid var(--line)" }}>
          <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 900 }}>Top 10 productos por m³</div>
            <div className="muted">Ordenado por m³ (barra proporcional dentro de la tabla)</div>
          </div>

          <div className="section" style={{ paddingTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ width: 180 }}>m³</th>
                  <th style={{ textAlign: "right" }}>Guías</th>
                  <th style={{ textAlign: "right" }}>Clientes</th>
                  <th style={{ textAlign: "right" }}>Total $</th>
                  <th style={{ textAlign: "right" }}>Precio prom.</th>
                </tr>
              </thead>
              <tbody>
                {data.top10.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.top10.map((r) => (
                    <tr key={r.producto}>
                      <td style={{ fontWeight: 900 }}>{r.producto}</td>
                      <td>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 900 }}>{formatNumber(r.m3, 2)}</div>
                          <Bar pct={(r.m3 / maxM3) * 100} />
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{r.guias}</td>
                      <td style={{ textAlign: "right" }}>{r.clientes}</td>
                      <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalCLP)}</td>
                      <td style={{ textAlign: "right" }}>{formatCLP(r.precioProm)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="spacer" />
            <div className="muted">
              Próximo upgrade: filtro por cliente + producto (para ver “qué compra cada cliente”).
            </div>

            <div className="spacer" />

            <div className="row">
              <Link className="btn" href={`/reportes?tab=facturacion&desde=${desde}&hasta=${hasta}`}>
                Ir a Facturación
              </Link>
              <Link className="btn" href={`/reportes?tab=camiones&desde=${desde}&hasta=${hasta}`}>
                Ir a Camiones/Choferes
              </Link>
              <Link className="btn btnPrimary" href="/guias/nueva">
                + Nueva guía
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================
   TAB 6: CLIENTES
   ====================== */
function buildClientes(guias: GuiaRow[], items: ItemRow[], productosMap: Map<string, string>) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  type CliAgg = {
    cliente: string;
    m3: number;
    totalCLP: number;
    guiaIds: Set<string>;
    productos: Set<string>;
  };

  const byCliente = new Map<string, CliAgg>();

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const cliente = getClientName(g);

    if (!byCliente.has(cliente)) {
      byCliente.set(cliente, {
        cliente,
        m3: 0,
        totalCLP: 0,
        guiaIds: new Set(),
        productos: new Set(),
      });
    }

    const agg = byCliente.get(cliente)!;

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);
    const subtotal = m3 * precio;

    agg.m3 += m3;
    agg.totalCLP += subtotal;
    agg.guiaIds.add(g.id);

    if (it.producto_id) {
      const nom = productosMap.get(it.producto_id) ?? "";
      if (nom) agg.productos.add(nom);
    }
  }

  const rows = Array.from(byCliente.values())
    .map((c) => ({
      cliente: c.cliente,
      m3: c.m3,
      totalCLP: c.totalCLP,
      guias: c.guiaIds.size,
      productos: c.productos.size,
      precioProm: c.m3 > 0 ? c.totalCLP / c.m3 : 0,
    }))
    .sort((a, b) => b.m3 - a.m3);

  const totalM3 = rows.reduce((s, r) => s + r.m3, 0);
  const totalCLP = rows.reduce((s, r) => s + r.totalCLP, 0);
  const clientesDistintos = rows.length;
  const top10 = rows.slice(0, 10);

  return { totalM3, totalCLP, clientesDistintos, top10 };
}

function ClientesTab({
  desde,
  hasta,
  data,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildClientes>;
}) {
  const maxM3 = Math.max(1, ...data.top10.map((x) => x.m3));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Clientes</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Ranking por cliente: m³, total $, guías y productos distintos.
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="m³ total (rango)" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Total $" value={formatCLP(data.totalCLP)} />
          <KPI label="Clientes distintos" value={String(data.clientesDistintos)} />
          <KPI label="Desde" value={desde} />
          <KPI label="Hasta" value={hasta} />
          <KPI label="Top mostrados" value={String(data.top10.length)} />
        </div>

        <div className="spacer" />

        <div className="card" style={{ border: "1px solid var(--line)" }}>
          <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 900 }}>Top 10 clientes por m³</div>
            <div className="muted">Ordenado por m³ (barra proporcional)</div>
          </div>

          <div className="section" style={{ paddingTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ width: 180 }}>m³</th>
                  <th style={{ textAlign: "right" }}>Guías</th>
                  <th style={{ textAlign: "right" }}>Productos</th>
                  <th style={{ textAlign: "right" }}>Total $</th>
                  <th style={{ textAlign: "right" }}>Precio prom.</th>
                </tr>
              </thead>
              <tbody>
                {data.top10.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 14 }}>
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  data.top10.map((r) => (
                    <tr key={r.cliente}>
                      <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                      <td>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 900 }}>{formatNumber(r.m3, 2)}</div>
                          <Bar pct={(r.m3 / maxM3) * 100} />
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{r.guias}</td>
                      <td style={{ textAlign: "right" }}>{r.productos}</td>
                      <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalCLP)}</td>
                      <td style={{ textAlign: "right" }}>{formatCLP(r.precioProm)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="spacer" />
            <div className="muted">
              Próximo upgrade: “Cliente → detalle por producto” (qué compra cada cliente).
            </div>

            <div className="spacer" />

            <div className="row">
              <Link className="btn" href={`/reportes?tab=productos&desde=${desde}&hasta=${hasta}`}>
                Ir a Productos
              </Link>
              <Link className="btn" href={`/reportes?tab=facturacion&desde=${desde}&hasta=${hasta}`}>
                Ir a Facturación
              </Link>
              <Link className="btn btnPrimary" href="/guias/nueva">
                + Nueva guía
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================
   MAIN
   ====================== */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;

  const tab: TabKey = (sp.tab as TabKey) || "dashboard";

  const hoy = toISODate(new Date());
  const desde = sp.desde ?? hoy;
  const hasta = sp.hasta ?? hoy;

  let guias: GuiaRow[] = [];
  let items: ItemRow[] = [];
  let productosMap = new Map<string, string>();

  try {
    guias = await fetchGuiasEnRango(desde, hasta);
    items = await fetchItemsPorGuias(guias.map((g) => g.id));
    productosMap = await fetchProductosMap(items.map((it) => it.producto_id ?? ""));
  } catch (e: any) {
    return (
      <div className="container">
        <h1 className="pageTitle">Reportes</h1>

        <div className="card">
          <div className="section">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Error al cargar datos</div>
            <div className="muted">
              {e?.message ?? "Ocurrió un error al consultar la base de datos."}
            </div>

            <div className="spacer" />

            <Link className="btn" href="/guias">
              Volver a Guías
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Builds
  const dashboard = buildDashboard(guias, items, productosMap);
  const facturacion = buildFacturacion(guias, items);
  const produccion = buildProduccionPorDia(guias, items);
  const camiones = buildCamionesChoferes(guias, items);
  const productos = buildProductos(guias, items, productosMap);
  const clientes = buildClientes(guias, items, productosMap);

  return (
    <div className="container">
      <h1 className="pageTitle">Reportes</h1>

      <Tabs tab={tab} desde={desde} hasta={hasta} />
      <RangeBox tab={tab} desde={desde} hasta={hasta} />

      {tab === "dashboard" && <DashboardTab desde={desde} hasta={hasta} data={dashboard} />}
      {tab === "facturacion" && <FacturacionTab desde={desde} hasta={hasta} data={facturacion} />}
      {tab === "produccion" && <ProduccionTab desde={desde} hasta={hasta} data={produccion} />}
      {tab === "camiones" && <CamionesTab data={camiones} />}
      {tab === "productos" && <ProductosTab desde={desde} hasta={hasta} data={productos} />}
      {tab === "clientes" && <ClientesTab desde={desde} hasta={hasta} data={clientes} />}
    </div>
  );
}