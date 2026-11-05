# Skills de terceros

Este repo incluye skills de [mattpocock/skills](https://github.com/mattpocock/skills), publicadas bajo licencia MIT. La licencia y el aviso de copyright están en [`licenses/mattpocock-skills-MIT.txt`](../licenses/mattpocock-skills-MIT.txt). El instalador las copia a `.claude/skills/` junto con las propias.

## Incluidas

| Skill | Para qué sirve en este flujo | Cambios respecto del original |
|---|---|---|
| `grilling` | Interrogar un plan o una decisión hasta resolver cada rama. Lo usan otras skills. | Ninguno. |
| `grill-with-docs` | Sesión de preguntas que va creando el glosario y las decisiones. Sirve para `/opsx:explore`. | Ninguno. |
| `domain-modeling` | Mantener `GLOSSARY.md` y las ADR. | Ninguno. |
| `tdd` | Rojo, verde, refactor, de a una rebanada vertical. | Ninguno. |
| `diagnosing-bugs` | Bucle para bugs difíciles: reproducir, aislar, hipótesis, corregir, test de regresión. | Ninguno. |
| `code-review` | Revisión en dos ejes (Standards y Spec) en subagentes paralelos. | El eje Spec lee el change de OpenSpec, no un issue tracker. |
| `pr` | Forma del cuerpo de un PR. | Ninguno. |
| `retro` | Sugerencias para mejorar el entorno de agentes después de una sesión. | Ninguno. |
| `writing-for-agents` | Cómo escribir skills, `AGENTS.md` y otros documentos que leen los agentes. | Ninguno. |

## No incluidas

Estas skills dependen de un issue tracker o de un flujo distinto al de OpenSpec, y chocan con él:

- `setup-matt-pocock-skills`, `triage`, `to-spec`, `to-tickets`, `wayfinder`, `implement`, `implement-spec`: asumen issues como fuente de verdad. En este repo la spec es el change de OpenSpec.
- `ask-matt`: un router sobre las skills anteriores.
- `to-questionnaire`, `wait-what`, `teach`, `handoff`, `grill-me`: de productividad fuera de código. Se pueden agregar si hacen falta.
- `prototype`, `research`, `improve-codebase-architecture`, `codebase-design`, `wizard`: útiles, pero no forman parte del ciclo del apply. Se pueden agregar después.

Las carpetas `agents/` de cada skill (metadatos para Codex) no se copiaron: este repo genera los agentes para Claude Code desde `roles/` y no usa esos metadatos.

## Actualizar

Las copias son de una versión fijada. Para tomar cambios de upstream, comparalas con el repo original y repetí los cambios de la tabla de arriba.
