-- 003_integridad_adicional.sql
-- Restricciones agregadas después de la revisión del modelo (prompt 02, docs/prompts/02-diseno-modelo.md).
-- Llevan a la base reglas que antes solo validaba la aplicación.

-- H5: el código normalizado de nivel 1 también debe ser único (SE.1 y SE.01 serían el mismo servicio).
ALTER TABLE servicio_n1 ADD CONSTRAINT servicio_n1_codigo_norm_uk UNIQUE (codigo_normalizado);

-- H4 (parcial): el mapeo de etiquetas solo puede referirse a los tres catálogos existentes.
ALTER TABLE mapeo_etiqueta ADD CONSTRAINT mapeo_etiqueta_catalogo_ck
  CHECK (catalogo IN ('clase_servicio', 'criticidad', 'tipo_servicio'));

-- H2: no se puede crear un registro (ni moverlo) bajo un padre inactivo.
CREATE FUNCTION fn_padre_activo() RETURNS trigger AS $$
DECLARE
  padre_activo BOOLEAN;
  fk TEXT := TG_ARGV[0];
  tabla_padre TEXT := TG_ARGV[1];
  padre_id INTEGER;
BEGIN
  EXECUTE format('SELECT ($1).%I', fk) INTO padre_id USING NEW;
  IF TG_OP = 'UPDATE' THEN
    -- Solo se valida si cambia el padre o si se reactiva el registro.
    IF padre_id IS NOT DISTINCT FROM (SELECT (row_to_json(OLD) ->> fk)::int) AND NOT (NEW.activo AND NOT OLD.activo) THEN
      RETURN NEW;
    END IF;
  END IF;
  EXECUTE format('SELECT activo FROM %I WHERE id = $1', tabla_padre) INTO padre_activo USING padre_id;
  IF padre_activo IS FALSE AND NEW.activo THEN
    RAISE EXCEPTION 'No se puede asociar un registro activo a un padre inactivo (%.%)', tabla_padre, padre_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'padre_inactivo_ck';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_area_padre_activo BEFORE INSERT OR UPDATE ON area
  FOR EACH ROW EXECUTE FUNCTION fn_padre_activo('empresa_id', 'empresa');
CREATE TRIGGER trg_departamento_padre_activo BEFORE INSERT OR UPDATE ON departamento
  FOR EACH ROW EXECUTE FUNCTION fn_padre_activo('area_id', 'area');
CREATE TRIGGER trg_seccion_padre_activo BEFORE INSERT OR UPDATE ON seccion
  FOR EACH ROW EXECUTE FUNCTION fn_padre_activo('departamento_id', 'departamento');
CREATE TRIGGER trg_puesto_padre_activo BEFORE INSERT OR UPDATE ON puesto
  FOR EACH ROW EXECUTE FUNCTION fn_padre_activo('seccion_id', 'seccion');
CREATE TRIGGER trg_usuario_padre_activo BEFORE INSERT OR UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_padre_activo('puesto_id', 'puesto');

-- H1: mover un usuario a un puesto de otra sección, o un puesto a otra sección, no puede dejar
-- servicios con un responsable que ya no pertenece a la sección responsable.
CREATE FUNCTION fn_usuario_mueve_seccion() RETURNS trigger AS $$
BEGIN
  IF NEW.puesto_id IS DISTINCT FROM OLD.puesto_id AND EXISTS (
       SELECT 1 FROM servicio_n2 s
        WHERE s.usuario_responsable_id = NEW.id
          AND s.seccion_responsable_id IS DISTINCT FROM (SELECT seccion_id FROM puesto WHERE id = NEW.puesto_id)) THEN
    RAISE EXCEPTION 'El usuario es responsable de servicios de su sección actual; reasígnelos antes de moverlo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'usuario_responsable_mueve_ck';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuario_mueve_seccion BEFORE UPDATE OF puesto_id ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_usuario_mueve_seccion();

CREATE FUNCTION fn_puesto_mueve_seccion() RETURNS trigger AS $$
BEGIN
  IF NEW.seccion_id IS DISTINCT FROM OLD.seccion_id AND EXISTS (
       SELECT 1 FROM servicio_n2 s JOIN usuario u ON u.id = s.usuario_responsable_id
        WHERE u.puesto_id = NEW.id AND s.seccion_responsable_id IS DISTINCT FROM NEW.seccion_id) THEN
    RAISE EXCEPTION 'El puesto tiene usuarios responsables de servicios de su sección actual; reasígnelos antes de moverlo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'puesto_responsable_mueve_ck';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_puesto_mueve_seccion BEFORE UPDATE OF seccion_id ON puesto
  FOR EACH ROW EXECUTE FUNCTION fn_puesto_mueve_seccion();
