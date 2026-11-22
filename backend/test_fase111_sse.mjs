import http from 'http';
import { db } from './src/db.js';
import { crearToken } from './src/auth.js';

let serverProcess = null;

async function runTests() {
  console.log('--- TEST FASE 1.11: LÍMITE DE CONEXIONES SSE Y HELMET ---');

  // Create mock tokens for user 3 and user 4
  const tokenUser3 = crearToken({ id: 3, rol: 'cliente', auth_version: 1 });
  const tokenUser4 = crearToken({ id: 4, rol: 'cliente', auth_version: 1 });

  const connectSSE = (token) => {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/notificaciones/stream',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => {
          rawData += chunk;
        });
        resolve({ req, res, getBody: () => rawData });
      });
      req.on('error', reject);
      req.end();
    });
  };

  const connectionsUser3 = [];
  try {
    // 1. Conexiones 1 a 5 para usuario 3
    console.log('\n[1-5] Abriendo 5 conexiones para usuario ID 3...');
    for (let i = 1; i <= 5; i++) {
      const conn = await connectSSE(tokenUser3);
      connectionsUser3.push(conn);
      console.log(` Conexión #${i}: Status = ${conn.res.statusCode}, Content-Type = ${conn.res.headers['content-type']}`);
      if (conn.res.statusCode !== 200) throw new Error(`Conexión ${i} falló con status ${conn.res.statusCode}`);
    }

    // 2. Conexión 6 para usuario 3 (debe fallar con 429)
    console.log('\n[6] Intentando 6ta conexión para usuario ID 3 (espera 429)...');
    const conn6 = await connectSSE(tokenUser3);
    await new Promise(r => setTimeout(r, 200));
    console.log(` Conexión #6: Status = ${conn6.res.statusCode}`);
    console.log(` Body = ${conn6.getBody()}`);
    if (conn6.res.statusCode !== 429) {
      throw new Error(`Conexión 6 esperada 429 pero obtuvo ${conn6.res.statusCode}`);
    }

    // 3. Conexión para otro usuario (ID 4) debe ser aceptada (límites independientes)
    console.log('\n[7] Intentando conexión para usuario ID 4 (espera 200)...');
    const connUser4 = await connectSSE(tokenUser4);
    console.log(` Conexión Usuario 4: Status = ${connUser4.res.statusCode}`);
    if (connUser4.res.statusCode !== 200) {
      throw new Error(`Conexión Usuario 4 esperada 200 pero obtuvo ${connUser4.res.statusCode}`);
    }
    connUser4.req.destroy();

    // 4. Liberar una conexión de usuario 3 y volver a intentar
    console.log('\n[8] Cerrando conexión #1 de usuario 3 para liberar cupo...');
    connectionsUser3[0].req.destroy();
    await new Promise(r => setTimeout(r, 300)); // Esperar evento close

    console.log(' Intentando nueva conexión para usuario ID 3 tras liberar cupo...');
    const connReintentar = await connectSSE(tokenUser3);
    console.log(` Conexión nueva: Status = ${connReintentar.res.statusCode}`);
    if (connReintentar.res.statusCode !== 200) {
      throw new Error(`Reintento esperado 200 pero obtuvo ${connReintentar.res.statusCode}`);
    }
    connectionsUser3.push(connReintentar);

    // 5. Probar autenticación inválida en SSE
    console.log('\n[9] Intentando conexión con token inválido (espera 401)...');
    const connInvalido = await connectSSE('token_falso_invalido');
    console.log(` Conexión Inválida: Status = ${connInvalido.res.statusCode}`);
    if (connInvalido.res.statusCode !== 401) {
      throw new Error(`Conexión inválida esperada 401 pero obtuvo ${connInvalido.res.statusCode}`);
    }

    console.log('\n✅ TODAS LAS PRUEBAS DE LÍMITE SSE PASARON EXITOSAMENTE');
  } finally {
    // Cerrar todas las conexiones activas
    for (const c of connectionsUser3) {
      try { c.req.destroy(); } catch {}
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

// Iniciar servidor si no está corriendo
import('./src/server.js').then(async () => {
  await new Promise(r => setTimeout(r, 1000));
  try {
    await runTests();
  } catch (err) {
    console.error('Error en pruebas:', err);
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
});
