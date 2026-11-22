/**
 * test_recuperacion_contrasena.mjs
 * Suite de pruebas de integración para el flujo de recuperación de contraseña en FILA CERO.
 *
 * Utiliza estrictamente la base de datos de pruebas (fila_cero_test).
 * Comprueba explícitamente que la base conectada sea fila_cero_test y NUNCA turnos_db.
 */

import http from 'http';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'clave_secreta_para_pruebas_recuperacion_12345';
}

const TEST_PORT = 3399;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function main() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: RECUPERACIÓN DE CONTRASEÑA (BACKEND)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASÓ] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FALLÓ] ${message}`);
      failed++;
    }
  }

  // 1. Conexión segura a la base de pruebas
  const testDbName = process.env.DB_NAME_TEST || 'fila_cero_test';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST_TEST || 'localhost',
    port: Number(process.env.DB_PORT_TEST || 3306),
    user: process.env.DB_USER_TEST || 'root',
    password: process.env.DB_PASSWORD_TEST || '',
    database: testDbName,
    multipleStatements: true
  });

  // Verificación estricta de aislamiento de base de datos
  const [[dbCheck]] = await conn.query('SELECT DATABASE() as db');
  if (dbCheck.db !== 'fila_cero_test') {
    console.error(`FATAL: La base de datos conectada es '${dbCheck.db}', se esperaba estrictamente 'fila_cero_test'. Abortando.`);
    process.exit(1);
  }
  assert(dbCheck.db === 'fila_cero_test', 'Aislamiento confirmado: la base de datos es fila_cero_test (turnos_db protegida)');

  // Asegurar esquema esperado en BD de prueba
  await conn.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS correo_verificado TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS verificacion_enviada_en DATETIME NULL,
      ADD COLUMN IF NOT EXISTS contrasena_cambiada_en DATETIME NULL,
      ADD COLUMN IF NOT EXISTS auth_version INT UNSIGNED NOT NULL DEFAULT 1;

    DROP TABLE IF EXISTS _tokens_recup_backup;
    CREATE TABLE IF NOT EXISTS tokens_recuperacion (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expira_en DATETIME NOT NULL,
      usado TINYINT(1) NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tr_hash_activo (token_hash, usado, expira_en),
      INDEX idx_tr_usuario_activo (usuario_id, usado),
      INDEX idx_tr_expira (expira_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Montar servidor express de pruebas
  const { app } = await import('./src/server.js');
  const { resetearLimitador, resetearLimitadorRecuperacion, hashearToken, crearToken } = await import('./src/auth.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
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
    // Limpieza inicial de datos previos de prueba
    await conn.query("DELETE FROM tokens_recuperacion WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE '%@testrecup.com')");
    await conn.query("DELETE FROM usuarios WHERE correo LIKE '%@testrecup.com'");
    resetearLimitador();
    resetearLimitadorRecuperacion();

    // ── PRUEBA 1: Solicitud con correo inexistente ───────────────────
    console.log('--- PRUEBA 1: Solicitud con correo inexistente ---');
    const resNoExiste = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'noexiste999@testrecup.com' }
    });
    assert(resNoExiste.status === 200, 'Correo inexistente devuelve HTTP 200 genérico');
    assert(resNoExiste.data.ok === true, 'Respuesta indica ok: true');
    assert(resNoExiste.data.mensaje.includes('Si la cuenta existe'), 'Mensaje seguro anti-enumeración');

    // ── PRUEBA 2: Solicitud con cuenta existente y activa (EMAIL_ENABLED=false) ─
    console.log('\n--- PRUEBA 2: Cuenta existente con EMAIL_ENABLED=false ---');
    const passInicialHash = await bcrypt.hash('claveInicial123', 8);
    const [userInsert] = await conn.execute(
      'INSERT INTO usuarios (nombre, correo, contraseña, rol, activo, correo_verificado, auth_version) VALUES (?, ?, ?, ?, 1, 1, 1)',
      ['Esteban Quito', 'esteban@testrecup.com', passInicialHash, 'usuario']
    );
    const estebanId = userInsert.insertId;

    process.env.EMAIL_ENABLED = 'false';
    const resEmailOff = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'esteban@testrecup.com' }
    });
    assert(resEmailOff.status === 200, 'Solicitud con EMAIL_ENABLED=false devuelve HTTP 200');
    assert(resEmailOff.data.mensaje.includes('Si la cuenta existe'), 'Mismo mensaje genérico');

    const [tokensEmailOff] = await conn.execute(
      'SELECT id FROM tokens_recuperacion WHERE usuario_id = ?',
      [estebanId]
    );
    assert(tokensEmailOff.length === 0, 'EMAIL_ENABLED=false: No se generan tokens en la BD');

    // ── PRUEBA 3: Solicitud con cuenta inactiva ──────────────────────
    console.log('\n--- PRUEBA 3: Cuenta inactiva ---');
    await conn.execute(
      'INSERT INTO usuarios (nombre, correo, contraseña, rol, activo, correo_verificado, auth_version) VALUES (?, ?, ?, ?, 0, 1, 1)',
      ['Usuario Inactivo', 'inactivo@testrecup.com', passInicialHash, 'usuario']
    );
    const resInactivo = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'inactivo@testrecup.com' }
    });
    assert(resInactivo.status === 200, 'Cuenta inactiva devuelve HTTP 200 idéntico');
    assert(resInactivo.data.mensaje.includes('Si la cuenta existe'), 'No revela si la cuenta está inactiva');

    // ── PRUEBA 4: Comportamiento ante Fallo Simulado de Correo (Operación Compensatoria) ─
    console.log('\n--- PRUEBA 4: Fallo de correo y Operación Compensatoria ---');
    // Pre-insertar un token anterior activo
    const tokenAnteriorPlano = crypto.randomBytes(32).toString('hex');
    const tokenAnteriorHash = hashearToken(tokenAnteriorPlano);
    await conn.execute(
      'INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en, usado, creado_en) VALUES (?, ?, NOW() + INTERVAL 30 MINUTE, 0, NOW() - INTERVAL 5 MINUTE)',
      [estebanId, tokenAnteriorHash]
    );

    // Simular fallo forzando credenciales SMTP no alcanzables temporalmente
    const smtpHostOriginal = process.env.SMTP_HOST;
    process.env.SMTP_HOST = '127.0.0.1'; // puerto 587 cerrado en localhost
    process.env.EMAIL_ENABLED = 'true';
    resetearLimitadorRecuperacion();

    const resFalloCorreo = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'esteban@testrecup.com' }
    });
    assert(resFalloCorreo.status === 200, 'Solicitud devuelve HTTP 200 genérico (anti-enumeración)');

    // Restaurar host SMTP
    process.env.SMTP_HOST = smtpHostOriginal;

    // Verificar en BD: el nuevo token generado que no se pudo enviar fue compensado (usado = 1)
    // y el token anterior sigue activo (usado = 0)
    const [tokensTrasFallo] = await conn.execute(
      'SELECT id, token_hash, usado FROM tokens_recuperacion WHERE usuario_id = ? ORDER BY id ASC',
      [estebanId]
    );
    assert(tokensTrasFallo.length === 2, 'Existen 2 registros de tokens para Esteban');
    const anterior = tokensTrasFallo[0];
    const nuevoCompensado = tokensTrasFallo[1];
    assert(anterior.token_hash === tokenAnteriorHash && anterior.usado === 0, 'El token anterior permanece ACTIVO (usado=0) al fallar el envío del nuevo');
    assert(nuevoCompensado.usado === 1, 'Operación compensatoria: El token nuevo no enviado fue invalidado (usado=1)');

    // ── PRUEBA 5: Cooldown de 2 minutos ──────────────────────────────
    console.log('\n--- PRUEBA 5: Cooldown de dos minutos anti-spam ---');
    // El nuevo token compensado fue creado hace pocos segundos (dentro de los 2 minutos)
    const resCooldown = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'esteban@testrecup.com' }
    });
    assert(resCooldown.status === 200, 'Petición dentro del cooldown devuelve HTTP 200 genérico');

    const [tokensTrasCooldown] = await conn.execute(
      'SELECT id FROM tokens_recuperacion WHERE usuario_id = ?',
      [estebanId]
    );
    assert(tokensTrasCooldown.length === 2, 'Cooldown: No se generó un nuevo token duplicado en ventana de 2 min');

    // ── PRUEBA 6: Límite por correo (3 cada 15 min) ──────────────────
    console.log('\n--- PRUEBA 6: Rate Limiting por Correo ---');
    resetearLimitadorRecuperacion();
    // Simular que el cooldown ya pasó actualizando creado_en a hace 5 min
    await conn.execute('UPDATE tokens_recuperacion SET creado_en = NOW() - INTERVAL 5 MINUTE WHERE usuario_id = ?', [estebanId]);

    // 1ra y 2da solicitudes
    await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'esteban@testrecup.com' } });
    await conn.execute('UPDATE tokens_recuperacion SET creado_en = NOW() - INTERVAL 5 MINUTE WHERE usuario_id = ?', [estebanId]);
    await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'esteban@testrecup.com' } });
    await conn.execute('UPDATE tokens_recuperacion SET creado_en = NOW() - INTERVAL 5 MINUTE WHERE usuario_id = ?', [estebanId]);

    // 3ra solicitud (llega al límite)
    const res3 = await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'esteban@testrecup.com' } });
    assert(res3.status === 200, 'Tercera solicitud dentro del límite permitida');

    // 4ta solicitud (supera límite)
    const res4 = await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'esteban@testrecup.com' } });
    assert(res4.status === 429, 'Cuarta solicitud bloqueada con HTTP 429');
    assert(res4.data.error.includes('Demasiadas solicitudes'), 'Mensaje de 429 claro e impersonal');

    // ── PRUEBA 7: Límite por IP (10 cada 15 min) ─────────────────────
    console.log('\n--- PRUEBA 7: Rate Limiting por IP ---');
    resetearLimitadorRecuperacion();
    // Consumir 10 solicitudes con correos diferentes desde la misma IP
    for (let i = 1; i <= 10; i++) {
      await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: `ip_test_${i}@testrecup.com` } });
    }
    const resIpExcedida = await api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'otro_ip@testrecup.com' } });
    assert(resIpExcedida.status === 429, 'Solicitud 11 desde la misma IP bloqueada con HTTP 429');

    // ── PRUEBA 8: Restablecimiento con Token Malformado o Inexistente ─
    console.log('\n--- PRUEBA 8: Tokens Malformados o Inexistentes ---');
    const resMalformado = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: 'corto123', contrasena: 'nuevaClave123' }
    });
    assert(resMalformado.status === 400, 'Token malformado (<64 hex) devuelve HTTP 400');

    const tokenInexistente = crypto.randomBytes(32).toString('hex');
    const resInexistente = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: tokenInexistente, contrasena: 'nuevaClave123' }
    });
    assert(resInexistente.status === 400, 'Token inexistente devuelve HTTP 400');

    // ── PRUEBA 9: Token Vencido ──────────────────────────────────────
    console.log('\n--- PRUEBA 9: Token Vencido ---');
    const tokenVencidoPlano = crypto.randomBytes(32).toString('hex');
    const tokenVencidoHash = hashearToken(tokenVencidoPlano);
    await conn.execute(
      'INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en, usado) VALUES (?, ?, NOW() - INTERVAL 10 MINUTE, 0)',
      [estebanId, tokenVencidoHash]
    );
    const resVencido = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: tokenVencidoPlano, contrasena: 'nuevaClave123' }
    });
    assert(resVencido.status === 400, 'Token vencido devuelve HTTP 400');

    // ── PRUEBA 10: Validación de longitud de contraseña ─────────────
    console.log('\n--- PRUEBA 10: Contraseña demasiado corta ---');
    const tokenValidoPlano = crypto.randomBytes(32).toString('hex');
    const tokenValidoHash = hashearToken(tokenValidoPlano);
    await conn.execute(
      'INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en, usado) VALUES (?, ?, NOW() + INTERVAL 30 MINUTE, 0)',
      [estebanId, tokenValidoHash]
    );

    const resCorta = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: tokenValidoPlano, contrasena: '123' }
    });
    assert(resCorta.status === 400, 'Contraseña menor a 6 caracteres rechazada con HTTP 400');
    assert(resCorta.data.error.includes('mínimo 6 caracteres'), 'Mensaje exige mínimo 6 caracteres');

    // ── PRUEBA 11: Restablecimiento Exitoso con Token Válido ─────────
    console.log('\n--- PRUEBA 11: Restablecimiento Exitoso y bcrypt ---');
    // Generar un JWT anterior a nombre de Esteban con auth_version = 1
    const jwtAnterior = crearToken({ id: estebanId, nombre: 'Esteban Quito', rol: 'usuario', auth_version: 1 });

    // Verificar que el JWT anterior funciona antes del cambio
    const resPerfilAntes = await api('/auth/perfil', {
      headers: { Authorization: `Bearer ${jwtAnterior}` }
    });
    assert(resPerfilAntes.status === 200, 'Sesión anterior válida antes de cambiar contraseña (HTTP 200)');

    // Restablecer contraseña con token válido
    const resResetOk = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: tokenValidoPlano, contrasena: 'superClaveSecreta99' }
    });
    assert(resResetOk.status === 200, 'Restablecimiento exitoso devuelve HTTP 200');
    assert(resResetOk.data.token === undefined, 'Seguridad: NO se entrega JWT automáticamente tras restablecer');

    // Verificar en BD: contraseña cifrada con bcrypt, auth_version incrementada, token marcado usado
    const [[estebanActualizado]] = await conn.execute(
      'SELECT contraseña, auth_version, contrasena_cambiada_en FROM usuarios WHERE id = ?',
      [estebanId]
    );
    const coincideNuevaClave = await bcrypt.compare('superClaveSecreta99', estebanActualizado.contraseña);
    assert(coincideNuevaClave === true, 'Nueva contraseña correctamente almacenada con hash bcrypt');
    assert(estebanActualizado.auth_version === 2, 'auth_version incrementó exactamente de 1 a 2');
    assert(estebanActualizado.contrasena_cambiada_en !== null, 'contrasena_cambiada_en registrada');

    const [[tokenConsumido]] = await conn.execute(
      'SELECT usado FROM tokens_recuperacion WHERE token_hash = ?',
      [tokenValidoHash]
    );
    assert(tokenConsumido.usado === 1, 'Token de recuperación marcado como usado = 1');

    // ── PRUEBA 12: Invalidación Global de Sesiones Anteriores (auth_version) ─
    console.log('\n--- PRUEBA 12: Invalidación de JWT Anteriores por auth_version ---');
    const resPerfilDespues = await api('/auth/perfil', {
      headers: { Authorization: `Bearer ${jwtAnterior}` }
    });
    assert(resPerfilDespues.status === 401, 'Sesión anterior rechazada con HTTP 401 por versión obsoleta');
    assert(resPerfilDespues.data.error.includes('expirado por cambio de contraseña'), 'Mensaje informa expiración por cambio de clave');

    // ── PRUEBA 13: Inicio de sesión posterior con nueva contraseña y versión 2 ─
    console.log('\n--- PRUEBA 13: Nuevo Login con auth_version = 2 ---');
    resetearLimitador('esteban@testrecup.com');
    const resNuevoLogin = await api('/auth/login', {
      method: 'POST',
      body: { correo: 'esteban@testrecup.com', contraseña: 'superClaveSecreta99' }
    });
    assert(resNuevoLogin.status === 200, 'Nuevo login con nueva clave exitoso (HTTP 200)');
    const nuevoJwt = resNuevoLogin.data.token;
    assert(typeof nuevoJwt === 'string', 'Se entrega nuevo JWT');

    // Probar que el nuevo JWT sí accede a rutas protegidas
    const resPerfilNuevoJwt = await api('/auth/perfil', {
      headers: { Authorization: `Bearer ${nuevoJwt}` }
    });
    assert(resPerfilNuevoJwt.status === 200, 'Nuevo JWT con auth_version=2 accede exitosamente a rutas protegidas');

    // ── PRUEBA 14: Intento de reutilizar el mismo token ──────────────
    console.log('\n--- PRUEBA 14: Intento de reutilización de token ---');
    const resReutilizar = await api('/auth/restablecer-contrasena', {
      method: 'POST',
      body: { token: tokenValidoPlano, contrasena: 'otraClave123456' }
    });
    assert(resReutilizar.status === 400, 'Token ya usado es rechazado con HTTP 400');

    // ── PRUEBA 15: Consumo concurrente del mismo token (SELECT FOR UPDATE) ─
    console.log('\n--- PRUEBA 15: Prevención de carreras / consumo concurrente ---');
    const tokenCarreraPlano = crypto.randomBytes(32).toString('hex');
    const tokenCarreraHash = hashearToken(tokenCarreraPlano);
    await conn.execute(
      'INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en, usado) VALUES (?, ?, NOW() + INTERVAL 30 MINUTE, 0)',
      [estebanId, tokenCarreraHash]
    );

    // Lanzar dos peticiones exactamente concurrentes con el mismo token
    const [resCarrera1, resCarrera2] = await Promise.all([
      api('/auth/restablecer-contrasena', { method: 'POST', body: { token: tokenCarreraPlano, contrasena: 'claveConcurrente1' } }),
      api('/auth/restablecer-contrasena', { method: 'POST', body: { token: tokenCarreraPlano, contrasena: 'claveConcurrente2' } })
    ]);

    const exitos = (resCarrera1.status === 200 ? 1 : 0) + (resCarrera2.status === 200 ? 1 : 0);
    const fallos = (resCarrera1.status === 400 ? 1 : 0) + (resCarrera2.status === 400 ? 1 : 0);
    assert(exitos === 1 && fallos === 1, 'Exactamente una petición tuvo éxito (200) y la otra fue rechazada (400) por bloqueo de fila');

    // ── PRUEBA 16: Concurrencia en Solicitud (SEC-01: Serialización SELECT FOR UPDATE) ─
    console.log('\n--- PRUEBA 16: Concurrencia en Solicitud y Bloqueo FOR UPDATE (SEC-01) ---');
    // Crear un usuario dedicado para la prueba de concurrencia de solicitud
    const passConc = await bcrypt.hash('passConcurrencia123', 8);
    const [userConc] = await conn.execute(
      'INSERT INTO usuarios (nombre, correo, contraseña, rol, activo, correo_verificado, auth_version) VALUES (?, ?, ?, ?, 1, 1, 1)',
      ['Carlos Concurrente', 'carlos_conc@testrecup.com', passConc, 'usuario']
    );
    const carlosId = userConc.insertId;

    resetearLimitadorRecuperacion();
    process.env.EMAIL_ENABLED = 'true';

    // Lanzar dos solicitudes simultáneas de recuperación para Carlos Concurrente
    const [resConcSol1, resConcSol2] = await Promise.all([
      api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'carlos_conc@testrecup.com' } }),
      api('/auth/olvide-contrasena', { method: 'POST', body: { correo: 'carlos_conc@testrecup.com' } })
    ]);

    assert(resConcSol1.status === 200 && resConcSol2.status === 200, 'Ambas solicitudes responden HTTP 200 genérico anti-enumeración');

    // Comprobar que en la base de datos se generó EXACTAMENTE UN token
    // La segunda petición fue retenida por SELECT ... FOR UPDATE hasta que la primera confirmó el nuevo token
    // y cuando la segunda evaluó el cooldown, encontró el token recién creado y no generó un segundo
    const [tokensCarlos] = await conn.execute(
      'SELECT id, token_hash, usado FROM tokens_recuperacion WHERE usuario_id = ?',
      [carlosId]
    );
    assert(tokensCarlos.length === 1, 'SEC-01 Serialización: Se generó exactamente 1 token para solicitudes simultáneas (cooldown respetado)');

    // ── PRUEBA 17: Preservación de Enlace y no invalidación cruzada (SEC-02) ──
    console.log('\n--- PRUEBA 17: Preservación de enlace previo y no invalidación cruzada (SEC-02) ---');
    // Simular que el token de Carlos fue creado hace 5 minutos (supera cooldown)
    await conn.execute('UPDATE tokens_recuperacion SET creado_en = NOW() - INTERVAL 5 MINUTE, usado = 0 WHERE id = ?', [tokensCarlos[0].id]);
    const tokenCarlosAnteriorId = tokensCarlos[0].id;

    // Lanzar nueva solicitud que fallará en el transporte SMTP (simulado con conexión rechazada a 127.0.0.1)
    const hostPrev = process.env.SMTP_HOST;
    process.env.SMTP_HOST = '127.0.0.1';
    resetearLimitadorRecuperacion();
    const resIntentoNuevo = await api('/auth/olvide-contrasena', {
      method: 'POST',
      body: { correo: 'carlos_conc@testrecup.com' }
    });
    assert(resIntentoNuevo.status === 200, 'Solicitud con envío fallido devuelve HTTP 200 genérico');
    process.env.SMTP_HOST = hostPrev;

    const [tokensCarlosTrasFallo] = await conn.execute(
      'SELECT id, usado FROM tokens_recuperacion WHERE usuario_id = ? ORDER BY id ASC',
      [carlosId]
    );
    assert(tokensCarlosTrasFallo.length === 2, 'Existen 2 tokens: el anterior y el nuevo compensado');
    const tokenAnteriorActivo = tokensCarlosTrasFallo.find(t => t.id === tokenCarlosAnteriorId);
    const tokenNuevoCompensado = tokensCarlosTrasFallo.find(t => t.id !== tokenCarlosAnteriorId);
    assert(tokenAnteriorActivo && tokenAnteriorActivo.usado === 0, 'SEC-02: El enlace anterior continúa ACTIVO (usado=0) porque el nuevo envío no se confirmó');
    assert(tokenNuevoCompensado && tokenNuevoCompensado.usado === 1, 'SEC-02: El token nuevo fallido fue marcado usado=1 mediante compensación');

  } finally {
    // Limpieza final de registros de prueba
    try {
      await conn.query("DELETE FROM tokens_recuperacion WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE '%@testrecup.com')");
      await conn.query("DELETE FROM usuarios WHERE correo LIKE '%@testrecup.com'");
    } catch {}
    await conn.end();
    server.close();
    try {
      const { db } = await import('./src/db.js');
      await db.end();
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL RECUPERACIÓN: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal durante la suite de recuperación:', err);
  process.exit(1);
});
