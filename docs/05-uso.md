# Uso

Cómo ejecutar el apply de un grupo con el grafo. El orquestador es tu sesión principal de Claude Code: vos le das el prompt del grupo y él lanza a los agentes.

## Antes de empezar

- El change está propuesto y aprobado (`/opsx:propose`), con specs, design y `tasks.md`.
- Estás en el branch del change, por ejemplo `change/<change-id>`, con el árbol limpio.
- El grupo justifica el grafo: dos o más áreas de código que no se pisan, o muchos Scenarios. Si no, hacelo con la sesión principal (ver [Por qué un grafo](01-por-que-un-grafo.md#cuándo-no-conviene)).

## Pasos de un grupo

1. **Repartir.** El orquestador lee las tareas del grupo y las reparte por área, de modo que dos implementadores no toquen el mismo archivo. Los Scenarios van todos al tester.
2. **Worktrees.** Crea uno por agente en `.worktrees/<área>` desde el branch del change.
3. **Paralelo.** Lanza a la vez un `implementador` por área y el `tester`.
4. **Join.** Integra los worktrees en el branch del change, compila (`./mvnw -B -q test-compile`) y corre la suite una sola vez. Al orquestador solo le interesan los fallos, no el log completo.
5. **Revisión.** Lanza el `revisor` sobre lo integrado, con el número de iteración. Si corresponde, en paralelo el `security-auditor` y el `postgres-pro`.
6. **Ciclo de corrección.** Si hay `CAMBIOS REQUERIDOS` o hallazgos CRITICAL/WARNING, cada punto vuelve al agente de su área (tabla abajo) y se repite desde el join.
7. **Persona.** Con `VEREDICTO: APROBADO`, el orquestador marca las tareas cumplidas y te muestra el diff. **Nada se commitea, se sube ni se abre como PR sin tu confirmación.**
8. **Siguiente grupo.** En una sesión nueva, para que el contexto arranque limpio.

## Ciclo de corrección

| Área del hallazgo | Quién lo corrige | Ejemplo |
|---|---|---|
| `código` | el implementador del área | un endpoint no devuelve el error que pide la spec |
| `tests` | el tester | un `@DisplayName` no coincide letra por letra con el Scenario |
| `artefactos` | vos, con `/opsx:update` | el design contradice un Scenario |

- **La spec manda.** Si un test contradice la spec, se corrige el test. Si la spec está mal, va a `/opsx:update`: no se arregla ni en el código ni en el test.
- **Máximo 3 iteraciones por grupo.** Si no se aprueba en tres vueltas, el orquestador te entrega el último veredicto y el historial de hallazgos, y decidís vos.
- **Cada iteración queda registrada:** el orquestador le pasa al revisor `Iteración: n de 3`.

## Comando de grupo

Con el repo instalado, el grupo se lanza con el comando del proyecto:

```text
/apply-grupo <change-id> <grupo>
```

Por ejemplo, `/apply-grupo agregar-validaciones 2`. El comando (`.claude/commands/apply-grupo.md`) lee las tareas del grupo de `tasks.md` y sigue los pasos de esta página. Es autocontenido: no necesita que el proyecto tenga este repo a mano.

El comando no ejecuta `/opsx:apply`. La skill `openspec-apply-change` la carga cada `implementador` según su frontmatter. Vos seguís siendo el orquestador.

## Prompt de sesión de grupo

Si no querés usar el comando, copiá y completá este prompt:

```text
Apply del change <change-id>, grupo <n>, con el grafo de agentes.
Branch: change/<change-id>.

Tareas del grupo (de tasks.md):
<pegá las tareas>

Agentes:
- implementador para el área <A> (tareas <x, y>)
- implementador para el área <B> (tareas <z>)
- tester para los Scenarios del grupo
- revisor después del join
- <security-auditor | postgres-pro>, si corresponde

Seguí docs/05-uso.md del repo de agentes: worktrees en .worktrees/<área>,
join con compilación y tests, ciclo de corrección de máximo 3 iteraciones.
Pará al final del grupo; no sigas con el grupo siguiente.
No hagas commit, push ni PR sin mi confirmación explícita.
```

## Verificar nombres de Scenarios

El revisor lo corre en cada revisión, pero podés correrlo vos en el join para ahorrarte una vuelta:

1. Copiá los nombres de los Scenarios de `openspec show "<change-id>" --json --deltas-only` a un archivo, uno por línea, fuera del repo.
2. Corré:

   ```bash
   node .claude/scripts/verificar-displaynames.js /tmp/nombres.txt src/test
   ```

Sale con 0 si todos tienen test, 1 si falta alguno (y lista los `SIN TEST`), 2 si el uso es incorrecto. El script no reemplaza la revisión: un `@DisplayName` correcto puede igual no verificar su THEN.

## Verificación final

Después del último grupo y antes de `/opsx:archive`, corré `/verificar-change <change-id>`: el revisor revisa el change completo con la skill `openspec-verify-change` y devuelve su reporte (CRITICAL, WARNING, SUGGESTION) junto con el veredicto.

## Costo

- Cada subagente arranca sin contexto y relee los artefactos. Usá el grafo cuando el paralelismo y la independencia ahorran más de lo que cuestan.
- Modelos: `haiku` para el tester, `sonnet` para el implementador, el revisor y el postgres-pro, `opus` para el security-auditor.
- Como máximo un implementador por área y unos cinco agentes en paralelo por grupo.
- Un revisor por grupo y una sola verificación final por change.
- La suite completa corre una vez en el join, no cada agente por su cuenta, para que los logs de Maven no llenen el contexto del orquestador.

## Garantías y límites

- **Tester sin código de producción:** el hook bloquea `Read`, `Grep`, `Glob` y `Bash` sobre `src/main`, incluidas formas como `src/*` y `src/ma*`. Es una barrera contra accidentes, no un límite de seguridad. La garantía fuerte es que el worktree del tester no tenga `src/main`.
- **Independencia del revisor:** recibe la spec, el design y el diff integrado; no recibe los reportes de los implementadores.
