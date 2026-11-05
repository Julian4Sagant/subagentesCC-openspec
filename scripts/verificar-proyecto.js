#!/usr/bin/env node
// Verifica que un proyecto cumpla el contrato de los agentes de este repo: los archivos que leen,
// las copias instaladas que coinciden con la fuente y el hook del tester.
// Uso (desde la raíz del repo): node scripts/verificar-proyecto.js <ruta-del-proyecto>
// Sale con 0 si todo está bien, 1 si falta algo o hay una copia desviada, y 2 si el uso es incorrecto.

const fs = require('fs');
const path = require('path');

const raizRepo = path.resolve(__dirname, '..');
const carpetaAgentes = path.join(raizRepo, 'agents');

/** Normaliza finales de línea para comparar copias hechas en Windows y en Linux. */
function normalizar(texto) {
	return texto.replace(/\r\n/g, '\n');
}

/** Verdadero si el texto importa el archivo con una línea `@archivo`, fuera de bloques de código. */
function tieneImport(texto, archivo) {
	const sinCodigo = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
	const escapado = archivo.replace(/\./g, '\\.');
	return new RegExp(`^@${escapado}\\s*$`, 'm').test(sinCodigo);
}

/** Devuelve la lista de problemas del proyecto. Vacía si cumple el contrato. */
function verificarProyecto(raizProyecto) {
	const problemas = [];
	const existe = (ruta) => fs.existsSync(path.join(raizProyecto, ruta));

	// El contrato vive en AGENTS.md, que leen todas las CLIs. CLAUDE.md solo lo importa para Claude Code.
	if (!existe('AGENTS.md')) {
		problemas.push('falta AGENTS.md: ahí van el stack y las reglas que leen los agentes (si están en CLAUDE.md, pasalas a AGENTS.md)');
	}
	if (!existe('CLAUDE.md')) {
		problemas.push('falta CLAUDE.md con la línea @AGENTS.md: sin ella, Claude Code no lee el contrato');
	}
	else if (!tieneImport(fs.readFileSync(path.join(raizProyecto, 'CLAUDE.md'), 'utf8'), 'AGENTS.md')) {
		problemas.push('CLAUDE.md no importa AGENTS.md: agregá la línea @AGENTS.md');
	}

	if (!existe('openspec/config.yaml')) {
		problemas.push('falta openspec/config.yaml: el implementador lee su campo context');
	} else if (!/^context:/m.test(fs.readFileSync(path.join(raizProyecto, 'openspec/config.yaml'), 'utf8'))) {
		problemas.push('openspec/config.yaml no tiene el campo context');
	}

	// openspec show --json exige estos encabezados en proposal.md, aunque el texto sea en otro idioma.
	const carpetaCambios = path.join(raizProyecto, 'openspec/changes');
	if (fs.existsSync(carpetaCambios)) {
		for (const cambio of fs.readdirSync(carpetaCambios, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'archive')) {
			const propuesta = path.join(carpetaCambios, cambio.name, 'proposal.md');
			if (!fs.existsSync(propuesta)) {
				continue;
			}
			const texto = fs.readFileSync(propuesta, 'utf8');
			for (const encabezado of ['## Why', '## What Changes']) {
				if (!new RegExp(`^${encabezado}\\s*$`, 'm').test(texto)) {
					problemas.push(`openspec/changes/${cambio.name}/proposal.md no tiene el encabezado "${encabezado}": openspec show --json lo exige (el texto puede ir en otro idioma)`);
				}
			}
		}
	}

	const flujo = path.join(raizProyecto, 'docs/flujo-de-trabajo.md');
	if (!fs.existsSync(flujo)) {
		problemas.push('falta docs/flujo-de-trabajo.md: el revisor lo consulta');
	} else if (!/Al cerrar cada grupo del apply/.test(fs.readFileSync(flujo, 'utf8'))) {
		problemas.push('docs/flujo-de-trabajo.md no tiene la sección "Al cerrar cada grupo del apply"');
	}

	if (!existe('.claude/hooks/tester-sin-src-main.js')) {
		problemas.push('falta .claude/hooks/tester-sin-src-main.js: sin él el tester no está protegido');
	}

	for (const archivo of fs.readdirSync(carpetaAgentes).filter(a => a.endsWith('.md'))) {
		const copia = path.join('.claude/agents', archivo);
		if (!existe(copia)) {
			problemas.push(`falta el agente ${copia}: instalalo con node scripts/instalar.js --proyecto <ruta>`);
			continue;
		}
		const fuente = normalizar(fs.readFileSync(path.join(carpetaAgentes, archivo), 'utf8'));
		const instalada = normalizar(fs.readFileSync(path.join(raizProyecto, copia), 'utf8'));
		if (fuente !== instalada) {
			problemas.push(`${copia} no coincide con agents/${archivo}: si tenía secciones propias, movelas al AGENTS.md y volvé a instalar`);
		}
	}

	return problemas;
}

if (require.main === module) {
	const proyecto = process.argv[2];
	if (!proyecto || !fs.existsSync(proyecto)) {
		console.error('Uso: node scripts/verificar-proyecto.js <ruta-del-proyecto>');
		process.exit(2);
	}
	const problemas = verificarProyecto(proyecto);
	if (problemas.length === 0) {
		console.log('OK: el proyecto cumple el contrato de los agentes.');
		process.exit(0);
	}
	for (const p of problemas) {
		console.log(`[FALTA] ${p}`);
	}
	console.log(`${problemas.length} problema(s).`);
	process.exit(1);
}

module.exports = { verificarProyecto };
