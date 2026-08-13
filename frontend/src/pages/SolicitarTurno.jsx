import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import "../styles/SolicitarTurno.css";

const horas = Array.from({ length: 18 }, (_, indice) => `${String(8 + Math.floor(indice / 2)).padStart(2, "0")}:${indice % 2 ? "30" : "00"}`);
const fechaMinima = new Date().toISOString().slice(0, 10);

function SolicitarTurno() {
  const [servicios, setServicios] = useState([]);
  const [formulario, setFormulario] = useState({ servicioId: "", fecha: "", hora: "" });
  const [ocupados, setOcupados] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api("/servicios").then(setServicios).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!formulario.fecha) return undefined;
    api(`/turnos/disponibilidad?fecha=${encodeURIComponent(formulario.fecha)}`)
      .then((datos) => setOcupados(datos.ocupados))
      .catch((err) => setError(err.message));
    return undefined;
  }, [formulario.fecha]);

  async function enviar(evento) {
    evento.preventDefault();
    setMensaje("");
    setError("");
    setCargando(true);
    try {
      const respuesta = await api("/turnos", { method: "POST", body: JSON.stringify({ ...formulario, servicioId: Number(formulario.servicioId) }) });
      setMensaje(respuesta.mensaje);
      setFormulario({ servicioId: "", fecha: "", hora: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return <><Navbar /><div className="turno-container"><div className="turno-card"><h2>Solicitar Turno</h2>
    <form onSubmit={enviar}>
      <select value={formulario.servicioId} onChange={(e) => setFormulario({ ...formulario, servicioId: e.target.value })} required>
        <option value="">Seleccione un servicio</option>
        {servicios.map((servicio) => <option key={servicio.id} value={servicio.id}>{servicio.nombre}</option>)}
      </select>
      <input type="date" min={fechaMinima} value={formulario.fecha} onChange={(e) => { setOcupados([]); setFormulario({ ...formulario, fecha: e.target.value, hora: "" }); }} required />
      <select value={formulario.hora} onChange={(e) => setFormulario({ ...formulario, hora: e.target.value })} disabled={!formulario.fecha} required>
        <option value="">Seleccione una hora</option>
        {horas.map((hora) => <option key={hora} value={hora} disabled={ocupados.includes(hora)}>{hora}{ocupados.includes(hora) ? " (ocupado)" : ""}</option>)}
      </select>
      {mensaje && <p className="form-success" role="status">{mensaje}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={cargando}>{cargando ? "Solicitando..." : "Solicitar Turno"}</button>
    </form>
  </div></div><Footer /></>;
}

export default SolicitarTurno;
