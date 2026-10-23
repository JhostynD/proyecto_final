/**
 * test_estadisticas.cjs
 * Suite de pruebas para el endpoint GET /api/admin/estadisticas
 */
'use strict';
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const http = require('http');

process.env.NODE_ENV = 'test';
dotenv.config();

const TEST_PORT = 3499;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function run() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: ESTADÍSTICAS ADMINISTRATIVAS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`\u2713 [PAS\u00D3] ${message}`);
      passed++;
    } else {
      console.error(`\u2717 [FALL\u00D3] ${message}`);
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

  const { app } = await import('./src/server.js');
  const { crearToken } = await import('./src/auth.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    };
    const res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  }

  const ID_ADMIN  = 8801;
  const ID_USRNO  = 8802;
  const ID_SERV_A = 1;

  const tokenAdmin   = crearToken({ id: ID_ADMIN,  rol: 'admin',   nombre: 'Est Admin' });
  const tokenUsuario = crearToken({ id: ID_USRNO,  rol: 'usuario', nombre: 'Est Usuario' });

  function hace(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  }
  const hoy    = hace(0);
  const ayer   = hace(1);
  const hace5  = hace(5);
  const hace10 = hace(10);

  try {
    const passHash = await bcrypt.hash('clave123', 8);
    await conn.query('DELETE FROM turnos WHERE usuario_id IN (8801, 8802)');
    await conn.query('DELETE FROM usuarios WHERE id IN (8801, 8802)');
    await conn.query(`INSERT INTO usuarios (id, nombre, correo, contrase\u00F1a, rol, activo) VALUES (${ID_ADMIN}, 'Est Admin', 'estadmin@test.com', '${passHash}', 'admin', 1), (${ID_USRNO}, 'Est User', 'estuser@test.com', '${passHash}', 'usuario', 1)`);

    await conn.execute(`INSERT INTO turnos (usuario_id, servicio_id, modalidad, fecha, hora, estado, codigo_turno) VALUES (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hoy}',   '09:00:00', 'completado',    'EST-001'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hoy}',   '10:00:00', 'completado',    'EST-002'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hoy}',   '11:00:00', 'cancelado',     'EST-003'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${ayer}',  '09:00:00', 'completado',    'EST-004'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${ayer}',  '10:00:00', 'no_presentado', 'EST-005'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hace5}', '09:00:00', 'completado',    'EST-006'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hace5}', '10:00:00', 'cancelado',     'EST-007'), (${ID_ADMIN}, ${ID_SERV_A}, 'turno', '${hace10}','09:00:00', 'en_espera',     'EST-008')`);

    // BLOQUE 1: Período predefinido 7d
    console.log('\n--- BLOQUE 1: Período predefinido 7 días ---');
    const res7d = await api('/admin/estadisticas?periodo=7d', { token: tokenAdmin });
    assert(res7d.status === 200, '1.1 Respuesta 200 OK con periodo=7d');
    assert(res7d.data.periodo?.desde && res7d.data.periodo?.hasta, '1.2 Respuesta incluye campo periodo con desde/hasta');
    assert(typeof res7d.data.kpi?.total === 'number', '1.3 kpi.total es un número');
    assert(Array.isArray(res7d.data.por_estado), '1.4 por_estado es un arreglo');
    assert(Array.isArray(res7d.data.por_dia), '1.5 por_dia es un arreglo');
    assert(Array.isArray(res7d.data.servicios_top), '1.6 servicios_top es un arreglo');

    const sumaEstados7d = res7d.data.por_estado.reduce((s, e) => s + e.total, 0);
    assert(sumaEstados7d === res7d.data.kpi.total, '1.7 Suma de por_estado == kpi.total (coherencia aritmética)');

    const kpi = res7d.data.kpi;
    const sumaSubKpis = kpi.pendientes + kpi.en_proceso + kpi.completados + kpi.cancelados + kpi.no_presentados;
    assert(sumaSubKpis === kpi.total, '1.8 Sub-KPIs suman exactamente kpi.total');

    // BLOQUE 2: Período 30d
    console.log('\n--- BLOQUE 2: Período 30 días ---');
    const res30d = await api('/admin/estadisticas?periodo=30d', { token: tokenAdmin });
    assert(res30d.status === 200, '2.1 Respuesta 200 OK con periodo=30d');
    assert(res30d.data.kpi.total >= res7d.data.kpi.total, '2.2 El período de 30d incluye al menos los mismos turnos que el de 7d');

    // BLOQUE 3: Rango personalizado
    console.log('\n--- BLOQUE 3: Rango de fechas personalizado ---');
    const resPers = await api(`/admin/estadisticas?desde=${hace5}&hasta=${hoy}`, { token: tokenAdmin });
    assert(resPers.status === 200, '3.1 Rango personalizado retorna 200 OK');
    assert(resPers.data.periodo.desde === hace5, '3.2 Respuesta refleja "desde" correcto');
    assert(resPers.data.periodo.hasta === hoy, '3.3 Respuesta refleja "hasta" correcto');
    assert(resPers.data.kpi.total <= res30d.data.kpi.total, '3.4 Rango reducido retorna igual o menos turnos que período mayor');

    // BLOQUE 4: Tasa de cancelación
    console.log('\n--- BLOQUE 4: Tasa de cancelación ---');
    const res90d = await api('/admin/estadisticas?periodo=90d', { token: tokenAdmin });
    assert(res90d.status === 200, '4.1 Respuesta 200 OK con periodo=90d');
    if (res90d.data.kpi.tasa_cancelacion !== null) {
      const tasa = res90d.data.kpi.tasa_cancelacion;
      assert(typeof tasa === 'number' && tasa >= 0 && tasa <= 100, '4.2 tasa_cancelacion está entre 0 y 100');
    } else {
      console.log('  i 4.2 tasa_cancelacion es null (sin turnos finalizados)');
      passed++;
    }
    assert(typeof res90d.data.kpi.formula_cancelacion === 'string', '4.3 Respuesta incluye campo formula_cancelacion');
    const k30 = res30d.data.kpi;
    const denManual = k30.cancelados + k30.completados + k30.no_presentados;
    if (denManual > 0) {
      const tasaEsperada = Math.round((k30.cancelados / denManual) * 1000) / 10;
      assert(k30.tasa_cancelacion === tasaEsperada, '4.4 tasa_cancelacion coincide con la formula');
    } else {
      assert(k30.tasa_cancelacion === null, '4.4 tasa_cancelacion es null cuando no hay turnos finalizados');
    }

    // BLOQUE 5: Intervalo vacío
    console.log('\n--- BLOQUE 5: Intervalo sin datos ---');
    const resFuturo = await api('/admin/estadisticas?desde=2090-01-01&hasta=2090-01-07', { token: tokenAdmin });
    assert(resFuturo.status === 200, '5.1 Rango sin turnos retorna 200 OK');
    assert(resFuturo.data.kpi.total === 0, '5.2 kpi.total es 0 para un intervalo sin datos');
    assert(resFuturo.data.por_estado.length === 0, '5.3 por_estado es arreglo vacío');
    assert(resFuturo.data.por_dia.length === 0, '5.4 por_dia es arreglo vacío');
    assert(resFuturo.data.servicios_top.length === 0, '5.5 servicios_top es arreglo vacío');
    assert(resFuturo.data.kpi.tasa_cancelacion === null, '5.6 tasa_cancelacion es null para intervalo vacío');

    // BLOQUE 6: Parámetros inválidos
    console.log('\n--- BLOQUE 6: Validación de parámetros ---');
    const resMalFmt = await api('/admin/estadisticas?desde=01-2026-01&hasta=2026-01-07', { token: tokenAdmin });
    assert(resMalFmt.status === 400, '6.1 Formato de fecha incorrecto retorna 400');
    assert(typeof resMalFmt.data.error === 'string', '6.2 Respuesta 400 incluye campo "error"');
    const resInv = await api('/admin/estadisticas?desde=2026-12-31&hasta=2026-01-01', { token: tokenAdmin });
    assert(resInv.status === 400, '6.3 desde > hasta retorna 400');
    const resLargo = await api('/admin/estadisticas?desde=2024-01-01&hasta=2026-01-01', { token: tokenAdmin });
    assert(resLargo.status === 400, '6.4 Rango mayor a 366 días retorna 400');

    // BLOQUE 7: Autorización
    console.log('\n--- BLOQUE 7: Autorización ---');
    const resSinToken = await api('/admin/estadisticas');
    assert(resSinToken.status === 401, '7.1 Sin token retorna 401 Unauthorized');
    const resNoAdmin = await api('/admin/estadisticas', { token: tokenUsuario });
    assert(resNoAdmin.status === 401 || resNoAdmin.status === 403, '7.2 Usuario sin rol admin retorna 401 o 403');

    // BLOQUE 8: Inyección SQL
    console.log('\n--- BLOQUE 8: Inyección SQL ---');
    const payloads = [
      "2026-01-01'; DROP TABLE turnos; --",
      '2026-01-01 OR 1=1',
      '2026-01-01\nUNION SELECT 1,2,3',
      "'; INSERT INTO usuarios VALUES(1,'hack','h@h.com','x','admin',NOW(),1); --"
    ];
    for (const [i, payload] of payloads.entries()) {
      const resInj = await api(`/admin/estadisticas?desde=${encodeURIComponent(payload)}&hasta=2026-12-31`, { token: tokenAdmin });
      assert(resInj.status === 400, `8.${i + 1} Inyección SQL rechazada (payload ${i + 1}): retorna 400`);
    }

    // BLOQUE 9: Estructura de respuesta
    console.log('\n--- BLOQUE 9: Estructura de respuesta ---');
    const resStruct = await api('/admin/estadisticas?periodo=30d', { token: tokenAdmin });
    const ds = resStruct.data;
    assert(typeof ds.periodo.desde === 'string', '9.1 periodo.desde es string');
    assert(typeof ds.periodo.hasta === 'string', '9.2 periodo.hasta es string');
    assert(typeof ds.kpi.usuarios_activos === 'number', '9.3 kpi.usuarios_activos es number');
    assert(ds.por_dia.every(x => typeof x.dia === 'string' && typeof x.total === 'number'), '9.4 por_dia tiene estructura {dia:string, total:number}');
    assert(ds.servicios_top.every(x => typeof x.servicio === 'string' && typeof x.total === 'number'), '9.5 servicios_top tiene estructura {servicio:string, total:number}');
    assert(ds.por_estado.every(x => typeof x.estado === 'string' && typeof x.total === 'number'), '9.6 por_estado tiene estructura {estado:string, total:number}');
    const dias = ds.por_dia.map(x => x.dia);
    const diasOrdenados = [...dias].sort();
    assert(JSON.stringify(dias) === JSON.stringify(diasOrdenados), '9.7 por_dia está ordenada cronológicamente (ASC)');

    // LIMPIEZA
    await conn.query('DELETE FROM turnos WHERE usuario_id IN (8801, 8802)');
    await conn.query('DELETE FROM usuarios WHERE id IN (8801, 8802)');

  } finally {
    server.close();
    await conn.end();
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL ESTADÍSTICAS: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en pruebas de estadísticas:', err);
  process.exit(1);
});
