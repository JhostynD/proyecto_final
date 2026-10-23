import { cerrarSesion, obtenerSesion, guardarSesion } from "./auth.js";

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  "http://localhost:3000/api";

export async function api(ruta, opciones = {}) {
  const sesion = obtenerSesion();
  const headers = new Headers(opciones.headers);
  headers.set("Accept", "application/json");
  if (opciones.body) headers.set("Content-Type", "application/json");
  if (sesion?.token) headers.set("Authorization", `Bearer ${sesion.token}`);

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
  } catch {
    throw new Error("No fue posible conectar con la API. Comprueba que el backend esté iniciado.");
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      cerrarSesion();
      window.dispatchEvent(new Event("sesion-cerrada"));
    } else if (respuesta.status === 403) {
      window.dispatchEvent(new CustomEvent("acceso-denegado", { detail: { ruta, error: datos.error } }));
      const esRutaAdmin = typeof ruta === "string" && (ruta.startsWith("/admin") || ruta.startsWith("admin"));
      const enPantallaAdmin =
        typeof window !== "undefined" &&
        (window.location.pathname.startsWith("/admin") ||
          window.location.pathname === "/usuarios" ||
          window.location.pathname === "/gestion-turnos");

      if (esRutaAdmin || enPantallaAdmin) {
        // Si el rol en sesión local afirma ser admin, sincronizarlo para evitar inconsistencias
        if (sesion?.usuario && sesion.usuario.rol === "admin") {
          sesion.usuario.rol = "usuario";
          guardarSesion(sesion);
        }
        // En rutas administrativas, impedir que el usuario permanezca en la pantalla no autorizada
        if (enPantallaAdmin) {
          window.location.replace("/dashboard");
        }
      }
    }
    throw new Error(datos.error || "No fue posible completar la solicitud.");
  }
  return datos;
}

/**
 * Cierra sesión de forma activa: llama al endpoint del backend para revocar
 * el token JWT actual (inscribe su jti en sesiones_revocadas) y luego lo
 * elimina del localStorage. Si el backend no responde, la sesión local se
 * cierra igualmente para no bloquear al usuario.
 */
export async function cerrarSesionActiva() {
  const sesion = obtenerSesion();
  if (sesion?.token) {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Error de red o token ya inválido: continuar con cierre local de todas formas
    }
  }
  cerrarSesion();
  window.dispatchEvent(new Event("sesion-cerrada"));
}
