# Subagentes OpenSpec

Cuatro roles de subagente para el ciclo apply/verify de un change de [OpenSpec](https://github.com/Fission-AI/OpenSpec), escritos una sola vez y adaptados a varios asistentes.

La idea central: **los tests verifican el contrato, no la implementación.** Un agente escribe el código, otro escribe los tests desde la spec sin leer el código, otro revisa lo integrado y, si el cambio toca áreas sensibles, entra un auditor de seguridad. Así un test puede fallar de verdad cuando el código se aparta de la spec.

| Rol | Acceso | Qué hace |
|---|---|---|
| `implementador` | escritura | Implementa sus tareas en un alcance declarado |
| `tester` | escritura en tests | Escribe un test por Scenario, sin leer `src/main` |
| `revisor` | lectura | Contrasta lo integrado con la spec y da un veredicto |
| `security-auditor` | lectura | Revisa autenticación, permisos, logs y secretos |

Los roles no nombran modelo ni host. Quien usa el repo elige el modelo en su asistente.

## Hosts

| Host | Cómo se usa | Estado |
|---|---|---|
| Claude Code | subagentes nativos | Formato del repo anterior; sin probar en esta versión |
| OpenCode | subagentes nativos | Parcial |
| Gemini CLI | subagentes nativos | Parcial |
| Codex | `AGENTS.md` y prompts | Sin verificar el formato de subagentes |
| Kimi | `AGENTS.md` y prompts | Sin verificar el formato de subagentes |
| DeepSeek | prompts | Sin soporte de subagentes documentado |

Detalle en [docs/02-hosts.md](docs/02-hosts.md).

## Empezar

```bash
node scripts/instalar.js /ruta/al/proyecto
```

Después, el flujo del change y cómo leer los reportes están en [docs/03-uso.md](docs/03-uso.md). El diseño y lo que se tomó de otros repos, en [docs/01-diseno.md](docs/01-diseno.md).

## Estructura

```
agents/     fuente única de los roles (markdown neutro)
dist/       adaptadores generados: claude, opencode, gemini, prompts y AGENTS.md
scripts/    generar y validar, instalar, verificar escritura por git, preparar worktree del tester
scripts/test/  pruebas (node --test, sin dependencias)
docs/       diseño, hosts y uso
.github/    CI: valida, prueba y verifica que dist/ esté al día
```

Probado con Node 22 (el de CI). No hay dependencias npm.

## Requisitos de OpenSpec

Los roles usan la CLI `openspec`: `instructions apply --json`, `show --deltas-only` y `validate --strict`. Comprobados contra la 1.16.0; en otras versiones, verificar antes de usar.
