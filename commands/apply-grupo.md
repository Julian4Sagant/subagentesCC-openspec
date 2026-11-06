---
description: Apply de un grupo de tareas de un change de OpenSpec con el grafo de agentes
argument-hint: <change-id> <grupo>
---
Apply del change $1, grupo $2, con el grafo de agentes. Sos el orquestador: repartís el trabajo y lanzás a los subagentes. No implementes vos el código.

Antes de empezar:
- Verificá que estás en la rama `change/$1` con el árbol limpio. Si no, paráte y avisame.
- Leé las tareas del grupo $2 en `openspec/changes/$1/tasks.md`. Si el grupo no existe, paráte y avisame.

Pasos:
1. **Repartir.** Agrupá las tareas del grupo por área de código, de modo que dos implementadores no toquen el mismo archivo. Los Scenarios de los requirements del grupo van todos al tester.
2. **Worktrees.** Creá uno por agente en `.worktrees/<área>` desde la rama `change/$1`.
3. **Paralelo.** Lanzá a la vez un subagente `implementador` por área, con sus tareas, y el subagente `tester` con los Scenarios.
4. **Join.** Integrá los worktrees en la rama `change/$1`, compilá y corré la suite una sola vez. Del resultado solo te interesan los fallos, no el log completo.
5. **Revisión.** Lanzá el subagente `revisor` sobre lo integrado, indicando `Iteración: n de 3`. Si el grupo toca autenticación, permisos, errores, logs o secretos, lanzá también `security-auditor` en paralelo. Si toca tablas, índices, constraints o consultas, lanzá `postgres-pro`.
6. **Corrección.** Si el revisor da `CAMBIOS REQUERIDOS` o el auditor reporta CRITICAL o WARNING, cada hallazgo vuelve al agente de su área: `código` al implementador del área, `tests` al tester. Un hallazgo de `artefactos` no lo corrige ningún agente: me lo mostrás a mí. Después repetí desde el join. Máximo 3 iteraciones; si no aprueba en 3, entregame el último veredicto y el historial.
7. **Cierre.** Con `VEREDICTO: APROBADO`, marcá las tareas del grupo como cumplidas y mostrame el diff.

Reglas:
- La spec manda. Si un test contradice la spec, se corrige el test. Si la spec parece estar mal, no la cambies: avisame.
- Parate al final del grupo. No sigas con el grupo siguiente.
- No hagas commit, push ni PR sin mi confirmación explícita.
