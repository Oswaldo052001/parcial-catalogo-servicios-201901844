# P12 con contenedores reales (PowerShell). Guarda una marca en la base de pruebas, apaga los
# contenedores SIN borrar el volumen, los levanta de nuevo y comprueba que la marca y los datos
# de la base de evaluacion siguen ahi. Codigo de salida 0 = pasa.
# El SQL se envia por la entrada estandar para evitar problemas de comillas en PowerShell 5.1.
Set-Location (Join-Path $PSScriptRoot "..")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$psqlTest = 'psql -U $POSTGRES_USER -d ${POSTGRES_DB}_test -v ON_ERROR_STOP=1 -q -tA'
$psqlEval = 'psql -U $POSTGRES_USER -d $POSTGRES_DB -q -tA'
$contar = 'SELECT (SELECT count(*) FROM servicio_n2) || chr(47) || (SELECT count(*) FROM usuario) || chr(47) || (SELECT count(*) FROM importacion);'
$marca = "P12-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

docker compose exec -T db sh -c 'createdb -U $POSTGRES_USER ${POSTGRES_DB}_test' 2>$null
"CREATE TABLE IF NOT EXISTS p12_marca (codigo TEXT PRIMARY KEY, creada_en TIMESTAMPTZ DEFAULT now());" | docker compose exec -T db sh -c $psqlTest
Write-Host "[P12] guardando marca $marca en la base de pruebas"
"INSERT INTO p12_marca (codigo) VALUES ('$marca');" | docker compose exec -T db sh -c $psqlTest
if ($LASTEXITCODE -ne 0) { Write-Host "[P12] FALLA: no se pudo guardar la marca"; exit 1 }
$antes = ($contar | docker compose exec -T db sh -c $psqlEval | Out-String).Trim()
Write-Host "[P12] base de evaluacion antes (servicios/usuarios/importaciones): $antes"

Write-Host "[P12] docker compose down (sin -v: el volumen se conserva)"
docker compose down 2>&1 | ForEach-Object { "$_" }
Write-Host "[P12] docker compose up -d"
docker compose up -d --wait 2>&1 | ForEach-Object { "$_" }

$n = ("SELECT count(*) FROM p12_marca WHERE codigo = '$marca';" | docker compose exec -T db sh -c $psqlTest | Out-String).Trim()
$despues = ($contar | docker compose exec -T db sh -c $psqlEval | Out-String).Trim()
Write-Host "[P12] base de evaluacion despues: $despues"
# Con AUTO_SETUP=true el arranque registra una importacion mas; servicios y usuarios deben seguir iguales.
$baseAntes = $antes.Substring(0, $antes.LastIndexOf('/'))
$baseDespues = $despues.Substring(0, $despues.LastIndexOf('/'))
if ($n -eq "1" -and $baseAntes -eq $baseDespues) {
  Write-Host "[P12] PASA: la marca $marca y los datos de evaluacion persisten despues del reinicio" -ForegroundColor Green
  exit 0
}
Write-Host "[P12] FALLA: marca=$n (se esperaba 1), evaluacion antes=$antes despues=$despues" -ForegroundColor Red
exit 1
