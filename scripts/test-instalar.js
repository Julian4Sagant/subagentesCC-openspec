// Pruebas del instalador multiplataforma. Correr desde la raíz del repo: node --test scripts/test-instalar.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { instalar } = require('./instalar');

const raiz = path.resolve(__dirname, '..');
const script = path.join(__dirname, 'instalar.js');

function conTmp(fn) {
	return () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'instalar-'));
		try {
			fn(tmp);
		}
		finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	};
}

test('copia agentes, hooks, workflows, skills y el script de displayNames al .claude del proyecto', conTmp((tmp) => {
	const proyecto = path.join(tmp, 'proyecto');
	fs.mkdirSync(proyecto);
	const escritas = instalar(proyecto);
	assert.ok(escritas.length > 0);
	for (const archivo of fs.readdirSync(path.join(raiz, 'agents'))) {
		assert.equal(fs.readFileSync(path.join(proyecto, '.claude/agents', archivo), 'utf8'), fs.readFileSync(path.join(raiz, 'agents', archivo), 'utf8'), archivo);
	}
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/hooks/tester-sin-src-main.js')));
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/hooks/sin-escritura.js')));
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/workflows/apply-change.js')));
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/scripts/verificar-displaynames.js')));
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/skills/owasp-checklist/SKILL.md')));
}));

test('no copia los scripts del repo que no son del instalador', conTmp((tmp) => {
	const proyecto = path.join(tmp, 'proyecto');
	fs.mkdirSync(proyecto);
	instalar(proyecto);
	assert.equal(fs.existsSync(path.join(proyecto, '.claude/scripts/validar-agentes.js')), false);
	assert.equal(fs.existsSync(path.join(proyecto, '.claude/scripts/orquestar.js')), false);
}));

test('reinstalar pisa una copia desviada', conTmp((tmp) => {
	const proyecto = path.join(tmp, 'proyecto');
	fs.mkdirSync(proyecto);
	instalar(proyecto);
	const copia = path.join(proyecto, '.claude/agents/revisor.md');
	fs.appendFileSync(copia, 'editado a mano\n');
	instalar(proyecto);
	assert.equal(fs.readFileSync(copia, 'utf8'), fs.readFileSync(path.join(raiz, 'agents/revisor.md'), 'utf8'));
}));

test('proyecto inexistente: lanza un error y no crea nada', conTmp((tmp) => {
	const inexistente = path.join(tmp, 'no-existe');
	assert.throws(() => instalar(inexistente), /no existe el proyecto/);
	assert.equal(fs.existsSync(inexistente), false);
}));

test('CLI: sin --proyecto sale con 2; con un proyecto válido sale con 0', conTmp((tmp) => {
	assert.equal(spawnSync(process.execPath, [script]).status, 2);
	const proyecto = path.join(tmp, 'proyecto');
	fs.mkdirSync(proyecto);
	const r = spawnSync(process.execPath, [script, '--proyecto', proyecto], { encoding: 'utf8' });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /Instalado en/);
}));
