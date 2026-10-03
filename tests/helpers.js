'use strict';
const request = require('supertest');
const { crearApp } = require('../src/app');
const { CUENTAS_ENV } = require('./datos-prueba');

const app = crearApp();

// Devuelve un agente de supertest que conserva la cookie de sesión.
async function sesion(usuario, password) {
  const agente = request.agent(app);
  const r = await agente.post('/api/auth/login').send({ usuario, password });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${usuario}: ${r.status} ${JSON.stringify(r.body)}`);
  return agente;
}
const comoAdmin = () => sesion(CUENTAS_ENV.ADMIN_USUARIO, CUENTAS_ENV.ADMIN_PASSWORD);
const comoConsulta = () => sesion(CUENTAS_ENV.CONSULTA_USUARIO, CUENTAS_ENV.CONSULTA_PASSWORD);

// Sufijo único para que cada prueba cree sus propios códigos y no choque con otras.
const unico = (p = 'T') => `${p}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();

// Crea Empresa -> Área -> Departamento -> Sección -> Puesto y devuelve sus ids.
async function crearJerarquia(admin, sufijo = unico()) {
  const emp = (await admin.post('/api/org/empresa').send({ codigo: `E${sufijo}`.slice(0, 20), nombre: `Empresa ${sufijo}` }).expect(201)).body;
  const area = (await admin.post('/api/org/area').send({ codigo: 'AR', nombre: 'Área prueba', empresa_id: emp.id }).expect(201)).body;
  const dep = (await admin.post('/api/org/departamento').send({ codigo: 'DP', nombre: 'Depto prueba', area_id: area.id }).expect(201)).body;
  const sec = (await admin.post('/api/org/seccion').send({ codigo: 'SC', nombre: `Sección ${sufijo}`, departamento_id: dep.id }).expect(201)).body;
  const pue = (await admin.post('/api/org/puesto').send({ codigo: 'PU', nombre: 'Puesto prueba', seccion_id: sec.id }).expect(201)).body;
  return { emp, area, dep, sec, pue, sufijo };
}

async function crearUsuario(admin, puestoId, extra = {}) {
  const u = unico('u').toLowerCase();
  const r = await admin.post('/api/usuarios').send({
    nombre: `Usuario ${u}`, username: u, email: `${u}@pruebas.local`, password: 'Clave#Prueba1', rol: 'consulta', puesto_id: puestoId, ...extra,
  });
  if (r.status !== 201) throw new Error(`No se creó el usuario: ${JSON.stringify(r.body)}`);
  return { ...r.body, password: extra.password || 'Clave#Prueba1' };
}

module.exports = { app, request, sesion, comoAdmin, comoConsulta, unico, crearJerarquia, crearUsuario, CUENTAS_ENV };
