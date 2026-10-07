import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { obtenerSesion } from "../lib/auth";
import "../styles/DashboardUsuario.css";

const LABEL_ESTADO = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_espera: "En espera",
  llamando: "¡Te están llamando!",
  en_atencion: "En atención",
  completado: "Completado",
  cancelado: "Cancelado",
  no_presentado: "No se presentó",
};

const LABEL_MODALIDAD = {
  turno: "Turno Virtual",
  cita: "Cita",
};

// ── Tarjeta de Seguimiento en Vivo ──────────────────────────────
function TarjetaEnVivo({ turno: turnoInicial }) {
  const [turno, setTurno] = useState(turnoInicial);
  const [cargandoCheckin, setCargandoCheckin] = useState(false);
  const [errorCheckin, setErrorCheckin] = useState("");
  const intervalRef = useRef(null);

  const ESTADOS_ACTIVOS = ["en_espera", "llamando", "en_atencion"];
  const esActivo = ESTADOS_ACTIVOS.includes(turno.estado);
  const esLlamando = turno.estado === "llamando";
  const esEnEspera = turno.estado === "en_espera";
  const esCita = turno.modalidad === "cita";
  const esConfirmado = ["confirmado", "pendiente"].includes(turno.estado);

  const refrescar = useCallback(async () => {
    try {
      const datos = await api(`/turnos/${turnoInicial.id}/estado`);
      setTurno(datos);
    } catch {
      // silencioso
    }
  }, [turnoInicial.id]);

  useEffect(() => {
    if (esActivo) {
      intervalRef.current = setInterval(refrescar, 7000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [esActivo, refrescar]);

  async function hacerCheckin() {
    setErrorCheckin("");
    setCargandoCheckin(true);
    try {
      await api(`/turnos/${turnoInicial.id}/checkin`, { method: "PATCH" });
      await refrescar();
    } catch (err) {
      setErrorCheckin(err.message);
    } finally {
      setCargandoCheckin(false);
    }
  }

  return (
    <div className={`ticket-card live-card ${esLlamando ? "live-card--llamando" : ""} ${esConfirmado ? "live-card--confirmado" : ""}`}>
      {/* Barra de actividad animada si está llamando */}
      {esLlamando && (
        <div className="ticket-llamando-bar" aria-hidden="true">
          <span /><span /><span />
        </div>
      )}

      <div className="ticket-header">
        <div className="ticket-id-group">
          <div className="ticket-codigo">{turno.codigo_turno}</div>
          <span className={`modalidad-badge ${turno.modalidad}`}>
            {LABEL_MODALIDAD[turno.modalidad] || turno.modalidad}
          </span>
        </div>
        <span className={`estado ${turno.estado}`}>{LABEL_ESTADO[turno.estado] || turno.estado}</span>
      </div>

      <div className="ticket-body">
        <div className="ticket-service-info">
          <span className="ticket-label">Servicio</span>
          <h3 className="ticket-service-name">{turno.servicio}</h3>
        </div>

        {/* Para citas: mostrar fecha y hora; para turnos: solo fecha */}
        <div className="ticket-schedule-info">
          {turno.fecha && (
            <div className="schedule-box">
              <span className="ticket-label">Fecha</span>
              <div className="schedule-value">{turno.fecha}</div>
            </div>
          )}
          {esCita && turno.hora && (
            <div className="schedule-box">
              <span className="ticket-label">Hora de cita</span>
              <div className="schedule-value time-accent">{turno.hora}</div>
            </div>
          )}
          {turno.modulo && (
            <div className="schedule-box">
              <span className="ticket-label">Módulo</span>
              <div className="schedule-value">{turno.modulo}</div>
            </div>
          )}
          {turno.duracion_estimada_min && (
            <div className="schedule-box">
              <span className="ticket-label">Duración aprox.</span>
              <div className="schedule-value">~{turno.duracion_estimada_min} min</div>
            </div>
          )}
        </div>

        {/* Motivo/Tema */}
        {turno.motivo && (
          <div className="ticket-motivo">
            <span className="ticket-label">Tema</span>
            <p className="ticket-motivo-text">{turno.motivo}</p>
          </div>
        )}

        {/* ── Cola info: en espera ── */}
        {esEnEspera && (
          <div className="live-queue-info">
            <div className="live-queue-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="live-queue-texto">
              <p className="live-queue-mensaje">{turno.mensaje}</p>
              {turno.personas_antes > 0 && (
                <div className="live-queue-stats">
                  <span className="stat-chip">
                    <strong>{turno.personas_antes}</strong>
                    {" "}persona{turno.personas_antes !== 1 ? "s" : ""} antes
                  </span>
                  <span className="stat-chip accent">
                    ~{turno.tiempo_estimado_min} min estimados
                  </span>
                </div>
              )}
              {turno.personas_antes === 0 && (
                <div className="live-queue-stats">
                  <span className="stat-chip green">
                    ¡Eres el siguiente!
                  </span>
                </div>
              )}
              <div className="live-pulse-dot" aria-hidden="true">
                <span />Actualizando en vivo
              </div>
            </div>
          </div>
        )}

        {/* ── Llamando urgente ── */}
        {esLlamando && (
          <div className="live-queue-info live-queue-info--urgente" role="alert">
            <div className="live-queue-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="live-queue-texto">
              <p className="live-queue-mensaje llamando-text">¡Es tu turno! {turno.modulo && <>Dirígete a <strong>{turno.modulo}</strong></>}</p>
              <p className="live-queue-sub">{turno.mensaje}</p>
            </div>
          </div>
        )}

        {/* ── En atención ── */}
        {turno.estado === "en_atencion" && (
          <div className="live-queue-info live-queue-info--atencion">
            <div className="live-queue-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="live-queue-texto">
              <p className="live-queue-mensaje">{turno.mensaje || "Estás siendo atendido ahora."}</p>
              <div className="live-pulse-dot" aria-hidden="true"><span />En atención</div>
            </div>
          </div>
        )}

        {/* ── Cita confirmada: cuándo hacer check-in ── */}
        {esCita && esConfirmado && turno.mensaje && (
          <div className="ticket-checkin-hint">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{turno.mensaje}</span>
          </div>
        )}
      </div>

      {errorCheckin && (
        <p className="ticket-error-hint" role="alert">{errorCheckin}</p>
      )}

      <div className="ticket-footer">
        {turno.puede_hacer_checkin && (
          <button
            type="button"
            id={`btn-checkin-dash-${turnoInicial.id}`}
            className="btn-checkin"
            disabled={cargandoCheckin}
            onClick={hacerCheckin}
          >
            {cargandoCheckin
              ? <><span className="spinner-indicator small" aria-hidden="true" /> Ingresando…</>
              : "✅ Ingresar a la fila"}
          </button>
        )}
        <Link to="/consultar-turnos" className="btn-ticket-action">
          Ver detalles
        </Link>
      </div>
    </div>
  );
}

// ── DashboardUsuario ─────────────────────────────────────────────
function DashboardUsuario() {
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const nombre = obtenerSesion()?.usuario?.nombre || "Usuario";

  useEffect(() => {
    api("/turnos")
      .then(setTurnos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  const total = turnos.length;
  const enCola = turnos.filter((t) => ["en_espera", "llamando", "en_atencion"].includes(t.estado)).length;
  const completados = turnos.filter((t) => t.estado === "completado").length;
  const citasFuturas = turnos.filter((t) => ["confirmado", "pendiente"].includes(t.estado)).length;

  // Prioridad de visualización del turno activo/próximo
  const PRIORIDAD = ["llamando", "en_atencion", "en_espera", "confirmado", "pendiente"];
  const activo = PRIORIDAD
    .map((e) => turnos.find((t) => t.estado === e))
    .find(Boolean);

  return (
    <div className="page-shell">
      <Navbar />

      <main className="usuario-main">
        <div className="usuario-shell">
          {/* Bienvenida */}
          <div className="usuario-welcome-header">
            <div>
              <span className="welcome-tag">Panel Personal</span>
              <h1 className="welcome-title">Bienvenido, {nombre}</h1>
              <p className="welcome-subtitle">
                Resumen actualizado de tus citas y turnos.
              </p>
            </div>
            <div className="welcome-quick-actions">
              <Link to="/solicitar-turno" className="btn-apple-primary" id="btn-pedir-turno">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Pedir Turno
              </Link>
            </div>
          </div>

          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: "24px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* KPI Grid */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon-row">
                <span className="kpi-label">Total Solicitados</span>
                <div className="kpi-icon-pill blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              <div className="kpi-value">{cargando ? "—" : total}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-row">
                <span className="kpi-label">En Cola Activa</span>
                <div className="kpi-icon-pill amber">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <div className="kpi-value">{cargando ? "—" : enCola}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-row">
                <span className="kpi-label">Citas Próximas</span>
                <div className="kpi-icon-pill purple">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="15" x2="16" y2="15" />
                  </svg>
                </div>
              </div>
              <div className="kpi-value">{cargando ? "—" : citasFuturas}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-row">
                <span className="kpi-label">Completados</span>
                <div className="kpi-icon-pill green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="kpi-value">{cargando ? "—" : completados}</div>
            </div>
          </div>

          {/* Tarjeta activa / próxima */}
          <div className="proximo-turno-container">
            <div className="section-title-row">
              <h2 className="section-box-title">
                {activo && ["llamando", "en_atencion", "en_espera"].includes(activo.estado)
                  ? "Tu Turno Activo"
                  : "Próxima Cita"}
              </h2>
              <Link to="/consultar-turnos" className="see-all-link">
                Ver todos →
              </Link>
            </div>

            {cargando ? (
              <div className="loading-container" style={{ padding: "32px" }}>
                <div className="spinner-indicator" aria-hidden="true"></div>
                <p>Cargando tus turnos…</p>
              </div>
            ) : activo ? (
              <TarjetaEnVivo turno={activo} />
            ) : (
              <div className="no-proximo-card">
                <div className="no-turno-icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h3>No tienes citas activas</h3>
                <p>Estás al día. Si requieres atención, puedes agendar en segundos.</p>
                <Link to="/solicitar-turno" className="btn-apple-primary btn-sm">
                  Solicitar un turno ahora
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default DashboardUsuario;
