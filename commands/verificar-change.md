---
description: Verificación final de un change de OpenSpec antes de archivarlo
argument-hint: <change-id>
---
Verificación final del change $1. Sos el orquestador: no implementes ni cambies código.

1. Verificá que estás en la rama `change/$1` y que todos los grupos de `openspec/changes/$1/tasks.md` están marcados como cumplidos. Si falta alguno, paráte y avisame.
2. Lanzá el subagente `revisor` sobre el change completo, en modo verificación final. Debe usar la skill `openspec-verify-change` y devolver su reporte (CRITICAL, WARNING, SUGGESTION) junto con su veredicto.
3. Mostrame el reporte tal cual, con el veredicto al principio.

No archives el change, no hagas commit, push ni PR. Eso lo decido yo después de leer el reporte.
