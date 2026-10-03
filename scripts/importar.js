'use strict';
// Uso: npm run importar [-- ruta.xlsx]
// Importa (o vuelve a importar) el catálogo. Es idempotente: no duplica registros.
const { importarExcel } = require('../src/services/importador');
const { closePool } = require('../src/db/pool');

(async () => {
  try {
    const resumen = await importarExcel({ ruta: process.argv[2] });
    console.log(JSON.stringify(resumen, null, 2));
    if (!resumen.controles.ok) {
      console.error('[importar] CONTROL FALLIDO: el archivo no tiene 12 códigos N1 y 46 N2');
      process.exitCode = 2;
    } else {
      console.log(`[importar] OK importación #${resumen.importacion_id}: creados=${resumen.creados} actualizados=${resumen.actualizados} sin_cambios=${resumen.sin_cambios} omitidos=${resumen.omitidos} observados=${resumen.observados}`);
    }
  } catch (err) {
    console.error(`[importar] ERROR: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
