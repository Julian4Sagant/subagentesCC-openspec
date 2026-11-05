#!/usr/bin/env node
// Revisa que los enlaces relativos de README.md y docs/ apunten a archivos que existen.
// No revisa enlaces http(s) ni anclas dentro de un archivo. Uso (desde la raíz del repo): node scripts/verificar-enlaces.js
// Sale con 0 si todos los enlaces existen y con 1 si alguno está roto.

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

/** Todos los .md de docs/ (recursivo) más el README de la raíz. */
function documentos(carpeta) {
	return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
		const ruta = path.join(carpeta, e.name);
		if (e.isDirectory()) {
			return documentos(ruta);
		}
		return e.name.endsWith('.md') ? [ruta] : [];
	});
}

/** Enlaces `[texto](destino)` que no son externos ni anclas puras, sin el ancla del destino. */
function enlacesRelativos(texto) {
	const sinCodigo = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
	const enlaces = [];
	for (const m of sinCodigo.matchAll(/\]\(([^)\s]+)\)/g)) {
		const destino = m[1];
		if (/^(https?:|mailto:|#)/.test(destino)) {
			continue;
		}
		enlaces.push(destino.split('#')[0]);
	}
	return enlaces;
}

function verificar() {
	const problemas = [];
	const archivos = [path.join(raiz, 'README.md'), ...documentos(path.join(raiz, 'docs'))];
	for (const archivo of archivos) {
		const rel = path.relative(raiz, archivo);
		const texto = fs.readFileSync(archivo, 'utf8');
		for (const destino of enlacesRelativos(texto)) {
			const objetivo = path.resolve(path.dirname(archivo), decodeURI(destino));
			if (!fs.existsSync(objetivo)) {
				problemas.push(`${rel}: el enlace "${destino}" no existe`);
			}
		}
	}
	return problemas;
}

if (require.main === module) {
	const problemas = verificar();
	if (problemas.length > 0) {
		for (const p of problemas) {
			console.log(`ROTO  ${p}`);
		}
		process.exitCode = 1;
	}
	else {
		console.log('OK: todos los enlaces relativos de README.md y docs/ existen');
	}
}

module.exports = { enlacesRelativos };
