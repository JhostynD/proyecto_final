import jwt from 'jsonwebtoken';
import 'dotenv/config';

// 1E: Validación obligatoria de JWT_SECRET
const secret = process.env.JWT_SECRET;
if (!secret || typeof secret !== 'string' || secret.trim() === '') {
  throw new Error('Error crítico de configuración: La variable de entorno JWT_SECRET es obligatoria y no puede estar vacía.');
}

export function crearToken(usuario) {
  return jwt.sign({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, secret, { expiresIn: '8h' });
}

export function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  try {
    req.usuario = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }
}

export function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores.' });
  return next();
}

// -------------------------------------------------------------
// 1F: Rate limiting en memoria para POST /api/auth/login
// Ventanas temporales por IP y por correo normalizado
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

