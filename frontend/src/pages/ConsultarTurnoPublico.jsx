import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { formatearFechaVisual, formatearHora12 } from "../lib/tiempo";
import "../styles/ConsultarTurnoPublico.css";

const ESTADOS_ACTIVOS = new Set([
  "pendiente",
  "confirmado",
  "en_espera",
  "llamando",
  "en_atencion",
]);

const ESTADOS_TERMINALES = new Set([
  "completado",
  "cancelado",
  "no_presentado",
]);

const LABELS_ESTADO = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_espera: "En espera de llamado",
  llamando: "Llamando a ventanilla",
  en_atencion: "En atención",
  completado: "Atención finalizada",
  cancelado: "Cancelado",
  no_presentado: "No presentado",
};

const LABELS_MODALIDAD = {
  cita: "Cita previa agendada",
  turno: "Turno virtual inmediato",
  turno_y_cita: "Turno / Cita",
};

function ConsultarTurnoPublico() {
  const [codigoInput, setCodigoInput] = useState("");
  const [turno, setTurno] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const inputRef = useRef(null);

  // Control de desmontaje seguro
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Función núcleo de consulta al endpoint público
  const ejecutarConsulta = useCallback(async (codigoAconsultar, esSilencioso = false) => {
    const cod = (codigoAconsultar || "").trim().toUpperCase();

    // Validación preventiva en cliente
    if (!cod) {
      setError("Por favor ingresa un código de turno.");
      return;
    }

    if (cod.length < 4 || cod.length > 10 || !/^[A-Z0-9]{2,5}-[A-Z0-9]{1,5}$/.test(cod)) {
      setError("El formato del código no es válido. Verifica el código impreso en tu comprobante e inténtalo de nuevo.");
      return;
    }

    // Prevenir solicitudes simultáneas
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (esSilencioso) {
      setActualizando(true);
    } else {
      setCargando(true);
      setError("");
    }

    try {
      const data = await api(`/turnos/publico/${encodeURIComponent(cod)}`);
      if (isMountedRef.current) {
        setTurno(data);
        setError("");
        setUltimaActualizacion(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        if (!esSilencioso) {
          setTurno(null);
          setError(err.message || "No fue posible consultar el turno. Verifica el código e intenta de nuevo.");
        }
      }
    } finally {
      if (isMountedRef.current) {
        setCargando(false);
        setActualizando(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

  // Manejador del formulario de búsqueda manual
  const handleConsultar = (e) => {
    e.preventDefault();
    ejecutarConsulta(codigoInput, false);
  };

  // Manejador de actualización manual bajo demanda
  const handleActualizarManual = () => {
    if (turno?.codigo_turno) {
      ejecutarConsulta(turno.codigo_turno, true);
    }
  };

  // Limpiar y consultar otro turno
  const handleConsultarOtro = () => {
    setTurno(null);
    setError("");
    setCodigoInput("");
    setUltimaActualizacion(null);
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 50);
  };

  // -------------------------------------------------------------
  // ACTUALIZACIÓN AUTOMÁTICA INTELIGENTE (Smart Polling cada 15s)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!turno?.codigo_turno) return;

    const estadoActual = turno.estado;
    const esActivo = ESTADOS_ACTIVOS.has(estadoActual);
    const esTerminal = ESTADOS_TERMINALES.has(estadoActual);

    // Si ya terminó o fue cancelado, detener cualquier polling
    if (!esActivo || esTerminal) return;

    const codigoActual = turno.codigo_turno;
    let timerId = null;

    const tick = () => {
      // Solo consultar si la pestaña está visible
      if (document.visibilityState === "visible") {
        ejecutarConsulta(codigoActual, true);
      }
    };

    // Iniciar temporizador periódico de 15 segundos
    timerId = setInterval(tick, 15000);

    // Pausar y reanudar al cambiar de pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Al volver a la pestaña, refrescar de inmediato
        ejecutarConsulta(codigoActual, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerId) clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [turno?.codigo_turno, turno?.estado, ejecutarConsulta]);

  const esEstadoActivo = turno ? ESTADOS_ACTIVOS.has(turno.estado) : false;

  return (
    <div className="page-shell">
      <Navbar />

      <main className="public-query-main">
        <div className="public-query-container">
          {/* Encabezado y contexto */}
          <div className="public-query-header">
            <span className="public-badge">
              <span className="badge-dot-live"></span>
              Consulta Pública de Turnos
            </span>
            <h1 className="public-title">Consulta tu turno</h1>
            <p className="public-subtitle">
              Ingresa el código asignado a tu cita o turno virtual para conocer en tiempo real su estado de atención, fecha y horario programado.
            </p>
          </div>

          {/* Formulario de Consulta */}
          {!turno && (
            <div className="query-card-form">
              <form onSubmit={handleConsultar} className="query-form" noValidate>
                <div className="form-input-group">
                  <label htmlFor="codigo-turno-input" className="query-input-label">
                    Código del turno
                  </label>
                  <div className="input-with-button-wrapper">
                    <input
                      ref={inputRef}
                      id="codigo-turno-input"
                      type="text"
                      className={`query-code-input ${error ? "has-error" : ""}`}
                      placeholder="Ej: XX-000"
                      value={codigoInput}
                      onChange={(e) => {
                        setCodigoInput(e.target.value.toUpperCase());
                        if (error) setError("");
                      }}
                      maxLength={10}
                      autoComplete="off"
                      spellCheck="false"
                      aria-label="Código del turno"
                      aria-describedby={error ? "query-error-msg" : undefined}
                      disabled={cargando}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="btn-query-submit"
                      disabled={cargando || !codigoInput.trim()}
                    >
                      {cargando ? (
                        <>
                          <span className="spinner-indicator small" aria-hidden="true"></span>
                          <span>Consultando...</span>
                        </>
                      ) : (
                        <>
                          <span>Consultar turno</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="input-hint">
                    Formato: prefijo alfabético seguido de guión y número correlativo.
                  </span>
                </div>

                {error && (
                  <div id="query-error-msg" className="query-error-box" role="alert">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Tarjeta de Resultado Organizado Visualmente */}
          {turno && (
            <div className="ticket-result-card" aria-live="polite">
              {/* Header del Ticket */}
              <div className="ticket-header">
                <div>
                  <span className="ticket-header-label">Turno Verificado</span>
                  <div className="ticket-code-display">{turno.codigo_turno}</div>
                </div>

                <div className="ticket-status-wrapper">
                  <span className={`ticket-status-pill ${turno.estado}`}>
                    <span className="status-indicator-dot" aria-hidden="true"></span>
                    {LABELS_ESTADO[turno.estado] || turno.estado}
                  </span>
                </div>
              </div>

              {/* Banner informativo de llamada activa */}
              {turno.estado === "llamando" && (
                <div className="ticket-callout calling" role="status">
                  <span className="pulse-ping" aria-hidden="true"></span>
                  <div>
                    <strong>¡Atención! Tu turno está siendo llamado a ventanilla.</strong>
                    <p>Por favor acércate de inmediato al área de atención.</p>
                  </div>
                </div>
              )}

              {turno.estado === "en_atencion" && (
                <div className="ticket-callout in-progress" role="status">
                  <div>
                    <strong>Turno en atención actualmente.</strong>
                    <p>Tu trámite se encuentra en curso con el asesor bancario.</p>
                  </div>
                </div>
              )}

              {/* Grid de Información Pública Autorizada */}
              <div className="ticket-grid">
                <div className="ticket-field">
                  <span className="field-label">Servicio</span>
                  <span className="field-value strong">{turno.servicio}</span>
                </div>

                <div className="ticket-field">
                  <span className="field-label">Modalidad</span>
                  <span className="field-value">
                    {LABELS_MODALIDAD[turno.modalidad] || turno.modalidad}
                  </span>
                </div>

                <div className="ticket-field">
                  <span className="field-label">Fecha Programada</span>
                  <span className="field-value">
                    📅 {formatearFechaVisual(turno.fecha)}
                  </span>
                </div>

                <div className="ticket-field">
                  <span className="field-label">Hora Asignada</span>
                  <span className="field-value time">
                    ⏱ {formatearHora12(turno.hora)}
                  </span>
                </div>
              </div>

              {/* Barra de Sincronización y Actualización en Vivo */}
              <div className="ticket-sync-bar">
                <div className="sync-info">
                  {esEstadoActivo ? (
                    <span className="sync-active-hint">
                      <span className="live-dot-pulse" aria-hidden="true"></span>
                      Actualización automática cada 15 segundos
                    </span>
                  ) : (
                    <span className="sync-finished-hint">
                      El turno se encuentra en un estado definitivo.
                    </span>
                  )}
                  {ultimaActualizacion && (
                    <span className="sync-timestamp">
                      Comprobado: {formatearHora12(ultimaActualizacion)}
                    </span>
                  )}
                </div>

                <div className="sync-actions">
                  <button
                    type="button"
                    className="btn-sync-refresh"
                    onClick={handleActualizarManual}
                    disabled={actualizando || cargando}
                    title="Actualizar estado ahora"
                  >
                    <svg
                      className={`refresh-icon ${actualizando ? "spinning" : ""}`}
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    <span>{actualizando ? "Actualizando..." : "Actualizar estado"}</span>
                  </button>

                  <button
                    type="button"
                    className="btn-sync-reset"
                    onClick={handleConsultarOtro}
                  >
                    Consultar otro turno
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ayuda o Enlaces Complementarios */}
          <div className="public-query-footer-card">
            <div className="footer-card-item">
              <span className="footer-item-icon" aria-hidden="true">💡</span>
              <div>
                <strong>¿Aún no tienes un turno?</strong>
                <p>Puedes solicitar una cita o turno virtual de forma inmediata.</p>
              </div>
              <Link to="/solicitar-turno" className="footer-action-link">
                Solicitar Turno
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default ConsultarTurnoPublico;
