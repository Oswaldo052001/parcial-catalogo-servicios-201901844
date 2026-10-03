'use strict';
const express = require('express');
const { query } = require('../db/pool');
const { verificarPassword, hashParaComparacionFicticia } = require('../lib/password');
const sesiones = require('../services/sesiones');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();

// Límite de intentos fallidos: 5 por combinación IP + usuario en 15 minutos (en memoria del proceso).
const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS = 5;
const fallos = new Map();
const claveIntento = (req, usuario) => `${req.ip}|${usuario.toLowerCase()}`;
function bloqueado(clave) {
  const f = fallos.get(clave);
  if (!f) return false;
  if (Date.now() - f.desde > VENTANA_MS) { fallos.delete(clave); return false; }
  return f.n >= MAX_FALLOS;
}
function registrarFallo(clave) {
  const f = fallos.get(clave);
  if (!f || Date.now() - f.desde > VENTANA_MS) fallos.set(clave, { n: 1, desde: Date.now() });
  else f.n += 1;
}

// POST /api/auth/login  { usuario: "<username o correo>", password }
router.post('/login', async (req, res, next) => {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const password = String(req.body.password || '');
    if (!usuario || !password) return res.status(400).json({ error: 'Ingrese usuario o correo y contraseña.' });
    const clave = claveIntento(req, usuario);
    if (bloqueado(clave)) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.' });

    const { rows } = await query(
      'SELECT id, nombre, username, email, rol, activo, password_hash FROM usuario WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [usuario]);
    const u = rows[0];
    const ok = await verificarPassword(password, u ? u.password_hash : await hashParaComparacionFicticia());
    if (!u || !ok) {
      registrarFallo(clave);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    fallos.delete(clave);
    if (!u.activo) return res.status(403).json({ error: 'La cuenta está desactivada. Contacte al administrador.' });

    const token = await sesiones.crearSesion(u.id);
    res.cookie(sesiones.COOKIE, token, sesiones.opcionesCookie());
    return res.json({ usuario: { id: u.id, nombre: u.nombre, username: u.username, email: u.email, rol: u.rol } });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout: borra la sesión en el servidor; la cookie deja de servir aunque alguien la haya copiado.
router.post('/logout', requiereSesion, async (req, res, next) => {
  try {
    await sesiones.cerrarSesion(req.token);
    res.clearCookie(sesiones.COOKIE, { ...sesiones.opcionesCookie(), maxAge: undefined });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requiereSesion, (req, res) => {
  const { sesion_id: _s, ...usuario } = req.usuario;
  res.json({ usuario });
});

module.exports = router;
