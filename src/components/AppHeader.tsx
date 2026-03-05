import Link from "next/link";
import Image from "next/image";

export default function AppHeader() {
  return (
    <header className="appHeader noPrint">
      <div className="appHeader__inner">
        <div className="brand">
          <Image
            src="/arigrav-logo.png"
            alt="ARIGRAV"
            width={140}
            height={40}
            priority
            className="brand__logo"
          />
          <div className="brand__text">
            <div className="brand__title">Sistema de Guías</div>
            <div className="brand__subtitle">Planta PICHIL</div>
          </div>
        </div>

        <nav className="nav">
          <Link className="nav__link" href="/guias">
            Guías
          </Link>
          <Link className="nav__link" href="/guias/nueva">
            Nueva Guía
          </Link>
          <Link className="nav__link" href="/reportes">
            Reportes
          </Link>
        </nav>
      </div>
    </header>
  );
}