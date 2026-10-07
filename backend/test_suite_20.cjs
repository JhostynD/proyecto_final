const mysql = require('./node_modules/mysql2/promise');
const dotenv = require('./node_modules/dotenv');
dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

async function run() {
  console.log('====================================================');
  console.log('SUITE DE PRUEBAS AUTOMATIZADAS — 20 CASOS FILA CERO');
  console.log('====================================================\n');

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
  }

  // Conexión directa a MySQL para datos y fecha
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'turnos_db'
  });

  const fechaHoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const fechaFutura = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  const fechaFuturaManana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const fechaConcurrente = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10);

  // Limpiar datos de pruebas previas para garantizar idempotencia
  await conn.execute("DELETE FROM turnos WHERE fecha IN (?, ?, ?) OR codigo_turno LIKE 'A-09%'", [fechaFutura, fechaFuturaManana, fechaConcurrente]);

  // Crear o loguear usuarios de prueba
  const ts = Date.now();
  const u1Email = `cliente1_${ts}@banco.com`;
  const u2Email = `cliente2_${ts}@banco.com`;

  const reg1 = await request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Carlos Cliente', correo: u1Email, contraseña: 'password123' })
  });
  const token1 = reg1.data.token;
  const user1Id = reg1.data.usuario.id;

  const reg2 = await request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Diana Cliente', correo: u2Email, contraseña: 'password123' })
  });
  const token2 = reg2.data.token;
  const user2Id = reg2.data.usuario.id;

  // Asegurar usuario admin
  const [[adminRow]] = await conn.query("SELECT id, correo FROM usuarios WHERE rol = 'admin' LIMIT 1");
  let tokenAdmin;
  if (adminRow) {
    // Generar token para admin existente
    const jwt = require('./node_modules/jsonwebtoken');
    tokenAdmin = jwt.sign(
      { id: adminRow.id, nombre: 'Administrador Banco', rol: 'admin' },
      process.env.JWT_SECRET || 'clave_secreta_para_desarrollo',
      { expiresIn: '8h' }
    );
  }

  // 1. Crear turno virtual
  const r1 = await request('/turnos', {
    method: 'POST',
    token: token1,
    body: JSON.stringify({
      servicioId: 2, // Soporte Técnico (modalidad: 'turno')
      modalidad: 'turno'
    })
  });
  assert(r1.status === 201 && r1.data.modalidad === 'turno' && r1.data.estado === 'en_espera' && r1.data.codigo_turno.includes('-'),
    `Prueba 1: Crear turno virtual inmediato (Código: ${r1.data.codigo_turno}, Estado: ${r1.data.estado})`);
  const turnoVirtual1Id = r1.data.id;

  // 2. Crear cita
  const r2 = await request('/turnos', {
    method: 'POST',
    token: token1,
    body: JSON.stringify({
      servicioId: 1, // Asesoría de Crédito (30 min)
      modalidad: 'cita',
      fecha: fechaFutura,
      hora: '10:00',
      motivo: 'Solicitud de Crédito de Vivienda'
    })
  });
  assert(r2.status === 201 && r2.data.modalidad === 'cita' && r2.data.estado === 'confirmado' && r2.data.codigo_turno.includes('-'),
    `Prueba 2: Crear cita programada (Código: ${r2.data.codigo_turno}, Fecha: ${r2.data.fecha}, Hora: ${r2.data.hora})`);
  const cita1Id = r2.data.id;

  // 3. Intentar reservar horario ocupado
  const r3 = await request('/turnos', {
    method: 'POST',
    token: token2,
    body: JSON.stringify({
      servicioId: 1,
      modalidad: 'cita',
      fecha: fechaFutura,
      hora: '10:00',
      motivo: 'Otro crédito'
    })
  });
  assert(r3.status === 409, `Prueba 3: Intentar reservar horario ocupado es rechazado con 409 (${r3.data.error})`);

  // 4. Intentar reservar horario pasado para hoy
  const r4 = await request('/turnos', {
    method: 'POST',
    token: token1,
    body: JSON.stringify({
      servicioId: 1,
      modalidad: 'cita',
      fecha: fechaHoyBogota,
      hora: '06:00', // Las 06:00 ya pasaron hoy en Colombia
      motivo: 'Asesoría urgente'
    })
  });
  assert(r4.status === 400, `Prueba 4: Intentar reservar horario pasado para hoy es rechazado con 400 (${r4.data.error})`);

  // 5. Reservar cita para hoy (con horario futuro si aún hay en horario bancario o slot simulado)
  // Consultar disponibilidad para hoy
  const rDisp = await request(`/turnos/disponibilidad?fecha=${fechaHoyBogota}&servicioId=1`, { token: token1 });
  let citaHoyId;
  if (rDisp.data.horarios_disponibles && rDisp.data.horarios_disponibles.length > 0) {
    const horaFuturaHoy = rDisp.data.horarios_disponibles[0];
    const r5 = await request('/turnos', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        servicioId: 1,
        modalidad: 'cita',
        fecha: fechaHoyBogota,
        hora: horaFuturaHoy,
        motivo: 'Cita para hoy'
      })
    });
    assert(r5.status === 201, `Prueba 5: Reservar cita para hoy en horario futuro disponible (${horaFuturaHoy})`);
    citaHoyId = r5.data.id;
  } else {
    // Si la hora laboral bancaria ya pasó hoy, comprobamos que el endpoint reporte correctamente que no hay horarios
    assert(rDisp.data.quedan_horarios === false, `Prueba 5: Disponibilidad de hoy detecta correctamente fin de jornada bancaria (${rDisp.data.mensaje})`);
  }

  // 6. Reservar cita para fecha futura
  const r6 = await request('/turnos', {
    method: 'POST',
    token: token1,
    body: JSON.stringify({
      servicioId: 4, // Asesoría Financiera
      modalidad: 'cita',
      fecha: fechaFuturaManana,
      hora: '14:00',
      motivo: 'Inversión CDT'
    })
  });
  assert(r6.status === 201 && r6.data.fecha === fechaFuturaManana,
    `Prueba 6: Reservar cita para fecha futura confirmada (${r6.data.fecha} a las ${r6.data.hora})`);
  const citaMananaId = r6.data.id;

  // 7. Check-in válido dentro de la ventana
  // Insertamos temporalmente en MySQL una cita para hoy con hora dentro de los 30 min para probar check-in exacto
  const horaActualBogota = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  const [hNow, mNow] = horaActualBogota.split(':').map(Number);
  // hora 10 min en el futuro (dentro de los 30 min de ventana)
  const mCitaValida = (hNow * 60 + mNow + 10);
  const horaCitaVentana = `${String(Math.floor(mCitaValida / 60)).padStart(2, '0')}:${String(mCitaValida % 60).padStart(2, '0')}:00`;

  const [resInsertCheckin] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo) VALUES (?, 1, 'cita', ?, ?, 'confirmado', 'A-099', 'Prueba Checkin')",
    [user1Id, fechaHoyBogota, horaCitaVentana]
  );
  const turnoVentanaId = resInsertCheckin.insertId;

  const r7 = await request(`/turnos/${turnoVentanaId}/checkin`, { method: 'PATCH', token: token1 });
  assert(r7.status === 200 && r7.data.ok === true, `Prueba 7: Check-in válido dentro de ventana de 30 min ejecutado exitosamente`);

  // 8. Check-in demasiado temprano (más de 30 min antes)
  const mCitaTemprana = (hNow * 60 + mNow + 120); // 2 horas en el futuro
  const horaCitaTemprana = `${String(Math.floor(mCitaTemprana / 60)).padStart(2, '0')}:${String(mCitaTemprana % 60).padStart(2, '0')}:00`;
  const [resInsertTemprano] = await conn.execute(
    "INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno, motivo) VALUES (?, 1, 'cita', ?, ?, 'confirmado', 'A-098', 'Prueba Temprano')",
    [user1Id, fechaHoyBogota, horaCitaTemprana]
  );
  const turnoTempranoId = resInsertTemprano.insertId;

  const r8 = await request(`/turnos/${turnoTempranoId}/checkin`, { method: 'PATCH', token: token1 });
  assert(r8.status === 400 && r8.data.error.includes('30 minutos antes'),
    `Prueba 8: Check-in demasiado temprano es bloqueado con 400 (${r8.data.error})`);

  // 9. Check-in para fecha futura
  const r9 = await request(`/turnos/${citaMananaId}/checkin`, { method: 'PATCH', token: token1 });
  assert(r9.status === 400 && r9.data.error.includes('el día de tu cita'),
    `Prueba 9: Check-in para fecha futura es bloqueado con 400 (${r9.data.error})`);

  // 10. Ver personas por delante
  // Creamos otro turno virtual para User 2 en el mismo servicio (Soporte Técnico)
  const r10_crear = await request('/turnos', {
    method: 'POST',
    token: token2,
    body: JSON.stringify({ servicioId: 2, modalidad: 'turno' })
  });
  const turnoVirtual2Id = r10_crear.data.id;

  // Consultar estado de User 2
  const r10_estado = await request(`/turnos/${turnoVirtual2Id}/estado`, { token: token2 });
  assert(r10_estado.status === 200 && r10_estado.data.personas_antes >= 1,
    `Prueba 10: Conteo real de personas por delante detectado (${r10_estado.data.personas_antes} personas antes)`);

  // 11. Ver tiempo estimado
  assert(r10_estado.data.tiempo_estimado_min > 0 && r10_estado.data.mensaje.includes('min'),
    `Prueba 11: Cálculo de tiempo estimado real calculado (~${r10_estado.data.tiempo_estimado_min} minutos)`);

  // 12. Administrador llama siguiente
  const r12 = await request('/admin/cola/llamar-siguiente', {
    method: 'POST',
    token: tokenAdmin,
    body: JSON.stringify({ modulo: 'Módulo 3', servicioId: 2 })
  });
  assert(r12.status === 200 && r12.data.turno.estado === 'llamando' && r12.data.turno.modulo === 'Módulo 3',
    `Prueba 12: Administrador llama siguiente en cola (Turno ${r12.data.turno.codigo_turno} al Módulo 3)`);
  const turnoLlamadoId = r12.data.turno.id;

  // 13. Transición llamando -> en_atencion
  const r13 = await request(`/admin/turnos/${turnoLlamadoId}`, {
    method: 'PATCH',
    token: tokenAdmin,
    body: JSON.stringify({ estado: 'en_atencion' })
  });
  assert(r13.status === 200 && r13.data.estado === 'en_atencion',
    `Prueba 13: Transición de estado llamando -> en_atencion completada`);

  // 14. Transición en_atencion -> completado
  const r14 = await request(`/admin/turnos/${turnoLlamadoId}`, {
    method: 'PATCH',
    token: tokenAdmin,
    body: JSON.stringify({ estado: 'completado' })
  });
  assert(r14.status === 200 && r14.data.estado === 'completado',
    `Prueba 14: Transición de estado en_atencion -> completado realizada exitosamente`);

  // 15. Transición a no_presentado
  // Llamamos al siguiente en cola (User 2)
  const r15_llamar = await request('/admin/cola/llamar-siguiente', {
    method: 'POST',
    token: tokenAdmin,
    body: JSON.stringify({ modulo: 'Módulo 1', servicioId: 2 })
  });
  const turnoLlamado2Id = r15_llamar.data.turno.id;
  const r15_noPres = await request(`/admin/turnos/${turnoLlamado2Id}`, {
    method: 'PATCH',
    token: tokenAdmin,
    body: JSON.stringify({ estado: 'no_presentado' })
  });
  assert(r15_noPres.status === 200 && r15_noPres.data.estado === 'no_presentado',
    `Prueba 15: Transición de turno a no_presentado completada correctamente`);

  // 16. Cancelación de turno por el usuario
  const r16 = await request(`/turnos/${cita1Id}/cancelar`, {
    method: 'PATCH',
    token: token1
  });
  assert(r16.status === 200 && r16.data.ok === true, `Prueba 16: Cancelación de turno solicitada por el usuario exitosa`);

  // 17. Usuario intentando consultar turno de otro usuario (403)
  const r17 = await request(`/turnos/${citaMananaId}/estado`, {
    token: token2 // Token de Diana intentando ver turno de Carlos
  });
  assert(r17.status === 403, `Prueba 17: Protección de privacidad entre usuarios verificada con 403 (${r17.data.error})`);

  // 18. Usuario normal intentando acceder a endpoints administrativos (403)
  const r18 = await request('/admin/cola', { token: token1 });
  assert(r18.status === 403, `Prueba 18: Protección de endpoints administrativos contra usuarios normales verificada con 403 (${r18.data.error})`);

  // 19. Dos solicitudes simultáneas para el mismo horario (Concurrencia con bloqueo FOR UPDATE)
  const [pA, pB] = await Promise.all([
    request('/turnos', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: fechaConcurrente, hora: '11:00', motivo: 'Concurrencia A' })
    }),
    request('/turnos', {
      method: 'POST',
      token: token2,
      body: JSON.stringify({ servicioId: 1, modalidad: 'cita', fecha: fechaConcurrente, hora: '11:00', motivo: 'Concurrencia B' })
    })
  ]);
  const statuses = [pA.status, pB.status].sort();
  assert(statuses[0] === 201 && statuses[1] === 409,
    `Prueba 19: Concurrencia transaccional bloquea doble reserva (Uno obtuvo 201, el otro 409 con mensaje de solapamiento)`);

  // 20. Persistencia real en MySQL comprobable
  const [[dbCheck]] = await conn.query('SELECT id, codigo_turno, estado, modalidad FROM turnos WHERE id = ?', [turnoLlamadoId]);
  assert(dbCheck && dbCheck.estado === 'completado' && dbCheck.codigo_turno && dbCheck.modalidad,
    `Prueba 20: Persistencia real en disco de MySQL verificada (ID ${dbCheck?.id}: Estado=${dbCheck?.estado}, Código=${dbCheck?.codigo_turno}, Modalidad=${dbCheck?.modalidad})`);

  await conn.end();

  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passed} PASADAS / ${failed} FALLIDAS (Total 20)`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
