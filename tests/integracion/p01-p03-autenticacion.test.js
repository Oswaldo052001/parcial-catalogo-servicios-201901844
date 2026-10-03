'use strict';
const { app, request, sesion, comoAdmin, comoConsulta, crearJerarquia, crearUsuario, CUENTAS_ENV } = require('../helpers');
const { closePool, query } = require('../../src/db/pool');

afterAll(() => closePool());

describe('P01 Inicio de sesión válido e inválido', () => {
  test('acepta usuario y contraseña correctos (por nombre de usuario y por correo)', async () => {
    const r1 = await request(app).post('/api/auth/login').send({ usuario: CUENTAS_ENV.ADMIN_USUARIO, password: CUENTAS_ENV.ADMIN_PASSWORD });
    expect(r1.status).toBe(200);
    expect(r1.body.usuario.rol).toBe('administrador');
    expect(r1.headers['set-cookie'][0]).toMatch(/sid=.+HttpOnly/i);
    const r2 = await request(app).post('/api/auth/login').send({ usuario: CUENTAS_ENV.ADMIN_CORREO.toUpperCase(), password: CUENTAS_ENV.ADMIN_PASSWORD });
    expect(r2.status).toBe(200);
  });

  test('rechaza contraseña incorrecta y usuario inexistente con el mismo mensaje', async () => {
    const mala = await request(app).post('/api/auth/login').send({ usuario: CUENTAS_ENV.ADMIN_USUARIO, password: 'incorrecta123' });
    const noExiste = await request(app).post('/api/auth/login').send({ usuario: 'nadie_aqui', password: 'loquesea123' });
    expect(mala.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(mala.body.error).toBe(noExiste.body.error);
    expect(mala.headers['set-cookie']).toBeUndefined();
  });

  test('después de 5 intentos fallidos el login se bloquea temporalmente (429)', async () => {
    const usuario = `fuerza_bruta_${Date.now()}`;
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ usuario, password: 'mala12345' }).expect(401);
    await request(app).post('/api/auth/login').send({ usuario, password: 'mala12345' }).expect(429);
  });

  test('la contraseña se guarda con hash scrypt y sal, nunca en texto plano', async () => {
    const { rows } = await query('SELECT password_hash FROM usuario WHERE username = $1', [CUENTAS_ENV.ADMIN_USUARIO]);
    expect(rows[0].password_hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{88}$/);
    expect(rows[0].password_hash).not.toContain(CUENTAS_ENV.ADMIN_PASSWORD);
  });
});

describe('P02 Acceso sin sesión, cierre de sesión y usuario inactivo', () => {
  test('sin sesión: lectura y escritura protegidas devuelven 401', async () => {
    await request(app).get('/api/servicios').expect(401);
    await request(app).get('/api/usuarios').expect(401);
    await request(app).post('/api/org/empresa').send({ codigo: 'X', nombre: 'X' }).expect(401);
  });

  test('después del logout la misma cookie ya no sirve', async () => {
    const login = await request(app).post('/api/auth/login').send({ usuario: CUENTAS_ENV.CONSULTA_USUARIO, password: CUENTAS_ENV.CONSULTA_PASSWORD });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    await request(app).get('/api/servicios').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(app).get('/api/servicios').set('Cookie', cookie).expect(401);
  });

  test('usuario desactivado: no puede iniciar sesión y su sesión abierta deja de funcionar', async () => {
    const admin = await comoAdmin();
    const j = await crearJerarquia(admin);
    const u = await crearUsuario(admin, j.pue.id);
    const suSesion = await sesion(u.username, u.password);
    await suSesion.get('/api/servicios').expect(200);
    await admin.post(`/api/usuarios/${u.id}/desactivar`).send({}).expect(200);
    await suSesion.get('/api/servicios').expect(401);
    const r = await request(app).post('/api/auth/login').send({ usuario: u.username, password: u.password });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/desactivada/);
  });
});

describe('P03 Usuario de consulta intenta modificar datos', () => {
  test('puede leer datos funcionales', async () => {
    const consulta = await comoConsulta();
    const r = await consulta.get('/api/servicios?tam=5').expect(200);
    expect(r.body.total).toBeGreaterThanOrEqual(46);
    await consulta.get('/api/org/empresa').expect(200);
    await consulta.get('/api/usuarios').expect(200);
  });

  test('el servidor rechaza con 403 toda modificación', async () => {
    const consulta = await comoConsulta();
    const { rows: [s] } = await query("SELECT id FROM servicio_n2 WHERE codigo = 'SE.01.02'");
    const intentos = [
      consulta.post('/api/org/empresa').send({ codigo: 'HACK', nombre: 'No debe crearse' }),
      consulta.put(`/api/servicios/${s.id}`).send({ nombre: 'Cambiado' }),
      consulta.post(`/api/servicios/${s.id}/desactivar`).send({}),
      consulta.put(`/api/servicios/${s.id}/responsable`).send({ seccion_id: 1 }),
      consulta.post('/api/usuarios').send({ nombre: 'x', username: 'xxx', email: 'x@x.com', password: '12345678', puesto_id: 1 }),
      consulta.post('/api/importaciones').send({}),
      consulta.post('/api/catalogos/clases').send({ valor_origen: 'NUEVA' }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(403);
    const { rows: [despues] } = await query("SELECT nombre, activo FROM servicio_n2 WHERE codigo = 'SE.01.02'");
    expect(despues).toEqual({ nombre: 'Suministrar Corriente Regulada', activo: 'S' });
    const { rows: hack } = await query("SELECT 1 FROM empresa WHERE codigo = 'HACK'");
    expect(hack).toHaveLength(0);
  });

  test('ninguna respuesta de usuarios expone el hash de contraseña', async () => {
    const consulta = await comoConsulta();
    const lista = await consulta.get('/api/usuarios?tam=100').expect(200);
    const texto = JSON.stringify(lista.body);
    expect(texto).not.toMatch(/password|scrypt\$/);
    const uno = await consulta.get(`/api/usuarios/${lista.body.datos[0].id}`).expect(200);
    expect(JSON.stringify(uno.body)).not.toMatch(/password|scrypt\$/);
  });
});
