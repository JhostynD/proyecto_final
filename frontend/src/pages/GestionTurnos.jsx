import { useCallback, useEffect, useRef, useState } from "react";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api";
import "../styles/GestionTurnos.css";

// ── Helpers ──────────────────────────────────────────────────────
const LABEL_ESTADO = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_espera: "En espera",
  llamando: "Llamando",
  en_atencion: "En atención",
  completado: "Completado",
  cancelado: "Cancelado",
  no_presentado: "No se presentó",
};

const LABEL_MODALIDAD = {
  turno: "Turno Virtual",
  cita: "Cita",
};

const etiquetaEstado = (estado) => LABEL_ESTADO[estado] || estado;

// ── GestionTurnos ─────────────────────────────────────────────────
function GestionTurnos() {
  const [vista, setVista] = useState("cola"); // "cola" | "historial"

  return (
    <div className="page-shell">
      <div className="admin-layout">
        <AdminSidebar />
        <main className="turnos-admin-container">
          <div className="admin-page-header">
            <div>
              <span className="admin-breadcrumb">Administración / Operaciones</span>
              <h1 className="admin-title-heading">Gestión de Turnos</h1>
              <p className="admin-desc">
                Controla la cola en vivo y gestiona el historial completo de turnos.
              </p>
            </div>
          </div>

          {/* Tab selector */}
          <div className="segmented-filter-bar" role="tablist" aria-label="Vista">
            <button
              type="button"
              role="tab"
              aria-selected={vista === "cola"}
              className={`segmented-filter-btn ${vista === "cola" ? "active" : ""}`}
              onClick={() => setVista("cola")}
            >
              🟢 Cola en Vivo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "historial"}
              className={`segmented-filter-btn ${vista === "historial" ? "active" : ""}`}
              onClick={() => setVista("historial")}
            >
              📋 Historial
            </button>
          </div>

          {vista === "cola" ? <ColaEnVivo /> : <Historial />}
        </main>
      </div>
      <Footer />
    </div>
  );
}

// ── ColaEnVivo ────────────────────────────────────────────────────
function ColaEnVivo() {
  const [cola, setCola] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modulo, setModulo] = useState("Módulo 1");
  const [servicioFiltro] = useState(""); // reservado para filtro futuro por servicio
  const [llamando, setLlamando] = useState(false);
  const [mensajeLlamado, setMensajeLlamado] = useState("");
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const intervalRef = useRef(null);

  const cargar = useCallback(() => {
    api("/admin/cola")
      .then((datos) => { setCola(datos); setError(""); })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
    intervalRef.current = setInterval(cargar, 8000);
    return () => clearInterval(intervalRef.current);
  }, [cargar]);

  async function llamarSiguiente() {
    setLlamando(true);
    setMensajeLlamado("");
    setError("");
    try {
      const body = { modulo };
      if (servicioFiltro) body.servicioId = Number(servicioFiltro);
      const resp = await api("/admin/cola/llamar-siguiente", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMensajeLlamado(resp.mensaje);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setLlamando(false);
    }
  }

  async function cambiarEstado(id, estado, moduloOp) {
    setAccionEnCurso(id);
    setError("");
    try {
      await api(`/admin/turnos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado, modulo: moduloOp }),
      });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(null);
    }
  }

  if (cargando && !cola) {
    return (
      <div className="loading-container">
        <div className="spinner-indicator large" aria-hidden="true"></div>
        <p>Cargando cola del día…</p>
      </div>
    );
  }

  const resumen = cola?.resumen || {};
  const enEspera = cola?.en_espera || [];
  const llamandoList = cola?.llamando || [];
  const enAtencion = cola?.en_atencion || [];
  const confirmados = (cola?.turnos || []).filter(
    (t) => t.estado === "confirmado" || t.estado === "pendiente"
  );
  const finalizados = (cola?.turnos || []).filter(
    (t) => t.estado === "completado" || t.estado === "cancelado" || t.estado === "no_presentado"
  );

  return (
    <>
      {error && (
        <div className="form-error" role="alert" style={{ marginBottom: 20 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {mensajeLlamado && (
        <div className="form-success" role="status" style={{ marginBottom: 20 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{mensajeLlamado}</span>
        </div>
      )}

      {/* KPI bar */}
      <div className="cola-kpi-bar">
        <div className="cola-kpi-chip en-espera">
          <span className="cola-kpi-num">{resumen.en_espera ?? 0}</span>
          <span className="cola-kpi-lbl">En espera</span>
        </div>
        <div className="cola-kpi-chip llamando">
          <span className="cola-kpi-num">{resumen.llamando ?? 0}</span>
          <span className="cola-kpi-lbl">Llamando</span>
        </div>
        <div className="cola-kpi-chip en-atencion">
          <span className="cola-kpi-num">{resumen.en_atencion ?? 0}</span>
          <span className="cola-kpi-lbl">En atención</span>
        </div>
        <div className="cola-kpi-chip confirmados">
          <span className="cola-kpi-num">{resumen.confirmados ?? 0}</span>
          <span className="cola-kpi-lbl">Citas hoy</span>
        </div>
        <div className="cola-kpi-chip completados">
          <span className="cola-kpi-num">{resumen.completados ?? 0}</span>
          <span className="cola-kpi-lbl">Completados</span>
        </div>
      </div>

      {/* Llamar siguiente */}
      <div className="llamar-siguiente-panel">
        <div className="llamar-siguiente-inner">
          <div className="llamar-controls">
            <label htmlFor="modulo-input" className="llamar-label">Módulo / Ventanilla</label>
            <input
              id="modulo-input"
              type="text"
              value={modulo}
              onChange={(e) => setModulo(e.target.value)}
              placeholder="Ej: Módulo 1, Caja 3…"
              className="llamar-modulo-input"
            />
          </div>
          <button
            type="button"
            id="btn-llamar-siguiente"
            className="btn-llamar-siguiente"
            disabled={llamando || enEspera.length === 0}
            onClick={llamarSiguiente}
          >
            {llamando ? (
              <>
                <span className="spinner-indicator small" aria-hidden="true"></span>
                Llamando…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Llamar siguiente
              </>
            )}
          </button>
        </div>
        {enEspera.length === 0 && (
          <p className="cola-vacia-hint">No hay usuarios en la fila de espera activa.</p>
        )}
      </div>

      {/* Llamando ahora */}
      {llamandoList.length > 0 && (
        <ColaSeccion
          titulo="🔔 Llamando ahora"
          turnos={llamandoList}
          accionEnCurso={accionEnCurso}
          onAccion={cambiarEstado}
          acciones={(t) => [
            { label: "En atención", estado: "en_atencion", modulo: t.modulo, clase: "btn-action-complete" },
            { label: "No se presentó", estado: "no_presentado", clase: "btn-action-cancel" },
            { label: "Devolver a espera", estado: "en_espera", clase: "btn-action-secondary" },
          ]}
        />
      )}

      {enAtencion.length > 0 && (
        <ColaSeccion
          titulo="💼 En atención"
          turnos={enAtencion}
          accionEnCurso={accionEnCurso}
          onAccion={cambiarEstado}
          acciones={() => [
            { label: "Completar", estado: "completado", clase: "btn-action-complete" },
            { label: "Cancelar", estado: "cancelado", clase: "btn-action-cancel" },
          ]}
        />
      )}

      {enEspera.length > 0 && (
        <ColaSeccion
          titulo="⏳ En espera"
          turnos={enEspera}
          accionEnCurso={accionEnCurso}
          onAccion={cambiarEstado}
          acciones={() => [
            { label: "Cancelar", estado: "cancelado", clase: "btn-action-cancel" },
          ]}
        />
      )}

      {confirmados.length > 0 && (
        <ColaSeccion
          titulo="📅 Citas confirmadas (aún no en sala)"
          turnos={confirmados}
          accionEnCurso={accionEnCurso}
          onAccion={cambiarEstado}
          acciones={() => [
            { label: "Poner en espera", estado: "en_espera", clase: "btn-action-confirm" },
            { label: "Cancelar", estado: "cancelado", clase: "btn-action-cancel" },
          ]}
          compacto
        />
      )}

      {enEspera.length === 0 && llamandoList.length === 0 && enAtencion.length === 0 && confirmados.length === 0 && (
        <div className="empty-state-card" style={{ border: "none", boxShadow: "none" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            No hay turnos activos en este momento para hoy.
          </p>
        </div>
      )}

      {finalizados.length > 0 && (
        <details className="finalizados-collapse">
          <summary className="finalizados-summary">
            Ver finalizados del día ({finalizados.length})
          </summary>
          <div className="finalizados-list">
            {finalizados.map((t) => (
              <div key={t.id} className="finalizado-row">
                <span className="cell-id">{t.codigo_turno || `#${t.id}`}</span>
                <span className="finalizado-user">{t.usuario}</span>
                <span className="finalizado-service">{t.servicio}</span>
                <span className={`modalidad-badge-sm ${t.modalidad}`}>
                  {LABEL_MODALIDAD[t.modalidad] || t.modalidad}
                </span>
                <span className={`estado ${t.estado}`}>{etiquetaEstado(t.estado)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="cola-refresh-hint">Actualización automática cada 8 s</p>
    </>
  );
}

// ── ColaSeccion ──────────────────────────────────────────────────
function ColaSeccion({ titulo, turnos, accionEnCurso, onAccion, acciones, compacto }) {
  return (
    <div className={`cola-seccion ${compacto ? "compacto" : ""}`}>
      <h2 className="cola-seccion-titulo">{titulo}</h2>
      <div className="cola-cards-grid">
        {turnos.map((t) => (
          <div key={t.id} className="cola-turno-card">
            <div className="cola-card-top">
              <span className="cola-codigo">{t.codigo_turno || `#${t.id}`}</span>
              <div className="cola-card-badges">
                <span className={`modalidad-badge-sm ${t.modalidad}`}>
                  {LABEL_MODALIDAD[t.modalidad] || t.modalidad}
                </span>
                <span className={`estado ${t.estado}`}>{etiquetaEstado(t.estado)}</span>
              </div>
            </div>
            <div className="cola-card-user">{t.usuario}</div>
            <div className="cola-card-service">{t.servicio}</div>

            {/* Duración estimada */}
            {t.duracion_estimada_min && (
              <div className="cola-card-duracion">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                ~{t.duracion_estimada_min} min
              </div>
            )}

            {/* Motivo si existe */}
            {t.motivo && (
              <div className="cola-card-motivo">
                <span className="motivo-lbl">Tema:</span> {t.motivo}
              </div>
            )}

            <div className="cola-card-meta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {t.hora}
              {t.modulo && (
                <>
                  <span className="dot-sep" aria-hidden="true">·</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  {t.modulo}
                </>
              )}
            </div>
            <div className="cola-card-actions">
              {acciones(t).map((a) => (
                <button
                  key={a.estado}
                  type="button"
                  className={a.clase}
                  disabled={accionEnCurso === t.id}
                  onClick={() => onAccion(t.id, a.estado, a.modulo)}
                >
                  {accionEnCurso === t.id ? "…" : a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────────
function Historial() {
  const [turnos, setTurnos] = useState([]);
  const [filtro, setFiltro] = useState("todos");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState(null);

  const cargar = () =>
    api("/admin/resumen")
      .then((datos) => setTurnos(datos.turnos || []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));

  useEffect(() => { cargar(); }, []);

  async function actualizar(id, estado) {
    setError("");
    setAccionEnCurso(id);
    try {
      await api(`/admin/turnos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(null);
    }
  }

  const FILTROS = ["todos", "pendiente", "confirmado", "en_espera", "llamando", "en_atencion", "completado", "cancelado", "no_presentado"];

  const turnosFiltrados = filtro === "todos"
    ? turnos
    : turnos.filter((t) => t.estado === filtro);

  return (
    <>
      {error && (
        <div className="form-error" role="alert" style={{ marginBottom: 20 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="segmented-filter-bar" role="tablist" aria-label="Filtrar por estado" style={{ marginBottom: 24 }}>
        {FILTROS.map((opcion) => (
          <button
            key={opcion}
            type="button"
            className={`segmented-filter-btn ${filtro === opcion ? "active" : ""}`}
            onClick={() => setFiltro(opcion)}
          >
            {etiquetaEstado(opcion) === opcion
              ? opcion.charAt(0).toUpperCase() + opcion.slice(1)
              : etiquetaEstado(opcion)}
          </button>
        ))}
      </div>

      <div className="turnos-table-wrapper">
        {cargando ? (
          <div className="loading-container">
            <div className="spinner-indicator large" aria-hidden="true"></div>
            <p>Cargando lista de turnos…</p>
          </div>
        ) : turnosFiltrados.length === 0 ? (
          <div className="empty-state-card" style={{ border: "none", boxShadow: "none" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
              No se encontraron turnos con el filtro seleccionado.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="table-responsive desktop-only">
              <table className="apple-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Tipo</th>
                    <th>Usuario</th>
                    <th>Servicio</th>
                    <th>Motivo</th>
                    <th>Fecha y Hora</th>
                    <th>Duración</th>
                    <th>Módulo</th>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {turnosFiltrados.map((turno) => (
                    <tr key={turno.id}>
                      <td className="cell-id">{turno.codigo_turno || `#${turno.id}`}</td>
                      <td>
                        <span className={`modalidad-badge-sm ${turno.modalidad}`}>
                          {LABEL_MODALIDAD[turno.modalidad] || turno.modalidad}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{turno.usuario}</td>
                      <td>{turno.servicio}</td>
                      <td>
                        {turno.motivo
                          ? <span className="motivo-cell" title={turno.motivo}>{turno.motivo}</span>
                          : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td>
                        {turno.fecha} <span className="time-subtle">({turno.hora})</span>
                      </td>
                      <td>
                        {turno.duracion_estimada_min
                          ? `~${turno.duracion_estimada_min} min`
                          : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td>{turno.modulo || <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                      <td>
                        <span className={`estado ${turno.estado}`}>{etiquetaEstado(turno.estado)}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="admin-actions-group">
                          {turno.estado === "pendiente" && (
                            <button type="button" className="btn-action-confirm" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "confirmado")}>Confirmar</button>
                          )}
                          {turno.estado === "confirmado" && (
                            <button type="button" className="btn-action-confirm" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "en_espera")}>→ En espera</button>
                          )}
                          {turno.estado === "en_espera" && (
                            <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "llamando")}>Llamar</button>
                          )}
                          {turno.estado === "llamando" && (
                            <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "en_atencion")}>En atención</button>
                          )}
                          {turno.estado === "en_atencion" && (
                            <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "completado")}>Completar</button>
                          )}
                          {!["cancelado", "completado", "no_presentado"].includes(turno.estado) && (
                            <button type="button" className="btn-action-cancel" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "cancelado")}>Cancelar</button>
                          )}
                          {["cancelado", "completado", "no_presentado"].includes(turno.estado) && (
                            <span className="final-state-lbl">Finalizado</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-cards-list mobile-only">
              {turnosFiltrados.map((turno) => (
                <div key={turno.id} className="admin-turno-mobile-card">
                  <div className="admin-card-top">
                    <span className="cell-id">{turno.codigo_turno || `#${turno.id}`}</span>
                    <div className="admin-card-badges">
                      <span className={`modalidad-badge-sm ${turno.modalidad}`}>
                        {LABEL_MODALIDAD[turno.modalidad] || turno.modalidad}
                      </span>
                      <span className={`estado ${turno.estado}`}>{etiquetaEstado(turno.estado)}</span>
                    </div>
                  </div>
                  <div className="admin-card-user">{turno.usuario}</div>
                  <div className="admin-card-service">{turno.servicio}</div>
                  {turno.motivo && (
                    <div className="admin-card-motivo">
                      <span className="motivo-lbl">Tema:</span> {turno.motivo}
                    </div>
                  )}
                  <div className="admin-card-schedule">{turno.fecha} a las {turno.hora}{turno.duracion_estimada_min ? ` · ~${turno.duracion_estimada_min} min` : ""}</div>
                  {turno.modulo && <div className="admin-card-schedule">{turno.modulo}</div>}
                  <div className="admin-mobile-actions">
                    {turno.estado === "pendiente" && (
                      <button type="button" className="btn-action-confirm" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "confirmado")}>Confirmar</button>
                    )}
                    {turno.estado === "confirmado" && (
                      <button type="button" className="btn-action-confirm" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "en_espera")}>→ En espera</button>
                    )}
                    {turno.estado === "en_espera" && (
                      <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "llamando")}>Llamar</button>
                    )}
                    {turno.estado === "llamando" && (
                      <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "en_atencion")}>En atención</button>
                    )}
                    {turno.estado === "en_atencion" && (
                      <button type="button" className="btn-action-complete" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "completado")}>Completar</button>
                    )}
                    {!["cancelado", "completado", "no_presentado"].includes(turno.estado) && (
                      <button type="button" className="btn-action-cancel" disabled={accionEnCurso === turno.id} onClick={() => actualizar(turno.id, "cancelado")}>Cancelar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default GestionTurnos;
