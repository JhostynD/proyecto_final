import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { db } from './db.js';
import { autenticar, crearToken, soloAdmin } from './auth.js';

const app = express();
const puerto = Number(process.env.PORT || 3000);
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// -------------------------------------------------------------
// HELPERS DE ZONA HORARIA (Colombia UTC-5) Y FORMATOS
// -------------------------------------------------------------

// Fecha actual en Colombia: YYYY-MM-DD
const fechaHoyColombia = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
};

// Hora actual en Colombia: HH:mm:ss
const horaActualColombia = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
};

const horaValida = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const fechaValida = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(fechaParseada.getTime()) && fechaParseada.toISOString().slice(0, 10) === fecha;
};

// Convertir "HH:mm" o "HH:mm:ss" a minutos desde medianoche
const minutosDesdeMedianoche = (horaStr) => {
  if (!horaStr) return 0;
  const partes = horaStr.split(':').map(Number);
  return (partes[0] || 0) * 60 + (partes[1] || 0);
};

// Convertir minutos a string "HH:mm"
const minutosAHora = (minutos) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Normalizar fecha de BD (sea Date o string) a formato estándar YYYY-MM-DD
const normalizarFecha = (fecha) => {
  if (!fecha) return '';
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  if (fecha instanceof Date) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(fecha).slice(0, 10);
};

// Formatear hora de BD a "HH:mm"
const formatearHora = (hora) => {
  if (!hora) return '00:00';
  if (typeof hora === 'string') return hora.slice(0, 5);
  return String(hora).slice(0, 5);
};

// Estados permitidos y transiciones válidas del ciclo de vida
const ESTADOS_VALIDOS = new Set([
  'pendiente',
  'confirmado',
  'en_espera',
  'llamando',
  'en_atencion',
  'completado',
  'cancelado',
  'no_presentado'
]);

const TRANSICIONES_VALIDAS = {
  pendiente: new Set(['confirmado', 'cancelado', 'en_espera']),
  confirmado: new Set(['en_espera', 'cancelado']),
  en_espera: new Set(['llamando', 'cancelado', 'no_presentado']),
  llamando: new Set(['en_atencion', 'no_presentado', 'cancelado', 'en_espera']),
  en_atencion: new Set(['completado', 'cancelado']),
  completado: new Set(),
  cancelado: new Set(),
  no_presentado: new Set()
};

// Generador determinístico de código bancario (Ej. A-021, C-101, T-102)
async function generarCodigoTurno(fecha, servicioId, modalidad = 'cita') {
  const [[servicio]] = await db.execute('SELECT nombre FROM servicios WHERE id = ?', [servicioId]);
  let letra = (servicio?.nombre?.trim().charAt(0) || 'A').toUpperCase();
  if (modalidad === 'turno' && !servicio) letra = 'T';

  const [filas] = await db.execute(
    "SELECT codigo_turno FROM turnos WHERE fecha = ? AND codigo_turno LIKE ? ORDER BY id DESC LIMIT 50",
    [fecha, `${letra}-%`]
  );

  let maxCorrelativo = 20;
  for (const fila of filas) {
    if (fila.codigo_turno && fila.codigo_turno.includes('-')) {
      const num = parseInt(fila.codigo_turno.split('-')[1], 10);
      if (!isNaN(num) && num > maxCorrelativo) maxCorrelativo = num;
    }
  }

  return `${letra}-${String(maxCorrelativo + 1).padStart(3, '0')}`;
}

// -------------------------------------------------------------
// MOTOR DE DISPONIBILIDAD Y GENERACIÓN DINÁMICA DE HORARIOS
// -------------------------------------------------------------
function calcularDisponibilidadSlots({ duracionMin, citasExistentes, horaActualBogota, esHoy }) {
  const inicioDia = 8 * 60;    // 08:00
  const finDia = 16 * 60 + 30;  // 16:30
  const slotsDisponibles = [];

  // Mapear citas activas a intervalos [inicio, fin] en minutos
  const intervalosOcupados = citasExistentes.map((c) => {
    const ini = minutosDesdeMedianoche(c.hora);
    const dur = Number(c.duracion_estimada_min || duracionMin);
    return { inicio: ini, fin: ini + dur, horaStr: formatearHora(c.hora) };
  });

  const minutosAhora = esHoy ? minutosDesdeMedianoche(horaActualBogota) : -1;

  for (let t = inicioDia; t <= finDia; t += duracionMin) {
    const slotFin = t + duracionMin;
    const horaStr = minutosAHora(t);

    // Si es hoy: descartar si la hora ya pasó
    if (esHoy && t <= minutosAhora) {
      continue;
    }

    // Comprobar solapamiento con cualquier cita activa existente
    const solapado = intervalosOcupados.some((cita) => {
      return t < cita.fin && slotFin > cita.inicio;
    });

    if (!solapado) {
      slotsDisponibles.push(horaStr);
    }
  }

  return {
    horariosDisponibles: slotsDisponibles,
    ocupados: intervalosOcupados.map(i => i.horaStr)
  };
}

// -------------------------------------------------------------
// CÁLCULO REAL DE COLA Y TIEMPOS ESTIMADOS
// -------------------------------------------------------------
async function calcularDatosCola(turno) {
  const duracion = Number(turno.duracion_estimada_min || 30);
  const hoyBogota = fechaHoyColombia();
  const fechaTurno = normalizarFecha(turno.fecha);
  const esHoy = fechaTurno === hoyBogota;

  if (turno.estado === 'completado') {
    return {
      personas_antes: 0,
      tiempo_estimado_min: 0,
      puede_hacer_checkin: false,
      mensaje: 'Atención completada con éxito. Gracias por usar FILA CERO.'
    };
  }
  if (turno.estado === 'cancelado') {
    return {
      personas_antes: 0,
      tiempo_estimado_min: 0,
      puede_hacer_checkin: false,
      mensaje: 'Este turno ha sido cancelado.'
    };
  }
  if (turno.estado === 'no_presentado') {
    return {
      personas_antes: 0,
      tiempo_estimado_min: 0,
      puede_hacer_checkin: false,
      mensaje: 'Turno cancelado por inasistencia al llamado.'
    };
  }
  if (turno.estado === 'llamando') {
    return {
      personas_antes: 0,
      tiempo_estimado_min: 0,
      puede_hacer_checkin: false,
      mensaje: `¡Es tu turno! Por favor dirígete a ${turno.modulo || 'la ventanilla de atención'}.`
    };
  }
  if (turno.estado === 'en_atencion') {
    return {
      personas_antes: 0,
      tiempo_estimado_min: 0,
      puede_hacer_checkin: false,
      mensaje: `Estás siendo atendido en ${turno.modulo || 'la ventanilla de atención'}.`
    };
  }

  // Si está en 'en_espera' (Fila activa real)
  if (turno.estado === 'en_espera') {
    // Contar personas por delante en el mismo servicio hoy:
    // 1. Quienes están en atención o llamando
    // 2. Quienes están en espera con check-in / creación previa
    const [[cuenta]] = await db.execute(`
      SELECT COUNT(*) AS total
      FROM turnos
      WHERE fecha = ?
        AND servicio_id = ?
        AND (
          estado IN ('en_atencion', 'llamando')
          OR (
            estado = 'en_espera'
            AND (
              COALESCE(checkin_en, creado_en) < COALESCE(?, creado_en)
              OR (COALESCE(checkin_en, creado_en) = COALESCE(?, creado_en) AND id < ?)
            )
          )
        )
    `, [fechaTurno, turno.servicio_id, turno.checkin_en, turno.checkin_en, turno.id]);

    const personasAntes = Number(cuenta?.total || 0);
    const tiempoEstimado = personasAntes === 0 ? 5 : personasAntes * duracion;
    const mensaje = personasAntes === 0
      ? 'Eres el siguiente en la fila. Permanece atento al llamado a tu módulo.'
      : `Tienes ${personasAntes} persona(s) por delante. Tiempo estimado: ~${tiempoEstimado} min.`;

    return {
      personas_antes: personasAntes,
      tiempo_estimado_min: tiempoEstimado,
      puede_hacer_checkin: false,
      mensaje
    };
  }

  // Si está en 'confirmado' o 'pendiente' (Cita programada que aún no hace check-in)
  if (turno.estado === 'confirmado' || turno.estado === 'pendiente') {
    if (!esHoy) {
      return {
        personas_antes: 0,
        tiempo_estimado_min: duracion,
        puede_hacer_checkin: false,
        mensaje: `Tu cita está programada para el ${fechaTurno} a las ${formatearHora(turno.hora)}. El ingreso a la fila se habilitará el día de tu cita.`
      };
    }

    // Es hoy: calcular ventana de 30 minutos antes de la cita
    const horaActual = horaActualColombia();
    const minutosAhora = minutosDesdeMedianoche(horaActual);
    const minutosInicio = minutosDesdeMedianoche(turno.hora);
    const minutosFin = minutosInicio + duracion;

    if (minutosAhora < minutosInicio - 30) {
      const horaHabilitacion = minutosAHora(Math.max(0, minutosInicio - 30));
      return {
        personas_antes: 0,
        tiempo_estimado_min: duracion,
        puede_hacer_checkin: false,
        mensaje: `Tu cita es hoy a las ${formatearHora(turno.hora)}. Podrás ingresar a la fila a partir de las ${horaHabilitacion}.`
      };
    }

    if (minutosAhora > minutosFin) {
      return {
        personas_antes: 0,
        tiempo_estimado_min: 0,
        puede_hacer_checkin: false,
        mensaje: 'La hora de tu cita ha finalizado.'
      };
    }

    // En ventana permitida de check-in
    return {
      personas_antes: 0,
      tiempo_estimado_min: duracion,
      puede_hacer_checkin: true,
      mensaje: 'Ya puedes ingresar a la fila. Cuando estés en el banco, presiona "Ingresar a la fila".'
    };
  }

  return {
    personas_antes: 0,
    tiempo_estimado_min: duracion,
    puede_hacer_checkin: false,
    mensaje: `Estado: ${turno.estado}`
  };
}

// -------------------------------------------------------------
// ENDPOINTS DE LA API
// -------------------------------------------------------------

app.get('/api/salud', async (_req, res) => {
  await db.query('SELECT 1');
  res.json({
    ok: true,
    mensaje: 'API disponible',
    hora_colombia: `${fechaHoyColombia()} ${horaActualColombia()}`
  });
});

// ── Autenticación ─────────────────────────────────────────────
app.post('/api/auth/registro', async (req, res) => {
  const nombre = req.body.nombre?.trim();
  const correo = req.body.correo?.trim().toLowerCase();
  const contraseña = req.body.contraseña;
  if (!nombre || !correo || !contraseña || contraseña.length < 6) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña de mínimo 6 caracteres son obligatorios.' });
  }
  try {
    const hash = await bcrypt.hash(contraseña, 10);
    const [result] = await db.execute('INSERT INTO usuarios (nombre, correo, contraseña) VALUES (?, ?, ?)', [nombre, correo, hash]);
    const usuario = { id: result.insertId, nombre, rol: 'usuario' };
    res.status(201).json({ token: crearToken(usuario), usuario });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const correo = req.body.correo?.trim().toLowerCase();
  const contraseña = req.body.contraseña || '';
  const [[usuario]] = await db.execute('SELECT id, nombre, correo, contraseña, rol FROM usuarios WHERE correo = ?', [correo]);
  if (!usuario || !(await bcrypt.compare(contraseña, usuario.contraseña))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  const datos = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  res.json({ token: crearToken(datos), usuario: datos });
});

app.get('/api/auth/perfil', autenticar, async (req, res) => {
  const [[usuario]] = await db.execute('SELECT id, nombre, correo, rol FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(usuario);
});

// ── Servicios ────────────────────────────────────────────────
app.get('/api/servicios', async (_req, res) => {
  const [servicios] = await db.query(`
    SELECT id, nombre, modalidad, duracion_estimada_min, requiere_tema, descripcion
    FROM servicios
    WHERE activo = TRUE
    ORDER BY id ASC
  `);
  res.json(servicios);
});

// ── Disponibilidad Dinámica con Detección de Horarios Pasados ──
app.get('/api/turnos/disponibilidad', autenticar, async (req, res) => {
  const fecha = req.query.fecha;
  const servicioId = req.query.servicioId ? Number(req.query.servicioId) : null;
  const hoyBogota = fechaHoyColombia();

  if (!fechaValida(fecha) || fecha < hoyBogota) {
    return res.status(400).json({ error: 'Indica una fecha válida (hoy o futura).' });
  }

  if (!servicioId) {
    return res.status(400).json({ error: 'Debes indicar el ID del servicio para consultar horarios.' });
  }

  const [[servicio]] = await db.execute(`
    SELECT id, nombre, modalidad, duracion_estimada_min, requiere_tema
    FROM servicios
    WHERE id = ? AND activo = TRUE
  `, [servicioId]);

  if (!servicio) {
    return res.status(404).json({ error: 'Servicio no encontrado o inactivo.' });
  }

  // Si el servicio es únicamente de Turno Virtual Inmediato, no genera slots de cita previa
  if (servicio.modalidad === 'turno') {
    return res.json({
      fecha,
      servicioId: servicio.id,
      modalidad: 'turno',
      duracion_estimada_min: servicio.duracion_estimada_min,
      horarios_disponibles: [],
      ocupados: [],
      mensaje: 'Este servicio opera mediante turno virtual inmediato para el día de hoy.'
    });
  }

  // Consultar citas activas para esa fecha y servicio
  const [citasExistentes] = await db.execute(`
    SELECT TIME_FORMAT(t.hora, '%H:%i') AS hora, s.duracion_estimada_min
    FROM turnos t
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.fecha = ?
      AND t.servicio_id = ?
      AND t.modalidad = 'cita'
      AND t.estado NOT IN ('cancelado', 'no_presentado')
  `, [fecha, servicioId]);

  const esHoy = fecha === hoyBogota;
  const horaActualBogota = horaActualColombia();

  const { horariosDisponibles, ocupados } = calcularDisponibilidadSlots({
    duracionMin: Number(servicio.duracion_estimada_min || 30),
    citasExistentes,
    horaActualBogota,
    esHoy
  });

  res.json({
    fecha,
    servicioId: servicio.id,
    modalidad: servicio.modalidad,
    duracion_estimada_min: servicio.duracion_estimada_min,
    horarios_disponibles: horariosDisponibles,
    ocupados,
    quedan_horarios: horariosDisponibles.length > 0,
    mensaje: horariosDisponibles.length === 0
      ? (esHoy ? 'No hay horarios disponibles para hoy.' : 'No hay horarios disponibles para la fecha seleccionada.')
      : null
  });
});

// ── Turnos del Usuario ─────────────────────────────────────────
app.get('/api/turnos', autenticar, async (req, res) => {
  const [turnos] = await db.execute(`
    SELECT t.id, t.usuario_id, t.servicio_id, s.nombre AS servicio, s.duracion_estimada_min,
           t.modalidad, t.motivo, DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
           TIME_FORMAT(t.hora, '%H:%i') AS hora, t.estado, t.codigo_turno, t.modulo,
           t.checkin_en, t.llamado_en, t.atencion_inicio_en
    FROM turnos t
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.usuario_id = ?
    ORDER BY t.fecha ASC, t.hora ASC
  `, [req.usuario.id]);

  const enriquecidos = await Promise.all(
    turnos.map(async (t) => {
      const cola = await calcularDatosCola(t);
      return {
        id: t.id,
        codigo_turno: t.codigo_turno || `#T${t.id}`,
        servicio: t.servicio,
        servicio_id: t.servicio_id,
        modalidad: t.modalidad,
        motivo: t.motivo,
        fecha: normalizarFecha(t.fecha),
        hora: formatearHora(t.hora),
        estado: t.estado,
        modulo: t.modulo || null,
        personas_antes: cola.personas_antes,
        tiempo_estimado_min: cola.tiempo_estimado_min,
        duracion_estimada_min: t.duracion_estimada_min,
        mensaje: cola.mensaje,
        puede_hacer_checkin: cola.puede_hacer_checkin
      };
    })
  );

  res.json(enriquecidos);
});

// ── Solicitar Turno / Agendar Cita con Control de Concurrencia ─
app.post('/api/turnos', autenticar, async (req, res) => {
  const { servicioId, modalidad, fecha, hora, motivo } = req.body;

  if (!Number.isInteger(servicioId)) {
    return res.status(400).json({ error: 'El ID de servicio debe ser un número entero válido.' });
  }

  const [[servicio]] = await db.execute(
    'SELECT id, nombre, modalidad, duracion_estimada_min, requiere_tema FROM servicios WHERE id = ? AND activo = TRUE',
    [servicioId]
  );

  if (!servicio) {
    return res.status(400).json({ error: 'El servicio seleccionado no existe o no se encuentra activo.' });
  }

  // Determinar modalidad efectiva
  let modEfectiva = modalidad || servicio.modalidad;
  if (servicio.modalidad !== 'turno_y_cita') {
    modEfectiva = servicio.modalidad;
  }
  if (!['turno', 'cita'].includes(modEfectiva)) {
    modEfectiva = servicio.modalidad === 'turno' ? 'turno' : 'cita';
  }

  // Validar motivo si el servicio lo requiere
  if (servicio.requiere_tema && (!motivo || !motivo.trim())) {
    return res.status(400).json({ error: 'El tema o motivo de la consulta es obligatorio para este servicio.' });
  }
  const motivoLimpio = motivo ? motivo.trim().slice(0, 255) : null;

  const hoyBogota = fechaHoyColombia();
  const horaBogota = horaActualColombia();

  // ── CASO A: MODALIDAD TURNO (Virtual inmediato para hoy) ──────
  if (modEfectiva === 'turno') {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const codigo = await generarCodigoTurno(hoyBogota, servicioId, 'turno');
      const [result] = await conn.execute(
        `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo, checkin_en)
         VALUES (?, ?, 'turno', ?, ?, 'en_espera', ?, ?, NOW())`,
        [req.usuario.id, servicioId, hoyBogota, horaBogota, codigo, motivoLimpio]
      );

      await conn.commit();

      return res.status(201).json({
        id: result.insertId,
        codigo_turno: codigo,
        modalidad: 'turno',
        estado: 'en_espera',
        mensaje: `Turno ${codigo} generado con éxito. Has ingresado a la fila de espera activa.`
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── CASO B: MODALIDAD CITA (Programada con fecha y hora) ───────
  if (!fechaValida(fecha) || fecha < hoyBogota) {
    return res.status(400).json({ error: 'Debes indicar una fecha válida (hoy o futura) para la cita.' });
  }

  if (!hora || !horaValida.test(hora)) {
    return res.status(400).json({ error: 'Debes indicar una hora válida (formato HH:mm) para la cita.' });
  }

  const horaCitaLimpia = hora.slice(0, 5);

  // Validación estricta de horario pasado si la fecha es hoy
  if (fecha === hoyBogota) {
    const minutosAhora = minutosDesdeMedianoche(horaBogota);
    const minutosCita = minutosDesdeMedianoche(horaCitaLimpia);
    if (minutosCita <= minutosAhora) {
      return res.status(400).json({
        error: 'No es posible agendar una cita en un horario que ya ha pasado.'
      });
    }
  }

  const duracion = Number(servicio.duracion_estimada_min || 30);
  const inicioMin = minutosDesdeMedianoche(horaCitaLimpia);
  const finMin = inicioMin + duracion;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Bloquear la fila del servicio para serializar transacciones concurrentes
    // y evitar deadlocks de gap lock en InnoDB cuando la tabla turnos no tiene registros previos para la fecha
    await conn.execute('SELECT id FROM servicios WHERE id = ? FOR UPDATE', [servicioId]);

    // Bloqueo y verificación de solapamientos con FOR UPDATE
    const [citasExistentes] = await conn.execute(`
      SELECT t.id, TIME_FORMAT(t.hora, '%H:%i') AS hora, s.duracion_estimada_min
      FROM turnos t
      JOIN servicios s ON s.id = t.servicio_id
      WHERE t.fecha = ?
        AND t.servicio_id = ?
        AND t.modalidad = 'cita'
        AND t.estado NOT IN ('cancelado', 'no_presentado')
      FOR UPDATE
    `, [fecha, servicioId]);

    const haySolapamiento = citasExistentes.some((c) => {
      const cInicio = minutosDesdeMedianoche(c.hora);
      const cFin = cInicio + Number(c.duracion_estimada_min || duracion);
      return inicioMin < cFin && finMin > cInicio;
    });

    if (haySolapamiento) {
      await conn.rollback();
      return res.status(409).json({
        error: 'El horario seleccionado ya no se encuentra disponible. Por favor elige otro horario.'
      });
    }

    const codigo = await generarCodigoTurno(fecha, servicioId, 'cita');
    const [result] = await conn.execute(
      `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo)
       VALUES (?, ?, 'cita', ?, ?, 'confirmado', ?, ?)`,
      [req.usuario.id, servicioId, fecha, `${horaCitaLimpia}:00`, codigo, motivoLimpio]
    );

    await conn.commit();

    return res.status(201).json({
      id: result.insertId,
      codigo_turno: codigo,
      modalidad: 'cita',
      estado: 'confirmado',
      fecha,
      hora: horaCitaLimpia,
      duracion_estimada_min: duracion,
      mensaje: 'Cita agendada y confirmada con éxito.'
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT') {
      return res.status(409).json({
        error: 'El horario seleccionado ya no se encuentra disponible. Por favor elige otro horario.'
      });
    }
    throw err;
  } finally {
    conn.release();
  }
});

// ── Estado en Tiempo Real de un Turno Individual ──────────────
app.get('/api/turnos/:id/estado', autenticar, async (req, res) => {
  const [filas] = await db.execute(`
    SELECT t.id, t.usuario_id, t.servicio_id, s.nombre AS servicio, s.duracion_estimada_min,
           t.modalidad, t.motivo, DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
           TIME_FORMAT(t.hora, '%H:%i') AS hora, t.estado, t.codigo_turno, t.modulo,
           t.checkin_en, t.llamado_en, t.atencion_inicio_en
    FROM turnos t
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.id = ?
  `, [req.params.id]);

  const turno = filas[0];
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });

  // Seguridad: Solo el dueño o el admin pueden consultar
  if (req.usuario.rol !== 'admin' && Number(turno.usuario_id) !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes autorización para consultar la información de este turno.' });
  }

  const datosCola = await calcularDatosCola(turno);

  res.json({
    id: turno.id,
    codigo_turno: turno.codigo_turno || `#T${turno.id}`,
    servicio: turno.servicio,
    servicio_id: turno.servicio_id,
    modalidad: turno.modalidad,
    motivo: turno.motivo,
    fecha: normalizarFecha(turno.fecha),
    hora: formatearHora(turno.hora),
    estado: turno.estado,
    modulo: turno.modulo || null,
    personas_antes: datosCola.personas_antes,
    tiempo_estimado_min: datosCola.tiempo_estimado_min,
    duracion_estimada_min: turno.duracion_estimada_min,
    mensaje: datosCola.mensaje,
    puede_hacer_checkin: datosCola.puede_hacer_checkin
  });
});

// ── Check-in del Usuario (Ingreso a la Fila Activa) ────────────
app.patch('/api/turnos/:id/checkin', autenticar, async (req, res) => {
  const [filas] = await db.execute(`
    SELECT t.id, t.usuario_id, t.servicio_id, t.modalidad,
           DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
           TIME_FORMAT(t.hora, '%H:%i') AS hora,
           t.estado, t.codigo_turno, t.modulo,
           s.duracion_estimada_min, s.nombre AS servicio
    FROM turnos t
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.id = ?
  `, [req.params.id]);

  const turno = filas[0];
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });

  if (req.usuario.rol !== 'admin' && Number(turno.usuario_id) !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes permiso para modificar este turno.' });
  }

  const hoyBogota = fechaHoyColombia();
  const fechaTurno = normalizarFecha(turno.fecha);

  if (fechaTurno !== hoyBogota) {
    if (fechaTurno > hoyBogota) {
      return res.status(400).json({ error: `Tu cita está programada para el ${fechaTurno}. Solo puedes ingresar a la fila el día de tu cita.` });
    }
    return res.status(400).json({ error: 'La fecha de esta cita ya ha pasado. No es posible ingresar a la fila.' });
  }

  if (['en_espera', 'llamando', 'en_atencion', 'completado'].includes(turno.estado)) {
    return res.status(400).json({ error: `El turno ya se encuentra en estado: ${turno.estado}.` });
  }

  if (['cancelado', 'no_presentado'].includes(turno.estado)) {
    return res.status(400).json({ error: `El turno se encuentra en estado: ${turno.estado} y no permite ingreso a la fila.` });
  }

  // Si es cita programada, validar ventana de check-in (30 minutos antes hasta el fin de la cita)
  if (turno.modalidad === 'cita' && turno.hora) {
    const horaActual = horaActualColombia();
    const minutosAhora = minutosDesdeMedianoche(horaActual);
    const minutosInicio = minutosDesdeMedianoche(turno.hora);
    const duracion = Number(turno.duracion_estimada_min || 30);
    const minutosFin = minutosInicio + duracion;

    if (minutosAhora < minutosInicio - 30) {
      const horaHabilitacion = minutosAHora(Math.max(0, minutosInicio - 30));
      return res.status(400).json({
        error: `Aún no es momento de ingresar a la fila. El ingreso se habilita 30 minutos antes de tu cita (a partir de las ${horaHabilitacion}).`
      });
    }

    if (minutosAhora > minutosFin) {
      return res.status(400).json({
        error: `La hora de tu cita (${formatearHora(turno.hora)}) ha finalizado. No es posible realizar el ingreso a la fila.`
      });
    }
  }

  await db.execute(
    "UPDATE turnos SET estado = 'en_espera', checkin_en = NOW() WHERE id = ?",
    [turno.id]
  );

  res.json({
    ok: true,
    mensaje: 'Has ingresado a la fila de espera activa. ¡Permanece atento a tu llamado!'
  });
});

// ── Cancelar Turno / Cita ─────────────────────────────────────
app.patch('/api/turnos/:id/cancelar', autenticar, async (req, res) => {
  const [filas] = await db.execute('SELECT id, usuario_id, estado FROM turnos WHERE id = ?', [req.params.id]);
  const turno = filas[0];
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });

  if (req.usuario.rol !== 'admin' && Number(turno.usuario_id) !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes autorización para cancelar este turno.' });
  }

  if (['completado', 'cancelado', 'no_presentado'].includes(turno.estado)) {
    return res.status(400).json({ error: `No es posible cancelar un turno en estado "${turno.estado}".` });
  }

  await db.execute("UPDATE turnos SET estado = 'cancelado' WHERE id = ?", [turno.id]);
  res.json({ ok: true, mensaje: 'Turno cancelado correctamente.' });
});

// -------------------------------------------------------------
// ENDPOINTS DE ADMINISTRACIÓN (CONTROL DE COLA)
// -------------------------------------------------------------

// Cola en tiempo real del día
app.get('/api/admin/cola', autenticar, soloAdmin, async (_req, res) => {
  const hoy = fechaHoyColombia();

  const [turnosHoy] = await db.execute(`
    SELECT t.id, t.usuario_id, u.nombre AS usuario, t.servicio_id, s.nombre AS servicio, s.duracion_estimada_min,
           t.modalidad, t.motivo, DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(t.hora, '%H:%i') AS hora,
           t.estado, t.codigo_turno, t.modulo, t.checkin_en, t.llamado_en, t.atencion_inicio_en
    FROM turnos t
    JOIN usuarios u ON u.id = t.usuario_id
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.fecha = ?
    ORDER BY
      CASE
        WHEN t.estado = 'llamando' THEN 1
        WHEN t.estado = 'en_atencion' THEN 2
        WHEN t.estado = 'en_espera' THEN 3
        WHEN t.estado IN ('confirmado', 'pendiente') THEN 4
        ELSE 5
      END,
      COALESCE(t.checkin_en, t.creado_en) ASC,
      t.id ASC
  `, [hoy]);

  const en_atencion = turnosHoy.filter((t) => t.estado === 'en_atencion');
  const llamando = turnosHoy.filter((t) => t.estado === 'llamando');
  const en_espera = turnosHoy.filter((t) => t.estado === 'en_espera');
  const confirmados = turnosHoy.filter((t) => t.estado === 'confirmado' || t.estado === 'pendiente');
  const completados = turnosHoy.filter((t) => t.estado === 'completado');

  res.json({
    fecha: hoy,
    resumen: {
      en_atencion: en_atencion.length,
      llamando: llamando.length,
      en_espera: en_espera.length,
      confirmados: confirmados.length,
      completados: completados.length
    },
    en_atencion,
    llamando,
    en_espera,
    confirmados,
    turnos: turnosHoy
  });
});

// Llamar siguiente turno en cola con control de concurrencia mediante transacción y bloqueo FOR UPDATE
app.post('/api/admin/cola/llamar-siguiente', autenticar, soloAdmin, async (req, res) => {
  const hoy = fechaHoyColombia();
  const modulo = req.body.modulo?.trim() || 'Módulo 1';
  const servicioId = req.body.servicioId ? Number(req.body.servicioId) : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let query = "SELECT id, codigo_turno, usuario_id, servicio_id, hora, modalidad FROM turnos WHERE fecha = ? AND estado = 'en_espera'";
    const params = [hoy];

    if (servicioId) {
      query += " AND servicio_id = ?";
      params.push(servicioId);
    }

    query += " ORDER BY COALESCE(checkin_en, creado_en) ASC, id ASC LIMIT 1 FOR UPDATE";

    const [filas] = await conn.execute(query, params);
    const siguiente = filas[0];

    if (!siguiente) {
      await conn.rollback();
      return res.status(404).json({ error: 'No hay usuarios en la fila de espera activa en este momento.' });
    }

    await conn.execute(
      "UPDATE turnos SET estado = 'llamando', modulo = ?, llamado_en = NOW() WHERE id = ?",
      [modulo, siguiente.id]
    );

    await conn.commit();

    const [actualizado] = await db.execute(`
      SELECT t.id, t.codigo_turno, u.nombre AS usuario, s.nombre AS servicio,
             DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(t.hora, '%H:%i') AS hora,
             t.estado, t.modulo, t.modalidad
      FROM turnos t
      JOIN usuarios u ON u.id = t.usuario_id
      JOIN servicios s ON s.id = t.servicio_id
      WHERE t.id = ?
    `, [siguiente.id]);

    res.json({
      ok: true,
      mensaje: `Turno ${siguiente.codigo_turno} llamado al ${modulo}.`,
      turno: actualizado[0]
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// Resumen administrativo general (histórico)
app.get('/api/admin/resumen', autenticar, soloAdmin, async (_req, res) => {
  const [[usuarios]] = await db.query('SELECT COUNT(*) AS total FROM usuarios');
  const [estados] = await db.query('SELECT estado, COUNT(*) AS total FROM turnos GROUP BY estado');
  const [turnos] = await db.query(`
    SELECT t.id, t.codigo_turno, u.nombre AS usuario, s.nombre AS servicio,
           t.modalidad, t.motivo, DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
           TIME_FORMAT(t.hora, '%H:%i') AS hora, t.estado, t.modulo
    FROM turnos t
    JOIN usuarios u ON u.id = t.usuario_id
    JOIN servicios s ON s.id = t.servicio_id
    ORDER BY t.fecha DESC, t.hora DESC
  `);
  res.json({ usuarios: usuarios.total, estados, turnos });
});

app.get('/api/admin/usuarios', autenticar, soloAdmin, async (_req, res) => {
  const [usuarios] = await db.query('SELECT id, nombre, correo, rol, creado_en FROM usuarios ORDER BY creado_en DESC');
  res.json(usuarios);
});

// Actualizar estado de turno como Administrador con validación estricta de transiciones
app.patch('/api/admin/turnos/:id', autenticar, soloAdmin, async (req, res) => {
  const { estado, modulo } = req.body;
  if (!ESTADOS_VALIDOS.has(estado)) {
    return res.status(400).json({ error: `El estado "${estado}" no es válido.` });
  }

  const [filas] = await db.execute('SELECT * FROM turnos WHERE id = ?', [req.params.id]);
  const turno = filas[0];
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });

  const transicionesPermitidas = TRANSICIONES_VALIDAS[turno.estado] || new Set();
  if (!transicionesPermitidas.has(estado) && estado !== turno.estado) {
    return res.status(400).json({
      error: `Transición no permitida: no se puede pasar de "${turno.estado}" a "${estado}".`
    });
  }

  const nuevoModulo = modulo !== undefined ? modulo : turno.modulo;

  let queryUpdate = 'UPDATE turnos SET estado = ?, modulo = ?';
  const params = [estado, nuevoModulo];

  if (estado === 'en_atencion' && !turno.atencion_inicio_en) {
    queryUpdate += ', atencion_inicio_en = NOW()';
  }
  if (estado === 'completado' && !turno.atencion_fin_en) {
    queryUpdate += ', atencion_fin_en = NOW()';
  }
  if (estado === 'llamando' && !turno.llamado_en) {
    queryUpdate += ', llamado_en = NOW()';
  }

  queryUpdate += ' WHERE id = ?';
  params.push(req.params.id);

  await db.execute(queryUpdate, params);

  res.json({ mensaje: `Turno actualizado a "${estado}".`, estado, modulo: nuevoModulo });
});

app.delete('/api/admin/usuarios/:id', autenticar, soloAdmin, async (req, res) => {
  if (Number(req.params.id) === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  }
  const [result] = await db.execute('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ mensaje: 'Usuario eliminado.' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(puerto, () => console.log(`API disponible en http://localhost:${puerto}`));
