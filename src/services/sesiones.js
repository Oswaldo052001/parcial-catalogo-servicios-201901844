'use strict';
// Sesiones del lado del servidor. La cookie lleva un token aleatorio de 32 bytes;
// en la base solo se guarda su SHA-256, así una copia de la base no permite suplantar sesiones.
const crypto = require('crypto');
const { query } = require('../db/pool');
const config = require('../config');

const COOKIE = 'sid';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sesion (token_hash, usuario_id, expira_en) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [hashToken(token), usuarioId, config.sessionHours]);
  // Limpieza oportunista de sesiones vencidas
  await query('DELETE FROM sesion WHERE expira_en < now()');
  return token;
}

// Devuelve el usuario de la sesión solo si la sesión existe, no venció y el usuario está activo.
async function usuarioDeToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT s.id AS sesion_id, u.id, u.nombre, u.username, u.email, u.rol
       FROM sesion s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_en > now() AND u.activo = TRUE`,
    [hashToken(token)]);
  return rows[0] || null;
}

async function cerrarSesion(token) {
  if (!token) return;
  await query('DELETE FROM sesion WHERE token_hash = $1', [hashToken(token)]);
}

async function cerrarSesionesDeUsuario(usuarioId, client = { query }) {
  await client.query('DELETE FROM sesion WHERE usuario_id = $1', [usuarioId]);
}

function leerCookie(req) {
  const header = req.headers.cookie || '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function opcionesCookie() {
  return { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', maxAge: config.sessionHours * 3600 * 1000 };
}

module.exports = { COOKIE, crearSesion, usuarioDeToken, cerrarSesion, cerrarSesionesDeUsuario, leerCookie, opcionesCookie };
