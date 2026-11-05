# Patrones

Las formas de hacer las cosas que todos los agentes de este repo asumen. Cambiarlas es un cambio del repo, no de un proyecto: si un proyecto necesita otra cosa, lo resuelve en su `AGENTS.md` o en su `openspec/config.yaml`.

## 1. Lo genérico va acá, lo del proyecto va en el proyecto

- Este repo define **roles, permisos y formatos de reporte**. Son iguales para todos los proyectos.
- Cada proyecto define su **stack, sus reglas y su arquitectura** en `AGENTS.md`, `openspec/config.yaml` y `docs/flujo-de-trabajo.md`.
- Nunca se edita a mano una copia instalada en `.claude/agents/`. El próximo instalador la pisa, y `verificar-proyecto.js` la marca como desviada.

## 2. El contrato de un proyecto

Un proyecto está listo para los agentes cuando `node scripts/verificar-proyecto.js <ruta>` sale con 0. Ese script comprueba:

| Qué | Por qué |
|---|---|
| `AGENTS.md` (y `CLAUDE.md` con la línea `@AGENTS.md`) | Stack y reglas, que leen el tester, el revisor, el security-auditor y el postgres-pro. |
| `openspec/config.yaml` con `context:` | Arquitectura y contrato, que lee el implementador. |
| `docs/flujo-de-trabajo.md` con "Al cerrar cada grupo del apply" | El criterio de cierre que usa el revisor. |
| `.claude/hooks/tester-sin-src-main.js` | Sin él, el tester puede leer `src/main`. |
| Los cinco agentes en `.claude/agents/`, idénticos a `agents/` | Que todos los proyectos corran la misma versión de cada rol. |

Opcional pero recomendado: un `GLOSSARY.md` en la raíz con el vocabulario del dominio, que el orquestador y los agentes leen para usar los mismos nombres. Y una carpeta `.out-of-scope/` con una nota por cada propuesta descartada, para que un agente no la vuelva a proponer sin saber por qué se descartó.

## 3. Roles y permisos

| Rol | Escribe | Lee `src/main` | Herramientas de escritura | Guarda |
|---|---|---|---|---|
| `implementador` | Solo código de su área, en su worktree | Sí | `Write`, `Edit` | `sin-escritura.js` (sin git) |
| `tester` | Solo `src/test`, desde la spec | **No** (`tester-sin-src-main.js`) | `Write`, `Edit` | `sin-escritura.js` y el hook de `src/main` |
| `revisor` | Nada | Sí | Ninguna (`Read`, `Grep`, `Glob`, `Bash`) | `sin-escritura.js --solo-lectura` |
| `security-auditor` | Nada | Sí | Ninguna | `sin-escritura.js --solo-lectura` |
| `postgres-pro` | Migraciones y consultas | Sí | `Write`, `Edit` | `sin-escritura.js` |

Regla de integración: **solo el orquestador** marca checkboxes, integra worktrees y commitea. Los agentes reportan y proponen el mensaje de commit.

Regla de la spec: **la spec es la fuente de verdad**. Si un test contradice la spec, o la spec es ambigua, el agente se detiene y lo reporta. No elige una lectura por su cuenta.

## 4. Formatos fijos

Cada agente termina con un reporte de formato fijo, en español. El revisor cierra con una de dos líneas exactas:

```
VEREDICTO: APROBADO
```

```
VEREDICTO: CAMBIOS REQUERIDOS
1. [código|tests|artefactos] archivo:línea — qué cambiar
```

El orquestador lee esa última línea para decidir si vuelve al agente de cada área (máximo 3 vueltas). Por eso un formato que cambia de una versión a otra rompe el flujo: si cambiás un reporte, cambiá también al que lo lee.

## 5. Cómo agregar o cambiar un agente

La fuente de cada agente es `roles/<nombre>.md`. `agents/` se genera desde ahí y no se edita a mano.

1. Frontmatter neutral: `name` igual al nombre del archivo, `description`, `nivel` (`fuerte`, `medio` o `rapido`), `herramientas` (`todas` o una lista de `leer`, `ejecutar`, `escribir`), `guardas` y `skills`. El nivel no nombra un modelo: la traducción a alias de modelo la hace el generador.
2. Un rol sin `escribir` en `herramientas` es de solo lectura: el generador le pone `sin-escritura.js --solo-lectura` y no le da herramientas de escritura.
3. Un rol que escribe lleva `sin-escritura` en `guardas` (sin `--solo-lectura`). Todo rol debe llevarla: el generador rechaza la fuente si falta.
4. Reporte con formato fijo, igual que los demás.
5. Corré `node scripts/generar.js` para regenerar `agents/`. Agregalo a la tabla de [README](../README.md) y a [Agentes](04-agentes.md).
6. Corré las validaciones (abajo). CI verifica que `agents/` coincida con `roles/` y corre las pruebas del generador en cada PR.

## 6. Qué se verifica y dónde

| Comando | Qué comprueba |
|---|---|
| `node scripts/generar.js --verificar` | Que `agents/` coincide con `roles/` (sale con 1 si alguien lo editó a mano). |
| `node --test scripts/test-generar.js` | Que la fuente neutral se traduce bien y que las fuentes inválidas se rechazan. |
| `node scripts/validar-agentes.js` | Frontmatter, guardas, modelos y rutas de hooks y skills de los agentes generados. |
| `node --test scripts/test-hooks.js` | Que los hooks bloquean lo que tienen que bloquear. |
| `node --test scripts/test-verificar-proyecto.js` | Que el contrato de proyecto detecta lo que falta o se desvió. |
| `node scripts/validar-workflows.js` | Que el workflow del apply parsea y declara su `meta`. |
| `node scripts/verificar-proyecto.js <ruta>` | Que un proyecto concreto cumple el contrato (paso 2). |

## 7. Garantías que no dependen de la herramienta

Los hooks filtran el texto de un comando, así que solo protegen dentro de Claude Code. Para que las garantías valgan con cualquier CLI, `scripts/garantias.js` las comprueba sobre lo que cambió de verdad en el repo y en el disco:

| Garantía | Cómo se comprueba | Comando |
|---|---|---|
| El revisor y el auditor no cambian nada | Se toma una foto antes (HEAD, rama, stash y hash de cada archivo tocado, incluido lo que ya estaba sin commitear) y se compara después. Lo ignorado por git, como `target/`, no cuenta. | `snapshot`, después `solo-lectura` |
| El tester no ve `src/main` | Se crea un worktree con `src/main` excluido por sparse-checkout. Git no lo escribe en disco. Después se verifica que no haya aparecido. | `ciego`, después `verificar-ciego` |
| Ningún agente commitea | Un commit mueve HEAD y lo detecta la comparación de solo lectura. Sirve también para los roles que escriben: la foto antes y la comparación de HEAD al final muestran si hubo commit. | `snapshot` y `solo-lectura` |

El hook `sin-escritura.js` también bloquea `git sparse-checkout` y `git worktree`, para que un agente no pueda materializar `src/main` desde su propio worktree.

`scripts/orquestar.js` los corre solo después de cada rol. Ver [Orquestador](09-orquestador.md).

## Límites

Las guardas son una barrera contra errores, no un límite de seguridad. Lo que tiene que estar garantizado se garantiza quitando herramientas (un agente sin `Write` no puede escribir), no con un hook. Ver [Instalación, límites de las guardas](03-instalacion.md#límites-de-las-guardas).

Las comprobaciones de esta sección son posteriores: detectan el cambio pero no lo evitan. `verificar-ciego` revisa dos cosas: que la ruta excluida no exista en disco, y que ningún enlace simbólico del worktree apunte fuera de él. Lo que no cubre: un enlace que el tester cree y después se borra antes de la verificación, o un proceso que lea el código excluido sin escribirlo en el worktree.
