// Pruebas de verificar-enlaces.js. Correr desde la raíz del repo: node --test scripts/test-verificar-enlaces.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { enlacesRelativos } = require('./verificar-enlaces');

test('toma los enlaces relativos y quita el ancla', () => {
	assert.deepEqual(enlacesRelativos('ver [x](docs/03.md#seccion) y [y](../a.md)'), ['docs/03.md', '../a.md']);
});

test('ignora http, mailto y anclas puras', () => {
	assert.deepEqual(enlacesRelativos('[a](https://x.dev) [b](mailto:a@b) [c](#arriba)'), []);
});

test('ignora enlaces dentro de bloques de código y de código en línea', () => {
	const texto = 'Ejemplo `[no](no-existe.md)`:\n\n```\n[tampoco](nada.md)\n```\n';
	assert.deepEqual(enlacesRelativos(texto), []);
});
