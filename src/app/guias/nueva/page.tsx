"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Cliente = { id: string; nombre: string };
type Producto = { id: string; nombre: string };

type ItemDraft = {
  producto_id: string;
  cantidad_m3: string; // input text
  precio_m3: string; // input text
};

const MEDIOS_PAGO = [
  { value: "BANCO_CHILE", label: "Banco de Chile" },
  { value: "BANCO_ESTADO", label: "Banco Estado" },
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CREDITO", label: "Crédito" },
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
] as const;

const SECTORES = [
  { value: "PLANTA", label: "Planta" },
  { value: "ESCOMBRERA", label: "Escombrera" },
  { value: "POZO", label: "Pozo" },
] as const;

function todayChileYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNumberSafe(v: string) {
  const x = v.replace(",", ".").trim();
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
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
  hint: {
    fontSize: 12,
    color: "rgba(31,42,68,.65)",
    marginTop: 6,
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
  btnGhost: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #cfd7e6",
    background: "#fff",
    color: "#0b1220",
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
  },
};

export default function NuevaGuiaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  const [fecha, setFecha] = useState(todayChileYYYYMMDD());
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteManual, setClienteManual] = useState<string>("");

  const [faena, setFaena] = useState("");
  const [chofer, setChofer] = useState("");
  const [patente, setPatente] = useState("");

  const [medioPago, setMedioPago] =
    useState<(typeof MEDIOS_PAGO)[number]["value"]>("EFECTIVO");
  const [tipoOperacion, setTipoOperacion] =
    useState<(typeof TIPOS_OPERACION)[number]["value"]>("VENTA_ARIDOS");
  const [estadoFacturacion, setEstadoFacturacion] =
    useState<(typeof ESTADOS_FACT)[number]["value"]>("PENDIENTE");
  const [sector, setSector] =
    useState<(typeof SECTORES)[number]["value"]>("PLANTA");

  const [items, setItems] = useState<ItemDraft[]>([
    { producto_id: "", cantidad_m3: "", precio_m3: "" },
  ]);

  useEffect(() => {
    const load = async () => {
      const c = await supabase
        .from("clientes")
        .select("id, nombre")
        .order("nombre", { ascending: true });
      if (c.error) console.error("Supabase error clientes:", c.error);
      else setClientes((c.data ?? []) as Cliente[]);

      const p = await supabase
        .from("productos")
        .select("id, nombre")
        .order("nombre", { ascending: true });
      if (p.error) console.error("Supabase error productos:", p.error);
      else setProductos((p.data ?? []) as Producto[]);
    };
    load();
  }, []);

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

      const clienteNombreManual = clienteManual.trim();
      let finalClienteId = clienteId;

      if (!finalClienteId && !clienteNombreManual) {
        alert("Selecciona un cliente o escribe uno nuevo.");
        return;
      }
      if (!faena.trim()) {
        alert("Faena es obligatoria.");
        return;
      }
      if (!chofer.trim()) {
        alert("Chofer es obligatorio.");
        return;
      }
      if (!patente.trim()) {
        alert("Patente es obligatoria.");
        return;
      }

      const cleanItems = items
        .map((it) => ({
          producto_id: it.producto_id,
          cantidad_m3: toNumberSafe(it.cantidad_m3),
          precio_m3: toNumberSafe(it.precio_m3),
        }))
        .filter((it) => it.producto_id && it.cantidad_m3 > 0);

      if (cleanItems.length === 0) {
        alert("Debes ingresar al menos 1 producto con cantidad > 0.");
        return;
      }

      if (!finalClienteId && clienteNombreManual) {
        const insC = await supabase
          .from("clientes")
          .insert({ nombre: clienteNombreManual })
          .select("id")
          .single();

        if (insC.error || !insC.data?.id) {
          console.error("Supabase error insert cliente:", insC.error);
          alert("No se pudo crear el cliente nuevo.");
          return;
        }

        finalClienteId = insC.data.id;
        setClientes((prev) => [{ id: finalClienteId!, nombre: clienteNombreManual }, ...prev]);
        setClienteId(finalClienteId);
        setClienteManual("");
      }

      const guiaPayload: any = {
        fecha,
        cliente_id: finalClienteId,
        faena: faena.trim(),
        chofer: chofer.trim(),
        patente: patente.trim(),
        medio_pago: medioPago,
        tipo_operacion: tipoOperacion,
        estado_facturacion: estadoFacturacion,
        sector,
        total: Number(total.toFixed(2)),
        usuario: "operador",
      };

      const g = await supabase.from("guias").insert(guiaPayload).select("id").single();

      if (g.error || !g.data?.id) {
        console.error("Supabase error insert guia:", g.error);
        alert("No se pudo guardar la guía.");
        return;
      }

      const guiaId = g.data.id as string;

      const itemsPayload = cleanItems.map((it) => ({
        guia_id: guiaId,
        producto_id: it.producto_id,
        cantidad_m3: it.cantidad_m3,
        precio_m3: it.precio_m3,
        subtotal: Number((it.cantidad_m3 * it.precio_m3).toFixed(2)),
      }));

      const insItems = await supabase.from("guia_items").insert(itemsPayload);

      if (insItems.error) {
        console.error("Supabase error insert items:", insItems.error);
        alert("La guía se guardó, pero falló el detalle de items.");
        router.push(`/guias/${guiaId}`);
        return;
      }

      router.push(`/guias/${guiaId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.h1}>Nueva Guía</h1>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Datos de la guía</div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>Fecha</div>
              <input
                style={styles.input}
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Medio de Pago</div>
              <select
                style={styles.select}
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as any)}
              >
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Cliente</div>
              <select
                style={styles.select}
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">— Seleccionar —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <div style={styles.hint}>Si no está en la lista, escríbelo a la derecha.</div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Cliente nuevo (manual)</div>
              <input
                style={styles.input}
                placeholder="Ej: Constructora X"
                value={clienteManual}
                onChange={(e) => setClienteManual(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Faena</div>
              <input
                style={styles.input}
                placeholder="Ej: Pilauco / Ruta / Obra..."
                value={faena}
                onChange={(e) => setFaena(e.target.value)}
              />
            </div>
          </div>

          <div style={{ ...styles.grid3, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Tipo operación</div>
              <select
                style={styles.select}
                value={tipoOperacion}
                onChange={(e) => setTipoOperacion(e.target.value as any)}
              >
                {TIPOS_OPERACION.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Estado facturación</div>
              <select
                style={styles.select}
                value={estadoFacturacion}
                onChange={(e) => setEstadoFacturacion(e.target.value as any)}
              >
                {ESTADOS_FACT.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Sector</div>
              <select
                style={styles.select}
                value={sector}
                onChange={(e) => setSector(e.target.value as any)}
              >
                {SECTORES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            <div style={styles.field}>
              <div style={styles.label}>Chofer</div>
              <input
                style={styles.input}
                placeholder="Nombre chofer"
                value={chofer}
                onChange={(e) => setChofer(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <div style={styles.label}>Patente</div>
              <input
                style={styles.input}
                placeholder="Ej: AB-CD-12"
                value={patente}
                onChange={(e) => setPatente(e.target.value)}
              />
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
                  placeholder="Ej: 12"
                  value={it.cantidad_m3}
                  onChange={(e) => setItem(idx, { cantidad_m3: e.target.value })}
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Precio (por m³)</div>
                <input
                  style={styles.input}
                  placeholder="Ej: 8500"
                  value={it.precio_m3}
                  onChange={(e) => setItem(idx, { precio_m3: e.target.value })}
                />
              </div>

              <button
                type="button"
                onClick={() => onRemoveItem(idx)}
                style={styles.removeBtn}
                disabled={items.length === 1}
                title={items.length === 1 ? "Debe existir al menos un ítem" : "Eliminar"}
              >
                ✕
              </button>
            </div>
          ))}

          <div style={styles.totalBox}>
            <div style={styles.totalInner}>
              <div style={styles.totalLabel}>Total guía</div>
              <div style={styles.totalValue}>
                ${Math.round(total).toLocaleString("es-CL")}
              </div>
            </div>
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              onClick={() => router.push("/guias")}
              style={styles.btnGhost}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={onGuardar}
              style={styles.btnPrimary}
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar Guía"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}