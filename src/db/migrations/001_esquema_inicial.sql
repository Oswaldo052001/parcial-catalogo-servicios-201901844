-- 001_esquema_inicial.sql
-- Esquema del sistema de gestión del catálogo de servicios de TI.
-- Jerarquía organizacional: empresa -> area -> departamento -> seccion -> puesto -> usuario.
-- Bajas lógicas: ninguna tabla funcional se borra físicamente desde la aplicación (columna activo).

-- ===================== Estructura organizacional =====================

CREATE TABLE empresa (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT empresa_codigo_uk UNIQUE (codigo),
  CONSTRAINT empresa_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT empresa_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE area (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER      NOT NULL REFERENCES empresa(id) ON DELETE RESTRICT,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT area_codigo_uk UNIQUE (empresa_id, codigo),
  CONSTRAINT area_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT area_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE departamento (
  id             SERIAL PRIMARY KEY,
  area_id        INTEGER      NOT NULL REFERENCES area(id) ON DELETE RESTRICT,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT departamento_codigo_uk UNIQUE (area_id, codigo),
  CONSTRAINT departamento_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT departamento_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE seccion (
  id              SERIAL PRIMARY KEY,
  departamento_id INTEGER      NOT NULL REFERENCES departamento(id) ON DELETE RESTRICT,
  codigo          VARCHAR(20)  NOT NULL,
  nombre          VARCHAR(150) NOT NULL,
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT seccion_codigo_uk UNIQUE (departamento_id, codigo),
  CONSTRAINT seccion_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT seccion_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE puesto (
  id             SERIAL PRIMARY KEY,
  seccion_id     INTEGER      NOT NULL REFERENCES seccion(id) ON DELETE RESTRICT,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT puesto_codigo_uk UNIQUE (seccion_id, codigo),
  CONSTRAINT puesto_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT puesto_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE usuario (
  id             SERIAL PRIMARY KEY,
  puesto_id      INTEGER      NOT NULL REFERENCES puesto(id) ON DELETE RESTRICT,
  nombre         VARCHAR(150) NOT NULL,
  username       VARCHAR(60)  NOT NULL,
  email          VARCHAR(150) NOT NULL,
  password_hash  TEXT         NOT NULL,
  rol            VARCHAR(20)  NOT NULL DEFAULT 'consulta',
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT usuario_rol_ck CHECK (rol IN ('administrador', 'consulta')),
  CONSTRAINT usuario_nombre_ck CHECK (btrim(nombre) <> ''),
  CONSTRAINT usuario_username_ck CHECK (username ~ '^[A-Za-z0-9._-]{3,60}$'),
  CONSTRAINT usuario_email_ck CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- el hash siempre tiene el formato scrypt$N$r$p$sal$hash: nunca texto plano
  CONSTRAINT usuario_hash_ck CHECK (password_hash LIKE 'scrypt$%')
);
CREATE UNIQUE INDEX usuario_username_uk ON usuario (lower(username));
CREATE UNIQUE INDEX usuario_email_uk ON usuario (lower(email));

-- ===================== Sesiones =====================

CREATE TABLE sesion (
  id          SERIAL PRIMARY KEY,
  token_hash  CHAR(64)    NOT NULL UNIQUE,  -- SHA-256 del token; el token en claro solo vive en la cookie
  usuario_id  INTEGER     NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ NOT NULL
);
CREATE INDEX sesion_usuario_ix ON sesion (usuario_id);

-- ===================== Catálogos controlados =====================
-- valor_origen: texto exacto del Excel (se conserva). etiqueta: texto mostrado.
-- Si etiqueta difiere de valor_origen, el cambio queda registrado en mapeo_etiqueta.

CREATE TABLE clase_servicio (
  id           SERIAL PRIMARY KEY,
  valor_origen VARCHAR(60) NOT NULL UNIQUE,
  etiqueta     VARCHAR(60) NOT NULL,
  activo       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE criticidad (
  id           SERIAL PRIMARY KEY,
  valor_origen VARCHAR(60) NOT NULL UNIQUE,
  etiqueta     VARCHAR(60) NOT NULL,
  orden        SMALLINT    NOT NULL,
  activo       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_servicio (
  id           SERIAL PRIMARY KEY,
  valor_origen VARCHAR(60) NOT NULL UNIQUE,
  etiqueta     VARCHAR(60) NOT NULL,
  activo       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE mapeo_etiqueta (
  id           SERIAL PRIMARY KEY,
  catalogo     VARCHAR(30)  NOT NULL,  -- clase_servicio | criticidad | tipo_servicio
  valor_origen VARCHAR(60)  NOT NULL,
  etiqueta     VARCHAR(60)  NOT NULL,
  motivo       VARCHAR(250) NOT NULL,
  CONSTRAINT mapeo_etiqueta_uk UNIQUE (catalogo, valor_origen)
);

-- ===================== Catálogo de servicios =====================

CREATE TABLE servicio_n1 (
  id                 SERIAL PRIMARY KEY,
  codigo             VARCHAR(20)  NOT NULL,          -- código tal como viene (texto)
  codigo_normalizado VARCHAR(20)  NOT NULL,          -- solo para ordenar (SE.12 -> SE.12)
  nombre             VARCHAR(200) NOT NULL,
  activo             BOOLEAN      NOT NULL DEFAULT TRUE,
  requiere_revision  BOOLEAN      NOT NULL DEFAULT FALSE,
  nombres_origen     JSONB        NOT NULL DEFAULT '[]'::jsonb, -- evidencia de todos los nombres vistos en el Excel
  origen_hoja        VARCHAR(60),
  origen_rango       VARCHAR(60),
  creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT servicio_n1_codigo_uk UNIQUE (codigo),
  CONSTRAINT servicio_n1_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT servicio_n1_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE servicio_n2 (
  id                     SERIAL PRIMARY KEY,
  n1_id                  INTEGER       NOT NULL REFERENCES servicio_n1(id) ON DELETE RESTRICT,
  codigo                 VARCHAR(20)   NOT NULL,     -- código original (SE.12.1 se conserva así)
  codigo_normalizado     VARCHAR(20)   NOT NULL,     -- SE.12.1 -> SE.12.01, para ordenar y buscar
  nombre                 VARCHAR(200)  NOT NULL,
  activo                 VARCHAR(11)   NOT NULL DEFAULT 'S',  -- S | N | DESCONOCIDO (columna ACTIVO)
  clase_id               INTEGER       REFERENCES clase_servicio(id),
  criticidad_id          INTEGER       REFERENCES criticidad(id),
  tipo_id                INTEGER       REFERENCES tipo_servicio(id),
  descripcion            TEXT,
  metrica                VARCHAR(200),
  minimo                 NUMERIC(14,2),               -- NULL = sin dato (nunca 0 por omisión)
  maximo                 NUMERIC(14,2),
  requiere_revision      BOOLEAN       NOT NULL DEFAULT FALSE,
  seccion_responsable_id INTEGER       REFERENCES seccion(id),
  usuario_responsable_id INTEGER       REFERENCES usuario(id),
  origen_hoja            VARCHAR(60),
  origen_rango           VARCHAR(60),
  traza                  JSONB         NOT NULL DEFAULT '{}'::jsonb, -- transformaciones aplicadas al importar
  creado_en              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT servicio_n2_codigo_uk UNIQUE (codigo),
  CONSTRAINT servicio_n2_codigo_norm_uk UNIQUE (codigo_normalizado),
  CONSTRAINT servicio_n2_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT servicio_n2_nombre_ck CHECK (btrim(nombre) <> ''),
  CONSTRAINT servicio_n2_activo_ck CHECK (activo IN ('S', 'N', 'DESCONOCIDO')),
  CONSTRAINT servicio_n2_umbral_ck CHECK (minimo IS NULL OR maximo IS NULL OR minimo <= maximo),
  CONSTRAINT servicio_n2_responsable_ck CHECK (usuario_responsable_id IS NULL OR seccion_responsable_id IS NOT NULL)
);
CREATE INDEX servicio_n2_n1_ix ON servicio_n2 (n1_id);
CREATE INDEX servicio_n2_seccion_ix ON servicio_n2 (seccion_responsable_id);
CREATE INDEX servicio_n2_usuario_ix ON servicio_n2 (usuario_responsable_id);

-- El usuario responsable debe pertenecer (vía su puesto) a la sección responsable.
-- La aplicación lo valida con un mensaje claro; este trigger es la última barrera.
CREATE FUNCTION fn_validar_responsable() RETURNS trigger AS $$
DECLARE
  seccion_usuario INTEGER;
BEGIN
  IF NEW.usuario_responsable_id IS NOT NULL THEN
    SELECT p.seccion_id INTO seccion_usuario
      FROM usuario u JOIN puesto p ON p.id = u.puesto_id
     WHERE u.id = NEW.usuario_responsable_id;
    IF seccion_usuario IS DISTINCT FROM NEW.seccion_responsable_id THEN
      RAISE EXCEPTION 'El usuario responsable no pertenece a la sección responsable'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'servicio_n2_responsable_seccion_ck';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_responsable
  BEFORE INSERT OR UPDATE OF usuario_responsable_id, seccion_responsable_id ON servicio_n2
  FOR EACH ROW EXECUTE FUNCTION fn_validar_responsable();

-- ===================== Importaciones y observaciones =====================

CREATE TABLE importacion (
  id             SERIAL PRIMARY KEY,
  archivo        VARCHAR(250) NOT NULL,
  sha256         CHAR(64)     NOT NULL,
  hoja           VARCHAR(60)  NOT NULL,
  iniciada_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finalizada_en  TIMESTAMPTZ,
  ejecutada_por  INTEGER      REFERENCES usuario(id) ON DELETE SET NULL,
  origen         VARCHAR(20)  NOT NULL DEFAULT 'comando', -- comando | aplicacion
  resumen        JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE observacion_importacion (
  id             SERIAL PRIMARY KEY,
  importacion_id INTEGER      NOT NULL REFERENCES importacion(id) ON DELETE CASCADE,
  tipo           VARCHAR(40)  NOT NULL,
  severidad      VARCHAR(12)  NOT NULL DEFAULT 'ADVERTENCIA',
  hoja           VARCHAR(60),
  fila           INTEGER,
  rango          VARCHAR(60),
  codigo         VARCHAR(20),
  mensaje        TEXT         NOT NULL,
  detalle        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT observacion_severidad_ck CHECK (severidad IN ('INFO', 'ADVERTENCIA', 'ERROR'))
);
CREATE INDEX observacion_importacion_ix ON observacion_importacion (importacion_id);
