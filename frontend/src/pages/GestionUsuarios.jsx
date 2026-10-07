import { useEffect, useState } from "react";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api";
import "../styles/GestionUsuarios.css";

function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState(null);
  const [procesandoEliminar, setProcesandoEliminar] = useState(false);

  const cargar = () =>
    api("/admin/usuarios")
      .then(setUsuarios)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);

  async function confirmarEliminar() {
    if (!usuarioAEliminar) return;
    setError("");
    setProcesandoEliminar(true);
    try {
      await api(`/admin/usuarios/${usuarioAEliminar.id}`, { method: "DELETE" });
      setUsuarioAEliminar(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoEliminar(false);
    }
  }

  const filtrados = usuarios.filter((u) => {
    const texto = `${u.nombre} ${u.correo} ${u.rol}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  return (
    <div className="page-shell">
      <div className="admin-layout">
        <AdminSidebar />

        <main className="usuarios-container">
          <div className="admin-page-header">
            <div>
              <span className="admin-breadcrumb">Administración / Directorio</span>
              <h1 className="admin-title-heading">Gestión de Usuarios</h1>
              <p className="admin-desc">
                Consulta y gestiona las cuentas de usuarios registradas en el sistema.
              </p>
            </div>
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

          {/* Search bar */}
          <div className="users-toolbar">
            <div className="search-input-wrapper">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="user-search-input"
                placeholder="Buscar por nombre, correo o rol..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {busqueda && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="users-count-tag">
              {filtrados.length} {filtrados.length === 1 ? "usuario" : "usuarios"}
            </div>
          </div>

          {/* Table Container */}
          <div className="usuarios-table-wrapper">
            {cargando ? (
              <div className="loading-container">
                <div className="spinner-indicator large" aria-hidden="true"></div>
                <p>Cargando usuarios registrados...</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="empty-state-card" style={{ border: "none", boxShadow: "none" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                  No se encontraron usuarios que coincidan con la búsqueda.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="table-responsive desktop-only">
                  <table className="apple-table">
                    <thead>
                      <tr>
                        <th># ID</th>
                        <th>Nombre</th>
                        <th>Correo Electrónico</th>
                        <th>Rol</th>
                        <th style={{ textAlign: "right" }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((usuario) => (
                        <tr key={usuario.id}>
                          <td className="cell-id">#{usuario.id}</td>
                          <td style={{ fontWeight: 600 }}>{usuario.nombre}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{usuario.correo}</td>
                          <td>
                            <span className={`role-badge ${usuario.rol}`}>
                              {usuario.rol}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn-eliminar-soft"
                              onClick={() => setUsuarioAEliminar(usuario)}
                              title="Eliminar usuario"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="mobile-cards-list mobile-only">
                  {filtrados.map((usuario) => (
                    <div key={usuario.id} className="user-mobile-card">
                      <div className="user-card-header">
                        <span className="cell-id">#{usuario.id}</span>
                        <span className={`role-badge ${usuario.rol}`}>{usuario.rol}</span>
                      </div>
                      <div className="user-card-name">{usuario.nombre}</div>
                      <div className="user-card-email">{usuario.correo}</div>
                      <button
                        type="button"
                        className="btn-eliminar-mobile"
                        onClick={() => setUsuarioAEliminar(usuario)}
                      >
                        Eliminar usuario
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Modal de confirmación para eliminar usuario */}
          {usuarioAEliminar && (
            <div className="modal-backdrop" onClick={() => !procesandoEliminar && setUsuarioAEliminar(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon danger">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </div>
                <h3 className="modal-title">¿Eliminar usuario?</h3>
                <p className="modal-desc">
                  Esta acción eliminará a <strong>{usuarioAEliminar.nombre}</strong> ({usuarioAEliminar.correo}) y todos sus turnos asociados de forma definitiva.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={procesandoEliminar}
                    onClick={() => setUsuarioAEliminar(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-modal-danger"
                    disabled={procesandoEliminar}
                    onClick={confirmarEliminar}
                  >
                    {procesandoEliminar ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default GestionUsuarios;
