'use strict';
// URL de la base EXCLUSIVA de pruebas. Nunca apunta a la base de evaluación:
// si el nombre no termina en "_test", las pruebas se niegan a correr.
const { databaseUrl } = require('../src/config');

function urlPruebas() {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const u = new URL(databaseUrl());
  const nombre = u.pathname.replace('/', '');
  // global-setup deja DATABASE_URL apuntando ya a la base de pruebas; con --runInBand los archivos de
  // prueba corren en el mismo proceso y no se debe agregar "_test" otra vez (catalogo_test_test).
  if (!nombre.endsWith('_test')) u.pathname = `/${nombre}_test`;
  return u.toString();
}

function verificarSegura(url) {
  const nombre = new URL(url).pathname.replace('/', '');
  if (!nombre.endsWith('_test')) {
    throw new Error(`Por seguridad las pruebas solo corren contra una base cuyo nombre termina en "_test" (se recibió "${nombre}").`);
  }
  return nombre;
}

module.exports = { urlPruebas, verificarSegura };
