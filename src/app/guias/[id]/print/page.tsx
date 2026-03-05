import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";

type Guia = {
  id: string;
  numero: number | null;
  fecha: string | null;
  faena: string | null;
  chofer: string | null;
  patente: string | null;
  medio_pago: string | null;
  clientes?: { nombre: string } | null;
};

type Item = {
  id: string;
  producto_id: string;
  cantidad_m3: number;
};

type Producto = {
  id: string;
  nombre: string;
};

function medioPagoChecks(v: string | null) {
  return {
    BANCO_CHILE: v === "BANCO_CHILE",
    BANCO_ESTADO: v === "BANCO_ESTADO",
    EFECTIVO: v === "EFECTIVO",
    CREDITO: v === "CREDITO",
  };
}

function fmtNum(n: number) {
  return Number(n).toFixed(2).replace(".", ",");
}

function nowChileHHMM() {
  // simple: usa hora local del navegador en impresión real, pero aquí SSR:
  // dejamos un placeholder. Si ya estás guardando hora_chile en DB, úsalo.
  return "";
}

export default async function PrintTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: guia, error: guiaErr } = await supabase
    .from("guias")
    .select("id, numero, fecha, faena, chofer, patente, medio_pago, clientes(nombre)")
    .eq("id", id)
    .single();

  if (guiaErr || !guia) return notFound();

  const { data: itemsData, error: itemsErr } = await supabase
    .from("guia_items")
    .select("id, producto_id, cantidad_m3")
    .eq("guia_id", id)
    .order("id", { ascending: true });

  const items = (itemsData ?? []) as Item[];

  const productoIds = Array.from(new Set(items.map((x) => x.producto_id))).filter(Boolean);
  let productosMap = new Map<string, string>();

  if (productoIds.length > 0) {
    const { data: prodsData } = await supabase
      .from("productos")
      .select("id, nombre")
      .in("id", productoIds);

    const prods = (prodsData ?? []) as Producto[];
    productosMap = new Map(prods.map((p) => [p.id, p.nombre]));
  }

  const g = guia as Guia;
  const checks = medioPagoChecks(g.medio_pago);

  const fecha = g.fecha ?? "";
  const hora = nowChileHHMM();

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          /* Ocultar todo lo no imprimible */
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            @page { margin: 6mm; }
          }

          /* Estilo ticket */
          body {
            font-family: Arial, Helvetica, sans-serif;
            background: #fff;
            color: #000;
          }
          .sheet {
            width: 72mm; /* 80mm impresora, pero dejamos margen */
            margin: 0 auto;
          }
          .ticket {
            width: 72mm;
            margin: 0 auto;
            padding: 0;
          }
          .center { text-align: center; }
          .logo {
            width: 34mm;
            margin: 0 auto 6px;
            display: block;
          }
          .title {
            font-weight: 800;
            letter-spacing: .3px;
            font-size: 13px;
            margin: 2px 0 2px;
          }
          .sub {
            font-size: 11px;
            margin: 0 0 6px;
          }
          .dash { border-top: 1px dashed #000; margin: 8px 0; }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 2px 0;
          }
          .label { font-weight: 700; }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          th {
            text-align: left;
            padding: 4px 0;
            border-bottom: 1px solid #000;
          }
          th:last-child, td:last-child { text-align: right; }
          td {
            padding: 4px 0;
            border-bottom: 1px dotted #bbb;
          }
          .mp {
            margin-top: 8px;
            font-size: 11px;
          }
          .mp-title {
            text-align: center;
            font-weight: 800;
            margin-bottom: 4px;
          }
          .chk-row { display:flex; gap:10px; align-items:center; margin: 2px 0; }
          .box {
            width: 10px; height: 10px;
            border: 1px solid #000;
            display: inline-flex;
            align-items:center;
            justify-content:center;
            font-size: 10px;
            line-height: 10px;
          }
          .sign {
            margin-top: 10px;
            text-align: center;
            font-size: 11px;
            font-weight: 800;
          }
          .sign-line {
            margin: 28px 0 8px;
            border-top: 1px solid #000;
          }
          .copies {
            font-size: 10px;
            margin-top: 6px;
            font-weight: 700;
          }
          .id {
            font-size: 9px;
            opacity: 0.85;
            margin-top: 6px;
          }

          /* separador para 3 copias */
          .cut {
            margin: 14px 0;
            border-top: 1px dashed #000;
          }
        `,
        }}
      />

      <div className="sheet">
        {["Copia 1: Cliente", "Copia 2: Planta", "Copia 3: Control Interno"].map(
          (copyLabel, idx) => (
            <div key={idx} className="ticket">
              <img src="/arigrav-logo.png" className="logo" alt="ARIGRAV" />

              <div className="center title">GUÍA ENTREGA ÁRIDOS</div>
              <div className="center sub">Planta: Osorno</div>

              <div className="dash" />

              <div className="row">
                <div>
                  <span className="label">Guía N°:</span> {g.numero ?? "-"}
                </div>
                <div>
                  {fecha} {hora ? `— ${hora} hrs` : ""}
                </div>
              </div>

              <div className="dash" />

              <div className="row">
                <div>
                  <span className="label">Cliente:</span> {g.clientes?.nombre ?? "-"}
                </div>
              </div>
              <div className="row">
                <div>
                  <span className="label">Faena:</span> {g.faena ?? "-"}
                </div>
              </div>

              <div className="dash" />

              <div className="center" style={{ fontWeight: 800, fontSize: 11 }}>
                DETALLE DE MATERIAL (m³)
              </div>

              <table>
                <thead>
                  <tr>
                    <th>PRODUCTO</th>
                    <th>CANTIDAD</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ paddingTop: 6 }}>
                        No hay productos asociados.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const nombre = productosMap.get(it.producto_id) ?? "(producto)";
                      return (
                        <tr key={it.id}>
                          <td>{nombre}</td>
                          <td>{fmtNum(it.cantidad_m3)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              <div className="dash" />

              <div className="row">
                <div>
                  <span className="label">Chofer:</span> {g.chofer ?? "-"}
                </div>
              </div>
              <div className="row">
                <div>
                  <span className="label">Patente:</span> {g.patente ?? "-"}
                </div>
              </div>

              <div className="dash" />

              <div className="mp">
                <div className="mp-title">Medio de Pago:</div>

                <div className="chk-row">
                  <span className="box">{checks.BANCO_CHILE ? "✓" : ""}</span> Banco de Chile
                </div>
                <div className="chk-row">
                  <span className="box">{checks.BANCO_ESTADO ? "✓" : ""}</span> Banco Estado
                </div>
                <div className="chk-row">
                  <span className="box">{checks.EFECTIVO ? "✓" : ""}</span> Efectivo
                </div>
                <div className="chk-row">
                  <span className="box">{checks.CREDITO ? "✓" : ""}</span> Crédito
                </div>
              </div>

              <div className="dash" />

              <div className="sign">Firma Recepción:</div>
              <div className="sign-line" />

              <div className="copies">{copyLabel}</div>
              <div className="id">ID: {g.id}</div>

              {idx < 2 ? <div className="cut" /> : null}
            </div>
          )
        )}
      </div>

      {/* Auto-print + auto-close (si ya lo estabas usando, esto lo deja perfecto) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          window.addEventListener('load', () => {
            setTimeout(() => window.print(), 300);
            window.addEventListener('afterprint', () => {
              setTimeout(() => window.close(), 200);
            });
          });
        `,
        }}
      />
    </>
  );
}