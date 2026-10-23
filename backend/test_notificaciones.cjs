const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('http');

process.env.NODE_ENV = 'test';
dotenv.config();

const TEST_PORT = 3299;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: NOTIFICACIONES INTERNAS EN TIEMPO REAL (SSE)');
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

  // Asegurar esquema de notificaciones
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      turno_id INT UNSIGNED NULL,
      tipo_evento VARCHAR(50) NOT NULL,
      titulo VARCHAR(150) NOT NULL,
      mensaje TEXT NOT NULL,
      leido BOOLEAN NOT NULL DEFAULT FALSE,
      leido_en DATETIME NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notificaciones_usuario_leido (usuario_id, leido, creado_en),
      INDEX idx_notificaciones_turno (turno_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Montar servidor de pruebas
  const { app } = await import('./src/server.js');
  const { crearToken } = await import('./src/auth.js');
  const { esDiaHabil } = await import('./src/festivos_colombia.js');
  const { contarClientesConectados } = await import('./src/notificaciones.js');

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
    // Preparar usuarios de prueba aislados
    await conn.query('DELETE FROM notificaciones WHERE usuario_id IN (7701, 7702, 7703)');
    await conn.query('DELETE FROM turnos WHERE usuario_id IN (7701, 7702, 7703)');
    await conn.query('DELETE FROM sesiones_revocadas WHERE usuario_id IN (7701, 7702, 7703)');
    await conn.query('DELETE FROM usuarios WHERE id IN (7701, 7702, 7703)');

    const passHash = await bcrypt.hash('clave123', 8);
    await conn.query(`
      INSERT INTO usuarios (id, nombre, correo, contraseña, rol, activo) VALUES
        (7701, 'Usuario Notif 1', 'notif1@test.com', ?, 'usuario', 1),
        (7702, 'Usuario Notif 2', 'notif2@test.com', ?, 'usuario', 1),
        (7703, 'Admin Notif', 'adminnotif@test.com', ?, 'admin', 1)
    `, [passHash, passHash, passHash]);

    const tokenU1 = crearToken({ id: 7701, nombre: 'Usuario Notif 1', rol: 'usuario' });
    const tokenU2 = crearToken({ id: 7702, nombre: 'Usuario Notif 2', rol: 'usuario' });
    const tokenAdmin = crearToken({ id: 7703, nombre: 'Admin Notif', rol: 'admin' });

    // Encontrar fecha hábil para agendar citas
    let cursor = new Date();
    cursor.setDate(cursor.getDate() + 1);
    while (!esDiaHabil(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() + 1);
    }
    const fechaHabil = cursor.toISOString().slice(0, 10);

    // -------------------------------------------------------------
    // PRUEBA 1: Cada cambio de estado genera la notificación correspondiente
    // (confirmado al agendar cita, cancelado al cancelar, completado por admin)
    // -------------------------------------------------------------
    // A) Confirmado (agendar cita)
    const resCita = await api('/turnos', {
      method: 'POST',
      token: tokenU1,
      body: {
        servicioId: 1, // Asesoría de Crédito
        modalidad: 'cita',
        fecha: fechaHabil,
        hora: '09:00',
        motivo: 'Consulta hipotecaria'
      }
    });
    assert(resCita.status === 201 && resCita.data.estado === 'confirmado', '1.1 Cita agendada exitosamente en estado confirmado');

    const turno1Id = resCita.data.id;
    const [notifsConfirm] = await conn.query(
      'SELECT * FROM notificaciones WHERE usuario_id = 7701 AND turno_id = ? AND tipo_evento = "turno_confirmado"',
      [turno1Id]
    );
    assert(notifsConfirm.length === 1, '1.2 Se generó notificación de tipo "turno_confirmado" en MySQL para el propietario');

    // B) Completado (Admin cambia estado a en_atencion y luego completado)
    // Transición válida: confirmado -> en_espera -> llamando -> en_atencion -> completado
    await api(`/admin/turnos/${turno1Id}`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'en_espera' } });
    await api(`/admin/turnos/${turno1Id}`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'llamando', modulo: 'M-1' } });
    await api(`/admin/turnos/${turno1Id}`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'en_atencion' } });
    const resCompletar = await api(`/admin/turnos/${turno1Id}`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'completado' } });
    assert(resCompletar.status === 200 && resCompletar.data.estado === 'completado', '1.3 Turno completado por el administrador');

    const [notifsCompletado] = await conn.query(
      'SELECT * FROM notificaciones WHERE usuario_id = 7701 AND turno_id = ? AND tipo_evento = "turno_completado"',
      [turno1Id]
    );
    assert(notifsCompletado.length === 1, '1.4 Se generó notificación de tipo "turno_completado" en MySQL para el propietario');

    // C) Cancelado (agendar cita 2 y cancelarla)
    const resCita2 = await api('/turnos', {
      method: 'POST',
      token: tokenU1,
      body: {
        servicioId: 1,
        modalidad: 'cita',
        fecha: fechaHabil,
        hora: '11:00',
        motivo: 'Cancelación prueba'
      }
    });
    const turno2Id = resCita2.data.id;
    const resCancel = await api(`/turnos/${turno2Id}/cancelar`, { method: 'PATCH', token: tokenU1 });
    assert(resCancel.status === 200, '1.5 Turno cancelado por el usuario');

    const [notifsCancel] = await conn.query(
      'SELECT * FROM notificaciones WHERE usuario_id = 7701 AND turno_id = ? AND tipo_evento = "turno_cancelado"',
      [turno2Id]
    );
    assert(notifsCancel.length === 1, '1.6 Se generó notificación de tipo "turno_cancelado" en MySQL para el propietario');

    // -------------------------------------------------------------
    // PRUEBA 2: Repetir el mismo estado no crea notificación duplicada
    // -------------------------------------------------------------
    // Crear turno 3 y ponerlo en confirmado
    const resCita3 = await api('/turnos', {
      method: 'POST',
      token: tokenU1,
      body: {
        servicioId: 1,
        modalidad: 'cita',
        fecha: fechaHabil,
        hora: '14:00',
        motivo: 'Prueba no duplicación'
      }
    });
    const turno3Id = resCita3.data.id;
    const [antesRepetir] = await conn.query('SELECT COUNT(*) AS total FROM notificaciones WHERE turno_id = ?', [turno3Id]);

    // Admin intenta establecer de nuevo estado "confirmado" (mismo estado)
    await api(`/admin/turnos/${turno3Id}`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'confirmado' } });
    const [despuesRepetir] = await conn.query('SELECT COUNT(*) AS total FROM notificaciones WHERE turno_id = ?', [turno3Id]);
    assert(antesRepetir[0].total === despuesRepetir[0].total, '2. Repetir el mismo estado no genera notificación duplicada');

    // -------------------------------------------------------------
    // PRUEBA 3: Un usuario desconectado puede consultar sus notificaciones
    // (persistencia en MySQL y soporte de paginación)
    // -------------------------------------------------------------
    const resListado = await api('/notificaciones?pagina=1&limite=10', { token: tokenU1 });
    assert(resListado.status === 200 && Array.isArray(resListado.data.notificaciones), '3.1 Consulta de notificaciones persistidas retorna 200 y arreglo');
    assert(resListado.data.notificaciones.length >= 3, '3.2 El usuario recupera las notificaciones generadas mientras no estaba en la pantalla');
    assert(resListado.data.paginacion && resListado.data.paginacion.total >= 3, '3.3 Respuesta incluye metadata de paginación (total, pagina, limite)');

    // -------------------------------------------------------------
    // PRUEBA 4: Notificación en tiempo real vía SSE para usuario conectado
    // -------------------------------------------------------------
    let eventoSseRecibido = null;
    const controllerSSE = new AbortController();

    // Iniciar conexión SSE con http.request usando cabecera Bearer
    let reqSse = null;
    await new Promise((resolve) => {
      reqSse = http.request(`http://127.0.0.1:${TEST_PORT}/api/notificaciones/stream`, {
        headers: { Authorization: `Bearer ${tokenU2}` }
      }, (resStream) => {
        resStream.on('data', (chunk) => {
          const text = chunk.toString();
          if (text.includes('event: notificacion')) {
            const match = text.match(/data:\s*(\{.*\})/);
            if (match) {
              eventoSseRecibido = JSON.parse(match[1]);
            }
          }
        });
        resolve();
      });
      reqSse.end();
    });

    // Dar 100ms para asegurar registro en memoria
    await new Promise((r) => setTimeout(r, 100));
    assert(contarClientesConectados(7702) >= 1, '4.1 Conexión SSE autenticada registrada en memoria para Usuario 2');

    // Generar un cambio de estado para Usuario 2 (agendar cita)
    const resCitaU2 = await api('/turnos', {
      method: 'POST',
      token: tokenU2,
      body: {
        servicioId: 1,
        modalidad: 'cita',
        fecha: fechaHabil,
        hora: '15:00',
        motivo: 'SSE en vivo'
      }
    });

    // Esperar a que el stream capture el evento emitido
    let intentosSse = 0;
    while (!eventoSseRecibido && intentosSse < 25) {
      await new Promise((r) => setTimeout(r, 80));
      intentosSse++;
    }

    assert(
      eventoSseRecibido !== null && eventoSseRecibido.usuario_id === 7702 && eventoSseRecibido.tipo_evento === 'turno_confirmado',
      '4.2 Usuario conectado recibió notificación en vivo vía SSE sin recargar página'
    );
    if (reqSse) reqSse.destroy();

    // -------------------------------------------------------------
    // PRUEBA 5: Aislamiento entre usuarios (no puede consultar ni marcar ajenas)
    // -------------------------------------------------------------
    // Obtener ID de una notificación perteneciente a Usuario 1
    const notifU1Id = resListado.data.notificaciones[0].id;

    // Usuario 2 intenta marcar como leída la notificación de Usuario 1
    const resLecturaAjena = await api(`/notificaciones/${notifU1Id}/leer`, {
      method: 'PATCH',
      token: tokenU2
    });
    assert(resLecturaAjena.status === 404, '5.1 Usuario 2 no puede marcar como leída una notificación ajena (404 Not Found)');

    // Usuario 2 lista sus notificaciones y no debe ver ninguna de Usuario 1
    const resListadoU2 = await api('/notificaciones', { token: tokenU2 });
    const contieneAjenas = resListadoU2.data.notificaciones.some((n) => n.usuario_id !== 7702);
    assert(!contieneAjenas, '5.2 El listado de notificaciones filtra estrictamente por el usuario autenticado');

    // -------------------------------------------------------------
    // PRUEBA 6: Solicitudes no autenticadas son rechazadas con 401
    // -------------------------------------------------------------
    const resNoAuthList = await api('/notificaciones');
    const resNoAuthStream = await api('/notificaciones/stream');
    const resNoAuthLeer = await api('/notificaciones/1/leer', { method: 'PATCH' });
    const resNoAuthConteo = await api('/notificaciones/no-leidas/conteo');

    assert(
      resNoAuthList.status === 401 && resNoAuthStream.status === 401 && resNoAuthLeer.status === 401 && resNoAuthConteo.status === 401,
      '6. Todos los endpoints de notificaciones rechazan peticiones sin token con 401'
    );

    // -------------------------------------------------------------
    // PRUEBA 7: El contador de no leídas coincide con la base de datos
    // -------------------------------------------------------------
    const resConteoApi = await api('/notificaciones/no-leidas/conteo', { token: tokenU1 });
    const [[conteoDb]] = await conn.query('SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = 7701 AND leido = FALSE');
    assert(
      resConteoApi.status === 200 && resConteoApi.data.conteo === conteoDb.total,
      `7.1 Contador API (${resConteoApi.data.conteo}) coincide exactamente con la base de datos (${conteoDb.total})`
    );

    // Marcar una como leída y verificar que el contador decremente
    await api(`/notificaciones/${notifU1Id}/leer`, { method: 'PATCH', token: tokenU1 });
    const resConteoNuevo = await api('/notificaciones/no-leidas/conteo', { token: tokenU1 });
    assert(
      resConteoNuevo.data.conteo === conteoDb.total - 1,
      '7.2 Al marcar una notificación como leída, el contador se reduce en 1'
    );

    // Marcar todas como leídas
    const resLeerTodas = await api('/notificaciones/leer-todas', { method: 'PATCH', token: tokenU1 });
    assert(resLeerTodas.status === 200, '7.3 Endpoint leer-todas responde 200 OK');
    const resConteoCero = await api('/notificaciones/no-leidas/conteo', { token: tokenU1 });
    assert(resConteoCero.data.conteo === 0, '7.4 Contador de no leídas llega a 0 tras marcar todas como leídas');

    // -------------------------------------------------------------
    // PRUEBA 8: La reconexión no duplica notificaciones
    // -------------------------------------------------------------
    // Al consultar dos veces el listado de notificaciones, los IDs deben ser únicos
    const req1 = await api('/notificaciones', { token: tokenU1 });
    const req2 = await api('/notificaciones', { token: tokenU1 });
    const ids1 = req1.data.notificaciones.map((n) => n.id);
    const ids2 = req2.data.notificaciones.map((n) => n.id);
    const setIds = new Set([...ids1, ...ids2]);
    assert(
      setIds.size === ids1.length,
      '8. Consultas sucesivas y reconexiones mantienen IDs estables y únicos sin duplicación'
    );

    // -------------------------------------------------------------
    // PRUEBA 9: El cierre de sesión y aborto de stream libera conexiones
    // -------------------------------------------------------------
    const ctrlLogout = new AbortController();
    fetch(`${BASE_URL}/notificaciones/stream`, {
      headers: { Authorization: `Bearer ${tokenU1}` },
      signal: ctrlLogout.signal
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 80));

    const conectadosPre = contarClientesConectados(7701);
    assert(conectadosPre >= 1, '9.1 Cliente conectado antes del cierre');
    ctrlLogout.abort(); // Simular desconexión / logout del cliente
    await new Promise((r) => setTimeout(r, 80));

    const conectadosPost = contarClientesConectados(7701);
    assert(conectadosPost === 0, '9.2 Desconexión/cierre de sesión libera completamente los recursos en memoria');

    // -------------------------------------------------------------
    // PRUEBA 10: Vigencia de autenticación — Desconexión proactiva en logout
    // -------------------------------------------------------------
    const tokenLogoutTest = crearToken({ id: 7701, rol: 'usuario' });
    let eventosLogoutRecibidos = [];
    let streamCerradoPorLogout = false;

    const resStreamLogout = await fetch(`${BASE_URL}/notificaciones/stream`, {
      headers: { Authorization: `Bearer ${tokenLogoutTest}` }
    });
    assert(resStreamLogout.status === 200, '10.1 Stream abierto con token válido para prueba de logout');

    const readerLogout = resStreamLogout.body.getReader();
    const decoderLogout = new TextDecoder();

    // Iniciar lectura asíncrona del stream
    const promesaLecturaLogout = (async () => {
      try {
        while (true) {
          const { value, done } = await readerLogout.read();
          if (done) {
            streamCerradoPorLogout = true;
            break;
          }
          eventosLogoutRecibidos.push(decoderLogout.decode(value));
        }
      } catch {
        streamCerradoPorLogout = true;
      }
    })();

    // Esperar registro de la conexión
    await new Promise((r) => setTimeout(r, 60));
    assert(contarClientesConectados(7701) >= 1, '10.2 Cliente registrado en hub activo antes del logout');

    // Ejecutar logout
    const resLogout = await api('/auth/logout', { method: 'POST', token: tokenLogoutTest });
    assert(resLogout.status === 200, '10.3 Endpoint /auth/logout ejecutado exitosamente');

    // Esperar a que el stream se cierre por el servidor
    await promesaLecturaLogout;
    const textoRecibidoLogout = eventosLogoutRecibidos.join('');
    assert(
      textoRecibidoLogout.includes('event: sesion_cerrada') && textoRecibidoLogout.includes('logout'),
      '10.4 Stream SSE recibió evento sesion_cerrada con motivo logout'
    );
    assert(streamCerradoPorLogout, '10.5 El servidor cerró proactivamente el stream SSE tras el logout');
    assert(contarClientesConectados(7701) === 0, '10.6 El hub liberó los recursos del usuario tras el logout');

    // -------------------------------------------------------------
    // PRUEBA 11: Vigencia de autenticación — Desconexión proactiva al suspender cuenta
    // -------------------------------------------------------------
    const tokenSuspensionTest = crearToken({ id: 7702, rol: 'usuario' });
    let eventosSuspension = [];
    let streamCerradoPorSuspension = false;

    const resStreamSusp = await fetch(`${BASE_URL}/notificaciones/stream`, {
      headers: { Authorization: `Bearer ${tokenSuspensionTest}` }
    });
    assert(resStreamSusp.status === 200, '11.1 Stream abierto con token para prueba de suspensión');

    const readerSusp = resStreamSusp.body.getReader();
    const decoderSusp = new TextDecoder();

    const promesaLecturaSusp = (async () => {
      try {
        while (true) {
          const { value, done } = await readerSusp.read();
          if (done) {
            streamCerradoPorSuspension = true;
            break;
          }
          eventosSuspension.push(decoderSusp.decode(value));
        }
      } catch {
        streamCerradoPorSuspension = true;
      }
    })();

    await new Promise((r) => setTimeout(r, 60));
    assert(contarClientesConectados(7702) >= 1, '11.2 Cliente 7702 conectado antes de la suspensión');

    // Administrador suspende la cuenta del usuario 7702
    const resSusp = await api('/admin/usuarios/7702/estado', {
      method: 'PATCH',
      token: tokenAdmin,
      body: { activo: false }
    });
    assert(resSusp.status === 200, '11.3 Admin suspende usuario exitosamente (activo=false)');

    // Esperar a que el stream se cierre
    await promesaLecturaSusp;
    const textoSusp = eventosSuspension.join('');
    assert(
      textoSusp.includes('event: sesion_cerrada') && textoSusp.includes('cuenta_deshabilitada'),
      '11.4 Stream SSE recibió evento sesion_cerrada con motivo cuenta_deshabilitada'
    );
    assert(streamCerradoPorSuspension, '11.5 El servidor cerró proactivamente el stream SSE tras la suspensión');
    assert(contarClientesConectados(7702) === 0, '11.6 No quedan conexiones SSE activas para el usuario suspendido');

    // Reactivar usuario para limpieza posterior
    await api('/admin/usuarios/7702/estado', {
      method: 'PATCH',
      token: tokenAdmin,
      body: { activo: true }
    });

    // -------------------------------------------------------------
    // PRUEBA 12: Consistencia transaccional — Rollback no persiste ni emite eventos
    // -------------------------------------------------------------
    const tokenU1Fresh = crearToken({ id: 7701, rol: 'usuario' });
    let eventosTransaccionales = [];
    const ctrlU1Trans = new AbortController();

    const resStreamTrans = await fetch(`${BASE_URL}/notificaciones/stream`, {
      headers: { Authorization: `Bearer ${tokenU1Fresh}` },
      signal: ctrlU1Trans.signal
    });

    (async () => {
      try {
        const reader = resStreamTrans.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          eventosTransaccionales.push(decoder.decode(value));
        }
      } catch {}
    })();

    await new Promise((r) => setTimeout(r, 60));

    // Crear un turno de prueba
    const [turnoTransRes] = await conn.execute(`
      INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno)
      VALUES (7701, 1, 'cita', '2026-10-30', '11:00:00', 'en_espera', 'TR-ROLLBACK-TEST')
    `);
    const idTurnoRollback = turnoTransRes.insertId;

    const [conteoPreRollback] = await conn.execute(
      'SELECT COUNT(*) AS total FROM notificaciones WHERE turno_id = ?',
      [idTurnoRollback]
    );

    // Intentar actualización con un estado inválido o falla controlada
    const resUpdateFallido = await api(`/admin/turnos/${idTurnoRollback}`, {
      method: 'PATCH',
      token: tokenAdmin,
      body: { estado: 'estado_totalmente_invalido' }
    });
    assert(resUpdateFallido.status === 400, '12.1 Transición inválida rechazada con 400 Bad Request');

    // Esperar unos instantes para comprobar que nada se haya emitido
    await new Promise((r) => setTimeout(r, 100));

    const [conteoPostRollback] = await conn.execute(
      'SELECT COUNT(*) AS total FROM notificaciones WHERE turno_id = ?',
      [idTurnoRollback]
    );
    assert(
      conteoPreRollback[0].total === 0 && conteoPostRollback[0].total === 0,
      '12.2 En rollback o rechazo transaccional, NO se persiste ninguna fila en notificaciones'
    );

    const textoTrans = eventosTransaccionales.join('');
    assert(
      !textoTrans.includes('TR-ROLLBACK-TEST'),
      '12.3 En rollback o rechazo transaccional, NO se emite ningún evento SSE fantasma al cliente'
    );
    ctrlU1Trans.abort();

    // -------------------------------------------------------------
    // PRUEBA 13: Robustez del Parser ReadableStream (parsearBloquesSSE)
    // -------------------------------------------------------------
    const { parsearBloquesSSE } = await import('../frontend/src/lib/notificaciones.js');

    // Caso A: Mensaje dividido en fragmentos incompletos
    let bufferParser = "";
    const chunkA1 = "event: notificacion\ndata: {\"id\": 999, \"ti";
    const resA1 = parsearBloquesSSE(bufferParser, chunkA1);
    bufferParser = resA1.bufferRestante;
    assert(resA1.eventos.length === 0, '13.1 Chunk incompleto no genera eventos prematuros');
    assert(bufferParser === chunkA1, '13.2 Buffer almacena fielmente el fragmento incompleto');

    const chunkA2 = "tulo\": \"Prueba Fragmento\"}\n\n";
    const resA2 = parsearBloquesSSE(bufferParser, chunkA2);
    bufferParser = resA2.bufferRestante;
    assert(resA2.eventos.length === 1, '13.3 Al completarse el mensaje con segundo chunk, se emite exactamente 1 evento');
    assert(JSON.parse(resA2.eventos[0].data).id === 999, '13.4 El payload reconstruido es idéntico al original');
    assert(bufferParser === "", '13.5 El buffer queda vacío tras consumir el bloque completo');

    // Caso B: Múltiples eventos en un solo fragmento y comentarios keepalive
    const chunkB = ": keepalive\r\n\r\nevent: notificacion\r\ndata: {\"id\": 1001}\r\n\r\nevent: sesion_cerrada\r\ndata: {\"motivo\": \"logout\"}\r\n\r\n";
    const resB = parsearBloquesSSE("", chunkB);
    assert(resB.eventos.length === 2, '13.6 Parser procesa múltiples eventos y terminadores CRLF (\\r\\n\\r\\n) en un solo chunk');
    assert(resB.eventos[0].tipo === 'notificacion' && JSON.parse(resB.eventos[0].data).id === 1001, '13.7 Primer evento procesado correctamente');
    assert(resB.eventos[1].tipo === 'sesion_cerrada', '13.8 Segundo evento de control procesado correctamente');

    // Caso C: Un evento completo y un evento incompleto en el mismo chunk
    const chunkC = "event: notificacion\ndata: {\"id\": 1002}\n\nevent: notificacion\ndata: {\"id\": 10";
    const resC = parsearBloquesSSE("", chunkC);
    assert(resC.eventos.length === 1 && JSON.parse(resC.eventos[0].data).id === 1002, '13.9 Emite el evento completo');
    assert(resC.bufferRestante.includes('10'), '13.10 Retiene el remanente incompleto para el siguiente ciclo');

    // -------------------------------------------------------------
    // LIMPIEZA
    // -------------------------------------------------------------
    await conn.query('DELETE FROM notificaciones WHERE usuario_id IN (7701, 7702, 7703)');
    await conn.query('DELETE FROM turnos WHERE usuario_id IN (7701, 7702, 7703)');
    await conn.query('DELETE FROM usuarios WHERE id IN (7701, 7702, 7703)');

  } finally {
    server.close();
    await conn.end();
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL NOTIFICACIONES: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en pruebas de notificaciones:', err);
  process.exit(1);
});
