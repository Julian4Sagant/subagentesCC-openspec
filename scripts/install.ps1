# Instala los agentes, el hook y el script de verificación en un proyecto.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Proyecto C:\ruta\al\proyecto
# El hook del tester se resuelve con $CLAUDE_PROJECT_DIR, así que los agentes van al proyecto
# y no a ~/.claude, donde el hook no encontraría su script.
param([Parameter(Mandatory)][string]$Proyecto)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Proyecto -PathType Container)) {
	throw "No existe el proyecto: $Proyecto"
}

$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $Proyecto '.claude'
New-Item -ItemType Directory -Force -Path (Join-Path $destino 'agents'), (Join-Path $destino 'commands'), (Join-Path $destino 'hooks'), (Join-Path $destino 'scripts'), (Join-Path $destino 'workflows'), (Join-Path $destino 'skills') | Out-Null

Copy-Item (Join-Path $raiz 'agents\*.md') (Join-Path $destino 'agents') -Force
Copy-Item (Join-Path $raiz 'commands\*.md') (Join-Path $destino 'commands') -Force
Copy-Item (Join-Path $raiz 'hooks\*.js') (Join-Path $destino 'hooks') -Force
Copy-Item (Join-Path $raiz 'scripts\verificar-displaynames.js') (Join-Path $destino 'scripts') -Force
Copy-Item (Join-Path $raiz 'workflows\*.js') (Join-Path $destino 'workflows') -Force
Copy-Item (Join-Path $raiz 'skills\*') (Join-Path $destino 'skills') -Recurse -Force

Write-Host "Agentes, comandos, hooks, scripts, workflows y skills instalados en $destino"
