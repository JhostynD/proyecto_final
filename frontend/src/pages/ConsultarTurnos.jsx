import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import "../styles/ConsultarTurnos.css";

function ConsultarTurnos() {
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const cargar = () => api("/turnos").then(setTurnos).catch((err) => setError(err.message)).finally(() => setCargando(false));
  useEffect(() => { cargar(); }, []);
  async function cancelar(id) {
    setError("");
    try { await api(`/turnos/${id}/cancelar`, { method: "PATCH" }); setCargando(true); cargar(); } catch (err) { setError(err.message); }
  }
  return <><Navbar /><div className="consulta-container"><h1>Mis Turnos</h1>{error && <p className="form-error" role="alert">{error}</p>}<div className="table-container"><table><thead><tr><th>ID</th><th>Servicio</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
    {cargando ? <tr><td colSpan="6">Cargando turnos...</td></tr> : turnos.length ? turnos.map((turno) => <tr key={turno.id}><td>{turno.id}</td><td>{turno.servicio}</td><td>{turno.fecha}</td><td>{turno.hora}</td><td><span className={`estado ${turno.estado}`}>{turno.estado}</span></td><td>{["pendiente", "confirmado"].includes(turno.estado) && <button onClick={() => cancelar(turno.id)}>Cancelar</button>}</td></tr>) : <tr><td colSpan="6">No tienes turnos registrados.</td></tr>}
  </tbody></table></div></div><Footer /></>;
}
export default ConsultarTurnos;
