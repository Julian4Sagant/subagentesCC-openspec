# AGENTS.md — ejemplo para un proyecto

Ejemplo de la parte de `AGENTS.md` del proyecto que leen los agentes. Todo lo que
está acá es ficticio: reemplazalo por las reglas de tu proyecto.

## Stack
- Java 21, Spring Boot 3.x, PostgreSQL 16 con Flyway.
- Acceso a datos con `JdbcClient`. Sin JPA ni H2: los tests usan Testcontainers.

## Tests
- Clases base: `ClaseBaseTest` (levanta el contexto) y `DatosDePrueba` (datos ficticios).
- Relojes de prueba: `RelojFijo` en lugar de `Instant.now()`.

## Errores y logs
- Errores como ProblemDetail, con `type` `urn:proyecto:error:<caso>`.
- Nunca loguear cuerpos de request, claves ni tokens.

## Datos
- Ejemplos y fixtures con datos ficticios. Nunca datos reales de personas ni claves.
