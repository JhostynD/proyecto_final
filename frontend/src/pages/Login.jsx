import Navbar from "../components/Navbar";
import "../styles/Login.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { guardarSesion } from "../lib/auth";

function Login() {
  const navegar = useNavigate();
  const [formulario, setFormulario] = useState({ correo: "", contraseña: "" });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);
    try {
      const sesion = await api("/auth/login", { method: "POST", body: JSON.stringify(formulario) });
      guardarSesion(sesion);
      navegar(sesion.usuario.rol === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Navbar />

      <div className="login-container">

        <div className="login-card">

          <h2>Iniciar Sesión</h2>

          <form onSubmit={enviar}>
            <input type="email" placeholder="Correo electrónico" value={formulario.correo} onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })} required />

            <input type="password" placeholder="Contraseña" value={formulario.contraseña} onChange={(e) => setFormulario({ ...formulario, contraseña: e.target.value })} required />

            {error && <p className="form-error" role="alert">{error}</p>}
            <button disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
          </form>

        </div>

      </div>
    </>
  );
}

export default Login;
