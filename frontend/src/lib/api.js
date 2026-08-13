import { cerrarSesion, obtenerSesion } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

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
    }
    throw new Error(datos.error || "No fue posible completar la solicitud.");
  }
  return datos;
}
