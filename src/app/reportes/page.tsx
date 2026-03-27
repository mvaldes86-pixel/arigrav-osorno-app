import Link from "next/link";
import { supabase } from "@/lib/supabase";

type TabKey =
  | "facturacion"
  | "produccion"
  | "camiones"
  | "productos"
  | "clientes";

type NombreRel = { nombre: string } | { nombre: string }[] | null;

type GuiaRow = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  cliente_id: string | null;
  orden_compra: string | null;
  clientes?: NombreRel;

  medio_pago:
    | "BANCO_CHILE"
    | "BANCO_ESTADO"
    | "EFECTIVO"
    | "CREDITO"
    | string
    | null;

  estado_facturacion:
    | "PENDIENTE"
    | "PAGADO"
    | "FACTURADO"
    | "ANULADA"
    | string
    | null;

  chofer: string | null;
  patente: string | null;

  transporte_id: string | null;
  valor_flete: number | null;
  transportes?: NombreRel;
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

type FacturacionDetalleRow = {
  cliente: string;
  fecha: string;
  numeroGuia: number | string;
  faena: string;
  ordenCompra: string;
  transporte: string;
  chofer: string;
  patente: string;
  producto: string;
  m3: number;
  precioM3: number;
  netoMaterial: number;
  valorFlete: number;
  totalGanancia: number;
  medioPago: string;
  estadoFacturacion: string;
};

type FacturacionClienteResumen = {
  cliente: string;
  guias: number;
  ordenCompra: string;
  m3: number;
  netoMateriales: number;
  totalFletes: number;
  totalGeneral: number;
  estado: string;
};

type FacturacionProductoResumen = {
  cliente: string;
  producto: string;
  ordenCompra: string;
  m3: number;
  precioPromedio: number;
  neto: number;
};

type ArigravDetalleRow = {
  numeroGuia: number | string;
  faena: string;
  cliente: string;
  chofer: string;
  patente: string;
  m3: number;
  totalMaterial: number;
  viajes: number;
};

type ArigravChoferResumenRow = {
  chofer: string;
  viajes: number;
  m3: number;
  totalMaterial: number;
};

type FleteDetalleRow = {
  numeroGuia: number | string;
  fecha: string;
  cliente: string;
  faena: string;
  transporte: string;
  chofer: string;
  patente: string;
  medioPago: string;
  m3: number;
  valorFlete: number;
  totalMaterial: number;
  totalGanancia: number;
};

type FleteResumenTransporteRow = {
  transporte: string;
  viajes: number;
  m3: number;
  totalFletes: number;
};

type FleteResumenChoferRow = {
  chofer: string;
  viajes: number;
  m3: number;
  totalFletes: number;
};

type ResumenSemanaRow = {
  transporte: string;
  empresa: string;
  material: string;
  cubos: number;
  fecha: string;
  precio: number;
  neto: number;
  flete: number;
  total: number;
  report: number | string;
  chofer: string;
  patente: string;
  pozoPago: string;
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

function safeNum(v: unknown) {
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

function normName(v: string | null) {
  if (!v) return "";
  return v.trim().replace(/\s+/g, " ").toUpperCase();
}

function getNombre(rel?: NombreRel): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nombre ?? "";
  return rel.nombre ?? "";
}

function getClientName(g: GuiaRow) {
  return getNombre(g.clientes) || "(sin cliente)";
}

function getTransporteName(g: GuiaRow) {
  return getNombre(g.transportes) || "ARIGRAV";
}

function getOrdenCompra(g: GuiaRow) {
  return (g.orden_compra ?? "").trim();
}

function resumenOC(values: string[]) {
  const unicas = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  if (unicas.length === 0) return "-";
  if (unicas.length === 1) return unicas[0];
  return "Varias OC";
}

function pozoPagoLabel(g: GuiaRow) {
  const faena = (g.faena ?? "").trim();
  const pago = medioPagoLabel(g.medio_pago);
  if (faena && pago && pago !== "-") return `${faena} / ${pago}`;
  if (faena) return faena;
  if (pago && pago !== "-") return pago;
  return "-";
}

function isGuiaActiva(g: GuiaRow) {
  return String(g.estado_facturacion ?? "").toUpperCase() !== "ANULADA";
}

/* ======================
   FETCH
   ====================== */
async function fetchGuiasEnRango(desde: string, hasta: string) {
  const { data, error } = await supabase
    .from("guias")
    .select(
      "id, numero, fecha, faena, cliente_id, orden_compra, medio_pago, estado_facturacion, chofer, patente, transporte_id, valor_flete, clientes(nombre), transportes(nombre)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as GuiaRow[]).filter(isGuiaActiva);
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
          <div style={{ fontWeight: 900, fontSize: 16 }}>Selecciona el tipo de reporte</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/guias" className="btn">
            ← Volver a Guías
          </Link>
        </div>
      </div>

      <div className="section">
        <div className="tabs">
          <Link className={`tab ${tab === "facturacion" ? "active" : ""}`} href={mk("facturacion")}>
            Facturación
          </Link>
          <Link className={`tab ${tab === "produccion" ? "active" : ""}`} href={mk("produccion")}>
            Producción
          </Link>
          <Link className={`tab ${tab === "camiones" ? "active" : ""}`} href={mk("camiones")}>
            Camiones / Choferes
          </Link>
          <Link className={`tab ${tab === "productos" ? "active" : ""}`} href={mk("productos")}>
            Productos
          </Link>
          <Link className={`tab ${tab === "clientes" ? "active" : ""}`} href={mk("clientes")}>
            Clientes
          </Link>
        </div>
      </div>
    </div>
  );
}

function RangeBox({ tab, desde, hasta }: { tab: TabKey; desde: string; hasta: string }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
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
   TAB 2: FACTURACIÓN
   ====================== */
function buildFacturacion(guias: GuiaRow[], items: ItemRow[], productosMap: Map<string, string>) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const detalleRows: FacturacionDetalleRow[] = [];
  const resumenMap = new Map<
    string,
    FacturacionClienteResumen & { guiaIds: Set<string>; ordenesCompra: Set<string> }
  >();
  const productosResumenMap = new Map<
    string,
    { cliente: string; producto: string; m3: number; neto: number; ordenesCompra: Set<string> }
  >();

  let totalFacturado = 0;
  let totalPendiente = 0;
  let totalFletes = 0;
  let totalGeneralMaterial = 0;

  const mpCount = new Map<string, number>();
  for (const g of guias) {
    const k = medioPagoLabel(g.medio_pago ?? null);
    mpCount.set(k, (mpCount.get(k) ?? 0) + 1);
  }

  const guiasCredito = guias.filter((g) => String(g.medio_pago ?? "").toUpperCase() === "CREDITO").length;

  const fletesSumados = new Set<string>();

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const cliente = getClientName(g);
    const producto = productosMap.get(it.producto_id ?? "") ?? "(producto)";
    const ordenCompra = getOrdenCompra(g);
    const m3 = safeNum(it.cantidad_m3);
    const precioM3 = safeNum(it.precio_m3);
    const netoMaterial = m3 * precioM3;
    const valorFlete = safeNum(g.valor_flete);
    const totalGanancia = netoMaterial - valorFlete;
    const estado = String(g.estado_facturacion ?? "").toUpperCase() || "-";

    detalleRows.push({
      cliente,
      fecha: g.fecha ?? "-",
      numeroGuia: g.numero ?? "-",
      faena: g.faena ?? "-",
      ordenCompra: ordenCompra || "-",
      transporte: getTransporteName(g),
      chofer: g.chofer ?? "-",
      patente: g.patente ?? "-",
      producto,
      m3,
      precioM3,
      netoMaterial,
      valorFlete,
      totalGanancia,
      medioPago: medioPagoLabel(g.medio_pago),
      estadoFacturacion: estado,
    });

    if (!resumenMap.has(cliente)) {
      resumenMap.set(cliente, {
        cliente,
        guias: 0,
        ordenCompra: "-",
        m3: 0,
        netoMateriales: 0,
        totalFletes: 0,
        totalGeneral: 0,
        estado: "OK",
        guiaIds: new Set<string>(),
        ordenesCompra: new Set<string>(),
      });
    }

    const resumen = resumenMap.get(cliente)!;
    resumen.m3 += m3;
    resumen.netoMateriales += netoMaterial;
    if (ordenCompra) resumen.ordenesCompra.add(ordenCompra);

    if (!fletesSumados.has(g.id)) {
      resumen.totalFletes += valorFlete;
      totalFletes += valorFlete;
      fletesSumados.add(g.id);
    }

    resumen.totalGeneral = resumen.netoMateriales - resumen.totalFletes;
    resumen.guiaIds.add(g.id);
    resumen.guias = resumen.guiaIds.size;
    resumen.ordenCompra = resumenOC(Array.from(resumen.ordenesCompra));
    if (estado !== "PAGADO") resumen.estado = "Pendiente";

    const keyProd = `${cliente}__${producto}`;
    if (!productosResumenMap.has(keyProd)) {
      productosResumenMap.set(keyProd, {
        cliente,
        producto,
        m3: 0,
        neto: 0,
        ordenesCompra: new Set<string>(),
      });
    }
    const prod = productosResumenMap.get(keyProd)!;
    prod.m3 += m3;
    prod.neto += netoMaterial;
    if (ordenCompra) prod.ordenesCompra.add(ordenCompra);

    if (estado === "PAGADO") totalFacturado += netoMaterial;
    else totalPendiente += netoMaterial;

    totalGeneralMaterial += netoMaterial;
  }

  const resumenClientes: FacturacionClienteResumen[] = Array.from(resumenMap.values())
    .map(({ guiaIds, ordenesCompra, ...rest }) => ({
      ...rest,
      ordenCompra: resumenOC(Array.from(ordenesCompra)),
    }))
    .sort((a, b) => b.totalGeneral - a.totalGeneral);

  const resumenProductos: FacturacionProductoResumen[] = Array.from(productosResumenMap.values())
    .map((p) => ({
      cliente: p.cliente,
      producto: p.producto,
      ordenCompra: resumenOC(Array.from(p.ordenesCompra)),
      m3: p.m3,
      neto: p.neto,
      precioPromedio: p.m3 > 0 ? p.neto / p.m3 : 0,
    }))
    .sort((a, b) => {
      if (a.cliente === b.cliente) return b.neto - a.neto;
      return a.cliente.localeCompare(b.cliente);
    });

  const detalleOrdenado = detalleRows.sort((a, b) => {
    if (a.cliente === b.cliente) {
      if (a.fecha === b.fecha) return String(a.numeroGuia).localeCompare(String(b.numeroGuia));
      return a.fecha.localeCompare(b.fecha);
    }
    return a.cliente.localeCompare(b.cliente);
  });

  const medios = Array.from(mpCount.entries())
    .map(([medio, guias]) => ({ medio, guias }))
    .sort((a, b) => b.guias - a.guias);

  const getCount = (label: string) => String(medios.find((x) => x.medio === label)?.guias ?? 0);

  return {
    totalFacturado,
    totalPendiente,
    totalFletes,
    totalMateriales: totalGeneralMaterial,
    totalGanancia: totalGeneralMaterial - totalFletes,
    guiasCredito,
    resumenClientes,
    resumenProductos,
    detalleRows: detalleOrdenado,
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Facturación automática por cliente</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Resumen y detalle facturable por cliente, incluyendo materiales y fletes.
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Mostrando desde <strong>{desde}</strong> hasta <strong>{hasta}</strong>
            </div>
          </div>

          <a
            className="btn btnPrimary"
            href={`/reportes/facturacion-export?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(
              hasta
            )}`}
          >
            Descargar Excel Facturación
          </a>
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total materiales" value={formatCLP(data.totalMateriales)} />
          <KPI label="Total fletes" value={formatCLP(data.totalFletes)} />
          <KPI label="Total ganancia" value={formatCLP(data.totalGanancia)} />
          <KPI label="Guías en crédito / por cobrar" value={String(data.guiasCredito)} />
          <KPI label="Guías Banco Chile" value={data.bancoChile} />
          <KPI label="Guías Banco Estado" value={data.bancoEstado} />
          <KPI label="Guías Efectivo" value={data.efectivo} />
          <KPI label="Clientes del rango" value={String(data.resumenClientes.length)} />
        </div>

        <div className="spacer" />

        <div className="cardInner">
          <div className="cardTitle" style={{ fontSize: 18, fontWeight: 900 }}>
            Resumen por cliente
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th style={{ textAlign: "right" }}>Guías</th>
                <th>OC</th>
                <th style={{ textAlign: "right" }}>m³</th>
                <th style={{ textAlign: "right" }}>Neto materiales</th>
                <th style={{ textAlign: "right" }}>Fletes</th>
                <th style={{ textAlign: "right" }}>Total ganancia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.resumenClientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 14 }}>
                    No hay datos en este rango.
                  </td>
                </tr>
              ) : (
                data.resumenClientes.map((r) => (
                  <tr key={r.cliente}>
                    <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                    <td style={{ textAlign: "right" }}>{r.guias}</td>
                    <td>{r.ordenCompra}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.netoMateriales)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalFletes)}</td>
                    <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalGeneral)}</td>
                    <td style={{ fontWeight: 900 }}>{r.estado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="spacer" />

        <div className="cardInner">
          <div className="cardTitle" style={{ fontSize: 18, fontWeight: 900 }}>
            Resumen por cliente y producto
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Producto</th>
                <th>OC</th>
                <th style={{ textAlign: "right" }}>m³</th>
                <th style={{ textAlign: "right" }}>Precio</th>
                <th style={{ textAlign: "right" }}>Neto</th>
              </tr>
            </thead>
            <tbody>
              {data.resumenProductos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 14 }}>
                    No hay datos en este rango.
                  </td>
                </tr>
              ) : (
                data.resumenProductos.map((r, i) => (
                  <tr key={`${r.cliente}-${r.producto}-${i}`}>
                    <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                    <td>{r.producto}</td>
                    <td>{r.ordenCompra}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                    <td style={{ textAlign: "right" }}>{formatCLP(r.precioPromedio)}</td>
                    <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.neto)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="spacer" />

        <div className="cardInner">
          <div className="cardTitle" style={{ fontSize: 18, fontWeight: 900 }}>
            Detalle facturable completo
          </div>

          <div
            style={{
              width: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              className="table"
              style={{
                minWidth: 1750,
                whiteSpace: "nowrap",
              }}
            >
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>N° guía</th>
                  <th>Faena</th>
                  <th>Orden de Compra</th>
                  <th>Transporte</th>
                  <th>Chofer</th>
                  <th>Patente</th>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>m³</th>
                  <th style={{ textAlign: "right" }}>Precio/m³</th>
                  <th style={{ textAlign: "right" }}>Neto material</th>
                  <th style={{ textAlign: "right" }}>Valor flete</th>
                  <th style={{ textAlign: "right" }}>Total ganancia</th>
                  <th>Método pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.detalleRows.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="muted" style={{ padding: 14 }}>
                      No hay datos en este rango.
                    </td>
                  </tr>
                ) : (
                  data.detalleRows.map((r, i) => (
                    <tr key={`${r.cliente}-${r.numeroGuia}-${r.producto}-${i}`}>
                      <td style={{ fontWeight: 900 }}>{r.cliente}</td>
                      <td>{r.fecha}</td>
                      <td>{r.numeroGuia}</td>
                      <td>{r.faena}</td>
                      <td>{r.ordenCompra}</td>
                      <td>{r.transporte}</td>
                      <td>{r.chofer}</td>
                      <td>{r.patente}</td>
                      <td
                        style={{
                          whiteSpace: "normal",
                          minWidth: 160,
                        }}
                      >
                        {r.producto}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                      <td style={{ textAlign: "right" }}>{formatCLP(r.precioM3)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.netoMaterial)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.valorFlete)}</td>
                      <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalGanancia)}</td>
                      <td>{r.medioPago}</td>
                      <td>{r.estadoFacturacion}</td>
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
            Ver guías del rango
          </Link>
          <Link className="btn btnPrimary" href="/guias/nueva">
            + Nueva guía
          </Link>
          <Link className="btn" href={`/reportes?tab=produccion&desde=${desde}&hasta=${hasta}`}>
            Ir a Producción
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
    {
      guiaIds: Set<string>;
      clientes: Set<string>;
      m3: number;
      totalMateriales: number;
      totalFletes: number;
      totalGanancia: number;
      pendiente: number;
    }
  >();

  const fletesSumadosPorDia = new Set<string>();

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const fecha = g.fecha ?? "";
    if (!fecha) continue;

    if (!byDay.has(fecha)) {
      byDay.set(fecha, {
        guiaIds: new Set(),
        clientes: new Set(),
        m3: 0,
        totalMateriales: 0,
        totalFletes: 0,
        totalGanancia: 0,
        pendiente: 0,
      });
    }

    const agg = byDay.get(fecha)!;
    agg.guiaIds.add(g.id);
    agg.clientes.add(getClientName(g));

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);
    const subtotal = m3 * precio;

    agg.m3 += m3;
    agg.totalMateriales += subtotal;

    if (String(g.estado_facturacion ?? "").toUpperCase() === "PENDIENTE") {
      agg.pendiente += subtotal;
    }

    if (!fletesSumadosPorDia.has(g.id)) {
      agg.totalFletes += safeNum(g.valor_flete);
      fletesSumadosPorDia.add(g.id);
    }

    agg.totalGanancia = agg.totalMateriales - agg.totalFletes;
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
        totalMateriales: v.totalMateriales,
        totalFletes: v.totalFletes,
        totalGanancia: v.totalGanancia,
        pendienteCLP: v.pendiente,
      };
    });

  const totalM3 = days.reduce((s, d) => s + d.m3, 0);
  const totalGuias = days.reduce((s, d) => s + d.guias, 0);
  const totalMateriales = days.reduce((s, d) => s + d.totalMateriales, 0);
  const totalFletes = days.reduce((s, d) => s + d.totalFletes, 0);
  const totalGanancia = days.reduce((s, d) => s + d.totalGanancia, 0);
  const totalPendiente = days.reduce((s, d) => s + d.pendienteCLP, 0);

  const best = [...days].sort((a, b) => b.m3 - a.m3)[0] ?? null;
  const worst = [...days].sort((a, b) => a.m3 - b.m3)[0] ?? null;

  return {
    days,
    totalM3,
    totalGuias,
    totalMateriales,
    totalFletes,
    totalGanancia,
    totalPendiente,
    best,
    worst,
  };
}

function buildResumenSemana(guias: GuiaRow[], items: ItemRow[], productosMap: Map<string, string>) {
  const guiaMap = new Map<string, GuiaRow>();
  for (const g of guias) guiaMap.set(g.id, g);

  const rows: ResumenSemanaRow[] = items
    .map((it) => {
      const g = guiaMap.get(it.guia_id);
      if (!g) return null;

      const cubos = safeNum(it.cantidad_m3);
      const precio = safeNum(it.precio_m3);
      const neto = cubos * precio;
      const flete = safeNum(g.valor_flete);
      const total = neto - flete;

      return {
        transporte: getTransporteName(g),
        empresa: getClientName(g),
        material: it.producto_id ? productosMap.get(it.producto_id) ?? "" : "",
        cubos,
        fecha: g.fecha ?? "",
        precio,
        neto,
        flete,
        total,
        report: g.numero ?? "-",
        chofer: g.chofer ?? "-",
        patente: g.patente ?? "-",
        pozoPago: pozoPagoLabel(g),
      };
    })
    .filter(Boolean) as ResumenSemanaRow[];

  return {
    rows,
    totalFilas: rows.length,
    totalM3: rows.reduce((s, r) => s + safeNum(r.cubos), 0),
    totalFletes: rows.reduce((s, r) => s + safeNum(r.flete), 0),
  };
}

function ProduccionTab({
  desde,
  hasta,
  data,
  resumenSemana,
}: {
  desde: string;
  hasta: string;
  data: ReturnType<typeof buildProduccionPorDia>;
  resumenSemana: ReturnType<typeof buildResumenSemana>;
}) {
  const maxM3 = Math.max(1, ...data.days.map((d) => d.m3));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Producción por día</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Tendencia diaria de m³, guías, clientes, materiales, fletes y ganancia.
        </div>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total m³ (rango)" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Guías (rango)" value={String(data.totalGuias)} />
          <KPI label="Total materiales" value={formatCLP(data.totalMateriales)} />
          <KPI label="Total fletes" value={formatCLP(data.totalFletes)} />
          <KPI label="Total ganancia" value={formatCLP(data.totalGanancia)} />
          <KPI label="Pendiente $" value={formatCLP(data.totalPendiente)} />
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
            <div className="muted">Se calcula desde materiales menos fletes por fecha</div>
          </div>

          <div className="section" style={{ paddingTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Fecha</th>
                  <th style={{ width: 140 }}>m³</th>
                  <th style={{ width: 90 }}>Guías</th>
                  <th style={{ width: 110 }}>Clientes</th>
                  <th style={{ width: 140 }}>Materiales</th>
                  <th style={{ width: 140 }}>Fletes</th>
                  <th style={{ width: 140 }}>Ganancia</th>
                  <th style={{ width: 140 }}>Pendiente $</th>
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
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.totalMateriales)}</td>
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.totalFletes)}</td>
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.totalGanancia)}</td>
                      <td style={{ fontWeight: 900 }}>{formatCLP(d.pendienteCLP)}</td>
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

        <div className="card" style={{ border: "1px solid var(--line)" }}>
          <div className="section">
            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Resumen de la semana</h3>
            <div className="muted" style={{ marginTop: 6 }}>
              Transporte, empresa, material, cubos, fecha, precio, neto, flete, total, report, chofer,
              patente y pozo/pago.
            </div>

            <div className="spacer" />

            <div className="row">
              <Link
                className="btn btnPrimary"
                href={`/reportes/camiones-export?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(
                  hasta
                )}`}
              >
                Descargar Resumen Semana
              </Link>
            </div>

            <div className="kpiGrid" style={{ marginTop: 16 }}>
              <KPI label="Filas detalle" value={String(resumenSemana.totalFilas)} />
              <KPI label="m³ detalle" value={formatNumber(resumenSemana.totalM3, 2)} />
              <KPI label="Total fletes" value={formatCLP(resumenSemana.totalFletes)} />
              <KPI label="Desde / Hasta" value={`${desde} → ${hasta}`} />
            </div>

            <div className="spacer" />

            <div className="card" style={{ border: "1px solid var(--line)" }}>
              <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 900 }}>Detalle de transportes</div>
                <div className="muted">Tabla completa con scroll horizontal</div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ minWidth: 1700 }}>
                  <thead>
                    <tr>
                      <th>TRANSPORTE</th>
                      <th>EMPRESA</th>
                      <th>MATERIAL</th>
                      <th>CUBOS</th>
                      <th>FECHA</th>
                      <th>PRECIO</th>
                      <th>NETO</th>
                      <th>FLETE</th>
                      <th>TOTAL</th>
                      <th>REPORT</th>
                      <th>CHOFER</th>
                      <th>PATENTE</th>
                      <th>POZO/PAGO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenSemana.rows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="muted" style={{ padding: 14 }}>
                          No hay datos en este rango.
                        </td>
                      </tr>
                    ) : (
                      resumenSemana.rows.map((r, idx) => (
                        <tr key={`${r.report}-${idx}`}>
                          <td>{r.transporte}</td>
                          <td style={{ fontWeight: 900 }}>{r.empresa}</td>
                          <td>{r.material}</td>
                          <td style={{ fontWeight: 900 }}>{formatNumber(r.cubos, 2)}</td>
                          <td>{r.fecha}</td>
                          <td>{formatCLP(r.precio)}</td>
                          <td style={{ fontWeight: 900 }}>{formatCLP(r.neto)}</td>
                          <td style={{ fontWeight: 900 }}>{formatCLP(r.flete)}</td>
                          <td style={{ fontWeight: 900 }}>{formatCLP(r.total)}</td>
                          <td>{r.report}</td>
                          <td>{r.chofer}</td>
                          <td>{r.patente}</td>
                          <td>{r.pozoPago}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
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

  return { totalM3, totalGuias };
}

function buildArigravResumen(guias: GuiaRow[], items: ItemRow[]) {
  const guiasArigrav = guias.filter((g) => getTransporteName(g).trim().toUpperCase() === "ARIGRAV");

  const detalleMap = new Map<string, ArigravDetalleRow>();

  for (const g of guiasArigrav) {
    detalleMap.set(g.id, {
      numeroGuia: g.numero ?? "-",
      faena: g.faena ?? "-",
      cliente: getClientName(g),
      chofer: g.chofer ?? "-",
      patente: g.patente ?? "-",
      m3: 0,
      totalMaterial: 0,
      viajes: 1,
    });
  }

  for (const it of items) {
    const row = detalleMap.get(it.guia_id);
    if (!row) continue;

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);

    row.m3 += m3;
    row.totalMaterial += m3 * precio;
  }

  const detalle = Array.from(detalleMap.values()).sort((a, b) =>
    String(a.numeroGuia).localeCompare(String(b.numeroGuia), "es", { numeric: true })
  );

  const resumenMap = new Map<string, ArigravChoferResumenRow>();

  for (const r of detalle) {
    const key = normName(r.chofer || "(sin chofer)");
    if (!resumenMap.has(key)) {
      resumenMap.set(key, {
        chofer: r.chofer || "(sin chofer)",
        viajes: 0,
        m3: 0,
        totalMaterial: 0,
      });
    }

    const agg = resumenMap.get(key)!;
    agg.viajes += 1;
    agg.m3 += safeNum(r.m3);
    agg.totalMaterial += safeNum(r.totalMaterial);
  }

  const resumenChofer = Array.from(resumenMap.values()).sort((a, b) => {
    if (b.viajes !== a.viajes) return b.viajes - a.viajes;
    return b.m3 - a.m3;
  });

  return {
    detalle,
    resumenChofer,
    totalViajes: detalle.reduce((s, r) => s + safeNum(r.viajes), 0),
    totalM3: detalle.reduce((s, r) => s + safeNum(r.m3), 0),
    totalMaterial: detalle.reduce((s, r) => s + safeNum(r.totalMaterial), 0),
  };
}

function buildFletesResumen(guias: GuiaRow[], items: ItemRow[]) {
  const detalleMap = new Map<string, FleteDetalleRow>();

  for (const g of guias) {
    const valorFlete = safeNum(g.valor_flete);

    if (valorFlete <= 0) continue;

    detalleMap.set(g.id, {
      numeroGuia: g.numero ?? "-",
      fecha: g.fecha ?? "-",
      cliente: getClientName(g),
      faena: g.faena ?? "-",
      transporte: getTransporteName(g),
      chofer: g.chofer ?? "-",
      patente: g.patente ?? "-",
      medioPago: medioPagoLabel(g.medio_pago),
      m3: 0,
      valorFlete,
      totalMaterial: 0,
      totalGanancia: 0,
    });
  }

  for (const it of items) {
    const row = detalleMap.get(it.guia_id);
    if (!row) continue;

    const m3 = safeNum(it.cantidad_m3);
    const precio = safeNum(it.precio_m3);

    row.m3 += m3;
    row.totalMaterial += m3 * precio;
    row.totalGanancia = row.totalMaterial - row.valorFlete;
  }

  const detalle = Array.from(detalleMap.values()).sort((a, b) => {
    if (a.fecha === b.fecha) {
      return String(a.numeroGuia).localeCompare(String(b.numeroGuia), "es", {
        numeric: true,
      });
    }
    return a.fecha.localeCompare(b.fecha);
  });

  const transporteMap = new Map<string, FleteResumenTransporteRow>();
  const choferMap = new Map<string, FleteResumenChoferRow>();

  for (const r of detalle) {
    if (safeNum(r.valorFlete) <= 0) continue;

    const keyT = (r.transporte || "SIN TRANSPORTE").trim().toUpperCase();
    if (!transporteMap.has(keyT)) {
      transporteMap.set(keyT, {
        transporte: r.transporte || "SIN TRANSPORTE",
        viajes: 0,
        m3: 0,
        totalFletes: 0,
      });
    }
    const aggT = transporteMap.get(keyT)!;
    aggT.viajes += 1;
    aggT.m3 += safeNum(r.m3);
    aggT.totalFletes += safeNum(r.valorFlete);

    const keyC = (r.chofer || "SIN CHOFER").trim().toUpperCase();
    if (!choferMap.has(keyC)) {
      choferMap.set(keyC, {
        chofer: r.chofer || "SIN CHOFER",
        viajes: 0,
        m3: 0,
        totalFletes: 0,
      });
    }
    const aggC = choferMap.get(keyC)!;
    aggC.viajes += 1;
    aggC.m3 += safeNum(r.m3);
    aggC.totalFletes += safeNum(r.valorFlete);
  }

  const resumenTransporte = Array.from(transporteMap.values()).sort((a, b) => b.totalFletes - a.totalFletes);

  const resumenChofer = Array.from(choferMap.values()).sort((a, b) => b.totalFletes - a.totalFletes);

  return {
    detalle,
    resumenTransporte,
    resumenChofer,
    totalViajes: detalle.length,
    totalM3: detalle.reduce((s, r) => s + safeNum(r.m3), 0),
    totalFletes: detalle.reduce((s, r) => s + safeNum(r.valorFlete), 0),
    totalMaterial: detalle.reduce((s, r) => s + safeNum(r.totalMaterial), 0),
  };
}

function CamionesTab({
  data,
  desde,
  hasta,
  arigrav,
  fletes,
}: {
  data: ReturnType<typeof buildCamionesChoferes>;
  desde: string;
  hasta: string;
  arigrav: ReturnType<typeof buildArigravResumen>;
  fletes: ReturnType<typeof buildFletesResumen>;
}) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Camiones / Choferes</h2>

        <div className="kpiGrid" style={{ marginTop: 16 }}>
          <KPI label="Total m³ transportados" value={formatNumber(data.totalM3, 2)} />
          <KPI label="Total guías (rango)" value={String(data.totalGuias)} />
        </div>

        <div className="spacer" />

        <div className="cardInner">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div>
              <div className="cardTitle" style={{ marginBottom: 4 }}>
                Resumen Transporte Arigrav
              </div>
              <div className="muted">Detalle de viajes Arigrav y resumen consolidado por chofer.</div>
            </div>

            <a
              className="btn btnPrimary"
              href={`/reportes/arigrav-export?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(
                hasta
              )}`}
            >
              Descargar Arigrav
            </a>
          </div>

          <div className="kpiGrid" style={{ marginBottom: 16 }}>
            <KPI label="Viajes Arigrav" value={String(arigrav.totalViajes)} />
            <KPI label="m³ Arigrav" value={formatNumber(arigrav.totalM3, 2)} />
            <KPI label="Total material" value={formatCLP(arigrav.totalMaterial)} />
            <KPI label="Choferes" value={String(arigrav.resumenChofer.length)} />
          </div>

          <div className="cardTitle">Detalle de viajes Arigrav</div>
          <table className="table">
            <thead>
              <tr>
                <th>N° guía</th>
                <th>Faena</th>
                <th>Cliente / Empresa</th>
                <th>Chofer</th>
                <th>Patente</th>
                <th style={{ textAlign: "right" }}>m³</th>
                <th style={{ textAlign: "right" }}>Total material</th>
                <th style={{ textAlign: "right" }}>Viajes</th>
              </tr>
            </thead>
            <tbody>
              {arigrav.detalle.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 14 }}>
                    Sin viajes Arigrav en este rango.
                  </td>
                </tr>
              ) : (
                arigrav.detalle.map((r, i) => (
                  <tr key={`${r.numeroGuia}-${r.patente}-${i}`}>
                    <td style={{ fontWeight: 900 }}>{r.numeroGuia}</td>
                    <td>{r.faena}</td>
                    <td>{r.cliente}</td>
                    <td>{r.chofer}</td>
                    <td>{r.patente}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalMaterial)}</td>
                    <td style={{ textAlign: "right" }}>{r.viajes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="spacer" />

          <div className="cardTitle">Resumen por chofer (Arigrav)</div>
          <table className="table">
            <thead>
              <tr>
                <th>Chofer</th>
                <th style={{ textAlign: "right" }}>Total viajes</th>
                <th style={{ textAlign: "right" }}>m³</th>
                <th style={{ textAlign: "right" }}>Total material</th>
              </tr>
            </thead>
            <tbody>
              {arigrav.resumenChofer.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted" style={{ padding: 14 }}>
                    Sin resumen por chofer.
                  </td>
                </tr>
              ) : (
                arigrav.resumenChofer.map((r) => (
                  <tr key={r.chofer}>
                    <td style={{ fontWeight: 900 }}>{r.chofer}</td>
                    <td style={{ textAlign: "right" }}>{r.viajes}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalMaterial)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="spacer" />

        <div className="cardInner">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div>
              <div className="cardTitle" style={{ marginBottom: 4 }}>
                Resumen de Fletes
              </div>
              <div className="muted">Detalle de fletes por guía y resumen agrupado por transporte y chofer.</div>
            </div>

            <a
              className="btn btnPrimary"
              href={`/reportes/fletes-export?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(
                hasta
              )}`}
            >
              Descargar Resumen Fletes
            </a>
          </div>

          <div className="kpiGrid" style={{ marginBottom: 16 }}>
            <KPI label="Viajes con flete" value={String(fletes.totalViajes)} />
            <KPI label="m³ total" value={formatNumber(fletes.totalM3, 2)} />
            <KPI label="Total fletes" value={formatCLP(fletes.totalFletes)} />
            <KPI label="Total material" value={formatCLP(fletes.totalMaterial)} />
          </div>

          <div className="cardTitle">Detalle de Fletes</div>
          <table className="table">
            <thead>
              <tr>
                <th>N° guía</th>
                <th>Fecha</th>
                <th>Cliente / Empresa</th>
                <th>Faena</th>
                <th>Transporte</th>
                <th>Chofer</th>
                <th>Patente</th>
                <th>Método pago</th>
                <th style={{ textAlign: "right" }}>m³</th>
                <th style={{ textAlign: "right" }}>Valor flete</th>
                <th style={{ textAlign: "right" }}>Total material</th>
                <th style={{ textAlign: "right" }}>Total ganancia</th>
              </tr>
            </thead>
            <tbody>
              {fletes.detalle.length === 0 ? (
                <tr>
                  <td colSpan={12} className="muted" style={{ padding: 14 }}>
                    Sin datos de fletes en este rango.
                  </td>
                </tr>
              ) : (
                fletes.detalle.map((r, i) => (
                  <tr key={`${r.numeroGuia}-${r.fecha}-${i}`}>
                    <td style={{ fontWeight: 900 }}>{r.numeroGuia}</td>
                    <td>{r.fecha}</td>
                    <td>{r.cliente}</td>
                    <td>{r.faena}</td>
                    <td>{r.transporte}</td>
                    <td>{r.chofer}</td>
                    <td>{r.patente}</td>
                    <td>{r.medioPago}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.valorFlete)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalMaterial)}</td>
                    <td style={{ textAlign: "right", fontWeight: 900 }}>{formatCLP(r.totalGanancia)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="spacer" />

          <div className="grid2">
            <div className="cardInner">
              <div className="cardTitle">Resumen por transporte</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Transporte</th>
                    <th style={{ textAlign: "right" }}>Viajes</th>
                    <th style={{ textAlign: "right" }}>m³</th>
                    <th style={{ textAlign: "right" }}>Total fletes</th>
                  </tr>
                </thead>
                <tbody>
                  {fletes.resumenTransporte.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: 14 }}>
                        Sin resumen por transporte.
                      </td>
                    </tr>
                  ) : (
                    fletes.resumenTransporte.map((r) => (
                      <tr key={r.transporte}>
                        <td style={{ fontWeight: 900 }}>{r.transporte}</td>
                        <td style={{ textAlign: "right" }}>{r.viajes}</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalFletes)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="cardInner">
              <div className="cardTitle">Resumen por chofer</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Chofer</th>
                    <th style={{ textAlign: "right" }}>Viajes</th>
                    <th style={{ textAlign: "right" }}>m³</th>
                    <th style={{ textAlign: "right" }}>Total fletes</th>
                  </tr>
                </thead>
                <tbody>
                  {fletes.resumenChofer.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: 14 }}>
                        Sin resumen por chofer.
                      </td>
                    </tr>
                  ) : (
                    fletes.resumenChofer.map((r) => (
                      <tr key={r.chofer}>
                        <td style={{ fontWeight: 900 }}>{r.chofer}</td>
                        <td style={{ textAlign: "right" }}>{r.viajes}</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{formatNumber(r.m3, 2)}</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{formatCLP(r.totalFletes)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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

  type ProdAgg = { producto: string; m3: number; guias: Set<string>; clientes: Set<string>; totalCLP: number };
  const byProd = new Map<string, ProdAgg>();

  for (const it of items) {
    const pid = it.producto_id ?? "";
    const nombre = pid ? productosMap.get(pid) ?? "(producto)" : "(producto)";
    const key = `${pid}:${nombre}`;

    if (!byProd.has(key)) {
      byProd.set(key, { producto: nombre, m3: 0, guias: new Set(), clientes: new Set(), totalCLP: 0 });
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

  return { totalM3, totalCLP, productosDistintos: rows.length, top10: rows.slice(0, 10) };
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
            <div className="muted">Ordenado por m³ (barra proporcional)</div>
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
            <div className="muted">Próximo upgrade: filtro por cliente + producto (“qué compra cada cliente”).</div>

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

  type CliAgg = { cliente: string; m3: number; totalCLP: number; guiaIds: Set<string>; productos: Set<string> };
  const byCliente = new Map<string, CliAgg>();

  for (const it of items) {
    const g = guiaMap.get(it.guia_id);
    if (!g) continue;

    const cliente = getClientName(g);

    if (!byCliente.has(cliente)) {
      byCliente.set(cliente, { cliente, m3: 0, totalCLP: 0, guiaIds: new Set(), productos: new Set() });
    }

    const agg = byCliente.get(cliente)!;

    const m3 = safeNum(it.cantidad_m3);
    const subtotal = m3 * safeNum(it.precio_m3);

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

  return { totalM3, totalCLP, clientesDistintos: rows.length, top10: rows.slice(0, 10) };
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
            <div className="muted">Próximo upgrade: “Cliente → detalle por producto”.</div>

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

  const allowedTabs: TabKey[] = ["facturacion", "produccion", "camiones", "productos", "clientes"];
  const tab: TabKey = allowedTabs.includes(sp.tab as TabKey) ? (sp.tab as TabKey) : "facturacion";

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
            <div className="muted">{e?.message ?? "Ocurrió un error al consultar la base de datos."}</div>

            <div className="spacer" />

            <Link className="btn" href="/guias">
              Volver a Guías
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const facturacion = buildFacturacion(guias, items, productosMap);
  const produccion = buildProduccionPorDia(guias, items);
  const resumenSemana = buildResumenSemana(guias, items, productosMap);
  const camiones = buildCamionesChoferes(guias, items);
  const arigrav = buildArigravResumen(guias, items);
  const fletes = buildFletesResumen(guias, items);
  const productos = buildProductos(guias, items, productosMap);
  const clientes = buildClientes(guias, items, productosMap);

  return (
    <div className="container">
      <h1 className="pageTitle">Reportes</h1>

      <Tabs tab={tab} desde={desde} hasta={hasta} />
      <RangeBox tab={tab} desde={desde} hasta={hasta} />

      {tab === "facturacion" && <FacturacionTab desde={desde} hasta={hasta} data={facturacion} />}
      {tab === "produccion" && (
        <ProduccionTab desde={desde} hasta={hasta} data={produccion} resumenSemana={resumenSemana} />
      )}
      {tab === "camiones" && (
        <CamionesTab data={camiones} desde={desde} hasta={hasta} arigrav={arigrav} fletes={fletes} />
      )}
      {tab === "productos" && <ProductosTab desde={desde} hasta={hasta} data={productos} />}
      {tab === "clientes" && <ClientesTab desde={desde} hasta={hasta} data={clientes} />}
    </div>
  );
}