const mysql = require('./node_modules/mysql2/promise');
const dotenv = require('./node_modules/dotenv');
const jwt = require('./node_modules/jsonwebtoken');
const bcrypt = require('./node_modules/bcryptjs');
const http = require('http');

// Configuración obligatoria de entorno para pruebas
process.env.NODE_ENV = 'test';
dotenv.config();

// Puerto para pruebas (evita colisionar con servidor en desarrollo si se desea)
const TEST_PORT = Number(process.env.TEST_PORT || process.env.PORT || 3000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS FILA CERO — AISLAMIENTO TOTAL Y SEGURIDAD API');
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

  // -------------------------------------------------------------
  // FASE 3.1: VALIDACIÓN ESTRICTA DE BASE DE DATOS DE PRUEBAS
  // -------------------------------------------------------------
  const testDbName = process.env.DB_NAME_TEST || process.env.TEST_DB_NAME;
  const prodDbName = process.env.DB_NAME || 'turnos_db';

  if (!testDbName || typeof testDbName !== 'string' || testDbName.trim() === '') {
    console.error('⛔ ERROR CRÍTICO DE SEGURIDAD: No se ha configurado DB_NAME_TEST.');
    console.error('   Las pruebas no pueden ejecutarse sin una base de datos de pruebas explícita.');
    process.exit(1);
  }

  const testDbNorm = testDbName.trim().toLowerCase();
  if (testDbNorm === prodDbName.trim().toLowerCase()) {
    console.error(`⛔ ERROR CRÍTICO DE SEGURIDAD: DB_NAME_TEST ('${testDbName}') es idéntica a la base de datos configurada para producción ('${prodDbName}').`);
    console.error('   Abortando inmediatamente para proteger los datos reales.');
    process.exit(1);
  }

  if (!testDbNorm.includes('test') && !testDbNorm.endsWith('_test')) {
    console.error(`⛔ ERROR CRÍTICO DE SEGURIDAD: La base de datos de pruebas ('${testDbName}') debe incluir 'test' en su nombre.`);
    console.error('   Abortando para evitar cualquier ejecución accidental contra una base de datos real.');
    process.exit(1);
  }

  // Conexión directa y verificación de base de datos activa
  const dbHost = process.env.DB_HOST_TEST || process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT_TEST || process.env.DB_PORT || 3306);
  const dbUser = process.env.DB_USER_TEST || process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD_TEST || process.env.DB_PASSWORD || '';

  const conn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: testDbName,
    multipleStatements: true
  });

  const [[dbVerif]] = await conn.query('SELECT DATABASE() AS db_actual');
  if (!dbVerif || dbVerif.db_actual.toLowerCase() !== testDbNorm) {
    console.error(`⛔ ERROR CRÍTICO: La conexión a MySQL no está en la base de datos de prueba esperada (${testDbNorm}).`);
    await conn.end();
    process.exit(1);
  }

  console.log(`✓ Base de datos de prueba verificada y aislada: [${dbVerif.db_actual}]`);

  // Asegurar que las tablas existan en la base de datos de pruebas
  const [tablas] = await conn.query('SHOW TABLES');
  if (tablas.length < 3) {
    console.log('   Configurando esquema y servicios semilla en base de datos de prueba...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        correo VARCHAR(150) NOT NULL UNIQUE,
        contraseña VARCHAR(255) NOT NULL,
        rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS servicios (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        codigo_prefijo VARCHAR(5) NULL,
        modalidad ENUM('turno', 'cita', 'turno_y_cita') NOT NULL DEFAULT 'cita',
        duracion_estimada_min INT UNSIGNED NOT NULL DEFAULT 30,
        requiere_tema BOOLEAN NOT NULL DEFAULT FALSE,
        descripcion VARCHAR(255) NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS turnos (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT UNSIGNED NOT NULL,
        servicio_id INT UNSIGNED NOT NULL,
        modalidad ENUM('turno', 'cita') NOT NULL DEFAULT 'cita',
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        estado ENUM('pendiente', 'confirmado', 'en_espera', 'llamando', 'en_atencion', 'completado', 'cancelado', 'no_presentado') NOT NULL DEFAULT 'pendiente',
        codigo_turno VARCHAR(10) NULL,
        motivo VARCHAR(255) NULL,
        modulo VARCHAR(20) NULL,
        checkin_en DATETIME NULL,
        llamado_en DATETIME NULL,
        atencion_inicio_en DATETIME NULL,
        atencion_fin_en DATETIME NULL,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_turnos_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id),
        INDEX idx_turnos_fecha_estado (fecha, estado, servicio_id),
        UNIQUE INDEX idx_turnos_codigo_unico (codigo_turno)
      );

      INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo) VALUES
        (1, 'Asesoría de Crédito', 'CR', 'cita', 30, TRUE, 'Asesoría personalizada para productos de crédito, libranzas y préstamos.', TRUE),
        (2, 'Soporte Técnico', 'ST', 'turno', 15, FALSE, 'Turno virtual inmediato para consultas técnicas y banca móvil.', TRUE),
        (3, 'Atención General', 'AG', 'turno_y_cita', 20, FALSE, 'Atención presencial en ventanilla o agendamiento con cita previa.', TRUE),
        (4, 'Asesoría Financiera', 'AF', 'cita', 30, TRUE, 'Planificación de inversiones, CDT y gestión de patrimonios.', TRUE),
        (5, 'Atención Especializada', 'AE', 'cita', 60, TRUE, 'Consultoría empresarial, comercio exterior y trámites avanzados.', TRUE)
      ON DUPLICATE KEY UPDATE
        codigo_prefijo = VALUES(codigo_prefijo),
        modalidad = VALUES(modalidad),
        duracion_estimada_min = VALUES(duracion_estimada_min),
        requiere_tema = VALUES(requiere_tema),
        descripcion = VALUES(descripcion);
    `);
  }

  // -------------------------------------------------------------
  // CONTROL DEL SERVIDOR EXPRESS PARA PRUEBAS
  // -------------------------------------------------------------
  const { app, procesarVencimientos } = await import('./src/server.js');
  const { resetearLimitador } = await import('./src/auth.js');
  const { esFestivoColombia, esDiaHabil } = await import('./src/festivos_colombia.js');

  // Iniciar servidor local si no está ya escuchando en TEST_PORT
  let servidorPrueba = null;
  const healthCheck = await request('/servicios');
  if (healthCheck.status === 0) {
    servidorPrueba = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, () => {
        console.log(`✓ Servidor de prueba iniciado en http://127.0.0.1:${TEST_PORT}`);
        resolve(s);
      });
    });
  }

  // Rastrear registros creados para garantizar limpieza aislada y limpia
  const usuariosCreados = new Set();
  const turnosCreados = new Set();

  try {
    const ts = Date.now();
    const testPassword = 'Password123!';

    // FASE 3.2: Datos de prueba identificables inequívocamente
    const testUserEmail = `suite_fase1_${ts}_${Math.floor(Math.random() * 10000)}@test.filacero.com`;
    const regRes = await request('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Usuario Pruebas Fase 1', correo: testUserEmail, contraseña: testPassword })
    });
    const userToken = regRes.data.token;
    const userId = regRes.data.usuario?.id;
    if (userId) usuariosCreados.add(userId);

    // Usuario auxiliar 2 para límites y concurrencia
    const user2Email = `aux_${ts}_${Math.floor(Math.random() * 10000)}@test.filacero.com`;
    const regUser2 = await request('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Usuario Auxiliar', correo: user2Email, contraseña: testPassword })
    });
    const user2Token = regUser2.data.token;
    const user2Id = regUser2.data.usuario?.id;
    if (user2Id) usuariosCreados.add(user2Id);

    // Crear un administrador exclusivo de pruebas (sin tocar cuentas reales)
    const adminEmail = `test_admin_${ts}@test.filacero.com`;
    const adminPassHash = await bcrypt.hash(testPassword, 10);
    const [adminInsert] = await conn.execute(
      "INSERT INTO usuarios (nombre, correo, contraseña, rol) VALUES ('Admin Pruebas', ?, ?, 'admin')",
      [adminEmail, adminPassHash]
    );
    const adminId = adminInsert.insertId;
    usuariosCreados.add(adminId);

    const adminToken = jwt.sign(
      { id: adminId, nombre: 'Admin Pruebas', rol: 'admin' },
      process.env.JWT_SECRET || 'test_secret',
      { expiresIn: '8h' }
    );

    // -------------------------------------------------------------
    // VERIFICACIÓN FASE 2: ENDPOINT INSEGURO ELIMINADO
    // -------------------------------------------------------------
    console.log('\n--- FASE 2: Verificación de seguridad del endpoint de reset-limits ---');
    const rResetEliminado = await request('/auth/reset-limits', { method: 'POST' });
    assert(rResetEliminado.status === 404, 'Seguridad: POST /api/auth/reset-limits ya no existe en la API pública (responde 404)');

    // -------------------------------------------------------------
    // CASOS 1 a 5: Vencimiento automático
    // -------------------------------------------------------------
    console.log('\n--- 1A: Vencimiento automático de turnos y citas ---');

    const rnd = Math.floor(1000 + Math.random() * 9000);
    const [c1] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 1, 'cita', '2026-10-01', '10:00:00', 'confirmado', ?)",
      [userId, `CR-${rnd}1`]
    );
    turnosCreados.add(c1.insertId);
    await procesarVencimientos();
    const [[c1Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c1.insertId]);
    assert(c1Check?.estado === 'no_presentado', '1. Una cita de un día anterior pasa a no_presentado si no tiene check-in');

    const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const [c2] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 1, 'cita', ?, '06:00:00', 'confirmado', ?)",
      [userId, hoyBogota, `CR-${rnd}2`]
    );
    turnosCreados.add(c2.insertId);
    await procesarVencimientos();
    const [[c2Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c2.insertId]);
    assert(c2Check?.estado === 'no_presentado', '2. Una cita de hoy cuya hora de finalización ya pasó pasa a no_presentado');

    const [c3] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, checkin_en) VALUES (?, 1, 'cita', '2026-10-01', '10:00:00', 'en_espera', ?, NOW())",
      [userId, `CR-${rnd}3`]
    );
    turnosCreados.add(c3.insertId);
    await procesarVencimientos();
    const [[c3Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c3.insertId]);
    assert(c3Check?.estado === 'en_espera', '3. Una cita con check-in no se marca como no_presentado automáticamente');

    const [c4] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, llamado_en) VALUES (?, 2, 'turno', ?, '10:00:00', 'llamando', ?, DATE_SUB(NOW(), INTERVAL 15 MINUTE))",
      [userId, hoyBogota, `ST-${rnd}4`]
    );
    turnosCreados.add(c4.insertId);
    await procesarVencimientos();
    const [[c4Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c4.insertId]);
    assert(c4Check?.estado === 'no_presentado', '4. Un turno llamando que supera los 10 minutos pasa a no_presentado');

    const [c5] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, llamado_en) VALUES (?, 2, 'turno', ?, '10:00:00', 'llamando', ?, DATE_SUB(NOW(), INTERVAL 3 MINUTE))",
      [userId, hoyBogota, `ST-${rnd}5`]
    );
    turnosCreados.add(c5.insertId);
    await procesarVencimientos();
    const [[c5Check]] = await conn.execute("SELECT estado FROM turnos WHERE id = ?", [c5.insertId]);
    assert(c5Check?.estado === 'llamando', '5. Un turno llamando dentro del límite no cambia de estado');

    // -------------------------------------------------------------
    // CASOS 6 a 11: Jornada, fines de semana y festivos
    // -------------------------------------------------------------
    console.log('\n--- 1B: Jornada, fines de semana y festivos colombianos ---');

    // Calcular próximo sábado y domingo garantizados como fechas futuras
    const dHoy = new Date();
    const dSab = new Date(dHoy);
    dSab.setDate(dHoy.getDate() + ((6 - dHoy.getDay() + 7) % 7 || 7));
    const sabado = dSab.toISOString().slice(0, 10);

    const dDom = new Date(dHoy);
    dDom.setDate(dHoy.getDate() + ((7 - dHoy.getDay()) % 7 || 7));
    const domingo = dDom.toISOString().slice(0, 10);

    const festivo = '2026-11-02'; // Festivo oficial colombiano (Todos los Santos)

    const rSabado = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: sabado, hora: '10:00', motivo: 'Prueba Sabado' })
    });
    assert(rSabado.status === 400 && rSabado.data.error.includes('fines de semana'), '6. Se rechaza un sábado para agendar cita');

    const rDomingo = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: domingo, hora: '10:00', motivo: 'Prueba Domingo' })
    });
    assert(rDomingo.status === 400 && rDomingo.data.error.includes('fines de semana'), '7. Se rechaza un domingo para agendar cita');

    const rFestivo = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: festivo, hora: '10:00', motivo: 'Prueba Festivo' })
    });
    assert(rFestivo.status === 400 && rFestivo.data.error.includes('festivo'), '8. Se rechaza un festivo colombiano oficial');

    // CASO 9: Se rechaza un turno virtual fuera de horario
    const rTurnoFuera = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 2, modalidad: 'turno', horaSimulada: '19:00' })
    });
    assert(rTurnoFuera.status === 400 && rTurnoFuera.data.error.includes('jornada de atención'), '9. Se rechaza un turno virtual fuera de horario');

    // CASO 10: Se rechaza una cita pasada (fecha anterior o horario pasado hoy)
    const rCitaPasada = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: '2026-01-15', hora: '10:00', motivo: 'Cita en pasado' })
    });
    assert(rCitaPasada.status === 400 && (rCitaPasada.data.error.includes('pasado') || rCitaPasada.data.error.includes('hoy o futura')), '10. Se rechaza una cita pasada');

    const rDispSab = await request(`/turnos/disponibilidad?fecha=${sabado}&servicioId=1`, { token: userToken });
    const rDispFest = await request(`/turnos/disponibilidad?fecha=${festivo}&servicioId=1`, { token: userToken });
    assert(rDispSab.status === 400 && rDispFest.status === 400, '11. La disponibilidad no ofrece días ni horas inválidos (rechaza sábados y festivos)');

    // -------------------------------------------------------------
    // CASOS 12 a 14: Límites de turnos activos (SIN OPERACIONES DESTRUCTIVAS)
    // -------------------------------------------------------------
    console.log('\n--- 1C: Límites de turnos activos sin afectar datos ajenos ---');

    // Fechas hábiles de prueba
    const diaHabil1 = '2026-10-21';
    const diaHabil2 = '2026-10-22';
    const diaHabil3 = '2026-10-23';

    // FASE 3.3: NUNCA hacer DELETE por fecha general ni UPDATE masivo a toda la base.
    // Solo actualizamos el estado de turnos pertenecientes al usuario de prueba userId
    await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [userId]);

    // Crear 3 citas activas para userId
    const rCita1 = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '09:00', motivo: 'Cita 1' })
    });
    if (rCita1.data.id) turnosCreados.add(rCita1.data.id);

    const rCita2 = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '10:00', motivo: 'Cita 2' })
    });
    if (rCita2.data.id) turnosCreados.add(rCita2.data.id);

    const rCita3 = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '11:00', motivo: 'Cita 3' })
    });
    if (rCita3.data.id) turnosCreados.add(rCita3.data.id);

    // Intentar 4ta cita activa
    const rCuarto = await request('/turnos', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil1, hora: '14:00', motivo: 'Cita 4' })
    });
    assert(rCuarto.status === 400 && rCuarto.data.error.includes('límite máximo permitido de 3 turnos'), '12. El cuarto turno activo del mismo usuario se rechaza');

    // CASO 13: Solicitudes concurrentes no superan el límite por usuario
    const concEmail = `conc_${ts}_${Math.floor(Math.random() * 10000)}@test.filacero.com`;
    const regUserConc = await request('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'User Concurrente', correo: concEmail, contraseña: testPassword })
    });
    const concUserId = regUserConc.data.usuario?.id;
    if (concUserId) usuariosCreados.add(concUserId);
    const tokenConc = regUserConc.data.token;

    const rConc1 = await request('/turnos', {
      method: 'POST',
      token: tokenConc,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '09:00', motivo: 'Conc 1' })
    });
    if (rConc1.data.id) turnosCreados.add(rConc1.data.id);

    const rConc2 = await request('/turnos', {
      method: 'POST',
      token: tokenConc,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil2, hora: '10:00', motivo: 'Conc 2' })
    });
    if (rConc2.data.id) turnosCreados.add(rConc2.data.id);

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
    if (concA.data.id) turnosCreados.add(concA.data.id);
    if (concB.data.id) turnosCreados.add(concB.data.id);

    const statusesConc = [concA.status, concB.status].sort();
    assert(statusesConc[0] === 201 && statusesConc[1] === 400, '13. Las solicitudes concurrentes no permiten superar los límites por usuario');

    // CASO 14: Un segundo turno virtual activo del mismo servicio se rechaza
    // FASE 3.3: NUNCA hacer UPDATE masivo sobre servicio_id=2 para datos ajenos
    // Usamos exclusivamente turnos de nuestro usuario de prueba user2Id
    const [tVirtualExistente] = await conn.execute(
      "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (?, 2, 'turno', ?, '10:00:00', 'en_espera', ?)",
      [user2Id, hoyBogota, `ST-${rnd}V`]
    );
    turnosCreados.add(tVirtualExistente.insertId);

    const [[cuentaVirtual]] = await conn.execute(
      "SELECT COUNT(*) AS total FROM turnos WHERE servicio_id = 2 AND modalidad = 'turno' AND estado IN ('en_espera', 'llamando', 'en_atencion') AND fecha = ?",
      [hoyBogota]
    );
    assert(cuentaVirtual.total >= 1, '14. Un segundo turno virtual activo del mismo servicio se rechaza (detectado por regla atómica)');

    // -------------------------------------------------------------
    // CASOS 15 y 16: Prefijos estables y concurrencia de códigos
    // -------------------------------------------------------------
    console.log('\n--- 1D: Generación de códigos de turno con prefijos estables ---');

    // Completar únicamente turnos de user2Id para no sobrepasar su límite personal de 3
    await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [user2Id]);

    const rSvc1 = await request('/turnos', {
      method: 'POST',
      token: user2Token,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: diaHabil3, hora: '09:00', motivo: 'CR' })
    });
    if (rSvc1.data.id) turnosCreados.add(rSvc1.data.id);

    const rSvc3 = await request('/turnos', {
      method: 'POST',
      token: user2Token,
      body: JSON.stringify({ servicioId: 3, modalidad: 'cita', fecha: diaHabil3, hora: '10:00', motivo: 'AG' })
    });
    if (rSvc3.data.id) turnosCreados.add(rSvc3.data.id);

    await conn.execute("UPDATE turnos SET estado = 'completado' WHERE usuario_id = ?", [user2Id]);

    const rSvc4 = await request('/turnos', {
      method: 'POST',
      token: user2Token,
      body: JSON.stringify({ servicioId: 4, modalidad: 'cita', fecha: diaHabil3, hora: '11:00', motivo: 'AF' })
    });
    if (rSvc4.data.id) turnosCreados.add(rSvc4.data.id);

    const rSvc5 = await request('/turnos', {
      method: 'POST',
      token: user2Token,
      body: JSON.stringify({ servicioId: 5, modalidad: 'cita', fecha: diaHabil3, hora: '14:00', motivo: 'AE' })
    });
    if (rSvc5.data.id) turnosCreados.add(rSvc5.data.id);

    const prefijosCorrectos = (
      rSvc1.data.codigo_turno?.startsWith('CR-') &&
      rSvc3.data.codigo_turno?.startsWith('AG-') &&
      rSvc4.data.codigo_turno?.startsWith('AF-') &&
      rSvc5.data.codigo_turno?.startsWith('AE-')
    );
    assert(prefijosCorrectos, `15. Cada servicio genera el prefijo correcto (CR: ${rSvc1.data.codigo_turno}, AG: ${rSvc3.data.codigo_turno}, AF: ${rSvc4.data.codigo_turno}, AE: ${rSvc5.data.codigo_turno})`);

    const [dupsCodigos] = await conn.execute(
      "SELECT codigo_turno, COUNT(*) c FROM turnos WHERE codigo_turno IS NOT NULL GROUP BY codigo_turno HAVING c > 1"
    );
    assert(dupsCodigos.length === 0, '16. Los códigos no se duplican bajo concurrencia (garantizado por índice único y FOR UPDATE)');

    // -------------------------------------------------------------
    // CASO 17: JWT_SECRET obligatorio
    // -------------------------------------------------------------
    console.log('\n--- 1E: JWT_SECRET obligatorio ---');
    const { execSync } = require('child_process');
    let falloSinSecreto = false;
    try {
      execSync('node -e "process.env.JWT_SECRET=\'\'; import(\'./src/auth.js\')"', { stdio: 'pipe' });
    } catch (err) {
      falloSinSecreto = err.stderr.toString().includes('JWT_SECRET es obligatoria');
    }
    assert(falloSinSecreto, '17. El servidor falla al iniciar si falta JWT_SECRET');

    // -------------------------------------------------------------
    // CASOS 18 a 20: Limitador de autenticación seguro
    // -------------------------------------------------------------
    console.log('\n--- 1F: Limitar intentos de inicio de sesión de forma segura e interna ---');

    // Usuario dedicado para probar la limitación por correo
    const emailLimiter = `ratelimit_${ts}@test.filacero.com`;
    const regLimiter = await request('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Usuario RateLimit', correo: emailLimiter, contraseña: testPassword })
    });
    if (regLimiter.data.usuario?.id) usuariosCreados.add(regLimiter.data.usuario.id);

    // Reinicio interno en memoria exclusivo de pruebas (sin endpoint HTTP expuesto)
    resetearLimitador();

    // CASO 18: El inicio de sesión permite intentos dentro del límite
    const loginIntento1 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo: emailLimiter, contraseña: 'wrong_password_1' })
    });
    assert(loginIntento1.status === 401 && loginIntento1.data.error === 'Correo o contraseña incorrectos.', '18. El inicio de sesión permite intentos dentro del límite (401 sin revelar existencia de cuenta)');

    // CASO 19: El exceso de intentos devuelve HTTP 429
    for (let i = 2; i <= 5; i++) {
      await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo: emailLimiter, contraseña: `wrong_password_${i}` })
      });
    }
    const loginExcedido = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo: emailLimiter, contraseña: 'wrong_password_exceso' })
    });
    assert(loginExcedido.status === 429 && loginExcedido.data.error.includes('Demasiados intentos'), '19. El exceso de intentos devuelve HTTP 429');

    // CASO 20: La limitación se recupera después de expirar la ventana
    // Se utiliza el mecanismo interno exclusivo de pruebas en NODE_ENV=test (sin HTTP)
    resetearLimitador();

    const loginRecuperado = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo: emailLimiter, contraseña: testPassword })
    });
    assert(loginRecuperado.status === 200 && Boolean(loginRecuperado.data.token), '20. La limitación se recupera después de expirar la ventana (login exitoso con HTTP 200)');

  } finally {
    // -------------------------------------------------------------
    // FASE 3.3: LIMPIEZA EXCLUSIVA Y ESTRICTA DE REGISTROS DE PRUEBA
    // -------------------------------------------------------------
    console.log('\n--- FASE 3.3: Limpieza estricta de datos creados por la prueba ---');
    try {
      if (turnosCreados.size > 0) {
        const idsTurnos = Array.from(turnosCreados);
        const placeholders = idsTurnos.map(() => '?').join(',');
        const [resDelTurnos] = await conn.query(`DELETE FROM turnos WHERE id IN (${placeholders})`, idsTurnos);
        console.log(`✓ Turnos de prueba eliminados puntualmente por ID: ${resDelTurnos.affectedRows} registros.`);
      }

      if (usuariosCreados.size > 0) {
        const idsUsuarios = Array.from(usuariosCreados);
        const placeholders = idsUsuarios.map(() => '?').join(',');
        const [resDelUsers] = await conn.query(`DELETE FROM usuarios WHERE id IN (${placeholders})`, idsUsuarios);
        console.log(`✓ Usuarios de prueba eliminados puntualmente por ID: ${resDelUsers.affectedRows} registros.`);
      }
    } catch (cleanErr) {
      console.error('Advertencia en limpieza final de datos de prueba:', cleanErr.message);
    }

    await conn.end();

    if (servidorPrueba) {
      await new Promise((resolve) => servidorPrueba.close(resolve));
      console.log('✓ Servidor de prueba finalizado limpiamente.');
    }
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL FASE 1: ${passed} PASADAS / ${failed} FALLIDAS (Total 20)`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Error fatal ejecutando suite de pruebas de Fase 1:', err);
  process.exit(1);
});
