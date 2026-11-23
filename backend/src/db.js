import mysql from 'mysql2/promise';
import 'dotenv/config';

const esTest = process.env.NODE_ENV === 'test';
const esProd = process.env.NODE_ENV === 'production';

const dbName = esTest
  ? (process.env.DB_NAME_TEST || process.env.TEST_DB_NAME || 'fila_cero_test')
  : (process.env.DB_NAME || 'turnos_db');

// Validación obligatoria de credenciales en producción
if (esProd) {
  if (!process.env.DB_USER || process.env.DB_USER.trim() === '') {
    throw new Error('Error crítico de configuración: DB_USER es obligatorio en producción.');
  }
  // Prohíbe el usuario local sin calificar 'root' en producción; permite usuarios de TiDB Cloud tipo '<prefijo>.root'
  if (process.env.DB_USER.trim().toLowerCase() === 'root') {
    throw new Error('Error crítico de configuración: la aplicación no puede usar el usuario local root en producción. Utiliza el usuario de clúster asignado (ej. <prefijo>.root).');
  }
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.trim() === '') {
    throw new Error('Error crítico de configuración: DB_PASSWORD no puede estar vacía en producción.');
  }
  if (!process.env.DB_NAME || process.env.DB_NAME.trim() === '') {
    throw new Error('Error crítico de configuración: DB_NAME es obligatorio en producción.');
  }
}

export const db = mysql.createPool({
  host: (esTest ? process.env.DB_HOST_TEST : null) || process.env.DB_HOST || '127.0.0.1',
  port: Number((esTest ? process.env.DB_PORT_TEST : null) || process.env.DB_PORT || 3306),
  user: (esTest ? process.env.DB_USER_TEST : null) || process.env.DB_USER || 'root',
  password: (esTest ? process.env.DB_PASSWORD_TEST : null) || process.env.DB_PASSWORD || '',
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined
});
