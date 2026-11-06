'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validar } = require('../validar-agentes');

const RAIZ = path.resolve(__dirname, '..', '..');

function carpetaTemporal(archivos) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentes-'));
	for (const [nombre, contenido] of Object.entries(archivos)) {
		fs.writeFileSync(path.join(dir, nombre), contenido);
	}
	return dir;
}

const CUERPO = '## Rol\n\nTexto.\n\n## Procedimiento\n\n1. Paso.\n\n## Reglas\n\n- Regla.\n\n## Reporte\n\nFormato.\n';

function rol(nombre, extra = {}) {
	const meta = {
		name: nombre,
		description: 'Descripción suficientemente larga para pasar la validación mínima.',
		acceso: 'lectura',
		alcance: 'ninguno',
		...extra,
	};
	const fm = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
	return `---\n${fm}\n---\n\n${extra.cuerpo ?? CUERPO}`;
}

test('los roles del repo son válidos', () => {
	assert.deepStrictEqual(validar(path.join(RAIZ, 'agents')), []);
});

test('un rol bien formado no tiene problemas', () => {
	const dir = carpetaTemporal({ 'auditor.md': rol('auditor') });
	assert.deepStrictEqual(validar(dir), []);
});

test('detecta name distinto del archivo y acceso inválido', () => {
	const dir = carpetaTemporal({ 'auditor.md': rol('otro', { acceso: 'todo' }) });
	const problemas = validar(dir).join('\n');
	assert.match(problemas, /no coincide con el nombre del archivo/);
	assert.match(problemas, /acceso "todo"/);
});

test('detecta texto atado a un modelo o a un host', () => {
	const cuerpo = CUERPO + '\nUsá el modelo haiku para esto y el hook $CLAUDE_PROJECT_DIR.\n';
	const dir = carpetaTemporal({ 'auditor.md': rol('auditor', { cuerpo }) });
	const problemas = validar(dir).join('\n');
	assert.match(problemas, /haiku/);
	assert.match(problemas, /CLAUDE_PROJECT_DIR/);
});

test('exige el formato de VEREDICTO al revisor', () => {
	const dir = carpetaTemporal({ 'revisor.md': rol('revisor') });
	assert.match(validar(dir).join('\n'), /formato de VEREDICTO/);
});

test('detecta secciones obligatorias faltantes', () => {
	const dir = carpetaTemporal({ 'auditor.md': rol('auditor', { cuerpo: '## Rol\n\nSolo esto.\n' }) });
	const problemas = validar(dir).join('\n');
	assert.match(problemas, /falta la sección "## Procedimiento"/);
	assert.match(problemas, /falta la sección "## Reporte"/);
});
