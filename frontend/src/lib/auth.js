const CLAVE_SESION = "turnos_sesion";

export function obtenerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION)) || null;
  } catch {
    localStorage.removeItem(CLAVE_SESION);
    return null;
  }
}

export function guardarSesion(sesion) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export function cerrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}
