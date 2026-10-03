'use strict';
// Mantenimiento de la estructura organizacional: empresa, área, departamento, sección y puesto.
// Política de bajas (documentada en docs/RESOLUCION.md §3.3):
//  - Nunca se borra físicamente; desactivar pone activo = false.
//  - Si el registro tiene dependientes activos, la desactivación se rechaza (409) y se informan las dependencias.
//  - Con { "cascada": true } se desactivan también todos los dependientes y la respuesta lista exactamente qué se desactivó
//    y qué servicios quedaron con un responsable inactivo (no se quitan las asignaciones en silencio).
//  - Reactivar exige que el padre esté activo y no reactiva dependientes.
const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { HttpError } = require('../lib/errores');
const v = require('../lib/validar');
const { cerrarSesionesDeUsuario } = require('../services/sesiones');

const ENTIDADES = {
  empresa: { tabla: 'empresa', etiqueta: 'la empresa', padre: null },
  area: { tabla: 'area', etiqueta: 'el área', padre: { entidad: 'empresa', fk: 'empresa_id' } },
  departamento: { tabla: 'departamento', etiqueta: 'el departamento', padre: { entidad: 'area', fk: 'area_id' } },
  seccion: { tabla: 'seccion', etiqueta: 'la sección', padre: { entidad: 'departamento', fk: 'departamento_id' } },
  puesto: { tabla: 'puesto', etiqueta: 'el puesto', padre: { entidad: 'seccion', fk: 'seccion_id' } },
};
// Hijo -> FK hacia el padre
const FK_HIJO = { area: 'empresa_id', departamento: 'area_id', seccion: 'departamento_id', puesto: 'seccion_id', usuario: 'puesto_id' };
const HIJO = { empresa: 'area', area: 'departamento', departamento: 'seccion', seccion: 'puesto', puesto: 'usuario' };

function entidadDe(req) {
  const e = ENTIDADES[req.params.entidad];
  if (!e) throw new HttpError(404, `Entidad "${req.params.entidad}" no existe. Use: ${Object.keys(ENTIDADES).join(', ')}.`);
  return e;
}

async function obtener(tabla, id, client = { query }) {
  const { rows } = await client.query(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Valida que el padre exista y esté activo (no se permiten huérfanos ni asociaciones nuevas con padres inactivos).
async function validarPadre(ent, padreId, client) {
  if (!ent.padre) return;
  const padreEnt = ENTIDADES[ent.padre.entidad];
  if (!padreId) throw new HttpError(400, `Debe indicar ${padreEnt.etiqueta} superior (campo ${ent.padre.fk}).`);
  const padre = await obtener(padreEnt.tabla, padreId, client);
  if (!padre) throw new HttpError(400, `No existe ${padreEnt.etiqueta} con id ${padreId}.`);
  if (!padre.activo) throw new HttpError(409, `No se puede asociar a ${padreEnt.etiqueta} "${padre.nombre}" porque está inactivo(a).`);
}

const router = express.Router();

// GET /api/org/arbol: toda la jerarquía con conteos (para la vista de organización)
router.get('/arbol', async (req, res, next) => {
  try {
    const [emp, ar, dep, sec, pue, usu] = await Promise.all([
      query('SELECT id, codigo, nombre, activo FROM empresa ORDER BY codigo'),
      query('SELECT id, empresa_id, codigo, nombre, activo FROM area ORDER BY codigo'),
      query('SELECT id, area_id, codigo, nombre, activo FROM departamento ORDER BY codigo'),
      query('SELECT id, departamento_id, codigo, nombre, activo FROM seccion ORDER BY codigo'),
      query('SELECT id, seccion_id, codigo, nombre, activo FROM puesto ORDER BY codigo'),
      query('SELECT puesto_id, count(*)::int AS usuarios FROM usuario GROUP BY puesto_id'),
    ]);
    const usuariosPorPuesto = new Map(usu.rows.map((r) => [r.puesto_id, r.usuarios]));
    const agrupar = (rows, fk) => rows.reduce((m, r) => m.set(r[fk], [...(m.get(r[fk]) || []), r]), new Map());
    const areas = agrupar(ar.rows, 'empresa_id');
    const deps = agrupar(dep.rows, 'area_id');
    const secs = agrupar(sec.rows, 'departamento_id');
    const pues = agrupar(pue.rows, 'seccion_id');
    res.json(emp.rows.map((e) => ({
      ...e,
      areas: (areas.get(e.id) || []).map((a) => ({
        ...a,
        departamentos: (deps.get(a.id) || []).map((d) => ({
          ...d,
          secciones: (secs.get(d.id) || []).map((s) => ({
            ...s,
            puestos: (pues.get(s.id) || []).map((p) => ({ ...p, usuarios: usuariosPorPuesto.get(p.id) || 0 })),
          })),
        })),
      })),
    })));
  } catch (err) { next(err); }
});

// GET /api/org/:entidad?padre_id=&activo=&q=
router.get('/:entidad', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const filtros = [];
    const params = [];
    if (ent.padre && req.query.padre_id) { params.push(v.entero(req.query.padre_id, 'padre_id')); filtros.push(`t.${ent.padre.fk} = $${params.length}`); }
    const activo = v.booleano(req.query.activo);
    if (activo !== null) { params.push(activo); filtros.push(`t.activo = $${params.length}`); }
    if (req.query.q) { params.push(`%${req.query.q}%`); filtros.push(`(t.codigo ILIKE $${params.length} OR t.nombre ILIKE $${params.length})`); }
    const padreSel = ent.padre
      ? `, p.nombre AS padre_nombre, p.codigo AS padre_codigo, p.activo AS padre_activo`
      : '';
    const padreJoin = ent.padre ? `JOIN ${ENTIDADES[ent.padre.entidad].tabla} p ON p.id = t.${ent.padre.fk}` : '';
    const hijo = HIJO[req.params.entidad];
    const vista = { seccion: 'v_seccion', puesto: 'v_puesto' }[req.params.entidad];
    const rutaSel = vista ? `, (SELECT ruta FROM ${vista} x WHERE x.id = t.id) AS ruta` : '';
    const { rows } = await query(
      `SELECT t.*${padreSel}${rutaSel},
              (SELECT count(*)::int FROM ${hijo} h WHERE h.${FK_HIJO[hijo]} = t.id AND h.activo) AS dependientes_activos
         FROM ${ent.tabla} t ${padreJoin}
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY t.codigo`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:entidad/:id', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const id = v.idParam(req);
    const fila = await obtener(ent.tabla, id);
    if (!fila) throw new HttpError(404, `No existe ${ent.etiqueta} con id ${id}.`);
    let ruta = null;
    if (req.params.entidad === 'seccion') ruta = (await query('SELECT ruta FROM v_seccion WHERE id=$1', [id])).rows[0].ruta;
    if (req.params.entidad === 'puesto') ruta = (await query('SELECT ruta FROM v_puesto WHERE id=$1', [id])).rows[0].ruta;
    res.json({ ...fila, ruta });
  } catch (err) { next(err); }
});

router.post('/:entidad', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const codigo = v.textoObligatorio(req.body, 'codigo', 'código', 20);
    const nombre = v.textoObligatorio(req.body, 'nombre', 'nombre', 150);
    const fila = await withTransaction(async (client) => {
      if (ent.padre) {
        const padreId = v.entero(req.body[ent.padre.fk], ent.padre.fk);
        await validarPadre(ent, padreId, client);
        return (await client.query(
          `INSERT INTO ${ent.tabla} (${ent.padre.fk}, codigo, nombre) VALUES ($1,$2,$3) RETURNING *`, [padreId, codigo, nombre])).rows[0];
      }
      return (await client.query(`INSERT INTO ${ent.tabla} (codigo, nombre) VALUES ($1,$2) RETURNING *`, [codigo, nombre])).rows[0];
    });
    res.status(201).json(fila);
  } catch (err) { next(err); }
});

router.put('/:entidad/:id', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const id = v.idParam(req);
    const fila = await withTransaction(async (client) => {
      const actual = await obtener(ent.tabla, id, client);
      if (!actual) throw new HttpError(404, `No existe ${ent.etiqueta} con id ${id}.`);
      const codigo = req.body.codigo !== undefined ? v.textoObligatorio(req.body, 'codigo', 'código', 20) : actual.codigo;
      const nombre = req.body.nombre !== undefined ? v.textoObligatorio(req.body, 'nombre', 'nombre', 150) : actual.nombre;
      if (ent.padre) {
        let padreId = actual[ent.padre.fk];
        if (req.body[ent.padre.fk] !== undefined) {
          padreId = v.entero(req.body[ent.padre.fk], ent.padre.fk, { obligatorio: true });
          if (padreId !== actual[ent.padre.fk]) await validarPadre(ent, padreId, client);
        }
        return (await client.query(
          `UPDATE ${ent.tabla} SET codigo=$2, nombre=$3, ${ent.padre.fk}=$4, actualizado_en=now() WHERE id=$1 RETURNING *`,
          [id, codigo, nombre, padreId])).rows[0];
      }
      return (await client.query(
        `UPDATE ${ent.tabla} SET codigo=$2, nombre=$3, actualizado_en=now() WHERE id=$1 RETURNING *`, [id, codigo, nombre])).rows[0];
    });
    res.json(fila);
  } catch (err) { next(err); }
});

// Desactiva en cascada los dependientes de (entidad, ids) y acumula lo afectado.
async function desactivarDescendientes(client, entidad, ids, reporte) {
  const hijo = HIJO[entidad];
  if (!hijo || ids.length === 0) return;
  const { rows } = await client.query(
    `UPDATE ${hijo} SET activo = FALSE, actualizado_en = now() WHERE ${FK_HIJO[hijo]} = ANY($1) AND activo RETURNING id, ${hijo === 'usuario' ? 'username AS codigo' : 'codigo'}, nombre`,
    [ids]);
  reporte[hijo] = (reporte[hijo] || []).concat(rows.map((r) => ({ id: r.id, codigo: r.codigo, nombre: r.nombre })));
  if (hijo === 'usuario') {
    for (const r of rows) await cerrarSesionesDeUsuario(r.id, client);
  }
  await desactivarDescendientes(client, hijo, rows.map((r) => r.id), reporte);
}

router.post('/:entidad/:id/desactivar', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const id = v.idParam(req);
    const cascada = req.body && req.body.cascada === true;
    const resultado = await withTransaction(async (client) => {
      const actual = await obtener(ent.tabla, id, client);
      if (!actual) throw new HttpError(404, `No existe ${ent.etiqueta} con id ${id}.`);
      if (!actual.activo) return { mensaje: `El registro ya estaba inactivo.`, desactivados: {} };
      const hijo = HIJO[req.params.entidad];
      const { rows: [dep] } = await client.query(`SELECT count(*)::int AS n FROM ${hijo} WHERE ${FK_HIJO[hijo]} = $1 AND activo`, [id]);
      if (dep.n > 0 && !cascada) {
        throw new HttpError(409,
          `No se puede desactivar ${ent.etiqueta} "${actual.nombre}": tiene ${dep.n} ${hijo === 'usuario' ? 'usuario(s)' : `registro(s) de ${hijo}`} activos. Desactívelos primero o envíe {"cascada": true} para desactivarlos todos.`,
          { dependientes: { [hijo]: dep.n } });
      }
      await client.query(`UPDATE ${ent.tabla} SET activo = FALSE, actualizado_en = now() WHERE id = $1`, [id]);
      const reporte = { [req.params.entidad]: [{ id, codigo: actual.codigo, nombre: actual.nombre }] };
      if (cascada) await desactivarDescendientes(client, req.params.entidad, [id], reporte);
      // Servicios cuyo responsable quedó inactivo: se informan, no se modifican.
      const secciones = (reporte.seccion || []).map((r) => r.id);
      const usuarios = (reporte.usuario || []).map((r) => r.id);
      const { rows: afectados } = await client.query(
        `SELECT codigo, nombre FROM servicio_n2 WHERE seccion_responsable_id = ANY($1) OR usuario_responsable_id = ANY($2) ORDER BY codigo_normalizado`,
        [secciones, usuarios]);
      return { mensaje: 'Desactivación realizada.', desactivados: reporte, servicios_con_responsable_inactivo: afectados };
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/:entidad/:id/activar', async (req, res, next) => {
  try {
    const ent = entidadDe(req);
    const id = v.idParam(req);
    const fila = await withTransaction(async (client) => {
      const actual = await obtener(ent.tabla, id, client);
      if (!actual) throw new HttpError(404, `No existe ${ent.etiqueta} con id ${id}.`);
      if (ent.padre) await validarPadre(ent, actual[ent.padre.fk], client);
      return (await client.query(`UPDATE ${ent.tabla} SET activo = TRUE, actualizado_en = now() WHERE id = $1 RETURNING *`, [id])).rows[0];
    });
    res.json(fila);
  } catch (err) { next(err); }
});

module.exports = router;
