# Instalación

## Requisitos

- **Claude Code** (CLI, app de escritorio o extensión del IDE), si vas a usar los agentes con Claude. Para otras CLIs, ver [Portabilidad](10-portabilidad.md).
- **Node.js**, para el hook del tester y el script de verificación.
- **CLI de OpenSpec** (`openspec`), inicializada en el proyecto (`openspec init`). Además de la CLI, deja en `.claude/` las skills y los comandos `/opsx:*`. El implementador usa la skill `openspec-apply-change` y el revisor `openspec-verify-change`.
- **git**, para los worktrees.
- Un proyecto con tests en `src/test` y código en `src/main` (los agentes están pensados para Java con Maven, pero las reglas de rol sirven para otros stacks ajustando las instrucciones).

## Instalar en un proyecto

Desde la carpeta de este repo, en Linux, macOS o Windows, con Node.js 22 o superior:

```bash
node scripts/instalar.js --proyecto /ruta/al/proyecto
```

En Windows también existe el instalador de PowerShell, que hace lo mismo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Proyecto C:\ruta\al\proyecto
```

El instalador copia:

| Origen | Destino en el proyecto |
|---|---|
| `agents/*.md` | `.claude/agents/` |
| `hooks/tester-sin-src-main.js` | `.claude/hooks/` |
| `hooks/sin-escritura.js` | `.claude/hooks/` |
| `scripts/verificar-displaynames.js` | `.claude/scripts/` |
| `workflows/*.js` | `.claude/workflows/` |
| `skills/*` | `.claude/skills/` |

Después, abrí una sesión nueva de Claude Code en el proyecto: los agentes se cargan al iniciar.

### Guarda de escritura

`sin-escritura.js` se declara en el frontmatter de los cinco agentes, así que solo corre mientras trabaja cada uno:

- `implementador`, `tester` y `postgres-pro`: bloquea los comandos de git que cambian el repo (`commit`, `push`, `reset`, `stash`, `checkout`...). Escriben código y tests con las herramientas `Write` y `Edit`, que el hook no toca; integrar y commitear es del orquestador.
- `revisor` y `security-auditor`, con `--solo-lectura`: además bloquea borrar o escribir archivos con shell y redirecciones dentro del proyecto. Las redirecciones a `/dev/null` o a rutas fuera del proyecto siguen permitidas, porque el revisor necesita archivos temporales fuera del repo.

`validar-agentes.js` falla si un agente se queda sin la guarda, o si uno de solo lectura la lleva sin `--solo-lectura`.

Es una barrera contra escrituras accidentales, no un límite de seguridad. La garantía fuerte es que el agente no tenga `Write` ni `Edit`, que es lo que hacen el revisor y el security-auditor.

### Límites de las guardas

Las dos guardas (`tester-sin-src-main.js` y `sin-escritura.js`) filtran el texto del comando o de la ruta. Eso frena lo accidental, pero no es un límite de seguridad:

- Un comando armado en partes (por ejemplo, con variables o con `eval`) puede esquivar el filtro.
- Un script del proyecto que escriba por su cuenta no pasa por el hook.
- Un enlace simbólico dentro de `src/test` puede apuntar a `src/main`.

Para lo que tiene que estar garantizado, no confíes solo en el hook: quitá las herramientas de escritura del agente (`Write`, `Edit`) y, si hace falta, ejecutá los agentes de solo lectura en un checkout sin el código que no deben ver.

### Workflow del apply

`workflows/apply-change.js` es el grafo completo del apply como script de la herramienta `Workflow`: tester e implementadores en paralelo, join, revisión y hasta 3 vueltas de corrección. Se instala en `.claude/workflows/` del proyecto. La herramienta lo corre solo cuando la persona lo pide.

Supone que los worktrees de cada área ya existen y que la corrección corre sobre el checkout integrado. Los argumentos son `change`, `areas` (cada una con `nombre`, `tareas` y `worktree`), y los opcionales `postgres` y `seguridad`, que decide quien lo lanza según el change.

Ejemplos de los archivos que el proyecto necesita están en [`docs/ejemplos/`](ejemplos/): un `AGENTS.md` con su `CLAUDE.md` que lo importa, un `openspec/config.yaml` y un `docs/flujo-de-trabajo.md`.

### Requisitos de archivos del proyecto

Los agentes leen archivos que el repo no trae. Tienen que existir en el proyecto:

- `AGENTS.md`: reglas del proyecto. El `postgres-pro` las usa como fuente de su stack y su acceso a datos. Un `CLAUDE.md` con la línea `@AGENTS.md` hace que Claude Code las lea también.
- `openspec/config.yaml`: el campo `context` con la arquitectura y el contrato.
- `docs/flujo-de-trabajo.md`: el flujo completo de un change, con el paso 10 (apply) y la sección "Al cerrar cada grupo del apply", que el revisor consulta.

### Por qué en el proyecto y no en `~/.claude`

El tester declara su hook así:

```yaml
command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/tester-sin-src-main.js" --siempre
```

`$CLAUDE_PROJECT_DIR` es la carpeta del proyecto abierto. Si instalás los agentes solo en `~/.claude/agents`, el tester aparece pero su hook no encuentra el script y no te protege. Además, el revisor busca el script de verificación en `.claude/scripts/` del proyecto.

## Comprobar que quedó bien

0. Lo más rápido: desde el repo de agentes, corré el verificador de contrato contra el proyecto. Sale con 0 si cumple todo y lista lo que falta o se desvió de `agents/`:

   ```bash
   node scripts/verificar-proyecto.js C:/ruta/al/proyecto
   ```

   Qué se comprueba y por qué, en [Patrones](07-patrones.md#2-el-contrato-de-un-proyecto).

1. En Claude Code, `/agents` tiene que listar `implementador`, `tester`, `revisor`, `security-auditor` y `postgres-pro`.
2. Probá el hook a mano, desde la carpeta del proyecto:

   ```bash
   echo '{"tool_name":"Read","tool_input":{"file_path":"src/main/App.java"}}' | node .claude/hooks/tester-sin-src-main.js --siempre
   ```

   Tiene que imprimir un JSON con `"permissionDecision":"deny"`. Si no imprime nada, el hook no está bloqueando.
3. Probá el verificador con un archivo de nombres:

   ```bash
   node .claude/scripts/verificar-displaynames.js nombres.txt src/test
   ```

   Imprime cuántos Scenarios tienen test y lista los `SIN TEST`.
4. Probá la guarda de escritura, desde la carpeta del proyecto:

   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/sin-escritura.js
   ```

   Tiene que imprimir un JSON con `"permissionDecision":"deny"`. Con `--solo-lectura` también bloquea `rm`, `tee` o `echo x > archivo.txt` dentro del proyecto.

5. Desde el repo de agentes, no desde el proyecto, corré las pruebas de los hooks y los dos validadores:

   ```bash
   node --test scripts/test-hooks.js
   node scripts/validar-agentes.js
   node scripts/validar-workflows.js
   ```

   `validar-agentes.js` sale con 1 si un agente se queda sin la guarda `sin-escritura.js`, si uno de solo lectura la lleva sin `--solo-lectura` o tiene herramientas de escritura, si `name` no coincide con el archivo, si el modelo no existe, o si un hook o una skill apuntan a algo que no está en el repo. `validar-workflows.js` sale con 1 si un workflow no parsea o no declara su `meta`. Los tres corren también en CI, en cada PR.

## Actualizar

Este repo es la fuente de los agentes. Para tomar una versión nueva, hacé `git pull` acá y volvé a correr el instalador. No edites a mano las copias del proyecto: el próximo instalador las pisa.

## Variantes por proyecto

Los agentes de este repo son genéricos. Lo que depende de un proyecto (su stack, sus clases base de test, sus reglas de logs y de errores) no va en el archivo del agente: va en el `AGENTS.md` del proyecto. Los agentes lo leen y, si contradice sus reglas genéricas, gana el `CLAUDE.md`. Así un proyecto no necesita una copia propia de cada agente.

- **Tester, revisor, security-auditor y postgres-pro** leen el `AGENTS.md` del proyecto antes de empezar.
- **Implementador** lee el `context` de `openspec/config.yaml`, que define la arquitectura y el contrato.

Si un proyecto ya tiene una copia propia de un agente con secciones "El proyecto":

- Movélas al `AGENTS.md` del proyecto, versionado ahí, y volvé a instalar el agente genérico.
- **No corras el instalador sobre ese proyecto sin antes mover esas secciones**, o las perdés: el instalador pisa los archivos de `.claude/agents/`.
- Si este repo cambia una regla genérica, revisá si el `AGENTS.md` del proyecto la contradice.
