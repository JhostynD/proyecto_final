/**
 * test_servicios.cjs
 * Suite de pruebas automatizadas para la gestión administrativa completa de servicios.
 * FILA CERO - Rama feature/Jhostyn
 */
'use strict';
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const http = require('http');

process.env.NODE_ENV = 'test';
dotenv.config();

const TEST_PORT = 3599;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: GESTIÓN COMPLETA DE SERVICIOS (FILA CERO)');
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

  // Asegurar que la tabla servicios tenga la estructura y datos base de prueba
  await conn.query(`
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

    CREATE TABLE IF NOT EXISTS usuarios (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      contraseña VARCHAR(255) NOT NULL,
      rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo) VALUES
      (1, 'Asesoría de Crédito', 'CR', 'cita', 30, TRUE, 'Asesoría personalizada para productos de crédito.', TRUE),
      (2, 'Soporte Técnico', 'ST', 'turno', 15, FALSE, 'Turno virtual para consultas técnicas.', TRUE),
      (3, 'Atención General', 'AG', 'turno_y_cita', 20, FALSE, 'Atención presencial o agendamiento.', TRUE)
    ON DUPLICATE KEY UPDATE
      codigo_prefijo = VALUES(codigo_prefijo),
      modalidad = VALUES(modalidad),
      duracion_estimada_min = VALUES(duracion_estimada_min),
      requiere_tema = VALUES(requiere_tema),
      descripcion = VALUES(descripcion);
  `);

  const { app } = await import('./src/server.js');
  const { crearToken } = await import('./src/auth.js');
  const { esDiaHabil } = await import('./src/festivos_colombia.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
    };
    const res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  // Generar tokens para pruebas
  const adminUsuario = { id: 9801, nombre: 'Admin Servicios', rol: 'admin' };
  const regularUsuario = { id: 9802, nombre: 'Usuario Regular', rol: 'usuario' };
  const adminToken = crearToken(adminUsuario);
  const regularToken = crearToken(regularUsuario);

  // Sembrar usuarios de prueba en BD
  const passHash = await bcrypt.hash('PruebaPass123*', 4);
  await conn.execute(
    'INSERT INTO usuarios (id, nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), rol=VALUES(rol)',
    [adminUsuario.id, adminUsuario.nombre, 'admin.srv@filacero.test', passHash, 'admin']
  );
  await conn.execute(
    'INSERT INTO usuarios (id, nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), rol=VALUES(rol)',
    [regularUsuario.id, regularUsuario.nombre, 'user.srv@filacero.test', passHash, 'usuario']
  );

  const serviciosCreados = [];
  const turnosCreados = [];

  try {
    // -------------------------------------------------------------
    // BLOQUE 1: Control de Acceso y Autorización (Fail-Closed)
    // -------------------------------------------------------------
    console.log('--- BLOQUE 1: Control de Acceso y Autorización ---');

    const rSinTokenGet = await api('/admin/servicios');
    assert(rSinTokenGet.status === 401, '1.1 GET /api/admin/servicios sin token responde 401');

    const rUserRegularGet = await api('/admin/servicios', { token: regularToken });
    assert(rUserRegularGet.status === 403, '1.2 GET /api/admin/servicios con usuario regular responde 403 Forbidden');

    const rSinTokenPost = await api('/admin/servicios', { method: 'POST', body: { nombre: 'Inseguro' } });
    assert(rSinTokenPost.status === 401, '1.3 POST /api/admin/servicios sin token responde 401');

    const rUserRegularPost = await api('/admin/servicios', {
      method: 'POST',
      token: regularToken,
      body: { nombre: 'Inseguro User', codigo_prefijo: 'IU', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rUserRegularPost.status === 403, '1.4 POST /api/admin/servicios con usuario regular responde 403');

    const rUserRegularPatch = await api('/admin/servicios/1', {
      method: 'PATCH',
      token: regularToken,
      body: { nombre: 'Cambio No Autorizado' }
    });
    assert(rUserRegularPatch.status === 403, '1.5 PATCH /api/admin/servicios/:id con usuario regular responde 403');

    const rUserRegularEstado = await api('/admin/servicios/1/estado', {
      method: 'PATCH',
      token: regularToken,
      body: { activo: false }
    });
    assert(rUserRegularEstado.status === 403, '1.6 PATCH /api/admin/servicios/:id/estado con usuario regular responde 403');

    // -------------------------------------------------------------
    // BLOQUE 2: Listar Servicios para Administración
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 2: Listar Servicios para Administración ---');

    const rListar = await api('/admin/servicios', { token: adminToken });
    assert(rListar.status === 200 && Array.isArray(rListar.data), '2.1 GET /api/admin/servicios retorna status 200 y array');
    assert(rListar.data.length >= 3, '2.2 Contiene los servicios existentes');

    const primerSrv = rListar.data[0];
    const tieneCampos = primerSrv &&
      'id' in primerSrv &&
      'nombre' in primerSrv &&
      'codigo_prefijo' in primerSrv &&
      'modalidad' in primerSrv &&
      'duracion_estimada_min' in primerSrv &&
      'requiere_tema' in primerSrv &&
      'activo' in primerSrv &&
      'descripcion' in primerSrv;
    assert(tieneCampos, '2.3 Cada servicio contiene todos los campos necesarios');
    assert(typeof primerSrv.activo === 'boolean' && typeof primerSrv.requiere_tema === 'boolean', '2.4 Tipos booleanos normalizados para activo y requiere_tema');

    // -------------------------------------------------------------
    // BLOQUE 3: Validación Estricta en Creación (POST)
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 3: Validación Estricta en Creación (POST) ---');

    // 3.1 Sin nombre
    const rVal1 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { codigo_prefijo: 'SRV', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rVal1.status === 400 && rVal1.data.error.includes('nombre'), '3.1 Rechaza creación sin nombre (400)');

    // 3.2 Nombre demasiado corto (< 3 caracteres)
    const rVal2 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'AB', codigo_prefijo: 'SRV', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rVal2.status === 400 && rVal2.data.error.includes('nombre'), '3.2 Rechaza nombre con menos de 3 caracteres (400)');

    // 3.3 Sin prefijo
    const rVal3 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Sin Prefijo', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rVal3.status === 400 && rVal3.data.error.includes('prefijo'), '3.3 Rechaza creación sin código prefijo (400)');

    // 3.4 Prefijo con formato inválido (menos de 2 chars, más de 5, caracteres especiales)
    const rVal4 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Prefijo Invalido', codigo_prefijo: 'P@#$', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rVal4.status === 400 && rVal4.data.error.includes('prefijo'), '3.4 Rechaza código prefijo con caracteres inválidos (400)');

    const rVal4b = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Prefijo Largo', codigo_prefijo: 'PREFIJOLARGO', modalidad: 'cita', duracion_estimada_min: 30 }
    });
    assert(rVal4b.status === 400 && rVal4b.data.error.includes('prefijo'), '3.5 Rechaza código prefijo mayor a 5 caracteres (400)');

    // 3.6 Modalidad inválida
    const rVal5 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Modalidad Mal', codigo_prefijo: 'SMM', modalidad: 'videollamada', duracion_estimada_min: 30 }
    });
    assert(rVal5.status === 400 && rVal5.data.error.includes('modalidad'), '3.6 Rechaza modalidad no permitida (400)');

    // 3.7 Duración menor a 5 o no entera
    const rVal6 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Duracion 0', codigo_prefijo: 'SDZ', modalidad: 'turno', duracion_estimada_min: 0 }
    });
    assert(rVal6.status === 400 && rVal6.data.error.includes('duración'), '3.7 Rechaza duración menor a 5 minutos (400)');

    // 3.8 Requiere tema no booleano
    const rVal7 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Tema Inv', codigo_prefijo: 'STI', modalidad: 'cita', duracion_estimada_min: 30, requiere_tema: 'verdadero' }
    });
    assert(rVal7.status === 400 && rVal7.data.error.includes('requiere_tema'), '3.8 Rechaza campo requiere_tema no booleano (400)');

    // 3.9 Campos no permitidos en el payload (Mass Assignment protection)
    const rVal8 = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Servicio Hack', codigo_prefijo: 'SHK', modalidad: 'cita', duracion_estimada_min: 30, campo_malicioso: true }
    });
    assert(rVal8.status === 400 && rVal8.data.error.includes('no permitidos'), '3.9 Rechaza campos no autorizados en el payload (400)');

    // -------------------------------------------------------------
    // BLOQUE 4: Creación Exitosa y Manejo de Duplicados
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 4: Creación Exitosa y Manejo de Duplicados ---');

    const nombreNuevo = `Servicio Hipotecas Test ${Date.now()}`;
    const prefijoNuevo = 'HIP';

    const rCrear = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: nombreNuevo,
        codigo_prefijo: prefijoNuevo,
        modalidad: 'cita',
        duracion_estimada_min: 45,
        requiere_tema: true,
        descripcion: 'Gestión integral de créditos hipotecarios y leasing habitacional.'
      }
    });

    assert(rCrear.status === 201 && rCrear.data.id > 0, '4.1 Creación exitosa retorna status 201 y el ID asignado');
    const idSrvNuevo = rCrear.data.id;
    if (idSrvNuevo) serviciosCreados.push(idSrvNuevo);

    assert(rCrear.data.activo === true, '4.2 El nuevo servicio se crea activo por defecto');
    assert(rCrear.data.codigo_prefijo === prefijoNuevo, '4.3 El prefijo se almacena correctamente en mayúsculas');
    assert(rCrear.data.duracion_estimada_min === 45, '4.4 La duración estimada coincide con el valor enviado');

    // 4.5 Rechazo de nombre duplicado
    const rDupNombre = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: nombreNuevo.toLowerCase(), // case-insensitive
        codigo_prefijo: 'OTR',
        modalidad: 'cita',
        duracion_estimada_min: 30
      }
    });
    assert(rDupNombre.status === 400 && rDupNombre.data.error.includes('nombre'), '4.5 Rechaza nombre duplicado (400)');

    // 4.6 Rechazo de prefijo duplicado
    const rDupPrefijo = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Otro Servicio ${Date.now()}`,
        codigo_prefijo: prefijoNuevo.toLowerCase(), // case-insensitive
        modalidad: 'cita',
        duracion_estimada_min: 30
      }
    });
    assert(rDupPrefijo.status === 400 && rDupPrefijo.data.error.includes('prefijo'), '4.6 Rechaza código prefijo duplicado (400)');

    // -------------------------------------------------------------
    // BLOQUE 5: Edición de Servicios Existentes (PATCH)
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 5: Edición de Servicios Existentes (PATCH) ---');

    // 5.1 Rechazo sin campos
    const rPatchVacio = await api(`/admin/servicios/${idSrvNuevo}`, {
      method: 'PATCH',
      token: adminToken,
      body: {}
    });
    assert(rPatchVacio.status === 400, '5.1 Rechaza PATCH sin campos para actualizar (400)');

    // 5.2 Intento de modificar ID
    const rPatchId = await api(`/admin/servicios/${idSrvNuevo}`, {
      method: 'PATCH',
      token: adminToken,
      body: { id: 999 }
    });
    assert(rPatchId.status === 400 && rPatchId.data.error.includes('identificador'), '5.2 Rechaza intento de modificar el identificador (id)');

    // 5.3 Intento de modificar 'activo' por este endpoint
    const rPatchActivo = await api(`/admin/servicios/${idSrvNuevo}`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: false }
    });
    assert(rPatchActivo.status === 400 && rPatchActivo.data.error.includes('estado'), '5.3 Rechaza modificar "activo" por el endpoint de datos generales (debe usarse /estado)');

    // 5.4 ID inexistente
    const rPatchNoExiste = await api('/admin/servicios/999999', {
      method: 'PATCH',
      token: adminToken,
      body: { nombre: 'Nombre Imposible' }
    });
    assert(rPatchNoExiste.status === 404, '5.4 Retorna 404 para servicio inexistente');

    // 5.5 Conflicto de nombre con servicio existente (Servicio 1: Asesoría de Crédito)
    const rPatchNombreDup = await api(`/admin/servicios/${idSrvNuevo}`, {
      method: 'PATCH',
      token: adminToken,
      body: { nombre: 'Asesoría de Crédito' }
    });
    assert(rPatchNombreDup.status === 400 && rPatchNombreDup.data.error.includes('nombre'), '5.5 Rechaza nombre que ya pertenece a otro servicio (400)');

    // 5.6 Edición exitosa de múltiples campos autorizados
    const nombreEditado = `Hipotecas y Leasing Habitacional ${Date.now()}`;
    const prefijoEditado = 'HLH';
    const rPatchExito = await api(`/admin/servicios/${idSrvNuevo}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        nombre: nombreEditado,
        codigo_prefijo: prefijoEditado,
        modalidad: 'turno_y_cita',
        duracion_estimada_min: 50,
        requiere_tema: false,
        descripcion: 'Asesoría especializada presencial y virtual para leasing habitacional.'
      }
    });

    assert(rPatchExito.status === 200, '5.6 PATCH retorna 200 tras actualizar exitosamente');
    assert(rPatchExito.data.nombre === nombreEditado, '5.7 Nombre actualizado correctamente');
    assert(rPatchExito.data.codigo_prefijo === prefijoEditado, '5.8 Prefijo actualizado a HLH');
    assert(rPatchExito.data.modalidad === 'turno_y_cita', '5.9 Modalidad actualizada a turno_y_cita');
    assert(rPatchExito.data.duracion_estimada_min === 50, '5.10 Duración actualizada a 50 min');
    assert(rPatchExito.data.requiere_tema === false, '5.11 Requiere tema actualizado a false');

    // -------------------------------------------------------------
    // BLOQUE 6: Activación y Desactivación de Servicios (/estado)
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 6: Activación y Desactivación de Servicios (/estado) ---');

    // 6.1 Rechazar activo no booleano
    const rEstNoBool = await api(`/admin/servicios/${idSrvNuevo}/estado`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: 'desactivado' }
    });
    assert(rEstNoBool.status === 400 && rEstNoBool.data.error.includes('booleano'), '6.1 Rechaza valor no booleano para campo activo (400)');

    // 6.2 Rechazar campos adicionales
    const rEstExtra = await api(`/admin/servicios/${idSrvNuevo}/estado`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: false, nombre: 'Cambio Infiltrado' }
    });
    assert(rEstExtra.status === 400, '6.2 Rechaza campos ajenos a "activo" en endpoint /estado (400)');

    // 6.3 Desactivar servicio
    const rDesactivar = await api(`/admin/servicios/${idSrvNuevo}/estado`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: false }
    });
    assert(rDesactivar.status === 200 && rDesactivar.data.activo === false, '6.3 Desactivación exitosa responde 200 y activo=false');

    // 6.4 Comprobar que en GET /api/admin/servicios aparece como activo=false
    const rListarDesact = await api('/admin/servicios', { token: adminToken });
    const srvEnListaAdmin = rListarDesact.data.find(s => s.id === idSrvNuevo);
    assert(srvEnListaAdmin && srvEnListaAdmin.activo === false, '6.4 En listado admin se visualiza claramente el estado inactivo');

    // 6.5 Comprobar que en GET /api/servicios público NO aparece el servicio desactivado
    const rListarPublico = await api('/servicios');
    const srvEnListaPublica = rListarPublico.data.find(s => s.id === idSrvNuevo);
    assert(!srvEnListaPublica, '6.5 El servicio desactivado NO aparece en GET /api/servicios para usuarios');

    // 6.6 Comprobar que intentar solicitar turno para el servicio desactivado es rechazado
    const rTurnoServInactivo = await api('/turnos', {
      method: 'POST',
      token: regularToken,
      body: {
        servicioId: idSrvNuevo,
        modalidad: 'cita',
        fecha: '2026-11-20',
        hora: '10:00',
        motivo: 'Intento con servicio inactivo'
      }
    });
    assert(
      rTurnoServInactivo.status === 400 &&
      (rTurnoServInactivo.data.error.includes('activo') || rTurnoServInactivo.data.error.includes('no existe')),
      '6.6 POST /api/turnos rechaza agendamiento sobre servicio inactivo',
      rTurnoServInactivo
    );

    // 6.7 Reactivación del servicio
    const rReactivar = await api(`/admin/servicios/${idSrvNuevo}/estado`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: true }
    });
    assert(rReactivar.status === 200 && rReactivar.data.activo === true, '6.7 Reactivación exitosa responde 200 y activo=true');

    // 6.8 Comprobar que vuelve a aparecer en listado público
    const rListarPublicoReactivado = await api('/servicios');
    const srvReactivadoPublico = rListarPublicoReactivado.data.find(s => s.id === idSrvNuevo);
    assert(srvReactivadoPublico && srvReactivadoPublico.activo !== false, '6.8 El servicio reactivado vuelve a estar disponible para el público');

    // -------------------------------------------------------------
    // BLOQUE 7: Conservación del Historial de Turnos de Servicios Desactivados
    // -------------------------------------------------------------
    console.log('\n--- BLOQUE 7: Conservación del Historial de Turnos ---');

    // Crear un segundo servicio de prueba con turnos históricos
    const rSrvHist = await api('/admin/servicios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Servicio Historial ${Date.now()}`,
        codigo_prefijo: 'HIS',
        modalidad: 'cita',
        duracion_estimada_min: 30,
        requiere_tema: false,
        descripcion: 'Servicio para validar preservación de auditoría histórica.'
      }
    });
    const srvHistId = rSrvHist.data.id;
    if (srvHistId) serviciosCreados.push(srvHistId);

    // Insertar turno asociado a este servicio para el usuario regular
    const [turnoHist] = await conn.execute(
      `INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo)
       VALUES (?, ?, 'cita', '2026-11-18', '09:00:00', 'confirmado', 'HIS-099', 'Trámite histórico de prueba')`,
      [regularUsuario.id, srvHistId]
    );
    const turnoHistId = turnoHist.insertId;
    turnosCreados.push(turnoHistId);

    // Desactivar el servicio que tiene el turno asociado
    const rDesactivarHist = await api(`/admin/servicios/${srvHistId}/estado`, {
      method: 'PATCH',
      token: adminToken,
      body: { activo: false }
    });
    assert(rDesactivarHist.status === 200, '7.1 Servicio con turnos asociados desactivado exitosamente sin error referencial');

    // Consultar turnos del usuario regular: el turno debe seguir existiendo y tener el nombre del servicio
    const rTurnosUsuario = await api('/turnos', { token: regularToken });
    const turnoConsultado = rTurnosUsuario.data.find(t => t.id === turnoHistId);
    assert(Boolean(turnoConsultado), '7.2 El turno histórico del usuario se conserva en la consulta de historial');
    assert(turnoConsultado && turnoConsultado.servicio.includes('Historial'), '7.3 El JOIN con servicios continúa resolviendo el nombre del servicio desactivado');

    // Consultar resumen administrativo: el turno histórico sigue contabilizándose y consultándose
    const rAdminResumen = await api('/admin/resumen', { token: adminToken });
    assert(rAdminResumen.status === 200, '7.4 GET /api/admin/resumen consulta sin errores existiendo servicios desactivados');

    // Verificar directamente en BD que el registro en turnos permanece intacto
    const [[turnoEnDb]] = await conn.execute('SELECT id, servicio_id, estado, codigo_turno FROM turnos WHERE id = ?', [turnoHistId]);
    assert(turnoEnDb && turnoEnDb.servicio_id === srvHistId && turnoEnDb.codigo_turno === 'HIS-099', '7.5 La integridad referencial y de datos del turno histórico en BD se mantiene intacta');

  } finally {
    // -------------------------------------------------------------
    // LIMPIEZA ESTRICTA
    // -------------------------------------------------------------
    console.log('\n--- LIMPIEZA DE DATOS DE PRUEBA ---');
    if (turnosCreados.length > 0) {
      const placeholdersT = turnosCreados.map(() => '?').join(',');
      await conn.query(`DELETE FROM turnos WHERE id IN (${placeholdersT})`, turnosCreados);
      console.log(`✓ Turnos de prueba eliminados: ${turnosCreados.length}`);
    }

    if (serviciosCreados.length > 0) {
      const placeholdersS = serviciosCreados.map(() => '?').join(',');
      await conn.query(`DELETE FROM servicios WHERE id IN (${placeholdersS})`, serviciosCreados);
      console.log(`✓ Servicios de prueba eliminados: ${serviciosCreados.length}`);
    }

    await conn.execute('DELETE FROM usuarios WHERE id IN (?, ?)', [adminUsuario.id, regularUsuario.id]);
    console.log('✓ Usuarios de prueba eliminados.');

    server.close();
    await conn.end();
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL SERVICIOS: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal durante las pruebas de servicios:', err);
  process.exit(1);
});
