import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { guardarSesion } from "../lib/auth";
import logoImg from "../assets/logo.png";
import "../styles/Login.css";

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
      const sesion = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(formulario),
      });
      guardarSesion(sesion);
      navegar(sesion.usuario.rol === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <Navbar />

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-header">
            <img src={logoImg} alt="FILA CERO" className="auth-brand-logo" />
            <h1 className="auth-title">Iniciar Sesión</h1>
            <p className="auth-subtitle">Ingresa tus credenciales para acceder a FILA CERO</p>
          </div>

          <form className="auth-form" onSubmit={enviar}>
            <div className="form-group">
              <label htmlFor="correo" className="form-label">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                placeholder="ejemplo@correo.com"
                value={formulario.correo}
                onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="contraseña" className="form-label">Contraseña</label>
              <input
                id="contraseña"
                type="password"
                placeholder="••••••••"
                value={formulario.contraseña}
                onChange={(e) => setFormulario({ ...formulario, contraseña: e.target.value })}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="form-error" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-auth-submit" disabled={cargando}>
              {cargando ? (
                <span className="btn-loading-state">
                  <span className="spinner-indicator" aria-hidden="true"></span>
                  Ingresando...
                </span>
              ) : (
                "Ingresar a mi cuenta"
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-switch-text">
              ¿No tienes una cuenta aún?{" "}
              <Link to="/registro" className="auth-link">
                Crear una cuenta
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Login;
