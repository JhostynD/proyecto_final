import { useEffect, useState } from "react";
import { api } from "../lib/api";
import AdminSidebar from "../components/AdminSidebar";
import "../styles/GestionTurnos.css";

function GestionTurnos() {
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/admin/resumen").then((datos) => setTurnos(datos.turnos)).catch((err) => setError(err.message));
  useEffect(cargar, []);
  async function actualizar(id, estado) { try { await api(`/admin/turnos/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) }); cargar(); } catch (err) { setError(err.message); } }
  return <div className="admin-layout"><AdminSidebar /><main className="turnos-admin-container"><h1>Gestión de Turnos</h1>{error && <p className="form-error">{error}</p>}<div className="turnos-table"><table><thead><tr><th>ID</th><th>Usuario</th><th>Servicio</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{turnos.map((turno) => <tr key={turno.id}><td>{turno.id}</td><td>{turno.usuario}</td><td>{turno.servicio}</td><td>{turno.fecha} {turno.hora}</td><td><span className={`estado ${turno.estado}`}>{turno.estado}</span></td><td className="table-actions">{turno.estado === "pendiente" && <button className="btn-confirmar" onClick={() => actualizar(turno.id, "confirmado")}>Confirmar</button>}{turno.estado === "confirmado" && <button className="btn-completar" onClick={() => actualizar(turno.id, "completado")}>Completar</button>}{!["cancelado", "completado"].includes(turno.estado) && <button className="btn-cancelar" onClick={() => actualizar(turno.id, "cancelado")}>Cancelar</button>}</td></tr>)}</tbody></table></div></main></div>;
}
export default GestionTurnos;
