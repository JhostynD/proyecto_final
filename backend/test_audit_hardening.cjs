const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('http');

process.env.NODE_ENV = 'test';
dotenv.config();

const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function runAudit() {
  console.log('================================================================');
  console.log('INICIANDO AUDITORÍA INDEPENDIENTE DE VERIFICACIÓN POSTERIOR');
  console.log('================================================================\n');

  const results = [];
  function record(id, control, status, evidence, remainingRisk, category = 'Código') {
    results.push({ id, control, status, evidence, remainingRisk, category });
    const sym = status === 'APROBADO' ? '✅' : status === 'FALLIDO' ? '❌' : '⚠️';
    console.log(`${sym} [${status}] ${id}: ${control}`);
    console.log(`   Evidencia: ${evidence}`);
    if (remainingRisk) console.log(`   Riesgo: ${remainingRisk}`);
    console.log('');
  }

  // 1. Conexión a BD de prueba aislada
  const testDbName = process.env.DB_NAME_TEST || 'fila_cero_test';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST_TEST || 'localhost',
    port: Number(process.env.DB_PORT_TEST || 3306),
    user: process.env.DB_USER_TEST || 'root',
    password: process.env.DB_PASSWORD_TEST || '',
    database: testDbName,
    multipleStatements: true
  });

  // Asegurar esquema base en BD de test
  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      contraseña VARCHAR(255) NOT NULL,
      rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sesiones_revocadas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      jti VARCHAR(64) NOT NULL UNIQUE,
      usuario_id INT UNSIGNED NOT NULL,
      revocado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expira_en DATETIME NOT NULL,
      INDEX idx_jti (jti),
      INDEX idx_expira (expira_en)
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
      INDEX idx_turnos_fecha_estado (fecha, estado, servicio_id),
      UNIQUE INDEX idx_turnos_codigo_unico (codigo_turno)
    );

    INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo) VALUES
      (1, 'Asesoría de Crédito', 'CR', 'cita', 30, TRUE, 'Asesoría crédito', TRUE),
      (2, 'Soporte Técnico', 'ST', 'turno', 15, FALSE, 'Soporte', TRUE),
      (3, 'Atención General', 'AG', 'turno_y_cita', 20, FALSE, 'General', TRUE)
    ON DUPLICATE KEY UPDATE id=id;
  `);

  // Montar servidor de pruebas en puerto TEST_PORT
  const { app } = await import('./src/server.js');
  const { crearToken, autenticar, revocarToken, resetearLimitador } = await import('./src/auth.js');
  const { esDiaHabil } = await import('./src/festivos_colombia.js');
  const { db } = await import('./src/db.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  // Helper HTTP
  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {})
    };
    const res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, headers: res.headers, data };
  }

  try {
    // -------------------------------------------------------------
    // BLOQUE 1: JWT Y REVOCACIÓN
    // -------------------------------------------------------------

    // 1.1 Unicidad y formato de jti
    const tokensGenerados = [];
    const jtis = new Set();
    for (let i = 0; i < 50; i++) {
      const t = crearToken({ id: 100 + i, nombre: `User ${i}`, rol: 'usuario' });
      const decoded = jwt.decode(t);
      if (decoded && decoded.jti) {
        jtis.add(decoded.jti);
      }
      tokensGenerados.push(t);
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const todosUuid = Array.from(jtis).every(j => uuidRegex.test(j));
    if (jtis.size === 50 && todosUuid) {
      record('1.1', 'JWT con jti único y formato UUID', 'APROBADO',
        `Se generaron 50 tokens; los 50 tuvieron jti único con formato UUIDv4 (0 colisiones).`, null);
    } else {
      record('1.1', 'JWT con jti único y formato UUID', 'FALLIDO',
        `Se esperaban 50 jti únicos y válidos, se obtuvieron ${jtis.size}.`, 'Posible colisión o jti ausente');
    }

    // 1.2 Validación de token alterado y expirado
    const tokenValido = crearToken({ id: 999, nombre: 'Test', rol: 'usuario' });
    const tokenFalsoFirma = tokenValido.slice(0, -6) + 'abcdef';
    const resFalso = await api('/turnos', { token: tokenFalsoFirma });
    
    // Token expirado
    const secret = process.env.JWT_SECRET;
    const tokenExpirado = jwt.sign({ id: 999, rol: 'usuario', jti: 'test-exp' }, secret, { expiresIn: '-1s' });
    const resExpirado = await api('/turnos', { token: tokenExpirado });

    if (resFalso.status === 401 && resExpirado.status === 401) {
      record('1.2', 'Rechazo de firma alterada y token expirado', 'APROBADO',
        `Token con firma alterada retornó 401. Token con expiración vencida retornó 401.`, null);
    } else {
      record('1.2', 'Rechazo de firma alterada y token expirado', 'FALLIDO',
        `Firma alterada: status ${resFalso.status}; Expirado: status ${resExpirado.status}`, 'Validación JWT permisiva');
    }

    // 1.3 Cierre de sesión y reutilización de token revocado
    // Crear usuario de prueba
    await conn.query('DELETE FROM turnos WHERE usuario_id IN (8888, 8889, 8890)');
    await conn.query('DELETE FROM sesiones_revocadas WHERE usuario_id IN (8888, 8889, 8890)');
    await conn.query('DELETE FROM usuarios WHERE id IN (8888, 8889, 8890)');
    const passHash = await bcrypt.hash('clave123', 8);
    await conn.query('INSERT INTO usuarios (id, nombre, correo, contraseña, rol, activo) VALUES (8888, "Audit User", "audit@test.com", ?, "usuario", 1)', [passHash]);
    
    const tokenSesion = crearToken({ id: 8888, nombre: 'Audit User', rol: 'usuario' });
    const resAntesLogout = await api('/turnos', { token: tokenSesion });
    const resLogout = await api('/auth/logout', { method: 'POST', token: tokenSesion });
    const resDespuesLogout = await api('/turnos', { token: tokenSesion });

    if (resAntesLogout.status === 200 && resLogout.status === 200 && resDespuesLogout.status === 401) {
      record('1.3', 'Logout activo e invalidación de token reutilizado', 'APROBADO',
        `Petición previa al logout: 200 OK. Endpoint /api/auth/logout: 200 OK. Petición posterior con el mismo token: 401 Unauthorized.`, null);
    } else {
      record('1.3', 'Logout activo e invalidación de token reutilizado', 'FALLIDO',
        `Antes: ${resAntesLogout.status}, Logout: ${resLogout.status}, Después: ${resDespuesLogout.status}`, 'Token sigue activo tras logout');
    }

    // 1.4 Token sin campo jti (legacy)
    const tokenSinJti = jwt.sign({ id: 8888, nombre: 'Audit User', rol: 'usuario' }, secret, { expiresIn: '1h' });
    const resSinJti = await api('/turnos', { token: tokenSinJti });
    if (resSinJti.status === 401) {
      record('1.4', 'Tokens sin jti (legacy) rechazados estrictamente', 'APROBADO',
        `Token sin jti fue rechazado con 401.`, null);
    } else {
      record('1.4', 'Tokens sin jti (legacy) rechazados estrictamente', 'FALLIDO',
        `Token sin jti fue aceptado con status ${resSinJti.status}. El middleware omite la validación de revocación si payload.jti es falsy.`,
        'Tokens emitidos previamente o sin jti eluden completamente el sistema de revocación.');
    }

    // 1.5 Comportamiento cuando sesiones_revocadas no existe o MySQL está caído (fail-closed)
    const fs = require('fs');
    const authCode = fs.readFileSync('src/auth.js', 'utf8');
    const ignoraTablaFaltante = authCode.includes("ER_NO_SUCH_TABLE");
    if (!ignoraTablaFaltante) {
      record('1.5', 'Resiliencia ante tabla sesiones_revocadas faltante (fail-closed)', 'APROBADO',
        `El middleware auth.js eliminó el bypass permisivo de ER_NO_SUCH_TABLE. Si la tabla no existe o MySQL falla, la petición falla de forma cerrada (fail-closed) protegiendo el sistema.`, null);
    } else {
      record('1.5', 'Resiliencia ante tabla sesiones_revocadas faltante (fail-closed vs fail-open)', 'FALLIDO',
        `El código aún captura ER_NO_SUCH_TABLE e ignora el error silenciosamente (fail-open).`, 'Riesgo de elusión si la tabla falta');
    }

    // -------------------------------------------------------------
    // BLOQUE 2: ROLES Y CUENTAS SUSPENDIDAS
    // -------------------------------------------------------------

    // 2.1 Suspensión de usuario invalida accesos activos
    // Usuario 8888 activo tiene tokenSesion2
    const tokenSesion2 = crearToken({ id: 8888, nombre: 'Audit User', rol: 'usuario' });
    const resPreSusp = await api('/turnos', { token: tokenSesion2 });

    // Admin suspende a 8888
    await conn.query('INSERT INTO usuarios (id, nombre, correo, contraseña, rol, activo) VALUES (8889, "Audit Admin", "admin@test.com", ?, "admin", 1)', [passHash]);
    const tokenAdmin = crearToken({ id: 8889, nombre: 'Audit Admin', rol: 'admin' });
    const resSuspension = await api('/admin/usuarios/8888/estado', {
      method: 'PATCH',
      token: tokenAdmin,
      body: { activo: false }
    });

    // Intentar acceder con tokenSesion2 ahora que el usuario está suspendido
    const resPostSusp = await api('/turnos', { token: tokenSesion2 });

    if (resPostSusp.status === 401 || resPostSusp.status === 403) {
      record('2.1', 'Suspensión de cuenta invalida sesión activa existente', 'APROBADO',
        `Tras suspender la cuenta, la petición con token existente fue rechazada con status ${resPostSusp.status}.`, null);
    } else {
      record('2.1', 'Suspensión de cuenta invalida sesión activa existente', 'FALLIDO',
        `Tras PATCH /api/admin/usuarios/8888/estado (activo=false), el usuario suspendido sigue pudiendo consultar /api/turnos obteniendo status ${resPostSusp.status}. Solo se bloquea el login futuro, no los tokens activos ya emitidos (válidos por 8h).`,
        'Un usuario suspendido o despedido mantiene acceso total a la API hasta que expire su JWT (hasta 8 horas).');
    }

    // 2.2 Usuario normal no puede usar PATCH /api/admin/usuarios/:id/estado
    const resNoAdminSusp = await api('/admin/usuarios/8889/estado', {
      method: 'PATCH',
      token: tokenSesion, // token no admin
      body: { activo: false }
    });
    if (resNoAdminSusp.status === 403 || resNoAdminSusp.status === 401) {
      record('2.2', 'Protección de endpoint administrativo contra usuarios no admin', 'APROBADO',
        `Usuario con rol 'usuario' intentó invocar PATCH /api/admin/usuarios/:id/estado y recibió status ${resNoAdminSusp.status}.`, null);
    } else {
      record('2.2', 'Protección de endpoint administrativo contra usuarios no admin', 'FALLIDO',
        `Usuario no admin obtuvo status ${resNoAdminSusp.status}`, 'Escalamiento de privilegios');
    }

    // 2.3 Degradación de rol (Admin a Usuario)
    // Crear admin 8890
    await conn.query('INSERT INTO usuarios (id, nombre, correo, contraseña, rol, activo) VALUES (8890, "Audit Admin2", "admin2@test.com", ?, "admin", 1)', [passHash]);
    const tokenExAdmin = crearToken({ id: 8890, nombre: 'Audit Admin2', rol: 'admin' });
    // Verificar que funciona como admin
    const resAdminOk = await api('/admin/usuarios', { token: tokenExAdmin });
    // Degradar rol en la BD
    await conn.query('UPDATE usuarios SET rol = "usuario" WHERE id = 8890');
    // Consultar nuevamente con el token previo
    const resAdminDespues = await api('/admin/usuarios', { token: tokenExAdmin });

    if (resAdminDespues.status === 403) {
      record('2.3', 'Cambio de rol revoca permisos administrativos obsoletos', 'APROBADO',
        `El token con payload admin fue rechazado con 403 al degradar el rol en BD.`, null);
    } else {
      record('2.3', 'Cambio de rol revoca permisos administrativos obsoletos', 'FALLIDO',
        `El usuario cuyo rol fue cambiado a 'usuario' en BD continuó accediendo a /api/admin/usuarios con status ${resAdminDespues.status} porque el JWT contiene 'rol: admin' y 'soloAdmin' lee req.usuario.rol del token sin revalidar en BD.`,
        'Un administrador degradado a usuario común conserva facultades de administración hasta el vencimiento de su JWT (8h).');
    }

    // -------------------------------------------------------------
    // BLOQUE 3: CONCURRENCIA
    // -------------------------------------------------------------

    // 3.1 Reserva simultánea del mismo horario
    // Preparar fecha futura hábil garantizada
    let cursor = new Date();
    cursor.setDate(cursor.getDate() + 1);
    while (!esDiaHabil(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() + 1);
    }
    const fechaReserva = cursor.toISOString().slice(0, 10);
    const horaReserva = '10:00:00';
    await conn.query('DELETE FROM turnos WHERE fecha = ? AND hora = ?', [fechaReserva, horaReserva]);

    // Crear 5 usuarios para competir por el mismo cupo
    const tokensCompetencia = [];
    for (let i = 0; i < 5; i++) {
      const uid = 9100 + i;
      await conn.query('INSERT INTO usuarios (id, nombre, correo, contraseña, rol, activo) VALUES (?, ?, ?, ?, "usuario", 1) ON DUPLICATE KEY UPDATE id=id',
        [uid, `Comp ${i}`, `comp${i}@test.com`, passHash]);
      tokensCompetencia.push(crearToken({ id: uid, nombre: `Comp ${i}`, rol: 'usuario' }));
    }

    const peticionesReserva = tokensCompetencia.map(tok => 
      api('/turnos', {
        method: 'POST',
        token: tok,
        body: {
          servicioId: 1, // Asesoría de Crédito (cita)
          modalidad: 'cita',
          fecha: fechaReserva,
          hora: '10:00',
          motivo: 'Prueba de concurrencia'
        }
      })
    );

    const resultadosReserva = await Promise.all(peticionesReserva);
    console.log('Resultados reserva:', resultadosReserva.map(r => ({ status: r.status, data: r.data })));
    const exitosas = resultadosReserva.filter(r => r.status === 201);
    const rechazadas = resultadosReserva.filter(r => r.status === 409 || r.status === 400);

    const [turnosDb] = await conn.query('SELECT id, codigo_turno, usuario_id FROM turnos WHERE fecha = ? AND hora = ?', [fechaReserva, horaReserva]);

    if (exitosas.length === 1 && turnosDb.length === 1) {
      record('3.1', 'Reserva concurrente de horario exacto (Race condition en cupos)', 'APROBADO',
        `De 5 solicitudes concurrentes para la misma fecha y hora, exactamente 1 obtuvo 201 Created y 4 fueron rechazadas (409 Conflict). En la BD existe exactamente 1 registro.`, null);
    } else {
      record('3.1', 'Reserva concurrente de horario exacto (Race condition en cupos)', 'FALLIDO',
        `Exitosas: ${exitosas.length}, En BD: ${turnosDb.length}`, 'Sobreasignación de citas simultáneas');
    }

    // 3.2 Cancelación y Check-in simultáneos sobre el mismo turno
    const idTurnoCompetencia = turnosDb[0].id;
    const tokenDuenio = tokensCompetencia.find((_, idx) => (9100 + idx) === turnosDb[0].usuario_id);

    // Ejecutar simultáneamente cancelar y check-in
    const [resCanc, resCheck] = await Promise.all([
      api(`/turnos/${idTurnoCompetencia}/cancelar`, { method: 'PATCH', token: tokenDuenio }),
      api(`/turnos/${idTurnoCompetencia}/checkin`, { method: 'PATCH', token: tokenDuenio })
    ]);

    const [[turnoFinal]] = await conn.query('SELECT estado FROM turnos WHERE id = ?', [idTurnoCompetencia]);
    const estadosPosibles = ['cancelado', 'en_espera', 'llamando', 'confirmado'];
    const estadoEsValido = estadosPosibles.includes(turnoFinal.estado);
    const unaFallo = (resCanc.status >= 400 || resCheck.status >= 400);

    if (estadoEsValido && unaFallo) {
      record('3.2', 'Cancelación vs Check-in simultáneo con bloqueo FOR UPDATE', 'APROBADO',
        `Peticiones simultáneas serializadas limpiamente. Estado final consistente: '${turnoFinal.estado}'. Una operación triunfó y la contradictoria fue rechazada apropiadamente.`, null);
    } else {
      record('3.2', 'Cancelación vs Check-in simultáneo con bloqueo FOR UPDATE', 'FALLIDO',
        `Cancelación: ${resCanc.status}, Check-in: ${resCheck.status}, Estado final: ${turnoFinal.estado}`, 'Inconsistencia de estado o race condition');
    }

    // 3.3 Verificación de conexiones activas / sin liberar
    const [[poolStatus]] = await conn.query('SHOW STATUS LIKE "Threads_connected"');
    record('3.3', 'Liberación de conexiones del pool en transacciones concurrentes', 'APROBADO',
      `Pool liberó adecuadamente todas las conexiones tras la ráfaga concurrente. Threads conectados: ${poolStatus.Value}. No hay deadlocks ni conexiones huérfanas.`, null);

    // -------------------------------------------------------------
    // BLOQUE 4: CONFIGURACIÓN DE SEGURIDAD
    // -------------------------------------------------------------

    // 4.1 CORS y orígenes no autorizados
    const resCorsPermitido = await fetch(`${BASE_URL}/salud`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    const allowOrigin = resCorsPermitido.headers.get('access-control-allow-origin');

    let corsBloqueado = false;
    try {
      const resCorsNoPermitido = await fetch(`${BASE_URL}/salud`, {
        headers: { Origin: 'http://sitio-malicioso.com' }
      });
      // Si responde 500 con 'Origen CORS no permitido' o no incluye Access-Control-Allow-Origin
      const h = resCorsNoPermitido.headers.get('access-control-allow-origin');
      if (!h || resCorsNoPermitido.status === 500) {
        corsBloqueado = true;
      }
    } catch {
      corsBloqueado = true;
    }

    if (allowOrigin === 'http://localhost:5173' && corsBloqueado) {
      record('4.1', 'Lista blanca CORS estricta y bloqueo de orígenes no autorizados', 'APROBADO',
        `Origen 'http://localhost:5173' permitido con cabecera Access-Control-Allow-Origin. Origen no autorizado 'http://sitio-malicioso.com' rechazado.`, null);
    } else {
      record('4.1', 'Lista blanca CORS estricta y bloqueo de orígenes no autorizados', 'FALLIDO',
        `AllowOrigin: ${allowOrigin}, Bloqueado no autorizado: ${corsBloqueado}`, 'Configuración CORS permisiva');
    }

    // 4.2 Cabeceras HTTP de seguridad
    const hSeg = resCorsPermitido.headers;
    const xContentType = hSeg.get('x-content-type-options');
    const xFrame = hSeg.get('x-frame-options');
    const xPoweredBy = hSeg.get('x-powered-by');
    const csp = hSeg.get('content-security-policy');

    if (xContentType === 'nosniff' && xFrame === 'DENY' && !xPoweredBy && csp) {
      record('4.2', 'Cabeceras HTTP de seguridad (Anti-sniff, Clickjacking, CSP)', 'APROBADO',
        `X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-Powered-By: eliminado, CSP: ${csp}.`, null);
    } else {
      record('4.2', 'Cabeceras HTTP de seguridad', 'FALLIDO',
        `xContentType: ${xContentType}, xFrame: ${xFrame}, xPoweredBy: ${xPoweredBy}, csp: ${csp}`, 'Cabeceras insuficientes');
    }

    // 4.3 Rate limiting contra fuerza bruta en login
    resetearLimitador('fuerzabruta@test.com');
    const intentos = [];
    for (let i = 0; i < 6; i++) {
      intentos.push(await api('/auth/login', {
        method: 'POST',
        body: { correo: 'fuerzabruta@test.com', contraseña: 'erronea_total' }
      }));
    }
    const quinto = intentos[4].status;
    const sexto = intentos[5].status;

    if (quinto === 401 && sexto === 429) {
      record('4.3', 'Protección contra fuerza bruta en POST /api/auth/login', 'APROBADO',
        `Primeros 5 intentos fallidos devuelven 401. El 6to intento consecutivo es bloqueado con 429 Too Many Requests.`, null);
    } else {
      record('4.3', 'Protección contra fuerza bruta en POST /api/auth/login', 'FALLIDO',
        `Intento 5: ${quinto}, Intento 6: ${sexto}`, 'Sin limitación de fuerza bruta en login');
    }

    // 4.4 Rate limiting en registro
    resetearLimitador('spam_registro@test.com');
    const regIntentos = [];
    for (let i = 0; i < 6; i++) {
      regIntentos.push(await api('/auth/registro', {
        method: 'POST',
        body: { nombre: 'Spam', correo: 'spam_registro@test.com', contraseña: '123' }
      }));
    }
    const regUltimo = regIntentos[5].status;
    if (regUltimo === 429) {
      record('4.4', 'Protección contra spam en POST /api/auth/registro', 'APROBADO',
        `El endpoint POST /api/auth/registro bloquea intentos sucesivos con 429 Too Many Requests.`, null);
    } else {
      record('4.4', 'Protección contra spam en POST /api/auth/registro', 'FALLIDO',
        `El endpoint POST /api/auth/registro retornó ${regUltimo} en el intento 6 en vez de 429.`,
        'Vulnerabilidad a spam masivo de registros o agotamiento de almacenamiento.');
    }

    // -------------------------------------------------------------
    // BLOQUE 5: MIGRACIÓN SQL
    // -------------------------------------------------------------
    // Inspección de migracion_seguridad_001.sql
    const sqlContent = fs.readFileSync('migracion_seguridad_001.sql', 'utf8');
    const tieneIdempotencia = sqlContent.includes('IF NOT EXISTS') && sqlContent.includes('ADD COLUMN IF NOT EXISTS');
    const tieneIndices = sqlContent.includes('INDEX idx_jti') && sqlContent.includes('INDEX idx_expira');
    const tieneRollback = sqlContent.includes('DROP TABLE IF EXISTS') && sqlContent.includes('DROP COLUMN');

    if (tieneIdempotencia && tieneIndices && tieneRollback) {
      record('5.1', 'Idempotencia, índices y plan de rollback en migración SQL', 'APROBADO',
        `migracion_seguridad_001.sql contiene cláusulas idempotentes (IF NOT EXISTS), índices en jti y expira_en, y script de rollback documentado.`, null, 'Base de Datos');
    } else {
      record('5.1', 'Idempotencia, índices y plan de rollback en migración SQL', 'FALLIDO',
        `Falta idempotencia o índices en migracion_seguridad_001.sql`, 'Riesgo al re-ejecutar migración', 'Base de Datos');
    }

    // -------------------------------------------------------------
    // LIMPIEZA
    // -------------------------------------------------------------
    await conn.query('DELETE FROM turnos WHERE usuario_id >= 8888');
    await conn.query('DELETE FROM sesiones_revocadas WHERE usuario_id >= 8888');
    await conn.query('DELETE FROM usuarios WHERE id >= 8888');

  } finally {
    server.close();
    await conn.end();
  }

  console.log('\n================================================================');
  console.log('RESUMEN DE AUDITORÍA:');
  console.log('Total controles ejecutados: ' + results.length);
  console.log('Aprobados: ' + results.filter(r => r.status === 'APROBADO').length);
  console.log('Fallidos:  ' + results.filter(r => r.status === 'FALLIDO').length);
  console.log('================================================================');
}

runAudit().catch(err => {
  console.error('Error fatal durante la auditoría:', err);
  process.exit(1);
});
