import { useEffect, useState, useMemo } from "react";
import Footer from "../components/Footer";
import AdminSidebar from "../components/AdminSidebar";
import { api } from "../lib/api";
import "../styles/GestionServicios.css";

const MODALIDADES = [
  { valor: "cita", etiqueta: "Cita previa" },
  { valor: "turno", etiqueta: "Turno virtual" },
  { valor: "turno_y_cita", etiqueta: "Turno y cita" },
];

const MODALIDAD_LABELS = {
  cita: "Cita previa",
  turno: "Turno virtual",
  turno_y_cita: "Turno y Cita",
};

const FORM_INICIAL = {
  nombre: "",
  codigo_prefijo: "",
  modalidad: "cita",
  duracion_estimada_min: 30,
  requiere_tema: false,
  descripcion: "",
};

function GestionServicios() {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // 'todos' | 'activos' | 'inactivos'

  // Modales
  const [modalFormAbierto, setModalFormAbierto] = useState(false);
  const [servicioEditando, setServicioEditando] = useState(null);
  const [servicioAConmutar, setServicioAConmutar] = useState(null);

  // Estados de proceso
  const [procesandoGuardar, setProcesandoGuardar] = useState(false);
  const [procesandoEstado, setProcesandoEstado] = useState(false);

  // Formulario y validaciones locales
  const [formulario, setFormulario] = useState(FORM_INICIAL);
  const [erroresFormulario, setErroresFormulario] = useState({});

  const cargarServicios = () =>
    api("/admin/servicios")
      .then((datos) => setServicios(Array.isArray(datos) ? datos : []))
      .catch((err) => setError(err.message || "Error al cargar la lista de servicios."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargarServicios();
  }, []);

  // Cerrar alerta de éxito automáticamente tras 4 segundos
  useEffect(() => {
    if (!exito) return;
    const timer = setTimeout(() => setExito(""), 4000);
    return () => clearTimeout(timer);
  }, [exito]);

  // Manejo de tecla Escape para cerrar modales
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (modalFormAbierto && !procesandoGuardar) setModalFormAbierto(false);
        if (servicioAConmutar && !procesandoEstado) setServicioAConmutar(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalFormAbierto, servicioAConmutar, procesandoGuardar, procesandoEstado]);

  // Filtrado de servicios
  const serviciosFiltrados = useMemo(() => {
    return servicios.filter((srv) => {
      // Filtro por estado
      if (filtroEstado === "activos" && !srv.activo) return false;
      if (filtroEstado === "inactivos" && srv.activo) return false;

      // Filtro por texto de búsqueda (nombre, prefijo o descripción)
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const texto = `${srv.nombre} ${srv.codigo_prefijo || ""} ${srv.descripcion || ""}`.toLowerCase();
        return texto.includes(query);
      }
      return true;
    });
  }, [servicios, filtroEstado, busqueda]);

  // Contadores para métricas rápidas
  const conteo = useMemo(() => {
    const total = servicios.length;
    const activos = servicios.filter((s) => s.activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [servicios]);

  // Abrir modal de creación
  const handleAbrirCrear = () => {
    setError("");
    setServicioEditando(null);
    setFormulario(FORM_INICIAL);
    setErroresFormulario({});
    setModalFormAbierto(true);
  };

  // Abrir modal de edición
  const handleAbrirEditar = (srv) => {
    setError("");
    setServicioEditando(srv);
    setFormulario({
      nombre: srv.nombre || "",
      codigo_prefijo: srv.codigo_prefijo || "",
      modalidad: srv.modalidad || "cita",
      duracion_estimada_min: srv.duracion_estimada_min || 30,
      requiere_tema: Boolean(srv.requiere_tema),
      descripcion: srv.descripcion || "",
    });
    setErroresFormulario({});
    setModalFormAbierto(true);
  };

  // Validaciones del formulario
  const validarFormulario = () => {
    const errs = {};
    const nombre = formulario.nombre.trim();
    if (!nombre) {
      errs.nombre = "El nombre es obligatorio.";
    } else if (nombre.length < 3 || nombre.length > 100) {
      errs.nombre = "El nombre debe tener entre 3 y 100 caracteres.";
    }

    const prefijo = formulario.codigo_prefijo.trim().toUpperCase();
    if (!prefijo) {
      errs.codigo_prefijo = "El código prefijo es obligatorio.";
    } else if (!/^[A-Z0-9]{2,5}$/.test(prefijo)) {
      errs.codigo_prefijo = "Debe tener entre 2 y 5 caracteres alfanuméricos (ej: CR, ST).";
    }

    if (!["turno", "cita", "turno_y_cita"].includes(formulario.modalidad)) {
      errs.modalidad = "Selecciona una modalidad válida.";
    }

    const duracion = Number(formulario.duracion_estimada_min);
    if (!Number.isInteger(duracion) || duracion < 5 || duracion > 480) {
      errs.duracion_estimada_min = "La duración debe ser un entero entre 5 y 480 minutos.";
    }

    if (formulario.descripcion && formulario.descripcion.trim().length > 255) {
      errs.descripcion = "La descripción no puede exceder 255 caracteres.";
    }

    setErroresFormulario(errs);
    return Object.keys(errs).length === 0;
  };

  // Guardar servicio (crear o editar)
  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    setError("");
    setProcesandoGuardar(true);

    const payload = {
      nombre: formulario.nombre.trim(),
      codigo_prefijo: formulario.codigo_prefijo.trim().toUpperCase(),
      modalidad: formulario.modalidad,
      duracion_estimada_min: Number(formulario.duracion_estimada_min),
      requiere_tema: Boolean(formulario.requiere_tema),
      descripcion: formulario.descripcion.trim() || null,
    };

    try {
      if (servicioEditando) {
        // PATCH edición
        const resultado = await api(`/admin/servicios/${servicioEditando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setExito(`Servicio "${resultado.nombre}" actualizado correctamente.`);
      } else {
        // POST creación
        const resultado = await api("/admin/servicios", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setExito(`Servicio "${resultado.nombre}" creado exitosamente.`);
      }
      setModalFormAbierto(false);
      await cargarServicios();
    } catch (err) {
      setError(err.message || "Ocurrió un error al guardar el servicio.");
    } finally {
      setProcesandoGuardar(false);
    }
  };

  // Conmutar estado activo / inactivo
  const handleConfirmarConmutarEstado = async () => {
    if (!servicioAConmutar) return;

    setError("");
    setProcesandoEstado(true);

    const nuevoEstado = !servicioAConmutar.activo;
    try {
      await api(`/admin/servicios/${servicioAConmutar.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      setExito(
        nuevoEstado
          ? `Servicio "${servicioAConmutar.nombre}" activado exitosamente.`
          : `Servicio "${servicioAConmutar.nombre}" desactivado. No aceptará nuevos turnos y conserva su historial.`
      );
      setServicioAConmutar(null);
      await cargarServicios();
    } catch (err) {
      setError(err.message || "No fue posible cambiar el estado del servicio.");
    } finally {
      setProcesandoEstado(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="admin-layout">
        <AdminSidebar />

        <main className="servicios-admin-container" aria-label="Gestión de Servicios">
          {/* Header de la pantalla */}
          <div className="admin-page-header">
            <div>
              <span className="admin-breadcrumb">Administración / Configuración</span>
              <h1 className="admin-title-heading">Gestión de Servicios</h1>
              <p className="admin-desc">
                Crea, edita y administra la disponibilidad de los servicios bancarios en FILA CERO.
              </p>
            </div>
            <button
              type="button"
              className="btn-crear-servicio"
              onClick={handleAbrirCrear}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo Servicio</span>
            </button>
          </div>

          {/* Banner de error global */}
          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: "18px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
              <button
                type="button"
                className="banner-close-btn"
                onClick={() => setError("")}
                aria-label="Cerrar error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Banner de éxito */}
          {exito && (
            <div className="form-success" role="status" style={{ marginBottom: "18px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{exito}</span>
              <button
                type="button"
                className="banner-close-btn"
                onClick={() => setExito("")}
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </div>
          )}

          {/* Barra de Filtros y Búsqueda */}
          <div className="servicios-toolbar">
            <div className="search-input-wrapper">
              <svg
                className="search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="servicio-search-input"
                placeholder="Buscar por nombre, prefijo o descripción..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar servicios"
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

            {/* Segmented Filter Control */}
            <div className="segmented-filter-bar" role="tablist" aria-label="Filtrar por estado">
              <button
                type="button"
                role="tab"
                aria-selected={filtroEstado === "todos"}
                className={`segmented-filter-btn ${filtroEstado === "todos" ? "active" : ""}`}
                onClick={() => setFiltroEstado("todos")}
              >
                Todos ({conteo.total})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filtroEstado === "activos"}
                className={`segmented-filter-btn ${filtroEstado === "activos" ? "active" : ""}`}
                onClick={() => setFiltroEstado("activos")}
              >
                Activos ({conteo.activos})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filtroEstado === "inactivos"}
                className={`segmented-filter-btn ${filtroEstado === "inactivos" ? "active" : ""}`}
                onClick={() => setFiltroEstado("inactivos")}
              >
                Inactivos ({conteo.inactivos})
              </button>
            </div>
          </div>

          {/* Tabla / Tarjetas de Servicios */}
          <div className="servicios-table-wrapper">
            {cargando ? (
              <div className="loading-container">
                <div className="spinner-indicator large" aria-hidden="true"></div>
                <p>Cargando servicios bancarios...</p>
              </div>
            ) : serviciosFiltrados.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="14" x="2" y="6" rx="2" />
                    <line x1="6" y1="10" x2="6" y2="10.01" />
                    <line x1="10" y1="10" x2="18" y2="10" />
                    <line x1="6" y1="14" x2="18" y2="14" />
                  </svg>
                </div>
                <h3>No se encontraron servicios</h3>
                <p>
                  {busqueda
                    ? `No hay servicios que coincidan con "${busqueda}".`
                    : "No hay servicios disponibles en esta categoría."}
                </p>
                {busqueda && (
                  <button
                    type="button"
                    className="btn-limpiar-filtros"
                    onClick={() => {
                      setBusqueda("");
                      setFiltroEstado("todos");
                    }}
                  >
                    Restablecer filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Vista de Escritorio */}
                <div className="table-responsive desktop-only">
                  <table className="apple-table" aria-label="Lista de servicios">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nombre y Descripción</th>
                        <th>Prefijo</th>
                        <th>Modalidad</th>
                        <th>Duración</th>
                        <th>Tema</th>
                        <th>Estado</th>
                        <th style={{ textAlign: "right" }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviciosFiltrados.map((srv) => (
                        <tr key={srv.id} className={!srv.activo ? "fila-inactiva" : ""}>
                          <td className="cell-id">#{srv.id}</td>
                          <td className="cell-nombre-desc">
                            <div className="servicio-nombre-main">{srv.nombre}</div>
                            {srv.descripcion && (
                              <div className="servicio-desc-sub">{srv.descripcion}</div>
                            )}
                          </td>
                          <td>
                            <span className="prefijo-badge">{srv.codigo_prefijo || "—"}</span>
                          </td>
                          <td>
                            <span className={`modalidad-tag ${srv.modalidad}`}>
                              {MODALIDAD_LABELS[srv.modalidad] || srv.modalidad}
                            </span>
                          </td>
                          <td>
                            <span className="duracion-tag">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {srv.duracion_estimada_min} min
                            </span>
                          </td>
                          <td>
                            <span className={`tema-pill ${srv.requiere_tema ? "requerido" : "opcional"}`}>
                              {srv.requiere_tema ? "Obligatorio" : "No"}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill ${srv.activo ? "activo" : "inactivo"}`}>
                              <span className="status-dot" aria-hidden="true"></span>
                              {srv.activo ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="acciones-inline">
                              <button
                                type="button"
                                className="btn-action-editar"
                                onClick={() => handleAbrirEditar(srv)}
                                title="Editar servicio"
                                aria-label={`Editar servicio ${srv.nombre}`}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className={`btn-action-toggle ${srv.activo ? "desactivar" : "activar"}`}
                                onClick={() => setServicioAConmutar(srv)}
                                title={srv.activo ? "Desactivar servicio" : "Activar servicio"}
                                aria-label={`${srv.activo ? "Desactivar" : "Activar"} servicio ${srv.nombre}`}
                              >
                                {srv.activo ? "Desactivar" : "Activar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Vista Móvil / Tablet */}
                <div className="mobile-cards-list mobile-only">
                  {serviciosFiltrados.map((srv) => (
                    <div
                      key={srv.id}
                      className={`servicio-mobile-card ${!srv.activo ? "card-inactiva" : ""}`}
                    >
                      <div className="card-top-bar">
                        <span className="cell-id">#{srv.id}</span>
                        <div className="card-top-badges">
                          <span className={`status-pill ${srv.activo ? "activo" : "inactivo"}`}>
                            <span className="status-dot" aria-hidden="true"></span>
                            {srv.activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </div>

                      <div className="card-title-group">
                        <div className="card-service-name">{srv.nombre}</div>
                        {srv.descripcion && (
                          <div className="card-service-desc">{srv.descripcion}</div>
                        )}
                      </div>

                      <div className="card-meta-chips">
                        <span className="prefijo-badge">Prefijo: {srv.codigo_prefijo || "—"}</span>
                        <span className={`modalidad-tag ${srv.modalidad}`}>
                          {MODALIDAD_LABELS[srv.modalidad] || srv.modalidad}
                        </span>
                        <span className="duracion-tag">
                          ⏱ {srv.duracion_estimada_min} min
                        </span>
                        <span className={`tema-pill ${srv.requiere_tema ? "requerido" : "opcional"}`}>
                          Tema: {srv.requiere_tema ? "Obligatorio" : "No"}
                        </span>
                      </div>

                      <div className="card-actions-grid">
                        <button
                          type="button"
                          className="btn-card-edit"
                          onClick={() => handleAbrirEditar(srv)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`btn-card-toggle ${srv.activo ? "desactivar" : "activar"}`}
                          onClick={() => setServicioAConmutar(srv)}
                        >
                          {srv.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Modal para Crear / Editar Servicio */}
          {modalFormAbierto && (
            <div
              className="modal-backdrop"
              onClick={() => !procesandoGuardar && setModalFormAbierto(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-form-title"
            >
              <div
                className="modal-card modal-card-form"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-form-header">
                  <div>
                    <h2 id="modal-form-title" className="modal-title" style={{ textAlign: "left" }}>
                      {servicioEditando ? "Editar Servicio" : "Nuevo Servicio Bancario"}
                    </h2>
                    <p className="modal-desc" style={{ textAlign: "left", marginTop: "2px" }}>
                      {servicioEditando
                        ? `Modifica los parámetros para #${servicioEditando.id} - ${servicioEditando.nombre}`
                        : "Ingresa los datos obligatorios para habilitar el servicio en ventanilla y citas."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="modal-close-icon"
                    onClick={() => !procesandoGuardar && setModalFormAbierto(false)}
                    aria-label="Cerrar modal"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleGuardar} className="servicio-form" noValidate>
                  {/* Nombre */}
                  <div className="form-group">
                    <label htmlFor="nombre">
                      Nombre del servicio <span className="req">*</span>
                    </label>
                    <input
                      id="nombre"
                      type="text"
                      maxLength={100}
                      placeholder="Ej: Asesoría de Inversiones"
                      value={formulario.nombre}
                      onChange={(e) =>
                        setFormulario({ ...formulario, nombre: e.target.value })
                      }
                      className={erroresFormulario.nombre ? "input-error" : ""}
                      required
                    />
                    {erroresFormulario.nombre && (
                      <span className="field-error-msg">{erroresFormulario.nombre}</span>
                    )}
                  </div>

                  {/* Prefijo y Modalidad */}
                  <div className="form-row-2col">
                    <div className="form-group">
                      <label htmlFor="codigo_prefijo">
                        Código prefijo <span className="req">*</span>
                      </label>
                      <input
                        id="codigo_prefijo"
                        type="text"
                        maxLength={5}
                        placeholder="Ej: INV (2-5 letras)"
                        value={formulario.codigo_prefijo}
                        onChange={(e) =>
                          setFormulario({
                            ...formulario,
                            codigo_prefijo: e.target.value.toUpperCase(),
                          })
                        }
                        className={erroresFormulario.codigo_prefijo ? "input-error" : ""}
                        required
                      />
                      {erroresFormulario.codigo_prefijo && (
                        <span className="field-error-msg">{erroresFormulario.codigo_prefijo}</span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="modalidad">
                        Modalidad <span className="req">*</span>
                      </label>
                      <select
                        id="modalidad"
                        value={formulario.modalidad}
                        onChange={(e) =>
                          setFormulario({ ...formulario, modalidad: e.target.value })
                        }
                        className={erroresFormulario.modalidad ? "input-error" : ""}
                      >
                        {MODALIDADES.map((m) => (
                          <option key={m.valor} value={m.valor}>
                            {m.etiqueta}
                          </option>
                        ))}
                      </select>
                      {erroresFormulario.modalidad && (
                        <span className="field-error-msg">{erroresFormulario.modalidad}</span>
                      )}
                    </div>
                  </div>

                  {/* Duración y Requiere Tema */}
                  <div className="form-row-2col">
                    <div className="form-group">
                      <label htmlFor="duracion_estimada_min">
                        Duración estimada (minutos) <span className="req">*</span>
                      </label>
                      <input
                        id="duracion_estimada_min"
                        type="number"
                        min={5}
                        max={480}
                        step={5}
                        placeholder="30"
                        value={formulario.duracion_estimada_min}
                        onChange={(e) =>
                          setFormulario({
                            ...formulario,
                            duracion_estimada_min: e.target.value,
                          })
                        }
                        className={erroresFormulario.duracion_estimada_min ? "input-error" : ""}
                        required
                      />
                      {erroresFormulario.duracion_estimada_min && (
                        <span className="field-error-msg">{erroresFormulario.duracion_estimada_min}</span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="requiere_tema">
                        ¿Requiere motivo/tema?
                      </label>
                      <select
                        id="requiere_tema"
                        value={formulario.requiere_tema ? "si" : "no"}
                        onChange={(e) =>
                          setFormulario({
                            ...formulario,
                            requiere_tema: e.target.value === "si",
                          })
                        }
                      >
                        <option value="no">No (opcional para el cliente)</option>
                        <option value="si">Sí (obligatorio al agendar)</option>
                      </select>
                    </div>
                  </div>

                  {/* Descripción */}
                  <div className="form-group">
                    <div className="label-with-counter">
                      <label htmlFor="descripcion">Descripción informativa</label>
                      <span className="char-counter">
                        {formulario.descripcion ? formulario.descripcion.length : 0} / 255
                      </span>
                    </div>
                    <textarea
                      id="descripcion"
                      rows={3}
                      maxLength={255}
                      placeholder="Detalla en qué consiste el trámite o qué documentos debe presentar el cliente..."
                      value={formulario.descripcion}
                      onChange={(e) =>
                        setFormulario({ ...formulario, descripcion: e.target.value })
                      }
                      className={erroresFormulario.descripcion ? "input-error" : ""}
                    />
                    {erroresFormulario.descripcion && (
                      <span className="field-error-msg">{erroresFormulario.descripcion}</span>
                    )}
                  </div>

                  {/* Botones de acción del modal */}
                  <div className="modal-actions form-actions-footer">
                    <button
                      type="button"
                      className="btn-modal-secondary"
                      disabled={procesandoGuardar}
                      onClick={() => setModalFormAbierto(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-modal-primary"
                      disabled={procesandoGuardar}
                    >
                      {procesandoGuardar ? (
                        <>
                          <span className="spinner-indicator small" aria-hidden="true"></span>
                          <span>Guardando...</span>
                        </>
                      ) : servicioEditando ? (
                        "Actualizar Servicio"
                      ) : (
                        "Crear Servicio"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal de confirmación para Activar / Desactivar Servicio */}
          {servicioAConmutar && (
            <div
              className="modal-backdrop"
              onClick={() => !procesandoEstado && setServicioAConmutar(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-confirm-title"
            >
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div
                  className={`modal-icon ${servicioAConmutar.activo ? "warning" : "success"}`}
                  aria-hidden="true"
                >
                  {servicioAConmutar.activo ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  )}
                </div>

                <h3 id="modal-confirm-title" className="modal-title">
                  {servicioAConmutar.activo
                    ? "¿Desactivar servicio?"
                    : "¿Activar servicio?"}
                </h3>

                <p className="modal-desc">
                  {servicioAConmutar.activo ? (
                    <>
                      El servicio <strong>{servicioAConmutar.nombre}</strong> dejará de estar disponible para nuevos turnos y citas.{" "}
                      <em>Los turnos históricos ya agendados se conservarán intactos.</em>
                    </>
                  ) : (
                    <>
                      El servicio <strong>{servicioAConmutar.nombre}</strong> volverá a estar visible y disponible inmediatamente para que los usuarios soliciten turnos y citas.
                    </>
                  )}
                </p>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={procesandoEstado}
                    onClick={() => setServicioAConmutar(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={servicioAConmutar.activo ? "btn-modal-danger" : "btn-modal-primary"}
                    disabled={procesandoEstado}
                    onClick={handleConfirmarConmutarEstado}
                  >
                    {procesandoEstado ? (
                      <>
                        <span className="spinner-indicator small" aria-hidden="true"></span>
                        <span>Procesando...</span>
                      </>
                    ) : servicioAConmutar.activo ? (
                      "Sí, desactivar"
                    ) : (
                      "Sí, activar"
                    )}
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

export default GestionServicios;
