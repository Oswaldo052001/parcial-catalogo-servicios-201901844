'use strict';
const { comoAdmin, crearJerarquia, crearUsuario, unico } = require('../helpers');
const { closePool } = require('../../src/db/pool');

afterAll(() => closePool());

describe('P04 Crear una jerarquía y asignar un usuario', () => {
  test('Empresa → Área → Departamento → Sección → Puesto → Usuario queda relacionado y recuperable', async () => {
    const admin = await comoAdmin();
    const j = await crearJerarquia(admin);
    const u = await crearUsuario(admin, j.pue.id);
    const r = await admin.get(`/api/usuarios/${u.id}`).expect(200);
    expect(r.body).toMatchObject({
      puesto_id: j.pue.id, seccion_id: j.sec.id, departamento_id: j.dep.id, area_id: j.area.id, empresa_id: j.emp.id, empresa: j.emp.nombre,
    });
    const filtrados = await admin.get(`/api/usuarios?empresa_id=${j.emp.id}`).expect(200);
    expect(filtrados.body.datos.map((x) => x.id)).toEqual([u.id]);
    const puestos = await admin.get(`/api/org/puesto?padre_id=${j.sec.id}`).expect(200);
    expect(puestos.body[0].ruta).toContain(j.emp.nombre);
  });

  test('no permite asociar a un padre inactivo ni desactivar en silencio un padre con dependientes', async () => {
    const admin = await comoAdmin();
    const j = await crearJerarquia(admin);
    await crearUsuario(admin, j.pue.id);
    const bloqueo = await admin.post(`/api/org/seccion/${j.sec.id}/desactivar`).send({});
    expect(bloqueo.status).toBe(409);
    expect(bloqueo.body.error).toMatch(/tiene 1 registro/);
    const cascada = await admin.post(`/api/org/seccion/${j.sec.id}/desactivar`).send({ cascada: true }).expect(200);
    expect(cascada.body.desactivados.puesto).toHaveLength(1);
    expect(cascada.body.desactivados.usuario).toHaveLength(1);
    const nuevo = await admin.post('/api/org/puesto').send({ codigo: 'P2', nombre: 'Otro', seccion_id: j.sec.id });
    expect(nuevo.status).toBe(409);
    expect(nuevo.body.error).toMatch(/inactiv/);
    // Los registros siguen existiendo (baja lógica)
    const secc = await admin.get(`/api/org/seccion/${j.sec.id}`).expect(200);
    expect(secc.body.activo).toBe(false);
  });
});

describe('P05 Código duplicado o referencia inexistente', () => {
  test('rechaza empresa con código duplicado con mensaje comprensible', async () => {
    const admin = await comoAdmin();
    const codigo = unico('D');
    await admin.post('/api/org/empresa').send({ codigo, nombre: 'Primera' }).expect(201);
    const r = await admin.post('/api/org/empresa').send({ codigo, nombre: 'Segunda' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Ya existe una empresa con ese código.');
  });

  test('el mismo código de área se permite en otra empresa pero no dos veces en la misma', async () => {
    const admin = await comoAdmin();
    const a = await crearJerarquia(admin);
    const b = await crearJerarquia(admin);
    await admin.post('/api/org/area').send({ codigo: 'AR', nombre: 'Repetida', empresa_id: b.emp.id }).expect(409);
    await admin.post('/api/org/area').send({ codigo: 'NUEVA', nombre: 'Ok', empresa_id: a.emp.id }).expect(201);
  });

  test('rechaza servicio con código duplicado y referencias inexistentes', async () => {
    const admin = await comoAdmin();
    const dup = await admin.post('/api/servicios').send({ codigo: 'SE.01.01', nombre: 'Duplicado', n1_id: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Ya existe un servicio de nivel 2 con ese código.');
    const equivalente = await admin.post('/api/servicios').send({ codigo: 'SE.1.1', nombre: 'Equivalente', n1_id: 1 });
    expect(equivalente.status).toBe(409);
    const n1 = await admin.post('/api/servicios').send({ codigo: unico('X'), nombre: 'Sin padre', n1_id: 999999 });
    expect(n1.status).toBe(400);
    expect(n1.body.error).toMatch(/No existe el servicio de nivel 1/);
    const clase = await admin.post('/api/servicios').send({ codigo: unico('X'), nombre: 'Clase mala', n1_id: 1, clase_id: 999999 });
    expect(clase.status).toBe(400);
    expect(clase.body.error).toMatch(/No existe la clase/);
  });

  test('rechaza usuario con correo duplicado o puesto inexistente', async () => {
    const admin = await comoAdmin();
    const j = await crearJerarquia(admin);
    const u = await crearUsuario(admin, j.pue.id);
    const dup = await admin.post('/api/usuarios').send({ nombre: 'Otro', username: unico('o').toLowerCase(), email: u.email.toUpperCase(), password: 'Clave#Prueba1', puesto_id: j.pue.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Ya existe un usuario con ese correo.');
    const sinPuesto = await admin.post('/api/usuarios').send({ nombre: 'Otro', username: unico('o').toLowerCase(), email: `${unico('o')}@x.com`, password: 'Clave#Prueba1', puesto_id: 999999 });
    expect(sinPuesto.status).toBe(400);
    expect(sinPuesto.body.error).toMatch(/No existe el puesto/);
    const huerfano = await admin.post('/api/org/area').send({ codigo: 'Z', nombre: 'Huérfana', empresa_id: 999999 });
    expect(huerfano.status).toBe(400);
  });
});
