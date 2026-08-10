import { Link } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
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

        <li>
          <Link to="/admin">
            Administrador
          </Link>
        </li>

        <li>
          <Link to="/login">
            Iniciar Sesión
          </Link>
        </li>

      </ul>

    </nav>
  );
}

export default Navbar;