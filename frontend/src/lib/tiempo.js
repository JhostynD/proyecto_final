/**
 * tiempo.js — Utilidad centralizada de fecha y hora para FILA CERO (Frontend)
 *
 * Principios de diseño y garantías temporales:
 * 1. Formato visual estricto: "HH:MM AM/PM" (2 dígitos de hora, 2 de minutos, espacio y AM/PM en mayúsculas).
 * 2. Distinción explícita de origen temporal:
 *    - Horas de citas (t.hora) y datetimes locales: Son horas locales de Colombia (HH:mm / HH:mm:ss / YYYY-MM-DD HH:mm:ss).
 *      Se formatean matemáticamente sin new Date() para evitar desplazamientos por UTC o zona horaria del navegador.
 *    - Timestamps absolutos / UTC (creado_en con Z o con offset ±HH:mm, o Date): Se proyectan a America/Bogota (UTC-5).
 *    - Cadenas ISO sin zona horaria (ej: "2026-11-12T14:30:00"): Se interpretan explícitamente como fecha-hora
 *      local de Colombia sin agregar 'Z' artificialmente, previniendo desfases indebidos.
 * 3. Validación de fechas de calendario estricta: Se valida existencia real en el calendario gregoriano
 *    (incluyendo años bisiestos y longitudes de meses) sin instanciar new Date('YYYY-MM-DD').
 *    Cualquier fecha imposible, formato incompleto o contenido arbitrario posterior retorna "—".
 * 4. Validación de horas estricta: Todos los componentes (HH, MM, SS) deben ser numéricos completos dentro de rango.
 * 5. fechaHoyBogota(): Implementada con Intl.DateTimeFormat.formatToParts(), independiente de locales implícitos.
 * 6. Valores internos de formularios y API: Se preservan intactos en "HH:mm" (24h).
 */

export const ZONA_HORARIA_COLOMBIA = 'America/Bogota';

const NOMBRES_MESES_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

/**
 * Expresión regular definitiva para formatearFechaVisual():
 * Valida estrictamente 'YYYY-MM-DD'. Si contiene hora opcional (separada por T o espacio),
 * valida que la hora sea válida (00-23:00-59, segundos opcionales 00-59, milisegundos opcionales
 * y zona horaria opcional Z o ±HH:mm). Rechaza cualquier contenido arbitrario posterior.
 */
export const REGEX_FECHA_VISUAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;

/**
 * Expresión regular definitiva para timestamps sin zona horaria en formatearTimestampNotificacion():
 * Acepta 'YYYY-MM-DD HH:mm:ss' o 'YYYY-MM-DDTHH:mm:ss' (con o sin segundos / milisegundos),
 * sin aceptar sufijos alfanuméricos arbitrarios.
 */
export const REGEX_TIMESTAMP_SIN_ZONA = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/**
 * Determina si un año es bisiesto en el calendario gregoriano.
 *
 * @param {number} anio
 * @returns {boolean}
 */
export function esAnioBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0);
}

/**
 * Valida si una combinación numérica de año, mes y día corresponde a una fecha real en el calendario.
 *
 * @param {number} anio - Año (1000 - 9999)
 * @param {number} mes - Mes (1 - 12)
 * @param {number} dia - Día (1 - 31 según mes y año)
 * @returns {boolean}
 */
export function esFechaCalendarioValida(anio, mes, dia) {
  const y = Number(anio);
  const m = Number(mes);
  const d = Number(dia);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  if (y < 1000 || y > 9999) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;

  const diasPorMes = [31, esAnioBisiesto(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= diasPorMes[m - 1];
}

/**
 * Valida si una cadena corresponde al formato de 24 horas "HH:mm".
 * Utilizado para garantizar que los formularios sigan enviando "HH:mm" a la API.
 *
 * @param {string} str - Cadena a evaluar (ej: "14:30", "08:00")
 * @returns {boolean}
 */
export function esHoraValida24(str) {
  if (typeof str !== 'string') return false;
  const match = str.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return Boolean(match);
}

/**
 * Convierte horas, minutos y segundos numéricos escalares al formato visual estricto "HH:MM AM/PM".
 * Totalmente determinista, sin desfase de zona horaria ni dependencias de Date.
 * Rechaza cualquier componente que no sea numérico completo o que esté fuera de rango.
 *
 * @param {string|number} hStr - Hora (0 a 23)
 * @param {string|number} mStr - Minuto (0 a 59)
 * @param {string|number} [sStr=null] - Segundo opcional (0 a 59)
 * @returns {string} "HH:MM AM/PM" o "—" si los valores son inválidos
 */
function convertirHorasMinutosA12(hStr, mStr, sStr = null) {
  if (hStr === null || hStr === undefined || mStr === null || mStr === undefined) return '—';

  const hCad = String(hStr).trim();
  const mCad = String(mStr).trim();
  if (!/^\d{1,2}$/.test(hCad) || !/^\d{2}$/.test(mCad)) return '—';

  let sCad = null;
  if (sStr !== null && sStr !== undefined) {
    sCad = String(sStr).trim();
    if (!/^\d{2}$/.test(sCad)) return '—';
  }

  const horas24 = Number(hCad);
  const minutos = Number(mCad);
  const segundos = sCad !== null ? Number(sCad) : 0;

  if (horas24 < 0 || horas24 > 23 || minutos < 0 || minutos > 59 || segundos < 0 || segundos > 59) {
    return '—';
  }

  const periodo = horas24 >= 12 ? 'PM' : 'AM';
  const horas12 = horas24 % 12 || 12;

  const horasPad = String(horas12).padStart(2, '0');
  const minutosPad = String(minutos).padStart(2, '0');

  return `${horasPad}:${minutosPad} ${periodo}`;
}

/**
 * Proyecta una instancia Date (o timestamp absoluto UTC) a America/Bogota y retorna "HH:MM AM/PM".
 * Utiliza formatToParts() con en-US para asegurar estrictamente "AM" o "PM" en mayúsculas sin puntos.
 *
 * @param {Date} date
 * @returns {string} "HH:MM AM/PM"
 */
function formatearDateABogota(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA_COLOMBIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const parts = formatter.formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value?.padStart(2, '0') || '12';
  const m = parts.find((p) => p.type === 'minute')?.value?.padStart(2, '0') || '00';
  const dayPeriodRaw = parts.find((p) => p.type === 'dayPeriod')?.value || 'AM';
  const dayPeriod = dayPeriodRaw.toUpperCase().includes('P') ? 'PM' : 'AM';

  return `${h}:${m} ${dayPeriod}`;
}

/**
 * Formatea una hora a formato estricto de 12 horas con AM/PM: "HH:MM AM/PM".
 *
 * Soporta:
 * - Horas locales de Colombia: "HH:mm" (ej: "14:30" -> "02:30 PM", "8:00" -> "08:00 AM")
 * - Horas locales con segundos: "HH:mm:ss" (ej: "14:30:00" -> "02:30 PM", "00:00:00" -> "12:00 AM")
 * - Datetime MySQL con espacio: "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DD HH:mm" (hora local de Colombia)
 * - ISO sin zona horaria: "YYYY-MM-DDTHH:mm:ss" o "YYYY-MM-DDTHH:mm" (hora local de Colombia, sin shift UTC)
 * - Timestamps absolutos / UTC: Cadenas ISO con 'Z' o con offset explícito ±HH:mm, o instancias Date (proyectadas a America/Bogota)
 *
 * @param {string|Date|null|undefined} entrada
 * @returns {string} Hora formateada como "HH:MM AM/PM" o "—" si es inválida
 */
export function formatearHora12(entrada) {
  if (entrada === null || entrada === undefined || entrada === '') {
    return '—';
  }

  // ── CASO 1: Objeto Date nativo ──
  if (entrada instanceof Date) {
    if (isNaN(entrada.getTime())) return '—';
    return formatearDateABogota(entrada);
  }

  if (typeof entrada !== 'string') {
    return '—';
  }

  const str = entrada.trim();
  if (!str) return '—';

  // ── CASO 2: Timestamp con indicador explícito de zona horaria (UTC 'Z' o offset ±HH:mm) ──
  if (/Z$/i.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return formatearDateABogota(d);
  }

  // ── CASO 3: ISO sin zona horaria (ej: "2026-11-12T14:30:00") ──
  // Representa fecha y hora local de Colombia; no se debe asumir UTC ni desplazar.
  const matchIsoSinZona = str.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (matchIsoSinZona) {
    return convertirHorasMinutosA12(matchIsoSinZona[1], matchIsoSinZona[2], matchIsoSinZona[3]);
  }

  // ── CASO 4: Formato MySQL DATETIME con espacio: "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DD HH:mm" ──
  const matchFechaHora = str.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (matchFechaHora) {
    return convertirHorasMinutosA12(matchFechaHora[1], matchFechaHora[2], matchFechaHora[3]);
  }

  // ── CASO 5: Hora pura local de Colombia: "HH:mm" o "HH:mm:ss" ──
  const matchHora = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (matchHora) {
    return convertirHorasMinutosA12(matchHora[1], matchHora[2], matchHora[3]);
  }

  return '—';
}

/**
 * Formatea una fecha "YYYY-MM-DD" al formato visual "DD/MM/YYYY".
 *
 * Reglas de seguridad:
 * - Valida estrictamente que los componentes pertenezcan a una fecha real del calendario gregoriano.
 * - Si incluye parte horaria, valida estrictamente que la hora sea válida; no permite sufijos arbitrarios.
 * - Rechaza fechas imposibles (ej: 2026-02-30, 2026-19-12, 2026-00-10, 2025-02-29).
 * - Rechaza formatos incompletos o separadores incorrectos (ej: 2026/11/12, 2026-11).
 * - Descompone directamente la cadena sin instanciar new Date() para prevenir desplazamientos
 *   provocados por la interpretación de medianoche UTC en navegadores locales.
 *
 * @param {string} fechaIso - Cadena "YYYY-MM-DD" o con parte horaria "YYYY-MM-DDTHH:mm:ss"
 * @returns {string} Fecha formateada "DD/MM/YYYY" o "—" si es inválida
 */
export function formatearFechaVisual(fechaIso) {
  if (!fechaIso || typeof fechaIso !== 'string') return '—';
  const str = fechaIso.trim();

  // Validar formato estricto mediante REGEX_FECHA_VISUAL
  const match = str.match(REGEX_FECHA_VISUAL);
  if (!match) return '—';

  const [, yStr, mStr, dStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  if (!esFechaCalendarioValida(y, m, d)) {
    return '—';
  }

  return `${dStr}/${mStr}/${yStr}`;
}

/**
 * Retorna la fecha actual en America/Bogota en formato estándar "YYYY-MM-DD".
 * Implementada mediante formatToParts() sin depender de convenciones de orden de locale.
 *
 * @param {Date} [fechaReferencia=new Date()]
 * @returns {string} "YYYY-MM-DD"
 */
export function fechaHoyBogota(fechaReferencia = new Date()) {
  const d = fechaReferencia instanceof Date ? fechaReferencia : new Date(fechaReferencia);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA_COLOMBIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!y || !m || !day) return '';
  return `${y}-${m}-${day}`;
}

/**
 * Formatea una combinación de fecha y hora para mensajes amigables:
 * "DD/MM/YYYY a las HH:MM AM/PM"
 *
 * @param {string} fechaIso - ej: "2026-11-12"
 * @param {string} horaStr - ej: "14:30"
 * @returns {string}
 */
export function formatearFechaHora(fechaIso, horaStr) {
  const f = formatearFechaVisual(fechaIso);
  const h = formatearHora12(horaStr);

  if (f === '—' && h === '—') return '—';
  if (f === '—') return h;
  if (h === '—') return f;
  return `${f} a las ${h}`;
}

/**
 * Proyecta una instancia Date a America/Bogota para notificaciones:
 * "12 nov, 04:16 PM"
 *
 * @param {Date} date
 * @returns {string}
 */
function formatearDateNotificacionBogota(date) {
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA_HORARIA_COLOMBIA,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value;
  const month = parts.find((p) => p.type === 'month')?.value?.replace('.', '');
  const hour = parts.find((p) => p.type === 'hour')?.value?.padStart(2, '0');
  const minute = parts.find((p) => p.type === 'minute')?.value?.padStart(2, '0');
  const dayPeriodRaw = parts.find((p) => p.type === 'dayPeriod')?.value || 'AM';
  const amPm = dayPeriodRaw.toUpperCase().includes('P') ? 'PM' : 'AM';

  if (!day || !month || !hour || !minute) return '';
  return `${day} ${month}, ${hour}:${minute} ${amPm}`;
}

/**
 * Formatea marcas temporales de eventos y notificaciones (creado_en)
 * proyectadas a America/Bogota con mes abreviado y hora en formato 12h:
 * "12 nov, 04:16 PM"
 *
 * Reglas de interpretación:
 * - Timestamps con 'Z' o con offset (±HH:mm): Se interpretan como instantes absolutos y se proyectan a America/Bogota.
 * - Cadenas sin zona horaria ("YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DDTHH:mm:ss"): Se interpretan explícitamente
 *   como hora local de Colombia sin agregar 'Z' artificialmente, garantizando no desplazar horas locales.
 *
 * @param {string|Date} timestampEntrada - Marca temporal ISO, MySQL o instancia Date
 * @returns {string} Cadena formateada o "" si es inválida
 */
export function formatearTimestampNotificacion(timestampEntrada) {
  if (!timestampEntrada) return '';

  // 1. Objeto Date nativo
  if (timestampEntrada instanceof Date) {
    if (isNaN(timestampEntrada.getTime())) return '';
    return formatearDateNotificacionBogota(timestampEntrada);
  }

  if (typeof timestampEntrada !== 'string') return '';
  const str = timestampEntrada.trim();
  if (!str) return '';

  // 2. Cadena con indicador explícito de zona horaria (UTC 'Z' o offset ±HH:mm)
  if (/Z$/i.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    return formatearDateNotificacionBogota(d);
  }

  // 3. Cadena sin zona horaria (MySQL "YYYY-MM-DD HH:mm:ss" o ISO "YYYY-MM-DDTHH:mm:ss")
  // Interpretación explícita: fecha y hora local de Colombia sin agregar 'Z'
  const matchSinZona = str.match(REGEX_TIMESTAMP_SIN_ZONA);
  if (matchSinZona) {
    const [, yStr, mStr, dStr, hStr, minStr, sStr] = matchSinZona;
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);

    if (!esFechaCalendarioValida(y, m, d)) return '';

    const hora12 = convertirHorasMinutosA12(hStr, minStr, sStr);
    if (hora12 === '—') return '';

    const mesAbrev = NOMBRES_MESES_ES[m - 1];
    const diaNum = String(d);

    return `${diaNum} ${mesAbrev}, ${hora12}`;
  }

  return '';
}
