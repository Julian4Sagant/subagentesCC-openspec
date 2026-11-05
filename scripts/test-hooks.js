// Pruebas de los hooks de los agentes. Correr desde la raíz del repo: node --test scripts/test-hooks.js
// Cada caso ejecuta el hook como lo hace Claude Code: entrada JSON por stdin, decisión JSON por stdout.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const hooks = path.join(__dirname, '..', 'hooks');
const raizProyecto = path.resolve(__dirname, '..');

/** Ejecuta un hook con una entrada y devuelve la decisión ('deny' o null). */
function decidir(hook, argumentos, entrada) {
	const r = spawnSync(process.execPath, [path.join(hooks, hook), ...argumentos], {
		input: JSON.stringify({ cwd: raizProyecto, ...entrada }),
		encoding: 'utf8',
	});
	assert.equal(r.status, 0, `el hook salió con código ${r.status}: ${r.stderr}`);
	if (!r.stdout.trim()) {
		return null;
	}
	return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('tester: bloquea leer src/main', () => {
	const entrada = { tool_name: 'Read', tool_input: { file_path: 'src/main/App.java' } };
	assert.equal(decidir('tester-sin-src-main.js', ['--siempre'], entrada), 'deny');
});

test('tester: deja leer src/test', () => {
	const entrada = { tool_name: 'Read', tool_input: { file_path: 'src/test/AppTest.java' } };
	assert.equal(decidir('tester-sin-src-main.js', ['--siempre'], entrada), null);
});

test('tester: bloquea Grep sin path', () => {
	const entrada = { tool_name: 'Grep', tool_input: { pattern: 'class' } };
	assert.equal(decidir('tester-sin-src-main.js', ['--siempre'], entrada), 'deny');
});

test('sin-escritura: bloquea git que cambia el repo', () => {
	assert.equal(decidir('sin-escritura.js', [], bash('git commit -m x')), 'deny');
	assert.equal(decidir('sin-escritura.js', [], bash('git push origin main')), 'deny');
	assert.equal(decidir('sin-escritura.js', [], bash('git reset --hard')), 'deny');
	assert.equal(decidir('sin-escritura.js', [], bash('git sparse-checkout disable')), 'deny');
	assert.equal(decidir('sin-escritura.js', [], bash('git worktree add ../x')), 'deny');
});

test('sin-escritura: deja git de solo lectura y comandos normales', () => {
	assert.equal(decidir('sin-escritura.js', [], bash('git status')), null);
	assert.equal(decidir('sin-escritura.js', [], bash('git diff --stat')), null);
	assert.equal(decidir('sin-escritura.js', [], bash('./mvnw -B -q test')), null);
});

test('sin-escritura: solo-lectura bloquea borrar y escribir con shell', () => {
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash('rm -rf target')), 'deny');
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash('tee salida.txt')), 'deny');
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash('sed -i s/a/b/ X.java')), 'deny');
});

test('sin-escritura: solo-lectura bloquea redirecciones dentro del proyecto', () => {
	const destino = path.join(raizProyecto, 'x.txt');
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash(`echo hola > "${destino}"`)), 'deny');
});

test('sin-escritura: solo-lectura deja redirecciones a /dev/null y a rutas fuera del proyecto', () => {
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash('./mvnw -B -q test > /dev/null 2>&1')), null);
	assert.equal(decidir('sin-escritura.js', ['--solo-lectura'], bash('echo hola > /tmp/x.txt')), null);
});

test('sin-escritura: sin --solo-lectura no bloquea redirecciones', () => {
	const destino = path.join(raizProyecto, 'x.txt');
	assert.equal(decidir('sin-escritura.js', [], bash(`echo hola > "${destino}"`)), null);
});
