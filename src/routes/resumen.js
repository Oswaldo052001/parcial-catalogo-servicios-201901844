'use strict';
// Indicadores del tablero y vista de asignaciones (quién es responsable de qué).
const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

router.get('/tablero', async (req, res, next) => {
  try {
    const { rows: [t] } = await query(`SELECT
        (SELECT count(*) FROM servicio_n1)::int AS n1,
        (SELECT count(*) FROM servicio_n2)::int AS n2,
        (SELECT count(*) FROM servicio_n2 WHERE activo = 'S')::int AS n2_activos,
        (SELECT count(*) FROM servicio_n2 WHERE requiere_revision)::int AS n2_revision,
        (SELECT count(*) FROM servicio_n2 WHERE seccion_responsable_id IS NOT NULL)::int AS n2_asignados,
        (SELECT count(*) FROM empresa)::int AS empresas,
        (SELECT count(*) FROM seccion)::int AS secciones,
        (SELECT count(*) FROM usuario)::int AS usuarios,
        (SELECT count(*) FROM usuario WHERE activo)::int AS usuarios_activos,
        (SELECT max(id) FROM importacion) AS ultima_importacion`);
    const { rows: porN1 } = await query(
      `SELECT n1.id, n1.codigo, n1.nombre, count(s.id)::int AS servicios
         FROM servicio_n1 n1 LEFT JOIN servicio_n2 s ON s.n1_id = n1.id GROUP BY n1.id ORDER BY n1.codigo_normalizado`);
    res.json({ ...t, por_n1: porN1 });
  } catch (err) { next(err); }
});

// Servicios asignados agrupados por sección y por usuario responsable.
router.get('/asignaciones', async (req, res, next) => {
  try {
    const { rows: porSeccion } = await query(
      `SELECT vs.id, vs.nombre, vs.ruta, vs.activo, count(s.id)::int AS servicios,
              json_agg(json_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre, 'usuario', u.nombre) ORDER BY s.codigo_normalizado) AS detalle
         FROM servicio_n2 s JOIN v_seccion vs ON vs.id = s.seccion_responsable_id
         LEFT JOIN usuario u ON u.id = s.usuario_responsable_id
        GROUP BY vs.id, vs.nombre, vs.ruta, vs.activo ORDER BY vs.ruta`);
    const { rows: porUsuario } = await query(
      `SELECT vu.id, vu.nombre, vu.username, vu.seccion, vu.empresa, vu.activo, count(s.id)::int AS servicios
         FROM servicio_n2 s JOIN v_usuario vu ON vu.id = s.usuario_responsable_id
        GROUP BY vu.id, vu.nombre, vu.username, vu.seccion, vu.empresa, vu.activo ORDER BY servicios DESC, vu.nombre`);
    const { rows: [sin] } = await query('SELECT count(*)::int AS n FROM servicio_n2 WHERE seccion_responsable_id IS NULL');
    res.json({ por_seccion: porSeccion, por_usuario: porUsuario, sin_asignar: sin.n });
  } catch (err) { next(err); }
});

module.exports = router;
