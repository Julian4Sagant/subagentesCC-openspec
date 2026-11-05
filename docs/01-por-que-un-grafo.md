# Por qué un grafo de agentes y no uno solo

## Resumen para líderes

- **Qué es:** cinco subagentes que se reparten el apply de un change de OpenSpec. Uno implementa, otro escribe los tests desde la spec, otro revisa, y dos especialistas (seguridad y PostgreSQL) entran solo cuando hacen falta.
- **Qué resuelve:** cuando un solo agente escribe el código y los tests, tiende a escribir tests que confirman lo que hizo, no lo que la spec pide. Separar los roles hace que los tests puedan fallar de verdad.
- **Qué cuesta:** más tokens que un agente solo, porque cada subagente arranca sin contexto y relee los artefactos. Por eso se usa en grupos de tareas grandes o con varias áreas, no en todo.
- **Estado:** los agentes están configurados, sus scripts probados y aplicados en un proyecto real. Todavía no hay una medición de punta a punta sobre un change completo; es el próximo paso.

## Un agente contra el grafo

| Aspecto | Un solo agente | Grafo de agentes |
|---|---|---|
| **Contexto** | Carga toda la conversación: spec, código, tests, logs de Maven. Con el tiempo se llena y pierde detalle. | Cada agente lee solo lo que necesita para su rol. El orquestador recibe reportes cortos, no los archivos. |
| **Tests** | Los escribe después de ver el código, y los ajusta hasta que pasan. | El tester los escribe desde la spec, sin acceso a `src/main`. Si el código se desvía del contrato, el test falla. |
| **Revisión** | La hace el mismo que implementó, con su mismo razonamiento y sus mismos puntos ciegos. | El revisor recibe la spec, el design y el diff, pero no el razonamiento del implementador. |
| **Paralelismo** | Una tarea después de la otra. | Un implementador por área de código y el tester trabajan al mismo tiempo, cada uno en su worktree. |
| **Especialistas** | El mismo agente "se acuerda" de revisar seguridad o SQL, o no. | El security-auditor y el postgres-pro se lanzan explícitamente cuando el cambio toca sus áreas. |
| **Trazabilidad** | Texto libre en la conversación. | Cada agente termina con un reporte de formato fijo (`RESULTADO`, `VEREDICTO`), fácil de comparar entre iteraciones. |
| **Costo** | Menor. | Mayor: varios agentes leen los mismos artefactos. |
| **Complejidad** | Ninguna: se le pide y lo hace. | Hay que orquestar: repartir tareas, crear worktrees, juntar el trabajo. |

## El problema central, con un ejemplo

La spec dice: *"Cuando el monto es negativo, la API responde 400 con el error `monto-invalido`"*.

**Con un solo agente:** implementa la validación, pero por un descuido responde 422. Después escribe el test, corre la suite, ve que espera 400 y recibe 422, y "arregla" el test para que espere 422. La suite queda en verde y el contrato quedó roto sin que nadie lo note.

**Con el grafo:** el tester escribe el test desde la spec, esperando 400, sin ver el código. El implementador, en paralelo, responde 422. En el join el test falla. El revisor clasifica el hallazgo como `código`, y el implementador lo corrige. La spec manda: el test no se toca.

Esa es la mejora principal: **los tests verifican el contrato, no la implementación**.

## Cuándo no conviene

- **Grupos chicos o de una sola área:** si son dos o tres tareas en el mismo paquete, la sesión principal lo hace más rápido y más barato.
- **Cambios exploratorios:** si la spec todavía cambia cada hora, los agentes trabajan sobre algo que se mueve. Primero estabilizá la spec con `/opsx:explore` y `/opsx:propose`.
- **Arreglos de una línea:** el costo de orquestar supera el beneficio.

Regla práctica: usá el grafo cuando el grupo tiene **dos o más áreas de código que no se pisan, o muchos Scenarios**.

## Límites que conviene conocer

- **El hook del tester es una barrera contra accidentes, no un límite de seguridad.** Bloquea las lecturas de `src/main` por las herramientas comunes, pero un symlink o un comando que arme la ruta en partes puede esquivarlo. La garantía fuerte es que el worktree del tester no tenga el código de producción.
- **El costo crece con la cantidad de agentes.** Un revisor por grupo y una sola verificación final por change, no uno por tarea.
- **El revisor corre en Sonnet.** Antes corría en Opus. Conviene comparar cuántos problemas detecta cada uno en un par de changes reales antes de decidir el modelo final.
- **Los agentes asumen OpenSpec.** Sin changes, specs con Scenarios y `tasks.md`, no tienen de dónde tomar el contrato.
