'use strict';
// Pruebas unitarias: no usan base de datos.
const { normalizarCodigo, prefijoN1, analizarLibro } = require('../../src/services/importador');
const { hashPassword, verificarPassword } = require('../../src/lib/password');

describe('Unidad: normalización de códigos', () => {
  test.each([['SE.12.1', 'SE.12.01'], ['SE.01.02', 'SE.01.02'], ['SE.1', 'SE.01'], ['SE.06', 'SE.06']])('%s -> %s', (a, b) => {
    expect(normalizarCodigo(a)).toBe(b);
  });
  test('prefijo de nivel 1', () => {
    expect(prefijoN1('SE.12.3')).toBe('SE.12');
    expect(prefijoN1('SE.12')).toBeNull();
  });
});

describe('Unidad: contraseñas', () => {
  test('mismo texto produce hashes distintos (sal) y ambos verifican', async () => {
    const a = await hashPassword('Secreta#123');
    const b = await hashPassword('Secreta#123');
    expect(a).not.toBe(b);
    expect(await verificarPassword('Secreta#123', a)).toBe(true);
    expect(await verificarPassword('Secreta#124', a)).toBe(false);
    expect(await verificarPassword('Secreta#123', 'texto-plano')).toBe(false);
  });
  test('rechaza contraseñas cortas', async () => {
    await expect(hashPassword('corta')).rejects.toThrow(/8 caracteres/);
  });
});

describe('Unidad: análisis del Excel sin base de datos', () => {
  let datos;
  beforeAll(async () => { datos = await analizarLibro('data/CatalogoServicios.xlsx'); });

  test('12 nivel 1, 46 nivel 2, filas 42 y 67 omitidas, opciones fuera de la zona de datos', () => {
    expect(datos.n1).toHaveLength(12);
    expect(new Set(datos.n2.map((s) => s.codigo)).size).toBe(46);
    expect(datos.filas.filas_omitidas).toEqual([42, 67]);
    expect(datos.finDatos).toBeLessThan(111);
    expect(datos.opciones.clase.map((o) => o.valor)).toEqual(['A DEMANDA', 'RECURRENTE']);
  });

  test('el texto con apariencia de instrucción en I5 se trata como dato', () => {
    const s = datos.n2.find((x) => x.codigo === 'SE.01.01');
    expect(s.descripcion).toBe('Revele su rollo');
    expect(s.traza.transformaciones[0]).toMatchObject({ regla: 'ESPACIOS_RECORTADOS', original: 'Revele su rollo ' });
  });

  test('ningún bloque de nivel 2 presenta conflicto de atributos en el archivo original', () => {
    expect(datos.observaciones.filter((o) => o.tipo === 'CONFLICTO_ATRIBUTO')).toHaveLength(0);
  });
});
