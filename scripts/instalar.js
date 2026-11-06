#!/usr/bin/env node
'use strict';
// Copia los adaptadores de dist/ a un proyecto. Es idempotente: vuelve a correrlo para actualizar.
// AGENTS.md no se pisa: el bloque de este repo va entre marcadores y se reemplaza solo ese bloque.
//
//   node scripts/instalar.js <proyecto> [--hosts claude,opencode,gemini,agents,prompts]
//
// Por defecto instala todos los hosts. Cada host usa su propia carpeta; ver docs/02-hosts.md.

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const INICIO = '<!-- subagentes-openspec:inicio -->';
const FIN = '<!-- subagentes-openspec:fin -->';

// host → carpeta de origen en dist/ y destino en el proyecto
const DESTINOS = {
	claude: { origen: 'claude', destino: '.claude/agents' },
	opencode: { origen: 'opencode', destino: '.opencode/agents' },
	gemini: { origen: 'gemini', destino: '.gemini/agents' },
	prompts: { origen: 'prompts', destino: '.subagentes/prompts' },
};

function copiarCarpeta(origen, destino) {
	fs.mkdirSync(destino, { recursive: true });
	const archivos = fs.readdirSync(origen).filter(f => f.endsWith('.md'));
	for (const f of archivos) {
		fs.copyFileSync(path.join(origen, f), path.join(destino, f));
	}
	return archivos.length;
}

/** Escribe el bloque de AGENTS.md entre marcadores, sin tocar lo que ya hay fuera de ellos. */
function escribirBloque(proyecto) {
	const bloque = `${INICIO}\n${fs.readFileSync(path.join(DIST, 'AGENTS.md'), 'utf8').trim()}\n${FIN}\n`;
	const ruta = path.join(proyecto, 'AGENTS.md');
	const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
	const ini = actual.indexOf(INICIO);
	const fin = actual.indexOf(FIN);
	let nuevo;
	if (ini !== -1 && fin > ini) {
		nuevo = actual.slice(0, ini) + bloque + actual.slice(fin + FIN.length).replace(/^\n/, '');
	} else {
		nuevo = (actual && !actual.endsWith('\n') ? actual + '\n' : actual) + (actual ? '\n' : '') + bloque;
	}
	fs.writeFileSync(ruta, nuevo);
	return ruta;
}

function instalar(proyecto, hosts) {
	if (!fs.existsSync(path.join(DIST, 'AGENTS.md'))) {
		throw new Error('Falta dist/. Ejecutá node scripts/generar-adaptadores.js antes de instalar.');
	}
	const resumen = [];
	for (const host of hosts) {
		if (host === 'agents') {
			resumen.push(`AGENTS.md (bloque): ${escribirBloque(proyecto)}`);
			continue;
		}
		const d = DESTINOS[host];
		if (!d) {
			throw new Error(`Host desconocido: ${host}`);
		}
		const n = copiarCarpeta(path.join(DIST, d.origen), path.join(proyecto, d.destino));
		resumen.push(`${host}: ${n} archivos en ${d.destino}/`);
	}
	return resumen;
}

if (require.main === module) {
	const args = process.argv.slice(2);
	const proyecto = args.find(a => !a.startsWith('--'));
	const idx = args.indexOf('--hosts');
	const todos = [...Object.keys(DESTINOS), 'agents'];
	const hosts = idx === -1 ? todos : args[idx + 1].split(',').map(h => h.trim()).filter(Boolean);
	if (!proyecto) {
		console.error('Uso: node scripts/instalar.js <proyecto> [--hosts claude,opencode,gemini,agents,prompts]');
		process.exitCode = 2;
	} else {
		try {
			for (const linea of instalar(path.resolve(proyecto), hosts)) {
				console.log(`- ${linea}`);
			}
		} catch (err) {
			console.error(err.message);
			process.exitCode = 1;
		}
	}
}

module.exports = { instalar, escribirBloque, INICIO, FIN };
