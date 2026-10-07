import { Link, useLocation, useNavigate } from "react-router-dom";
import logoImg from "../assets/logo.png";
import "./AdminSidebar.css";

function AdminSidebar() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  
  const opciones = [
    {
      etiqueta: "Resumen",
      ruta: "/admin",
      icono: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      )
    },
    {
      etiqueta: "Turnos",
      ruta: "/gestion-turnos",
      icono: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
        </svg>
      )
    },
    {
      etiqueta: "Usuarios",
      ruta: "/usuarios",
      icono: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
  ];

  return (
    <aside className="sidebar" aria-label="Navegación del Administrador">
      <div className="sidebar-header">
        <Link className="admin-brand" to="/admin">
          <img src={logoImg} alt="FILA CERO" className="admin-brand-logo-img" />
          <div>
            <span className="admin-title">FILA CERO</span>
            <span className="admin-badge">Admin</span>
          </div>
        </Link>
      </div>

      <div className="sidebar-section-label">Gestión</div>

      <nav className="sidebar-nav">
        {opciones.map((opcion) => {
          const activo = ubicacion.pathname === opcion.ruta;
          return (
            <button
              key={opcion.ruta}
              className={`sidebar-link ${activo ? "active" : ""}`}
              onClick={() => navegar(opcion.ruta)}
            >
              <span className="sidebar-icon">{opcion.icono}</span>
              <span className="sidebar-label">{opcion.etiqueta}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-link return-link" onClick={() => navegar("/")}>
          <span className="sidebar-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </span>
          <span className="sidebar-label">Sitio Principal</span>
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
