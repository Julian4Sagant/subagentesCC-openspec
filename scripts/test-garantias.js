// Pruebas de las garantías de los roles. Correr desde la raíz del repo: node --test scripts/test-garantias.js
// Usan repos git de verdad en un directorio temporal: lo que se prueba es lo que git y el disco muestran.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { snapshot, comparar, crearWorktreeCiego, verificarCiego, normalizarExclusiones } = require('./garantias');

const script = path.join(__dirname, 'garantias.js');
const ENTORNO = {
	...process.env,
	GIT_AUTHOR_NAME: 'prueba',
	GIT_AUTHOR_EMAIL: 'prueba@ejemplo.invalid',
	GIT_COMMITTER_NAME: 'prueba',
	GIT_COMMITTER_EMAIL: 'prueba@ejemplo.invalid',
};

function git(cwd, args) {
	const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENTORNO });
	assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
	return r.stdout;
}

/** Repo con src/main, src/test, openspec y un .gitignore que ignora target/. Devuelve su ruta. */
function repoDePrueba(tmp) {
	const repo = path.join(tmp, 'repo');
	fs.mkdirSync(path.join(repo, 'src/main/java'), { recursive: true });
	fs.mkdirSync(path.join(repo, 'src/test/java'), { recursive: true });
	fs.mkdirSync(path.join(repo, 'openspec/changes/x'), { recursive: true });
	git(repo, ['init', '-q', '-b', 'main', repo]);
	fs.writeFileSync(path.join(repo, 'src/main/java/A.java'), 'class A {}\n');
	fs.writeFileSync(path.join(repo, 'src/test/java/T.java'), 'class T {}\n');
	fs.writeFileSync(path.join(repo, 'openspec/changes/x/spec.md'), '# spec\n');
	fs.writeFileSync(path.join(repo, '.gitignore'), 'target/\n');
	git(repo, ['add', '-A']);
	git(repo, ['commit', '-q', '-m', 'inicial']);
	return repo;
}

function conTmp(fn) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'garantias-'));
	try {
		fn(tmp);
	}
	finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

test('solo-lectura: un rol que no toca nada no tiene cambios', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const antes = snapshot(repo);
	assert.deepEqual(comparar(antes, snapshot(repo)), []);
}));

test('solo-lectura: detecta una modificación de un archivo trackeado limpio', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const antes = snapshot(repo);
	fs.appendFileSync(path.join(repo, 'src/main/java/A.java'), '// rol\n');
	const problemas = comparar(antes, snapshot(repo));
	assert.ok(problemas.some(p => p.startsWith('src/main/java/A.java cambió')), problemas.join('\n'));
}));

test('solo-lectura: detecta un archivo nuevo', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const antes = snapshot(repo);
	fs.writeFileSync(path.join(repo, 'nota.txt'), 'escrita por el rol\n');
	const problemas = comparar(antes, snapshot(repo));
	assert.ok(problemas.some(p => p.startsWith('nota.txt cambió')), problemas.join('\n'));
}));

test('solo-lectura: detecta un commit hecho por el rol', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const antes = snapshot(repo);
	fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'x\n');
	git(repo, ['add', 'nuevo.txt']);
	git(repo, ['commit', '-q', '-m', 'commit del rol']);
	const problemas = comparar(antes, snapshot(repo));
	assert.ok(problemas.some(p => p.startsWith('HEAD cambió')), problemas.join('\n'));
}));

test('solo-lectura: detecta un cambio sobre código que ya estaba sin commitear', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	fs.writeFileSync(path.join(repo, 'src/main/java/A.java'), 'class A { int v; }\n');
	const antes = snapshot(repo);
	fs.writeFileSync(path.join(repo, 'src/main/java/A.java'), 'class A { int v = 2; }\n');
	const problemas = comparar(antes, snapshot(repo));
	assert.ok(problemas.some(p => p.startsWith('src/main/java/A.java cambió')), problemas.join('\n'));
}));

test('solo-lectura: detecta un git add que cambia el estado del índice', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	fs.writeFileSync(path.join(repo, 'src/main/java/A.java'), 'class A { int v; }\n');
	const antes = snapshot(repo);
	git(repo, ['add', 'src/main/java/A.java']);
	const problemas = comparar(antes, snapshot(repo));
	assert.ok(problemas.some(p => p.startsWith('src/main/java/A.java cambió')), problemas.join('\n'));
}));

test('solo-lectura: ignora lo ignorado por git (salidas de compilación)', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const antes = snapshot(repo);
	fs.mkdirSync(path.join(repo, 'target'));
	fs.writeFileSync(path.join(repo, 'target/salida.class'), 'bytes\n');
	assert.deepEqual(comparar(antes, snapshot(repo)), []);
}));

test('solo-lectura: el CLI sale con 1 cuando hay cambios y con 0 cuando no', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const foto = path.join(tmp, 'foto.json');
	const cli = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: ENTORNO });
	assert.equal(cli(['snapshot', repo, '--salida', foto]).status, 0);
	assert.equal(cli(['solo-lectura', repo, '--antes', foto]).status, 0);
	fs.writeFileSync(path.join(repo, 'nota.txt'), 'x\n');
	const r = cli(['solo-lectura', repo, '--antes', foto]);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /CAMBIO {2}nota\.txt/);
}));

test('ciego: el worktree no tiene src/main en disco y sí el resto', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const destino = path.join(tmp, 'ciego');
	crearWorktreeCiego(repo, destino);
	assert.equal(fs.existsSync(path.join(destino, 'src/main')), false);
	assert.equal(fs.existsSync(path.join(destino, 'src/test/java/T.java')), true);
	assert.equal(fs.existsSync(path.join(destino, 'openspec/changes/x/spec.md')), true);
	assert.equal(git(destino, ['status', '--porcelain']), '');
}));

test('ciego: verificar-ciego detecta src/main escrito a mano', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const destino = path.join(tmp, 'ciego');
	crearWorktreeCiego(repo, destino);
	assert.deepEqual(verificarCiego(destino), []);
	fs.mkdirSync(path.join(destino, 'src/main/java'), { recursive: true });
	fs.writeFileSync(path.join(destino, 'src/main/java/A.java'), 'class A {}\n');
	assert.deepEqual(verificarCiego(destino), ['src/main existe en disco en el worktree ciego']);
}));

test('ciego: verificar-ciego detecta un enlace que apunta al src/main del repo original', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const destino = path.join(tmp, 'ciego');
	crearWorktreeCiego(repo, destino);
	fs.symlinkSync(path.join(repo, 'src/main'), path.join(destino, 'src/test/java/fuga'));
	const problemas = verificarCiego(destino);
	assert.ok(problemas.some(p => p.includes('src/test/java/fuga es un enlace que apunta fuera')), problemas.join('\n'));
}));

test('ciego: un enlace que queda dentro del worktree no es problema', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const destino = path.join(tmp, 'ciego');
	crearWorktreeCiego(repo, destino);
	fs.symlinkSync('../../../openspec/changes/x/spec.md', path.join(destino, 'src/test/java/spec-link'));
	assert.deepEqual(verificarCiego(destino), []);
}));

test('ciego: no crea sobre un destino que ya existe', () => conTmp((tmp) => {
	const repo = repoDePrueba(tmp);
	const destino = path.join(tmp, 'ciego');
	fs.mkdirSync(destino);
	assert.throws(() => crearWorktreeCiego(repo, destino), /ya existe/);
}));

test('normalizarExclusiones rechaza rutas absolutas y con ..', () => {
	assert.deepEqual(normalizarExclusiones(['src/main/', './docs']), ['src/main', 'docs']);
	assert.throws(() => normalizarExclusiones(['/etc']), /no válida/);
	assert.throws(() => normalizarExclusiones(['../afuera']), /no válida/);
	assert.throws(() => normalizarExclusiones(['']), /no válida/);
});

test('el CLI sale con 2 cuando el uso es incorrecto', () => {
	const r = spawnSync(process.execPath, [script, 'snapshot'], { encoding: 'utf8' });
	assert.equal(r.status, 2);
});
