/**
 * Festivos oficiales de Colombia (Ley 51 de 1983 - Ley Emiliani).
 * Archivo configurable e independiente de la lógica principal.
 */

// Algoritmo Computus para calcular el domingo de Pascua de un año determinado
function calcularPascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, mes - 1, dia));
}

// Sumar días a una fecha UTC
function agregarDias(fecha, dias) {
  const res = new Date(fecha.getTime());
  res.setUTCDate(res.getUTCDate() + dias);
  return res;
}

// Trasladar al siguiente lunes si no cae en lunes (Ley Emiliani)
function siguienteLunes(fecha) {
  const diaSemana = fecha.getUTCDay(); // 0 = Dom, 1 = Lun, 2 = Mar...
  if (diaSemana === 1) return fecha;
  const diasFaltantes = (8 - diaSemana) % 7;
  return agregarDias(fecha, diasFaltantes);
}

function formatearFechaUTC(fecha) {
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fecha.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Genera el conjunto de fechas festivas (YYYY-MM-DD) para un año dado en Colombia.
 */
export function obtenerFestivosColombia(year) {
  const pascua = calcularPascua(year);
  const festivos = new Set();

  // 1. Festivos Fijos (no se trasladan)
  festivos.add(`${year}-01-01`); // Año Nuevo
  festivos.add(`${year}-05-01`); // Día del Trabajo
  festivos.add(`${year}-07-20`); // Grito de Independencia
  festivos.add(`${year}-08-07`); // Batalla de Boyacá
  festivos.add(`${year}-12-08`); // Inmaculada Concepción
  festivos.add(`${year}-12-25`); // Navidad

  // 2. Festivos relativos a Pascua (no se trasladan)
  festivos.add(formatearFechaUTC(agregarDias(pascua, -3))); // Jueves Santo
  festivos.add(formatearFechaUTC(agregarDias(pascua, -2))); // Viernes Santo

  // 3. Festivos con traslado al siguiente lunes (Ley Emiliani)
  // Fechas fijas que se trasladan:
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 0, 6)))));  // Reyes Magos (6 Ene)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 2, 19))))); // San José (19 Mar)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 5, 29))))); // San Pedro y San Pablo (29 Jun)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 7, 15))))); // Asunción de la Virgen (15 Ago)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 9, 12))))); // Día de la Raza (12 Oct)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 10, 1))))); // Todos los Santos (1 Nov)
  festivos.add(formatearFechaUTC(siguienteLunes(new Date(Date.UTC(year, 10, 11)))));// Indep. de Cartagena (11 Nov)

  // Fechas relativas a Pascua que se trasladan al siguiente lunes:
  // Ascensión del Señor: Pascua + 39 días -> siguiente lunes (+43 días)
  festivos.add(formatearFechaUTC(siguienteLunes(agregarDias(pascua, 39))));
  // Corpus Christi: Pascua + 60 días -> siguiente lunes (+64 días)
  festivos.add(formatearFechaUTC(siguienteLunes(agregarDias(pascua, 60))));
  // Sagrado Corazón de Jesús: Pascua + 68 días -> siguiente lunes (+71 días)
  festivos.add(formatearFechaUTC(siguienteLunes(agregarDias(pascua, 68))));

  return festivos;
}

// Caché de festivos por año para optimizar rendimiento
const cacheFestivos = new Map();

function getFestivosAnio(year) {
  if (!cacheFestivos.has(year)) {
    cacheFestivos.set(year, obtenerFestivosColombia(year));
  }
  return cacheFestivos.get(year);
}

/**
 * Valida si una fecha (YYYY-MM-DD) es festivo oficial en Colombia.
 */
export function esFestivoColombia(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return false;
  const anio = parseInt(fechaStr.slice(0, 4), 10);
  if (isNaN(anio)) return false;
  const festivos = getFestivosAnio(anio);
  return festivos.has(fechaStr);
}

/**
 * Valida si una fecha (YYYY-MM-DD) es día hábil (lunes a viernes no festivo).
 */
export function esDiaHabil(fechaStr) {
  if (!fechaStr || !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return false;
  // Parsear fecha en UTC para evitar desfases horarios
  const d = new Date(`${fechaStr}T12:00:00Z`);
  const diaSemana = d.getUTCDay();
  // 0 = Domingo, 6 = Sábado
  if (diaSemana === 0 || diaSemana === 6) {
    return false;
  }
  return !esFestivoColombia(fechaStr);
}

export const JORNADA_INICIO_MIN = 8 * 60; // 08:00 (480 minutos)
export const JORNADA_FIN_MIN = 16 * 60 + 30; // 16:30 (990 minutos)
