#!/usr/bin/env node
// Guarda de escritura para los subagentes que no deben cambiar el repo. Hook PreToolUse de Bash.
//
// Siempre bloquea los comandos de git que cambian el estado (commit, push, reset, stash, checkout...):
// integrar y commitear es del orquestador, y la persona revisa el diff. Con --solo-lectura, además
// bloquea escribir o borrar archivos con comandos de shell y con redirecciones dentro del proyecto.
//
// Se declara en el frontmatter del agente, así que solo corre mientras trabaja ese agente.
//
// Es una barrera contra escrituras accidentales o por atajo, no un límite de seguridad: un comando
// armado en partes o un script que escriba por su cuenta puede esquivarla. La garantía fuerte es no
// darle al agente herramientas de escritura (sin Write ni Edit).

const fs = require('fs');
const path = require('path');

function leerEntrada() {
	try {
		return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
	}
	catch {
		return {};
	}
}

const GIT_QUE_CAMBIA = /\bgit\s+(commit|push|reset|stash|checkout|switch|merge|rebase|add|tag|restore|clean|rm|mv|cherry-pick|revert|am|apply|pull|sparse-checkout|worktree)\b/;
const COMANDOS_QUE_ESCRIBEN = /(^|[;&|(\s])(tee|cp|mv|rm|mkdir|touch|chmod|chown)\b|\bsed\s+-i/;
const REDIRECCION = /(^|[^0-9&])>{1,2}\s*("[^"]*"|'[^']*'|[^\s;&|)]+)/g;

/** Verdadero si `destino` cae dentro de `base` (la raíz del proyecto). */
function dentroDe(destino, base) {
	const relativo = path.relative(base, destino);
	return relativo !== '' && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

function motivoDeBloqueo(comando, cwd, soloLectura) {
	if (GIT_QUE_CAMBIA.test(comando)) {
		return 'cambiar el repo con git (commit, push, reset, stash, checkout y similares)';
	}
	if (!soloLectura) {
		return null;
	}
	if (COMANDOS_QUE_ESCRIBEN.test(comando)) {
		return 'escribir o borrar archivos con un comando de shell';
	}
	const base = path.resolve(cwd || process.cwd());
	for (const [, , destinoCrudo] of comando.matchAll(REDIRECCION)) {
		const destino = path.resolve(base, destinoCrudo.replace(/^["']|["']$/g, ''));
		if (dentroDe(destino, base)) {
			return 'escribir dentro del proyecto con una redirección';
		}
	}
	return null;
}

const entrada = leerEntrada();
const soloLectura = process.argv.includes('--solo-lectura');
const comando = entrada.tool_name === 'Bash' ? String((entrada.tool_input || {}).command || '') : '';
const motivo = comando ? motivoDeBloqueo(comando, entrada.cwd, soloLectura) : null;
if (motivo) {
	process.stdout.write(JSON.stringify({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: `Este agente no puede ${motivo}. Reportá lo que necesitás al orquestador en vez de hacerlo.`,
		},
	}));
}
process.exit(0);
