import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { guardarSesion } from "../lib/auth";
import logoImg from "../assets/logo.png";
import "../styles/Registro.css";

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
      const sesion = await api("/auth/registro", {
        method: "POST",
        body: JSON.stringify(formulario),
      });
      guardarSesion(sesion);
      navegar("/dashboard", { replace: true });
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
            <h1 className="auth-title">Crear Cuenta</h1>
            <p className="auth-subtitle">Regístrate en FILA CERO para solicitar y gestionar turnos fácilmente</p>
          </div>

          <form className="auth-form" onSubmit={enviar}>
            <div className="form-group">
              <label htmlFor="nombre" className="form-label">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                placeholder="Juan Pérez"
                value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                required
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="correo-registro" className="form-label">Correo electrónico</label>
              <input
                id="correo-registro"
                type="email"
                placeholder="ejemplo@correo.com"
                value={formulario.correo}
                onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="contraseña-registro" className="form-label">
                Contraseña <span className="label-hint">(mínimo 6 caracteres)</span>
              </label>
              <input
                id="contraseña-registro"
                type="password"
                placeholder="••••••••"
                minLength="6"
                value={formulario.contraseña}
                onChange={(e) => setFormulario({ ...formulario, contraseña: e.target.value })}
                required
                autoComplete="new-password"
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
                  Creando cuenta...
                </span>
              ) : (
                "Registrarme"
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-switch-text">
              ¿Ya tienes una cuenta creada?{" "}
              <Link to="/login" className="auth-link">
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Registro;
