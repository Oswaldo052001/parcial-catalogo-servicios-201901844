# Rutina completa de verificacion (harness) para Windows PowerShell.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\harness.ps1
# Pasos: construir y levantar -> salud -> calidad -> pruebas P01-P12 (base aislada catalogo_test) -> P12 con reinicio real.
# Codigo de salida 0 solo si todo pasa.
Set-Location (Join-Path $PSScriptRoot "..")
# Salida en UTF-8 (acentos) y la salida de error de docker como texto normal, no como error rojo de PowerShell.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Paso($titulo, [scriptblock]$accion) {
  Write-Host "== $titulo" -ForegroundColor Cyan
  & $accion 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { Write-Host "[harness] FALLA en: $titulo" -ForegroundColor Red; exit 1 }
}
if (-not (Test-Path .env)) { Write-Host "[harness] no existe .env; copiando .env.example"; Copy-Item .env.example .env }
Paso "1/5 docker compose up --build -d" { docker compose up --build -d --wait }
Paso "2/5 salud de la aplicacion" { docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/salud; Write-Host "" }
Paso "3/5 controles de calidad" { docker compose exec -T app npm run --silent calidad }
Paso "4/5 pruebas automatizadas P01-P12 (base catalogo_test)" { docker compose exec -T app npm test --silent }
Paso "5/5 P12 con reinicio real de contenedores" { & (Join-Path $PSScriptRoot "p12-persistencia.ps1") }
Write-Host "[harness] TODO OK" -ForegroundColor Green
