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

  const { data: itemsData } = await supabase
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

  const g = guia as unknown as Guia;
  const checks = medioPagoChecks(g.medio_pago);

  const copias = [
    "Copia 1: Cliente",
    "Copia 2: Planta",
    "Copia 3: Control Interno",
  ];

  return (
    <>
      <main className="printSheet">
        {copias.map((copyLabel, idx) => (
          <section key={idx} className={`ticketCopy ${idx < copias.length - 1 ? "pageBreak" : ""}`}>
            <img src="/arigrav-logo.png" className="ticketLogo" alt="ARIGRAV" />

            <div className="ticketCenter ticketTitle">GUÍA ENTREGA ÁRIDOS</div>
            <div className="ticketCenter ticketSub">Planta: Osorno</div>

            <div className="ticketDash" />

            <div className="ticketRow">
              <div>
                <span className="ticketLabel">Guía N°:</span> {g.numero ?? "-"}
              </div>
              <div>{g.fecha ?? "-"}</div>
            </div>

            <div className="ticketDash" />

            <div className="ticketRow">
              <div>
                <span className="ticketLabel">Cliente:</span> {g.clientes?.nombre ?? "-"}
              </div>
            </div>

            <div className="ticketRow">
              <div>
                <span className="ticketLabel">Faena:</span> {g.faena ?? "-"}
              </div>
            </div>

            <div className="ticketDash" />

            <div className="ticketCenter ticketSectionTitle">DETALLE DE MATERIAL (m³)</div>

            <table className="ticketTable">
              <thead>
                <tr>
                  <th>PRODUCTO</th>
                  <th>CANTIDAD</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={2}>No hay productos asociados.</td>
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

            <div className="ticketDash" />

            <div className="ticketRow">
              <div>
                <span className="ticketLabel">Chofer:</span> {g.chofer ?? "-"}
              </div>
            </div>

            <div className="ticketRow">
              <div>
                <span className="ticketLabel">Patente:</span> {g.patente ?? "-"}
              </div>
            </div>

            <div className="ticketDash" />

            <div className="ticketPay">
              <div className="ticketPayTitle">Medio de Pago:</div>

              <div className="ticketCheckRow">
                <span className="ticketBox">{checks.BANCO_CHILE ? "✓" : ""}</span>
                Banco de Chile
              </div>
              <div className="ticketCheckRow">
                <span className="ticketBox">{checks.BANCO_ESTADO ? "✓" : ""}</span>
                Banco Estado
              </div>
              <div className="ticketCheckRow">
                <span className="ticketBox">{checks.EFECTIVO ? "✓" : ""}</span>
                Efectivo
              </div>
              <div className="ticketCheckRow">
                <span className="ticketBox">{checks.CREDITO ? "✓" : ""}</span>
                Crédito
              </div>
            </div>

            <div className="ticketDash" />

            <div className="ticketSignTitle">Firma Recepción:</div>
            <div className="ticketSignLine" />

            <div className="ticketCopyLabel">{copyLabel}</div>
            <div className="ticketId">ID: {g.id}</div>
          </section>
        ))}
      </main>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener("load", () => {
              setTimeout(() => window.print(), 300);
              window.addEventListener("afterprint", () => {
                setTimeout(() => window.close(), 200);
              });
            });
          `,
        }}
      />
    </>
  );
}