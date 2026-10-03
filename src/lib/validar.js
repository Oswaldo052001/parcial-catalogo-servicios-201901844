'use strict';
// Validaciones de entrada del lado del servidor.
const { HttpError } = require('./errores');

function textoObligatorio(body, campo, etiqueta, max = 150) {
  const v = body[campo];
  if (v === undefined || v === null || String(v).trim() === '') throw new HttpError(400, `El campo "${etiqueta}" es obligatorio.`);
  const t = String(v).trim();
  if (t.length > max) throw new HttpError(400, `El campo "${etiqueta}" admite máximo ${max} caracteres.`);
  return t;
}

function textoOpcional(body, campo, etiqueta, max = 2000) {
  const v = body[campo];
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const t = String(v).trim();
  if (t.length > max) throw new HttpError(400, `El campo "${etiqueta}" admite máximo ${max} caracteres.`);
  return t;
}

function entero(valor, etiqueta, { obligatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new HttpError(400, `El campo "${etiqueta}" es obligatorio.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `El campo "${etiqueta}" debe ser un identificador válido.`);
  return n;
}

// Número opcional: vacío -> null (nunca 0).
function numeroOpcional(valor, etiqueta) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) throw new HttpError(400, `El campo "${etiqueta}" debe ser numérico.`);
  return n;
}

function idParam(req) {
  return entero(req.params.id, 'id', { obligatorio: true });
}

function booleano(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  return valor === true || valor === 'true' || valor === '1';
}

function paginacion(query) {
  const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
  const tam = Math.min(100, Math.max(1, Number.parseInt(query.tam, 10) || 20));
  return { pagina, tam, offset: (pagina - 1) * tam };
}

module.exports = { textoObligatorio, textoOpcional, entero, numeroOpcional, idParam, booleano, paginacion };
