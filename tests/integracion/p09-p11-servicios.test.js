'use strict';
const { comoAdmin, comoConsulta, crearJerarquia, crearUsuario, unico } = require('../helpers');
const { closePool, query } = require('../../src/db/pool');

afterAll(() => closePool());

describe('P09 Crear o editar servicio con mínimo mayor que máximo', () => {
  test('la creación se rechaza y no se guarda', async () => {
    const admin = await comoAdmin();
    const codigo = unico('SE.T');
    const r = await admin.post('/api/servicios').send({ codigo, nombre: 'Umbral inválido', n1_id: 1, minimo: 50, maximo: 10 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/mínimo \(50\) no puede ser mayor que el máximo \(10\)/);
    const { rows } = await query('SELECT 1 FROM servicio_n2 WHERE codigo = $1', [codigo]);
    expect(rows).toHaveLength(0);
  });

  test('la edición se rechaza y conserva los valores anteriores', async () => {
    const admin = await comoAdmin();
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.05.02'");
    const r = await admin.put(`/api/servicios/${s.id}`).send({ minimo: 30 });
    expect(r.status).toBe(400);
    const { rows: [d] } = await query('SELECT minimo, maximo FROM servicio_n2 WHERE id = $1', [s.id]);
    expect(d).toEqual({ minimo: 12, maximo: 24 });
  });

  test('la base de datos también lo impide (restricción CHECK)', async () => {
    await expect(query("UPDATE servicio_n2 SET minimo = 99, maximo = 1 WHERE codigo = 'SE.05.02'")).rejects.toThrow(/servicio_n2_umbral_ck/);
  });

  test('un umbral vacío se guarda como nulo y mínimo = máximo es válido', async () => {
    const admin = await comoAdmin();
    const r = await admin.post('/api/servicios').send({ codigo: unico('SE.T'), nombre: 'Umbral parcial', n1_id: 1, minimo: '', maximo: 5 }).expect(201);
    expect(r.body.minimo).toBeNull();
    expect(r.body.maximo).toBe(5);
    await admin.put(`/api/servicios/${r.body.id}`).send({ minimo: 5 }).expect(200);
  });
});

describe('P10 Buscar y filtrar servicios', () => {
  test('búsqueda por código y por nombre', async () => {
    const c = await comoConsulta();
    const porCodigo = await c.get('/api/servicios?q=SE.06.0&tam=100').expect(200);
    expect(porCodigo.body.datos.every((s) => s.codigo.startsWith('SE.06.0'))).toBe(true);
    expect(porCodigo.body.total).toBe(9);
    const porNombre = await c.get('/api/servicios?q=telefon&tam=100').expect(200);
    expect(porNombre.body.datos.map((s) => s.codigo).sort()).toEqual(['SE.04.03', 'SE.08.04']);
  });

  test('filtros por nivel 1, estado, clase, criticidad y tipo son coherentes', async () => {
    const c = await comoConsulta();
    const { rows: [n1] } = await query("SELECT id FROM servicio_n1 WHERE codigo = 'SE.09'");
    const r1 = await c.get(`/api/servicios?n1_id=${n1.id}&tam=100`).expect(200);
    expect(r1.body.total).toBe(5);
    const inactivos = await c.get('/api/servicios?activo=N&tam=100').expect(200);
    expect(inactivos.body.datos.map((s) => s.codigo)).toContain('SE.05.01');
    expect(inactivos.body.datos.every((s) => s.activo === 'N')).toBe(true);
    const desconocidos = await c.get('/api/servicios?activo=DESCONOCIDO&tam=100').expect(200);
    expect(desconocidos.body.datos.map((s) => s.codigo)).toEqual(['SE.12.1', 'SE.12.2', 'SE.12.3']);
    const { rows: [high] } = await query("SELECT id FROM criticidad WHERE valor_origen = 'High'");
    const { rows: [proj] } = await query("SELECT id FROM tipo_servicio WHERE valor_origen = 'Project'");
    const { rows: [rec] } = await query("SELECT id FROM clase_servicio WHERE valor_origen = 'RECURRENTE'");
    const combinado = await c.get(`/api/servicios?criticidad_id=${high.id}&tipo_id=${proj.id}&clase_id=${rec.id}`).expect(200);
    expect(combinado.body.datos.map((s) => s.codigo)).toEqual(['SE.11.03']);
    const sinTipo = await c.get('/api/servicios?tipo_id=sin_dato&tam=100').expect(200);
    expect(sinTipo.body.datos.every((s) => s.tipo_id === null)).toBe(true);
    expect(sinTipo.body.datos.map((s) => s.codigo)).toEqual(expect.arrayContaining(['SE.12.1', 'SE.12.2', 'SE.12.3']));
  });

  test('paginación sin repetir ni perder registros', async () => {
    const c = await comoConsulta();
    const vistos = new Set();
    for (let p = 1; p <= 4; p++) {
      const r = await c.get(`/api/servicios?n1_id=&pagina=${p}&tam=15&q=SE.`).expect(200);
      r.body.datos.forEach((s) => vistos.add(s.codigo));
    }
    const { rows: [t] } = await query("SELECT count(*)::int AS n FROM servicio_n2 WHERE codigo ILIKE '%SE.%'");
    expect(vistos.size).toBe(t.n);
  });
});

describe('P11 Asignar responsable de una sección distinta', () => {
  test('rechaza un usuario que no pertenece a la sección responsable', async () => {
    const admin = await comoAdmin();
    const a = await crearJerarquia(admin);
    const b = await crearJerarquia(admin);
    const deB = await crearUsuario(admin, b.pue.id);
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.02.04'");
    const r = await admin.put(`/api/servicios/${s.id}/responsable`).send({ seccion_id: a.sec.id, usuario_id: deB.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/pertenece a la sección .* no a /);
    const { rows: [d] } = await query('SELECT seccion_responsable_id FROM servicio_n2 WHERE id = $1', [s.id]);
    expect(d.seccion_responsable_id).toBeNull();
  });

  test('acepta un usuario de la misma sección y el trigger protege la base', async () => {
    const admin = await comoAdmin();
    const a = await crearJerarquia(admin);
    const b = await crearJerarquia(admin);
    const deA = await crearUsuario(admin, a.pue.id);
    const deB = await crearUsuario(admin, b.pue.id);
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.02.05'");
    const ok = await admin.put(`/api/servicios/${s.id}/responsable`).send({ seccion_id: a.sec.id, usuario_id: deA.id }).expect(200);
    expect(ok.body).toMatchObject({ seccion_responsable_id: a.sec.id, usuario_responsable_id: deA.id });
    await expect(query('UPDATE servicio_n2 SET usuario_responsable_id = $1 WHERE id = $2', [deB.id, s.id]))
      .rejects.toThrow(/no pertenece a la sección responsable/);
    const usuario = await admin.get(`/api/usuarios/${deA.id}`).expect(200);
    expect(usuario.body.servicios.map((x) => x.id)).toEqual([s.id]);
  });

  test('no se puede mover a otra sección a un usuario o puesto que es responsable (API y base de datos)', async () => {
    const admin = await comoAdmin();
    const a = await crearJerarquia(admin);
    const b = await crearJerarquia(admin);
    const deA = await crearUsuario(admin, a.pue.id);
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.04.02'");
    await admin.put(`/api/servicios/${s.id}/responsable`).send({ seccion_id: a.sec.id, usuario_id: deA.id }).expect(200);
    const mover = await admin.put(`/api/usuarios/${deA.id}`).send({ puesto_id: b.pue.id });
    expect(mover.status).toBe(409);
    const moverPuesto = await admin.put(`/api/org/puesto/${a.pue.id}`).send({ seccion_id: b.sec.id });
    expect(moverPuesto.status).toBe(400);
    expect(moverPuesto.body.error).toMatch(/Reasígnelos/);
    await expect(query('UPDATE usuario SET puesto_id = $1 WHERE id = $2', [b.pue.id, deA.id])).rejects.toThrow(/reasígnelos/);
  });

  test('rechaza asignar a una sección inactiva', async () => {
    const admin = await comoAdmin();
    const a = await crearJerarquia(admin);
    await admin.post(`/api/org/seccion/${a.sec.id}/desactivar`).send({ cascada: true }).expect(200);
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.02.06'");
    const r = await admin.put(`/api/servicios/${s.id}/responsable`).send({ seccion_id: a.sec.id });
    expect(r.status).toBe(409);
  });

  test('los datos de demostración incluyen al menos tres asignaciones válidas', async () => {
    const { rows } = await query(
      `SELECT s.codigo FROM servicio_n2 s JOIN usuario u ON u.id = s.usuario_responsable_id JOIN puesto p ON p.id = u.puesto_id
        WHERE p.seccion_id = s.seccion_responsable_id`);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});
