'use strict';
// Lectura de los roles canónicos de agents/. Sin dependencias.

const fs = require('fs');
const path = require('path');

const ACCESOS = ['lectura', 'escritura'];
const CAMPOS = ['name', 'description', 'acceso', 'alcance'];

/** Separa el frontmatter (entre dos líneas `---`) del cuerpo. Devuelve null si no hay frontmatter. */
function parsear(texto) {
	const t = texto.replace(/\r\n/g, '\n');
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t);
	if (!m) {
		return null;
	}
	const meta = {};
	for (const linea of m[1].split('\n')) {
		const k = /^([a-z_]+):\s*(.*)$/.exec(linea);
		if (k) {
			meta[k[1]] = k[2].trim();
		}
	}
	return { meta, cuerpo: m[2].replace(/^\n+/, '').replace(/\s*$/, '\n') };
}

/** Carga todos los roles de una carpeta, ordenados por nombre de archivo. */
function cargarRoles(dir) {
	return fs.readdirSync(dir)
		.filter(f => f.endsWith('.md'))
		.sort()
		.map(archivo => {
			const texto = fs.readFileSync(path.join(dir, archivo), 'utf8');
			return { archivo, ...(parsear(texto) || { meta: null, cuerpo: '' }) };
		});
}

module.exports = { parsear, cargarRoles, ACCESOS, CAMPOS };
