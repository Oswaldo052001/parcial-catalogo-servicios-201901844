'use strict';
// Configuración leída de variables de entorno. Los valores por defecto son de desarrollo local.

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.POSTGRES_USER || 'catalogo';
  const pass = process.env.POSTGRES_PASSWORD || 'catalogo';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const db = process.env.POSTGRES_DB || 'catalogo';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

module.exports = {
  databaseUrl,
  port: Number(process.env.PORT || 3000),
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  excelPath: process.env.EXCEL_PATH || 'data/CatalogoServicios.xlsx',
};
