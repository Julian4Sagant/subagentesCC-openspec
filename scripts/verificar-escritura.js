#!/usr/bin/env node
'use strict';
// Comprueba, con git y sin depender del host, que un agente tocó solo lo que tenía permitido.
// Funciona en cualquier host: el orquestador toma una instantánea antes de lanzar el agente y la
// compara después. Un rol de solo lectura no tiene patrones permitidos.
//
//   node scripts/verificar-escritura.js guardar  --repo <ruta> --salida <antes.json>
//   node scripts/verificar-escritura.js comparar --repo <ruta> --antes <antes.json> [--permitido "a/**,b.md"]
//
// comparar sale con 0 si todo cambio cae dentro de --permitido y con 1 si no.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** Convierte un patrón con * (un segmento), ** (cualquier profundidad) y ? en una expresión regular. */
function patronARegex(patron) {
	let re = '';
	for (let i = 0; i < patron.length; i++) {
		const c = patron[i];
		if (c === '*' && patron[i + 1] === '*') {
			re += '.*';
			i++;
			if (patron[i + 1] === '/') {
				i++;
			}
		} else if (c === '*') {
			re += '[^/]*';
		} else if (c === '?') {
			re += '[^/]';
		} else {
			re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${re}$`);
}

function dentroDePermitidos(ruta, permitidos) {
	return permitidos.some(p => patronARegex(p).test(ruta));
}

/** Lee `git status` en formato -z y devuelve las rutas tocadas (incluye el origen de los renombres). */
function rutasSucias(repo) {
	const salida = execFileSync('git', ['-C', repo, 'status', '--porcelain=v1', '-z', '-uall'], { encoding: 'utf8' });
	const campos = salida.split('\0').filter(Boolean);
	const rutas = [];
	for (let i = 0; i < campos.length; i++) {
		const estado = campos[i].slice(0, 2);
		rutas.push(campos[i].slice(3));
		if (estado[0] === 'R' || estado[0] === 'C') {
			rutas.push(campos[++i]);
		}
	}
	return [...new Set(rutas)].sort();
}

/** Huella de cada ruta sucia: hash de su contenido, o "ausente" si fue borrada. */
function instantanea(repo) {
	const mapa = {};
	for (const ruta of rutasSucias(repo)) {
		const completa = path.join(repo, ruta);
		if (fs.existsSync(completa) && fs.statSync(completa).isFile()) {
			mapa[ruta] = crypto.createHash('sha256').update(fs.readFileSync(completa)).digest('hex');
		} else {
			mapa[ruta] = 'ausente';
		}
	}
	return mapa;
}

/** Rutas que cambiaron entre dos instantáneas: nuevas, modificadas o borradas. */
function cambiosEntre(antes, despues) {
	const todas = new Set([...Object.keys(antes), ...Object.keys(despues)]);
	return [...todas].filter(r => antes[r] !== despues[r]).sort();
}

function leerArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			args[argv[i].slice(2)] = argv[i + 1];
			i++;
		} else {
			args._.push(argv[i]);
		}
	}
	return args;
}

function main(argv) {
	const args = leerArgs(argv);
	const orden = args._[0];
	const repo = path.resolve(args.repo || '.');

	if (orden === 'guardar') {
		fs.writeFileSync(args.salida, JSON.stringify(instantanea(repo), null, 2));
		console.log(`Instantánea guardada en ${args.salida}`);
		return 0;
	}
	if (orden === 'comparar') {
		const antes = JSON.parse(fs.readFileSync(args.antes, 'utf8'));
		const permitidos = args.permitido ? args.permitido.split(',').map(p => p.trim()).filter(Boolean) : [];
		const fuera = cambiosEntre(antes, instantanea(repo)).filter(r => !dentroDePermitidos(r, permitidos));
		if (fuera.length) {
			console.error('Cambios fuera de lo permitido:');
			for (const r of fuera) {
				console.error(`- ${r}`);
			}
			return 1;
		}
		console.log(permitidos.length ? `OK: cambios dentro de ${permitidos.join(', ')}` : 'OK: sin cambios (rol de solo lectura)');
		return 0;
	}
	console.error('Uso: verificar-escritura.js guardar|comparar --repo <ruta> [--salida|--antes|--permitido]');
	return 2;
}

if (require.main === module) {
	process.exitCode = main(process.argv.slice(2));
}

module.exports = { patronARegex, dentroDePermitidos, cambiosEntre, rutasSucias, instantanea };
