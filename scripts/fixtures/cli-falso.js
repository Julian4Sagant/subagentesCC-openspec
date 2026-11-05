#!/usr/bin/env node
// CLI falsa para probar el orquestador sin modelos. Recibe [prompt, sistema, herramientas] como
// la plantilla de config/cli.json de las pruebas, lee el rol del prompt y se comporta como el rol:
// escribe en su worktree (cwd) y responde con el formato fijo.
// Variables: FAKE_DIR (carpeta de contadores y herramientas recibidas), FAKE_MODO (qué desviar).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const [prompt = '', , herramientas = ''] = process.argv.slice(2);
const rol = /^Rol: (.+)$/m.exec(prompt)?.[1].trim() ?? 'desconocido';
const dir = process.env.FAKE_DIR;
const modo = process.env.FAKE_MODO || '';

fs.writeFileSync(path.join(dir, `herramientas-${rol}.txt`), herramientas);

const contador = path.join(dir, `n-${rol}`);
const n = (fs.existsSync(contador) ? Number(fs.readFileSync(contador, 'utf8')) : 0) + 1;
fs.writeFileSync(contador, String(n));

const agregar = (rel, texto) => {
	fs.mkdirSync(path.dirname(path.join(process.cwd(), rel)), { recursive: true });
	fs.appendFileSync(path.join(process.cwd(), rel), texto);
};

if (modo === 'falla-' + rol) {
	console.error(`fallo simulado en ${rol}`);
	process.exit(3);
}

switch (rol) {
	case 'tester':
		agregar('src/test/Test.txt', `tester ${n}\n`);
		if (modo === 'tester-fuera') {
			agregar('src/main/Fuera.txt', 'escrito por el tester\n');
		}
		console.log('RESULTADO: TESTS ESCRITOS');
		break;
	case 'implementador':
		agregar('src/main/Impl.txt', `impl ${n}\n`);
		if (modo === 'implementador-commit') {
			const env = { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x' };
			spawnSync('git', ['add', '-A'], { env });
			spawnSync('git', ['commit', '-q', '-m', 'commit del implementador'], { env });
		}
		console.log('RESULTADO: COMPLETADO');
		break;
	case 'revisor':
		if (modo === 'revisor-escribe') {
			agregar('nota.txt', 'escrita por el revisor\n');
		}
		console.log(n === 1
			? 'VEREDICTO: CAMBIOS REQUERIDOS\n1. [código] src/main/Impl.txt:1 — ajustar\n2. [tests] src/test/Test.txt:1 — ajustar'
			: 'VEREDICTO: APROBADO');
		break;
	case 'security-auditor':
		console.log('VEREDICTO: CON HALLAZGOS\nCRITICAL: 0  WARNING: 0');
		break;
	default:
		console.error(`rol desconocido: ${rol}`);
		process.exit(4);
}
