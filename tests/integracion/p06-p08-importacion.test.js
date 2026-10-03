'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { comoAdmin } = require('../helpers');
const { importarExcel } = require('../../src/services/importador');
const { closePool, query } = require('../../src/db/pool');

const EXCEL = 'data/CatalogoServicios.xlsx';
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(EXCEL)).digest('hex');

afterAll(() => closePool());

describe('P06 Importar el archivo original', () => {
  test('quedan 12 códigos de nivel 1 y 46 servicios de nivel 2, con incidencias registradas', async () => {
    const { rows: [t] } = await query(`SELECT (SELECT count(*) FROM servicio_n1 WHERE origen_hoja = 'Servicios Externos')::int AS n1,
      (SELECT count(*) FROM servicio_n2 WHERE origen_hoja = 'Servicios Externos')::int AS n2`);
    expect(t).toEqual({ n1: 12, n2: 46 });
    const { rows: [imp] } = await query('SELECT * FROM importacion ORDER BY id LIMIT 1');
    expect(imp.resumen.controles).toMatchObject({ n1_en_archivo: 12, n2_en_archivo: 46, ok: true });
    expect(imp.resumen.nivel1.creados).toBe(12);
    expect(imp.resumen.nivel2.creados).toBe(46);
    expect(imp.resumen.omitidos).toBe(2);
    const { rows: obs } = await query('SELECT tipo, fila, codigo FROM observacion_importacion WHERE importacion_id = $1', [imp.id]);
    const tipos = obs.map((o) => o.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['CONFLICTO_NOMBRE_N1', 'ATRIBUTOS_INCOMPLETOS', 'FILA_SIN_CODIGO', 'N1_POR_PREFIJO', 'CODIGO_NORMALIZADO', 'ESPACIOS_RECORTADOS']));
    expect(obs.filter((o) => o.tipo === 'FILA_SIN_CODIGO').map((o) => o.fila).sort()).toEqual([42, 67]);
  });

  test('las celdas combinadas no generan un servicio por fila y conservan su rango de origen', async () => {
    const { rows: [s] } = await query("SELECT origen_rango, metrica, minimo, maximo FROM servicio_n2 WHERE codigo = 'SE.01.01'");
    expect(s).toEqual({ origen_rango: 'C5:L7', metrica: 'Número de Puntos Instalados', minimo: 1, maximo: 100 });
    const { rows: [n1] } = await query("SELECT origen_rango FROM servicio_n1 WHERE codigo = 'SE.06'");
    expect(n1.origen_rango).toBe('A26:B55');
    const { rows: [c] } = await query("SELECT count(*)::int AS n FROM servicio_n2 s JOIN servicio_n1 n ON n.id = s.n1_id WHERE n.codigo = 'SE.06'");
    expect(c.n).toBe(10);
  });

  test('las filas de la lista de opciones alimentan los catálogos y no son servicios', async () => {
    const { rows: tipos } = await query('SELECT valor_origen FROM tipo_servicio ORDER BY valor_origen');
    expect(tipos.map((t) => t.valor_origen)).toEqual(['Back End', 'Demostration', 'End User Service', 'Front End', 'IT Management',
      'IT Operational', 'Other', 'Project', 'Reporting', 'Training', 'Underpinning Contract']);
    const { rows: crit } = await query('SELECT valor_origen FROM criticidad ORDER BY orden');
    expect(crit.map((c) => c.valor_origen)).toEqual(['Very Low', 'Low', 'Normal', 'High', 'Very High']);
    const { rows: m } = await query("SELECT etiqueta FROM mapeo_etiqueta WHERE valor_origen = 'Demostration'");
    expect(m[0].etiqueta).toBe('Demonstration');
  });
});

describe('P07 Repetir la importación', () => {
  test('no duplica registros, no reporta cambios y deja una nueva traza', async () => {
    const antes = hash();
    const { rows: [prev] } = await query('SELECT count(*)::int AS n FROM importacion');
    const r = await importarExcel({ ruta: EXCEL });
    expect(r.creados).toBe(0);
    expect(r.actualizados).toBe(0);
    expect(r.sin_cambios).toBe(58);
    const { rows: [t] } = await query(`SELECT (SELECT count(*) FROM servicio_n1 WHERE origen_hoja = 'Servicios Externos')::int AS n1,
      (SELECT count(*) FROM servicio_n2 WHERE origen_hoja = 'Servicios Externos')::int AS n2, (SELECT count(*) FROM importacion)::int AS imp`);
    expect(t).toEqual({ n1: 12, n2: 46, imp: prev.n + 1 });
    expect(hash()).toBe(antes); // el Excel original no se modifica
  });

  test('una reimportación no borra las asignaciones de responsables hechas en la aplicación', async () => {
    const { rows: [antes] } = await query("SELECT seccion_responsable_id, usuario_responsable_id FROM servicio_n2 WHERE codigo = 'SE.03.01'");
    expect(antes.seccion_responsable_id).not.toBeNull();
    const admin = await comoAdmin();
    const r = await admin.post('/api/importaciones').send({}).expect(201);
    expect(r.body.creados).toBe(0);
    const { rows: [despues] } = await query("SELECT seccion_responsable_id, usuario_responsable_id FROM servicio_n2 WHERE codigo = 'SE.03.01'");
    expect(despues).toEqual(antes);
  });
});

describe('P08 Revisar SE.12 y atributos ausentes', () => {
  test('SE.12 es un solo registro con nombre canónico y evidencia de ambos nombres', async () => {
    const { rows } = await query("SELECT nombre, nombres_origen FROM servicio_n1 WHERE codigo = 'SE.12'");
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe('Suministrar Analitica');
    expect(rows[0].nombres_origen.map((o) => [o.fila, o.nombre])).toEqual([[99, 'Suministrar Analitica'], [100, 'Mantener Tableros de Control']]);
  });

  test('SE.12.1, SE.12.2 y SE.12.3 conservan su código y sus ausencias sin inventar valores', async () => {
    const { rows } = await query(
      `SELECT s.codigo, s.codigo_normalizado, s.activo, s.clase_id, s.criticidad_id, s.tipo_id, s.metrica, s.minimo, s.maximo, s.requiere_revision, n.codigo AS n1
         FROM servicio_n2 s JOIN servicio_n1 n ON n.id = s.n1_id WHERE s.codigo LIKE 'SE.12.%' ORDER BY s.codigo`);
    expect(rows.map((r) => r.codigo)).toEqual(['SE.12.1', 'SE.12.2', 'SE.12.3']);
    for (const r of rows) {
      expect(r).toMatchObject({ activo: 'DESCONOCIDO', clase_id: null, criticidad_id: null, tipo_id: null, metrica: null, minimo: null, maximo: null, requiere_revision: true, n1: 'SE.12' });
    }
    expect(rows[0].codigo_normalizado).toBe('SE.12.01');
  });

  test('mínimo y máximo ausentes quedan nulos, nunca cero', async () => {
    const { rows: [c] } = await query("SELECT count(*) FILTER (WHERE minimo IS NULL)::int AS sin_min, count(*) FILTER (WHERE minimo = 0)::int AS ceros FROM servicio_n2 WHERE origen_hoja = 'Servicios Externos'");
    expect(c.ceros).toBe(0);
    expect(c.sin_min).toBe(44); // solo SE.01.01 y SE.05.02 traen umbral
  });

  test('la ficha del servicio expone las observaciones de SE.12', async () => {
    const admin = await comoAdmin();
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.12.3'");
    const r = await admin.get(`/api/servicios/${s.id}`).expect(200);
    expect(r.body.observaciones.map((o) => o.tipo)).toEqual(expect.arrayContaining(['CONFLICTO_NOMBRE_N1', 'N1_POR_PREFIJO', 'ATRIBUTOS_INCOMPLETOS']));
  });
});
