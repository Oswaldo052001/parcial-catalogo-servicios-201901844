'use strict';
const express = require('express');
const { query } = require('../db/pool');
const { HttpError } = require('../lib/errores');
const v = require('../lib/validar');
const { importarExcel } = require('../services/importador');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT i.id, i.archivo, i.sha256, i.hoja, i.iniciada_en, i.finalizada_en, i.origen, i.resumen, u.username AS ejecutada_por
         FROM importacion i LEFT JOIN usuario u ON u.id = i.ejecutada_por ORDER BY i.id DESC LIMIT 50`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = v.idParam(req);
    const { rows: [imp] } = await query('SELECT * FROM importacion WHERE id = $1', [id]);
    if (!imp) throw new HttpError(404, `No existe la importación ${id}.`);
    const { rows: observaciones } = await query(
      'SELECT tipo, severidad, hoja, fila, rango, codigo, mensaje, detalle FROM observacion_importacion WHERE importacion_id = $1 ORDER BY fila NULLS LAST, id', [id]);
    res.json({ ...imp, observaciones });
  } catch (err) { next(err); }
});

// POST /api/importaciones: vuelve a importar el archivo original del repositorio (solo administrador).
router.post('/', async (req, res, next) => {
  try {
    const resumen = await importarExcel({ usuarioId: req.usuario.id, origen: 'aplicacion' });
    res.status(201).json(resumen);
  } catch (err) { next(err); }
});

module.exports = router;
