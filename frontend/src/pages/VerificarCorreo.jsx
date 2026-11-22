import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import logoImg from "../assets/logo.png";
import "../styles/VerificarCorreo.css";

function VerificarCorreo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenParam = searchParams.get("token");

  // Capturar el token inicial en el estado para preservarlo aun cuando se limpie de la URL
  const [tokenInicial] = useState(() => (typeof tokenParam === "string" ? tokenParam.trim() : ""));
  const tieneToken = Boolean(tokenInicial);

  // Estados iniciales derivados: si no hay token desde el montaje inicial se establece error sin efecto síncrono
  const [estado, setEstado] = useState(() => (tieneToken ? "cargando" : "error"));
  const [mensajeTitulo, setMensajeTitulo] = useState(() =>
    tieneToken ? "Verificando tu cuenta..." : "Enlace de verificación incompleto"
  );
  const [mensajeDetalle, setMensajeDetalle] = useState(() =>
    tieneToken
      ? "Estamos validando tu enlace de verificación. Esto solo tomará un momento."
      : "No se proporcionó un token de verificación en el enlace. Revisa tu correo o solicita un nuevo enlace de activación."
  );

  // Estados para reenvío en caso de enlace expirado o inválido
  const [correoReenvio, setCorreoReenvio] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [mensajeReenvio, setMensajeReenvio] = useState("");
  const [errorReenvio, setErrorReenvio] = useState("");

  // Referencia para evitar ejecución repetida por renders duplicados (Strict Mode)
  const peticionIniciada = useRef(false);

  useEffect(() => {
    if (!tokenInicial || peticionIniciada.current) return;
    peticionIniciada.current = true;

    // Retirar el parámetro sensible de la URL de inmediato para protegerlo en el historial/barra
    if (searchParams.has("token")) {
      setSearchParams({}, { replace: true });
    }

    async function verificar() {
      try {
        const respuesta = await api(`/auth/verificar-correo?token=${encodeURIComponent(tokenInicial)}`);
        setEstado("exito");
        setMensajeTitulo("¡Correo verificado con éxito!");
        setMensajeDetalle(
          respuesta.mensaje ||
            "Tu cuenta ha sido activada correctamente. Ya puedes iniciar sesión con tu correo y contraseña."
        );
      } catch (err) {
        setEstado("error");
        if (err.status === 503) {
          setMensajeTitulo("Servicio en mantenimiento");
          setMensajeDetalle(
            "El servicio de verificación se encuentra temporalmente en mantenimiento. Por favor intenta más tarde."
          );
        } else {
          setMensajeTitulo("No fue posible verificar tu correo");
          setMensajeDetalle(
            err.message ||
              "El enlace de verificación no es válido, ha expirado o ya fue utilizado anteriormente."
          );
        }
      }
    }

    verificar();
  }, [searchParams, setSearchParams, tokenInicial]);

  async function handleReenviar(evento) {
    evento.preventDefault();
    if (reenviando || !correoReenvio.trim()) return;

    setReenviando(true);
    setMensajeReenvio("");
    setErrorReenvio("");

    try {
      const res = await api("/auth/reenviar-verificacion", {
        method: "POST",
        body: JSON.stringify({ correo: correoReenvio.trim() }),
      });
      setMensajeReenvio(
        res.mensaje ||
          "Si la cuenta está registrada y pendiente de verificación, recibirás un nuevo enlace en breve."
      );
    } catch (err) {
      if (err.status === 429) {
        setErrorReenvio(
          "Has alcanzado el límite de solicitudes. Por favor espera unos minutos antes de intentar nuevamente."
        );
      } else if (err.status === 503) {
        setErrorReenvio(
          "El servicio de verificación se encuentra temporalmente en mantenimiento. Por favor intenta más tarde."
        );
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
        <div className="auth-card verification-card">
          <div className="auth-header">
            <img src={logoImg} alt="FILA CERO" className="auth-brand-logo" />

            {/* Ícono de estado dinámico */}
            {estado === "cargando" && (
              <div className="verification-icon-wrap loading" aria-hidden="true">
                <span className="spinner-indicator-large"></span>
              </div>
            )}

            {estado === "exito" && (
              <div className="verification-icon-wrap success" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            )}

            {estado === "error" && (
              <div className="verification-icon-wrap error" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            )}

            <h1 className="auth-title">{mensajeTitulo}</h1>
            <p className="auth-subtitle verification-subtitle">{mensajeDetalle}</p>
          </div>

          {/* Acciones para estado EXITOSO */}
          {estado === "exito" && (
            <div className="verification-actions">
              <Link to="/login" className="btn-auth-submit btn-link-centered">
                Iniciar Sesión
              </Link>
            </div>
          )}

          {/* Acciones para estado ERROR (con formulario de reenvío) */}
          {estado === "error" && (
            <div className="verification-error-section">
              <div className="verification-resend-card">
                <h2 className="verification-resend-title">¿Necesitas un nuevo enlace?</h2>
                <p className="verification-resend-hint">
                  Ingresa tu correo electrónico registrado y te enviaremos un nuevo enlace de activación:
                </p>

                <form className="auth-form" onSubmit={handleReenviar}>
                  <div className="form-group">
                    <label htmlFor="correo-reenvio" className="form-label">
                      Correo electrónico
                    </label>
                    <input
                      id="correo-reenvio"
                      type="email"
                      placeholder="ejemplo@correo.com"
                      value={correoReenvio}
                      onChange={(e) => setCorreoReenvio(e.target.value)}
                      required
                      autoComplete="email"
                      disabled={reenviando}
                    />
                  </div>

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
                    type="submit"
                    className="btn-auth-submit"
                    disabled={reenviando || !correoReenvio.trim()}
                  >
                    {reenviando ? (
                      <span className="btn-loading-state">
                        <span className="spinner-indicator" aria-hidden="true"></span>
                        Reenviando correo...
                      </span>
                    ) : (
                      "Solicitar nuevo enlace"
                    )}
                  </button>
                </form>
              </div>

              <div className="auth-footer">
                <p className="auth-switch-text">
                  ¿Ya tienes tu cuenta activada?{" "}
                  <Link to="/login" className="auth-link">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* En estado cargando: enlaces alternativos */}
          {estado === "cargando" && (
            <div className="auth-footer">
              <p className="auth-switch-text">
                <Link to="/login" className="auth-link">
                  Volver al inicio de sesión
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default VerificarCorreo;
