"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ClienteEmbed = { nombre: string };

// Lo que REALMENTE puede venir desde Supabase (a veces array, a veces objeto)
type GuiaFromDb = {
  id: string;
  numero: any;
  fecha: any;
  faena: any;
  patente: any;
  clientes: ClienteEmbed[] | ClienteEmbed | null;
};

// El tipo que usamos dentro del componente (normalizado)
type Guia = {
  id: string;
  numero: string;
  fecha: string | null;
  faena: string | null;
  patente: string | null;
  clienteNombre: string;
};

function getClienteNombre(clientes: GuiaFromDb["clientes"]) {
  if (!clientes) return "(sin cliente)";
  if (Array.isArray(clientes)) return clientes[0]?.nombre ?? "(sin cliente)";
  return clientes.nombre ?? "(sin cliente)";
}

function toStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function GuiaDetalleClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [guia, setGuia] = useState<Guia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("guias")
          .select("id, numero, fecha, faena, patente, clientes(nombre)")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          if (!alive) return;
          setGuia(null);
          setLoading(false);
          return;
        }

        const row = data as unknown as GuiaFromDb;

        const normalized: Guia = {
          id: row.id,
          numero: toStr(row.numero),
          fecha: row.fecha ? String(row.fecha) : null,
          faena: row.faena ? String(row.faena) : null,
          patente: row.patente ? String(row.patente) : null,
          clienteNombre: getClienteNombre(row.clientes),
        };

        if (!alive) return;
        setGuia(normalized);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Error cargando guía.");
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) return <div className="muted">Cargando guía...</div>;

  if (error) {
    return (
      <div className="card">
        <div className="section">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Error</div>
          <div className="muted">{error}</div>
        </div>
      </div>
    );
  }

  if (!guia) return <div className="muted">No se encontró la guía.</div>;

  return (
    <div className="card">
      <div className="section">
        <div style={{ fontWeight: 900, fontSize: 18 }}>Guía #{guia.numero || guia.id}</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Cliente: <strong>{guia.clienteNombre}</strong>
        </div>

        <div className="spacer" />

        <div className="grid2">
          <div>
            <div className="muted">Fecha</div>
            <div style={{ fontWeight: 900 }}>{guia.fecha ?? "-"}</div>
          </div>

          <div>
            <div className="muted">Patente</div>
            <div style={{ fontWeight: 900 }}>{guia.patente ?? "-"}</div>
          </div>

          <div>
            <div className="muted">Faena</div>
            <div style={{ fontWeight: 900 }}>{guia.faena ?? "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}