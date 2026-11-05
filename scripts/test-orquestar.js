// Pruebas del orquestador. Correr desde la raíz del repo: node --test scripts/test-orquestar.js
// Las de extremo a extremo corren el driver con una CLI falsa (scripts/fixtures/cli-falso.js) sobre repos
// git de verdad en un directorio temporal. No llaman a ningún modelo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { orquestar, construirArgv, interpretar, cargarCli } = require('./orquestar');

const FALSA = path.join(__dirname, 'fixtures', 'cli-falso.js');
const ENTORNO = {
	...process.env,
	GIT_AUTHOR_NAME: 'prueba',
	GIT_AUTHOR_EMAIL: 'prueba@ejemplo.invalid',
	GIT_COMMITTER_NAME: 'prueba',
	GIT_COMMITTER_EMAIL: 'prueba@ejemplo.invalid',
};
const SKILLS_OPENSPEC = ['openspec-apply-change', 'openspec-verify-change'];

function git(cwd, args) {
	const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENTORNO });
	assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
	return r.stdout;
}

/** Repo integrado con src/main, src/test, openspec y las skills que piden los roles. */
function repoIntegrado(tmp) {
	const repo = path.join(tmp, 'integrado');
	fs.mkdirSync(path.join(repo, 'src/main'), { recursive: true });
	fs.mkdirSync(path.join(repo, 'src/test'), { recursive: true });
	fs.mkdirSync(path.join(repo, 'openspec/changes/x'), { recursive: true });
	git(tmp, ['init', '-q', '-b', 'main', repo]);
	fs.writeFileSync(path.join(repo, 'src/main/Base.txt'), 'base\n');
	fs.writeFileSync(path.join(repo, 'src/test/Base.txt'), 'base\n');
	fs.writeFileSync(path.join(repo, 'openspec/changes/x/spec.md'), '# spec\n');
	fs.writeFileSync(path.join(repo, '.gitignore'), 'target/\n');
	for (const s of SKILLS_OPENSPEC) {
		fs.mkdirSync(path.join(repo, '.claude/skills', s), { recursive: true });
		fs.writeFileSync(path.join(repo, '.claude/skills', s, 'SKILL.md'), `---\nname: ${s}\n---\nSkill de prueba.\n`);
	}
	git(repo, ['add', '-A']);
	git(repo, ['commit', '-q', '-m', 'inicial']);
	return repo;
}

/** Worktree de un área, como el que crea el usuario antes del apply. */
function areaDe(tmp, repo, nombre) {
	const wt = path.join(tmp, `area-${nombre}`);
	git(repo, ['worktree', 'add', '-q', '--detach', wt, 'HEAD']);
	return wt;
}

/** Config de CLI que apunta a la falsa. Devuelve la ruta del archivo. */
function configFalsa(tmp) {
	const archivo = path.join(tmp, 'cli.json');
	fs.writeFileSync(archivo, JSON.stringify({
		falsa: {
			comando: 'node',
			argv: [FALSA, '{prompt}', '{sistema}', '{herramientas}'],
			modelos: { fuerte: 'f', medio: 'm', rapido: 'r' },
			herramientas: { leer: ['Read', 'Grep', 'Glob'], ejecutar: ['Bash'], escribir: ['Write', 'Edit'] },
		},
	}));
	return archivo;
}

/** Corre el orquestador con la CLI falsa y las variables de entorno dadas. Restaura el entorno al final. */
async function correr(tmp, { modo = '', seguridad = false, skills = [], maxVueltas, comandoTests = 'node -e "process.exit(0)"', integrado, areas } = {}) {
	const salida = path.join(tmp, 'salida');
	const contadores = path.join(tmp, 'contadores');
	fs.mkdirSync(contadores, { recursive: true });
	const previo = { FAKE_DIR: process.env.FAKE_DIR, FAKE_MODO: process.env.FAKE_MODO };
	process.env.FAKE_DIR = contadores;
	process.env.FAKE_MODO = modo;
	try {
		return await orquestar({
			change: 'x',
			integrado: integrado ?? path.join(tmp, 'integrado'),
			areas: areas ?? [{ nombre: 'solicitudes', tareas: '1.1', worktree: path.join(tmp, 'area-solicitudes') }],
			salida,
			cli: 'falsa',
			config: configFalsa(tmp),
			comandoTests,
			seguridad,
			skills,
			maxVueltas,
		});
	}
	finally {
		for (const [k, v] of Object.entries(previo)) {
			if (v === undefined) {
				delete process.env[k];
			}
			else {
				process.env[k] = v;
			}
		}
	}
}

function conTmp(fn) {
	return async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orquestar-'));
		try {
			await fn(tmp);
		}
		finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	};
}

test('construirArgv reemplaza valores y quita el flag cuyo valor está vacío', () => {
	const argv = construirArgv(['-p', '{prompt}', '--model', '{modelo}', '--tools', '{herramientas}'], {
		prompt: 'hola', modelo: undefined, herramientas: 'Read,Bash',
	});
	assert.deepEqual(argv, ['-p', 'hola', '--tools', 'Read,Bash']);
});

test('interpretar lee veredicto, puntos y conteos', () => {
	const revisor = 'VEREDICTO: CAMBIOS REQUERIDOS\n1. [código] a.java:1 — x\n2. [artefactos] b.md — y\n';
	const seguridad = 'VEREDICTO: CON HALLAZGOS\nCRITICAL: 0  WARNING: 2\n';
	const r = interpretar(revisor, seguridad, true);
	assert.equal(r.veredicto, 'CAMBIOS REQUERIDOS');
	assert.equal(r.puntos.length, 2);
	assert.equal(r.seguridadOk, false);
	assert.equal(interpretar('VEREDICTO: APROBADO', null, false).seguridadOk, true);
});

test('cargarCli falla con un nombre de CLI que no está en la config', conTmp((tmp) => {
	assert.throws(() => cargarCli(configFalsa(tmp), 'inexistente'), /no hay configuración/);
}));

test('apply feliz: el tester y el área escriben, el join aplica, la revisión aprueba en la segunda vuelta', conTmp(async (tmp) => {
	const integrado = repoIntegrado(tmp);
	areaDe(tmp, integrado, 'solicitudes');
	const r = await correr(tmp);

	assert.equal(r.estado, 'APROBADO', JSON.stringify(r));
	assert.equal(r.vuelta, 2);
	assert.equal(r.historial.length, 2);

	// Cambios del área y de la corrección de código, sin commitear, en el repo integrado.
	assert.equal(fs.readFileSync(path.join(integrado, 'src/main/Impl.txt'), 'utf8'), 'impl 1\nimpl 2\n');
	// Tests del tester (vuelta 1 y corrección), también sin commitear.
	assert.equal(fs.readFileSync(path.join(integrado, 'src/test/Test.txt'), 'utf8'), 'tester 1\ntester 2\n');
	// El worktree ciego nunca tuvo src/main en disco.
	assert.equal(fs.existsSync(path.join(tmp, 'salida/ciego/src/main')), false);
	// El revisor recibió herramientas de solo lectura: ninguna de escritura.
	const herramientas = fs.readFileSync(path.join(tmp, 'contadores/herramientas-revisor.txt'), 'utf8');
	assert.doesNotMatch(herramientas, /Write|Edit/);
	assert.ok(fs.existsSync(path.join(tmp, 'salida/resultado.json')));
	assert.ok(fs.existsSync(path.join(tmp, 'salida/logs')));
}));

test('solo lectura: un revisor que escribe en el repo hace fallar la corrida', conTmp(async (tmp) => {
	repoIntegrado(tmp);
	areaDe(tmp, path.join(tmp, 'integrado'), 'solicitudes');
	const r = await correr(tmp, { modo: 'revisor-escribe' });
	assert.equal(r.estado, 'BLOQUEADO');
	assert.match(r.motivo, /revisor:1 modificó el repo/);
}));

test('commits: un implementador que commitea hace fallar la corrida', conTmp(async (tmp) => {
	repoIntegrado(tmp);
	areaDe(tmp, path.join(tmp, 'integrado'), 'solicitudes');
	const r = await correr(tmp, { modo: 'implementador-commit' });
	assert.equal(r.estado, 'BLOQUEADO');
	assert.match(r.motivo, /hizo commit/);
}));

test('ciego: un tester que escribe fuera de src/test hace fallar la corrida y no llega al repo integrado', conTmp(async (tmp) => {
	const integrado = repoIntegrado(tmp);
	areaDe(tmp, integrado, 'solicitudes');
	const r = await correr(tmp, { modo: 'tester-fuera' });
	assert.equal(r.estado, 'BLOQUEADO');
	assert.match(r.motivo, /fuera de src\/test: src\/main\/Fuera\.txt/);
	assert.equal(fs.existsSync(path.join(integrado, 'src/main/Fuera.txt')), false);
}));

test('CLI que sale con error: BLOQUEADO con el código', conTmp(async (tmp) => {
	repoIntegrado(tmp);
	areaDe(tmp, path.join(tmp, 'integrado'), 'solicitudes');
	const r = await correr(tmp, { modo: 'falla-revisor' });
	assert.equal(r.estado, 'BLOQUEADO');
	assert.match(r.motivo, /revisor:1: la CLI salió con código 3/);
}));

test('seguridad: el auditor sin CRITICAL ni WARNING no bloquea la aprobación', conTmp(async (tmp) => {
	repoIntegrado(tmp);
	areaDe(tmp, path.join(tmp, 'integrado'), 'solicitudes');
	const r = await correr(tmp, { seguridad: true });
	assert.equal(r.estado, 'APROBADO');
	assert.equal(r.historial[1].seguridad, 'CRITICAL 0 WARNING 0');
}));

test('skill faltante: BLOQUEADO antes de crear ningún worktree', conTmp(async (tmp) => {
	const integrado = repoIntegrado(tmp);
	areaDe(tmp, integrado, 'solicitudes');
	fs.rmSync(path.join(integrado, '.claude/skills/openspec-apply-change'), { recursive: true });
	const r = await correr(tmp);
	assert.equal(r.estado, 'BLOQUEADO');
	assert.match(r.motivo, /no encuentro la skill openspec-apply-change/);
	assert.equal(fs.existsSync(path.join(tmp, 'salida/ciego')), false);
}));

test('salida dentro de un worktree: BLOQUEADO antes de tocar nada', conTmp(async (tmp) => {
	const integrado = repoIntegrado(tmp);
	const area = areaDe(tmp, integrado, 'solicitudes');
	const control = await correr(tmp, { integrado, areas: [{ nombre: 'solicitudes', tareas: '1.1', worktree: area }] });
	assert.equal(control.estado, 'APROBADO', 'control: con la salida fuera de los repos la corrida es válida');
	const dentro = await orquestar({
		change: 'x', integrado, salida: path.join(area, 'salida'), cli: 'falsa', config: configFalsa(tmp),
		areas: [{ nombre: 'solicitudes', tareas: '1.1', worktree: area }],
	});
	assert.equal(dentro.estado, 'BLOQUEADO');
	assert.match(dentro.motivo, /está dentro de/);
	assert.equal(fs.existsSync(path.join(area, 'salida')), false);
}));

test('repo que no es git: BLOQUEADO con el motivo, sin lanzar', conTmp(async (tmp) => {
	const sinGit = path.join(tmp, 'sin-git');
	fs.mkdirSync(sinGit);
	areaDe(tmp, repoIntegrado(tmp), 'solicitudes');
	const r = await correr(tmp, { integrado: sinGit });
	assert.equal(r.estado, 'BLOQUEADO');
}));
