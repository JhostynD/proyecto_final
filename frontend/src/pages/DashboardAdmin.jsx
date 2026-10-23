import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api.js";
import "../styles/DashboardAdmin.css";

// ── Helpers ──────────────────────────────────────────────────────────
const LABEL_ESTADO = {
  pendiente:      "Pendiente",
  confirmado:     "Confirmado",
  en_espera:      "En espera",
  llamando:       "Llamando",
  en_atencion:    "En atención",
  completado:     "Completado",
  cancelado:      "Cancelado",
  no_presentado:  "No presentado",
};

const COLOR_ESTADO = {
  pendiente:     "#f59e0b",
  confirmado:    "#10b981",
  en_espera:     "#0071e3",
  llamando:      "#f97316",
  en_atencion:   "#06b6d4",
  completado:    "#10b981",
  cancelado:     "#ef4444",
  no_presentado: "#94a3b8",
};

const PERIODOS = [
  { valor: "7d",    etiqueta: "Últimos 7 días"  },
  { valor: "30d",   etiqueta: "Últimos 30 días" },
  { valor: "90d",   etiqueta: "Últimos 90 días" },
  { valor: "custom",etiqueta: "Rango personal"  },
];

function formatFecha(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// ── Subcomponent: Gráfico de barras verticales pure-CSS ───────────────
function GraficoDiario({ datos }) {
  if (!datos || datos.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sin datos para el período seleccionado</span>
      </div>
    );
  }
  const max = Math.max(...datos.map((d) => d.total), 1);
  // Mostrar hasta 31 puntos, si hay más, agrupar tomando los últimos
  const serie = datos.length > 31 ? datos.slice(-31) : datos;
  return (
    <div className="bar-chart" role="img" aria-label="Gráfico de turnos por día">
      {serie.map((punto) => {
        const pct = Math.round((punto.total / max) * 100);
        const [, m, d] = punto.dia.split("-");
        return (
          <div key={punto.dia} className="bar-col" title={`${formatFecha(punto.dia)}: ${punto.total} turnos`}>
            <span className="bar-value">{punto.total > 0 ? punto.total : ""}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ height: `${pct}%` }} />
            </div>
            <span className="bar-label">{d}/{m}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Subcomponent: Distribución por estado ─────────────────────────────
function DistribucionEstados({ datos, total }) {
  if (!datos || datos.length === 0 || total === 0) {
    return <div className="chart-empty"><span>Sin datos</span></div>;
  }
  const ordenados = [...datos].sort((a, b) => b.total - a.total);
  return (
    <div className="estado-dist">
      {ordenados.map((e) => {
        const pct = total > 0 ? Math.round((e.total / total) * 1000) / 10 : 0;
        const color = COLOR_ESTADO[e.estado] || "#6366f1";
        return (
          <div key={e.estado} className="estado-dist-row">
            <div className="estado-dist-meta">
              <span className="estado-dist-dot" style={{ background: color }} />
              <span className="estado-dist-label">{LABEL_ESTADO[e.estado] || e.estado}</span>
              <span className="estado-dist-count">{e.total}</span>
            </div>
            <div className="estado-dist-track">
              <div
                className="estado-dist-bar"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="estado-dist-pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Subcomponent: Top servicios ───────────────────────────────────────
function TopServicios({ datos }) {
  if (!datos || datos.length === 0) {
    return <div className="chart-empty"><span>Sin datos</span></div>;
  }
  const max = Math.max(...datos.map((s) => s.total), 1);
  return (
    <ol className="servicios-list">
      {datos.map((s, i) => {
        const pct = Math.round((s.total / max) * 100);
        return (
          <li key={s.servicio} className="servicio-row">
            <span className="servicio-rank">#{i + 1}</span>
            <div className="servicio-info">
              <span className="servicio-nombre">{s.servicio}</span>
              <div className="servicio-track">
                <div className="servicio-bar" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="servicio-total">{s.total}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Subcomponent: KPI card ─────────────────────────────────────────────
function KpiCard({ etiqueta, valor, color, icono, cargando }) {
  return (
    <div className="admin-kpi-card">
      <div className="admin-kpi-top">
        <span className="admin-kpi-label">{etiqueta}</span>
        <div className={`kpi-mini-icon ${color}`}>{icono}</div>
      </div>
      <div className="admin-kpi-number">
        {cargando ? <span className="kpi-skeleton" /> : valor}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────
function DashboardAdmin() {
  // Resumen histórico (tabla de últimos turnos, existente)
  const [resumen, setResumen] = useState(null);
  const [errorResumen, setErrorResumen] = useState("");

  // Estadísticas con filtro de período
  const [stats, setStats] = useState(null);
  const [cargandoStats, setCargandoStats] = useState(true);
  const [errorStats, setErrorStats] = useState("");

  // Filtro de período
  const [periodo, setPeriodo] = useState("7d");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errFiltro, setErrFiltro] = useState("");

  const cargarResumen = useCallback(() => {
    api("/admin/resumen")
      .then(setResumen)
      .catch((err) => setErrorResumen(err.message));
  }, []);

  const cargarStats = useCallback(async () => {
    setErrFiltro("");
    setCargandoStats(true);
    setErrorStats("");
    try {
      let qs;
      if (periodo === "custom") {
        if (!desde || !hasta) {
          setErrFiltro('Ingresa las fechas "Desde" y "Hasta".');
          setCargandoStats(false);
          return;
        }
        if (desde > hasta) {
          setErrFiltro('"Desde" no puede ser posterior a "Hasta".');
          setCargandoStats(false);
          return;
        }
        qs = `desde=${desde}&hasta=${hasta}`;
      } else {
        qs = `periodo=${periodo}`;
      }
      const data = await api(`/admin/estadisticas?${qs}`);
      setStats(data);
    } catch (err) {
      setErrorStats(err.message || "Error al cargar estadísticas.");
    } finally {
      setCargandoStats(false);
    }
  }, [periodo, desde, hasta]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarStats();
  }, [cargarStats]);

  const kpi = stats?.kpi;
  const cargando = cargandoStats;

  const ICONOS = {
    total: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/>
      </svg>
    ),
    pendiente: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    completado: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    cancelado: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    usuarios: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  };

  function renderEstadoBadge(estado) {
    return <span className={`estado ${estado}`}>{LABEL_ESTADO[estado] || estado}</span>;
  }

  return (
    <div className="page-shell">
      <div className="admin-layout">
        <AdminSidebar />

        <main className="dashboard-content">
          {/* Encabezado */}
          <div className="admin-page-header">
            <div>
              <span className="admin-breadcrumb">Administración / Visión General</span>
              <h1 className="admin-title-heading">Panel de Control</h1>
              <p className="admin-desc">Métricas del sistema y estadísticas de turnos en el período seleccionado.</p>
            </div>
            <div className="admin-header-actions">
              <Link to="/gestion-turnos" className="btn-apple-primary btn-sm">Gestionar Turnos</Link>
            </div>
          </div>

          {/* ── Filtro de período ─────────────────────────────────── */}
          <div className="stats-filter-bar">
            <div className="stats-filter-pills" role="group" aria-label="Período de estadísticas">
              {PERIODOS.map((p) => (
                <button
                  key={p.valor}
                  id={`filtro-${p.valor}`}
                  className={`stats-pill ${periodo === p.valor ? "active" : ""}`}
                  onClick={() => setPeriodo(p.valor)}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>

            {periodo === "custom" && (
              <div className="stats-custom-range">
                <div className="custom-range-inputs">
                  <div className="custom-range-field">
                    <label htmlFor="stats-desde" className="custom-range-label">Desde</label>
                    <input
                      id="stats-desde"
                      type="date"
                      className="stats-date-input"
                      value={desde}
                      onChange={(e) => setDesde(e.target.value)}
                    />
                  </div>
                  <div className="custom-range-field">
                    <label htmlFor="stats-hasta" className="custom-range-label">Hasta</label>
                    <input
                      id="stats-hasta"
                      type="date"
                      className="stats-date-input"
                      value={hasta}
                      onChange={(e) => setHasta(e.target.value)}
                    />
                  </div>
                  <button
                    id="btn-aplicar-rango"
                    className="btn-apple-primary btn-sm"
                    onClick={cargarStats}
                    disabled={cargando}
                  >
                    Aplicar
                  </button>
                </div>
                {errFiltro && <p className="stats-filter-error" role="alert">{errFiltro}</p>}
              </div>
            )}

            {stats?.periodo && periodo !== "custom" && (
              <span className="stats-range-badge">
                {formatFecha(stats.periodo.desde)} — {formatFecha(stats.periodo.hasta)}
              </span>
            )}
          </div>

          {/* Error de estadísticas */}
          {errorStats && (
            <div className="form-error" role="alert" style={{ marginBottom: "24px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{errorStats}</span>
            </div>
          )}

          {/* ── KPI cards ────────────────────────────────────────── */}
          <div className="admin-kpi-grid">
            <KpiCard etiqueta="Total en período" valor={kpi?.total ?? 0} color="purple" icono={ICONOS.total} cargando={cargando} />
            <KpiCard etiqueta="Pendientes / Activos" valor={(kpi?.pendientes ?? 0) + (kpi?.en_proceso ?? 0)} color="amber" icono={ICONOS.pendiente} cargando={cargando} />
            <KpiCard etiqueta="Completados" valor={kpi?.completados ?? 0} color="green" icono={ICONOS.completado} cargando={cargando} />
            <KpiCard etiqueta="Cancelados" valor={kpi?.cancelados ?? 0} color="red" icono={ICONOS.cancelado} cargando={cargando} />
            <KpiCard etiqueta="Usuarios activos" valor={kpi?.usuarios_activos ?? 0} color="blue" icono={ICONOS.usuarios} cargando={cargando} />
          </div>

          {/* ── Indicador de cancelaciones ───────────────────────── */}
          {!cargando && kpi && (
            <div className="cancelacion-card">
              <div className="cancelacion-left">
                <span className="cancelacion-titulo">Tasa de cancelación</span>
                <span className="cancelacion-formula" title={kpi.formula_cancelacion}>
                  {kpi.formula_cancelacion}
                </span>
              </div>
              <div className="cancelacion-right">
                {kpi.tasa_cancelacion === null ? (
                  <span className="cancelacion-null">Sin datos suficientes</span>
                ) : (
                  <>
                    <div
                      className="cancelacion-gauge-track"
                      role="progressbar"
                      aria-valuenow={kpi.tasa_cancelacion}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Tasa de cancelación: ${kpi.tasa_cancelacion}%`}
                    >
                      <div
                        className="cancelacion-gauge-fill"
                        style={{
                          width: `${kpi.tasa_cancelacion}%`,
                          background:
                            kpi.tasa_cancelacion > 40 ? "#ef4444"
                            : kpi.tasa_cancelacion > 20 ? "#f97316"
                            : "#10b981",
                        }}
                      />
                    </div>
                    <span className="cancelacion-pct">
                      {kpi.tasa_cancelacion.toFixed(1)}%
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Gráfico de turnos por día ─────────────────────────── */}
          <div className="stats-section-grid">
            <div className="stats-card stats-card--wide">
              <div className="stats-card-header">
                <div>
                  <h2 className="stats-card-title">Turnos por día</h2>
                  <p className="stats-card-desc">Cantidad de turnos programados cada día en el período.</p>
                </div>
              </div>
              <div className="stats-card-body">
                {cargando ? (
                  <div className="chart-skeleton" />
                ) : (
                  <GraficoDiario datos={stats?.por_dia} />
                )}
              </div>
            </div>

            {/* ── Distribución por estado ───────────────────────── */}
            <div className="stats-card">
              <div className="stats-card-header">
                <div>
                  <h2 className="stats-card-title">Distribución por estado</h2>
                  <p className="stats-card-desc">Proporción de turnos según su estado final en el período.</p>
                </div>
              </div>
              <div className="stats-card-body">
                {cargando ? (
                  <div className="chart-skeleton" />
                ) : (
                  <DistribucionEstados datos={stats?.por_estado} total={kpi?.total ?? 0} />
                )}
              </div>
            </div>
          </div>

          {/* ── Servicios más solicitados ─────────────────────────── */}
          <div className="stats-card" style={{ marginBottom: "36px" }}>
            <div className="stats-card-header">
              <div>
                <h2 className="stats-card-title">Servicios más solicitados</h2>
                <p className="stats-card-desc">Top de servicios por número de turnos en el período.</p>
              </div>
            </div>
            <div className="stats-card-body">
              {cargando ? (
                <div className="chart-skeleton" style={{ height: "120px" }} />
              ) : (
                <TopServicios datos={stats?.servicios_top} />
              )}
            </div>
          </div>

          {/* ── Tabla de últimos turnos (histórico) ──────────────── */}
          {errorResumen && (
            <div className="form-error" role="alert" style={{ marginBottom: "24px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{errorResumen}</span>
            </div>
          )}

          <div className="recent-turnos-card">
            <div className="recent-turnos-header">
              <div>
                <h2 className="recent-title">Turnos Recientes</h2>
                <p className="recent-desc">Últimos registros recibidos en la plataforma.</p>
              </div>
              <Link to="/gestion-turnos" className="see-all-admin-link">
                Ir a gestión completa →
              </Link>
            </div>

            <div className="table-responsive">
              <table className="apple-table">
                <thead>
                  <tr>
                    <th># ID</th>
                    <th>Usuario</th>
                    <th>Servicio</th>
                    <th style={{ textAlign: "right" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {!resumen ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>
                        Cargando turnos recientes…
                      </td>
                    </tr>
                  ) : !resumen.turnos || resumen.turnos.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "32px", color: "var(--text-secondary)" }}>
                        No hay turnos registrados en el sistema.
                      </td>
                    </tr>
                  ) : (
                    resumen.turnos.slice(0, 6).map((turno) => (
                      <tr key={turno.id}>
                        <td className="cell-id">#{turno.id}</td>
                        <td style={{ fontWeight: 600 }}>{turno.usuario}</td>
                        <td>{turno.servicio}</td>
                        <td style={{ textAlign: "right" }}>
                          {renderEstadoBadge(turno.estado)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default DashboardAdmin;
