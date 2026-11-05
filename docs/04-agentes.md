# Los agentes

Cada ficha resume el archivo de [`agents/`](../agents). Si algo de acá no coincide con el archivo, manda el archivo.

| Agente | Modelo | Escribe código | Cuándo |
|---|---|---|---|
| [implementador](#implementador) | sonnet | Sí, en su área | Siempre, uno por área |
| [tester](#tester) | haiku | Sí, solo `src/test` | Siempre, en paralelo con los implementadores |
| [revisor](#revisor) | opus | No | Siempre, después del join |
| [security-auditor](#security-auditor) | opus | No | Si el grupo toca autenticación, permisos, errores, logs o secretos |
| [postgres-pro](#postgres-pro) | sonnet | Sí, migraciones y acceso a datos | Si el grupo toca tablas, índices, constraints o consultas |

---

## implementador

**Rol:** implementa las tareas de `tasks.md` que le asigna el orquestador, en su propio worktree y dentro de un área de código.

- **Modelo y herramientas:** `sonnet`, todas las herramientas. Precarga la skill `openspec-apply-change`. Tiene la guarda que le bloquea los comandos de git que cambian el repo (`sin-escritura.js`).
- **Recibe:** el change-id, el worktree, las tareas (con su `sourcePath` y `line`) y el área de código.
- **Hace:** sigue la skill de apply acotada a sus tareas, escribe los tests unitarios que pida su tarea y corre la suite en su worktree.
- **No hace:** marcar checkboxes, commitear, editar artefactos de OpenSpec, tocar otras áreas, ni usar `@DisplayName` con nombres de Scenario (eso es del tester). Si un test contradice la spec, no acomoda el código al test: lo reporta.
- **Se detiene y reporta** si la spec es ambigua o contradice al design.

**Reporte:**

```
RESULTADO: COMPLETADO
TAREAS_COMPLETADAS:
- openspec/changes/agregar-validaciones/tasks.md:12 validar monto en el servicio
PROGRESO: 3 de 7 tareas
ARCHIVOS:
- src/main/java/.../SolicitudService.java (modificado)
TESTS: ./mvnw -B -q test → 48 tests, 0 fallos
DESVIOS:
- ninguno
PARA_OPSX_UPDATE:
- el design no dice si el monto 0 es válido; la spec tampoco
ESPERA_DE_OTROS:
- que el controller traduzca MontoInvalidoException a 400
COMMIT_PROPUESTO: feat(solicitudes): validar monto en el servicio
```

---

## tester

**Rol:** escribe los tests de los Scenarios **a partir de la spec, sin ver la implementación**, para que puedan fallar si el código se desvía del contrato.

- **Modelo y herramientas:** `haiku`; `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`. Tiene el hook que le bloquea `src/main` y la guarda que le bloquea los comandos de git que cambian el repo.
- **Recibe:** el change-id, el worktree y los Scenarios que le tocan.
- **Lee:** `openspec show --deltas-only` para los nombres exactos de los Scenarios, del `design.md` solo el contrato observable (rutas, forma de los JSON, errores), y los tests existentes como modelo de estilo.
- **Hace:** un test por Scenario con `@DisplayName` igual al nombre del Scenario, letra por letra. Agrupa por requirement y prueba los bordes de cada umbral.
- **No hace:** leer `src/main`, compilar ni correr los tests (dependen de código que no ve; los compila el orquestador en el join), tocar artefactos ni commitear. Si el hook lo bloquea, toma un supuesto y lo reporta.

**Reporte:**

```
RESULTADO: TESTS ESCRITOS
SCENARIOS: 4
ARCHIVOS:
- src/test/java/.../ValidacionSolicitudHttpTest.java
MAPA:
- Monto negativo devuelve 400 → ValidacionSolicitudHttpTest#montoNegativo (tarea 2.3)
SUPUESTOS:
- el endpoint es POST /solicitudes, como dice el design
AMBIGUEDADES:
- "monto inválido" no dice si 0 es inválido
```

---

## revisor

**Rol:** revisor independiente. Revisa el código integrado contra la spec y el design, sin conocer el razonamiento de quienes lo implementaron.

- **Modelo y herramientas:** `opus`; `Read`, `Grep`, `Glob`, `Bash`. Precarga la skill `openspec-verify-change`. Solo lectura, con la guarda `sin-escritura.js --solo-lectura`: no puede escribir archivos en el proyecto ni hacer git que cambie el repo.
- **Recibe:** el change-id, el checkout integrado y el número de grupo.
- **Hace:** corre `openspec validate --strict`, lee el diff, corre `verificar-displaynames.js`, arma la matriz **Scenario → test → código**, y revisa lógica, errores, rendimiento, duplicación y fugas en logs.
- **No hace:** editar archivos ni hacer operaciones de git que escriben. Puede correr tests.
- **Verificación final:** antes de `/opsx:archive`, revisa el change completo con la skill `openspec-verify-change`.

**Reporte:** la matriz, los hallazgos por severidad (bloqueante, importante, menor) y, al final, exactamente uno de estos veredictos:

```
VEREDICTO: APROBADO
```

```
VEREDICTO: CAMBIOS REQUERIDOS
1. [código] src/main/java/.../SolicitudController.java:41 — responde 422; la spec pide 400
2. [tests] src/test/java/.../ValidacionSolicitudHttpTest.java:30 — @DisplayName no coincide con el Scenario
```

El área entre corchetes (`código`, `tests`, `artefactos`) dice a quién vuelve cada punto en el [ciclo de corrección](05-uso.md#ciclo-de-corrección).

---

## security-auditor

**Rol:** audita los cambios que tocan seguridad. No corrige: reporta con evidencia.

- **Modelo y herramientas:** `opus`; `Read`, `Grep`, `Glob`, `Bash`. Solo lectura, con la misma guarda que el revisor (`sin-escritura.js --solo-lectura`). Precarga la skill `owasp-checklist` ([`skills/owasp-checklist/`](../skills/owasp-checklist/SKILL.md)), que recorre las diez categorías de OWASP Top 10:2025 adaptadas a Spring Boot.
- **Cuándo:** solo si el grupo toca autenticación, tokens o claves, permisos por rol, manejo de errores, logs o secretos.
- **Busca:** tokens mal validados, endpoints sin regla de rol, objetos accesibles sin chequear el dueño, entradas sin validar, stack traces o SQL en respuestas, secretos o cuerpos de requests en logs, CORS o Actuator expuestos.
- **Severidad:** CRITICAL (acceso sin autorización, fuga de secretos o datos personales), WARNING (requiere condiciones o debilita una defensa), SUGGESTION (endurecimiento sin riesgo concreto). Sin evidencia, es una sugerencia.

**Reporte:** hallazgos con archivo:línea, escenario de ataque y corrección, y al final:

```
VEREDICTO: CON HALLAZGOS
CRITICAL: 0  WARNING: 1  SUGGESTION: 2
```

---

## postgres-pro

**Rol:** diseña y revisa migraciones, constraints y consultas de PostgreSQL para que el esquema coincida con la spec y las consultas usen índices.

- **Modelo y herramientas:** `sonnet`; `Read`, `Grep`, `Glob`, `Bash`, `Write`, `Edit`, con la guarda que le bloquea los comandos de git que cambian el repo. El diseño de migraciones y constraints es la parte más delicada del grafo, por eso no va en Haiku.
- **Cuándo:** si el grupo agrega o modifica tablas, índices, constraints o consultas.
- **Reglas:** nunca edita una migración que ya está en `main`; cada cambio es una migración nueva. Las reglas de la spec que se pueden expresar en la base (unicidad, `CHECK`, FK, `NOT NULL`) van en la base. Todo listado lleva orden estable y paginación. Tests contra PostgreSQL real con Testcontainers, nunca H2. Sigue las reglas de acceso a datos de `CLAUDE.md` del proyecto.

**Reporte:**

```
RESULTADO: APROBADO
MIGRACIONES:
- V7__historial_evaluaciones.sql (creada)
CONSTRAINTS_E_INDICES:
- idx_historial_creado_en → "El listado se ordena por fecha descendente"
CONSULTAS:
- listar historial → usa idx_historial_creado_en; orden con desempate por id
DESVIOS:
- ninguno
```
