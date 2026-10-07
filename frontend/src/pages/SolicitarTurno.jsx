import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import "../styles/SolicitarTurno.css";

// Fecha mínima en timezone Colombia (usa toLocaleDateString para evitar drift de UTC)
function fechaMinimaBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const LABEL_MODALIDAD = {
  turno: "Turno Virtual",
  cita: "Cita Programada",
};

const ICON_MODALIDAD = {
  turno: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  cita: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

function SolicitarTurno() {
  const navegar = useNavigate();
  const [servicios, setServicios] = useState([]);
  const [servicioId, setServicioId] = useState("");
  const [modalidadElegida, setModalidadElegida] = useState(""); // solo para turno_y_cita
  const [fecha, setFecha] = useState("");
  const [horaSeleccionada, setHoraSeleccionada] = useState("");
  const [motivo, setMotivo] = useState("");

  const [disponibilidad, setDisponibilidad] = useState(null); // { horarios_disponibles, ocupados, quedan_horarios, mensaje }
  const [cargandoDisp, setCargandoDisp] = useState(false);

  const [mensajeExito, setMensajeExito] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const timerRedirect = useRef(null);
  const fechaMinima = fechaMinimaBogota();

  useEffect(() => {
    api("/servicios")
      .then(setServicios)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    return () => { if (timerRedirect.current) clearTimeout(timerRedirect.current); };
  }, []);

  // Consultar disponibilidad cuando hay servicio + fecha para modalidad cita
  useEffect(() => {
    let cancelado = false;

    async function fetchDisponibilidad() {
      const svc = servicios.find((s) => String(s.id) === String(servicioId));
      const mod = modEfectivaCalculada(svc, modalidadElegida);

      if (!servicioId || !fecha || mod !== "cita") {
        if (!cancelado) setDisponibilidad(null);
        return;
      }

      if (!cancelado) setCargandoDisp(true);
      try {
        const datos = await api(
          `/turnos/disponibilidad?fecha=${encodeURIComponent(fecha)}&servicioId=${encodeURIComponent(servicioId)}`
        );
        if (!cancelado) setDisponibilidad(datos);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargandoDisp(false);
      }
    }

    fetchDisponibilidad();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicioId, fecha, modalidadElegida]);

  const servicio = servicios.find((s) => String(s.id) === String(servicioId));

  function modEfectivaCalculada(svc, modEleg) {
    if (!svc) return "";
    if (svc.modalidad === "turno") return "turno";
    if (svc.modalidad === "cita") return "cita";
    // turno_y_cita: depende de la elección
    return modEleg || "";
  }

  const modEfectiva = modEfectivaCalculada(servicio, modalidadElegida);

  function resetServicio() {
    setServicioId("");
    setModalidadElegida("");
    setFecha("");
    setHoraSeleccionada("");
    setMotivo("");
    setDisponibilidad(null);
    setError("");
  }

  function handleServicioChange(id) {
    const svc = servicios.find((s) => String(s.id) === String(id));
    setServicioId(id);
    setModalidadElegida(svc?.modalidad === "turno_y_cita" ? "" : "");
    setFecha("");
    setHoraSeleccionada("");
    setMotivo("");
    setDisponibilidad(null);
    setError("");
  }

  async function enviar(evento) {
    evento.preventDefault();
    setMensajeExito(null);
    setError("");
    setCargando(true);

    try {
      const body = {
        servicioId: Number(servicioId),
        modalidad: modEfectiva,
      };
      if (modEfectiva === "cita") {
        body.fecha = fecha;
        body.hora = horaSeleccionada;
      }
      if (motivo.trim()) body.motivo = motivo.trim();

      const respuesta = await api("/turnos", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const detalle = {
        id: respuesta.id,
        codigo_turno: respuesta.codigo_turno,
        servicio: servicio?.nombre || "Servicio",
        modalidad: respuesta.modalidad,
        fecha: respuesta.fecha || fecha,
        hora: respuesta.hora || horaSeleccionada,
        mensaje: respuesta.mensaje || "¡Solicitud completada con éxito!",
      };

      setMensajeExito(detalle);

      timerRedirect.current = setTimeout(() => {
        navegar("/consultar-turnos", {
          replace: true,
          state: {
            nuevoTurnoId: respuesta.id,
            servicio: detalle.servicio,
            modalidad: detalle.modalidad,
            fecha: detalle.fecha,
            hora: detalle.hora,
            mensajeExito: detalle.mensaje,
          },
        });
      }, 1800);
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  }

  // ── Condiciones para habilitar el botón
  const puedeEnviar = (() => {
    if (!servicioId || cargando || mensajeExito) return false;
    if (servicio?.modalidad === "turno_y_cita" && !modalidadElegida) return false;
    if (modEfectiva === "cita") {
      if (!fecha || !horaSeleccionada) return false;
      if (servicio?.requiere_tema && !motivo.trim()) return false;
    }
    if (modEfectiva === "turno") {
      if (servicio?.requiere_tema && !motivo.trim()) return false;
    }
    return true;
  })();

  const pasoActual = (() => {
    if (!servicioId) return 1;
    if (servicio?.modalidad === "turno_y_cita" && !modalidadElegida) return 2;
    if (modEfectiva === "cita" && !fecha) return 3;
    if (modEfectiva === "cita" && !horaSeleccionada) return 4;
    return 5;
  })();

  return (
    <div className="page-shell">
      <Navbar />

      <main className="turno-main-container">
        <div className="turno-shell">
          <div className="turno-page-header">
            <span className="turno-eyebrow">Agendamiento en línea</span>
            <h1 className="turno-title">Solicitar un Turno</h1>
            <p className="turno-desc">
              Selecciona el servicio y el tipo de atención que necesitas.
            </p>
          </div>

          <div className="turno-card-wrapper">
            <form onSubmit={enviar} className="turno-form">

              {/* ── PASO 1: Servicio ── */}
              <div className="form-section">
                <label className="section-label" htmlFor="servicio-select">
                  <span className={`step-badge ${pasoActual >= 1 ? "active" : ""}`}>1</span>
                  Tipo de Servicio
                </label>
                <div className="select-container">
                  <select
                    id="servicio-select"
                    className="apple-select"
                    value={servicioId}
                    onChange={(e) => handleServicioChange(e.target.value)}
                    required
                    disabled={Boolean(mensajeExito)}
                  >
                    <option value="">Selecciona un servicio</option>
                    {servicios.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.nombre} — {svc.duracion_estimada_min} min
                      </option>
                    ))}
                  </select>
                </div>

                {/* Info del servicio seleccionado */}
                {servicio && (
                  <div className="servicio-info-card">
                    <div className="servicio-info-row">
                      <span className="servicio-info-pill">
                        {ICON_MODALIDAD[servicio.modalidad === "turno_y_cita" ? "cita" : servicio.modalidad]}
                        {servicio.modalidad === "turno" && "Turno Virtual Inmediato"}
                        {servicio.modalidad === "cita" && "Solo Cita Programada"}
                        {servicio.modalidad === "turno_y_cita" && "Turno Virtual o Cita Programada"}
                      </span>
                      <span className="servicio-duracion-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        ~{servicio.duracion_estimada_min} min
                      </span>
                    </div>
                    {servicio.descripcion && (
                      <p className="servicio-descripcion">{servicio.descripcion}</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── PASO 2: Elegir modalidad (solo para turno_y_cita) ── */}
              {servicio?.modalidad === "turno_y_cita" && !mensajeExito && (
                <div className="form-section">
                  <label className="section-label">
                    <span className={`step-badge ${pasoActual >= 2 ? "active" : ""}`}>2</span>
                    Tipo de Atención
                  </label>
                  <div className="modalidad-selector">
                    <button
                      type="button"
                      className={`modalidad-option ${modalidadElegida === "turno" ? "selected" : ""}`}
                      onClick={() => { setModalidadElegida("turno"); setFecha(""); setHoraSeleccionada(""); setDisponibilidad(null); }}
                    >
                      <div className="modalidad-icon">
                        {ICON_MODALIDAD.turno}
                      </div>
                      <div className="modalidad-text">
                        <span className="modalidad-name">Turno Virtual</span>
                        <span className="modalidad-desc">Ingresa a la fila de atención de hoy</span>
                      </div>
                      {modalidadElegida === "turno" && (
                        <span className="modalidad-check" aria-hidden="true">✓</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`modalidad-option ${modalidadElegida === "cita" ? "selected" : ""}`}
                      onClick={() => { setModalidadElegida("cita"); setHoraSeleccionada(""); }}
                    >
                      <div className="modalidad-icon">
                        {ICON_MODALIDAD.cita}
                      </div>
                      <div className="modalidad-text">
                        <span className="modalidad-name">Cita Programada</span>
                        <span className="modalidad-desc">Agenda un horario específico</span>
                      </div>
                      {modalidadElegida === "cita" && (
                        <span className="modalidad-check" aria-hidden="true">✓</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TURNO VIRTUAL: Banner informativo ── */}
              {modEfectiva === "turno" && !mensajeExito && (
                <div className="turno-virtual-info-box">
                  <div className="turno-virtual-icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="turno-virtual-texto">
                    <strong>Turno virtual para hoy</strong>
                    <p>Al confirmar, ingresarás directamente a la fila de espera activa. Podrás ver cuántas personas hay antes que tú y el tiempo estimado de espera.</p>
                  </div>
                </div>
              )}

              {/* ── MOTIVO (si el servicio lo requiere y la modalidad ya fue elegida) ── */}
              {modEfectiva && servicio?.requiere_tema && !mensajeExito && (
                <div className="form-section">
                  <label className="section-label" htmlFor="motivo-input">
                    <span className={`step-badge ${pasoActual >= (servicio?.modalidad === "turno_y_cita" ? 3 : 2) ? "active" : ""}`}>
                      {servicio?.modalidad === "turno_y_cita" ? 3 : 2}
                    </span>
                    Tema de la consulta
                    <span className="label-required">*</span>
                  </label>
                  <input
                    id="motivo-input"
                    type="text"
                    className="apple-date-input"
                    value={motivo}
                    maxLength={255}
                    placeholder="Ej: Solicitud de crédito de vivienda, refinanciación..."
                    onChange={(e) => setMotivo(e.target.value)}
                    required
                    disabled={Boolean(mensajeExito)}
                  />
                </div>
              )}

              {/* ── CITA: Fecha ── */}
              {modEfectiva === "cita" && !mensajeExito && (
                <div className="form-section">
                  <label className="section-label" htmlFor="fecha-input">
                    <span className={`step-badge ${fecha ? "active" : ""}`}>
                      {servicio?.modalidad === "turno_y_cita" ? (servicio?.requiere_tema ? 4 : 3) : (servicio?.requiere_tema ? 3 : 2)}
                    </span>
                    Fecha de la Cita
                  </label>
                  <input
                    id="fecha-input"
                    className="apple-date-input"
                    type="date"
                    min={fechaMinima}
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setHoraSeleccionada("");
                      setDisponibilidad(null);
                    }}
                    required
                    disabled={Boolean(mensajeExito)}
                  />
                </div>
              )}

              {/* ── CITA: Horarios disponibles ── */}
              {modEfectiva === "cita" && fecha && !mensajeExito && (
                <div className="form-section">
                  <div className="section-label-row">
                    <label className="section-label">
                      <span className={`step-badge ${horaSeleccionada ? "active" : ""}`}>
                        {servicio?.modalidad === "turno_y_cita" ? (servicio?.requiere_tema ? 5 : 4) : (servicio?.requiere_tema ? 4 : 3)}
                      </span>
                      Horario Disponible
                    </label>
                    {cargandoDisp && (
                      <span className="availability-loading">
                        <span className="spinner-indicator small" aria-hidden="true"></span>
                        Verificando horarios...
                      </span>
                    )}
                  </div>

                  {!cargandoDisp && disponibilidad && disponibilidad.horarios_disponibles?.length === 0 && (
                    <div className="slot-hint-box slot-hint-empty">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{disponibilidad.mensaje || "No hay horarios disponibles para esta fecha."}</span>
                    </div>
                  )}

                  {!cargandoDisp && disponibilidad && disponibilidad.horarios_disponibles?.length > 0 && (
                    <>
                      <div className="time-slots-grid" role="radiogroup" aria-label="Selección de hora">
                        {disponibilidad.horarios_disponibles.map((hora) => {
                          const seleccionado = horaSeleccionada === hora;
                          return (
                            <button
                              key={hora}
                              type="button"
                              role="radio"
                              aria-checked={seleccionado}
                              className={`time-chip ${seleccionado ? "selected" : ""}`}
                              onClick={() => setHoraSeleccionada(hora)}
                              title={`Seleccionar ${hora}`}
                              disabled={Boolean(mensajeExito)}
                            >
                              <span className="time-text">{hora}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="slots-count-hint">
                        {disponibilidad.horarios_disponibles.length} horario{disponibilidad.horarios_disponibles.length !== 1 ? "s" : ""} disponible{disponibilidad.horarios_disponibles.length !== 1 ? "s" : ""} · duración: ~{servicio?.duracion_estimada_min} min c/u
                      </p>
                    </>
                  )}

                  {!cargandoDisp && !disponibilidad && (
                    <div className="slot-hint-box">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>Cargando horarios disponibles...</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Resumen previo a confirmar ── */}
              {puedeEnviar && !mensajeExito && (
                <div className="booking-summary-card">
                  <div className="summary-title">Resumen de tu solicitud</div>
                  <div className="summary-details">
                    <div>
                      <span className="summary-lbl">Servicio:</span> {servicio?.nombre}
                    </div>
                    <div>
                      <span className="summary-lbl">Tipo:</span> {LABEL_MODALIDAD[modEfectiva] || modEfectiva}
                    </div>
                    {modEfectiva === "cita" && fecha && (
                      <div><span className="summary-lbl">Fecha:</span> {fecha}</div>
                    )}
                    {modEfectiva === "cita" && horaSeleccionada && (
                      <div><span className="summary-lbl">Hora:</span> {horaSeleccionada}</div>
                    )}
                    {motivo.trim() && (
                      <div><span className="summary-lbl">Tema:</span> {motivo.trim()}</div>
                    )}
                    {modEfectiva === "turno" && (
                      <div className="summary-turno-nota">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Ingresarás directamente a la fila de hoy
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Mensaje de Éxito ── */}
              {mensajeExito && (
                <div className="turno-success-banner" role="status">
                  <div className="success-banner-top">
                    <div className="success-icon-badge" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="success-banner-title">
                        {mensajeExito.modalidad === "turno" ? "¡Turno virtual generado!" : "¡Cita confirmada!"}
                      </h3>
                      <p className="success-banner-sub">{mensajeExito.mensaje}</p>
                    </div>
                  </div>

                  <div className="success-banner-details">
                    <div className="success-detail-pill">
                      <span className="detail-lbl">Código:</span> {mensajeExito.codigo_turno}
                    </div>
                    <div className="success-detail-pill">
                      <span className="detail-lbl">Servicio:</span> {mensajeExito.servicio}
                    </div>
                    {mensajeExito.modalidad === "cita" && mensajeExito.fecha && (
                      <div className="success-detail-pill">
                        <span className="detail-lbl">Fecha:</span> {mensajeExito.fecha}
                      </div>
                    )}
                    {mensajeExito.modalidad === "cita" && mensajeExito.hora && (
                      <div className="success-detail-pill">
                        <span className="detail-lbl">Hora:</span> {mensajeExito.hora}
                      </div>
                    )}
                  </div>

                  <div className="success-redirecting-box">
                    <span className="spinner-indicator" aria-hidden="true"></span>
                    <span>Redirigiendo a tu lista de turnos...</span>
                  </div>
                </div>
              )}

              {/* ── Error ── */}
              {error && (
                <div className="form-error" role="alert">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* ── Botón submit ── */}
              {!mensajeExito && (
                <button
                  type="submit"
                  id="btn-confirmar-turno"
                  className="btn-submit-turno"
                  disabled={!puedeEnviar}
                >
                  {cargando ? (
                    <span className="btn-loading-state">
                      <span className="spinner-indicator" aria-hidden="true"></span>
                      Confirmando...
                    </span>
                  ) : modEfectiva === "turno" ? (
                    "Ingresar a la Fila Ahora"
                  ) : modEfectiva === "cita" ? (
                    "Confirmar Cita"
                  ) : (
                    "Continuar"
                  )}
                </button>
              )}

              {mensajeExito && (
                <button
                  type="button"
                  className="btn-submit-turno"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  onClick={resetServicio}
                >
                  Solicitar otro turno
                </button>
              )}

            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default SolicitarTurno;
