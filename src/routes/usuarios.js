'use strict';
// Usuarios. Ninguna consulta de esta ruta devuelve password_hash: se lee siempre desde la vista v_usuario.
const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { HttpError } = require('../lib/errores');
const v = require('../lib/validar');
const { hashPassword } = require('../lib/password');
const { cerrarSesionesDeUsuario } = require('../services/sesiones');


const router = express.Router();
const ROLES = ['administrador', 'consulta'];

async function validarPuesto(puestoId, client) {
  const { rows: [p] } = await client.query('SELECT id, nombre, activo FROM puesto WHERE id = $1', [puestoId]);
  if (!p) throw new HttpError(400, `No existe el puesto con id ${puestoId}.`);
  if (!p.activo) throw new HttpError(409, `No se puede asignar el puesto "${p.nombre}" porque está inactivo.`);
}

function validarRol(rol) {
  if (!ROLES.includes(rol)) throw new HttpError(400, 'El rol debe ser "administrador" o "consulta".');
  return rol;
}

function validarPasswordNueva(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  if (pw.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga.');
  return pw;
}

// GET /api/usuarios?q=&rol=&activo=&empresa_id=&seccion_id=&puesto_id=&pagina=&tam=
router.get('/', async (req, res, next) => {
  try {
    const { pagina, tam, offset } = v.paginacion(req.query);
    const f = [];
    const p = [];
    const add = (cond, val) => { p.push(val); f.push(cond.replace('?', `$${p.length}`)); };
    if (req.query.q) {
      p.push(`%${req.query.q}%`);
      const n = p.length;
      f.push(`(u.nombre ILIKE $${n} OR u.username ILIKE $${n} OR u.email ILIKE $${n})`);
    }
    if (req.query.rol) add('u.rol = ?', req.query.rol);
    const activo = v.booleano(req.query.activo);
    if (activo !== null) add('u.activo = ?', activo);
    for (const campo of ['empresa_id', 'area_id', 'departamento_id', 'seccion_id', 'puesto_id']) {
      if (req.query[campo]) add(`u.${campo} = ?`, v.entero(req.query[campo], campo));
    }
    const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int AS n FROM v_usuario u ${where}`, p)).rows[0].n;
    const { rows } = await query(
      `SELECT u.*, (SELECT count(*)::int FROM servicio_n2 s WHERE s.usuario_responsable_id = u.id) AS servicios_responsable
         FROM v_usuario u ${where} ORDER BY u.nombre LIMIT ${tam} OFFSET ${offset}`, p);
    res.json({ datos: rows, total, pagina, tam, paginas: Math.ceil(total / tam) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [u] } = await query('SELECT * FROM v_usuario WHERE id = $1', [id]);
    if (!u) throw new HttpError(404, `No existe el usuario con id ${id}.`);
    const { rows: servicios } = await query(
      `SELECT s.id, s.codigo, s.nombre, s.activo, n1.codigo AS n1_codigo, n1.nombre AS n1_nombre
         FROM servicio_n2 s JOIN servicio_n1 n1 ON n1.id = s.n1_id
        WHERE s.usuario_responsable_id = $1 ORDER BY s.codigo_normalizado`, [id]);
    res.json({ ...u, servicios });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const nombre = v.textoObligatorio(req.body, 'nombre', 'nombre', 150);
    const username = v.textoObligatorio(req.body, 'username', 'usuario', 60);
    const email = v.textoObligatorio(req.body, 'email', 'correo', 150).toLowerCase();
    const rol = validarRol(req.body.rol || 'consulta');
    const puestoId = v.entero(req.body.puesto_id, 'puesto', { obligatorio: true });
    const password = validarPasswordNueva(req.body.password);
    const hash = await hashPassword(password);
    const id = await withTransaction(async (client) => {
      await validarPuesto(puestoId, client);
      return (await client.query(
        `INSERT INTO usuario (puesto_id, nombre, username, email, password_hash, rol) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [puestoId, nombre, username, email, hash, rol])).rows[0].id;
    });
    res.status(201).json((await query('SELECT * FROM v_usuario WHERE id = $1', [id])).rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    await withTransaction(async (client) => {
      const { rows: [actual] } = await client.query('SELECT * FROM usuario WHERE id = $1', [id]);
      if (!actual) throw new HttpError(404, `No existe el usuario con id ${id}.`);
      const nombre = req.body.nombre !== undefined ? v.textoObligatorio(req.body, 'nombre', 'nombre', 150) : actual.nombre;
      const username = req.body.username !== undefined ? v.textoObligatorio(req.body, 'username', 'usuario', 60) : actual.username;
      const email = req.body.email !== undefined ? v.textoObligatorio(req.body, 'email', 'correo', 150).toLowerCase() : actual.email;
      const rol = req.body.rol !== undefined ? validarRol(req.body.rol) : actual.rol;
      let puestoId = actual.puesto_id;
      if (req.body.puesto_id !== undefined) {
        puestoId = v.entero(req.body.puesto_id, 'puesto', { obligatorio: true });
        if (puestoId !== actual.puesto_id) {
          await validarPuesto(puestoId, client);
          // Si cambia de sección deja de ser válido como responsable de servicios de la sección anterior.
          const { rows: [cambio] } = await client.query(
            `SELECT count(*)::int AS n FROM servicio_n2 s
              WHERE s.usuario_responsable_id = $1
                AND s.seccion_responsable_id <> (SELECT seccion_id FROM puesto WHERE id = $2)`, [id, puestoId]);
          if (cambio.n > 0) {
            throw new HttpError(409, `El usuario es responsable de ${cambio.n} servicio(s) de su sección actual. Reasigne esos servicios antes de moverlo a un puesto de otra sección.`);
          }
        }
      }
      if (req.usuario.id === id && rol !== 'administrador') {
        throw new HttpError(409, 'No puede quitarse a sí mismo el rol de administrador.');
      }
      let hash = actual.password_hash;
      if (req.body.password) hash = await hashPassword(validarPasswordNueva(req.body.password));
      await client.query(
        `UPDATE usuario SET nombre=$2, username=$3, email=$4, rol=$5, puesto_id=$6, password_hash=$7, actualizado_en=now() WHERE id=$1`,
        [id, nombre, username, email, rol, puestoId, hash]);
      // Al cambiar una contraseña se cierran las sesiones abiertas con la anterior (si es la propia, se conserva la actual).
      if (req.body.password) {
        await client.query('DELETE FROM sesion WHERE usuario_id = $1 AND id <> $2', [id, req.usuario.id === id ? req.usuario.sesion_id : 0]);
      }
    });
    res.json((await query('SELECT * FROM v_usuario WHERE id = $1', [id])).rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id/desactivar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    if (req.usuario.id === id) throw new HttpError(409, 'No puede desactivar su propia cuenta.');
    const resultado = await withTransaction(async (client) => {
      const { rows: [u] } = await client.query('UPDATE usuario SET activo = FALSE, actualizado_en = now() WHERE id = $1 RETURNING id', [id]);
      if (!u) throw new HttpError(404, `No existe el usuario con id ${id}.`);
      await cerrarSesionesDeUsuario(id, client); // sus sesiones abiertas dejan de servir de inmediato
      const { rows: servicios } = await client.query('SELECT codigo, nombre FROM servicio_n2 WHERE usuario_responsable_id = $1', [id]);
      return { mensaje: 'Usuario desactivado.', servicios_con_responsable_inactivo: servicios };
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/:id/activar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    await withTransaction(async (client) => {
      const { rows: [u] } = await client.query('SELECT puesto_id FROM usuario WHERE id = $1', [id]);
      if (!u) throw new HttpError(404, `No existe el usuario con id ${id}.`);
      await validarPuesto(u.puesto_id, client);
      await client.query('UPDATE usuario SET activo = TRUE, actualizado_en = now() WHERE id = $1', [id]);
    });
    res.json((await query('SELECT * FROM v_usuario WHERE id = $1', [id])).rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
