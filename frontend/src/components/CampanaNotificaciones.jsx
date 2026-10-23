import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  obtenerNotificaciones,
  obtenerConteoNoLeidas,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  suscribirNotificacionesSSE
} from "../lib/notificaciones";
import "./CampanaNotificaciones.css";

export default function CampanaNotificaciones() {
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [estadoConexion, setEstadoConexion] = useState("conectando");
  const contenedorRef = useRef(null);

  const refrescarNotificaciones = async () => {
    try {
      setCargando(true);
      setError(null);
      const [conteo, resListado] = await Promise.all([
        obtenerConteoNoLeidas(),
        obtenerNotificaciones(1, 20)
      ]);
      setNoLeidas(conteo);
      setNotificaciones(resListado.notificaciones || []);
    } catch (err) {
      setError(err.message || "Error al cargar notificaciones.");
    } finally {
      setCargando(false);
    }
  };

  // Suscribirse a SSE para recibir eventos en tiempo real
  useEffect(() => {
    let activo = true;

    async function cargarInicial() {
      try {
        const [conteo, resListado] = await Promise.all([
          obtenerConteoNoLeidas(),
          obtenerNotificaciones(1, 20)
        ]);
        if (activo) {
          setNoLeidas(conteo);
          setNotificaciones(resListado.notificaciones || []);
        }
      } catch (err) {
        if (activo) {
          setError(err.message || "Error al cargar notificaciones.");
        }
      }
    }

    cargarInicial();

    const cancelarStream = suscribirNotificacionesSSE(
      (nuevaNotif) => {
        // Prevenir duplicados en tiempo real
        setNotificaciones((previas) => {
          if (previas.some((n) => n.id === nuevaNotif.id)) return previas;
          return [nuevaNotif, ...previas];
        });
        setNoLeidas((c) => c + 1);
      },
      (estado) => {
        if (activo) setEstadoConexion(estado);
      }
    );

    return () => {
      activo = false;
      cancelarStream();
    };
  }, []);

  // Cerrar al presionar Escape o hacer click fuera del panel
  useEffect(() => {
    function manejarClickExterior(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    function manejarTeclado(e) {
      if (e.key === "Escape") setAbierto(false);
    }

    if (abierto) {
      document.addEventListener("mousedown", manejarClickExterior);
      document.addEventListener("keydown", manejarTeclado);
    }
    return () => {
      document.removeEventListener("mousedown", manejarClickExterior);
      document.removeEventListener("keydown", manejarTeclado);
    };
  }, [abierto]);

  const togglePanel = () => {
    const proximo = !abierto;
    setAbierto(proximo);
    if (proximo) {
      refrescarNotificaciones();
    }
  };

  const handleMarcarLeida = async (notif) => {
    if (!notif.leido) {
      try {
        await marcarNotificacionLeida(notif.id);
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, leido: true } : n))
        );
        setNoLeidas((c) => Math.max(0, c - 1));
      } catch {
        // Silenciar error en UI para fluidez
      }
    }
    setAbierto(false);
    navegar("/dashboard");
  };

  const handleMarcarTodasLeidas = async () => {
    if (noLeidas === 0) return;
    try {
      await marcarTodasLeidas();
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      setNoLeidas(0);
    } catch (err) {
      setError(err.message || "No fue posible marcar como leídas.");
    }
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return "";
    const f = new Date(fechaStr);
    return new Intl.DateTimeFormat("es-CO", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(f);
  };

  const obtenerIconoYColor = (tipo) => {
    switch (tipo) {
      case "turno_confirmado":
        return { icono: "✓", clase: "tipo-confirmado", tag: "Confirmado" };
      case "turno_cancelado":
        return { icono: "✕", clase: "tipo-cancelado", tag: "Cancelado" };
      case "turno_completado":
        return { icono: "★", clase: "tipo-completado", tag: "Completado" };
      default:
        return { icono: "ℹ", clase: "tipo-info", tag: "Aviso" };
    }
  };

  return (
    <div className="notificaciones-widget" ref={contenedorRef}>
      {/* Botón campana con badge */}
      <button
        type="button"
        className={`btn-campana ${abierto ? "activo" : ""}`}
        onClick={togglePanel}
        aria-label={`Notificaciones (${noLeidas} no leídas)`}
        aria-expanded={abierto}
      >
        <svg
          className="icono-campana"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {noLeidas > 0 && (
          <span className="badge-no-leidas" aria-live="polite">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {/* Popover desplegable de notificaciones */}
      {abierto && (
        <div className="notificaciones-popover" role="dialog" aria-label="Centro de Notificaciones">
          <header className="popover-header">
            <div className="header-titulo-fila">
              <span className="popover-titulo">Notificaciones</span>
              <span
                className={`indicador-conexion ${estadoConexion}`}
                title={`Estado de conexión: ${estadoConexion}`}
              >
                {estadoConexion === "conectado" ? "En vivo" : estadoConexion === "conectando" ? "Reconectando..." : "Desconectado"}
              </span>
            </div>

            {noLeidas > 0 && (
              <button
                type="button"
                className="btn-marcar-todas"
                onClick={handleMarcarTodasLeidas}
              >
                Marcar todas leídas
              </button>
            )}
          </header>

          <div className="popover-body">
            {cargando && notificaciones.length === 0 ? (
              <div className="estado-cargando">
                <span className="spinner-indicator" />
                <p>Cargando avisos...</p>
              </div>
            ) : error ? (
              <div className="estado-error">
                <p>{error}</p>
                <button type="button" className="btn-reintentar" onClick={refrescarNotificaciones}>
                  Reintentar
                </button>
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="estado-vacio">
                <span className="icono-vacio">🔔</span>
                <p className="vacio-titulo">Sin notificaciones</p>
                <p className="vacio-subtitulo">
                  Te avisaremos aquí cuando cambie el estado de tus citas o turnos.
                </p>
              </div>
            ) : (
              <ul className="notificaciones-lista">
                {notificaciones.map((n) => {
                  const { icono, clase, tag } = obtenerIconoYColor(n.tipo_evento);
                  const esNoLeida = !n.leido;

                  return (
                    <li
                      key={n.id}
                      className={`notificacion-item ${esNoLeida ? "no-leida" : ""} ${clase}`}
                      onClick={() => handleMarcarLeida(n)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleMarcarLeida(n);
                      }}
                    >
                      <div className="notif-badge-icono" aria-hidden="true">
                        {icono}
                      </div>

                      <div className="notif-contenido">
                        <div className="notif-meta-fila">
                          <span className="notif-tag">{tag}</span>
                          {n.codigo_turno && (
                            <span className="notif-codigo">{n.codigo_turno}</span>
                          )}
                          <span className="notif-fecha">{formatearFecha(n.creado_en)}</span>
                        </div>

                        <p className="notif-titulo">{n.titulo}</p>
                        <p className="notif-mensaje">{n.mensaje}</p>
                      </div>

                      {esNoLeida && <span className="punto-no-leido" aria-label="No leída" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
