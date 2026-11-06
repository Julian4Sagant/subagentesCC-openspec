'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cargarRoles } = require('../lib/canon');
const { salidas } = require('../generar-adaptadores');
const { instalar, INICIO, FIN } = require('../instalar');

const RAIZ = path.resolve(__dirname, '..', '..');
const roles = cargarRoles(path.join(RAIZ, 'agents'));

test('cada rol genera un archivo por host y prompt plano', () => {
	const out = salidas(roles);
	for (const r of roles) {
		const n = r.meta.name;
		for (const k of [`claude/${n}.md`, `opencode/${n}.md`, `gemini/${n}.md`, `prompts/${n}.md`]) {
			assert.ok(out.has(k), `falta ${k}`);
		}
	}
	assert.ok(out.has('AGENTS.md'));
});

test('los agentes de solo lectura no reciben herramientas de escritura en ningún host', () => {
	const out = salidas(roles);
	const soloLectura = roles.filter(r => r.meta.acceso === 'lectura');
	assert.ok(soloLectura.length > 0);
	for (const r of soloLectura) {
		const n = r.meta.name;
		assert.doesNotMatch(out.get(`claude/${n}.md`), /Write|Edit/);
		assert.match(out.get(`opencode/${n}.md`), /write: false/);
		assert.doesNotMatch(out.get(`gemini/${n}.md`), /write_file|replace/);
	}
});

test('la descripción queda como YAML válido aunque tenga dos puntos', () => {
	const falso = [{ archivo: 'x.md', meta: { name: 'x', description: 'Uno: dos: tres y más texto largo', acceso: 'lectura' }, cuerpo: 'c\n' }];
	const primera = salidas(falso).get('claude/x.md').split('\n')[2];
	assert.strictEqual(primera, 'description: "Uno: dos: tres y más texto largo"');
});

test('instalar es idempotente y conserva el contenido propio de AGENTS.md', () => {
	const proyecto = fs.mkdtempSync(path.join(os.tmpdir(), 'proy-'));
	fs.writeFileSync(path.join(proyecto, 'AGENTS.md'), '# Mi proyecto\n\nReglas propias.\n');

	const primera = instalar(proyecto, ['agents', 'claude']);
	assert.strictEqual(primera.length, 2);
	const tras1 = fs.readFileSync(path.join(proyecto, 'AGENTS.md'), 'utf8');
	assert.match(tras1, /^# Mi proyecto/);
	assert.strictEqual(tras1.split(INICIO).length, 2);

	instalar(proyecto, ['agents']);
	const tras2 = fs.readFileSync(path.join(proyecto, 'AGENTS.md'), 'utf8');
	assert.strictEqual(tras2, tras1, 'la segunda instalación no cambia nada');
	assert.strictEqual(tras2.split(FIN).length, 2);
	assert.ok(fs.existsSync(path.join(proyecto, '.claude/agents/revisor.md')));
});
