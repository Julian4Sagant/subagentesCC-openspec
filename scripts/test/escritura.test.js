'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { patronARegex, dentroDePermitidos, cambiosEntre } = require('../verificar-escritura');

const SCRIPT = path.join(__dirname, '..', 'verificar-escritura.js');

test('patrones: ** cruza carpetas, * no', () => {
	assert.ok(dentroDePermitidos('src/test/a/b.java', ['src/test/**']));
	assert.ok(dentroDePermitidos('src/test/b.java', ['src/test/**']));
	assert.ok(!dentroDePermitidos('src/main/b.java', ['src/test/**']));
	assert.ok(dentroDePermitidos('notas.md', ['*.md']));
	assert.ok(!dentroDePermitidos('docs/notas.md', ['*.md']));
	assert.ok(!dentroDePermitidos('a.md', []));
});

test('patrones: escapa caracteres especiales de la ruta', () => {
	assert.ok(patronARegex('a.b/c+d.txt').test('a.b/c+d.txt'));
	assert.ok(!patronARegex('a.b/c+d.txt').test('aXb/c+d.txt'));
});

test('cambiosEntre: detecta nuevos, modificados y borrados', () => {
	const antes = { 'a.txt': 'h1', 'b.txt': 'h2' };
	const despues = { 'a.txt': 'h1x', 'c.txt': 'h3' };
	assert.deepStrictEqual(cambiosEntre(antes, despues), ['a.txt', 'b.txt', 'c.txt']);
});

test('integración con git: un agente de solo lectura que escribe falla; uno con alcance pasa', () => {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
	const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
	git('init', '-q');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'test');
	fs.writeFileSync(path.join(repo, 'base.txt'), 'base');
	git('add', '.');
	git('commit', '-q', '-m', 'base');

	const antes = path.join(repo, '..', `antes-${path.basename(repo)}.json`);
	const guardar = spawnSync('node', [SCRIPT, 'guardar', '--repo', repo, '--salida', antes], { encoding: 'utf8' });
	assert.strictEqual(guardar.status, 0, guardar.stderr);

	// Un trabajo previo sin commitear no debe contar como cambio del agente.
	fs.writeFileSync(path.join(repo, 'previo.txt'), 'trabajo previo');
	const guardar2 = spawnSync('node', [SCRIPT, 'guardar', '--repo', repo, '--salida', antes], { encoding: 'utf8' });
	assert.strictEqual(guardar2.status, 0);

	// El agente de solo lectura toca un archivo.
	fs.writeFileSync(path.join(repo, 'intruso.txt'), 'x');
	const soloLectura = spawnSync('node', [SCRIPT, 'comparar', '--repo', repo, '--antes', antes], { encoding: 'utf8' });
	assert.strictEqual(soloLectura.status, 1);
	assert.match(soloLectura.stderr, /intruso\.txt/);
	assert.doesNotMatch(soloLectura.stderr, /previo\.txt/);

	// Mismo cambio con un alcance que lo cubre.
	const conAlcance = spawnSync('node', [SCRIPT, 'comparar', '--repo', repo, '--antes', antes, '--permitido', 'intruso.txt'], { encoding: 'utf8' });
	assert.strictEqual(conAlcance.status, 0, conAlcance.stderr);
});
