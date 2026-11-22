import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import logoImg from "../assets/logo.png";
import "../styles/Registro.css";

function Registro() {
  const [formulario, setFormulario] = useState({ nombre: "", correo: "", contraseña: "" });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Estado para la confirmación de registro y verificación pendiente
  const [registroExitoso, setRegistroExitoso] = useState(false);
  const [correoEnmascarado, setCorreoEnmascarado] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [mensajeReenvio, setMensajeReenvio] = useState("");
  const [errorReenvio, setErrorReenvio] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    if (cargando) return;

    setError("");
    setCargando(true);

    try {
      const respuesta = await api("/auth/registro", {
        method: "POST",
        body: JSON.stringify(formulario),
      });

      // El backend no entrega JWT; la cuenta queda creada con correo_verificado = 0
      setCorreoEnmascarado(respuesta.correo || formulario.correo);
      setRegistroExitoso(true);
    } catch (err) {
      if (err.status === 503) {
        setError("El servicio de registro se encuentra temporalmente en mantenimiento. Por favor intenta más tarde.");
      } else {
        setError(err.message || "No fue posible completar el registro.");
      }
    } finally {
      setCargando(false);
    }
  }

  async function reenviarCorreo() {
    if (reenviando) return;

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
            <h1 className="auth-title">
              {registroExitoso ? "¡Cuenta Creada!" : "Crear Cuenta"}
            </h1>
            <p className="auth-subtitle">
              {registroExitoso
                ? "Confirma tu correo electrónico para comenzar a usar FILA CERO"
                : "Regístrate en FILA CERO para solicitar y gestionar turnos fácilmente"}
            </p>
          </div>

          {registroExitoso ? (
            /* Vista de confirmación con instrucciones de verificación */
            <div className="auth-verification-pending">
              <div className="auth-status-banner">
                <div className="auth-status-icon-wrap" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div className="auth-status-body">
                  <p className="auth-status-headline">Hemos enviado un enlace de verificación a:</p>
                  <p className="auth-email-badge">{correoEnmascarado}</p>
                </div>
              </div>

              <div className="auth-instructions-box">
                <h2 className="auth-instructions-title">¿Qué debes hacer ahora?</h2>
                <ol className="auth-instructions-list">
                  <li>Abre tu bandeja de entrada en el correo indicado.</li>
                  <li>Busca el mensaje de <strong>FILA CERO</strong> con el asunto de verificación.</li>
                  <li>
                    Haz clic en el enlace para activar tu cuenta.
                    <span className="auth-instructions-hint">
                      Si no lo ves en los próximos minutos, revisa tu carpeta de <strong>spam o correo no deseado</strong>.
                    </span>
                  </li>
                </ol>
              </div>

              {mensajeReenvio && (
                <div className="auth-feedback-box success" role="status">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>{mensajeReenvio}</span>
                </div>
              )}

              {errorReenvio && (
                <div className="auth-feedback-box error" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{errorReenvio}</span>
                </div>
              )}

              <div className="auth-actions-group">
                <Link to="/login" className="btn-auth-submit btn-link-centered">
                  Ir al inicio de sesión
                </Link>

                <button
                  type="button"
                  className="btn-auth-secondary"
                  onClick={reenviarCorreo}
                  disabled={reenviando}
                >
                  {reenviando ? (
                    <span className="btn-loading-state">
                      <span className="spinner-indicator" aria-hidden="true"></span>
                      Reenviando correo...
                    </span>
                  ) : (
                    "Reenviar enlace de verificación"
                  )}
                </button>
              </div>

              <div className="auth-footer">
                <p className="auth-switch-text">
                  ¿Te equivocaste de correo?{" "}
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                      setRegistroExitoso(false);
                      setMensajeReenvio("");
                      setErrorReenvio("");
                    }}
                  >
                    Volver a registrarme
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* Formulario normal de registro */
            <>
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
                    disabled={cargando}
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
                    disabled={cargando}
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
                    disabled={cargando}
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
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Registro;
