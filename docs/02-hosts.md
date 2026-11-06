# Hosts

Cómo entra cada rol en cada asistente. La fuente es siempre `agents/`; `dist/` se genera y CI verifica que esté al día.

Lo que aparece como **verificado** salió de la documentación oficial o de una prueba local. Lo que dice **sin verificar** no debe darse por bueno hasta probarlo en la versión instalada.

| Host | Subagentes nativos | Qué instala `scripts/instalar.js` | Solo lectura garantizado por | Estado |
|---|---|---|---|---|
| **Claude Code** | `.claude/agents/*.md` (frontmatter `name`, `description`, `tools`) | `.claude/agents/` | Lista `tools` (sin `Write` ni `Edit`) y `verificar-escritura.js` | Formato tomado del repo anterior; sin probar en esta versión del generador. |
| **OpenCode** | `.opencode/agents/*.md` (`mode: subagent`, `tools: write/edit: false`) | `.opencode/agents/` | `tools` y `verificar-escritura.js` | **Parcial.** La documentación v2 cambió el bloque de permisos a reglas; el formato generado es el de `tools`. Verificar en tu versión. |
| **Gemini CLI** | `.gemini/agents/*.md` (frontmatter con `tools` como lista) | `.gemini/agents/` | `tools` y `verificar-escritura.js` | **Parcial.** Los nombres de herramienta (`read_file`, `write_file`, `replace`, `grep_search`, `glob`, `run_shell_command`) no están verificados contra la versión instalada. Si el host no los reconoce, quitá `tools` y confiá en `verificar-escritura.js`. |
| **Codex** | `.codex/agents/*.toml`, un archivo por agente | No instala subagentes. Usa `AGENTS.md` y los prompts | Solo `verificar-escritura.js` | **Sin verificar** el formato TOML del agente (las claves no están confirmadas). Por ahora, los roles se invocan desde `AGENTS.md` o pegando `prompts/`. |
| **Kimi** | Agentes en archivos Markdown o YAML, según la versión (la documentación tiene dos generaciones) | No instala subagentes. Lee `AGENTS.md` (`${KIMI_AGENTS_MD}`) | Solo `verificar-escritura.js` | **Sin verificar** cuál generación usa tu versión. |
| **DeepSeek** | No encontré documentación de subagentes definidos en `AGENTS.md` | No instala nada específico. Usá `prompts/` | Solo `verificar-escritura.js` | **Sin verificar.** Lo que encontré se refiere a otros proyectos. |

## Qué pasa en un host sin subagentes nativos

El rol se usa como prompt de la sesión principal: pegás `prompts/<rol>.md` en una sesión nueva, con el change y el alcance. Pierde el aislamiento de contexto y el paralelismo, pero conserva el formato de reporte y las reglas. Para el tester, el aislamiento de `src/main` lo da el worktree de `scripts/preparar-worktree-tester.sh`, no el host.

`openspec init --tools` cubre `claude`, `codex`, `gemini`, `kimi`, `opencode` y `agents`. No incluye DeepSeek.

## Garantías que no dependen del host

Estas comprobaciones valen en cualquier host porque las hace git después de la ejecución:

- `scripts/verificar-escritura.js guardar` antes de lanzar un agente, `comparar` después. Un rol de solo lectura con cualquier cambio falla.
- Un tester con alcance solo en la carpeta de tests falla si toca otra cosa.
- El worktree del tester no contiene `src/main`, y `preparar-worktree-tester.sh` verifica que así sea.
