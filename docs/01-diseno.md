# Diseño

## Qué problema resuelve

Si el mismo agente escribe el código y sus tests, tiende a ajustar los tests hasta que pasan. Separar los roles hace que un test pueda fallar de verdad cuando el código se aparta de la spec. El repo define esos roles, sus permisos y sus formatos de reporte, de forma que cualquier asistente pueda ejecutarlos.

## Principios

1. **Independencia del modelo.** Ningún archivo de `agents/` nombra un modelo ni un host. La validación (`validar-agentes.js`) falla si aparece `haiku`, `sonnet`, `gemini`, `.claude/` o similares. El modelo lo elige quien usa el host.
2. **Una sola fuente.** `agents/` es la verdad. `dist/` se genera y CI verifica que coincida. Nadie edita `.claude/agents/` a mano en un proyecto.
3. **La spec manda.** Si un test contradice la spec, o la spec es ambigua, el agente se detiene y lo reporta. No elige una lectura.
4. **Formato fijo de reporte.** El orquestador lee el veredicto con una regla exacta. Cambiar un formato rompe el flujo, así que los formatos viven en el rol y los valida el script.
5. **Verificación fuera del agente.** Un agente de solo lectura puede equivocarse con sus herramientas o con su lista de permisos. `verificar-escritura.js` mira lo que cambió en git y no confía en el reporte del agente.
6. **Mínimo.** Cuatro roles. Lo que no se usa en un flujo real no entra. Los roles específicos de un stack (por ejemplo, un especialista en base de datos) van en el proyecto, no acá.

## Roles

| Rol | Acceso | Qué hace | Cuándo |
|---|---|---|---|
| `implementador` | escritura | Implementa sus tareas dentro de un alcance declarado | Siempre, uno por área que no se pisa |
| `tester` | escritura en tests | Escribe un test por Scenario desde la spec, sin leer `src/main` | Siempre, en paralelo con los implementadores |
| `revisor` | lectura | Contrasta el código integrado con la spec y da un veredicto | Después de integrar un grupo |
| `security-auditor` | lectura | Revisa autenticación, permisos, errores, logs y secretos | Solo si el cambio toca esas áreas |

## Qué se tomó de otros repos

Se revisaron dos repos antes de empezar. De ninguno se copió código ni prompts.

- **De `cloudflare/security-audit-skill`:** separar modo guía de modo completo; el padre es el único que escribe el estado compartido; un verificador en contexto fresco intenta refutar; validadores sin dependencias para la salida; roles abstractos en lugar de nombres de modelo.
- **De `ayush488-glitch/genesis-kit`:** guías por fase cortas y neutrales al host; compuertas humanas entre spec, plan e implementación; cierre que exige evidencia, no el reporte del agente; una capa fina por host sobre un contenido canónico; y el criterio de que los agentes innecesarios son defectos.

Ideas que se dejaron afuera: su CLI, dashboard, servidor MCP, grafo de código (solo indexa JS, TS y Python), autonomía y promoción de reglas. Es una plataforma completa, y para el ciclo de OpenSpec basta con los formatos y los verificadores.

## Qué se quitó del repo anterior

- Hooks de Claude Code (`PreToolUse`). No existen en todos los hosts; el aislamiento pasa a ser git y los verificadores.
- La herramienta Workflow y `workflows/`. Dependía de Claude Code; el orden del flujo ahora está en `docs/03-uso.md`.
- `postgres-pro`. Es específico de un stack.
- Las skills de mattpocock. Eran de Claude Code y tenían su propio instalador. Siguen en el historial de `main`, junto con su licencia.

Nada de esto se borró de la historia: `main` no se tocó.
