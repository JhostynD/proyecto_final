import { Link, useLocation, useNavigate } from "react-router-dom";

function AdminSidebar() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const opciones = [
    { etiqueta: "Resumen", ruta: "/admin" },
    { etiqueta: "Turnos", ruta: "/gestion-turnos" },
    { etiqueta: "Usuarios", ruta: "/usuarios" },
  ];

  return (
    <aside className="sidebar">
      <Link className="admin-brand" to="/admin">Turnos Virtuales</Link>
      <p>Administración</p>
      <nav aria-label="Administración">
        {opciones.map((opcion) => <button key={opcion.ruta} className={ubicacion.pathname === opcion.ruta ? "active" : ""} onClick={() => navegar(opcion.ruta)}>{opcion.etiqueta}</button>)}
        <button onClick={() => navegar("/")}>Volver al inicio</button>
      </nav>
    </aside>
  );
}

export default AdminSidebar;
