import { Link, useNavigate } from "react-router-dom";
import { cerrarSesion, obtenerSesion } from "../lib/auth";
import "./Navbar.css";

function Navbar() {
  const navegar = useNavigate();
  const sesion = obtenerSesion();
  function salir() { cerrarSesion(); navegar("/"); }
  return (
    <nav className="navbar">

      <div className="logo">
        🎫 Turnos Virtuales
      </div>

      <ul className="nav-links">

        <li>
          <Link to="/">Inicio</Link>
        </li>

        <li>
          <Link to="/solicitar-turno">
            Solicitar Turno
          </Link>
        </li>

        <li>
          <Link to="/consultar-turnos">
            Consultar Turnos
          </Link>
        </li>

        <li>
          <Link to="/dashboard">
            Mi Panel
          </Link>
        </li>

        {sesion?.usuario?.rol === "admin" && <li><Link to="/admin">Administrador</Link></li>}
        {sesion ? <li><button className="nav-logout" onClick={salir}>Cerrar sesión</button></li> : <><li><Link to="/login">Iniciar Sesión</Link></li><li><Link to="/registro">Registrarme</Link></li></>}

      </ul>

    </nav>
  );
}

export default Navbar;
