import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { db } from './db.js';
import { autenticar, crearToken, soloAdmin } from './auth.js';

const app = express();
const puerto = Number(process.env.PORT || 3000);
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

const fechaHoy = () => new Date().toISOString().slice(0, 10);
const estadosAdmin = new Set(['confirmado', 'cancelado', 'completado']);
const horaValida = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const fechaValida = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(fechaParseada.getTime()) && fechaParseada.toISOString().slice(0, 10) === fecha;
};

app.get('/api/salud', async (_req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true, mensaje: 'API disponible' });
});

app.post('/api/auth/registro', async (req, res) => {
  const nombre = req.body.nombre?.trim();
  const correo = req.body.correo?.trim().toLowerCase();
  const contraseña = req.body.contraseña;
  if (!nombre || !correo || !contraseña || contraseña.length < 6) return res.status(400).json({ error: 'Nombre, correo y contraseña de mínimo 6 caracteres son obligatorios.' });
  try {
    const hash = await bcrypt.hash(contraseña, 10);
    const [result] = await db.execute('INSERT INTO usuarios (nombre, correo, contraseña) VALUES (?, ?, ?)', [nombre, correo, hash]);
    const usuario = { id: result.insertId, nombre, rol: 'usuario' };
    res.status(201).json({ token: crearToken(usuario), usuario });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const correo = req.body.correo?.trim().toLowerCase();
  const contraseña = req.body.contraseña || '';
  const [[usuario]] = await db.execute('SELECT id, nombre, correo, contraseña, rol FROM usuarios WHERE correo = ?', [correo]);
  if (!usuario || !(await bcrypt.compare(contraseña, usuario.contraseña))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  const datos = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  res.json({ token: crearToken(datos), usuario: datos });
});

app.get('/api/auth/perfil', autenticar, async (req, res) => {
  const [[usuario]] = await db.execute('SELECT id, nombre, correo, rol FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(usuario);
});

app.get('/api/servicios', async (_req, res) => {
  const [servicios] = await db.query('SELECT id, nombre FROM servicios WHERE activo = TRUE ORDER BY nombre');
  res.json(servicios);
});

app.get('/api/turnos/disponibilidad', autenticar, async (req, res) => {
  const fecha = req.query.fecha;
  if (!fechaValida(fecha) || fecha < fechaHoy()) return res.status(400).json({ error: 'Indica una fecha válida.' });
  const [ocupados] = await db.execute("SELECT TIME_FORMAT(hora, '%H:%i') AS hora FROM turnos WHERE fecha = ? AND estado IN ('pendiente', 'confirmado')", [fecha]);
  res.json({ fecha, ocupados: ocupados.map((turno) => turno.hora) });
});

app.get('/api/turnos', autenticar, async (req, res) => {
  const [turnos] = await db.execute(`SELECT t.id, s.nombre AS servicio, t.fecha, TIME_FORMAT(t.hora, '%H:%i') AS hora, t.estado
    FROM turnos t JOIN servicios s ON s.id = t.servicio_id
    WHERE t.usuario_id = ? ORDER BY t.fecha ASC, t.hora ASC`, [req.usuario.id]);
  res.json(turnos);
});

app.post('/api/turnos', autenticar, async (req, res) => {
  const { servicioId, fecha, hora } = req.body;
  if (!Number.isInteger(servicioId) || !fechaValida(fecha) || !horaValida.test(hora) || fecha < fechaHoy()) return res.status(400).json({ error: 'Servicio, fecha futura y hora válida son obligatorios.' });
  try {
    const [result] = await db.execute('INSERT INTO turnos (usuario_id, servicio_id, fecha, hora) VALUES (?, ?, ?, ?)', [req.usuario.id, servicioId, fecha, hora]);
    res.status(201).json({ id: result.insertId, mensaje: 'Turno solicitado correctamente.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese horario ya está ocupado.' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'El servicio no existe.' });
    throw error;
  }
});

app.patch('/api/turnos/:id/cancelar', autenticar, async (req, res) => {
  const [result] = await db.execute("UPDATE turnos SET estado = 'cancelado' WHERE id = ? AND usuario_id = ? AND estado IN ('pendiente', 'confirmado')", [req.params.id, req.usuario.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'El turno no existe o no puede cancelarse.' });
  res.json({ mensaje: 'Turno cancelado.' });
});

app.get('/api/admin/resumen', autenticar, soloAdmin, async (_req, res) => {
  const [[usuarios]] = await db.query('SELECT COUNT(*) AS total FROM usuarios');
  const [estados] = await db.query('SELECT estado, COUNT(*) AS total FROM turnos GROUP BY estado');
  const [turnos] = await db.query(`SELECT t.id, u.nombre AS usuario, s.nombre AS servicio, t.fecha, TIME_FORMAT(t.hora, '%H:%i') AS hora, t.estado
    FROM turnos t JOIN usuarios u ON u.id = t.usuario_id JOIN servicios s ON s.id = t.servicio_id
    ORDER BY t.fecha DESC, t.hora DESC`);
  res.json({ usuarios: usuarios.total, estados, turnos });
});

app.get('/api/admin/usuarios', autenticar, soloAdmin, async (_req, res) => {
  const [usuarios] = await db.query('SELECT id, nombre, correo, rol, creado_en FROM usuarios ORDER BY creado_en DESC');
  res.json(usuarios);
});

app.patch('/api/admin/turnos/:id', autenticar, soloAdmin, async (req, res) => {
  const { estado } = req.body;
  if (!estadosAdmin.has(estado)) return res.status(400).json({ error: 'Estado no permitido.' });
  const [result] = await db.execute('UPDATE turnos SET estado = ? WHERE id = ?', [estado, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Turno no encontrado.' });
  res.json({ mensaje: 'Estado actualizado.' });
});

app.delete('/api/admin/usuarios/:id', autenticar, soloAdmin, async (req, res) => {
  if (Number(req.params.id) === req.usuario.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  const [result] = await db.execute('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ mensaje: 'Usuario eliminado.' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(puerto, () => console.log(`API disponible en http://localhost:${puerto}`));
