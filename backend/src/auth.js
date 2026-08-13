import jwt from 'jsonwebtoken';
import 'dotenv/config';

const secret = process.env.JWT_SECRET || 'solo_para_desarrollo_cambiar_en_produccion';

export function crearToken(usuario) {
  return jwt.sign({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, secret, { expiresIn: '8h' });
}

export function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  try {
    req.usuario = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  }
}

export function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores.' });
  return next();
}
