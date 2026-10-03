#!/usr/bin/env sh
# Rutina completa de verificación (harness). La pueden ejecutar el asistente de IA y el catedrático.
# Pasos: construir y levantar -> salud -> calidad -> pruebas P01–P12 (base aislada catalogo_test) -> P12 con reinicio real.
# Código de salida 0 solo si todo pasa.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "[harness] no existe .env; copiando .env.example"; cp .env.example .env; }
echo "== 1/5 docker compose up --build -d"
docker compose up --build -d --wait
echo "== 2/5 salud de la aplicación"
docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/salud; echo
echo "== 3/5 controles de calidad"
docker compose exec -T app npm run --silent calidad
echo "== 4/5 pruebas automatizadas P01–P12 (base catalogo_test, no toca la de evaluación)"
docker compose exec -T app npm test --silent
echo "== 5/5 P12 con reinicio real de contenedores"
sh scripts/p12-persistencia.sh
echo "[harness] TODO OK"
