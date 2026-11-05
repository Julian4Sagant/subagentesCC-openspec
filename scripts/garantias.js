#!/usr/bin/env node
// Garantías de los roles que no dependen de los hooks de una herramienta. Un hook filtra el texto de
// un comando; estas comprobaciones miran lo que cambió de verdad en el repo y en el disco, así que
// sirven igual con cualquier CLI.
//
//   snapshot    → foto del estado del repo (HEAD, rama, stash y hash de cada archivo tocado)
//   solo-lectura → compara dos fotos y sale con 1 si un rol de solo lectura cambió algo
//   ciego       → crea un worktree sin las rutas excluidas (por defecto src/main) para el tester
//   verificar-ciego → sale con 1 si una ruta excluida apareció en disco en ese worktree
//
// Uso (desde la raíz del repo):
//   node scripts/garantias.js snapshot <repo> --salida <foto.json>
//   node scripts/garantias.js solo-lectura <repo> --antes <foto.json>
//   node scripts/garantias.js ciego <repo> <destino> [--excluir src/main] [--ref HEAD]
//   node scripts/garantias.js verificar-ciego <destino> [--excluir src/main]
// Salidas: 0 todo bien, 1 hay problemas (se listan), 2 uso incorrecto.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const EXCLUIR_POR_DEFECTO = ['src/main'];

function git(repo, args) {
	const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
	if (r.status !== 0) {
		throw new Error(`git ${args.join(' ')} falló en ${repo}: ${(r.stderr || '').trim()}`);
	}
	return r.stdout;
}

/** Hash del contenido de un archivo en disco, o 'ausente'. Los enlaces simbólicos se hashean por destino. */
function huella(repo, rel) {
	const abs = path.join(repo, rel);
	let st;
	try {
		st = fs.lstatSync(abs);
	}
	catch {
		return 'ausente';
	}
	const h = crypto.createHash('sha256');
	if (st.isSymbolicLink()) {
		h.update(`link:${fs.readlinkSync(abs)}`);
	}
	else if (st.isFile()) {
		h.update(fs.readFileSync(abs));
	}
	else {
		h.update(`tipo:${st.isDirectory() ? 'dir' : 'otro'}`);
	}
	return h.digest('hex');
}

/**
 * Foto del estado del repo. Incluye lo que ya estaba sucio antes de empezar, para que una
 * corrección sobre código sin commitear también se pueda verificar.
 */
function snapshot(repo) {
	const head = git(repo, ['rev-parse', 'HEAD']).trim();
	const rama = git(repo, ['symbolic-ref', '--short', '-q', 'HEAD']).trim() || '(separada)';
	const stash = git(repo, ['stash', 'list']).split('\n').filter(Boolean).length;
	// -z separa por NUL (nombres raros); -uall lista archivos sin nuevos directorios; lo ignorado no entra.
	const lineas = git(repo, ['status', '--porcelain=v1', '-z', '-uall']).split('\0').filter(Boolean);
	const archivos = {};
	for (let i = 0; i < lineas.length; i++) {
		const xy = lineas[i].slice(0, 2);
		const ruta = lineas[i].slice(3);
		archivos[ruta] = `${xy}:${huella(repo, ruta)}`;
		// En renombres y copias, git pone el origen en la entrada siguiente.
		if (/[RC]/.test(xy)) {
			const origen = lineas[++i];
			archivos[origen] = `${xy}:${huella(repo, origen)}`;
		}
	}
	return { head, rama, stash, archivos };
}

/** Compara dos fotos. Devuelve la lista de cambios. Vacía si el rol no cambió nada. */
function comparar(antes, despues) {
	const problemas = [];
	if (antes.head !== despues.head) {
		problemas.push(`HEAD cambió (${antes.head.slice(0, 7)} → ${despues.head.slice(0, 7)}): el rol hizo un commit`);
	}
	if (antes.rama !== despues.rama) {
		problemas.push(`la rama cambió (${antes.rama} → ${despues.rama})`);
	}
	if (antes.stash !== despues.stash) {
		problemas.push(`el stash cambió (${antes.stash} → ${despues.stash})`);
	}
	const rutas = new Set([...Object.keys(antes.archivos), ...Object.keys(despues.archivos)]);
	for (const ruta of [...rutas].sort()) {
		if (antes.archivos[ruta] !== despues.archivos[ruta]) {
			problemas.push(`${ruta} cambió durante la corrida`);
		}
	}
	return problemas;
}

/** Normaliza una lista de rutas excluidas: relativas, sin barra final ni `..`. */
function normalizarExclusiones(excluir) {
	return excluir.map((p) => {
		const limpia = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
		if (limpia === '' || limpia.startsWith('/') || limpia.split('/').includes('..')) {
			throw new Error(`ruta a excluir no válida: "${p}"`);
		}
		return limpia;
	});
}

/**
 * Crea un worktree de `ref` sin las rutas excluidas. Git no las escribe en disco, así que el tester
 * no tiene cómo leerlas aunque su herramienta no tenga hooks.
 */
function crearWorktreeCiego(repo, destino, { excluir = EXCLUIR_POR_DEFECTO, ref = 'HEAD' } = {}) {
	if (fs.existsSync(destino)) {
		throw new Error(`el destino ya existe: ${destino}`);
	}
	const exclusiones = normalizarExclusiones(excluir);
	git(repo, ['worktree', 'add', '--no-checkout', '--detach', destino, ref]);
	git(destino, ['sparse-checkout', 'init', '--no-cone']);
	git(destino, ['sparse-checkout', 'set', '--no-cone', '/*', ...exclusiones.map(p => `!/${p}/`)]);
	git(destino, ['checkout', '-q', 'HEAD']);
	const problemas = verificarCiego(destino, exclusiones);
	if (problemas.length > 0) {
		throw new Error(`el worktree ciego quedó mal armado: ${problemas.join('; ')}`);
	}
	return destino;
}

/** Enlaces simbólicos del worktree (sin .git) que apuntan fuera de él. */
function enlacesQueSalen(destino) {
	const raiz = path.resolve(destino);
	const salen = [];
	const recorrer = (carpeta) => {
		for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
			if (entrada.name === '.git') {
				continue;
			}
			const abs = path.join(carpeta, entrada.name);
			if (entrada.isSymbolicLink()) {
				const destinoLink = path.resolve(path.dirname(abs), fs.readlinkSync(abs));
				const relativo = path.relative(raiz, destinoLink);
				if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
					salen.push(path.relative(raiz, abs));
				}
			}
			else if (entrada.isDirectory()) {
				recorrer(abs);
			}
		}
	};
	recorrer(raiz);
	return salen;
}

/**
 * Problemas del worktree ciego: rutas excluidas que existen en disco y enlaces simbólicos que
 * apuntan fuera del worktree (un enlace a /repo/src/main leería el código excluido). Vacía si está limpio.
 */
function verificarCiego(destino, excluir = EXCLUIR_POR_DEFECTO) {
	const problemas = [];
	for (const p of normalizarExclusiones(excluir)) {
		if (fs.existsSync(path.join(destino, p))) {
			problemas.push(`${p} existe en disco en el worktree ciego`);
		}
	}
	for (const enlace of enlacesQueSalen(destino)) {
		problemas.push(`${enlace} es un enlace que apunta fuera del worktree ciego`);
	}
	return problemas;
}

/** Lee `--nombre valor` de la lista de argumentos. Devuelve el valor o `defecto`. */
function opcion(argv, nombre, defecto) {
	const i = argv.indexOf(nombre);
	return i >= 0 ? argv[i + 1] : defecto;
}

/** Lee todos los valores de una opción repetible, por ejemplo `--excluir a --excluir b`. */
function opciones(argv, nombre) {
	const valores = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === nombre && argv[i + 1] !== undefined) {
			valores.push(argv[i + 1]);
		}
	}
	return valores;
}

const OPCIONES_CON_VALOR = ['--salida', '--antes', '--excluir', '--ref'];

/** Argumentos sin opciones: quita cada opción con su valor. */
function posicionales(args) {
	const out = [];
	for (let i = 0; i < args.length; i++) {
		if (OPCIONES_CON_VALOR.includes(args[i])) {
			i++;
		}
		else if (!args[i].startsWith('--')) {
			out.push(args[i]);
		}
	}
	return out;
}

function main(argv) {
	const [orden, ...resto] = argv;
	const args = posicionales(resto);
	try {
		switch (orden) {
			case 'snapshot': {
				const salida = opcion(argv, '--salida');
				if (!args[0] || !salida) {
					console.error('uso: snapshot <repo> --salida <foto.json>');
					return 2;
				}
				fs.writeFileSync(salida, JSON.stringify(snapshot(args[0]), null, 2));
				console.log(`foto guardada en ${salida}`);
				return 0;
			}
			case 'solo-lectura': {
				const antes = opcion(argv, '--antes');
				if (!args[0] || !antes) {
					console.error('uso: solo-lectura <repo> --antes <foto.json>');
					return 2;
				}
				const problemas = comparar(JSON.parse(fs.readFileSync(antes, 'utf8')), snapshot(args[0]));
				if (problemas.length > 0) {
					for (const p of problemas) {
						console.log(`CAMBIO  ${p}`);
					}
					return 1;
				}
				console.log('OK: el rol de solo lectura no cambió nada');
				return 0;
			}
			case 'ciego': {
				if (!args[0] || !args[1]) {
					console.error('uso: ciego <repo> <destino> [--excluir ruta] [--ref ref]');
					return 2;
				}
				const excluir = opciones(argv, '--excluir');
				crearWorktreeCiego(args[0], args[1], {
					excluir: excluir.length > 0 ? excluir : EXCLUIR_POR_DEFECTO,
					ref: opcion(argv, '--ref', 'HEAD'),
				});
				console.log(`worktree ciego creado en ${args[1]}`);
				return 0;
			}
			case 'verificar-ciego': {
				if (!args[0]) {
					console.error('uso: verificar-ciego <destino> [--excluir ruta]');
					return 2;
				}
				const excluir = opciones(argv, '--excluir');
				const problemas = verificarCiego(args[0], excluir.length > 0 ? excluir : EXCLUIR_POR_DEFECTO);
				if (problemas.length > 0) {
					for (const p of problemas) {
						console.log(`CAMBIO  ${p}`);
					}
					return 1;
				}
				console.log('OK: el worktree ciego no tiene rutas excluidas en disco');
				return 0;
			}
			default:
				console.error('uso: node scripts/garantias.js <snapshot|solo-lectura|ciego|verificar-ciego> ...');
				return 2;
		}
	}
	catch (e) {
		console.error(`ERROR  ${e.message}`);
		return 1;
	}
}

module.exports = { snapshot, comparar, crearWorktreeCiego, verificarCiego, normalizarExclusiones };

if (require.main === module) {
	process.exitCode = main(process.argv.slice(2));
}
