"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ClienteJoin = { nombre: string };

type Guia = {
  id: string;
  numero?: number | null;
  fecha?: string | null; // YYYY-MM-DD
  faena?: string | null;
  patente?: string | null;

  // ✅ FIX: en tu data viene como ARRAY (clientes: [{nombre}])
  // pero a veces puede venir como objeto según relación. Soportamos ambos.
  clientes?: ClienteJoin | ClienteJoin[] | null;
};

function getClienteNombre(guia: Guia) {
  const c = guia.clientes;

  if (!c) return "(sin cliente)";

  // si es arreglo
  if (Array.isArray(c)) return c[0]?.nombre ?? "(sin cliente)";

  // si es objeto
  return c.nombre ?? "(sin cliente)";
}

export default function GuiaDetalleClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guia, setGuia] = useState<Guia | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("guias")
        .select("id, numero, fecha, faena, patente, clientes(nombre)")
        .eq("id", id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setError(error.message);
        setGuia(null);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("No se encontró la guía.");
        setGuia(null);
        setLoading(false);
        return;
      }

      // ✅ FIX: no casteamos "as Guia" a lo bruto; armamos el objeto tipado
      const g: Guia = {
        id: String((data as any).id),
        numero: (data as any).numero ?? null,
        fecha: (data as any).fecha ?? null,
        faena: (data as any).faena ?? null,
        patente: (data as any).patente ?? null,
        clientes: (data as any).clientes ?? null,
      };

      setGuia(g);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="card">
        <div className="section">
          <div style={{ fontWeight: 900 }}>Cargando guía…</div>
          <div className="muted">Espera un momento.</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="section">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Error</div>
          <div className="muted">{error}</div>

          <div className="spacer" />

          <Link className="btn" href="/guias">
            ← Volver a Guías
          </Link>
        </div>
      </div>
    );
  }

  if (!guia) return null;

  return (
    <div className="card">
      <div className="section">
        <div className="toolbar">
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              Guía #{guia.numero ?? "-"}
            </div>
            <div className="muted">
              Cliente: <strong>{getClienteNombre(guia)}</strong>
            </div>
          </div>

          <div className="row">
            <Link className="btn" href="/guias">
              ← Volver
            </Link>
          </div>
        </div>

        <div className="spacer" />

        <div className="grid2">
          <div className="cardInner">
            <div className="cardTitle">Datos</div>
            <div className="muted">Fecha: <strong>{guia.fecha ?? "-"}</strong></div>
            <div className="muted">Faena: <strong>{guia.faena ?? "-"}</strong></div>
            <div className="muted">Patente: <strong>{guia.patente ?? "-"}</strong></div>
          </div>

          <div className="cardInner">
            <div className="cardTitle">Acciones</div>
            <div className="row">
              <Link className="btn btnPrimary" href={`/guias/${id}/editar`}>
                Editar
              </Link>
              <Link className="btn" href={`/guias/${id}/imprimir`}>
                Imprimir
              </Link>
            </div>
            <div className="spacer" />
            <div className="muted">
              Nota: este fix evita fallas de build por el join de clientes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}