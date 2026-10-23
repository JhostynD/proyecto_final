import { api } from "./api.js";
import { obtenerSesion } from "./auth.js";

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  "http://localhost:3000/api";

/**
 * Consulta notificaciones paginadas del usuario autenticado.
 */
export async function obtenerNotificaciones(pagina = 1, limite = 20) {
  return api(`/notificaciones?pagina=${pagina}&limite=${limite}`);
}

/**
 * Obtiene el número de notificaciones pendientes de lectura.
 */
export async function obtenerConteoNoLeidas() {
  const data = await api("/notificaciones/no-leidas/conteo");
  return data.conteo || 0;
}

/**
 * Marca una notificación individual como leída.
 */
export async function marcarNotificacionLeida(id) {
  return api(`/notificaciones/${id}/leer`, { method: "PATCH" });
}

/**
 * Marca todas las notificaciones pendientes del usuario como leídas.
 */
export async function marcarTodasLeidas() {
  return api("/notificaciones/leer-todas", { method: "PATCH" });
}

/**
 * Parsea bloques SSE a partir de un acumulador y nuevo chunk de texto.
 * Maneja eventos divididos entre varios chunks, múltiples eventos por chunk,
 * líneas incompletas, terminadores CRLF (\r\n) y LF (\n), y comentarios SSE.
 *
 * @param {string} bufferAcumulado - Texto remanente del ciclo anterior
 * @param {string} nuevoChunk - Nuevo fragmento recibido del stream
 * @returns {{ eventos: Array<{ tipo: string, data: string }>, bufferRestante: string }}
 */
export function parsearBloquesSSE(bufferAcumulado = "", nuevoChunk = "") {
  const texto = bufferAcumulado + nuevoChunk;
  // Los bloques de eventos SSE están separados por dos saltos de línea (\r\n\r\n o \n\n)
  const partes = texto.split(/\r?\n\r?\n/);
  const bufferRestante = partes.pop() || "";
  const eventos = [];

  for (const bloque of partes) {
    if (!bloque.trim()) continue;
    const lineas = bloque.split(/\r?\n/);
    let tipoEvento = "message";
    const dataLineas = [];

    for (const linea of lineas) {
      if (linea.startsWith(":")) {
        // Comentarios SSE (ej. : keepalive)
        continue;
      }
      if (linea.startsWith("event:")) {
        tipoEvento = linea.slice(6).trim();
      } else if (linea.startsWith("data:")) {
        dataLineas.push(linea.slice(5).trimStart());
      }
    }

    if (dataLineas.length > 0 || tipoEvento !== "message") {
      eventos.push({
        tipo: tipoEvento,
        data: dataLineas.join("\n")
      });
    }
  }

  return { eventos, bufferRestante };
}

/**
 * Abre y mantiene una conexión SSE autenticada (usando fetch con ReadableStream y cabecera Bearer).
 * No expone el token JWT en la URL.
 * Soporta reconexión automática con retroceso exponencial y cierre limpio.
 * En errores 401/403 o 'sesion_cerrada', aborta de inmediato sin reintentos innecesarios.
 *
 * @param {Function} onNotificacion - Callback llamado al recibir una nueva notificación en vivo
 * @param {Function} onEstadoConexion - Callback para reportar el estado: 'conectando', 'conectado', 'desconectado'
 * @returns {Function} Función para cancelar y cerrar el stream
 */
export function suscribirNotificacionesSSE(onNotificacion, onEstadoConexion = () => {}) {
  let abortController = new AbortController();
  let activo = true;
  let reintentoTimeout = null;
  let intentosReconexion = 0;

  async function conectar() {
    if (!activo) return;
    const sesion = obtenerSesion();
    if (!sesion?.token) {
      onEstadoConexion("desconectado");
      return;
    }

    onEstadoConexion("conectando");
    abortController = new AbortController();

    try {
      const respuesta = await fetch(`${API_URL}/notificaciones/stream`, {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${sesion.token}`
        },
        signal: abortController.signal
      });

      if (!respuesta.ok) {
        // Si el token es inválido, expiró o la cuenta fue suspendida (401/403),
        // detener reconexiones y emitir evento de cierre de sesión
        if (respuesta.status === 401 || respuesta.status === 403) {
          activo = false;
          onEstadoConexion("desconectado");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("sesion-cerrada"));
          }
          return;
        }
        throw new Error(`Error en conexión SSE: status ${respuesta.status}`);
      }

      onEstadoConexion("conectado");
      intentosReconexion = 0; // Resetear intentos al conectar con éxito

      const reader = respuesta.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (activo) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkTexto = decoder.decode(value, { stream: true });
        const { eventos, bufferRestante } = parsearBloquesSSE(buffer, chunkTexto);
        buffer = bufferRestante;

        for (const ev of eventos) {
          if (ev.tipo === "sesion_cerrada") {
            activo = false;
            onEstadoConexion("desconectado");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("sesion-cerrada"));
            }
            return;
          }

          if (ev.tipo === "notificacion" && ev.data) {
            try {
              const notif = JSON.parse(ev.data);
              onNotificacion(notif);
            } catch {
              // Ignorar payload malformado
            }
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError" || !activo) {
        return; // Desconexión intencional o cierre de sesión
      }
      onEstadoConexion("desconectado");
    }

    // Programar reconexión automática con retroceso exponencial solo si sigue activo
    if (activo) {
      intentosReconexion++;
      const espera = Math.min(30000, 1000 * Math.pow(1.8, Math.min(intentosReconexion, 6)));
      reintentoTimeout = setTimeout(() => {
        if (activo) conectar();
      }, espera);
    }
  }

  conectar();

  // Función de limpieza retornada
  return () => {
    activo = false;
    if (reintentoTimeout) clearTimeout(reintentoTimeout);
    abortController.abort();
    onEstadoConexion("desconectado");
  };
}
