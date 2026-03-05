"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cliente = {
  id: string;
  nombre: string;
};

export default function ClienteSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarClientes();
  }, []);

  async function cargarClientes() {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre")
      .order("nombre", { ascending: true });

    if (!error) setClientes((data ?? []) as Cliente[]);
  }

  async function crearCliente() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombre })
      .select("id, nombre")
      .single();

    setLoading(false);

    if (error || !data) {
      alert(`Error creando cliente: ${error?.message ?? "desconocido"}`);
      return;
    }

    // Actualiza lista y selecciona automáticamente el nuevo cliente
    setClientes((prev) => {
      const next = [...prev, data as Cliente];
      next.sort((a, b) => a.nombre.localeCompare(b.nombre));
      return next;
    });

    onChange((data as Cliente).id);
    setNuevoNombre("");
    setModoNuevo(false);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontWeight: 600 }}>Cliente</label>

      {!modoNuevo ? (
        <div style={{ display: "grid", gap: 8 }}>
          <select
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__nuevo__") {
                setModoNuevo(true);
              } else {
                onChange(v);
              }
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d0d5dd",
              background: "#fff",
            }}
          >
            <option value="">Seleccionar cliente</option>

            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}

            <option value="__nuevo__">➕ Agregar cliente nuevo</option>
          </select>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del cliente (ej: Constructora Sur)"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d0d5dd",
              background: "#fff",
            }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={crearCliente}
              disabled={loading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #0b5ed7",
                background: "#0b5ed7",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {loading ? "Guardando..." : "Guardar cliente"}
            </button>

            <button
              type="button"
              onClick={() => {
                setModoNuevo(false);
                setNuevoNombre("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d0d5dd",
                background: "#fff",
                color: "#111",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}