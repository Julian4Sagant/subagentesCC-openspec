# Uso

## Preparar un proyecto

```bash
node scripts/instalar.js /ruta/al/proyecto
```

Instala los cuatro roles en cada host (`.claude/agents/`, `.opencode/agents/`, `.gemini/agents/`), los prompts planos en `.subagentes/prompts/` y un bloque en `AGENTS.md` del proyecto. Para elegir hosts: `--hosts claude,agents`. Volver a correrlo actualiza el bloque sin tocar el resto de `AGENTS.md`.

Si el proyecto usa OpenSpec, `openspec init --tools <host>` configura los comandos `/opsx:*` de ese host. Los roles no reemplazan a esos comandos: se apoyan en ellos.

## Flujo de un change

El orquestador es la sesión principal del host, no un rol. La persona aprueba en dos puntos.

1. **Propuesta y spec** (`openspec propose`). La persona aprueba la spec antes de que empiece cualquier implementación.
2. **Grupo de tareas.** Para cada grupo de `tasks.md`:
   1. Crear un worktree por implementador (`git worktree add`), con el alcance de archivos de cada uno.
   2. Crear el worktree del tester con `scripts/preparar-worktree-tester.sh <repo> <ruta> <branch> src/main`.
   3. Tomar una instantánea de cada worktree: `node scripts/verificar-escritura.js guardar --repo <ruta> --salida <ruta>.json`.
   4. Lanzar los roles en paralelo (o uno tras otro, en hosts sin subagentes nativos), con su rol y su alcance.
   5. Al terminar cada uno, comprobar alcance: `node scripts/verificar-escritura.js comparar --repo <ruta> --antes <ruta>.json --permitido "<alcance>"`. Un fallo se reporta antes de seguir.
   6. Integrar los worktrees en el branch del change, compilar y correr la suite. El tester recién entra al código real en este paso.
   7. Lanzar el `revisor` sobre lo integrado. Si el reporte trae `VEREDICTO: CAMBIOS REQUERIDOS`, devolver cada punto al área que indica (`código`, `tests` o `artefactos`). Máximo tres vueltas; después, la decisión es de la persona.
   8. Si el grupo toca áreas sensibles, lanzar también el `security-auditor`.
   9. La persona revisa el diff y aprueba. Recién entonces se marcan las tareas y se commitea.
3. **Verificación final y archivo.** Antes de `openspec archive`, el `revisor` revisa el change completo.

## Cómo leer un reporte

- `RESULTADO: BLOQUEADO` o `PARCIAL` del implementador: no marques las tareas pendientes. Mirá `AMBIGUEDADES` y `ESPERA_DE_OTROS`.
- `RESULTADO: TESTS_ESCRITOS` con `SUPUESTOS`: revisá cada supuesto antes de integrar. Si contradice el design, va a una actualización de la spec.
- `VEREDICTO` del revisor: la última línea es la que se parsea. El resto es para la persona.

## Validar el repo de agentes

```bash
node scripts/validar-agentes.js
node --test scripts/test/*.test.js
node scripts/generar-adaptadores.js --check
```

Después de editar `agents/`, corré `node scripts/generar-adaptadores.js` y commiteá `dist/` junto con el cambio. CI falla si no coinciden.
