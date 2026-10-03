'use strict';
// Se ejecuta antes de cada archivo de pruebas: apunta la aplicación a la base de pruebas.
const { urlPruebas, verificarSegura } = require('./db-test');

const url = urlPruebas();
verificarSegura(url);
process.env.DATABASE_URL = url;
