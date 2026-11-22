import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { db } from './db.js';
import crypto, { randomUUID } from 'crypto';

// 1E: Validación obligatoria de JWT_SECRET
const secret = process.env.JWT_SECRET;
if (!secret || typeof secret !== 'string' || secret.trim() === '') {
  throw new Error('Error crítico de configuración: La variable de entorno JWT_SECRET es obligatoria y no puede estar vacía.');
}

/**
 * Genera un token JWT con un identificador único (jti) y la versión de autenticación (auth_version)
 * que permite su revocación individual o global tras restablecer contraseña.
 */
export function crearToken(usuario) {
  const version = typeof usuario.auth_version === 'number' && usuario.auth_version >= 1
    ? usuario.auth_version
    : 1;

  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      auth_version: version,
      jti: randomUUID()
    },
    secret,
    { expiresIn: '8h' }
  );
}

/**
 * Middleware de autenticación estricta (fail-closed).
 * Verifica firma, expiración, presencia obligatoria de jti,
 * consulta si el token fue revocado en sesiones_revocadas,
 * y valida que la cuenta del usuario permanezca activa, con su rol actualizado en BD,
 * y que auth_version coincida con la versión vigente en base de datos.
 */
export async function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }

  // Rechazar tokens sin identificador único jti (legacy o no rastreables)
  if (!payload.jti) {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }

  // 1. Verificar si el token fue revocado explícitamente (fail-closed)
  const [[revocado]] = await db.execute(
    'SELECT 1 FROM sesiones_revocadas WHERE jti = ? LIMIT 1',
    [payload.jti]
  );
  if (revocado) {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }

  // 2. Validar que el usuario siga existiendo, su cuenta esté activa en tiempo real y auth_version coincida
  let usuarioDb;
  try {
    const [filas] = await db.execute(
      'SELECT activo, rol, auth_version FROM usuarios WHERE id = ? LIMIT 1',
      [payload.id]
    );
    usuarioDb = filas[0];
  } catch (err) {
    // Si la columna auth_version aún no existe (migración pendiente)
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const [filas] = await db.execute(
        'SELECT activo, rol FROM usuarios WHERE id = ? LIMIT 1',
        [payload.id]
      );
      usuarioDb = filas[0];
    } else {
      throw err;
    }
  }

  if (!usuarioDb || usuarioDb.activo === 0 || usuarioDb.activo === false) {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }

  // 3. Validación de versión de autenticación (auth_version)
  // Regla de compatibilidad: Si el JWT no contiene auth_version (emitido antes del cambio), se interpreta como 1.
  // Si la versión en BD es 1, se permite la sesión antigua. Si la versión en BD es > 1, se rechaza.
  if (usuarioDb.auth_version !== undefined && usuarioDb.auth_version !== null) {
    const versionToken = typeof payload.auth_version === 'number' ? payload.auth_version : 1;
    const versionDb = Number(usuarioDb.auth_version);
    if (versionToken !== versionDb) {
      return res.status(401).json({
        error: 'Tu sesión ha expirado por cambio de contraseña. Por favor inicia sesión de nuevo.'
      });
    }
  }

  // Sincronizar el rol vigente de la BD para evitar privilegios obsoletos tras degradación
  payload.rol = usuarioDb.rol;

  req.usuario = payload;
  return next();
}

export function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores.' });
  return next();
}

// -------------------------------------------------------------
// 1F: Rate limiting en memoria para POST /api/auth/login
// Ventanas temporales por IP y por correo normalizado
// Limitación: en entornos con múltiples instancias o tras reinicios,
// los contadores se pierden. Para producción con clustering, usar
// un almacenamiento compartido (Redis, MySQL). Ver documentación.
// -------------------------------------------------------------
const intentosPorIp = new Map();
const intentosPorCorreo = new Map();

const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const MAX_INTENTOS_CORREO = 5;      // 5 intentos por correo
const MAX_INTENTOS_IP = 20;         // 20 intentos por IP

// Limpieza periódica de entradas vencidas cada 5 minutos
const intervaloLimpieza = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of intentosPorIp.entries()) {
    if (ahora - datos.primerIntento > VENTANA_MS) {
      intentosPorIp.delete(ip);
    }
  }
  for (const [correo, datos] of intentosPorCorreo.entries()) {
    if (ahora - datos.primerIntento > VENTANA_MS) {
      intentosPorCorreo.delete(correo);
    }
  }
}, 5 * 60 * 1000);

if (intervaloLimpieza.unref) {
  intervaloLimpieza.unref(); // No retiene el proceso si termina
}

/**
 * Middleware para limitar intentos de inicio de sesión.
 * Devuelve 429 sin revelar la existencia del correo en la base de datos.
 */
export function limitarIntentos(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'ip-desconocida';
  const correoRaw = req.body?.correo || req.body?.email || '';
  const correoNorm = typeof correoRaw === 'string' ? correoRaw.trim().toLowerCase() : '';

  // 1. Verificar límite por IP
  const registroIp = intentosPorIp.get(ip);
  if (registroIp) {
    if (ahora - registroIp.primerIntento > VENTANA_MS) {
      intentosPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
    } else if (registroIp.cuenta >= MAX_INTENTOS_IP) {
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesión desde este origen. Por favor espera 15 minutos antes de intentar nuevamente.'
      });
    } else {
      registroIp.cuenta += 1;
    }
  } else {
    intentosPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
  }

  // 2. Verificar límite por Correo (si fue proporcionado)
  if (correoNorm) {
    const registroCorreo = intentosPorCorreo.get(correoNorm);
    if (registroCorreo) {
      if (ahora - registroCorreo.primerIntento > VENTANA_MS) {
        intentosPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
      } else if (registroCorreo.cuenta >= MAX_INTENTOS_CORREO) {
        return res.status(429).json({
          error: 'Demasiados intentos de inicio de sesión para esta cuenta. Por favor espera 15 minutos antes de intentar nuevamente.'
        });
      } else {
        registroCorreo.cuenta += 1;
      }
    } else {
      intentosPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
    }
  }

  next();
}

/**
 * Restablece contadores de rate limiting.
 * - En autenticación legítima: si se recibe un correo, elimina los intentos fallidos acumulados
 *   para esa cuenta tras un inicio de sesión exitoso.
 * - En pruebas internas (NODE_ENV === 'test'): permite reiniciar mapas en memoria sin exponer
 *   ninguna ruta HTTP.
 * - En cualquier otro contexto: no realiza reinicios globales para proteger contra fuerza bruta.
 */
export function resetearLimitador(correo = null) {
  if (correo && typeof correo === 'string') {
    intentosPorCorreo.delete(correo.trim().toLowerCase());
    return true;
  }
  if (process.env.NODE_ENV === 'test') {
    intentosPorIp.clear();
    intentosPorCorreo.clear();
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// LIMITADOR DE CONSULTAS PÚBLICAS DE TURNOS
// Ventana: 1 minuto (60.000 ms) | Límite: 15 consultas por minuto por IP
//
// NOTA DE ARQUITECTURA SOBRE ALMACENAMIENTO EN MEMORIA Y 'trust proxy':
// 1. Este limitador almacena los contadores en memoria de proceso (Map local).
//    En un entorno escalado horizontalmente (múltiples réplicas de Node.js o
//    contenedores Kubernetes), los contadores no son compartidos entre instancias.
//    Para despliegues de múltiples réplicas se requeriría un almacén distribuido (ej. Redis).
// 2. Identificación segura de IP:
//    Express opera por defecto con 'trust proxy' desactivado (false), lo cual garantiza
//    que 'req.ip' y 'req.socket.remoteAddress' provengan exclusivamente del socket TCP
//    subyacente y no puedan ser falsificados por cabeceras manipuladas por clientes
//    (como X-Forwarded-For o X-Real-IP enviadas maliciosamente).
//    Si la aplicación se despliega tras un proxy inverso legítimo (Nginx, ALB, Cloudflare),
//    'trust proxy' debe configurarse explícitamente a las subredes o direcciones IP
//    de confianza para que Express procese de forma segura la cadena de reenvío.
// -------------------------------------------------------------
const consultasPublicasPorIp = new Map();
const VENTANA_CONSULTA_PUBLICA_MS = 60 * 1000; // 1 minuto
const MAX_CONSULTAS_PUBLICAS_IP = 15;          // 15 solicitudes por minuto por IP
// Cota de seguridad: impide crecimiento ilimitado del Map bajo carga masiva o ataques
// de enumeracion desde muchas IPs distintas.
//
// Politica FAIL-CLOSED: cuando el Map alcanza la cota y llega una IP sin registro,
// se rechaza la peticion con 429 en lugar de expulsar registros existentes.
// Razon: la expulsion FIFO permite a un atacante resetear su propio contador dentro
// de la ventana activa saturando el Map con ~10 000 IPs distintas, evadiendo el limite.
// La limpieza periodica cada 60 s libera espacio de forma segura al expirar registros.
const MAX_ENTRADAS_CONSULTA_PUBLICA = 10_000;

// Limpieza periodica de entradas vencidas cada 1 minuto.
// Esta es la unica via por la que se eliminan entradas: solo cuando han expirado.
const intervaloLimpiezaPublica = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of consultasPublicasPorIp.entries()) {
    if (ahora - datos.primerIntento > VENTANA_CONSULTA_PUBLICA_MS) {
      consultasPublicasPorIp.delete(ip);
    }
  }
}, 60 * 1000);

if (intervaloLimpiezaPublica.unref) {
  intervaloLimpiezaPublica.unref();
}

/**
 * Middleware para limitar consultas al endpoint publico de turnos.
 * Maximo 15 peticiones por minuto por IP (identificacion por socket TCP, sin
 * confiar en X-Forwarded-For ni otras cabeceras manipulables por el cliente).
 *
 * Cuando el Map alcanza MAX_ENTRADAS_CONSULTA_PUBLICA (fail-closed):
 *   - Las IPs ya registradas siguen siendo evaluadas normalmente.
 *   - Las IPs nuevas reciben 429 hasta que la limpieza periodica libere espacio.
 * Esto previene la evasion del rate limit por saturacion del Map.
 */
export function limitarConsultaPublica(req, res, next) {
  const ahora = Date.now();
  // Obtener la IP sin confiar en cabeceras falsificables por el cliente.
  // Express opera con 'trust proxy' desactivado por defecto, por lo que req.ip
  // y req.socket.remoteAddress reflejan exclusivamente la direccion TCP del socket.
  const ip = req.ip || req.socket?.remoteAddress || 'ip-desconocida';

  const registro = consultasPublicasPorIp.get(ip);
  if (registro) {
    // IP conocida: evaluar dentro de su ventana
    if (ahora - registro.primerIntento > VENTANA_CONSULTA_PUBLICA_MS) {
      // Ventana expirada: reiniciar contador para esta IP
      consultasPublicasPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
    } else if (registro.cuenta >= MAX_CONSULTAS_PUBLICAS_IP) {
      return res.status(429).json({
        error: 'Demasiadas consultas de turnos desde esta direccion IP. Por favor espera un minuto antes de intentar nuevamente.'
      });
    } else {
      registro.cuenta += 1;
    }
  } else {
    // IP nueva: aplicar fail-closed si el Map esta lleno
    if (consultasPublicasPorIp.size >= MAX_ENTRADAS_CONSULTA_PUBLICA) {
      // No expulsamos registros vigentes. La peticion se rechaza temporalmente
      // hasta que la limpieza periodica libere espacio al expirar entradas.
      return res.status(429).json({
        error: 'El servidor esta procesando demasiadas consultas en este momento. Por favor intenta de nuevo en unos instantes.'
      });
    }
    consultasPublicasPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
  }

  next();
}

/**
 * Restablece contadores del limitador publico (utilizado en pruebas automatizadas).
 */
export function resetearLimitadorConsultaPublica() {
  if (process.env.NODE_ENV === 'test') {
    consultasPublicasPorIp.clear();
    return true;
  }
  return false;
}

/**
 * Llena el Map hasta la cota con entradas sinteticas dentro de la ventana activa.
 * Solo disponible en entorno de test. Permite simular saturacion sin manipular
 * la logica interna del middleware.
 * @param {number} n - Numero de entradas a insertar.
 */
export function llenarLimitadorConsultaPublica(n = MAX_ENTRADAS_CONSULTA_PUBLICA) {
  if (process.env.NODE_ENV !== 'test') return false;
  if (!Number.isInteger(n) || n <= 0 || n > MAX_ENTRADAS_CONSULTA_PUBLICA) {
    return false;
  }
  const ahora = Date.now();
  for (let i = consultasPublicasPorIp.size; i < n; i++) {
    // Usar prefijo distinto a 127.0.0.1 para no interferir con la IP real del test
    consultasPublicasPorIp.set('10.0.' + Math.floor(i / 256) + '.' + (i % 256), { cuenta: 1, primerIntento: ahora });
  }
  return consultasPublicasPorIp.size;
}

/**
 * Revoca un token JWT registrando su jti en la BD.
 * Usado en logout y al cambiar rol o deshabilitar cuenta.
 * Si la tabla no existe aún (migración pendiente), registra advertencia sin lanzar error.
 */
export async function revocarToken(payload) {
  if (!payload?.jti || !payload?.id) return false;
  // Calcular momento de expiración real del token
  const expiraEn = payload.exp
    ? new Date(payload.exp * 1000).toISOString().slice(0, 19).replace('T', ' ')
    : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await db.execute(
    'INSERT IGNORE INTO sesiones_revocadas (jti, usuario_id, expira_en) VALUES (?, ?, ?)',
    [payload.jti, payload.id, expiraEn]
  );
  return true;
}

// -------------------------------------------------------------
// LIMITADOR DE REENVÍO DE CORREO DE VERIFICACIÓN
// Ventana: 15 minutos | Límite: 3 por correo, 10 por IP
// -------------------------------------------------------------
const reenviosPorIp = new Map();
const reenviosPorCorreo = new Map();

const VENTANA_REENVIO_MS = 15 * 60 * 1000; // 15 minutos
const MAX_REENVIOS_CORREO = 3;             // 3 solicitudes por correo cada 15 min
const MAX_REENVIOS_IP = 10;                // 10 solicitudes por IP cada 15 min

const intervaloLimpiezaReenvio = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of reenviosPorIp.entries()) {
    if (ahora - datos.primerIntento > VENTANA_REENVIO_MS) {
      reenviosPorIp.delete(ip);
    }
  }
  for (const [correo, datos] of reenviosPorCorreo.entries()) {
    if (ahora - datos.primerIntento > VENTANA_REENVIO_MS) {
      reenviosPorCorreo.delete(correo);
    }
  }
}, 5 * 60 * 1000);

if (intervaloLimpiezaReenvio.unref) {
  intervaloLimpiezaReenvio.unref();
}

/**
 * Middleware para limitar la frecuencia de solicitudes de reenvío
 * de correo de verificación tanto por IP como por correo destinatario.
 */
export function limitarReenvioVerificacion(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'ip-desconocida';
  const correoRaw = req.body?.correo || req.body?.email || '';
  const correoNorm = typeof correoRaw === 'string' ? correoRaw.trim().toLowerCase() : '';

  // 1. Verificar límite por IP
  const regIp = reenviosPorIp.get(ip);
  if (regIp) {
    if (ahora - regIp.primerIntento > VENTANA_REENVIO_MS) {
      reenviosPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
    } else if (regIp.cuenta >= MAX_REENVIOS_IP) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes de reenvío desde este origen. Por favor espera 15 minutos antes de intentar de nuevo.'
      });
    } else {
      regIp.cuenta += 1;
    }
  } else {
    reenviosPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
  }

  // 2. Verificar límite por Correo (si se proporcionó)
  if (correoNorm) {
    const regCorreo = reenviosPorCorreo.get(correoNorm);
    if (regCorreo) {
      if (ahora - regCorreo.primerIntento > VENTANA_REENVIO_MS) {
        reenviosPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
      } else if (regCorreo.cuenta >= MAX_REENVIOS_CORREO) {
        return res.status(429).json({
          error: 'Demasiadas solicitudes de reenvío para esta cuenta. Por favor espera 15 minutos antes de intentar de nuevo.'
        });
      } else {
        regCorreo.cuenta += 1;
      }
    } else {
      reenviosPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
    }
  }

  next();
}

/**
 * Restablece los limitadores de reenvío (usado en pruebas automatizadas).
 */
export function resetearLimitadorReenvio() {
  if (process.env.NODE_ENV === 'test') {
    reenviosPorIp.clear();
    reenviosPorCorreo.clear();
    return true;
  }
  return false;
}

/**
 * Genera un token criptográficamente seguro y su hash SHA-256.
 * El token original (plano) se entrega únicamente al usuario por correo.
 * En la base de datos solo se debe persistir el hash SHA-256 (64 hex).
 */
export function generarTokenVerificacion() {
  const tokenPlano = crypto.randomBytes(32).toString('hex'); // 64 caracteres hex
  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');
  return { tokenPlano, tokenHash };
}

/**
 * Genera un token seguro para recuperación de contraseña (32 bytes / 64 hex) y su hash SHA-256.
 */
export function generarTokenRecuperacion() {
  const tokenPlano = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');
  return { tokenPlano, tokenHash };
}

// -------------------------------------------------------------
// LIMITADOR DE SOLICITUDES DE RECUPERACIÓN DE CONTRASEÑA
// Ventana: 15 minutos | Límite: 3 por correo, 10 por IP
// -------------------------------------------------------------
const recuperacionPorIp = new Map();
const recuperacionPorCorreo = new Map();

const VENTANA_RECUPERACION_MS = 15 * 60 * 1000; // 15 minutos
const MAX_RECUPERACION_CORREO = 3;              // 3 solicitudes por correo cada 15 min
const MAX_RECUPERACION_IP = 10;                 // 10 solicitudes por IP cada 15 min

const intervaloLimpiezaRecuperacion = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of recuperacionPorIp.entries()) {
    if (ahora - datos.primerIntento > VENTANA_RECUPERACION_MS) {
      recuperacionPorIp.delete(ip);
    }
  }
  for (const [correo, datos] of recuperacionPorCorreo.entries()) {
    if (ahora - datos.primerIntento > VENTANA_RECUPERACION_MS) {
      recuperacionPorCorreo.delete(correo);
    }
  }
}, 5 * 60 * 1000);

if (intervaloLimpiezaRecuperacion.unref) {
  intervaloLimpiezaRecuperacion.unref();
}

/**
 * Middleware para limitar la frecuencia de solicitudes de recuperación
 * de contraseña tanto por IP como por correo destinatario (anti-abuso).
 */
export function limitarRecuperacionContrasena(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'ip-desconocida';
  const correoRaw = req.body?.correo || req.body?.email || '';
  const correoNorm = typeof correoRaw === 'string' ? correoRaw.trim().toLowerCase() : '';

  // 1. Verificar límite por IP
  const regIp = recuperacionPorIp.get(ip);
  if (regIp) {
    if (ahora - regIp.primerIntento > VENTANA_RECUPERACION_MS) {
      recuperacionPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
    } else if (regIp.cuenta >= MAX_RECUPERACION_IP) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes de recuperación de contraseña desde este origen. Por favor espera 15 minutos antes de intentar de nuevo.'
      });
    } else {
      regIp.cuenta += 1;
    }
  } else {
    recuperacionPorIp.set(ip, { cuenta: 1, primerIntento: ahora });
  }

  // 2. Verificar límite por Correo (si se proporcionó)
  if (correoNorm) {
    const regCorreo = recuperacionPorCorreo.get(correoNorm);
    if (regCorreo) {
      if (ahora - regCorreo.primerIntento > VENTANA_RECUPERACION_MS) {
        recuperacionPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
      } else if (regCorreo.cuenta >= MAX_RECUPERACION_CORREO) {
        return res.status(429).json({
          error: 'Demasiadas solicitudes de recuperación para esta cuenta. Por favor espera 15 minutos antes de intentar de nuevo.'
        });
      } else {
        regCorreo.cuenta += 1;
      }
    } else {
      recuperacionPorCorreo.set(correoNorm, { cuenta: 1, primerIntento: ahora });
    }
  }

  next();
}

/**
 * Restablece los limitadores de recuperación (usado en pruebas automatizadas).
 */
export function resetearLimitadorRecuperacion() {
  if (process.env.NODE_ENV === 'test') {
    recuperacionPorIp.clear();
    recuperacionPorCorreo.clear();
    return true;
  }
  return false;
}

/**
 * Calcula el hash SHA-256 de un token en claro.
 */
export function hashearToken(tokenPlano) {
  if (typeof tokenPlano !== 'string' || !tokenPlano.trim()) return '';
  return crypto.createHash('sha256').update(tokenPlano.trim()).digest('hex');
}
