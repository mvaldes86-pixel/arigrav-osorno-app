import Link from "next/link";
import { supabase } from "@/lib/supabase";

/**
 * REPORTE 8: Ejecutivo Dueño (12 meses + proyección)
 *
 * Incluye:
 * - Tablero mensual: m³, $, # guías, # clientes (últimos 12 meses)
 * - Proyección fin de mes (run-rate del mes actual)
 * - Proyección 12 meses (simple: promedio últimos 3 meses * 12)
 * - Alertas:
 *    - Caída de volumen vs mes anterior
 *    - Concentración cliente (top cliente %)
 *    - Morosidad (aging 0-7 / 8-15 / 16-30 / +30)
 *
 * IMPORTANTE:
 * - NO usamos guias.cliente_manual
 * - trabajamos con cliente_id y join clientes(nombre)
 */

type GuiaRow = {
  id: string;
  fecha: string | null; // YYYY-MM-DD
  cliente_id: string | null;
  estado_facturacion: "PENDIENTE" | "PAGADO" | string | null;
  clientes?: { nombre: string } | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  producto_id: string | null;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

/* ======================
   HELPERS
   ====================== */
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; // YYYY-MM
}

function labelMonth(yyyyMm: string) {
  // "2026-03" -> "Mar 2026"
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[(m ?? 1) - 1] ?? "Mes"} ${y}`;
}

function getClientName(g: GuiaRow) {
  return g.clientes?.nombre ?? "(sin cliente)";
}

function daysDiffFromToday(iso: string) {
  // hoy - fecha (en días). Si la fecha es futura => 0
  const today = new Date();
  const d = new Date(`${iso}T00:00:00`);
  const ms = today.getTime() - d.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/* ======================
   FETCH
   ====================== */
async function fetchGuiasEnRango(desde: string, hasta: string) {
  const { data, error } = await supabase
    .from("guias")
    .select("id, fecha, cliente_id, estado_facturacion, clientes(nombre)")
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

/* ======================
   BUILD: EJECUTIVO
   ====================== */
type MonthRow = {
  ym: string; // YYYY-MM
  m3: number;
  totalCLP: number;
  guias: number;
  clientes: number;
};

function buildMensual12m(guias: GuiaRow[], items: ItemRow[]) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  // month aggregates
  const byMonth = new Map<
    string,
    {
      m3: number;
      totalCLP: number;
      guiaIds: Set<string>;
      clientes: Set<string>;
    }
  >();

  // Pre-cargar sets por guía
  for (const g of guias) {
    if (!g.fecha) continue;
    const d = new Date(`${g.fecha}T00:00:00`);
    const ym = monthKey(d);

    if (!byMonth.has(ym)) {
      byMonth.set(ym, { m3: 0, totalCLP: 0, guiaIds: new Set(), clientes: new Set() });
    }
    byMonth.get(ym)!.guiaIds.add(g.id);
    byMonth.get(ym)!.clientes.add(getClientName(g));
  }

  // Items suman m³ y $
  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g?.fecha) continue;
    const ym = monthKey(new Date(`${g.fecha}T00:00:00`));

    if (!byMonth.has(ym)) {
      byMonth.set(ym, { m3: 0, totalCLP: 0, guiaIds: new Set(), clientes: new Set() });
    }

    const m3 = safeNum(it.cantidad_m3);
    const subtotal = m3 * safeNum(it.precio_m3);

    byMonth.get(ym)!.m3 += m3;
    byMonth.get(ym)!.totalCLP += subtotal;
  }

  const rows: MonthRow[] = Array.from(byMonth.entries())
    .map(([ym, v]) => ({
      ym,
      m3: v.m3,
      totalCLP: v.totalCLP,
      guias: v.guiaIds.size,
      clientes: v.clientes.size,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return rows;
}

function buildConcentracionClientesMesActual(guias: GuiaRow[], items: ItemRow[]) {
  // Calcula participación por cliente (en $) SOLO mes actual
  const today = new Date();
  const from = toISODate(startOfMonth(today));
  const to = toISODate(endOfMonth(today));

  const guiaMes = guias.filter((g) => (g.fecha ?? "") >= from && (g.fecha ?? "") <= to);
  const guiaIds = new Set(guiaMes.map((g) => g.id));

  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guiaMes) guiaMap.set(g.id, g);

  const byCliente = new Map<string, number>();
  let total = 0;

  for (const it of items) {
    if (!guiaIds.has(it.guia_id)) continue;
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const cliente = getClientName(g);
    const subtotal = safeNum(it.cantidad_m3) * safeNum(it.precio_m3);
    total += subtotal;

    byCliente.set(cliente, (byCliente.get(cliente) ?? 0) + subtotal);
  }

  const ranking = Array.from(byCliente.entries())
    .map(([cliente, totalCLP]) => ({ cliente, totalCLP, pct: total > 0 ? (totalCLP / total) * 100 : 0 }))
    .sort((a, b) => b.totalCLP - a.totalCLP);

  const top = ranking[0] ?? null;

  return {
    totalMesCLP: total,
    topCliente: top?.cliente ?? null,
    topClientePct: top?.pct ?? 0,
    topClienteCLP: top?.totalCLP ?? 0,
    rankingTop5: ranking.slice(0, 5),
  };
}

function buildMorosidadAging(guias: GuiaRow[], items: ItemRow[]) {
  // Aging se calcula con fecha guía vs HOY, usando SOLO guías con estado_facturacion = PENDIENTE
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  type BucketKey = "0-7" | "8-15" | "16-30" | "+30";
  const buckets: Record<BucketKey, { guias: Set<string>; totalCLP: number }> = {
    "0-7": { guias: new Set(), totalCLP: 0 },
    "8-15": { guias: new Set(), totalCLP: 0 },
    "16-30": { guias: new Set(), totalCLP: 0 },
    "+30": { guias: new Set(), totalCLP: 0 },
  };

  const pendingGuiaIds = new Set(
    guias
      .filter((g) => String(g.estado_facturacion ?? "").toUpperCase() === "PENDIENTE" && !!g.fecha)
      .map((g) => g.id)
  );

  for (const it of items) {
    if (!pendingGuiaIds.has(it.guia_id)) continue;

    const g = guiaMap.get(it.guia_id);
    if (!g?.fecha) continue;

    const age = daysDiffFromToday(g.fecha);
    let key: BucketKey = "+30";
    if (age <= 7) key = "0-7";
    else if (age <= 15) key = "8-15";
    else if (age <= 30) key = "16-30";
    else key = "+30";

    const subtotal = safeNum(it.cantidad_m3) * safeNum(it.precio_m3);

    buckets[key].guias.add(g.id);
    buckets[key].totalCLP += subtotal;
  }

  const totalPendiente = Object.values(buckets).reduce((s, b) => s + b.totalCLP, 0);

  const rows = (Object.keys(buckets) as BucketKey[]).map((k) => ({
    bucket: k,
    guias: buckets[k].guias.size,
    totalCLP: buckets[k].totalCLP,
    pct: totalPendiente > 0 ? (buckets[k].totalCLP / totalPendiente) * 100 : 0,
  }));

  return { totalPendiente, rows };
}

function buildAlertas(monthRows: MonthRow[], conc: ReturnType<typeof buildConcentracionClientesMesActual>, aging: ReturnType<typeof buildMorosidadAging>) {
  const last = monthRows[monthRows.length - 1] ?? null;
  const prev = monthRows.length >= 2 ? monthRows[monthRows.length - 2] : null;

  // caída volumen
  let volDropPct = 0;
  let volDropFlag = false;
  if (last && prev && prev.m3 > 0) {
    volDropPct = ((last.m3 - prev.m3) / prev.m3) * 100;
    // alerta si cae más de 20%
    volDropFlag = volDropPct <= -20;
  }

  // concentración cliente
  const concFlag = conc.topClientePct >= 40 && conc.totalMesCLP > 0;

  // morosidad
  const morosidadFlag = aging.totalPendiente > 0 && (aging.rows.find((r) => r.bucket === "+30")?.totalCLP ?? 0) > 0;

  const alerts: { level: "ok" | "warn"; title: string; detail: string }[] = [];

  alerts.push({
    level: volDropFlag ? "warn" : "ok",
    title: "Volumen vs mes anterior",
    detail:
      last && prev
        ? `${labelMonth(prev.ym)} → ${labelMonth(last.ym)}: ${formatNumber(volDropPct, 1)}%`
        : "Aún no hay 2 meses para comparar.",
  });

  alerts.push({
    level: concFlag ? "warn" : "ok",
    title: "Concentración de cliente (mes actual)",
    detail:
      conc.totalMesCLP > 0 && conc.topCliente
        ? `${conc.topCliente}: ${formatNumber(conc.topClientePct, 1)}% del $ del mes`
        : "No hay $ en el mes actual (o faltan precios).",
  });

  const plus30 = aging.rows.find((r) => r.bucket === "+30");
  alerts.push({
    level: morosidadFlag ? "warn" : "ok",
    title: "Morosidad (+30 días)",
    detail:
      aging.totalPendiente > 0
        ? `${formatCLP(plus30?.totalCLP ?? 0)} en +30 (Total pendiente: ${formatCLP(aging.totalPendiente)})`
        : "No hay pendiente calculable (o faltan precios).",
  });

  return alerts;
}

/* ======================
   UI
   ====================== */
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

function Pill({ level, title, detail }: { level: "ok" | "warn"; title: string; detail: string }) {
  return (
    <div className="pill" style={{ border: level === "warn" ? "1px solid #f3c969" : "1px solid var(--line)" }}>
      <strong>{level === "warn" ? "🟠" : "🟢"} {title}:</strong> <span className="muted">{detail}</span>
    </div>
  );
}

/* ======================
   PAGE
   ====================== */
export default async function ReporteEjecutivoPage() {
  // Últimos 12 meses (incluye mes actual)
  const today = new Date();
  const start = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 11, 1));
  const end = endOfMonth(today);

  const desde = toISODate(start);
  const hasta = toISODate(end);

  let guias: GuiaRow[] = [];
  let items: ItemRow[] = [];

  try {
    guias = await fetchGuiasEnRango(desde, hasta);
    items = await fetchItemsPorGuias(guias.map((g) => g.id));
  } catch (e: any) {
    return (
      <div className="container">
        <h1 className="pageTitle">Reporte Ejecutivo</h1>

        <div className="card">
          <div className="section">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Error al cargar datos</div>
            <div className="muted">{e?.message ?? "Ocurrió un error al consultar la base de datos."}</div>

            <div className="spacer" />

            <Link className="btn" href="/reportes">
              Volver a Reportes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const monthRows = buildMensual12m(guias, items);

  // Totales 12m
  const totalM3_12m = monthRows.reduce((s, r) => s + r.m3, 0);
  const totalCLP_12m = monthRows.reduce((s, r) => s + r.totalCLP, 0);
  const totalGuias_12m = monthRows.reduce((s, r) => s + r.guias, 0);

  // Mes actual
  const ymNow = monthKey(today);
  const monthData = monthRows.find((r) => r.ym === ymNow) ?? null;

  // Run-rate mes actual
  const dayOfMonth = today.getDate();
  const dim = daysInMonth(today);
  const runRateM3 = monthData ? monthData.m3 / Math.max(1, dayOfMonth) : 0;
  const projectionM3Month = runRateM3 * dim;

  const runRateCLP = monthData ? monthData.totalCLP / Math.max(1, dayOfMonth) : 0;
  const projectionCLPMonth = runRateCLP * dim;

  // Proyección 12m (simple): promedio últimos 3 meses * 12
  const last3 = monthRows.slice(-3);
  const avgM3_3m = last3.length > 0 ? last3.reduce((s, r) => s + r.m3, 0) / last3.length : 0;
  const avgCLP_3m = last3.length > 0 ? last3.reduce((s, r) => s + r.totalCLP, 0) / last3.length : 0;

  const projectionM3_12m = avgM3_3m * 12;
  const projectionCLP_12m = avgCLP_3m * 12;

  // Concentración clientes (mes actual)
  const conc = buildConcentracionClientesMesActual(guias, items);

  // Morosidad / aging (usa todo el rango 12m; puedes cambiarlo a “mes actual” si prefieres)
  const aging = buildMorosidadAging(guias, items);

  // Alertas
  const alertas = buildAlertas(monthRows, conc, aging);

  const maxM3 = Math.max(1, ...monthRows.map((r) => r.m3));
  const maxCLP = Math.max(1, ...monthRows.map((r) => r.totalCLP));

  return (
    <div className="container">
      <div className="toolbar" style={{ alignItems: "center" }}>
        <div>
          <h1 className="pageTitle" style={{ marginBottom: 4 }}>Reporte Ejecutivo</h1>
          <div className="muted">Últimos 12 meses: <strong>{desde}</strong> → <strong>{hasta}</strong></div>
        </div>

        <div className="row">
          <Link className="btn" href="/reportes">← Volver a Reportes</Link>
          <Link className="btn btnPrimary" href="/guias/nueva">+ Nueva guía</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section">
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>KPIs (12 meses)</h2>

          <div className="kpiGrid" style={{ marginTop: 16 }}>
            <KPI label="Total m³ (12m)" value={formatNumber(totalM3_12m, 2)} />
            <KPI label="Total $ (12m)" value={formatCLP(totalCLP_12m)} />
            <KPI label="Total guías (12m)" value={String(totalGuias_12m)} />
            <KPI label="Mes actual" value={labelMonth(ymNow)} />
            <KPI label="Run-rate m³ (mes)" value={formatNumber(runRateM3, 2) + " /día"} />
            <KPI label="Proyección mes m³" value={formatNumber(projectionM3Month, 2)} />
            <KPI label="Run-rate $ (mes)" value={formatCLP(runRateCLP) + " /día"} />
            <KPI label="Proyección mes $" value={formatCLP(projectionCLPMonth)} />
          </div>

          <div className="spacer" />

          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Proyección 12 meses (simple)</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Promedio últimos 3 meses × 12 (para tener una referencia rápida).
          </div>

          <div className="kpiGrid" style={{ marginTop: 16 }}>
            <KPI label="Prom. m³ (últ. 3m)" value={formatNumber(avgM3_3m, 2)} />
            <KPI label="Proyección 12m m³" value={formatNumber(projectionM3_12m, 2)} />
            <KPI label="Prom. $ (últ. 3m)" value={formatCLP(avgCLP_3m)} />
            <KPI label="Proyección 12m $" value={formatCLP(projectionCLP_12m)} />
          </div>

          <div className="spacer" />

          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Alertas</h2>
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
            {alertas.map((a, i) => (
              <Pill key={i} level={a.level} title={a.title} detail={a.detail} />
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section">
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Tablero mensual (12 meses)</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            m³, total $, # guías, # clientes por mes (barra proporcional).
          </div>

          <div className="spacer" />

          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Mes</th>
                <th style={{ width: 220 }}>m³</th>
                <th style={{ width: 220 }}>$</th>
                <th style={{ textAlign: "right", width: 90 }}>Guías</th>
                <th style={{ textAlign: "right", width: 110 }}>Clientes</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 14 }}>
                    No hay datos en los últimos 12 meses.
                  </td>
                </tr>
              ) : (
                monthRows.map((r) => (
                  <tr key={r.ym}>
                    <td style={{ fontWeight: 900 }}>{labelMonth(r.ym)}</td>

                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 900 }}>{formatNumber(r.m3, 2)}</div>
                        <Bar pct={(r.m3 / maxM3) * 100} />
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 900 }}>{formatCLP(r.totalCLP)}</div>
                        <Bar pct={(r.totalCLP / maxCLP) * 100} />
                      </div>
                    </td>

                    <td style={{ textAlign: "right" }}>{r.guias}</td>
                    <td style={{ textAlign: "right" }}>{r.clientes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="spacer" />

          <div className="grid2">
            <div className="cardInner">
              <div className="cardTitle">Concentración (mes actual)</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Top 5 clientes por $ (si hay precios en items).
              </div>

              <div className="spacer" />

              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ textAlign: "right" }}>Total $</th>
                    <th style={{ width: 160 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {conc.rankingTop5.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted" style={{ padding: 14 }}>
                        Sin datos en el mes actual (o faltan precios).
                      </td>
                    </tr>
                  ) : (
                    conc.rankingTop5.map((c) => (
                      <tr key={c.cliente}>
                        <td style={{ fontWeight: 900 }}>{c.cliente}</td>
                        <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(c.totalCLP)}</td>
                        <td>
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontWeight: 900 }}>{formatNumber(c.pct, 1)}%</div>
                            <Bar pct={c.pct} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="spacer" />
              <div className="muted">
                Si quieres, también lo hacemos por <strong>m³</strong> (cuando hay clientes con precio 0).
              </div>
            </div>

            <div className="cardInner">
              <div className="cardTitle">Morosidad (aging pendientes)</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Solo guías con estado <strong>PENDIENTE</strong>, agrupadas por días desde la fecha.
              </div>

              <div className="spacer" />

              <div className="kpiGrid">
                <KPI label="Total pendiente" value={formatCLP(aging.totalPendiente)} />
                <KPI label="0-7" value={formatCLP(aging.rows.find((r) => r.bucket === "0-7")?.totalCLP ?? 0)} />
                <KPI label="8-15" value={formatCLP(aging.rows.find((r) => r.bucket === "8-15")?.totalCLP ?? 0)} />
                <KPI label="16-30" value={formatCLP(aging.rows.find((r) => r.bucket === "16-30")?.totalCLP ?? 0)} />
                <KPI label="+30" value={formatCLP(aging.rows.find((r) => r.bucket === "+30")?.totalCLP ?? 0)} />
              </div>

              <div className="spacer" />

              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Aging</th>
                    <th style={{ textAlign: "right", width: 90 }}>Guías</th>
                    <th style={{ textAlign: "right" }}>$</th>
                    <th style={{ width: 160 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.rows.map((r) => (
                    <tr key={r.bucket}>
                      <td style={{ fontWeight: 900 }}>{r.bucket}</td>
                      <td style={{ textAlign: "right" }}>{r.guias}</td>
                      <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalCLP)}</td>
                      <td>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 900 }}>{formatNumber(r.pct, 1)}%</div>
                          <Bar pct={r.pct} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="spacer" />
              <div className="muted">
                Nota: si hay guías pendientes con precio 0, aparecerán como $0 (normal).
              </div>
            </div>
          </div>

          <div className="spacer" />

          <div className="row">
            <Link className="btn" href="/reportes">
              Volver a Reportes
            </Link>
            <Link className="btn" href="/guias">
              Ir a Guías
            </Link>
            <Link className="btn btnPrimary" href="/guias/nueva">
              + Nueva guía
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}