'use strict';
// Errores HTTP con mensajes comprensibles y traducción de errores de PostgreSQL.

class HttpError extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

const MENSAJES_RESTRICCION = {
  empresa_codigo_uk: 'Ya existe una empresa con ese código.',
  area_codigo_uk: 'Ya existe un área con ese código en la empresa indicada.',
  departamento_codigo_uk: 'Ya existe un departamento con ese código en el área indicada.',
  seccion_codigo_uk: 'Ya existe una sección con ese código en el departamento indicado.',
  puesto_codigo_uk: 'Ya existe un puesto con ese código en la sección indicada.',
  usuario_username_uk: 'Ya existe un usuario con ese nombre de usuario.',
  usuario_email_uk: 'Ya existe un usuario con ese correo.',
  usuario_username_ck: 'El nombre de usuario debe tener de 3 a 60 caracteres (letras, números, punto, guion o guion bajo).',
  usuario_email_ck: 'El correo no tiene un formato válido.',
  usuario_rol_ck: 'El rol debe ser "administrador" o "consulta".',
  servicio_n1_codigo_uk: 'Ya existe un servicio de nivel 1 con ese código.',
  servicio_n2_codigo_uk: 'Ya existe un servicio de nivel 2 con ese código.',
  servicio_n2_codigo_norm_uk: 'Ya existe un servicio de nivel 2 con un código equivalente (por ejemplo SE.12.1 y SE.12.01).',
  servicio_n2_umbral_ck: 'El mínimo no puede ser mayor que el máximo.',
  servicio_n2_activo_ck: 'El estado debe ser S, N o DESCONOCIDO.',
  servicio_n2_responsable_ck: 'Para asignar un usuario responsable primero debe indicar la sección responsable.',
  servicio_n2_responsable_seccion_ck: 'El usuario responsable no pertenece a la sección responsable.',
  servicio_n1_codigo_norm_uk: 'Ya existe un servicio de nivel 1 con un código equivalente (por ejemplo SE.1 y SE.01).',
  padre_inactivo_ck: 'No se puede asociar un registro activo a un registro superior inactivo.',
  usuario_responsable_mueve_ck: 'El usuario es responsable de servicios de su sección actual. Reasígnelos antes de moverlo a otra sección.',
  puesto_responsable_mueve_ck: 'El puesto tiene usuarios responsables de servicios de su sección actual. Reasígnelos antes de moverlo a otra sección.',
  clase_servicio_valor_origen_key: 'Ya existe una clase con ese valor.',
  criticidad_valor_origen_key: 'Ya existe una criticidad con ese valor.',
  tipo_servicio_valor_origen_key: 'Ya existe un tipo de servicio con ese valor.',
};

function traducirErrorPg(err) {
  if (err instanceof HttpError) return err;
  const msg = MENSAJES_RESTRICCION[err.constraint];
  switch (err.code) {
    case '23505': return new HttpError(409, msg || 'Ya existe un registro con esos datos.', { restriccion: err.constraint });
    case '23503': return new HttpError(400, 'La referencia indicada no existe o el registro tiene dependencias.', { restriccion: err.constraint });
    case '23514': return new HttpError(400, msg || 'Los datos no cumplen una regla de validación.', { restriccion: err.constraint });
    case '23502': return new HttpError(400, `Falta el campo obligatorio "${err.column}".`);
    case '22P02': return new HttpError(400, 'Algún valor tiene un formato inválido.');
    case '22001': return new HttpError(400, 'Algún texto excede la longitud permitida.');
    default: return null;
  }
}

function manejadorErrores(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
  const http = traducirErrorPg(err);
  if (http) return res.status(http.status).json({ error: http.message, ...http.extra });
  console.error('[error]', err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = { HttpError, traducirErrorPg, manejadorErrores };
