import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import logoImg from "../assets/logo.png";
import "../styles/OlvideContrasena.css";

function OlvideContrasena() {
  const [correo, setCorreo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [mensajeExito, setMensajeExito] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (cargando) return;

    const correoLimpio = correo.trim().toLowerCase();
    if (!correoLimpio) {
      setError("Por favor ingresa tu correo electrónico.");
      return;
    }

    setError("");
    setCargando(true);

    try {
      const respuesta = await api("/auth/olvide-contrasena", {
        method: "POST",
        body: JSON.stringify({ correo: correoLimpio }),
      });

      setMensajeExito(
        respuesta.mensaje ||
          "Si la cuenta existe y el servicio de correo está disponible, recibirás instrucciones para restablecer tu contraseña."
      );
      setSolicitudEnviada(true);
    } catch (err) {
      if (err.status === 429) {
        setError("Has alcanzado el límite de solicitudes. Por favor espera 15 minutos antes de intentar de nuevo.");
      } else if (err.status === 503) {
        setError("El servicio de recuperación se encuentra temporalmente en mantenimiento. Por favor intenta más tarde.");
      } else {
        setError(err.message || "No fue posible procesar la solicitud de recuperación.");
      }
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
            <h1 className="auth-title">
              {solicitudEnviada ? "Revisa tu Correo" : "Recuperar Contraseña"}
            </h1>
            <p className="auth-subtitle">
              {solicitudEnviada
                ? "Hemos procesado tu solicitud de restablecimiento"
                : "Ingresa tu correo para recibir un enlace de recuperación seguro"}
            </p>
          </div>

          {solicitudEnviada ? (
            <div className="auth-recovery-pending">
              <div className="auth-status-banner">
                <div className="auth-status-icon-wrap" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div className="auth-status-body">
                  <p className="auth-status-headline">{mensajeExito}</p>
                </div>
              </div>

              <div className="auth-instructions-box">
                <h2 className="auth-instructions-title">Instrucciones</h2>
                <ol className="auth-instructions-list">
                  <li>Abre tu bandeja de entrada o carpeta de <strong>correo no deseado (spam)</strong>.</li>
                  <li>El enlace de recuperación tiene una vigencia máxima de <strong>30 minutos</strong>.</li>
                  <li>Por seguridad, cada enlace puede utilizarse únicamente una vez.</li>
                </ol>
              </div>

              <div className="auth-actions-group">
                <Link to="/login" className="btn-auth-submit btn-link-centered">
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="correo-recuperacion" className="form-label">
                  Correo electrónico registrado
                </label>
                <input
                  id="correo-recuperacion"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={correo}
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    if (error) setError("");
                  }}
                  required
                  autoComplete="email"
                  disabled={cargando}
                />
              </div>

              {error && (
                <div className="auth-feedback-box error" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                    Enviando solicitud...
                  </span>
                ) : (
                  "Enviar enlace de recuperación"
                )}
              </button>

              <div className="auth-footer">
                <p className="auth-switch-text">
                  ¿Recordaste tu contraseña?{" "}
                  <Link to="/login" className="auth-link">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default OlvideContrasena;
