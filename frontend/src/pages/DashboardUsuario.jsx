import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { obtenerSesion } from "../lib/auth";
import "../styles/DashboardUsuario.css";

function DashboardUsuario() {
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState("");
  const nombre = obtenerSesion()?.usuario?.nombre || "usuario";
  useEffect(() => { api("/turnos").then(setTurnos).catch((err) => setError(err.message)); }, []);
  const pendientes = turnos.filter((turno) => turno.estado === "pendiente").length;
  const proximo = turnos.find((turno) => ["pendiente", "confirmado"].includes(turno.estado));
  return <><Navbar /><div className="usuario-container"><h1>Bienvenido, {nombre}</h1>{error && <p className="form-error">{error}</p>}<div className="usuario-cards"><div className="usuario-card"><h2>{turnos.length}</h2><p>Turnos Solicitados</p></div><div className="usuario-card"><h2>{pendientes}</h2><p>Turnos Pendientes</p></div><div className="usuario-card"><h2>{proximo ? 1 : 0}</h2><p>Próximo Turno</p></div></div><div className="proximo-turno"><h2>Próximo Turno</h2>{proximo ? <div className="turno-info"><p><strong>Servicio:</strong> {proximo.servicio}</p><p><strong>Fecha:</strong> {proximo.fecha}</p><p><strong>Hora:</strong> {proximo.hora}</p><p><strong>Estado:</strong> {proximo.estado}</p></div> : <p>No tienes próximos turnos.</p>}</div></div><Footer /></>;
}
export default DashboardUsuario;
