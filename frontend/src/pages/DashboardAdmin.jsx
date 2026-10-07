import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api";
import "../styles/DashboardAdmin.css";

function DashboardAdmin() {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api("/admin/resumen")
      .then(setResumen)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  const cantidad = (estado) =>
    resumen?.estados?.find((item) => item.estado === estado)?.total || 0;

  return (
    <div className="page-shell">
      <div className="admin-layout">
        <AdminSidebar />

        <main className="dashboard-content">
          <div className="admin-page-header">
            <div>
              <span className="admin-breadcrumb">Administración / Visión General</span>
              <h1 className="admin-title-heading">Panel de Control</h1>
              <p className="admin-desc">
                Métricas del sistema y registro reciente de turnos y usuarios.
              </p>
            </div>
            <div className="admin-header-actions">
              <Link to="/gestion-turnos" className="btn-apple-primary btn-sm">
                Gestionar Turnos
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

          {/* Tarjetas KPI */}
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">Usuarios Registrados</span>
                <div className="kpi-mini-icon blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              </div>
              <div className="admin-kpi-number">{cargando ? "—" : resumen?.usuarios ?? 0}</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">Turnos Totales</span>
                <div className="kpi-mini-icon purple">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                    <path d="M13 5v2" />
                    <path d="M13 17v2" />
                  </svg>
                </div>
              </div>
              <div className="admin-kpi-number">{cargando ? "—" : resumen?.turnos?.length ?? 0}</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">Turnos Pendientes</span>
                <div className="kpi-mini-icon amber">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <div className="admin-kpi-number">{cargando ? "—" : cantidad("pendiente")}</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">Turnos Completados</span>
                <div className="kpi-mini-icon green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="admin-kpi-number">{cargando ? "—" : cantidad("completado")}</div>
            </div>
          </div>

          {/* Tabla de Últimos Turnos */}
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
                  {cargando ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>
                        Cargando métricas...
                      </td>
                    </tr>
                  ) : !resumen?.turnos || resumen.turnos.length === 0 ? (
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
                          <span className={`estado ${turno.estado}`}>{turno.estado}</span>
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
