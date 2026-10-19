import mysql from 'mysql2/promise';
import 'dotenv/config';

const esTest = process.env.NODE_ENV === 'test';
const dbName = esTest
  ? (process.env.DB_NAME_TEST || process.env.TEST_DB_NAME || 'fila_cero_test')
  : (process.env.DB_NAME || 'turnos_db');

export const db = mysql.createPool({
  host: (esTest ? process.env.DB_HOST_TEST : null) || process.env.DB_HOST || 'localhost',
  port: Number((esTest ? process.env.DB_PORT_TEST : null) || process.env.DB_PORT || 3306),
  user: (esTest ? process.env.DB_USER_TEST : null) || process.env.DB_USER || 'root',
  password: (esTest ? process.env.DB_PASSWORD_TEST : null) || process.env.DB_PASSWORD || '',
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

