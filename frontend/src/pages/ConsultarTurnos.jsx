import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import "../styles/ConsultarTurnos.css";

const LABEL_ESTADO = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_espera: "En espera",
  llamando: "¡Te llaman!",
  en_atencion: "En atención",
  completado: "Completado",
  cancelado: "Cancelado",
  no_presentado: "No se presentó",
};

const LABEL_MODALIDAD = {
  turno: "Turno Virtual",
  cita: "Cita",
};

const ESTADOS_ACTIVOS = ["en_espera", "llamando", "en_atencion"];
const ESTADOS_CANCELABLES = ["pendiente", "confirmado", "en_espera"];
const ESTADOS_ANTERIORES = ["completado", "cancelado", "no_presentado"];

// ── Ícono SVG calendario ─────────────────────────────────────────
function IcoCalendario() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IcoReloj() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── Tarjeta de turno activo/próximo ──────────────────────────────
function TarjetaActiva({ turno, destacadoId, checkinEnCurso, onCheckin, onCancelar }) {
  const esNuevo = Number(turno.id) === Number(destacadoId);
  const esLlamando = turno.estado === "llamando";
  const esCita = turno.modalidad === "cita";
  const esEnEspera = turno.estado === "en_espera";
  const esConfirmado = ["confirmado", "pendiente"].includes(turno.estado);

  return (
    <div className={`turno-active-card ${esLlamando ? "card-llamando" : ""} ${esNuevo ? "card-nuevo" : ""}`}>
      {esLlamando && (
        <div className="llamando-pulse-bar" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      )}

      <div className="active-card-header">
        <div className="active-card-id-group">
          <span className="codigo-turno-badge grande">{turno.codigo_turno || `#${turno.id}`}</span>
          {esNuevo && <span className="nuevo-pill-tag">Nuevo</span>}
          <span className={`modalidad-tag ${turno.modalidad}`}>
            {LABEL_MODALIDAD[turno.modalidad] || turno.modalidad}
          </span>
        </div>
        <span className={`estado ${turno.estado}`}>{LABEL_ESTADO[turno.estado] || turno.estado}</span>
      </div>

      <div className="active-card-service">{turno.servicio}</div>

      <div className="active-card-meta">
        {turno.fecha && (
          <span className="meta-chip">
            <IcoCalendario />
            {turno.fecha}
          </span>
        )}
        {turno.hora && (
          <span className="meta-chip">
            <IcoReloj />
            {turno.hora}
          </span>
        )}
        {turno.modulo && (
          <span className="meta-chip meta-chip--modulo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {turno.modulo}
          </span>
        )}
        {turno.duracion_estimada_min && (
          <span className="meta-chip meta-chip--dur">~{turno.duracion_estimada_min} min</span>
        )}
      </div>

      {/* Estado de cola para turno en espera */}
      {esEnEspera && (
        <div className="active-card-cola">
          <div className="cola-stat">
            <span className="cola-num">{turno.personas_antes ?? 0}</span>
            <span className="cola-lbl">persona{turno.personas_antes !== 1 ? "s" : ""} antes</span>
          </div>
          <div className="cola-sep" aria-hidden="true" />
          <div className="cola-stat">
            <span className="cola-num">~{turno.tiempo_estimado_min ?? 0}</span>
            <span className="cola-lbl">min estimados</span>
          </div>
          <span className="cola-live-dot" aria-label="Actualizando en vivo" />
        </div>
      )}

      {/* Llamando: mensaje urgente */}
      {esLlamando && (
        <div className="llamando-alert-box" role="alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <div>
            <strong>¡Es tu turno!</strong>
            {turno.modulo && <span> Dirígete a <strong>{turno.modulo}</strong></span>}
          </div>
        </div>
      )}

      {/* Cita futura confirmada: cuándo puede hacer check-in */}
      {esCita && esConfirmado && turno.mensaje && (
        <div className="cita-checkin-hint">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{turno.mensaje}</span>
        </div>
      )}

      {/* Motivo si existe */}
      {turno.motivo && (
        <div className="active-card-motivo">
          <span className="motivo-lbl">Tema:</span> {turno.motivo}
        </div>
      )}

      <div className="active-card-actions">
        {turno.puede_hacer_checkin && (
          <button
            type="button"
            id={`btn-checkin-${turno.id}`}
            className="btn-checkin-action"
            disabled={checkinEnCurso === turno.id}
            onClick={() => onCheckin(turno)}
          >
            {checkinEnCurso === turno.id
              ? <><span className="spinner-indicator small" aria-hidden="true" /> Ingresando...</>
              : "✅ Ingresar a la fila"}
          </button>
        )}
        {ESTADOS_CANCELABLES.includes(turno.estado) && (
          <button
            type="button"
            className="btn-cancelar-soft"
            onClick={() => onCancelar(turno)}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Fila de turno anterior (historial) ──────────────────────────
function FilaAnterior({ turno }) {
  return (
    <div className="historial-row">
      <div className="historial-row-main">
        <span className="codigo-turno-badge sm">{turno.codigo_turno || `#${turno.id}`}</span>
        <div className="historial-row-info">
          <span className="historial-service">{turno.servicio}</span>
          <div className="historial-meta">
            {turno.fecha && <span><IcoCalendario /> {turno.fecha}</span>}
            {turno.hora && <span><IcoReloj /> {turno.hora}</span>}
            <span className={`modalidad-tag sm ${turno.modalidad}`}>
              {LABEL_MODALIDAD[turno.modalidad] || turno.modalidad}
            </span>
          </div>
        </div>
      </div>
      <span className={`estado sm ${turno.estado}`}>{LABEL_ESTADO[turno.estado] || turno.estado}</span>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
function ConsultarTurnos() {
  const ubicacion = useLocation();
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [turnoACancelar, setTurnoACancelar] = useState(null);
  const [procesandoCancelacion, setProcesandoCancelacion] = useState(false);
  const [checkinEnCurso, setCheckinEnCurso] = useState(null);

  const [destacadoId, setDestacadoId] = useState(ubicacion.state?.nuevoTurnoId || null);
  const [infoRecienCreado, setInfoRecienCreado] = useState(
    ubicacion.state?.nuevoTurnoId
      ? {
          id: ubicacion.state.nuevoTurnoId,
          servicio: ubicacion.state.servicio,
          modalidad: ubicacion.state.modalidad,
          fecha: ubicacion.state.fecha,
          hora: ubicacion.state.hora,
          mensaje: ubicacion.state.mensajeExito || "¡Solicitud completada con éxito!",
        }
      : null
  );

  const pollingRef = useRef(null);

  const cargar = useCallback(() =>
    api("/turnos")
      .then(setTurnos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false)),
    []
  );

  useEffect(() => { cargar(); }, [cargar]);

  // Polling cada 10s si hay algún turno activo
  useEffect(() => {
    const hayActivos = turnos.some((t) => ESTADOS_ACTIVOS.includes(t.estado));
    if (hayActivos) {
      pollingRef.current = setInterval(cargar, 10000);
    } else {
      clearInterval(pollingRef.current);
    }
    return () => clearInterval(pollingRef.current);
  }, [turnos, cargar]);

  // Desvanece destaque
  useEffect(() => {
    if (!destacadoId) return undefined;
    const timer = setTimeout(() => setDestacadoId(null), 6000);
    return () => clearTimeout(timer);
  }, [destacadoId]);

  async function confirmarCancelar() {
    if (!turnoACancelar) return;
    setError("");
    setProcesandoCancelacion(true);
    try {
      await api(`/turnos/${turnoACancelar.id}/cancelar`, { method: "PATCH" });
      setTurnoACancelar(null);
      setCargando(true);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoCancelacion(false);
    }
  }

  async function hacerCheckin(turno) {
    setCheckinEnCurso(turno.id);
    setError("");
    try {
      await api(`/turnos/${turno.id}/checkin`, { method: "PATCH" });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckinEnCurso(null);
    }
  }

  // Separar turnos en secciones
  const turnosLlamando = turnos.filter((t) => t.estado === "llamando");
  const turnosEnAtencion = turnos.filter((t) => t.estado === "en_atencion");
  const turnosEnEspera = turnos.filter((t) => t.estado === "en_espera");
  const citasFuturas = turnos.filter((t) => ["confirmado", "pendiente"].includes(t.estado));
  const turnosAnteriores = turnos.filter((t) => ESTADOS_ANTERIORES.includes(t.estado));

  const hayActivos = turnosLlamando.length + turnosEnAtencion.length + turnosEnEspera.length + citasFuturas.length > 0;

  return (
    <div className="page-shell">
      <Navbar />

      <main className="consulta-main">
        <div className="consulta-shell">
          {/* Banner de turno recién creado */}
          {infoRecienCreado && (
            <div className="nuevo-turno-banner" role="status">
              <div className="banner-icon-badge" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="banner-content">
                <h3 className="banner-title">{infoRecienCreado.mensaje}</h3>
                <p className="banner-details">
                  {infoRecienCreado.modalidad === "turno"
                    ? <>Turno virtual <strong>{infoRecienCreado.servicio}</strong> generado. Ya estás en la fila activa.</>
                    : <>Cita <strong>{infoRecienCreado.servicio}</strong> el <strong>{infoRecienCreado.fecha}</strong> a las <strong>{infoRecienCreado.hora}</strong>.</>
                  }
                </p>
              </div>
              <button
                type="button"
                className="banner-close-btn"
                onClick={() => setInfoRecienCreado(null)}
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </div>
          )}

          <div className="consulta-header">
            <div>
              <h1 className="consulta-title">Mis Turnos</h1>
              <p className="consulta-subtitle">
                Estado en tiempo real de tus citas y turnos.
              </p>
            </div>
            <Link to="/solicitar-turno" className="btn-apple-primary btn-sm" id="btn-nuevo-turno">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo Turno
            </Link>
          </div>

          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: "20px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {cargando ? (
            <div className="loading-container">
              <div className="spinner-indicator large" aria-hidden="true"></div>
              <p>Consultando tus turnos…</p>
            </div>
          ) : turnos.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-icon-box" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h2 className="empty-title">Aún no tienes turnos registrados</h2>
              <p className="empty-desc">
                Cuando reserves una cita o tomes un turno, aparecerá aquí con todos sus detalles.
              </p>
              <Link to="/solicitar-turno" className="btn-apple-primary">
                Solicitar mi primer turno
              </Link>
            </div>
          ) : (
            <div className="turnos-secciones">

              {/* ── SECCIÓN: Activos (llamando, en atención, en espera) ── */}
              {hayActivos && (
                <section className="turnos-seccion" aria-label="Turnos activos">
                  <h2 className="seccion-titulo">
                    <span className="seccion-dot activo" aria-hidden="true"></span>
                    Turnos Activos
                    <span className="seccion-count">{turnosLlamando.length + turnosEnAtencion.length + turnosEnEspera.length}</span>
                  </h2>
                  <div className="active-cards-grid">
                    {[...turnosLlamando, ...turnosEnAtencion, ...turnosEnEspera].map((turno) => (
                      <TarjetaActiva
                        key={turno.id}
                        turno={turno}
                        destacadoId={destacadoId}
                        checkinEnCurso={checkinEnCurso}
                        onCheckin={hacerCheckin}
                        onCancelar={setTurnoACancelar}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── SECCIÓN: Citas futuras / confirmadas ── */}
              {citasFuturas.length > 0 && (
                <section className="turnos-seccion" aria-label="Próximas citas">
                  <h2 className="seccion-titulo">
                    <span className="seccion-dot proximo" aria-hidden="true"></span>
                    Próximas Citas
                    <span className="seccion-count">{citasFuturas.length}</span>
                  </h2>
                  <div className="active-cards-grid">
                    {citasFuturas.map((turno) => (
                      <TarjetaActiva
                        key={turno.id}
                        turno={turno}
                        destacadoId={destacadoId}
                        checkinEnCurso={checkinEnCurso}
                        onCheckin={hacerCheckin}
                        onCancelar={setTurnoACancelar}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── SECCIÓN: Historial ── */}
              {turnosAnteriores.length > 0 && (
                <section className="turnos-seccion" aria-label="Historial de turnos">
                  <h2 className="seccion-titulo">
                    <span className="seccion-dot anterior" aria-hidden="true"></span>
                    Historial
                    <span className="seccion-count">{turnosAnteriores.length}</span>
                  </h2>
                  <div className="historial-lista">
                    {turnosAnteriores.map((turno) => (
                      <FilaAnterior key={turno.id} turno={turno} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Modal de cancelación */}
          {turnoACancelar && (
            <div className="modal-backdrop" onClick={() => !procesandoCancelacion && setTurnoACancelar(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon warning">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 className="modal-title">¿Cancelar este turno?</h3>
                <p className="modal-desc">
                  Estás a punto de cancelar{" "}
                  <strong>{turnoACancelar.codigo_turno || `#${turnoACancelar.id}`}</strong> para{" "}
                  <strong>{turnoACancelar.servicio}</strong>
                  {turnoACancelar.modalidad === "cita" && turnoACancelar.fecha
                    ? ` el ${turnoACancelar.fecha} a las ${turnoACancelar.hora}.`
                    : "."
                  }
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={procesandoCancelacion}
                    onClick={() => setTurnoACancelar(null)}
                  >
                    Mantener
                  </button>
                  <button
                    type="button"
                    className="btn-modal-danger"
                    disabled={procesandoCancelacion}
                    onClick={confirmarCancelar}
                  >
                    {procesandoCancelacion ? "Cancelando…" : "Sí, cancelar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default ConsultarTurnos;
