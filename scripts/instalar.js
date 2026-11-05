#!/usr/bin/env node
// Instala los agentes, hooks, scripts, workflows y skills de este repo en un proyecto de Claude Code.
// Es el equivalente multiplataforma de scripts/install.ps1: corre en Linux, macOS y Windows con Node.
//
// Uso (desde la raíz del repo):
//   node scripts/instalar.js --proyecto /ruta/al/proyecto
//
// Copia a <proyecto>/.claude/ lo mismo que install.ps1 y pisa las copias existentes. Sale con 0 si
// todo se copió, 1 si el proyecto no existe o falla una copia, y 2 si el uso es incorrecto.

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

/** Qué se copia y adónde, relativo a la raíz del repo y a .claude/ del proyecto. */
const DESTINOS = [
	{ origen: 'agents', destino: 'agents', filtro: archivo => archivo.endsWith('.md') },
	{ origen: 'hooks', destino: 'hooks', filtro: archivo => archivo.endsWith('.js') },
	{ origen: 'workflows', destino: 'workflows', filtro: archivo => archivo.endsWith('.js') },
	{ origen: 'scripts', destino: 'scripts', archivos: ['verificar-displaynames.js'] },
	{ origen: 'skills', destino: 'skills', todo: true },
];

/**
 * Copia las piezas del repo al proyecto. Devuelve la lista de rutas escritas, relativas al proyecto.
 * Lanza un error si el proyecto no existe.
 */
function instalar(proyecto, fuente = raiz) {
	if (!fs.existsSync(proyecto) || !fs.statSync(proyecto).isDirectory()) {
		throw new Error(`no existe el proyecto: ${proyecto}`);
	}
	const claude = path.join(proyecto, '.claude');
	const escritas = [];
	for (const { origen, destino, filtro, archivos, todo } of DESTINOS) {
		const carpetaOrigen = path.join(fuente, origen);
		const carpetaDestino = path.join(claude, destino);
		fs.mkdirSync(carpetaDestino, { recursive: true });
		const entradas = fs.readdirSync(carpetaOrigen, { withFileTypes: true });
		for (const e of entradas) {
			const incluir = todo || (archivos ? archivos.includes(e.name) : filtro(e.name));
			if (!incluir) {
				continue;
			}
			const origenRuta = path.join(carpetaOrigen, e.name);
			const destinoRuta = path.join(carpetaDestino, e.name);
			fs.cpSync(origenRuta, destinoRuta, { recursive: true, force: true });
			escritas.push(path.relative(proyecto, destinoRuta));
		}
	}
	return escritas;
}

function main(argv) {
	const i = argv.indexOf('--proyecto');
	const proyecto = i >= 0 ? argv[i + 1] : undefined;
	if (!proyecto) {
		console.error('uso: node scripts/instalar.js --proyecto <ruta-del-proyecto>');
		return 2;
	}
	try {
		const escritas = instalar(path.resolve(proyecto));
		console.log(`Instalado en ${path.join(path.resolve(proyecto), '.claude')}: ${escritas.length} piezas`);
		return 0;
	}
	catch (e) {
		console.error(`ERROR  ${e.message}`);
		return 1;
	}
}

module.exports = { instalar };

if (require.main === module) {
	process.exitCode = main(process.argv.slice(2));
}
