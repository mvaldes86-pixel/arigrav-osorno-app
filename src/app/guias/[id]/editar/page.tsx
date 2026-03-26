"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Cliente = { id: string; nombre: string };
type Producto = { id: string; nombre: string };
type Transporte = { id: string; nombre: string };

type GuiaRow = {
  id: string;
  fecha: string | null;
  cliente_id: string | null;
  transporte_id: string | null;
  valor_flete: number | null;
  faena: string | null;
  orden_compra: string | null;
  chofer: string | null;
  patente: string | null;
  medio_pago: string | null;
  tipo_operacion: string | null;
  estado_facturacion: string | null;
  sector: string | null;
  total: number | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  producto_id: string | null;
  cantidad_m3: number | null;
  precio_m3: number | null;
};

type ItemDraft = {
  id?: string;
  producto_id: string;
  cantidad_m3: string;
  precio_m3: string;
};

const MEDIOS_PAGO = [
  { value: "CREDITO", label: "Crédito" },
  { value: "BANCO_CHILE", label: "Pagado Banco de Chile" },
  { value: "BANCO_ESTADO", label: "Pagado Banco Estado" },
  { value: "EFECTIVO", label: "Efectivo" },
] as const;

const TIPOS_OPERACION = [
  { value: "VENTA_ARIDOS", label: "Venta Áridos" },
  { value: "RETIRO_ESCOMBROS", label: "Retiro Escombros" },
  { value: "TRASLADO_INTERNO", label: "Traslado Interno" },
] as const;

const ESTADOS_FACT = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "FACTURADO", label: "Facturado" },
  { value: "PAGADO", label: "Pagado" },
  { value: "ANULADA", label: "Anulada" },
] as const;

const SECTORES = [
  { value: "POZO", label: "Pozo" },
  { value: "ESCOMBRERA", label: "Escombrera" },
] as const;

function toNumberSafe(v: string) {
  const x = String(v ?? "").replace(",", ".").trim();
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    background: "#f4f6f9",
    minHeight: "calc(100vh - 80px)",
  },
  wrap: {
    maxWidth: 980,
    margin: "0 auto",
  },
  h1: {
    fontSize: 34,
    fontWeight: 800,
    margin: "6px 0 18px",
    color: "#0b1220",
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 18,
    border: "1px solid #e6eaf2",
    boxShadow: "0 6px 22px rgba(15, 23, 42, 0.06)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: "0 0 12px",
    color: "#0b1220",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1f2a44",
  },
  input: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #d7deea",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
  },
  select: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #d7deea",
    padding: "0 12px",
    fontSize: 14,
    background: "#fff",
    outline: "none",
  },
  divider: {
    height: 1,
    background: "#e8edf6",
    margin: "14px 0",
  },
  itemsTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  btn: {
    height: 40,
    borderRadius: 10,
    border: "1px solid #cfd7e6",
    background: "#fff",
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  btnPrimary: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 800,
  },
  btnDanger: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #991b1b",
    background: "#fff",
    color: "#991b1b",
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 800,
  },
  itemRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 0.8fr 44px",
    gap: 10,
    alignItems: "end",
    padding: "10px 0",
    borderBottom: "1px solid #eef2f8",
  },
  removeBtn: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #d7deea",
    background: "#f8fafc",
    cursor: "pointer",
    fontWeight: 900,
  },
  totalBox: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  totalInner: {
    textAlign: "right",
    padding: "10px 12px",
    borderRadius: 12,
    background: "#0b1220",
    color: "#fff",
    minWidth: 240,
  },
  totalLabel: {
    fontSize: 12,
    opacity: 0.85,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  actions: {
    display: "flex",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
  },
};

export default function EditarGuiaPage() {
  const params = useParams();
  const router = useRouter();
  const guiaId = String(params.id);

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [transportes, setTransportes] = useState<Transporte[]>([]);

  const [fecha, setFecha] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [transporteId, setTransporteId] = useState("");
  const [valorFlete, setValorFlete] = useState("");
  const [faena, setFaena] = useState("");
  const [ordenCompra, setOrdenCompra] = useState("");
  const [chofer, setChofer] = useState("");
  const [patente, setPatente] = useState("");
  const [medioPago, setMedioPago] = useState("CREDITO");
  const [tipoOperacion, setTipoOperacion] = useState("VENTA_ARIDOS");
  const [estadoFacturacion, setEstadoFacturacion] = useState("PENDIENTE");
  const [sector, setSector] = useState("POZO");
  const [items, setItems] = useState<ItemDraft[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);

      const [c, p, t, g, gi] = await Promise.all([
        supabase.from("clientes").select("id, nombre").order("nombre", { ascending: true }),
        supabase.from("productos").select("id, nombre").order("nombre", { ascending: true }),
        supabase.from("transportes").select("id, nombre").order("nombre", { ascending: true }),
        supabase.from("guias").select("*").eq("id", guiaId).single(),
        supabase
          .from("guia_items")
          .select("id, guia_id, producto_id, cantidad_m3, precio_m3")
          .eq("guia_id", guiaId),
      ]);

      if (c.data) setClientes(c.data as Cliente[]);
      if (p.data) setProductos(p.data as Producto[]);
      if (t.data) setTransportes(t.data as Transporte[]);

      if (g.error || !g.data) {
        alert("No se pudo cargar la guía.");
        router.push("/guias");
        return;
      }

      const guia = g.data as GuiaRow;
      setFecha(guia.fecha ?? "");
      setClienteId(guia.cliente_id ?? "");
      setTransporteId(guia.transporte_id ?? "");
      setValorFlete(String(guia.valor_flete ?? ""));
      setFaena(guia.faena ?? "");
      setOrdenCompra(guia.orden_compra ?? "");
      setChofer(guia.chofer ?? "");
      setPatente(guia.patente ?? "");
      setMedioPago(guia.medio_pago ?? "CREDITO");
      setTipoOperacion(guia.tipo_operacion ?? "VENTA_ARIDOS");
      setEstadoFacturacion(guia.estado_facturacion ?? "PENDIENTE");
      setSector(guia.sector ?? "POZO");

      const itemsRows = ((gi.data ?? []) as ItemRow[]).map((it) => ({
        id: it.id,
        producto_id: it.producto_id ?? "",
        cantidad_m3: String(it.cantidad_m3 ?? ""),
        precio_m3: String(it.precio_m3 ?? ""),
      }));

      setItems(itemsRows.length > 0 ? itemsRows : [{ producto_id: "", cantidad_m3: "", precio_m3: "" }]);
      setLoadingData(false);
    };

    load();
  }, [guiaId, router]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      const cant = toNumberSafe(it.cantidad_m3);
      const precio = toNumberSafe(it.precio_m3);
      return acc + cant * precio;
    }, 0);
  }, [items]);

  const onAddItem = () => {
    setItems((prev) => [...prev, { producto_id: "", cantidad_m3: "", precio_m3: "" }]);
  };

  const onRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const setItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const onGuardar = async () => {
    try {
      setLoading(true);

      const cleanItems = items
        .map((it) => ({
          id: it.id,
          producto_id: it.producto_id,
          cantidad_m3: toNumberSafe(it.cantidad_m3),
          precio_m3: toNumberSafe(it.precio_m3),
        }))
        .filter((it) => it.producto_id && it.cantidad_m3 > 0);

      if (cleanItems.length === 0) {
        alert("Debes dejar al menos un producto con cantidad > 0.");
        return;
      }

      const guiaPayload = {
        fecha,
        cliente_id: clienteId || null,
        transporte_id: transporteId || null,
        valor_flete: Number(toNumberSafe(valorFlete).toFixed(2)),
        faena: normalizeText(faena),
        orden_compra: normalizeText(ordenCompra),
        chofer: normalizeText(chofer),
        patente: normalizeText(patente).toUpperCase(),
        medio_pago: medioPago,
        tipo_operacion: tipoOperacion,
        estado_facturacion: estadoFacturacion,
        sector,
        total: Number(total.toFixed(2)),
      };

      const upd = await supabase.from("guias").update(guiaPayload).eq("id", guiaId);
      if (upd.error) {
        alert(`No se pudo actualizar la guía: ${upd.error.message}`);
        return;
      }

      const del = await supabase.from("guia_items").delete().eq("guia_id", guiaId);
      if (del.error) {
        alert(`No se pudieron actualizar los items: ${del.error.message}`);
        return;
      }

      const ins = await supabase.from("guia_items").insert(
        cleanItems.map((it) => ({
          guia_id: guiaId,
          producto_id: it.producto_id,
          cantidad_m3: it.cantidad_m3,
          precio_m3: it.precio_m3,
          subtotal: Number((it.cantidad_m3 * it.precio_m3).toFixed(2)),
        }))
      );

      if (ins.error) {
        alert(`No se pudieron guardar los items: ${ins.error.message}`);
        return;
      }

      router.push(`/guias/${guiaId}`);
    } finally {
      setLoading(false);
    }
  };

  const onAnular = async () => {
    const ok = window.confirm("¿Seguro que quieres marcar esta guía como ANULADA?");
    if (!ok) return;

    setLoading(true);
    const upd = await supabase
      .from("guias")
      .update({ estado_facturacion: "ANULADA" })
      .eq("id", guiaId);

    setLoading(false);

    if (upd.error) {
      alert(`No se pudo anular la guía: ${upd.error.message}`);
      return;
    }

    router.push(`/guias/${guiaId}`);
    router.refresh();
  };

  if (loadingData) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <h1 style={styles.h1}>Editar Guía</h1>
          <div style={styles.card}>Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.h1}>Editar Guía</h1>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Datos de la guía</div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>Fecha</div>
              <input style={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Medio de Pago</div>
              <select style={styles.select} value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...styles.grid3, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Cliente</div>
              <select style={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Transporte</div>
              <select style={styles.select} value={transporteId} onChange={(e) => setTransporteId(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {transportes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Valor flete</div>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={valorFlete}
                onChange={(e) => setValorFlete(e.target.value)}
              />
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Faena</div>
              <input style={styles.input} value={faena} onChange={(e) => setFaena(e.target.value)} />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Orden de Compra (OC)</div>
              <input
                style={styles.input}
                placeholder="Ej: OC-10234"
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
              />
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Chofer</div>
              <input style={styles.input} value={chofer} onChange={(e) => setChofer(e.target.value)} />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Patente</div>
              <input style={styles.input} value={patente} onChange={(e) => setPatente(e.target.value)} />
            </div>
          </div>

          <div style={{ ...styles.grid3, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Tipo operación</div>
              <select style={styles.select} value={tipoOperacion} onChange={(e) => setTipoOperacion(e.target.value)}>
                {TIPOS_OPERACION.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Sector</div>
              <select style={styles.select} value={sector} onChange={(e) => setSector(e.target.value)}>
                {SECTORES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Estado facturación</div>
              <select
                style={styles.select}
                value={estadoFacturacion}
                onChange={(e) => setEstadoFacturacion(e.target.value)}
              >
                {ESTADOS_FACT.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Total actual</div>
              <input style={styles.input} value={formatCLP(total)} readOnly />
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.itemsTop}>
            <div style={styles.sectionTitle}>Detalle de Material</div>
            <button type="button" onClick={onAddItem} style={styles.btn}>
              + Agregar producto
            </button>
          </div>

          {items.map((it, idx) => (
            <div key={idx} style={styles.itemRow}>
              <div style={styles.field}>
                <div style={styles.label}>Producto</div>
                <select
                  style={styles.select}
                  value={it.producto_id}
                  onChange={(e) => setItem(idx, { producto_id: e.target.value })}
                >
                  <option value="">— Seleccionar —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Cantidad (m³)</div>
                <input
                  style={styles.input}
                  value={it.cantidad_m3}
                  onChange={(e) => setItem(idx, { cantidad_m3: e.target.value })}
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Precio (por m³)</div>
                <input
                  style={styles.input}
                  value={it.precio_m3}
                  onChange={(e) => setItem(idx, { precio_m3: e.target.value })}
                />
              </div>

              <button
                type="button"
                onClick={() => onRemoveItem(idx)}
                style={styles.removeBtn}
                disabled={items.length === 1}
              >
                ✕
              </button>
            </div>
          ))}

          <div style={styles.totalBox}>
            <div style={styles.totalInner}>
              <div style={styles.totalLabel}>Total guía</div>
              <div style={styles.totalValue}>{formatCLP(total)}</div>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={() => router.push(`/guias/${guiaId}`)} style={styles.btn}>
              Cancelar
            </button>

            <button type="button" onClick={onGuardar} style={styles.btnPrimary} disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>

            <button type="button" onClick={onAnular} style={styles.btnDanger} disabled={loading}>
              Marcar como anulada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}