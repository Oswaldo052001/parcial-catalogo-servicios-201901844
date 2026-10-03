'use strict';
// Catálogo de servicios: nivel 1 (/api/servicios-n1) y nivel 2 (/api/servicios).
const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { HttpError } = require('../lib/errores');
const v = require('../lib/validar');
const { normalizarCodigo } = require('../services/importador');

// ============================================================ Nivel 1

const n1 = express.Router();

n1.get('/', async (req, res, next) => {
  try {
    const activo = v.booleano(req.query.activo);
    const { rows } = await query(
      `SELECT n1.*, count(s.id)::int AS servicios, count(s.id) FILTER (WHERE s.activo = 'S')::int AS servicios_activos
         FROM servicio_n1 n1 LEFT JOIN servicio_n2 s ON s.n1_id = n1.id
        ${activo !== null ? 'WHERE n1.activo = $1' : ''}
        GROUP BY n1.id ORDER BY n1.codigo_normalizado`, activo !== null ? [activo] : []);
    res.json(rows);
  } catch (err) { next(err); }
});

n1.get('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [fila] } = await query('SELECT * FROM servicio_n1 WHERE id = $1', [id]);
    if (!fila) throw new HttpError(404, `No existe el servicio de nivel 1 con id ${id}.`);
    const { rows: servicios } = await query(
      'SELECT id, codigo, nombre, activo, requiere_revision FROM servicio_n2 WHERE n1_id = $1 ORDER BY codigo_normalizado', [id]);
    res.json({ ...fila, servicios });
  } catch (err) { next(err); }
});

n1.post('/', async (req, res, next) => {
  try {
    const codigo = v.textoObligatorio(req.body, 'codigo', 'código', 20);
    const nombre = v.textoObligatorio(req.body, 'nombre', 'nombre', 200);
    const { rows: [fila] } = await query(
      `INSERT INTO servicio_n1 (codigo, codigo_normalizado, nombre, origen_hoja) VALUES ($1,$2,$3,'aplicación') RETURNING *`,
      [codigo, normalizarCodigo(codigo), nombre]);
    res.status(201).json(fila);
  } catch (err) { next(err); }
});

n1.put('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const nombre = v.textoObligatorio(req.body, 'nombre', 'nombre', 200);
    const revision = v.booleano(req.body.requiere_revision);
    const { rows: [fila] } = await query(
      `UPDATE servicio_n1 SET nombre = $2, requiere_revision = coalesce($3, requiere_revision), actualizado_en = now() WHERE id = $1 RETURNING *`,
      [id, nombre, revision]);
    if (!fila) throw new HttpError(404, `No existe el servicio de nivel 1 con id ${id}.`);
    res.json(fila);
  } catch (err) { next(err); }
});

n1.post('/:id/desactivar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const cascada = req.body && req.body.cascada === true;
    const r = await withTransaction(async (client) => {
      const { rows: [fila] } = await client.query('SELECT * FROM servicio_n1 WHERE id = $1', [id]);
      if (!fila) throw new HttpError(404, `No existe el servicio de nivel 1 con id ${id}.`);
      const { rows: activos } = await client.query(`SELECT codigo FROM servicio_n2 WHERE n1_id = $1 AND activo = 'S'`, [id]);
      if (activos.length && !cascada) {
        throw new HttpError(409, `No se puede desactivar ${fila.codigo}: tiene ${activos.length} servicio(s) de nivel 2 activos. Desactívelos primero o envíe {"cascada": true}.`,
          { dependientes: activos.map((a) => a.codigo) });
      }
      await client.query('UPDATE servicio_n1 SET activo = FALSE, actualizado_en = now() WHERE id = $1', [id]);
      const { rows: n2 } = await client.query(
        `UPDATE servicio_n2 SET activo = 'N', actualizado_en = now() WHERE n1_id = $1 AND activo = 'S' RETURNING codigo`, [id]);
      return { mensaje: 'Servicio de nivel 1 desactivado.', servicios_n2_desactivados: n2.map((x) => x.codigo) };
    });
    res.json(r);
  } catch (err) { next(err); }
});

n1.post('/:id/activar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [fila] } = await query('UPDATE servicio_n1 SET activo = TRUE, actualizado_en = now() WHERE id = $1 RETURNING *', [id]);
    if (!fila) throw new HttpError(404, `No existe el servicio de nivel 1 con id ${id}.`);
    res.json(fila);
  } catch (err) { next(err); }
});

// ============================================================ Nivel 2

const n2 = express.Router();

const SELECT_N2 = `
  SELECT s.id, s.codigo, s.codigo_normalizado, s.nombre, s.activo, s.descripcion, s.metrica, s.minimo, s.maximo,
         s.requiere_revision, s.origen_hoja, s.origen_rango, s.traza, s.creado_en, s.actualizado_en,
         s.n1_id, n1.codigo AS n1_codigo, n1.nombre AS n1_nombre, n1.activo AS n1_activo,
         s.clase_id, c.etiqueta AS clase, c.valor_origen AS clase_origen,
         s.criticidad_id, cr.etiqueta AS criticidad, cr.valor_origen AS criticidad_origen,
         s.tipo_id, t.etiqueta AS tipo, t.valor_origen AS tipo_origen,
         s.seccion_responsable_id, vs.nombre AS seccion_responsable, vs.ruta AS seccion_responsable_ruta, vs.activo AS seccion_responsable_activa,
         s.usuario_responsable_id, u.nombre AS usuario_responsable, u.username AS usuario_responsable_username, u.activo AS usuario_responsable_activo
    FROM servicio_n2 s
    JOIN servicio_n1 n1 ON n1.id = s.n1_id
    LEFT JOIN clase_servicio c ON c.id = s.clase_id
    LEFT JOIN criticidad cr ON cr.id = s.criticidad_id
    LEFT JOIN tipo_servicio t ON t.id = s.tipo_id
    LEFT JOIN v_seccion vs ON vs.id = s.seccion_responsable_id
    LEFT JOIN usuario u ON u.id = s.usuario_responsable_id`;

// GET /api/servicios?q=&n1_id=&activo=&clase_id=&criticidad_id=&tipo_id=&revision=&seccion_id=&usuario_id=&sin_responsable=&pagina=&tam=
n2.get('/', async (req, res, next) => {
  try {
    const { pagina, tam, offset } = v.paginacion(req.query);
    const f = [];
    const p = [];
    const add = (sql, val) => { p.push(val); f.push(sql.replace('?', `$${p.length}`)); };
    if (req.query.q) {
      p.push(`%${String(req.query.q).trim()}%`);
      const n = p.length;
      f.push(`(s.codigo ILIKE $${n} OR s.codigo_normalizado ILIKE $${n} OR s.nombre ILIKE $${n})`);
    }
    if (req.query.n1_id) add('s.n1_id = ?', v.entero(req.query.n1_id, 'n1_id'));
    if (req.query.activo) {
      if (!['S', 'N', 'DESCONOCIDO'].includes(req.query.activo)) throw new HttpError(400, 'El filtro de estado debe ser S, N o DESCONOCIDO.');
      add('s.activo = ?', req.query.activo);
    }
    for (const campo of ['clase_id', 'criticidad_id', 'tipo_id']) {
      if (req.query[campo] === 'sin_dato') f.push(`s.${campo} IS NULL`);
      else if (req.query[campo]) add(`s.${campo} = ?`, v.entero(req.query[campo], campo));
    }
    if (v.booleano(req.query.revision) !== null) add('s.requiere_revision = ?', v.booleano(req.query.revision));
    if (req.query.seccion_id) add('s.seccion_responsable_id = ?', v.entero(req.query.seccion_id, 'seccion_id'));
    if (req.query.usuario_id) add('s.usuario_responsable_id = ?', v.entero(req.query.usuario_id, 'usuario_id'));
    if (v.booleano(req.query.sin_responsable)) f.push('s.seccion_responsable_id IS NULL');
    const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int AS n FROM servicio_n2 s ${where}`, p)).rows[0].n;
    const { rows } = await query(`${SELECT_N2} ${where} ORDER BY s.codigo_normalizado LIMIT ${tam} OFFSET ${offset}`, p);
    res.json({ datos: rows, total, pagina, tam, paginas: Math.ceil(total / tam) });
  } catch (err) { next(err); }
});

// Ficha completa del servicio
n2.get('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [s] } = await query(`${SELECT_N2} WHERE s.id = $1`, [id]);
    if (!s) throw new HttpError(404, `No existe el servicio con id ${id}.`);
    const { rows: observaciones } = await query(
      `SELECT o.tipo, o.severidad, o.fila, o.rango, o.mensaje, o.detalle
         FROM observacion_importacion o
        WHERE o.codigo IN ($1, $2) AND o.importacion_id = (SELECT max(id) FROM importacion)
        ORDER BY o.id`, [s.codigo, s.n1_codigo]);
    res.json({ ...s, observaciones });
  } catch (err) { next(err); }
});

// Lee y valida el cuerpo de alta/edición. "actual" es el registro existente en una edición.
async function leerServicio(body, client, actual = {}) {
  const val = (campo) => (body[campo] !== undefined ? body[campo] : actual[campo]);
  const datos = {
    nombre: v.textoObligatorio({ nombre: val('nombre') }, 'nombre', 'nombre', 200),
    n1_id: v.entero(val('n1_id'), 'servicio de nivel 1', { obligatorio: true }),
    activo: val('activo') || 'S',
    clase_id: v.entero(val('clase_id'), 'clase'),
    criticidad_id: v.entero(val('criticidad_id'), 'criticidad'),
    tipo_id: v.entero(val('tipo_id'), 'tipo'),
    descripcion: v.textoOpcional({ d: val('descripcion') }, 'd', 'descripción', 2000),
    metrica: v.textoOpcional({ m: val('metrica') }, 'm', 'métrica', 200),
    minimo: v.numeroOpcional(val('minimo'), 'mínimo'),
    maximo: v.numeroOpcional(val('maximo'), 'máximo'),
  };
  if (!['S', 'N', 'DESCONOCIDO'].includes(datos.activo)) throw new HttpError(400, 'El estado debe ser S, N o DESCONOCIDO.');
  if (datos.minimo !== null && datos.maximo !== null && datos.minimo > datos.maximo) {
    throw new HttpError(400, `El mínimo (${datos.minimo}) no puede ser mayor que el máximo (${datos.maximo}).`);
  }
  const { rows: [padre] } = await client.query('SELECT codigo, activo FROM servicio_n1 WHERE id = $1', [datos.n1_id]);
  if (!padre) throw new HttpError(400, `No existe el servicio de nivel 1 con id ${datos.n1_id}.`);
  if (!padre.activo && datos.n1_id !== actual.n1_id) throw new HttpError(409, `El servicio de nivel 1 ${padre.codigo} está inactivo.`);
  for (const [campo, tabla, nombre] of [['clase_id', 'clase_servicio', 'clase'], ['criticidad_id', 'criticidad', 'criticidad'], ['tipo_id', 'tipo_servicio', 'tipo de servicio']]) {
    if (datos[campo] === null) continue;
    const { rows: [c] } = await client.query(`SELECT activo FROM ${tabla} WHERE id = $1`, [datos[campo]]);
    if (!c) throw new HttpError(400, `No existe la ${nombre} con id ${datos[campo]}.`);
    if (!c.activo && datos[campo] !== actual[campo]) throw new HttpError(409, `La ${nombre} seleccionada está inactiva.`);
  }
  // Queda en revisión si le falta algún atributo que el catálogo debería tener.
  datos.requiere_revision = body.requiere_revision !== undefined
    ? v.booleano(body.requiere_revision) === true
    : (datos.activo === 'DESCONOCIDO' || !datos.clase_id || !datos.criticidad_id || !datos.tipo_id || !datos.metrica);
  return datos;
}

n2.post('/', async (req, res, next) => {
  try {
    const codigo = v.textoObligatorio(req.body, 'codigo', 'código', 20);
    const id = await withTransaction(async (client) => {
      const d = await leerServicio(req.body, client);
      const cols = Object.keys(d);
      const { rows: [fila] } = await client.query(
        `INSERT INTO servicio_n2 (codigo, codigo_normalizado, origen_hoja, ${cols.join(', ')})
         VALUES ($1, $2, 'aplicación', ${cols.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
        [codigo, normalizarCodigo(codigo), ...cols.map((c) => d[c])]);
      return fila.id;
    });
    res.status(201).json((await query(`${SELECT_N2} WHERE s.id = $1`, [id])).rows[0]);
  } catch (err) { next(err); }
});

n2.put('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    await withTransaction(async (client) => {
      const { rows: [actual] } = await client.query('SELECT * FROM servicio_n2 WHERE id = $1', [id]);
      if (!actual) throw new HttpError(404, `No existe el servicio con id ${id}.`);
      const d = await leerServicio(req.body, client, actual);
      const cols = Object.keys(d);
      await client.query(
        `UPDATE servicio_n2 SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, actualizado_en = now() WHERE id = $1`,
        [id, ...cols.map((c) => d[c])]);
    });
    res.json((await query(`${SELECT_N2} WHERE s.id = $1`, [id])).rows[0]);
  } catch (err) { next(err); }
});

n2.post('/:id/desactivar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [fila] } = await query(`UPDATE servicio_n2 SET activo = 'N', actualizado_en = now() WHERE id = $1 RETURNING id`, [id]);
    if (!fila) throw new HttpError(404, `No existe el servicio con id ${id}.`);
    res.json((await query(`${SELECT_N2} WHERE s.id = $1`, [id])).rows[0]);
  } catch (err) { next(err); }
});

n2.post('/:id/activar', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [s] } = await query('SELECT n1.activo, n1.codigo FROM servicio_n2 s JOIN servicio_n1 n1 ON n1.id = s.n1_id WHERE s.id = $1', [id]);
    if (!s) throw new HttpError(404, `No existe el servicio con id ${id}.`);
    if (!s.activo) throw new HttpError(409, `No se puede activar: el servicio de nivel 1 ${s.codigo} está inactivo.`);
    await query(`UPDATE servicio_n2 SET activo = 'S', actualizado_en = now() WHERE id = $1`, [id]);
    res.json((await query(`${SELECT_N2} WHERE s.id = $1`, [id])).rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/servicios/:id/responsable { seccion_id, usuario_id }  (null en ambos = quitar asignación)
n2.put('/:id/responsable', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const seccionId = v.entero(req.body.seccion_id, 'sección');
    const usuarioId = v.entero(req.body.usuario_id, 'usuario');
    await withTransaction(async (client) => {
      const { rows: [s] } = await client.query('SELECT id FROM servicio_n2 WHERE id = $1 FOR UPDATE', [id]);
      if (!s) throw new HttpError(404, `No existe el servicio con id ${id}.`);
      if (usuarioId && !seccionId) throw new HttpError(400, 'Para asignar un usuario responsable debe indicar también la sección responsable.');
      if (seccionId) {
        const { rows: [sec] } = await client.query('SELECT id, nombre, activo FROM seccion WHERE id = $1', [seccionId]);
        if (!sec) throw new HttpError(400, `No existe la sección con id ${seccionId}.`);
        if (!sec.activo) throw new HttpError(409, `La sección "${sec.nombre}" está inactiva.`);
        if (usuarioId) {
          const { rows: [u] } = await client.query(
            'SELECT u.id, u.nombre, u.activo, vp.seccion_id, vp.seccion FROM usuario u JOIN v_puesto vp ON vp.id = u.puesto_id WHERE u.id = $1', [usuarioId]);
          if (!u) throw new HttpError(400, `No existe el usuario con id ${usuarioId}.`);
          if (!u.activo) throw new HttpError(409, `El usuario "${u.nombre}" está inactivo.`);
          if (u.seccion_id !== seccionId) {
            throw new HttpError(400, `El usuario "${u.nombre}" pertenece a la sección "${u.seccion}", no a "${sec.nombre}". El responsable debe ser de la sección responsable.`);
          }
        }
      }
      await client.query(
        'UPDATE servicio_n2 SET seccion_responsable_id = $2, usuario_responsable_id = $3, actualizado_en = now() WHERE id = $1',
        [id, seccionId, usuarioId]);
    });
    res.json((await query(`${SELECT_N2} WHERE s.id = $1`, [id])).rows[0]);
  } catch (err) { next(err); }
});

module.exports = { n1, n2 };
