import { useEffect, useState } from "react";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api";
import "../styles/DashboardAdmin.css";

function DashboardAdmin() {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/admin/resumen").then(setResumen).catch((err) => setError(err.message)); }, []);
  const cantidad = (estado) => resumen?.estados.find((item) => item.estado === estado)?.total || 0;
  return <><div className="admin-layout"><AdminSidebar /><main className="dashboard-content"><h1>Panel Administrativo</h1>{error && <p className="form-error">{error}</p>}<div className="dashboard-cards"><div className="dashboard-card"><h2>{resumen?.usuarios ?? "-"}</h2><p>Usuarios Registrados</p></div><div className="dashboard-card"><h2>{resumen?.turnos.length ?? "-"}</h2><p>Turnos Totales</p></div><div className="dashboard-card"><h2>{cantidad("pendiente")}</h2><p>Turnos Pendientes</p></div><div className="dashboard-card"><h2>{cantidad("completado")}</h2><p>Turnos Completados</p></div></div><div className="recent-turnos"><h2>Últimos Turnos</h2><table><thead><tr><th>ID</th><th>Usuario</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>{resumen?.turnos.slice(0, 5).map((turno) => <tr key={turno.id}><td>{turno.id}</td><td>{turno.usuario}</td><td>{turno.servicio}</td><td><span className={`estado ${turno.estado}`}>{turno.estado}</span></td></tr>)}</tbody></table></div></main></div><Footer /></>;
}
export default DashboardAdmin;
