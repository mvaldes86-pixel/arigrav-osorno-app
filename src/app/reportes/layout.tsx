import Link from "next/link";

export default function ReportesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="pageTitle" style={{ marginBottom: 4 }}>Reportes</h1>
          <div className="muted">Selecciona el tipo de reporte</div>
        </div>

        <Link className="btn btnGhost" href="/guias">
          ← Volver a Guías
        </Link>
      </div>

      <div className="spacer" />

      <div className="card">
        <div className="toolbar">
          <div className="tabs">
            <Link className="tab" href="/reportes/dashboard">
              Dashboard
            </Link>
            <Link className="tab" href="/reportes/facturacion">
              Facturación
            </Link>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Tip: si quieres, después agregamos más pestañas (Camiones/Choferes, Productos, Escombrera, etc.) sin tocar el diseño.
          </div>
        </div>

        <div className="section">{children}</div>
      </div>
    </div>
  );
}