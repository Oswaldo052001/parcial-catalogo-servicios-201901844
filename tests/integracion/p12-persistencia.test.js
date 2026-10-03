'use strict';
// P12 a nivel de aplicación: lo escrito sobrevive al cierre total de las conexiones (equivale a reiniciar el proceso).
// La verificación con reinicio real de contenedores está en scripts/p12-persistencia.sh / .ps1.
const { comoAdmin, unico } = require('../helpers');
const { closePool, query } = require('../../src/db/pool');

afterAll(() => closePool());

describe('P12 Persistencia de datos', () => {
  test('un registro creado sigue existiendo después de cerrar y reabrir el pool de conexiones', async () => {
    const admin = await comoAdmin();
    const codigo = unico('P12');
    await admin.post('/api/org/empresa').send({ codigo, nombre: 'Persistencia' }).expect(201);
    await closePool();
    const { rows } = await query('SELECT nombre FROM empresa WHERE codigo = $1', [codigo]);
    expect(rows).toEqual([{ nombre: 'Persistencia' }]);
  });
});
