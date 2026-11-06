#!/usr/bin/env node
'use strict';
// Genera dist/ a partir de agents/ (la única fuente). Un archivo por host y por rol, más un
// AGENTS.md con todos los roles y una carpeta de prompts planos para cualquier otro asistente.
//
//   node scripts/generar-adaptadores.js           escribe dist/
//   node scripts/generar-adaptadores.js --check   sale con 1 si dist/ no coincide con agents/ (lo usa CI)

const fs = require('fs');
const path = require('path');
const { cargarRoles } = require('./lib/canon');
const { validar } = require('./validar-agentes');

const RAIZ = path.resolve(__dirname, '..');
const AGENTES = path.join(RAIZ, 'agents');
const DIST = path.join(RAIZ, 'dist');

// Herramientas por acceso. Los nombres de Gemini CLI y de OpenCode están sin verificar en la
// versión instalada: ver docs/02-hosts.md antes de confiar en ellos.
const CLAUDE_TOOLS = { lectura: 'Read, Grep, Glob, Bash', escritura: 'Read, Write, Edit, Bash, Grep, Glob' };
const GEMINI_TOOLS = {
	lectura: ['read_file', 'grep_search', 'glob', 'run_shell_command'],
	escritura: ['read_file', 'write_file', 'replace', 'grep_search', 'glob', 'run_shell_command'],
};

/** Valor YAML seguro: JSON.stringify produce una cadena entre comillas válida en YAML. */
const yaml = valor => JSON.stringify(valor);

/** Baja los encabezados un nivel, para anidarlos dentro de AGENTS.md. */
const anidar = cuerpo => cuerpo.replace(/^(#{1,5}) /gm, '$1# ');

function salidas(roles) {
	const archivos = new Map();
	const secciones = [];

	for (const rol of roles) {
		const { name, description, acceso } = rol.meta;
		const lectura = acceso === 'lectura';

		archivos.set(`claude/${name}.md`,
			`---\nname: ${name}\ndescription: ${yaml(description)}\ntools: ${CLAUDE_TOOLS[acceso]}\n---\n\n${rol.cuerpo}`);

		const opencodePermisos = lectura ? '\ntools:\n  write: false\n  edit: false' : '';
		archivos.set(`opencode/${name}.md`,
			`---\ndescription: ${yaml(description)}\nmode: subagent${opencodePermisos}\n---\n\n${rol.cuerpo}`);

		const geminiTools = GEMINI_TOOLS[acceso].map(t => `  - ${t}`).join('\n');
		archivos.set(`gemini/${name}.md`,
			`---\nname: ${name}\ndescription: ${yaml(description)}\ntools:\n${geminiTools}\n---\n\n${rol.cuerpo}`);

		archivos.set(`prompts/${name}.md`,
			`<!-- Generado desde agents/${rol.archivo}. Pegalo como instrucciones del agente. -->\n\n${rol.cuerpo}`);

		secciones.push(`## Agente: ${name}\n\n**Acceso:** ${acceso}. ${description}\n\n${anidar(rol.cuerpo)}`);
	}

	archivos.set('AGENTS.md', [
		'# Agentes de OpenSpec (generado)',
		'',
		'Roles para el ciclo apply/verify de un change de OpenSpec. Cada uno es un subagente de solo',
		'lectura o de escritura según su acceso. El modelo lo elige quien usa el host, no este documento.',
		'',
		...secciones.map(s => s + '\n'),
	].join('\n'));

	return archivos;
}

function main(argv) {
	const problemas = validar(AGENTES);
	if (problemas.length) {
		console.error(problemas.map(p => `- ${p}`).join('\n'));
		return 1;
	}
	const esperado = salidas(cargarRoles(AGENTES));

	if (argv.includes('--check')) {
		const desactualizados = [...esperado].filter(([rel, contenido]) => {
			const actual = fs.existsSync(path.join(DIST, rel)) ? fs.readFileSync(path.join(DIST, rel), 'utf8') : null;
			return actual !== contenido;
		}).map(([rel]) => rel);
		if (desactualizados.length) {
			console.error('dist/ no coincide con agents/. Ejecutá node scripts/generar-adaptadores.js:');
			console.error(desactualizados.map(r => `- dist/${r}`).join('\n'));
			return 1;
		}
		console.log(`OK: dist/ al día (${esperado.size} archivos)`);
		return 0;
	}

	for (const [rel, contenido] of esperado) {
		const destino = path.join(DIST, rel);
		fs.mkdirSync(path.dirname(destino), { recursive: true });
		fs.writeFileSync(destino, contenido);
	}
	console.log(`Generados ${esperado.size} archivos en dist/`);
	return 0;
}

if (require.main === module) {
	process.exitCode = main(process.argv.slice(2));
}

module.exports = { salidas };
