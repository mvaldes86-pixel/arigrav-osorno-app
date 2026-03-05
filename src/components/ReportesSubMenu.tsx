"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ReportesSubMenu() {
  const pathname = usePathname();

  const isDashboard = pathname === "/reportes" || pathname === "/reportes/";
  const isFacturacion =
    pathname === "/reportes/facturacion" || pathname === "/reportes/facturacion/";

  return (
    <div className="reportesSubMenu">
      <div className="reportesSubMenu__inner">
        <Link
          href="/reportes"
          className={`reportesSubMenu__link ${isDashboard ? "isActive" : ""}`}
        >
          Dashboard
        </Link>

        <Link
          href="/reportes/facturacion"
          className={`reportesSubMenu__link ${isFacturacion ? "isActive" : ""}`}
        >
          Facturación
        </Link>
      </div>
    </div>
  );
}