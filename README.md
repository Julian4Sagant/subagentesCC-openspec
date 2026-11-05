# Subagentes OpenSpec

Cinco subagentes que se reparten el apply de un change de OpenSpec: uno implementa, otro escribe los tests desde la spec sin ver el código, otro revisa, y dos especialistas entran cuando hacen falta.

La idea central: **los tests verifican el contrato, no la implementación.** Si el mismo agente escribe el código y los tests, tiende a ajustar los tests hasta que pasan. Separando los roles, un test puede fallar de verdad cuando el código se desvía de la spec. Más en [Por qué un grafo](docs/01-por-que-un-grafo.md).

| Subagente | Rol | Modelo | Modo |
|---|---|---|---|
| `implementador` | Implementa las tareas de su área en su propio worktree. | sonnet | Escritura |
| `tester` | Escribe los tests de los Scenarios desde la spec, sin ver `src/main`. | haiku | Escritura en `src/test` |
| `revisor` | Revisa lo integrado contra spec y design y da un veredicto. | sonnet | Solo lectura |
| `security-auditor` | Audita cambios en autenticación, permisos, errores, logs o secretos. | opus | Solo lectura |
| `postgres-pro` | Diseña y revisa migraciones, constraints y consultas de PostgreSQL. | sonnet | Escritura |

## Instalación rápida

Desde PowerShell, dentro de la carpeta de este repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Proyecto C:\ruta\al\proyecto
```

Requisitos, verificación y variantes por proyecto en [Instalación](docs/03-instalacion.md). Para otras CLIs de agentes, ver [Orquestador](docs/09-orquestador.md) y [Portabilidad](docs/10-portabilidad.md).

## Documentación

- [Índice y por dónde empezar](docs/README.md)
- [Por qué un grafo de agentes y no uno solo](docs/01-por-que-un-grafo.md)
- [Conceptos](docs/02-conceptos.md)
- [Instalación](docs/03-instalacion.md)
- [Agentes](docs/04-agentes.md)
- [Uso](docs/05-uso.md)
- [Casos de uso](docs/06-casos-de-uso.md)
- [Patrones](docs/07-patrones.md): el contrato de cada proyecto y las reglas que todos los agentes asumen
- [Orquestador](docs/09-orquestador.md): corre el apply con los roles y cualquier CLI de agentes configurable
- [Portabilidad](docs/10-portabilidad.md): qué es neutral respecto de la herramienta, qué sigue atado a Claude Code y qué está probado

## Contenido del repo

```
roles/      la fuente de cada agente, neutral respecto del modelo y de la herramienta (se edita esto)
agents/     los cinco agentes para Claude Code, generados desde roles/ con scripts/generar.js (no editar a mano)
hooks/      hook del tester que bloquea src/main, y guarda de escritura para git y el proyecto
workflows/  el grafo del apply como script de la herramienta Workflow de Claude Code (el orquestador portable está en scripts/orquestar.js)
config/     configuración de las CLIs de agentes para el orquestador
skills/     skills que precargan los agentes, como el checklist OWASP del security-auditor
scripts/    instalador, verificador de @DisplayName, verificador de contrato de proyecto, validadores de agentes y workflows, y pruebas
docs/       documentación, y ejemplos de los archivos del proyecto en docs/ejemplos/
.github/    CI: valida los agentes, prueba los hooks y revisa la sintaxis del workflow
```

Ninguno de los archivos contiene claves, tokens ni datos reales.
