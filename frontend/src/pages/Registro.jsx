import Navbar from "../components/Navbar";
import "../styles/Registro.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { guardarSesion } from "../lib/auth";

function Registro() {
  const navegar = useNavigate();
  const [formulario, setFormulario] = useState({ nombre: "", correo: "", contraseña: "" });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);
    try {
      const sesion = await api("/auth/registro", { method: "POST", body: JSON.stringify(formulario) });
      guardarSesion(sesion);
      navegar("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Navbar />

      <div className="registro-container">

        <div className="registro-card">

          <h2>Registro de Usuario</h2>

          <form onSubmit={enviar}>
            <input type="text" placeholder="Nombre Completo" value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required />

            <input type="email" placeholder="Correo Electrónico" value={formulario.correo} onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })} required />

            <input type="password" placeholder="Contraseña (mínimo 6 caracteres)" minLength="6" value={formulario.contraseña} onChange={(e) => setFormulario({ ...formulario, contraseña: e.target.value })} required />

            {error && <p className="form-error" role="alert">{error}</p>}
            <button disabled={cargando}>{cargando ? "Registrando..." : "Registrarme"}</button>
          </form>

        </div>

      </div>
    </>
  );
}

export default Registro;
