import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cerrarSesion, obtenerSesion } from "../lib/auth";
import logoImg from "../assets/logo.png";
import "./Navbar.css";

function Navbar() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [sesion, setSesion] = useState(obtenerSesion());
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const actualizar = () => setSesion(obtenerSesion());
    window.addEventListener("sesion-cerrada", actualizar);
    return () => window.removeEventListener("sesion-cerrada", actualizar);
  }, []);

  const cerrarMenu = () => setMenuAbierto(false);

  function salir() {
    cerrarMenu();
    cerrarSesion();
    setSesion(null);
    window.dispatchEvent(new Event("sesion-cerrada"));
    navegar("/");
  }

  const esActivo = (ruta) => ubicacion.pathname === ruta;

  return (
    <header className="navbar-wrapper">
      <nav className="navbar" aria-label="Navegación principal">
        <Link to="/" className="navbar-brand" onClick={cerrarMenu}>
          <img src={logoImg} alt="FILA CERO" className="brand-logo" />
          <span className="brand-text">FILA CERO</span>
        </Link>

        {/* Botón menú móvil */}
        <button
          className={`navbar-toggle ${menuAbierto ? "open" : ""}`}
          onClick={() => setMenuAbierto(!menuAbierto)}
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>

        {/* Links de escritorio y móvil */}
        <div className={`navbar-collapse ${menuAbierto ? "is-open" : ""}`}>
          <ul className="nav-links">
            <li>
              <Link to="/" className={`nav-item ${esActivo("/") ? "active" : ""}`} onClick={cerrarMenu}>
                Inicio
              </Link>
            </li>
            <li>
              <Link to="/solicitar-turno" className={`nav-item ${esActivo("/solicitar-turno") ? "active" : ""}`} onClick={cerrarMenu}>
                Solicitar Turno
              </Link>
            </li>
            <li>
              <Link to="/consultar-turnos" className={`nav-item ${esActivo("/consultar-turnos") ? "active" : ""}`} onClick={cerrarMenu}>
                Consultar Turnos
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className={`nav-item ${esActivo("/dashboard") ? "active" : ""}`} onClick={cerrarMenu}>
                Mi Panel
              </Link>
            </li>
            {sesion?.usuario?.rol === "admin" && (
              <li>
                <Link
                  to="/admin"
                  className={`nav-item ${ubicacion.pathname.startsWith("/admin") || ubicacion.pathname === "/usuarios" || ubicacion.pathname === "/gestion-turnos" ? "active" : ""}`}
                  onClick={cerrarMenu}
                >
                  Administrador
                </Link>
              </li>
            )}
          </ul>

          <div className="nav-auth">
            {sesion ? (
              <div className="user-menu">
                <span className="user-greeting">
                  {sesion.usuario?.nombre ? sesion.usuario.nombre.split(" ")[0] : "Usuario"}
                </span>
                <button className="btn-logout" onClick={salir} title="Cerrar sesión">
                  Salir
                </button>
              </div>
            ) : (
              <div className="auth-buttons">
                <Link to="/login" className="btn-ghost" onClick={cerrarMenu}>
                  Iniciar Sesión
                </Link>
                <Link to="/registro" className="btn-primary-nav" onClick={cerrarMenu}>
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
