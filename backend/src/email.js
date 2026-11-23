import nodemailer from 'nodemailer';
import 'dotenv/config';

// Expresión regular robusta para validación de formato de correo electrónico
const REGEX_EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Límites máximos de longitud y tamaño para protección de memoria y prevención DoS
export const LIMITE_MAX_DESTINATARIO = 254; // RFC 5321 (longitud máxima de dirección de correo electrónico)
export const LIMITE_MAX_ASUNTO = 255;       // RFC 2822 / Longitud estándar para asuntos legibles y almacenamiento
export const LIMITE_MAX_CUERPO_BYTES = 500 * 1024; // 500 KB (512,000 bytes UTF-8) combinando texto y HTML

let transporteInstancia = null;

export function usaAPIBrevo() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim());
}

function parsearRemitente(valor) {
  const v = String(valor || '').trim();
  const m = v.match(/^(.*)<([^<>]+)>$/);
  if (m) {
    const nombre = m[1].trim().replace(/^"|"$/g, '');
    return { ...(nombre ? { name: nombre } : {}), email: m[2].trim() };
  }
  return { email: v };
}

async function llamarAPIBrevo(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`https://api.brevo.com/v3${ruta}`, {
      ...opciones,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        ...(opciones.headers || {})
      },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    const err = new Error('Fallo de red al contactar la API de Brevo.');
    err.code = 'ECONNECTION';
    throw err;
  }
  let datos = null;
  try { datos = await respuesta.json(); } catch { /* sin cuerpo JSON */ }
  if (!respuesta.ok) {
    const err = new Error(`Brevo API ${respuesta.status}: ${datos?.message || 'error'}`);
    err.responseCode = respuesta.status;
    if (respuesta.status === 401 || respuesta.status === 403) err.code = 'EAUTH';
    throw err;
  }
  return datos;
}

/**
 * Enmascara una dirección de correo electrónico para registros de auditoría y logs,
 * protegiendo los datos personales (PII) según los principios de privacidad.
 * Conserva una pequeña parte del usuario (primer y último carácter cuando es posible)
 * y el dominio del correo completo.
 *
 * Ejemplos:
 * - "usuario.validador@banco.com" -> "u***r@banco.com"
 * - "juan@correo.com"             -> "j***n@correo.com"
 * - "ed@banco.com"                -> "e*@banco.com"
 * - "a@banco.com"                 -> "a***@banco.com"
 * - Formato inválido o no string   -> "***"
 *
 * @param {string} correo - Dirección de correo electrónico
 * @returns {string} Dirección enmascarada para logs seguros
 */
export function enmascararCorreo(correo) {
  if (typeof correo !== 'string') return '***';
  const str = correo.trim();
  const arrobaIndex = str.lastIndexOf('@');

  // Si no contiene '@', o está al inicio o al final, no es un formato válido
  if (arrobaIndex <= 0 || arrobaIndex === str.length - 1) {
    return '***';
  }

  const usuario = str.slice(0, arrobaIndex);
  const dominio = str.slice(arrobaIndex + 1);

  let usuarioEnmascarado;
  if (usuario.length <= 1) {
    usuarioEnmascarado = `${usuario}***`;
  } else if (usuario.length === 2) {
    usuarioEnmascarado = `${usuario[0]}*`;
  } else {
    usuarioEnmascarado = `${usuario[0]}***${usuario[usuario.length - 1]}`;
  }

  return `${usuarioEnmascarado}@${dominio}`;
}

/**
 * Sanitiza cualquier texto o mensaje de error eliminando contraseñas conocidas
 * y enmascarando cualquier dirección de correo electrónico detectada.
 *
 * @param {string} texto
 * @returns {string} Texto sanitizado sin PII ni credenciales
 */
export function sanitizarMensajeError(texto) {
  if (typeof texto !== 'string') return '';
  let sanitizado = texto;

  // 1. Eliminar contraseña SMTP si estuviera definida en el entorno
  if (process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) {
    sanitizado = sanitizado.split(process.env.SMTP_PASS).join('[REDACTADO]');
  }

  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) {
    sanitizado = sanitizado.split(process.env.BREVO_API_KEY).join('[REDACTADO]');
  }

  // 2. Enmascarar cualquier correo electrónico presente en el texto
  const regexCorreosEnTexto = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
  sanitizado = sanitizado.replace(regexCorreosEnTexto, (correo) => enmascararCorreo(correo));

  // 3. Redactar credenciales en Base64 de comandos de autenticación SASL y tokens Bearer
  sanitizado = sanitizado.replace(/AUTH\s+(?:PLAIN|LOGIN)\s+[A-Za-z0-9+/=]{4,}/gi, 'AUTH [CREDENCIALES_REDACTADAS]');
  sanitizado = sanitizado.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [TOKEN_REDACTADO]');

  return sanitizado;
}

/**
 * Sanitiza el asunto de un correo electrónico para prevenir ataques de
 * inyección de encabezados (CRLF Header Injection) en servidores SMTP.
 * Sustituye cualquier secuencia de retornos de carro (\r) y saltos de línea (\n)
 * por un espacio simple, colapsa espacios en blanco repetidos y recorta extremos.
 *
 * @param {string} asunto - Asunto sin procesar
 * @returns {string} Asunto sanitizado en una sola línea
 */
export function sanitizarAsunto(asunto) {
  if (typeof asunto !== 'string') return '';
  return asunto
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Categoriza un error técnico producido por Nodemailer o la capa de red SMTP
 * y devuelve un código estandarizado junto con un mensaje seguro y genérico
 * para la respuesta del cliente, evitando fugas de IPs, puertos, rutas o credenciales.
 *
 * @param {Error|any} error - Objeto de error capturado
 * @returns {{ codigo: string, mensajeCliente: string }}
 */
export function categorizarErrorSMTP(error) {
  const code = String(error?.code || '').toUpperCase();
  const msg = String(error?.message || '').toLowerCase();
  const respCode = Number(error?.responseCode || 0);

  // 1. Errores de autenticación (credenciales inválidas, rechazo de comando AUTH)
  if (
    code === 'EAUTH' ||
    respCode === 535 ||
    msg.includes('authentication') ||
    msg.includes('invalid login') ||
    msg.includes('bad credentials')
  ) {
    return {
      codigo: 'ERROR_AUTENTICACION_SMTP',
      mensajeCliente: 'Error de autenticación con el servidor de correo electrónico.'
    };
  }

  // 2. Errores de conectividad de red / resolución DNS / Timeouts / Rechazo de conexión
  if (
    code === 'ECONNECTION' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    msg.includes('connect econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('timed out') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('greeting timed out')
  ) {
    return {
      codigo: 'ERROR_CONEXION_SMTP',
      mensajeCliente: 'No fue posible establecer conexión con el servidor de correo electrónico.'
    };
  }

  // 3. Destinatario rechazado por el servidor SMTP (rebotes 550, 551, 553, buzón inexistente)
  if (
    code === 'EENVELOPE' ||
    respCode === 550 ||
    respCode === 551 ||
    respCode === 553 ||
    respCode === 554 ||
    msg.includes('recipient address rejected') ||
    msg.includes('mailbox unavailable') ||
    msg.includes('user unknown') ||
    msg.includes('user not found')
  ) {
    return {
      codigo: 'DESTINATARIO_RECHAZADO',
      mensajeCliente: 'El servidor de correo rechazó la dirección del destinatario.'
    };
  }

  // 4. Fallo genérico / inesperado
  return {
    codigo: 'ERROR_SERVICIO_CORREO',
    mensajeCliente: 'Ocurrió un error inesperado en el servicio de correo electrónico.'
  };
}

/**
 * Valida la presencia de las variables de entorno obligatorias para el servicio SMTP.
 * No revela valores sensibles ni contraseñas en sus mensajes.
 *
 * @returns {{ valido: boolean, error?: string }}
 */
export function validarConfiguracionSMTP() {
  if (usaAPIBrevo()) {
    if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.trim()) {
      return { valido: false, error: 'Configuración de correo incompleta: falta EMAIL_FROM.' };
    }
    return { valido: true };
  }

  const faltantes = [];

  if (!process.env.SMTP_HOST || !process.env.SMTP_HOST.trim()) faltantes.push('SMTP_HOST');
  if (!process.env.SMTP_PORT || !String(process.env.SMTP_PORT).trim()) faltantes.push('SMTP_PORT');
  if (!process.env.SMTP_USER || !process.env.SMTP_USER.trim()) faltantes.push('SMTP_USER');
  if (!process.env.SMTP_PASS || !process.env.SMTP_PASS.trim()) faltantes.push('SMTP_PASS');
  if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.trim()) faltantes.push('EMAIL_FROM');

  if (faltantes.length > 0) {
    return {
      valido: false,
      error: `Configuración SMTP incompleta: faltan las siguientes variables de entorno: ${faltantes.join(', ')}.`
    };
  }

  return { valido: true };
}

/**
 * Crea y configura una instancia de transporte de Nodemailer con STARTTLS para el puerto 587,
 * validación estricta de certificados TLS y límites de tiempos de espera razonables.
 *
 * @returns {nodemailer.Transporter}
 */
export function crearTransporteSMTP() {
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true'; // false para puerto 587 (STARTTLS)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: port === 587 || !secure, // Exigir actualización segura STARTTLS en puerto 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: true, // Validación estricta de certificados TLS
      minVersion: 'TLSv1.2'
    },
    // Tiempos máximos de espera razonables para evitar colgar procesos (en milisegundos)
    connectionTimeout: 10_000, // 10 s para establecer conexión TCP inicial
    greetingTimeout: 10_000,   // 10 s para recibir el saludo del servidor SMTP
    socketTimeout: 15_000,     // 15 s de inactividad de socket
    // Conexión por pool para reutilizar sockets eficientemente
    pool: true,
    maxConnections: 3,
    maxMessages: 50
  });

  // Manejador seguro para eventos de error del pool de conexiones SMTP.
  // En Node.js, los EventEmitters que emiten 'error' sin un listener arrojan excepciones no controladas
  // que terminan el proceso. Este listener previene caídas por sockets inactivos cerrados o caídas de red.
  transporter.on('error', (err) => {
    const rawMsg = typeof err?.message === 'string' ? err.message : String(err || 'Error desconocido en pool SMTP.');
    const msgSanitizado = sanitizarMensajeError(rawMsg);
    console.error('[Email Pool] Error en conexión o socket del transporte SMTP:', msgSanitizado);
  });

  return transporter;
}

/**
 * Obtiene la instancia singleton del transporte SMTP reutilizable.
 *
 * @returns {nodemailer.Transporter}
 */
export function obtenerTransporte() {
  if (!transporteInstancia) {
    transporteInstancia = crearTransporteSMTP();
  }
  return transporteInstancia;
}

/**
 * Restablece y cierra el transporte SMTP activo (útil para pruebas o cambios de entorno).
 */
export function restablecerTransporte() {
  if (transporteInstancia) {
    try {
      transporteInstancia.close();
    } catch {
      // Silenciar errores de cierre de sockets
    }
    transporteInstancia = null;
  }
}

/**
 * Verifica el estado de la conexión SMTP contra el servidor configurado.
 * No propaga excepciones no controladas ni detiene el proceso del servidor.
 *
 * @returns {Promise<{ ok: boolean, mensaje?: string, error?: string, motivo?: string }>}
 */
export async function verificarConexionSMTP() {
  if (process.env.EMAIL_ENABLED !== 'true') {
    return {
      ok: false,
      motivo: 'EMAIL_ENABLED_DESHABILITADO',
      mensaje: 'El servicio de correo electrónico está deshabilitado por configuración (EMAIL_ENABLED no es "true").'
    };
  }

  const check = validarConfiguracionSMTP();
  if (!check.valido) {
    return {
      ok: false,
      error: check.error
    };
  }

  try {
    if (usaAPIBrevo()) {
      await llamarAPIBrevo('/account');
    } else {
      const transporte = obtenerTransporte();
      await transporte.verify();
    }
    return {
      ok: true,
      mensaje: 'Conexión con el servidor SMTP establecida y autenticada correctamente.'
    };
  } catch (error) {
    // 1. Registro diagnóstico seguro interno (con contraseñas y PII redactados)
    const errorSanitizado = sanitizarMensajeError(error?.message || 'No fue posible verificar la conexión SMTP.');
    console.error('[Email] Fallo en la verificación de conexión SMTP:', errorSanitizado);

    // 2. Respuesta controlada para el consumidor sin filtrar IPs, puertos ni detalles técnicos
    const { codigo, mensajeCliente } = categorizarErrorSMTP(error);

    return {
      ok: false,
      codigo,
      error: mensajeCliente
    };
  }
}

/**
 * Función reutilizable para el despacho de correos electrónicos transaccionales.
 * Valida destinatario, asunto y contenido antes de transmitir.
 *
 * Si EMAIL_ENABLED no es exactamente "true", omite el envío sin generar excepciones.
 * Si ocurre un fallo en el transporte SMTP, lo captura y retorna un objeto controlado
 * para garantizar la resiliencia del servidor Express.
 *
 * @param {object} params
 * @param {string} params.destinatario - Correo del usuario receptor
 * @param {string} params.asunto - Asunto del correo
 * @param {string} [params.texto] - Cuerpo en texto plano
 * @param {string} [params.html] - Cuerpo enriquecido en HTML
 * @returns {Promise<{ enviado: boolean, messageId?: string, error?: string, motivo?: string, codigo?: string }>}
 */
export async function enviarCorreoTransaccional({ destinatario, asunto, texto, html }) {
  // 1. Verificación de habilitación de servicio
  if (process.env.EMAIL_ENABLED !== 'true') {
    return {
      enviado: false,
      codigo: 'EMAIL_ENABLED_DESHABILITADO',
      motivo: 'EMAIL_ENABLED_DESHABILITADO',
      mensaje: 'Envío omitido: el servicio de correo está deshabilitado (EMAIL_ENABLED no es "true").'
    };
  }

  // 2. Validación de configuración obligatoria
  const checkConfig = validarConfiguracionSMTP();
  if (!checkConfig.valido) {
    return {
      enviado: false,
      codigo: 'CONFIGURACION_INCOMPLETA',
      error: checkConfig.error
    };
  }

  // 3. Validación de destinatario
  const destinoLimpio = typeof destinatario === 'string' ? destinatario.trim() : '';
  if (!destinoLimpio) {
    return {
      enviado: false,
      codigo: 'DESTINATARIO_INVALIDO',
      error: 'Dirección de correo destinatario no válida o ausente.'
    };
  }
  if (destinoLimpio.length > LIMITE_MAX_DESTINATARIO) {
    return {
      enviado: false,
      codigo: 'DESTINATARIO_LIMITE_EXCEDIDO',
      error: `La dirección de correo destinatario supera el límite máximo de ${LIMITE_MAX_DESTINATARIO} caracteres.`
    };
  }
  if (!REGEX_EMAIL.test(destinoLimpio)) {
    return {
      enviado: false,
      codigo: 'DESTINATARIO_INVALIDO',
      error: 'Dirección de correo destinatario no válida o ausente.'
    };
  }

  // 4. Validación y sanitización de asunto (prevención de inyección CRLF en encabezados)
  const asuntoLimpio = sanitizarAsunto(asunto);
  if (!asuntoLimpio) {
    return {
      enviado: false,
      codigo: 'ASUNTO_VACIO',
      error: 'El asunto del correo no puede estar vacío.'
    };
  }
  if (asuntoLimpio.length > LIMITE_MAX_ASUNTO) {
    return {
      enviado: false,
      codigo: 'ASUNTO_LIMITE_EXCEDIDO',
      error: `El asunto del correo supera el límite máximo de ${LIMITE_MAX_ASUNTO} caracteres.`
    };
  }

  // 5. Validación de contenido (debe tener al menos texto o html)
  const textoLimpio = typeof texto === 'string' ? texto.trim() : '';
  const htmlLimpio = typeof html === 'string' ? html.trim() : '';
  if (!textoLimpio && !htmlLimpio) {
    return {
      enviado: false,
      codigo: 'CONTENIDO_VACIO',
      error: 'El contenido del correo (texto o html) no puede estar vacío.'
    };
  }

  // 5.1 Verificación de tamaño máximo del cuerpo en bytes UTF-8 (texto + html combinados)
  const bytesTexto = textoLimpio ? Buffer.byteLength(textoLimpio, 'utf8') : 0;
  const bytesHtml = htmlLimpio ? Buffer.byteLength(htmlLimpio, 'utf8') : 0;
  const bytesTotales = bytesTexto + bytesHtml;

  if (bytesTotales > LIMITE_MAX_CUERPO_BYTES) {
    return {
      enviado: false,
      codigo: 'CUERPO_LIMITE_EXCEDIDO',
      error: `El cuerpo del correo supera el límite máximo permitido de 500 KB (${bytesTotales} bytes).`
    };
  }

  // 6. Preparación del mensaje
  const remitente = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const opcionesCorreo = {
    from: remitente,
    to: destinoLimpio,
    subject: asuntoLimpio,
    ...(textoLimpio ? { text: textoLimpio } : {}),
    ...(htmlLimpio ? { html: htmlLimpio } : {})
  };

  // 7. Despacho controlado a través del transporte
  const destinoEnmascarado = enmascararCorreo(destinoLimpio);

  try {
    let info;
    if (usaAPIBrevo()) {
      const datos = await llamarAPIBrevo('/smtp/email', {
        method: 'POST',
        body: JSON.stringify({
          sender: parsearRemitente(remitente),
          to: [{ email: destinoLimpio }],
          subject: asuntoLimpio,
          ...(textoLimpio ? { textContent: textoLimpio } : {}),
          ...(htmlLimpio ? { htmlContent: htmlLimpio } : {})
        })
      });
      info = { messageId: datos?.messageId, accepted: [destinoLimpio], rejected: [] };
    } else {
      const transporte = obtenerTransporte();
      info = await transporte.sendMail(opcionesCorreo);
    }

    // Registro seguro de auditoría: destinatario enmascarado (PII protegido) y messageId
    console.log(`[Email] Correo transaccional enviado a: ${destinoEnmascarado} | messageId: ${info.messageId}`);

    return {
      enviado: true,
      messageId: info.messageId,
      accepted: info.accepted || [destinoLimpio],
      rejected: info.rejected || []
    };
  } catch (error) {
    // 1. Diagnóstico interno para registros seguros (con contraseñas y PII protegidos)
    const errorRaw = typeof error?.message === 'string' ? error.message : 'Error desconocido al enviar correo transaccional.';
    const errorDiagnostico = sanitizarMensajeError(errorRaw.split(destinoLimpio).join(destinoEnmascarado));

    // Registro seguro de error en servidor sin exponer PII ni contraseñas
    console.error(`[Email] Error al enviar correo transaccional a ${destinoEnmascarado}:`, errorDiagnostico);

    // 2. Respuesta controlada para el cliente sin filtrar IPs, hosts, puertos ni detalles técnicos
    const { codigo, mensajeCliente } = categorizarErrorSMTP(error);

    return {
      enviado: false,
      codigo,
      error: mensajeCliente
    };
  }
}
