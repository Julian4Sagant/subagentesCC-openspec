# Orquestador

`scripts/orquestar.js` corre el apply de un change de OpenSpec con los roles de [`roles/`](../roles) y una CLI de agentes configurable. Reemplaza al workflow de Claude Code (`workflows/apply-change.js`) como forma de orquestar: el grafo vive en código, no en el runtime de una herramienta.

## Qué hace

1. **Implementar.** El tester escribe en un worktree ciego (sin `src/main`). Cada área implementa en su worktree. Después de cada rol, el orquestador confirma los cambios con un commit propio y aplica el parche al repo integrado. Los agentes no commitean.
2. **Revisar.** Corre las pruebas en el repo integrado. Después corre el revisor y, si se pide, el auditor de seguridad. Los dos son de solo lectura: si cambian algo en el repo, la corrida se bloquea.
3. **Corregir.** Hasta tres vueltas. Los hallazgos de código los corrige el implementador en el repo integrado. Los de tests, el tester en su worktree ciego. Los de artefactos los decide la persona.

La corrida termina en `APROBADO`, `ESCALA_A_PERSONA` o `BLOQUEADO`. `BLOQUEADO` significa que una garantía falló o que algo no pudo correr; el motivo va en el resultado.

## Uso

```bash
node scripts/orquestar.js \
  --change agregar-validaciones \
  --integrado /ruta/al/proyecto \
  --areas /ruta/a/areas.json \
  --salida /ruta/fuera/de/los/repos/apply-agregar-validaciones \
  --seguridad
```

`areas.json` lista las áreas que implementan. Cada worktree lo creás antes, desde el HEAD del repo integrado:

```json
[
  { "nombre": "solicitudes", "tareas": "2.1 a 2.4", "worktree": "/ruta/a/worktree-solicitudes" },
  { "nombre": "migraciones", "tareas": "3.1", "worktree": "/ruta/a/worktree-migraciones", "rol": "postgres-pro" }
]
```

Opciones:

| Opción | Por defecto | Qué hace |
|---|---|---|
| `--cli` | `claude` | Nombre de la CLI en `config/cli.json`. |
| `--config` | `config/cli.json` | Archivo con la configuración de las CLIs. |
| `--comando-tests` | `./mvnw -B -q test` | Comando de pruebas, corrido en el repo integrado. |
| `--seguridad` | desactivado | Agrega el auditor de seguridad a cada revisión. |
| `--max-vueltas` | `3` | Vueltas de corrección antes de escalar. |
| `--skills` | — | Carpeta extra donde buscar skills (se puede repetir). |

**La carpeta de salida tiene que quedar fuera de los repos y de los worktrees.** El orquestador confirma los worktrees con `git add -A`; si la salida quedara dentro, se commitearía. Lo valida antes de crear nada.

El resultado va a stdout y a `<salida>/resultado.json`. Los logs de cada rol van a `<salida>/logs/`. Sale con 0 solo si la corrida quedó `APROBADO`.

## Cómo se cumplen las garantías

| Garantía | Cómo |
|---|---|
| El tester no ve `src/main` | Worktree creado con sparse-checkout (`garantias.js`). Después de cada corrida se verifica que la ruta no haya aparecido y que ningún enlace salga del worktree. |
| El tester solo escribe en `src/test` | Se revisan las rutas cambiadas antes de confirmar. Si hay otras, se bloquea. |
| El revisor y el auditor no cambian nada | Foto del repo antes y comparación después (`garantias.js`). |
| Ningún agente commitea | Se compara HEAD antes y después de cada rol. |
| Los roles de solo lectura no tienen herramientas de escritura | La CLI recibe la lista de herramientas del rol. Para Claude, `--tools` la restringe. |

La última fila es la única que depende de la CLI: el orquestador le pasa la lista de herramientas, pero solo la CLI la puede imponer. Si una CLI no tiene forma de restringirlas, la garantía queda en la verificación posterior de solo lectura y no en la herramienta.

## Configurar una CLI

`config/cli.json` tiene una entrada por CLI, con esta forma:

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

- `{prompt}`: la tarea del rol, con su encabezado.
- `{sistema}`: el cuerpo del rol y sus skills. Si la plantilla no lo incluye, se antepone al prompt.
- `{herramientas}`: las herramientas del rol, según el mapa `herramientas`, separadas por coma.
- `{modelo}`: el modelo del nivel del rol según `modelos`. Si el nivel no tiene modelo, el flag que lo precede se quita y la CLI usa su default.

**Solo Claude está probado.** La entrada `claude` se probó de punta a punta con la CLI real, en modo headless, con un revisor de solo lectura: `Bash` funciona, `Write` no está disponible y el veredicto llega bien. Para otras CLIs hay que escribir la entrada y probarla antes de usarla: no hay ninguna verificada en este repo.

## Pruebas

```bash
node --test scripts/test-orquestar.js
```

Las pruebas corren el orquestador sobre repos git de verdad, con `scripts/fixtures/cli-falso.js` en lugar de un modelo. Cubren el camino feliz de punta a punta y cada violación de garantía: un revisor que escribe, un implementador que commitea, un tester que escribe fuera de `src/test`, una CLI que falla, una skill que falta y una salida dentro de un worktree.

## Lo que queda afuera

- **El workflow de Claude sigue en el repo** (`workflows/apply-change.js`) y `install.ps1` sigue copiándolo. Quitarlo es una decisión aparte: rompe a quien use el runtime `Workflow`.
- **Sin `--dry-run`.** Para ver qué correría, hay que leer `config/cli.json` y el `areas.json`.
- **Sin reintentos.** Si una CLI falla por red o por límite de uso, la corrida se bloquea.
- **Sin revisión de conflictos.** Si un parche de área no aplica al repo integrado, la corrida se bloquea con el error de `git apply`; la resolución es manual.
