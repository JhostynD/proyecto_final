import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import logoImg from "../assets/logo.png";
import "../styles/OlvideContrasena.css";

function RestablecerContrasena() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenParam = searchParams.get("token");

  // Capturar el token inicial en el estado para conservarlo aun cuando se limpie la URL
  const [tokenInicial] = useState(() => (typeof tokenParam === "string" ? tokenParam.trim() : ""));
  const tieneToken = Boolean(tokenInicial && /^[a-f0-9]{64}$/i.test(tokenInicial));

  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState(() =>
    !tokenInicial
      ? "No se proporcionó un enlace de recuperación válido."
      : !tieneToken
      ? "El enlace de recuperación es inválido o está incompleto."
      : ""
  );

  const urlLimpiadaRef = useRef(false);

  // Protección estricta de Referer: aplicar política no-referrer mientras esté en esta vista
  useEffect(() => {
    let metaReferrer = document.querySelector('meta[name="referrer"]');
    let metaCreado = false;
    const valorOriginal = metaReferrer ? metaReferrer.getAttribute("content") : null;

    if (!metaReferrer) {
      metaReferrer = document.createElement("meta");
      metaReferrer.setAttribute("name", "referrer");
      metaReferrer.setAttribute("content", "no-referrer");
      document.head.appendChild(metaReferrer);
      metaCreado = true;
    } else {
      metaReferrer.setAttribute("content", "no-referrer");
    }

    return () => {
      if (metaCreado && metaReferrer.parentNode) {
        metaReferrer.parentNode.removeChild(metaReferrer);
      } else if (metaReferrer && valorOriginal !== null) {
        metaReferrer.setAttribute("content", valorOriginal);
      }
    };
  }, []);

  // Retirar el token sensible de la URL de inmediato para protegerlo del historial y barra de direcciones
  useEffect(() => {
    if (urlLimpiadaRef.current) return;
    urlLimpiadaRef.current = true;
    if (searchParams.has("token")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (cargando || !tieneToken) return;

    if (!nuevaContrasena || nuevaContrasena.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (nuevaContrasena !== confirmarContrasena) {
      setError("Las contraseñas no coinciden. Por favor verifícalas.");
      return;
    }

    setError("");
    setCargando(true);

    try {
      await api("/auth/restablecer-contrasena", {
        method: "POST",
        body: JSON.stringify({
          token: tokenInicial,
          contrasena: nuevaContrasena,
        }),
      });

      setExito(true);
    } catch (err) {
      if (err.status === 503) {
        setError("El servicio se encuentra temporalmente en mantenimiento. Por favor intenta más tarde.");
      } else {
        setError(err.message || "El enlace de recuperación es inválido, ha expirado o ya fue utilizado.");
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
              {exito ? "¡Contraseña Actualizada!" : "Nueva Contraseña"}
            </h1>
            <p className="auth-subtitle">
              {exito
                ? "Tu contraseña ha sido restablecida exitosamente"
                : "Crea una contraseña segura de mínimo 6 caracteres para tu cuenta"}
            </p>
          </div>

          {exito ? (
            <div className="auth-recovery-pending">
              <div className="auth-status-banner success-accent">
                <div className="auth-status-icon-wrap" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="auth-status-body">
                  <p className="auth-status-headline">
                    Por seguridad, todas tus sesiones anteriores han sido cerradas. Ya puedes iniciar sesión con tu nueva contraseña.
                  </p>
                </div>
              </div>

              <div className="auth-actions-group">
                <Link to="/login" className="btn-auth-submit btn-link-centered">
                  Iniciar sesión ahora
                </Link>
              </div>
            </div>
          ) : !tieneToken ? (
            <div className="auth-recovery-pending">
              <div className="auth-feedback-box error" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>

              <p className="auth-recovery-help-text">
                El enlace que utilizaste no es válido o está incompleto. Puedes solicitar un nuevo enlace de recuperación:
              </p>

              <div className="auth-actions-group">
                <Link to="/olvide-contrasena" className="btn-auth-submit btn-link-centered">
                  Solicitar nuevo enlace
                </Link>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nueva-contrasena" className="form-label">
                  Nueva contraseña
                </label>
                <input
                  id="nueva-contrasena"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={nuevaContrasena}
                  onChange={(e) => {
                    setNuevaContrasena(e.target.value);
                    if (error) setError("");
                  }}
                  required
                  autoComplete="new-password"
                  disabled={cargando}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmar-contrasena" className="form-label">
                  Confirmar nueva contraseña
                </label>
                <input
                  id="confirmar-contrasena"
                  type="password"
                  placeholder="Repite tu nueva contraseña"
                  value={confirmarContrasena}
                  onChange={(e) => {
                    setConfirmarContrasena(e.target.value);
                    if (error) setError("");
                  }}
                  required
                  autoComplete="new-password"
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
                    Actualizando contraseña...
                  </span>
                ) : (
                  "Guardar nueva contraseña"
                )}
              </button>

              <div className="auth-footer">
                <p className="auth-switch-text">
                  <Link to="/login" className="auth-link">
                    Cancelar y volver al login
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

export default RestablecerContrasena;
