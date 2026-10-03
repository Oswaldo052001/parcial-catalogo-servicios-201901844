'use strict';
// Catálogos controlados: clases, criticidades y tipos de servicio.
// valor_origen conserva el texto del Excel; etiqueta es lo que se muestra.
const express = require('express');
const { query } = require('../db/pool');
const { HttpError } = require('../lib/errores');
const v = require('../lib/validar');

const CATALOGOS = {
  clases: { tabla: 'clase_servicio', orden: false, campoServicio: 'clase_id' },
  criticidades: { tabla: 'criticidad', orden: true, campoServicio: 'criticidad_id' },
  tipos: { tabla: 'tipo_servicio', orden: false, campoServicio: 'tipo_id' },
};

function catalogo(req) {
  const c = CATALOGOS[req.params.cat];
  if (!c) throw new HttpError(404, `Catálogo "${req.params.cat}" no existe. Use: clases, criticidades, tipos.`);
  return c;
}

const router = express.Router();

router.get('/mapeo', async (req, res, next) => {
  try {
    res.json((await query('SELECT * FROM mapeo_etiqueta ORDER BY catalogo, valor_origen')).rows);
  } catch (err) { next(err); }
});

router.get('/:cat', async (req, res, next) => {
  try {
    const c = catalogo(req);
    const activo = v.booleano(req.query.activo);
    const { rows } = await query(
      `SELECT t.*, (SELECT count(*)::int FROM servicio_n2 s WHERE s.${c.campoServicio} = t.id) AS servicios
         FROM ${c.tabla} t ${activo !== null ? 'WHERE t.activo = $1' : ''}
        ORDER BY ${c.orden ? 't.orden' : 't.etiqueta'}`, activo !== null ? [activo] : []);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:cat', async (req, res, next) => {
  try {
    const c = catalogo(req);
    const valor = v.textoObligatorio(req.body, 'valor_origen', 'valor', 60);
    const etiqueta = v.textoOpcional(req.body, 'etiqueta', 'etiqueta', 60) || valor;
    let fila;
    if (c.orden) {
      const orden = v.entero(req.body.orden, 'orden') || ((await query(`SELECT coalesce(max(orden),0)+1 AS o FROM ${c.tabla}`)).rows[0].o);
      fila = (await query(`INSERT INTO ${c.tabla} (valor_origen, etiqueta, orden) VALUES ($1,$2,$3) RETURNING *`, [valor, etiqueta, orden])).rows[0];
    } else {
      fila = (await query(`INSERT INTO ${c.tabla} (valor_origen, etiqueta) VALUES ($1,$2) RETURNING *`, [valor, etiqueta])).rows[0];
    }
    res.status(201).json(fila);
  } catch (err) { next(err); }
});

// Solo se edita la etiqueta (y el orden). valor_origen no cambia porque es la referencia al Excel.
router.put('/:cat/:id', async (req, res, next) => {
  try {
    const c = catalogo(req);
    const id = v.idParam(req);
    const etiqueta = v.textoObligatorio(req.body, 'etiqueta', 'etiqueta', 60);
    const params = [id, etiqueta];
    let extra = '';
    if (c.orden && req.body.orden !== undefined) { params.push(v.entero(req.body.orden, 'orden', { obligatorio: true })); extra = ', orden = $3'; }
    const { rows: [fila] } = await query(`UPDATE ${c.tabla} SET etiqueta = $2${extra} WHERE id = $1 RETURNING *`, params);
    if (!fila) throw new HttpError(404, `No existe el registro ${id}.`);
    if (fila.etiqueta !== fila.valor_origen) {
      await query(
        `INSERT INTO mapeo_etiqueta (catalogo, valor_origen, etiqueta, motivo) VALUES ($1,$2,$3,$4)
         ON CONFLICT (catalogo, valor_origen) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, motivo = EXCLUDED.motivo`,
        [c.tabla, fila.valor_origen, fila.etiqueta, `Etiqueta modificada desde la aplicación por ${req.usuario.username}.`]);
    } else {
      await query('DELETE FROM mapeo_etiqueta WHERE catalogo = $1 AND valor_origen = $2', [c.tabla, fila.valor_origen]);
    }
    res.json(fila);
  } catch (err) { next(err); }
});

// Desactivar un valor solo impide usarlo en nuevas altas/ediciones; los servicios que ya lo tienen lo conservan.
for (const [accion, valor] of [['desactivar', false], ['activar', true]]) {
  router.post(`/:cat/:id/${accion}`, async (req, res, next) => {
    try {
      const c = catalogo(req);
      const id = v.idParam(req);
      const { rows: [fila] } = await query(`UPDATE ${c.tabla} SET activo = $2 WHERE id = $1 RETURNING *`, [id, valor]);
      if (!fila) throw new HttpError(404, `No existe el registro ${id}.`);
      res.json(fila);
    } catch (err) { next(err); }
  });
}

module.exports = { router, CATALOGOS };
