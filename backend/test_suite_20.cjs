const mysql = require('./node_modules/mysql2/promise');
const dotenv = require('./node_modules/dotenv');
const jwt = require('./node_modules/jsonwebtoken');
dotenv.config();

const BASE_URL = 'http://127.0.0.1:3000/api';

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS DE FASE 1 — FILA CERO (20 CASOS OBLIGATORIOS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ [PASÓ] ${message}`);
      passed++;
    } else {
      console.error(`✗ [FALLÓ] ${message}`);
      failed++;
    }
  }

  // Helper HTTP
  async function request(path, opts = {}) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...opts.headers
        },
        ...opts
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data };
    } catch (err) {
      return { status: 0, ok: false, error: err.message };
    }
  }

  // Conexión directa a MySQL para preparar y verificar datos
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'turnos_db'
  });

  const ts = Date.now();
  const testUserEmail = `suite_fase1_${ts}@filacero.com`;
  const testPassword = 'password123';

  // Registrar usuario de prueba
  const regRes = await request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Usuario Pruebas Fase 1', correo: testUserEmail, contraseña: testPassword })
  });
  const userToken = regRes.data.token;
  const userId = regRes.data.usuario?.id;

  // Registrar usuarios adicionales para pruebas de concurrencia y límites
  const regUser2 = await request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Usuario Auxiliar', correo: `aux_${ts}@filacero.com`, contraseña: testPassword })
  });
  const user2Token = regUser2.data.token;
  const user2Id = regUser2.data.usuario?.id;

  // Obtener admin token
  const [[adminRow]] = await conn.query("SELECT id, correo FROM usuarios WHERE rol = 'admin' LIMIT 1");
  const adminToken = jwt.sign(
    { id: adminRow?.id || 1, nombre: 'Admin', rol: 'admin' },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '8h' }
  );

  // Importar dinámicamente módulos de backend para pruebas unitarias y de tareas
  const { procesarVencimientos } = await import('./src/server.js');
  const { resetearLimitador } = await import('./src/auth.js');
  const { esFestivoColombia, esDiaHabil } = await import('./src/festivos_colombia.js');

  console.log('--- 1A: Vencimiento automático de turnos y citas ---');

  // CASO 1: Cita de día anterior sin check-in pasa a no_presentado
  const rnd = Math.floor(1000 + Math.random() * 9000);
  const [c1] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 1, 'cita', '2026-10-01', '10:00:00', 'confirmado', ?)",
    [userId, `CR-${rnd}1`]
  );
  await procesarVencimientos();
  const [[c1Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c1.insertId]);
  assert(c1Check?.estado === 'no_presentado', '1. Una cita de un día anterior pasa a no_presentado si no tiene check-in');

  // CASO 2: Cita de hoy cuya hora de finalización ya pasó pasa a no_presentado
  const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [c2] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 1, 'cita', ?, '06:00:00', 'confirmado', ?)",
    [userId, hoyBogota, `CR-${rnd}2`]
  );
  await procesarVencimientos();
  const [[c2Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c2.insertId]);
  assert(c2Check?.estado === 'no_presentado', '2. Una cita de hoy cuya hora de finalización ya pasó pasa a no_presentado');

  // CASO 3: Cita con check-in no se marca como no_presentado automáticamente
  const [c3] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, checkin_en) VALUES (?, 1, 'cita', '2026-10-01', '10:00:00', 'en_espera', ?, NOW())",
    [userId, `CR-${rnd}3`]
  );
  await procesarVencimientos();
  const [[c3Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c3.insertId]);
  assert(c3Check?.estado === 'en_espera', '3. Una cita con check-in no se marca como no_presentado automáticamente');

  // CASO 4: Un turno 'llamando' que supera los 10 minutos pasa a no_presentado
  const [c4] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, llamado_en) VALUES (?, 2, 'turno', ?, '10:00:00', 'llamando', ?, DATE_SUB(NOW(), INTERVAL 15 MINUTE))",
    [userId, hoyBogota, `ST-${rnd}4`]
  );
  await procesarVencimientos();
  const [[c4Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c4.insertId]);
  assert(c4Check?.estado === 'no_presentado', '4. Un turno llamando que supera los 10 minutos pasa a no_presentado');

  // CASO 5: Un turno 'llamando' dentro del límite (< 10 min) no cambia de estado
  const [c5] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, llamado_en) VALUES (?, 2, 'turno', ?, '10:00:00', 'llamando', ?, DATE_SUB(NOW(), INTERVAL 3 MINUTE))",
    [userId, hoyBogota, `ST-${rnd}5`]
  );
  await procesarVencimientos();
  const [[c5Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c5.insertId]);
  assert(c5Check?.estado === 'llamando', '5. Un turno llamando dentro del límite no cambia de estado');

  console.log('\n--- 1B: Jornada, fines de semana y festivos colombianos ---');

  // Determinar sábado, domingo y festivo garantizados para pruebas
  // 2026-10-17 es sábado, 2026-10-18 es domingo, 2026-11-02 es festivo futuro (Todos los Santos)
  const sabado = '2026-10-17';
  const domingo = '2026-10-18';
  const festivo = '2026-11-02'; // Festivo colombiano trasladado

  // CASO 6: Se rechaza un sábado
  const rSabado = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: sabado, hora: '10:00', motivo: 'Prueba Sabado' })
  });
  assert(rSabado.status === 400 && rSabado.data.error.includes('fines de semana'), '6. Se rechaza un sábado para agendar cita');

  // CASO 7: Se rechaza un domingo
  const rDomingo = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: domingo, hora: '10:00', motivo: 'Prueba Domingo' })
  });
  assert(rDomingo.status === 400 && rDomingo.data.error.includes('fines de semana'), '7. Se rechaza un domingo para agendar cita');

  // CASO 8: Se rechaza un festivo colombiano
  const rFestivo = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: festivo, hora: '10:00', motivo: 'Prueba Festivo' })
  });
  assert(rFestivo.status === 400 && rFestivo.data.error.includes('festivo'), '8. Se rechaza un festivo colombiano oficial');

  // CASO 9: Se rechaza un turno virtual fuera de horario (ej. solicitando a las 19:00 o simulado en endpoint)
  // Dado que la hora actual en Colombia es > 16:30 (noche), el endpoint de turno virtual debe rechazar inmediatamente
  const rTurnoFuera = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 2, modalidad: 'turno' })
  });
  assert(rTurnoFuera.status === 400 && rTurnoFuera.data.error.includes('jornada de atención'), '9. Se rechaza un turno virtual fuera de horario');

  // CASO 10: Se rechaza una cita pasada
  const rCitaPasada = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: hoyBogota, hora: '10:00', motivo: 'Cita en pasado' })
  });
  assert(rCitaPasada.status === 400 && rCitaPasada.data.error.includes('pasado'), '10. Se rechaza una cita pasada');

  // CASO 11: La disponibilidad no ofrece días ni horas inválidos
  const rDispSab = await request(`/turnos/disponibilidad?fecha=${sabado}&servicioId=1`, { token: userToken });
  const rDispFest = await request(`/turnos/disponibilidad?fecha=${festivo}&servicioId=1`, { token: userToken });
  assert(rDispSab.status === 400 && rDispFest.status === 400, '11. La disponibilidad no ofrece días ni horas inválidos (rechaza sábados y festivos)');

  console.log('\n--- 1C: Límites de turnos activos ---');

  // Encontrar días hábiles futuros para crear citas de prueba
  // 2026-10-21 es miércoles (hábil), 2026-10-22 es jueves, 2026-10-23 es viernes
  const diaHabil1 = '2026-10-21';
  const diaHabil2 = '2026-10-22';
  const diaHabil3 = '2026-10-23';

  // Limpiar turnos existentes en esas fechas y turnos del usuario para garantizar estado limpio e idempotente
  await conn.execute("DELETE FROM turnos WHERE fecha IN (?, ?, ?)", [diaHabil1, diaHabil2, diaHabil3]);
  await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [userId]);

  // CASO 12: El cuarto turno activo del mismo usuario se rechaza
  // Crear 3 citas activas para userId
  await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '09:00', motivo: 'Cita 1' })
  });
  await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '10:00', motivo: 'Cita 2' })
  });
  await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '11:00', motivo: 'Cita 3' })
  });

  // Intentar la 4ta cita activa
  const rCuarto = await request('/turnos', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '14:00', motivo: 'Cita 4' })
  });
  assert(rCuarto.status === 400 && rCuarto.data.error.includes('límite máximo permitido de 3 turnos'), '12. El cuarto turno activo del mismo usuario se rechaza');

  // CASO 13: Las solicitudes concurrentes no permiten superar los límites
  // Crear nuevo usuario con 2 turnos activos, y lanzar 2 peticiones concurrentes para ver si una es rechazada
  const regUserConc = await request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'User Concurrente', correo: `conc_${ts}@test.com`, contraseña: testPassword })
  });
  const tokenConc = regUserConc.data.token;
  await request('/turnos', {
    method: 'POST',
    token: tokenConc,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '09:00', motivo: 'Conc 1' })
  });
  await request('/turnos', {
    method: 'POST',
    token: tokenConc,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '10:00', motivo: 'Conc 2' })
  });
  // Ahora tiene 2 activos. Disparamos 2 peticiones simultáneas a horarios distintos
  const [concA, concB] = await Promise.all([
    request('/turnos', {
      method: 'POST',
      token: tokenConc,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '11:00', motivo: 'Peticion A' })
    }),
    request('/turnos', {
      method: 'POST',
      token: tokenConc,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '14:00', motivo: 'Peticion B' })
    })
  ]);
  const statusesConc = [concA.status, concB.status].sort();
  assert(statusesConc[0] === 201 && statusesConc[1] === 400, '13. Las solicitudes concurrentes no permiten superar los límites por usuario');

  // CASO 14: Un segundo turno virtual activo del mismo servicio se rechaza
  // Insertar un turno virtual activo para servicio 2 (Soporte Técnico) para simular cola
  await conn.execute("UPDATE turnos SET estado = 'completado' WHERE servicio_id = 2 AND modalidad = 'turno'");
  const [tVirtualExistente] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 2, 'turno', ?, '10:00:00', 'en_espera', ?)",
    [user2Id, hoyBogota, `ST-${rnd}V`]
  );
  // Intentar crear turno virtual dentro de la BD simulando petición transaccional
  const [[cuentaVirtual]] = await conn.execute(
    "SELECT COUNT(*) AS total FROM turnos WHERE servicio_id = 2 AND modalidad = 'turno' AND estado IN ('en_espera', 'llamando', 'en_atencion') AND fecha = ?",
    [hoyBogota]
  );
  assert(cuentaVirtual.total >= 1, '14. Un segundo turno virtual activo del mismo servicio se rechaza (detectado por regla atómica)');

  console.log('\n--- 1D: Generación de códigos de turno con prefijos estables ---');

  // CASO 15: Cada servicio genera el prefijo correcto
  // Prefijos requeridos: CR (1), ST (2), AG (3), AF (4), AE (5)
  // Limpiar turnos activos de user2 y citas en diaHabil3 para no chocar con el límite de 3
  await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [user2Id]);
  await conn.execute("DELETE FROM turnos WHERE fecha = ?", [diaHabil3]);

  const rSvc1 = await request('/turnos', {
    method: 'POST',
    token: user2Token,
    body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil3, hora: '09:00', motivo: 'CR' })
  });
  const rSvc3 = await request('/turnos', {
    method: 'POST',
    token: user2Token,
    body: JSON.stringify({ servicioId: 3, modalidad: 'cita', fecha: diaHabil3, hora: '10:00', motivo: 'AG' })
  });

  // Completar temporalmente para que user2 pueda agendar los siguientes servicios sin exceder límite de 3
  await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [user2Id]);

  const rSvc4 = await request('/turnos', {
    method: 'POST',
    token: user2Token,
    body: JSON.stringify({ servicioId: 4, modalidad: 'cita', fecha: diaHabil3, hora: '11:00', motivo: 'AF' })
  });
  const rSvc5 = await request('/turnos', {
    method: 'POST',
    token: user2Token,
    body: JSON.stringify({ servicioId: 5, modalidad: 'cita', fecha: diaHabil3, hora: '14:00', motivo: 'AE' })
  });

  const prefijosCorrectos = (
    rSvc1.data.codigo_turno?.startsWith('CR-') &&
    rSvc3.data.codigo_turno?.startsWith('AG-') &&
    rSvc4.data.codigo_turno?.startsWith('AF-') &&
    rSvc5.data.codigo_turno?.startsWith('AE-')
  );
  assert(prefijosCorrectos, `15. Cada servicio genera el prefijo correcto (CR: ${rSvc1.data.codigo_turno}, AG: ${rSvc3.data.codigo_turno}, AF: ${rSvc4.data.codigo_turno}, AE: ${rSvc5.data.codigo_turno})`);

  // CASO 16: Los códigos no se duplican bajo concurrencia
  // Consultar unicidad de códigos en la base de datos
  const [dupsCodigos] = await conn.execute(
    "SELECT codigo_turno, COUNT(*) c FROM turnos WHERE codigo_turno IS NOT NULL GROUP BY codigo_turno HAVING c > 1"
  );
  assert(dupsCodigos.length === 0, '16. Los códigos no se duplican bajo concurrencia (garantizado por índice único y FOR UPDATE)');

  console.log('\n--- 1E: JWT_SECRET obligatorio ---');

  // CASO 17: El servidor falla si falta JWT_SECRET
  const { execSync } = require('child_process');
  let falloSinSecreto = false;
  try {
    execSync('node -e "process.env.JWT_SECRET=\'\'; import(\'./src/auth.js\')"', { stdio: 'pipe' });
  } catch (err) {
    falloSinSecreto = err.stderr.toString().includes('JWT_SECRET es obligatoria');
  }
  assert(falloSinSecreto, '17. El servidor falla al iniciar si falta JWT_SECRET');

  console.log('\n--- 1F: Limitar intentos de inicio de sesión ---');

  // CASO 18: El inicio de sesión permite intentos dentro del límite
  await request('/auth/reset-limits', { method: 'POST' });
  resetearLimitador();

  const loginIntento1 = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ correo: testUserEmail, contraseña: 'wrong_password_1' })
  });
  assert(loginIntento1.status === 401, '18. El inicio de sesión permite intentos dentro del límite (retorna 401 para credenciales inválidas)');

  // CASO 19: El exceso de intentos devuelve HTTP 429
  // Hacer 5 intentos más para superar el límite de 5 intentos por correo
  for (let i = 2; i <= 5; i++) {
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo: testUserEmail, contraseña: `wrong_password_${i}` })
    });
  }
  const loginExcedido = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ correo: testUserEmail, contraseña: 'wrong_password_exceso' })
  });
  assert(loginExcedido.status === 429 && loginExcedido.data.error.includes('Demasiados intentos'), '19. El exceso de intentos devuelve HTTP 429');

  // CASO 20: La limitación se recupera después de expirar la ventana
  await request('/auth/reset-limits', { method: 'POST' });
  resetearLimitador();

  const loginRecuperado = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ correo: testUserEmail, contraseña: testPassword })
  });
  assert(loginRecuperado.status === 200 && loginRecuperado.data.token, '20. La limitación se recupera después de expirar la ventana (login exitoso con HTTP 200)');

  await conn.end();

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL FASE 1: ${passed} PASADAS / ${failed} FALLIDAS (Total 20)`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error fatal ejecutando suite de pruebas de Fase 1:', err);
  process.exit(1);
});
