import http from 'http';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // fallback

process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'clave_secreta_para_pruebas_de_verificacion_12345';
}

const TEST_PORT = 3388;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function main() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS: VERIFICACIÓN DE CORREO ELECTRÓNICO (BACKEND)');
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

  // 1. Configuración de BD de pruebas (fila_cero_test)
  const testDbName = process.env.DB_NAME_TEST || 'fila_cero_test';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST_TEST || 'localhost',
    port: Number(process.env.DB_PORT_TEST || 3306),
    user: process.env.DB_USER_TEST || 'root',
    password: process.env.DB_PASSWORD_TEST || '',
    database: testDbName,
    multipleStatements: true
  });

  // Asegurar esquema esperado en BD de prueba
  await conn.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS correo_verificado TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS verificacion_enviada_en DATETIME NULL,
      ADD COLUMN IF NOT EXISTS contrasena_cambiada_en DATETIME NULL;

    DROP TABLE IF EXISTS _tokens_verif_backup;
    CREATE TABLE IF NOT EXISTS tokens_verificacion (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expira_en DATETIME NOT NULL,
      usado TINYINT(1) NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tv_hash_activo (token_hash, usado, expira_en),
      INDEX idx_tv_usuario_activo (usuario_id, usado),
      INDEX idx_tv_expira (expira_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Montar servidor express de pruebas
  const { app } = await import('./src/server.js');
  const { resetearLimitador, resetearLimitadorReenvio, hashearToken } = await import('./src/auth.js');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  // Helper para llamadas HTTP
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
    // Limpiar datos de prueba previos
    await conn.query("DELETE FROM tokens_verificacion WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE '%@testverif.com')");
    await conn.query("DELETE FROM usuarios WHERE correo LIKE '%@testverif.com'");
    resetearLimitador();
    resetearLimitadorReenvio();

    // ── BLOQUE 1: Registro de cuenta nueva y no entrega de JWT ────────
    console.log('--- BLOQUE 1: Registro de Cuenta Nueva y Seguridad ---');
    const resReg = await api('/auth/registro', {
      method: 'POST',
      body: {
        nombre: 'Carlos Mendoza',
        correo: 'carlos@testverif.com',
        contraseña: 'password123'
      }
    });

    assert(resReg.status === 201, 'Registro exitoso devuelve HTTP 201');
    assert(resReg.data.token === undefined, 'Seguridad: NO se entrega token JWT a una cuenta no verificada');
    assert(resReg.data.ok === true, 'Respuesta indica ok: true');
    assert(typeof resReg.data.mensaje === 'string', 'Contiene mensaje informativo para el usuario');
    assert(resReg.data.correo && resReg.data.correo.includes('***'), 'El correo en la respuesta está enmascarado (PII protegido)');

    // Verificar en BD que correo_verificado = 0
    const [[userDb]] = await conn.execute(
      'SELECT id, nombre, correo, correo_verificado FROM usuarios WHERE correo = ?',
      ['carlos@testverif.com']
    );
    assert(userDb && userDb.correo_verificado === 0, 'La cuenta nueva se crea con correo_verificado = 0');

    // ── BLOQUE 2: Creación del Token y Almacenamiento Seguro del Hash ──
    console.log('\n--- BLOQUE 2: Creación de Token y Hash SHA-256 ---');
    const [tokens] = await conn.execute(
      'SELECT id, usuario_id, token_hash, expira_en, usado FROM tokens_verificacion WHERE usuario_id = ?',
      [userDb.id]
    );

    assert(tokens.length === 1, 'Se generó exactamente un token de verificación para el usuario');
    const tokenDb = tokens[0];
    assert(tokenDb.token_hash && tokenDb.token_hash.length === 64, 'El token almacenado es un hash SHA-256 de 64 caracteres hex');
    assert(/^[a-f0-9]{64}$/i.test(tokenDb.token_hash), 'El formato del hash es hexadecimal válido');
    assert(tokenDb.usado === 0, 'El token se crea con usado = 0');

    const tiempoVencimientoMs = new Date(tokenDb.expira_en).getTime() - Date.now();
    const horasVencimiento = tiempoVencimientoMs / (1000 * 60 * 60);
    assert(horasVencimiento > 23 && horasVencimiento <= 24.1, 'El vencimiento del token está configurado a 24 horas');

    // ── BLOQUE 3: Bloqueo de Login para Cuentas No Verificadas (HTTP 403) ──
    console.log('\n--- BLOQUE 3: Bloqueo de Login sin Verificar ---');
    resetearLimitador('carlos@testverif.com');
    const resLoginNoVerif = await api('/auth/login', {
      method: 'POST',
      body: {
        correo: 'carlos@testverif.com',
        contraseña: 'password123'
      }
    });

    assert(resLoginNoVerif.status === 403, 'Login de usuario no verificado devuelve HTTP 403');
    assert(resLoginNoVerif.data.token === undefined, 'No se entrega JWT a usuario sin verificar');
    assert(resLoginNoVerif.data.noVerificado === true, 'Respuesta indica noVerificado: true');
    assert(resLoginNoVerif.data.error.includes('verificar tu correo'), 'Mensaje de error orienta al usuario a verificar su correo');

    // ── BLOQUE 4: Login de Usuarios Antiguos (Verificados) ────────────
    console.log('\n--- BLOQUE 4: Acceso de Usuarios Antiguos / Verificados ---');
    const passHashAntiguo = await bcrypt.hash('claveAntigua123', 8);
    await conn.execute(
      'INSERT INTO usuarios (nombre, correo, contraseña, rol, activo, correo_verificado) VALUES (?, ?, ?, ?, 1, 1)',
      ['Usuario Antiguo', 'antiguo@testverif.com', passHashAntiguo, 'usuario']
    );

    resetearLimitador('antiguo@testverif.com');
    const resLoginAntiguo = await api('/auth/login', {
      method: 'POST',
      body: {
        correo: 'antiguo@testverif.com',
        contraseña: 'claveAntigua123'
      }
    });

    assert(resLoginAntiguo.status === 200, 'Usuario verificado inicia sesión con HTTP 200');
    assert(typeof resLoginAntiguo.data.token === 'string' && resLoginAntiguo.data.token.length > 20, 'Se entrega JWT válido a usuario verificado');
    assert(resLoginAntiguo.data.usuario.correo === undefined, 'Principio de mínima exposición de datos');

    // ── BLOQUE 5: Verificación Correcta mediante Token ────────────────
    console.log('\n--- BLOQUE 5: Proceso de Verificación Exitosa ---');
    // Generar un token plano conocido para verificar
    const tokenPlanoValido = crypto.randomBytes(32).toString('hex');
    const tokenHashValido = hashearToken(tokenPlanoValido);
    const expiraEnValido = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Asignarlo a carlos@testverif.com
    await conn.execute('UPDATE tokens_verificacion SET usado = 1 WHERE usuario_id = ?', [userDb.id]);
    await conn.execute(
      'INSERT INTO tokens_verificacion (usuario_id, token_hash, expira_en, usado) VALUES (?, ?, ?, 0)',
      [userDb.id, tokenHashValido, expiraEnValido]
    );

    const resVerif = await api(`/auth/verificar-correo?token=${tokenPlanoValido}`);
    assert(resVerif.status === 200, 'Verificación con token válido devuelve HTTP 200');
    assert(resVerif.data.ok === true, 'Respuesta indica ok: true');
    assert(resVerif.data.mensaje.includes('verificado exitosamente'), 'Mensaje confirma verificación exitosa');

    // Comprobar estado en BD
    const [[userVerificadoDb]] = await conn.execute(
      'SELECT correo_verificado FROM usuarios WHERE id = ?',
      [userDb.id]
    );
    assert(userVerificadoDb.correo_verificado === 1, 'Base de datos: correo_verificado fue actualizado a 1');

    const [[tokenConsumidoDb]] = await conn.execute(
      'SELECT usado FROM tokens_verificacion WHERE token_hash = ?',
      [tokenHashValido]
    );
    assert(tokenConsumidoDb.usado === 1, 'Base de datos: el token fue marcado como usado = 1');

    // Ahora el usuario debe poder iniciar sesión normalmente
    resetearLimitador('carlos@testverif.com');
    const resLoginYaVerif = await api('/auth/login', {
      method: 'POST',
      body: {
        correo: 'carlos@testverif.com',
        contraseña: 'password123'
      }
    });
    assert(resLoginYaVerif.status === 200, 'Usuario recién verificado ahora inicia sesión con HTTP 200');
    assert(typeof resLoginYaVerif.data.token === 'string', 'Recibe su token JWT correctamente');

    // ── BLOQUE 6: Token Reutilizado ──────────────────────────────────
    console.log('\n--- BLOQUE 6: Protección contra Token Reutilizado ---');
    const resReutilizado = await api(`/auth/verificar-correo?token=${tokenPlanoValido}`);
    assert(resReutilizado.status === 400, 'Intento de reutilizar token devuelve HTTP 400');
    assert(resReutilizado.data.error.includes('ya fue utilizado'), 'Mensaje indica que el enlace ya fue consumido');

    // ── BLOQUE 7: Tokens Inválidos o Malformados ─────────────────────
    console.log('\n--- BLOQUE 7: Rechazo de Tokens Inválidos ---');
    const resSinToken = await api('/auth/verificar-correo');
    assert(resSinToken.status === 400, 'Petición sin token devuelve HTTP 400');

    const resMalformado = await api('/auth/verificar-correo?token=tokenCorto123');
    assert(resMalformado.status === 400, 'Token con formato inválido devuelve HTTP 400');

    const tokenInexistente = crypto.randomBytes(32).toString('hex');
    const resInexistente = await api(`/auth/verificar-correo?token=${tokenInexistente}`);
    assert(resInexistente.status === 400, 'Token inexistente devuelve HTTP 400');
    assert(resInexistente.data.error.includes('no es válido o no existe'), 'Mensaje seguro sin revelar detalles');

    // ── BLOQUE 8: Token Vencido ──────────────────────────────────────
    console.log('\n--- BLOQUE 8: Rechazo de Tokens Vencidos ---');
    const tokenVencidoPlano = crypto.randomBytes(32).toString('hex');
    const tokenVencidoHash = hashearToken(tokenVencidoPlano);
    // Vencido hace 2 horas
    const fechaVencida = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Crear otro usuario para probar token vencido
    const passHashNuevo = await bcrypt.hash('pass123456', 8);
    const [resUserVencido] = await conn.execute(
      'INSERT INTO usuarios (nombre, correo, contraseña, rol, activo, correo_verificado) VALUES (?, ?, ?, ?, 1, 0)',
      ['Usuario Vencido', 'vencido@testverif.com', passHashNuevo, 'usuario']
    );

    await conn.execute(
      'INSERT INTO tokens_verificacion (usuario_id, token_hash, expira_en, usado) VALUES (?, ?, ?, 0)',
      [resUserVencido.insertId, tokenVencidoHash, fechaVencida]
    );

    const resTokenVencido = await api(`/auth/verificar-correo?token=${tokenVencidoPlano}`);
    assert(resTokenVencido.status === 400, 'Token vencido devuelve HTTP 400');
    assert(resTokenVencido.data.error.includes('ha expirado'), 'Mensaje indica expiración del token');

    const [[userVencidoDb]] = await conn.execute(
      'SELECT correo_verificado FROM usuarios WHERE id = ?',
      [resUserVencido.insertId]
    );
    assert(userVencidoDb.correo_verificado === 0, 'La cuenta permanece como no verificada (correo_verificado = 0)');

    // ── BLOQUE 9: Reenvío de Verificación y Anti-Enumeración ──────────
    console.log('\n--- BLOQUE 9: Reenvío de Verificación y Seguridad ---');
    resetearLimitadorReenvio();

    // Reenvío para cuenta pendiente no verificada
    const resReenvioValido = await api('/auth/reenviar-verificacion', {
      method: 'POST',
      body: { correo: 'vencido@testverif.com' }
    });
    assert(resReenvioValido.status === 200, 'Reenvío para cuenta pendiente devuelve HTTP 200');
    assert(typeof resReenvioValido.data.mensaje === 'string', 'Mensaje genérico y seguro retornado');

    // Comprobar que el token vencido anterior quedó marcado como usado
    const [[tokenAntiguoUsado]] = await conn.execute(
      'SELECT usado FROM tokens_verificacion WHERE token_hash = ?',
      [tokenVencidoHash]
    );
    assert(tokenAntiguoUsado.usado === 1, 'El token anterior fue invalidado (usado = 1) al solicitar reenvío');

    // Comprobar que se generó un nuevo token para el usuario
    const [tokensVencidoNuevos] = await conn.execute(
      'SELECT id, token_hash, usado, expira_en FROM tokens_verificacion WHERE usuario_id = ? AND usado = 0',
      [resUserVencido.insertId]
    );
    assert(tokensVencidoNuevos.length === 1, 'Existe un nuevo token activo en tokens_verificacion');

    // Anti-enumeración: Reenvío con correo inexistente
    const resReenvioInexistente = await api('/auth/reenviar-verificacion', {
      method: 'POST',
      body: { correo: 'noexiste9999@testverif.com' }
    });
    assert(resReenvioInexistente.status === 200, 'Correo inexistente devuelve HTTP 200 (sin revelar inexistencia)');
    assert(resReenvioInexistente.data.mensaje === resReenvioValido.data.mensaje, 'El mensaje para correo inexistente es IDÉNTICO al de correo existente');

    // Anti-enumeración: Reenvío para cuenta ya verificada
    const resReenvioYaVerif = await api('/auth/reenviar-verificacion', {
      method: 'POST',
      body: { correo: 'carlos@testverif.com' }
    });
    assert(resReenvioYaVerif.status === 200, 'Cuenta ya verificada devuelve HTTP 200 (sin filtrar estado)');
    assert(resReenvioYaVerif.data.mensaje === resReenvioValido.data.mensaje, 'El mensaje para cuenta ya verificada es IDÉNTICO (previene enumeración)');

    // ── BLOQUE 10: Manejo Seguro cuando EMAIL_ENABLED está deshabilitado
    console.log('\n--- BLOQUE 10: Comportamiento Seguro con Correo Deshabilitado ---');
    const emailEnabledOriginal = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';
    const resRegEmailOff = await api('/auth/registro', {
      method: 'POST',
      body: {
        nombre: 'Diana Ramos',
        correo: 'diana@testverif.com',
        contraseña: 'password456'
      }
    });

    assert(resRegEmailOff.status === 201, 'Registro exitoso aunque EMAIL_ENABLED=false (HTTP 201)');
    assert(resRegEmailOff.data.correoEnviado === false, 'Indica correoEnviado: false sin lanzar excepción no controlada');
    assert(resRegEmailOff.data.token === undefined, 'No se entrega JWT');

    // Restaurar estado de la variable de entorno
    process.env.EMAIL_ENABLED = emailEnabledOriginal;

    const [[userDiana]] = await conn.execute(
      'SELECT id, correo_verificado FROM usuarios WHERE correo = ?',
      ['diana@testverif.com']
    );
    assert(userDiana && userDiana.correo_verificado === 0, 'La cuenta de Diana fue creada como no verificada');

    // Comprobar que Diana puede solicitar reenvío posteriormente sin conflicto ER_DUP_ENTRY
    resetearLimitadorReenvio();
    const resReenvioDiana = await api('/auth/reenviar-verificacion', {
      method: 'POST',
      body: { correo: 'diana@testverif.com' }
    });
    assert(resReenvioDiana.status === 200, 'Diana puede solicitar reenvío posteriormente sin error de duplicidad');

    // ── BLOQUE 11: Esquema Incompleto y Consistencia Transaccional (HTTP 503) ──
    console.log('\n--- BLOQUE 11: Esquema Incompleto y Consistencia Transaccional (HTTP 503) ---');
    // Renombrar temporalmente la tabla tokens_verificacion para simular falta de migración
    await conn.query('RENAME TABLE tokens_verificacion TO _tokens_verif_backup');

    try {
      resetearLimitador();
      const resSinMigracion = await api('/auth/registro', {
        method: 'POST',
        body: {
          nombre: 'Incompleto Test',
          correo: 'incompleto@testverif.com',
          contraseña: 'password789'
        }
      });

      assert(resSinMigracion.status === 503, 'Registro sin esquema de migración devuelve HTTP 503');
      assert(!resSinMigracion.data.token, 'Seguridad: NO se entrega JWT cuando el esquema está incompleto');
      assert(resSinMigracion.data.error.includes('mantenimiento de base de datos'), 'Mensaje controlado al usuario sin exponer detalles internos');
      assert(!resSinMigracion.data.error.includes('tokens_verificacion') && !resSinMigracion.data.error.includes('ER_NO_SUCH_TABLE'), 'No revela nombres de tablas, columnas ni códigos SQL al cliente');

      // Verificar consistencia atómica: NINGUNA cuenta incompleta fue creada
      const [[userIncompletoDb]] = await conn.execute(
        'SELECT id FROM usuarios WHERE correo = ?',
        ['incompleto@testverif.com']
      );
      assert(!userIncompletoDb, 'Consistencia transaccional: rollback garantizado, la cuenta NO fue creada en la base de datos');

      // Reenvío sin esquema también debe responder HTTP 503 controlado
      resetearLimitadorReenvio();
      await conn.execute("UPDATE usuarios SET verificacion_enviada_en = NULL WHERE correo = 'diana@testverif.com'");
      const resReenvioSinMigracion = await api('/auth/reenviar-verificacion', {
        method: 'POST',
        body: { correo: 'diana@testverif.com' }
      });
      assert(resReenvioSinMigracion.status === 503, 'Reenvío sin esquema devuelve HTTP 503');
      assert(!resReenvioSinMigracion.data.error.includes('tokens_verificacion'), 'Reenvío no revela detalles internos en error 503');

      // Verificación con token sin esquema también debe responder HTTP 503
      const tokenFake = crypto.randomBytes(32).toString('hex');
      const resVerifSinMigracion = await api(`/auth/verificar-correo?token=${tokenFake}`);
      assert(resVerifSinMigracion.status === 503, 'Verificación sin esquema devuelve HTTP 503');
      assert(!resVerifSinMigracion.data.error.includes('tokens_verificacion'), 'Verificación no revela detalles internos en error 503');

    } finally {
      // Restaurar tabla tokens_verificacion
      await conn.query('RENAME TABLE _tokens_verif_backup TO tokens_verificacion');
    }

  } finally {
    // Limpieza final de registros de prueba
    try {
      await conn.query("DELETE FROM tokens_verificacion WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE '%@testverif.com')");
      await conn.query("DELETE FROM usuarios WHERE correo LIKE '%@testverif.com'");
    } catch {}
    await conn.end();
    server.close();
    try {
      const { db } = await import('./src/db.js');
      await db.end();
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASADAS / ${failed} FALLIDAS (Total ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal durante la suite de pruebas:', err);
  process.exit(1);
});
