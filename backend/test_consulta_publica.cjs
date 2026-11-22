/**
 * test_consulta_publica.cjs
 * Suite de pruebas automatizadas para la consulta pública de turnos por código.
 * FILA CERO - Rama feature/Jhostyn
 */
'use strict';
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const http = require('http');

process.env.NODE_ENV = 'test';
dotenv.config();

const TEST_PORT = 3699;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: CONSULTA PÚBLICA DE TURNOS POR CÓDIGO (FILA CERO)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, detalle = null) {
    if (condition) {
      console.log(`\u2713 [PAS\u00D3] ${message}`);
      passed++;
    } else {
      console.error(`\u2717 [FALL\u00D3] ${message}`);
      if (detalle) console.error('   Detalle:', detalle);
      failed++;
    }
  }

  const testDbName = process.env.DB_NAME_TEST || 'fila_cero_test';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST_TEST || 'localhost',
    port: Number(process.env.DB_PORT_TEST || 3306),
    user: process.env.DB_USER_TEST || 'root',
    password: process.env.DB_PASSWORD_TEST || '',
    database: testDbName,
    multipleStatements: true
  });

  // Asegurar esquema base de prueba
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
      UNIQUE INDEX idx_turnos_codigo_unico (codigo_turno)
    );
  `);

  const { app } = await import('./src/server.js');
  const { resetearLimitadorConsultaPublica, llenarLimitadorConsultaPublica } = await import('./src/auth.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  async function apiPublica(codigo) {
    const res = await fetch(`${BASE_URL}/turnos/publico/${encodeURIComponent(codigo)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  // Sembrar datos de prueba
  const testUserId = 9901;
  await conn.execute(
    'INSERT INTO usuarios (id, nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)',
    [testUserId, 'Carlos Prueba', 'carlos.publico@filacero.test', '$2a$04$testpasswordhash1234567890', 'usuario']
  );

  const testServicioActivoId = 9910;
  const testServicioInactivoId = 9911;

  await conn.execute(
    `INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo)
     VALUES (?, 'Asesoría Hipotecaria Test', 'HIP', 'cita', 40, TRUE, 'Asesoría hipotecaria pública.', TRUE)
     ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), activo=TRUE`,
    [testServicioActivoId]
  );

  await conn.execute(
    `INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo)
     VALUES (?, 'Servicio Desactivado Test', 'SDT', 'turno', 15, FALSE, 'Servicio cerrado.', FALSE)
     ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), activo=FALSE`,
    [testServicioInactivoId]
  );

  const turnosCreados = [];

  try {
    // -------------------------------------------------------------
    // BLOQUE 1: Consulta Válida sin JWT y Minimización de Datos
    // -------------------------------------------------------------
    console.log('--- BLOQUE 1: Consulta Válida sin JWT y Minimización de Datos ---');

    const codigoValido = 'HIP-101';
    await conn.execute(
      `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo, modulo, checkin_en)
       VALUES (?, ?, 'cita', '2026-11-20', '10:30:00', 'confirmado', ?, 'Préstamo confidencial', 'Módulo 3', NOW())
       ON DUPLICATE KEY UPDATE estado='confirmado'`,
      [testUserId, testServicioActivoId, codigoValido]
    );
    turnosCreados.push(codigoValido);

    const rValida = await apiPublica(codigoValido);
    assert(rValida.status === 200, '1.1 Consulta con código válido responde 200 OK sin requerir JWT');
    assert(rValida.data.codigo_turno === codigoValido, '1.2 Devuelve el código del turno correcto');
    assert(rValida.data.servicio === 'Asesoría Hipotecaria Test', '1.3 Devuelve el nombre del servicio asociado');
    assert(rValida.data.modalidad === 'cita', '1.4 Devuelve la modalidad correcta');
    assert(rValida.data.fecha === '2026-11-20', '1.5 Devuelve la fecha normalizada YYYY-MM-DD');
    assert(rValida.data.hora === '10:30', '1.6 Devuelve la hora formateada HH:mm');
    assert(rValida.data.estado === 'confirmado', '1.7 Devuelve el estado actual');

    // Validación estricta de minimización de datos: NO exponer campos internos ni datos personales
    const camposProhibidos = [
      'id', 'usuario_id', 'nombre', 'correo', 'email', 'telefono',
      'motivo', 'modulo', 'checkin_en', 'llamado_en', 'atencion_inicio_en',
      'atencion_fin_en', 'creado_en', 'contraseña', 'password'
    ];
    const camposFiltrados = camposProhibidos.filter((c) => c in rValida.data);
    assert(camposFiltrados.length === 0, '1.8 La respuesta NO contiene campos sensibles ni internos (id, usuario, motivo, modulo, timestamps)', camposFiltrados);

    // Campos exactos permitidos
    const clavesEsperadas = ['codigo_turno', 'servicio', 'modalidad', 'fecha', 'hora', 'estado'];
    const clavesRecibidas = Object.keys(rValida.data).sort();
    assert(JSON.stringify(clavesRecibidas) === JSON.stringify(clavesEsperadas.sort()), '1.9 La respuesta contiene EXCLUSIVAMENTE los 6 campos públicos autorizados');

    // -------------------------------------------------------------
    // BLOQUE 2: Validación Estricta de Formato de Código
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 2: Validación Estricta de Formato de Código ---');

    // 2.1 Código demasiado corto
    const rCorto = await apiPublica('AB');
    assert(rCorto.status === 400 && rCorto.data.error.includes('formato'), '2.1 Código con menos de 4 caracteres responde 400 Bad Request');

    // 2.2 Código demasiado largo (> 10 caracteres)
    const rLargo = await apiPublica('ABCDE-123456');
    assert(rLargo.status === 400 && rLargo.data.error.includes('formato'), '2.2 Código con más de 10 caracteres responde 400 Bad Request');

    // 2.3 Código sin separador guión
    const rSinGuion = await apiPublica('HIP1010');
    assert(rSinGuion.status === 400 && rSinGuion.data.error.includes('formato'), '2.3 Código sin guión o separador responde 400 Bad Request');

    // 2.4 Código con caracteres especiales no permitidos
    const rEspeciales = await apiPublica('CR-@#$');
    assert(rEspeciales.status === 400 && rEspeciales.data.error.includes('formato'), '2.4 Código con caracteres especiales no alfanuméricos responde 400');

    // 2.5 Código inexistente con formato válido
    const rInexistente = await apiPublica('ZZ-999');
    assert(rInexistente.status === 404, '2.5 Código inexistente responde 404 Not Found');
    assert(rInexistente.data.error.includes('Turno no encontrado'), '2.6 Mensaje genérico de no encontrado sin revelar datos internos');

    // -------------------------------------------------------------
    // BLOQUE 3: Cobertura de Todos los Estados del Ciclo de Vida
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 3: Cobertura de Todos los Estados del Ciclo de Vida ---');
    resetearLimitadorConsultaPublica();

    const ESTADOS = [
      'pendiente',
      'confirmado',
      'en_espera',
      'llamando',
      'en_atencion',
      'completado',
      'cancelado',
      'no_presentado'
    ];

    for (let i = 0; i < ESTADOS.length; i++) {
      const estadoActual = ESTADOS[i];
      const codigoEstado = `ST-${String(200 + i).padStart(3, '0')}`;

      await conn.execute(
        `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno)
         VALUES (?, ?, 'turno', '2026-11-20', '11:00:00', ?, ?)
         ON DUPLICATE KEY UPDATE estado=VALUES(estado)`,
        [testUserId, testServicioActivoId, estadoActual, codigoEstado]
      );
      turnosCreados.push(codigoEstado);

      const rEst = await apiPublica(codigoEstado);
      assert(rEst.status === 200 && rEst.data.estado === estadoActual, `3.${i + 1} Turno en estado "${estadoActual}" consultado correctamente`);
    }

    // -------------------------------------------------------------
    // BLOQUE 4: Turno Histórico con Servicio Desactivado
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 4: Turno Histórico con Servicio Desactivado ---');
    resetearLimitadorConsultaPublica();

    const codigoHistInactivo = 'SDT-055';
    await conn.execute(
      `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno)
       VALUES (?, ?, 'turno', '2026-11-15', '09:00:00', 'completado', ?)
       ON DUPLICATE KEY UPDATE estado='completado'`,
      [testUserId, testServicioInactivoId, codigoHistInactivo]
    );
    turnosCreados.push(codigoHistInactivo);

    const rHistInactivo = await apiPublica(codigoHistInactivo);
    assert(rHistInactivo.status === 200, '4.1 Turno de servicio desactivado responde 200 OK');
    assert(rHistInactivo.data.servicio === 'Servicio Desactivado Test', '4.2 Resuelve el nombre del servicio desactivado vía LEFT JOIN');
    assert(rHistInactivo.data.codigo_turno === codigoHistInactivo, '4.3 Código del turno histórico verificado');
    assert(rHistInactivo.data.estado === 'completado', '4.4 Estado completado del turno histórico consultable');

    // -------------------------------------------------------------
    // BLOQUE 5: Protección contra Inyección SQL y Aislamiento
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 5: Protección contra Inyección SQL y Aislamiento ---');
    resetearLimitadorConsultaPublica();

    const payloadsInyeccion = [
      "' OR '1'='1",
      "CR-001'--",
      "CR-001; DROP TABLE usuarios;",
      "UNION SELECT 1,2,3,4,5,6--",
      "admin'--"
    ];

    for (let j = 0; j < payloadsInyeccion.length; j++) {
      const rSql = await apiPublica(payloadsInyeccion[j]);
      // Debe ser rechazado por formato (400) o no encontrar nada (404), nunca 500 ni 200 con datos ajenos
      assert(
        (rSql.status === 400 || rSql.status === 404) && !rSql.data.usuario_id,
        `5.${j + 1} Inyección SQL rechazada de forma segura (HTTP ${rSql.status})`
      );
    }

    // Aislamiento: consultar turno A no revela turno B
    const rAislamiento = await apiPublica(codigoValido);
    assert(rAislamiento.data.codigo_turno === codigoValido, '5.6 Consulta de código específico está aislada y no expone otros registros');

    // -------------------------------------------------------------
    // BLOQUE 6: Rate Limiting Específico por IP (Máx 15 req/min)
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 6: Rate Limiting Específico por IP ---');

    // Reiniciar mapa en memoria para empezar la prueba limpia
    resetearLimitadorConsultaPublica();

    let respuestasExitosas = 0;
    let respuestaBloqueada = null;

    // Realizar 17 peticiones consecutivas desde la misma IP
    for (let k = 1; k <= 17; k++) {
      const resp = await apiPublica(codigoValido);
      if (resp.status === 200) {
        respuestasExitosas++;
      } else if (resp.status === 429) {
        respuestaBloqueada = resp;
        break;
      }
    }

    assert(respuestasExitosas === 15, `6.1 Permite exactamente 15 consultas por minuto por IP (permitidas: ${respuestasExitosas})`);
    assert(respuestaBloqueada && respuestaBloqueada.status === 429, '6.2 La solicitud número 16 es bloqueada con HTTP 429 Too Many Requests');
    assert(
      respuestaBloqueada && respuestaBloqueada.data.error.includes('Demasiadas consultas'),
      '6.3 Mensaje de rate limiting claro para el usuario'
    );

    // Reiniciar de nuevo el limitador para no afectar otras pruebas
    resetearLimitadorConsultaPublica();

    // -------------------------------------------------------------
    // BLOQUE 7: Fail-Closed — el rate limit no puede eludirse saturando el Map
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 7: Fail-Closed — integridad del rate limit bajo saturación del Map ---');

    // 7.1 Preparar: la IP de prueba consume 14 de sus 15 consultas permitidas
    resetearLimitadorConsultaPublica();
    for (let k = 0; k < 14; k++) {
      await apiPublica(codigoValido);
    }

    // 7.2 Saturar el Map llenándolo hasta la cota con IPs sintéticas
    const entradas = llenarLimitadorConsultaPublica();
    assert(
      entradas >= 10_000,
      `7.1 Map saturado hasta la cota (entradas actuales: ${entradas})`
    );

    // 7.3 La IP de prueba (ya registrada) sigue siendo evaluada normalmente
    //     y puede usar su 15ª consulta restante
    const r15 = await apiPublica(codigoValido);
    assert(
      r15.status === 200,
      '7.2 IP registrada con 14 consultas previas sigue siendo evaluada bajo saturación (15ª consulta OK)'
    );

    // 7.4 La IP de prueba alcanza su límite (16ª consulta → 429 normal)
    const r16 = await apiPublica(codigoValido);
    assert(
      r16.status === 429 && r16.data.error.includes('Demasiadas consultas'),
      '7.3 IP registrada que superó su cuota sigue bloqueada con Map lleno (rate limit intacto)'
    );

    // 7.4 Una IP nueva (no registrada) recibe 429 fail-closed cuando el Map está lleno.
    //     Probamos llamando al middleware directamente con req/res simulados.
    //     La IP '192.168.99.99' no existe en el Map (rango diferente a 10.0.x.x y 127.0.0.1).
    const { limitarConsultaPublica } = await import('./src/auth.js');
    let statusFailClosed = null;
    let bodyFailClosed = null;
    const mockReq = { ip: '192.168.99.99', socket: { remoteAddress: '192.168.99.99' } };
    const mockRes = {
      status(code) { statusFailClosed = code; return this; },
      json(body) { bodyFailClosed = body; return this; }
    };
    let nextCalled = false;
    await limitarConsultaPublica(mockReq, mockRes, () => { nextCalled = true; });

    assert(
      statusFailClosed === 429 && !nextCalled,
      `7.4 IP nueva rechazada con 429 fail-closed cuando el Map está lleno (status: ${statusFailClosed}, next: ${nextCalled})`
    );
    assert(
      bodyFailClosed && bodyFailClosed.error && !bodyFailClosed.error.includes('Demasiadas consultas'),
      '7.5 Mensaje fail-closed es distinto al de rate limit normal (no revela contadores)'
    );

    // Verificar que el Map no fue modificado por la IP nueva rechazada
    const entradasTrasRechazo = llenarLimitadorConsultaPublica(10_000);
    assert(
      entradasTrasRechazo >= 10_000,
      `7.6 Ningún registro fue borrado por la solicitud fail-closed (entradas: ${entradasTrasRechazo})`
    );

    // 7.7 Validación estricta de parámetro n en llenarLimitadorConsultaPublica
    assert(llenarLimitadorConsultaPublica(-10) === false, '7.7 llenarLimitador rechaza valores negativos (-10)');
    assert(llenarLimitadorConsultaPublica(0) === false, '7.8 llenarLimitador rechaza cero');
    assert(llenarLimitadorConsultaPublica(10_001) === false, '7.9 llenarLimitador rechaza valores mayores a la cota máxima (10001)');
    assert(llenarLimitadorConsultaPublica(50.5) === false, '7.10 llenarLimitador rechaza números no enteros (50.5)');
    assert(llenarLimitadorConsultaPublica('500') === false, '7.11 llenarLimitador rechaza strings');

    // Limpiar para dejar el estado limpio antes del finally
    resetearLimitadorConsultaPublica();

  } finally {
    // -------------------------------------------------------------
    // LIMPIEZA ESTRICTA
    // -------------------------------------------------------------
    console.log('\n--- LIMPIEZA DE DATOS DE PRUEBA ---');
    if (turnosCreados.length > 0) {
      const placeholdersT = turnosCreados.map(() => '?').join(',');
      await conn.query(`DELETE FROM turnos WHERE codigo_turno IN (${placeholdersT})`, turnosCreados);
      console.log(`✓ Turnos de prueba eliminados: ${turnosCreados.length}`);
    }

    await conn.execute('DELETE FROM servicios WHERE id IN (?, ?)', [testServicioActivoId, testServicioInactivoId]);
    await conn.execute('DELETE FROM usuarios WHERE id = ?', [testUserId]);
    console.log('✓ Servicios y usuarios de prueba eliminados.');

    server.close();
    await conn.end();
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL CONSULTA PÚBLICA: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal durante las pruebas de consulta pública:', err);
  process.exit(1);
});
