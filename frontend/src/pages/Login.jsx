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

  // Estados para cuentas pendientes de verificación
  const [cuentaNoVerificada, setCuentaNoVerificada] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [mensajeReenvio, setMensajeReenvio] = useState("");
  const [errorReenvio, setErrorReenvio] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    if (cargando) return;

    setError("");
    setCuentaNoVerificada(false);
    setMensajeReenvio("");
    setErrorReenvio("");
    setCargando(true);

    try {
      const sesion = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(formulario),
      });

      guardarSesion(sesion);
      navegar(sesion.usuario.rol === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      if (err.status === 403 && (err.noVerificado || err.datos?.noVerificado)) {
        // Cuenta no verificada: no se guarda sesión ni token
        setCuentaNoVerificada(true);
        setError("Debes verificar tu correo electrónico antes de iniciar sesión.");
      } else {
        setError(err.message || "Correo o contraseña incorrectos.");
      }
    } finally {
      setCargando(false);
    }
  }

  async function reenviarEnlace() {
    if (reenviando || !formulario.correo) return;

    setReenviando(true);
    setMensajeReenvio("");
    setErrorReenvio("");

    try {
      const res = await api("/auth/reenviar-verificacion", {
        method: "POST",
        body: JSON.stringify({ correo: formulario.correo }),
      });
      setMensajeReenvio(res.mensaje || "Si tu cuenta está pendiente, te hemos enviado un nuevo enlace de verificación.");
    } catch (err) {
      if (err.status === 429) {
        setErrorReenvio("Has alcanzado el límite de reenvíos. Por favor espera unos minutos antes de intentar de nuevo.");
      } else if (err.status === 503) {
        setErrorReenvio("El servicio de verificación se encuentra temporalmente en mantenimiento. Por favor intenta más tarde.");
      } else {
        setErrorReenvio(err.message || "No fue posible reenviar el correo de verificación.");
      }
    } finally {
      setReenviando(false);
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
                onChange={(e) => {
                  setFormulario({ ...formulario, correo: e.target.value });
                  if (cuentaNoVerificada) {
                    setCuentaNoVerificada(false);
                    setError("");
                  }
                }}
                required
                autoComplete="email"
                disabled={cargando}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="contraseña" className="form-label">Contraseña</label>
                <Link to="/olvide-contrasena" className="auth-forgot-link">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                id="contraseña"
                type="password"
                placeholder="••••••••"
                value={formulario.contraseña}
                onChange={(e) => setFormulario({ ...formulario, contraseña: e.target.value })}
                required
                autoComplete="current-password"
                disabled={cargando}
              />
            </div>

            {/* Alerta de cuenta no verificada con opción de reenvío */}
            {cuentaNoVerificada ? (
              <div className="auth-unverified-alert" role="alert">
                <div className="auth-unverified-header">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <strong>Cuenta pendiente de verificación</strong>
                </div>
                <p className="auth-unverified-desc">
                  Para ingresar a FILA CERO debes confirmar tu correo electrónico. Revisa tu bandeja de entrada o la carpeta de spam para encontrar el enlace de activación.
                </p>

                {mensajeReenvio && (
                  <div className="auth-feedback-box success" role="status">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>{mensajeReenvio}</span>
                  </div>
                )}

                {errorReenvio && (
                  <div className="auth-feedback-box error" role="alert">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{errorReenvio}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-auth-resend-inline"
                  onClick={reenviarEnlace}
                  disabled={reenviando}
                >
                  {reenviando ? (
                    <span className="btn-loading-state">
                      <span className="spinner-indicator" aria-hidden="true"></span>
                      Reenviando correo...
                    </span>
                  ) : (
                    "Reenviar correo de verificación"
                  )}
                </button>
              </div>
            ) : (
              error && (
                <div className="form-error" role="alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )
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
