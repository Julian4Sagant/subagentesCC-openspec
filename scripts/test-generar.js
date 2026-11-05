// Pruebas del generador de agentes. Correr desde la raíz del repo: node --test scripts/test-generar.js
// Cubren la traducción de la fuente neutral a Claude Code, las validaciones de la fuente y la
// detección de desvíos entre roles/ y agents/.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generarDesdeTexto, generarTodo, desvios } = require('./generar');

const raiz = path.resolve(__dirname, '..');
const carpetaRoles = path.join(raiz, 'roles');

/** Arma el texto de una fuente de rol. Los campos se pasan como líneas de frontmatter. */
function fuente(nombre, lineas, cuerpo = '\nCuerpo del rol.\n') {
	return `---\nname: ${nombre}\ndescription: Descripción de prueba.\n${lineas.join('\n')}\n---\n${cuerpo}`;
}

const BASE = ['nivel: medio', 'herramientas: [leer, ejecutar]', 'guardas: [sin-escritura]', 'skills: []'];

function generado(nombre) {
	const { contenido } = generarDesdeTexto(fs.readFileSync(path.join(carpetaRoles, `${nombre}.md`), 'utf8'), `${nombre}.md`);
	return contenido;
}

test('cada rol de roles/ genera un agente con frontmatter y cuerpo', () => {
	const generados = generarTodo(carpetaRoles);
	assert.equal(generados.length, 5);
	for (const { nombre, contenido } of generados) {
		assert.match(contenido, /^---\n# Generado por scripts\/generar\.js/, nombre);
		assert.match(contenido, new RegExp(`\nname: ${nombre}\n`), nombre);
		assert.match(contenido, /\nmodel: (opus|sonnet|haiku)\n/, nombre);
	}
});

test('el nivel se traduce al alias de modelo de Claude Code', () => {
	assert.match(generado('security-auditor'), /\nmodel: opus\n/);
	assert.match(generado('implementador'), /\nmodel: sonnet\n/);
	assert.match(generado('tester'), /\nmodel: haiku\n/);
});

test('un rol de solo lectura no recibe herramientas de escritura y lleva sin-escritura con --solo-lectura', () => {
	for (const nombre of ['revisor', 'security-auditor']) {
		const contenido = generado(nombre);
		assert.doesNotMatch(contenido, /\ntools: .*(Write|Edit)/, nombre);
		assert.match(contenido, /sin-escritura\.js" --solo-lectura/, nombre);
	}
});

test('un rol que escribe recibe Write y Edit y la guarda sin --solo-lectura', () => {
	const contenido = generado('postgres-pro');
	assert.match(contenido, /\ntools: Read, Grep, Glob, Bash, Write, Edit\n/);
	assert.match(contenido, /sin-escritura\.js"\n/);
	assert.doesNotMatch(contenido, /--solo-lectura/);
});

test('herramientas "todas" no genera línea tools (hereda todas)', () => {
	assert.doesNotMatch(generado('implementador'), /\ntools:/);
});

test('el tester lleva el hook de src/main con --siempre antes de la guarda de escritura', () => {
	const contenido = generado('tester');
	const posSrc = contenido.indexOf('tester-sin-src-main.js" --siempre');
	const posEscritura = contenido.indexOf('sin-escritura.js"');
	assert.ok(posSrc > 0 && posEscritura > posSrc, 'orden de hooks');
	assert.match(contenido, /matcher: "Read\|Grep\|Glob\|Bash"/);
});

test('las skills se emiten como lista YAML', () => {
	assert.match(generado('revisor'), /\nskills:\n  - openspec-verify-change\n/);
	assert.doesNotMatch(generado('tester'), /\nskills:/);
});

test('el cuerpo del agente generado es idéntico al de la fuente', () => {
	for (const nombre of fs.readdirSync(carpetaRoles).map(f => path.basename(f, '.md'))) {
		const texto = fs.readFileSync(path.join(carpetaRoles, `${nombre}.md`), 'utf8');
		const cuerpoFuente = texto.slice(texto.indexOf('\n---\n') + 5);
		const cuerpoGenerado = generado(nombre).slice(generado(nombre).indexOf('\n---\n') + 5);
		assert.equal(cuerpoGenerado, cuerpoFuente, nombre);
	}
});

test('rechaza un nivel desconocido', () => {
	const texto = fuente('x', ['nivel: enorme', 'herramientas: [leer]', 'guardas: [sin-escritura]']);
	assert.throws(() => generarDesdeTexto(texto, 'x.md'), /nivel "enorme"/);
});

test('rechaza una fuente sin la guarda sin-escritura', () => {
	const texto = fuente('x', ['nivel: medio', 'herramientas: [leer]', 'guardas: []']);
	assert.throws(() => generarDesdeTexto(texto, 'x.md'), /falta la guarda sin-escritura/);
});

test('rechaza una guarda desconocida', () => {
	const texto = fuente('x', ['nivel: medio', 'herramientas: [leer]', 'guardas: [sin-escritura, magia]']);
	assert.throws(() => generarDesdeTexto(texto, 'x.md'), /guardas desconocidas: magia/);
});

test('rechaza una capacidad desconocida', () => {
	const texto = fuente('x', ['nivel: medio', 'herramientas: [leer, volar]', 'guardas: [sin-escritura]']);
	assert.throws(() => generarDesdeTexto(texto, 'x.md'), /herramientas desconocidas: volar/);
});

test('rechaza un name que no coincide con el archivo', () => {
	const texto = fuente('otro', BASE);
	assert.throws(() => generarDesdeTexto(texto, 'x.md'), /no coincide con el nombre del archivo/);
});

test('rechaza una fuente sin frontmatter', () => {
	assert.throws(() => generarDesdeTexto('Sin frontmatter\n', 'x.md'), /falta el frontmatter/);
});

test('--verificar: agents/ actual coincide con roles/', () => {
	const problemas = desvios(generarTodo(carpetaRoles), path.join(raiz, 'agents'));
	assert.deepEqual(problemas, []);
});

test('desvios: detecta un agente editado a mano y uno que falta', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'generar-'));
	const generados = generarTodo(carpetaRoles);
	for (const { nombre, contenido } of generados) {
		fs.writeFileSync(path.join(tmp, `${nombre}.md`), nombre === 'revisor' ? `${contenido}\nEditado a mano.\n` : contenido);
	}
	fs.unlinkSync(path.join(tmp, 'tester.md'));
	const problemas = desvios(generados, tmp);
	assert.equal(problemas.length, 2);
	assert.ok(problemas.some(p => p.includes('agents/revisor.md no coincide')));
	assert.ok(problemas.some(p => p.includes('agents/tester.md no existe')));
	fs.rmSync(tmp, { recursive: true, force: true });
});
