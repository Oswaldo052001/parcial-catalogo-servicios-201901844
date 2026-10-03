-- 002_vistas_jerarquia.sql
-- Vistas que resuelven la jerarquía completa. La empresa de un usuario se obtiene
-- siempre de esta cadena (puesto -> sección -> departamento -> área -> empresa);
-- no existe una columna empresa_id en usuario, así no puede haber relaciones contradictorias.

CREATE VIEW v_seccion AS
SELECT s.id, s.codigo, s.nombre, s.activo,
       d.id AS departamento_id, d.nombre AS departamento, d.activo AS departamento_activo,
       a.id AS area_id, a.nombre AS area, a.activo AS area_activo,
       e.id AS empresa_id, e.nombre AS empresa, e.activo AS empresa_activo,
       e.codigo || ' / ' || a.codigo || ' / ' || d.codigo || ' / ' || s.codigo AS ruta_codigos,
       e.nombre || ' › ' || a.nombre || ' › ' || d.nombre || ' › ' || s.nombre AS ruta
  FROM seccion s
  JOIN departamento d ON d.id = s.departamento_id
  JOIN area a ON a.id = d.area_id
  JOIN empresa e ON e.id = a.empresa_id;

CREATE VIEW v_puesto AS
SELECT p.id, p.codigo, p.nombre, p.activo,
       vs.id AS seccion_id, vs.nombre AS seccion, vs.activo AS seccion_activo,
       vs.departamento_id, vs.departamento, vs.area_id, vs.area, vs.empresa_id, vs.empresa,
       vs.ruta || ' › ' || p.nombre AS ruta
  FROM puesto p
  JOIN v_seccion vs ON vs.id = p.seccion_id;

-- Usuario sin password_hash: es la única forma en que la API lee usuarios.
CREATE VIEW v_usuario AS
SELECT u.id, u.nombre, u.username, u.email, u.rol, u.activo, u.creado_en, u.actualizado_en,
       vp.id AS puesto_id, vp.nombre AS puesto, vp.seccion_id, vp.seccion, vp.departamento_id,
       vp.departamento, vp.area_id, vp.area, vp.empresa_id, vp.empresa, vp.ruta
  FROM usuario u
  JOIN v_puesto vp ON vp.id = u.puesto_id;
