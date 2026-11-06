#!/usr/bin/env node
'use strict';
// Valida la fuente canónica (agents/): frontmatter, formatos de reporte y ausencia de
// nombres de modelo o de host en el texto. Sale con 0 si todo está bien, con 1 si no.
// Uso: node scripts/validar-agentes.js [carpeta]   (por defecto, agents/ de este repo)

const path = require('path');
const { cargarRoles, ACCESOS, CAMPOS } = require('./lib/canon');

const RAIZ = path.resolve(__dirname, '..');

// Nada de esto puede aparecer en el texto canónico: si aparece, el rol deja de ser portable.
const PROHIBIDO = /\$CLAUDE_PROJECT_DIR|\.claude\/|\.opencode|\.gemini|\.codex|\.kimi|subagent_type|\bTask tool\b|\/opsx:|\b(claude|haiku|sonnet|opus|gpt|gemini|kimi|deepseek|codex|opencode)\b/gi;

/** Devuelve la lista de problemas encontrados en la carpeta. Lista vacía = todo bien. */
function validar(dir) {
	const problemas = [];
	const roles = cargarRoles(dir);
	if (roles.length === 0) {
		problemas.push(`${dir}: no hay roles .md`);
	}
	const nombres = new Set();

	for (const rol of roles) {
		const rel = rol.archivo;
		if (!rol.meta) {
			problemas.push(`${rel}: falta el frontmatter (bloque entre dos líneas ---)`);
			continue;
		}
		for (const campo of CAMPOS) {
			if (!rol.meta[campo]) {
				problemas.push(`${rel}: falta el campo "${campo}"`);
			}
		}
		const base = path.basename(rel, '.md');
		if (rol.meta.name && rol.meta.name !== base) {
			problemas.push(`${rel}: name "${rol.meta.name}" no coincide con el nombre del archivo`);
		}
		if (nombres.has(rol.meta.name)) {
			problemas.push(`${rel}: name "${rol.meta.name}" repetido`);
		}
		nombres.add(rol.meta.name);
		if (rol.meta.name && !/^[a-z][a-z0-9-]*$/.test(rol.meta.name)) {
			problemas.push(`${rel}: name debe ser minúsculas, números y guiones`);
		}
		if (rol.meta.acceso && !ACCESOS.includes(rol.meta.acceso)) {
			problemas.push(`${rel}: acceso "${rol.meta.acceso}" debe ser lectura o escritura`);
		}
		if (rol.meta.description && rol.meta.description.length < 40) {
			problemas.push(`${rel}: description muy corta; es lo que usa el host para decidir cuándo delegar`);
		}
		for (const seccion of ['## Rol', '## Procedimiento', '## Reglas', '## Reporte']) {
			if (!rol.cuerpo.includes(seccion)) {
				problemas.push(`${rel}: falta la sección "${seccion}"`);
			}
		}
		if (rol.meta.name === 'revisor' && !rol.cuerpo.includes('VEREDICTO: APROBADO')) {
			problemas.push(`${rel}: el revisor debe declarar el formato de VEREDICTO`);
		}
		const texto = `${rol.meta.description}\n${rol.cuerpo}`;
		for (const m of new Set(texto.match(PROHIBIDO) || [])) {
			problemas.push(`${rel}: contiene "${m}", que ata el rol a un modelo o a un host`);
		}
	}
	return problemas;
}

if (require.main === module) {
	const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RAIZ, 'agents');
	const problemas = validar(dir);
	if (problemas.length) {
		console.error(problemas.map(p => `- ${p}`).join('\n'));
		process.exit(1);
	}
	console.log(`OK: ${cargarRoles(dir).length} roles válidos en ${dir}`);
}

module.exports = { validar };
