import Link from "next/link";
import { supabase } from "@/lib/supabase";

type GuiaRow = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  patente: string | null;
  clientes?: { nombre: string } | null;
};

function fmtDateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function GuiasPage({
  searchParams,
}: {
  searchParams?: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const hoy = new Date();
  const desde = sp.desde ?? fmtDateISO(hoy);
  const hasta = sp.hasta ?? fmtDateISO(hoy);

  const { data, error } = await supabase
    .from("guias")
    .select("id, numero, fecha, faena, patente, clientes(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("numero", { ascending: false });

  const guias = (data ?? []) as GuiaRow[];

  return (
    <>
      <header className="header">
        <div className="headerInner">
          <div className="brand">
            <img className="brandLogo" src="/arigrav-logo.png" alt="ARIGRAV" />
            <div className="brandText">
              <div className="brandTitle">Sistema de Guías</div>
              <div className="brandSub">Planta PICHIL</div>
            </div>
          </div>

          <nav className="nav">
            <Link className="active" href="/guias">Guías</Link>
            <Link href="/guias/nueva">Nueva Guía</Link>
            <Link href="/reportes">Reportes</Link>
          </nav>
        </div>
      </header>

      <main className="container">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 className="pageTitle">Guías</h1>
          <Link className="btn btnPrimary" href="/guias/nueva">+ Nueva Guía</Link>
        </div>

        <div className="muted">
          Mostrando desde <b>{desde}</b> hasta <b>{hasta}</b>
        </div>

        <div className="spacer" />

        <div className="card">
          <div className="toolbar">
            <div className="muted" style={{ fontWeight: 800, marginBottom: 8 }}>Rango rápido</div>

            <div className="row">
              <Link className="btn" href={`/guias?desde=${fmtDateISO(new Date())}&hasta=${fmtDateISO(new Date())}`}>Hoy</Link>
              <Link
                className="btn"
                href={`/guias?desde=${fmtDateISO(new Date(Date.now() - 86400000))}&hasta=${fmtDateISO(new Date(Date.now() - 86400000))}`}
              >
                Ayer
              </Link>
              <Link
                className="btn"
                href={`/guias?desde=${fmtDateISO(new Date(Date.now() - 6 * 86400000))}&hasta=${fmtDateISO(new Date())}`}
              >
                Últimos 7 días
              </Link>
              <Link
                className="btn"
                href={`/guias?desde=${fmtDateISO(new Date(Date.now() - 29 * 86400000))}&hasta=${fmtDateISO(new Date())}`}
              >
                Últimos 30 días
              </Link>
            </div>
          </div>

          <div className="section">
            <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 900 }}>Listado</h2>

            {error ? (
              <div className="muted">Error cargando guías.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Faena</th>
                    <th>Patente</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {guias.map((g) => (
                    <tr key={g.id}>
                      <td><b>{g.numero ?? "-"}</b></td>
                      <td>{g.fecha ?? "-"}</td>
                      <td><b>{g.clientes?.nombre ?? "-"}</b></td>
                      <td>{g.faena ?? "-"}</td>
                      <td>{g.patente ?? "-"}</td>
                      <td>
                        <Link className="badgeLink" href={`/guias/${g.id}`}>Ver</Link>
                      </td>
                    </tr>
                  ))}
                  {guias.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">No hay guías en este rango.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}