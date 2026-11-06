#!/usr/bin/env bash
# Crea un worktree para el tester sin el código de producción (src/main).
# El aislamiento lo garantiza git, no el host: el tester no puede leer lo que no está en disco.
#
# Uso: scripts/preparar-worktree-tester.sh <repo> <ruta-worktree> <branch-base> [carpeta-excluida]
# Ejemplo: scripts/preparar-worktree-tester.sh . ../wt-tester main src/main

set -euo pipefail

repo="${1:?falta el repo}"
destino="${2:?falta la ruta del worktree}"
base="${3:?falta el branch base}"
excluida="${4:-src/main}"

# --detach: el branch base ya puede estar checkouteado en el repo principal, y git no admite dos worktrees sobre el mismo branch.
git -C "$repo" worktree add --no-checkout --detach "$destino" "$base"
git -C "$destino" sparse-checkout init --no-cone
printf '/*\n!/%s/\n' "$excluida" | git -C "$destino" sparse-checkout set --stdin
git -C "$destino" checkout -q HEAD

if [ -e "$destino/$excluida" ]; then
	echo "ERROR: $excluida sigue presente en $destino" >&2
	exit 1
fi
echo "Worktree listo en $destino sin $excluida"
