// Pruebas de verificar-proyecto.js. Correr desde la raíz del repo: node --test scripts/test-verificar-proyecto.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { verificarProyecto } = require('./verificar-proyecto');

const raizRepo = path.resolve(__dirname, '..');
const carpetaAgentes = path.join(raizRepo, 'agents');

/** Crea un proyecto temporal con todo lo que el contrato pide, con copias idénticas a la fuente. */
function crearProyectoValido() {
	const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'proyecto-'));
	const escribir = (ruta, contenido) => {
		fs.mkdirSync(path.dirname(path.join(raiz, ruta)), { recursive: true });
		fs.writeFileSync(path.join(raiz, ruta), contenido);
	};
	escribir('AGENTS.md', '# Proyecto\n');
	escribir('CLAUDE.md', '@AGENTS.md\n');
	escribir('openspec/config.yaml', 'schema: spec-driven\n\ncontext: |\n  Stack de prueba.\n');
	escribir('docs/flujo-de-trabajo.md', '9. Al cerrar cada grupo del apply\n');
	escribir('.claude/hooks/tester-sin-src-main.js', '// hook\n');
	for (const archivo of fs.readdirSync(carpetaAgentes)) {
		escribir(path.join('.claude/agents', archivo), fs.readFileSync(path.join(carpetaAgentes, archivo)));
	}
	return raiz;
}

test('un proyecto que cumple el contrato no tiene problemas', () => {
	assert.deepEqual(verificarProyecto(crearProyectoValido()), []);
});

test('falta CLAUDE.md', () => {
	const raiz = crearProyectoValido();
	fs.rmSync(path.join(raiz, 'CLAUDE.md'));
	const problemas = verificarProyecto(raiz);
	assert.equal(problemas.length, 1);
	assert.match(problemas[0], /falta CLAUDE\.md/);
});

test('falta AGENTS.md (el contenido quedó en CLAUDE.md)', () => {
	const raiz = crearProyectoValido();
	fs.rmSync(path.join(raiz, 'AGENTS.md'));
	const problemas = verificarProyecto(raiz);
	assert.equal(problemas.length, 1, problemas.join('\n'));
	assert.match(problemas[0], /falta AGENTS\.md/);
});

test('CLAUDE.md sin la línea @AGENTS.md', () => {
	const raiz = crearProyectoValido();
	fs.writeFileSync(path.join(raiz, 'CLAUDE.md'), '# Reglas copiadas\n');
	assert.match(verificarProyecto(raiz).join('\n'), /CLAUDE\.md no importa AGENTS\.md/);
});

test('CLAUDE.md con @AGENTS.md dentro de un bloque de código no cuenta como import', () => {
	const raiz = crearProyectoValido();
	fs.writeFileSync(path.join(raiz, 'CLAUDE.md'), 'Ejemplo:\n\n```\n@AGENTS.md\n```\n');
	assert.match(verificarProyecto(raiz).join('\n'), /CLAUDE\.md no importa AGENTS\.md/);
});

test('config.yaml sin campo context', () => {
	const raiz = crearProyectoValido();
	fs.writeFileSync(path.join(raiz, 'openspec/config.yaml'), 'schema: spec-driven\n');
	assert.match(verificarProyecto(raiz).join('\n'), /no tiene el campo context/);
});

test('el flujo no tiene la sección de cierre de grupo', () => {
	const raiz = crearProyectoValido();
	fs.writeFileSync(path.join(raiz, 'docs/flujo-de-trabajo.md'), '# Flujo\n');
	assert.match(verificarProyecto(raiz).join('\n'), /Al cerrar cada grupo del apply/);
});

test('falta un agente instalado', () => {
	const raiz = crearProyectoValido();
	fs.rmSync(path.join(raiz, '.claude/agents/tester.md'));
	assert.match(verificarProyecto(raiz).join('\n'), /falta el agente .claude[\\/]agents[\\/]tester\.md/);
});

test('una copia instalada que se desvió de la fuente', () => {
	const raiz = crearProyectoValido();
	fs.appendFileSync(path.join(raiz, '.claude/agents/revisor.md'), '\n## El proyecto\nReglas propias.\n');
	assert.match(verificarProyecto(raiz).join('\n'), /revisor\.md no coincide/);
});

test('las copias con finales de línea CRLF no cuentan como desvío', () => {
	const raiz = crearProyectoValido();
	const ruta = path.join(raiz, '.claude/agents/revisor.md');
	const texto = fs.readFileSync(ruta, 'utf8').replace(/\r?\n/g, '\r\n');
	fs.writeFileSync(ruta, texto);
	assert.deepEqual(verificarProyecto(raiz), []);
});

test('CLI: sale con 1 si hay problemas y con 0 si no', () => {
	const bien = spawnSync(process.execPath, [path.join(__dirname, 'verificar-proyecto.js'), crearProyectoValido()], { encoding: 'utf8' });
	assert.equal(bien.status, 0, bien.stdout);

	const mal = crearProyectoValido();
	fs.rmSync(path.join(mal, 'CLAUDE.md'));
	const r = spawnSync(process.execPath, [path.join(__dirname, 'verificar-proyecto.js'), mal], { encoding: 'utf8' });
	assert.equal(r.status, 1);
	assert.match(r.stdout, /\[FALTA\] falta CLAUDE\.md/);
});

test('CLI: sale con 2 si la ruta no existe', () => {
	const r = spawnSync(process.execPath, [path.join(__dirname, 'verificar-proyecto.js'), path.join(os.tmpdir(), 'no-existe-xyz')], { encoding: 'utf8' });
	assert.equal(r.status, 2);
});
