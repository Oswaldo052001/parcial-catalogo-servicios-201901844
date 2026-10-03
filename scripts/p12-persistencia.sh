#!/usr/bin/env sh
# P12 con contenedores reales: guarda una marca, apaga los contenedores SIN borrar el volumen,
# los vuelve a levantar y comprueba que la marca sigue ahí. Código de salida 0 = pasa.
# Usa la base de pruebas <POSTGRES_DB>_test (vive en el mismo volumen), así no deja datos en la base de evaluación.
# El SQL se envía por la entrada estándar para no depender de comillas anidadas.
set -e
cd "$(dirname "$0")/.."
PSQL='psql -U $POSTGRES_USER -d ${POSTGRES_DB}_test -v ON_ERROR_STOP=1 -q -tA'
MARCA="P12-$(date +%s)"
# Crea la base de pruebas si aún no existe (si ya existe, createdb falla y se ignora).
docker compose exec -T db sh -c 'createdb -U $POSTGRES_USER ${POSTGRES_DB}_test' 2>/dev/null || true
echo "CREATE TABLE IF NOT EXISTS p12_marca (codigo TEXT PRIMARY KEY, creada_en TIMESTAMPTZ DEFAULT now());" | docker compose exec -T db sh -c "$PSQL"
echo "[P12] guardando marca $MARCA en la base de pruebas"
echo "INSERT INTO p12_marca (codigo) VALUES ('$MARCA');" | docker compose exec -T db sh -c "$PSQL"
CONTAR='SELECT (SELECT count(*) FROM servicio_n2) || chr(47) || (SELECT count(*) FROM usuario) || chr(47) || (SELECT count(*) FROM importacion);'
EVAL_ANTES=$(echo "$CONTAR" | docker compose exec -T db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -q -tA' | tr -d '[:space:]')
echo "[P12] base de evaluación antes (servicios/usuarios/importaciones): $EVAL_ANTES"
echo "[P12] docker compose down (sin -v: el volumen se conserva)"
docker compose down
echo "[P12] docker compose up -d"
docker compose up -d --wait
N=$(echo "SELECT count(*) FROM p12_marca WHERE codigo = '$MARCA';" | docker compose exec -T db sh -c "$PSQL" | tr -d '[:space:]')
EVAL_DESPUES=$(echo "$CONTAR" | docker compose exec -T db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -q -tA' | tr -d '[:space:]')
echo "[P12] base de evaluación después: $EVAL_DESPUES"
# Con AUTO_SETUP=true el arranque registra una importación más; servicios y usuarios deben seguir iguales.
if [ "$N" = "1" ] && [ "${EVAL_ANTES%/*}" = "${EVAL_DESPUES%/*}" ]; then
  echo "[P12] PASA: la marca $MARCA persiste después del reinicio"
  exit 0
fi
echo "[P12] FALLA: marca=$N (se esperaba 1), evaluación antes=$EVAL_ANTES después=$EVAL_DESPUES"
exit 1
