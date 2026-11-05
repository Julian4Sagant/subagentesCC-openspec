# Portabilidad

Este repo nació para Claude Code. Hoy la mayor parte de su lógica está separada de la herramienta, pero no toda. Esta página dice qué es neutral, qué sigue atado a Claude Code y qué está probado.

## Qué es neutral

| Capa | Dónde | Por qué es neutral |
|---|---|---|
| Roles | [`roles/`](../roles) | Dicen nivel de capacidad (`fuerte`, `medio`, `rapido`), capacidades (`leer`, `ejecutar`, `escribir`) y guardas. No nombran modelos ni herramientas de una CLI. |
| Garantías | [`scripts/garantias.js`](../scripts/garantias.js) | Miran lo que cambió en el repo y en el disco, no el texto de un comando. Sirven con cualquier CLI. |
| Orquestador | [`scripts/orquestar.js`](../scripts/orquestar.js) | Corre cada rol como proceso headless de la CLI que se configure. El grafo está en código. |
| Configuración de CLIs | [`config/cli.json`](../config/cli.json) | Una entrada por CLI: comando, argumentos, modelos por nivel y mapa de herramientas. |
| Contrato del proyecto | `AGENTS.md` del proyecto | Formato abierto que leen varias CLIs. Ver abajo. |
| Cuerpo de cada agente | Dentro de `roles/` | Prosa. Se pasa como prompt de sistema a cualquier CLI. |

## Qué sigue atado a Claude Code

| Pieza | Dónde | Por qué |
|---|---|---|
| Agentes instalables | `agents/`, generado desde `roles/` | Formato de `.claude/agents/`: frontmatter con `model`, `tools` y `hooks`. |
| Hooks de las guardas | `hooks/`, declarados en `agents/` | Protocolo `PreToolUse` de Claude Code y la variable `$CLAUDE_PROJECT_DIR`. Son una barrera extra: la garantía real está en las comprobaciones de `garantias.js`. |
| Instalador | `scripts/install.ps1` | Solo PowerShell, y copia a `.claude/`. |
| Workflow del apply | `workflows/apply-change.js` | Corre en la herramienta `Workflow` de Claude Code. El orquestador portable lo reemplaza. |
| Skills de OpenSpec | `.claude/skills/openspec-*` | Las instala `openspec init` para Claude. El orquestador busca las skills en el repo integrado. |

Las rutas de instalación no están en el texto de los roles: se escriben como marcadores `{{hooks}}` y `{{scripts}}`. El generador las resuelve a `.claude/hooks` y `.claude/scripts`, y el orquestador usa los valores de `rutas` en `config/cli.json`. La validación de `roles/` rechaza un `.claude/` literal.

## Contrato del proyecto: `AGENTS.md`

El contrato del proyecto (stack, reglas, arquitectura) vive en `AGENTS.md`. `CLAUDE.md` solo tiene la línea `@AGENTS.md`:

```markdown
@AGENTS.md
```

- **Claude Code** lee `CLAUDE.md`, y sus imports con `@ruta` cargan el archivo importado. La [documentación de memoria de Claude Code](https://code.claude.com/docs/en/memory) describe `@AGENTS.md` como uso habitual. Las líneas `@ruta` dentro de bloques de código no cuentan como import.
  - **Probado** con Claude Code 2.1.318: un `CLAUDE.md` que solo importa `contrato-prueba.md` hace que la CLI conozca su contenido; sin ese import, no.
  - **Observado, no garantizado:** en esa misma versión, un directorio con solo `AGENTS.md` también dejó que la CLI conociera su contenido. Una sola prueba y no está en la documentación que consulté, así que el contrato sigue exigiendo el import.
- **Codex CLI** lee `AGENTS.md` de forma nativa, según las fuentes que consulté. No lo probé aquí.
- **Gemini CLI** lee `GEMINI.md` por defecto. Según una fuente, se puede apuntar a `AGENTS.md` con `context.fileName` en su configuración. No lo verifiqué contra la documentación oficial.

`scripts/verificar-proyecto.js` exige `AGENTS.md` y un `CLAUDE.md` que lo importe.

## Estado de cada CLI

| CLI | Estado | Qué está probado |
|---|---|---|
| Claude Code | Probada | Modo headless con el orquestador: un revisor de solo lectura, `Bash` disponible, `Write` no disponible, veredicto parseado. El import de `CLAUDE.md` funciona: probado con un archivo de otro nombre. |
| Codex CLI | Sin probar | No está instalada en el entorno donde se desarrolló esto. La entrada no existe en `config/cli.json`. |
| Gemini CLI | Sin probar | Igual que Codex. |
| Otras | Sin probar | Se agregan con el procedimiento de abajo. |

Las suites de pruebas (`scripts/test-*.js`) usan una CLI falsa o comprueban lógica pura. No prueban ninguna CLI real, salvo la prueba manual de Claude descrita arriba.

## Cómo agregar una CLI

1. Agregá una entrada en `config/cli.json`:

   ```json
   {
     "nombre": {
       "comando": "ejecutable",
       "argv": ["...", "{prompt}", "{sistema}", "{herramientas}", "--model", "{modelo}"],
       "modelos": { "fuerte": "...", "medio": "...", "rapido": "..." },
       "herramientas": { "leer": ["..."], "ejecutar": ["..."], "escribir": ["..."] }
     }
   }
   ```

   Si la CLI no tiene un flag de prompt de sistema, quitá `{sistema}` de `argv`: el orquestador lo antepone al prompt. Si no tiene un flag para restringir herramientas, dejá `{herramientas}` fuera; en ese caso la protección de solo lectura queda solo en la verificación posterior.

2. Probá la entrada con un revisor de solo lectura en un repo temporal. Revisá tres cosas: que la CLI corra, que el veredicto llegue en la forma que el orquestador espera, y que el rol no pueda escribir. Para Claude lo hicimos con el código de `ejecutarRol` de [`scripts/orquestar.js`](../scripts/orquestar.js).

3. Documentá el resultado en la tabla de arriba.

## Lo que queda pendiente

- **Probar Codex y Gemini CLI** de verdad, con las entradas en `config/cli.json`.
- **El workflow de Claude se mantiene** (`workflows/apply-change.js`). Retirarlo rompería a quien use el runtime `Workflow`; se decidió no hacerlo por ahora.
- **Skills en formato neutral.** Hoy las skills de OpenSpec las instala `openspec init` para Claude. Hay que ver qué instala la CLI de OpenSpec para cada herramienta antes de asumir que existen.
