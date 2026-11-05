#!/usr/bin/env node
// Orquesta el apply de un change de OpenSpec con los roles de roles/ y una CLI de agentes configurable.
// Reemplaza al workflow de Claude Code: el grafo vive acá, en código, y cada rol es un proceso headless.
//
// Fases:
//   1. Implementar: el tester escribe en un worktree ciego (sin src/main) y cada área implementa en su
//      worktree. Cada worktree se confirma con commits del orquestador y sus cambios se aplican al repo integrado.
//   2. Revisar: se corren las pruebas en el repo integrado, después el revisor (solo lectura) y, si hace falta,
//      el auditor de seguridad (solo lectura). Las garantías de garantias.js se comprueban después de cada uno.
//   3. Corregir: hasta maxVueltas. Los hallazgos de código los corrige el implementador en el repo integrado;
//      los de tests, el tester en su worktree ciego.
//
// Uso (desde la raíz del repo):
//   node scripts/orquestar.js --change <id> --integrado <repo> --areas <areas.json> --salida <carpeta> \
//     [--cli claude] [--config config/cli.json] [--comando-tests "./mvnw -B -q test"] [--seguridad] \
//     [--max-vueltas 3] [--skills <carpeta>]...
//
// areas.json: [{ "nombre": "solicitudes", "tareas": "2.1 a 2.4", "worktree": "/ruta/a/worktree", "rol": "implementador" }]
// Salida: JSON por stdout y en <salida>/resultado.json. Sale con 0 si APROBADO, 1 en otro caso.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { leerRoles } = require('./generar');
const { snapshot, comparar, crearWorktreeCiego, verificarCiego } = require('./garantias');

const raiz = path.resolve(__dirname, '..');
const VERDICTO = /^VEREDICTO:\s*(APROBADO|CAMBIOS REQUERIDOS|SIN HALLAZGOS|CON HALLAZGOS)/m;
const CONTEOS = /CRITICAL:\s*(\d+)\s+WARNING:\s*(\d+)/;
const PUNTO = /^\d+\.\s*\[(código|tests|artefactos)\].*$/gm;
const CAPACIDADES = ['leer', 'ejecutar', 'escribir'];
const ROLES_DE_AREA = ['implementador', 'postgres-pro'];
const TIMEOUT_MS = 60 * 60 * 1000;

/** Un bloqueo es un fallo esperado del flujo: se reporta como BLOQUEADO con su motivo. */
class Bloqueo extends Error {}

function git(cwd, args, { ok = false } = {}) {
	const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0 && !ok) {
		throw new Bloqueo(`git ${args.join(' ')} falló en ${cwd}: ${(r.stderr || '').trim()}`);
	}
	return r.stdout;
}

function revision(cwd) {
	return git(cwd, ['rev-parse', 'HEAD']).trim();
}

/** Rutas con cambios en un worktree (sin ignorados). Ignora las líneas de renombre sin estado. */
function rutasCambiadas(cwd) {
	return git(cwd, ['status', '--porcelain=v1', '-z', '-uall'])
		.split('\0')
		.filter(l => /^[ MADRCU?!]{2} /.test(l))
		.map(l => l.slice(3));
}

/** Confirma los cambios de un worktree con un commit del orquestador. Los agentes no commitean. */
function confirmarDelOrquestador(cwd, mensaje) {
	git(cwd, ['add', '-A']);
	if (git(cwd, ['status', '--porcelain']).trim() !== '') {
		git(cwd, ['-c', 'user.name=orquestador', '-c', 'user.email=orquestador@local', 'commit', '-q', '-m', mensaje]);
	}
	return revision(cwd);
}

/** Arma argv a partir de una plantilla. Un valor vacío quita su flag (`--model {modelo}` sin modelo). */
function construirArgv(plantilla, valores) {
	const out = [];
	for (const token of plantilla) {
		const solo = /^\{(\w+)\}$/.exec(token);
		if (solo) {
			const v = valores[solo[1]];
			if (v === undefined || v === null || v === '') {
				if (out.length > 0 && out[out.length - 1].startsWith('--')) {
					out.pop();
				}
				continue;
			}
			out.push(String(v));
		}
		else {
			out.push(token.replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? ''));
		}
	}
	return out;
}

/** Herramientas de una CLI para un rol. Un rol sin `herramientas` declaradas recibe todas. */
function herramientasDe(cfg, rol) {
	const caps = rol.herramientas ?? CAPACIDADES;
	return CAPACIDADES.filter(c => caps.includes(c)).flatMap(c => cfg.herramientas[c]);
}

/** Ejecuta una CLI headless y devuelve código, salida y error. */
function ejecutarCli(cfg, argv, cwd) {
	return new Promise((resolve) => {
		const hijo = spawn(cfg.comando, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let texto = '';
		let error = '';
		hijo.stdout.on('data', d => (texto += d));
		hijo.stderr.on('data', d => (error += d));
		const timer = setTimeout(() => hijo.kill('SIGTERM'), TIMEOUT_MS);
		hijo.on('error', (e) => {
			clearTimeout(timer);
			resolve({ codigo: -1, texto, error: String(e) });
		});
		hijo.on('close', (codigo) => {
			clearTimeout(timer);
			resolve({ codigo, texto, error });
		});
	});
}

/** Corre un rol con la CLI configurada. El cuerpo del rol va como prompt de sistema si la CLI lo soporta. */
function ejecutarRol(cfg, rol, { prompt, sistema, cwd }) {
	const conSistema = cfg.argv.includes('{sistema}');
	const valores = {
		prompt: conSistema ? prompt : `${sistema}\n\n---\n\n${prompt}`,
		sistema: conSistema ? sistema : undefined,
		modelo: cfg.modelos[rol.nivel],
		herramientas: herramientasDe(cfg, rol).join(','),
	};
	return ejecutarCli(cfg, [...construirArgv(cfg.argv, valores)], cwd);
}

function cargarCli(archivo, nombre) {
	const todas = JSON.parse(fs.readFileSync(archivo, 'utf8'));
	const cfg = todas[nombre];
	if (!cfg) {
		throw new Error(`no hay configuración para la CLI "${nombre}" en ${archivo}`);
	}
	for (const clave of ['comando', 'argv', 'modelos', 'herramientas']) {
		if (!cfg[clave]) {
			throw new Error(`la configuración de "${nombre}" no tiene ${clave}`);
		}
	}
	return cfg;
}

/** Texto de las skills del rol, buscadas en las carpetas configuradas. Falla si falta alguna. */
function skillsDelRol(ctx, rol) {
	return rol.skills.map((s) => {
		for (const dir of ctx.carpetasSkills) {
			const archivo = path.join(dir, s, 'SKILL.md');
			if (fs.existsSync(archivo)) {
				return `\n\n## Skill ${s}\n\n${fs.readFileSync(archivo, 'utf8')}`;
			}
		}
		throw new Bloqueo(`no encuentro la skill ${s} en ${ctx.carpetasSkills.join(' ni en ')}`);
	}).join('');
}

function log(ctx, etiqueta, contenido) {
	const carpeta = path.join(ctx.salida, 'logs');
	fs.mkdirSync(carpeta, { recursive: true });
	fs.writeFileSync(path.join(carpeta, `${etiqueta.replace(/[^\w.-]/g, '_')}.log`), contenido);
}

/** Corre un rol y lanza Bloqueo si la CLI falla. Devuelve el texto de la respuesta. */
async function correrRol(ctx, nombreRol, cwd, tarea, etiqueta) {
	const rol = ctx.roles.get(nombreRol);
	if (!rol) {
		throw new Bloqueo(`no existe el rol ${nombreRol} en roles/`);
	}
	const prompt = [`Rol: ${nombreRol}`, `Change de OpenSpec: ${ctx.change}`, `Tu worktree: ${cwd}`, '', tarea].join('\n');
	const r = await ejecutarRol(ctx.cfg, rol, { prompt, sistema: rol.cuerpo + skillsDelRol(ctx, rol), cwd });
	log(ctx, etiqueta, `${r.texto}\n--- stderr ---\n${r.error || ''}`);
	if (r.codigo !== 0) {
		throw new Bloqueo(`${etiqueta}: la CLI salió con código ${r.codigo}${r.error ? `: ${r.error.trim().slice(0, 300)}` : ''}`);
	}
	return r.texto;
}

/** Rol de solo lectura sobre el repo integrado: si cambia algo, el rol falla. */
async function correrSoloLectura(ctx, nombreRol, tarea, etiqueta) {
	const antes = snapshot(ctx.integrado);
	const texto = await correrRol(ctx, nombreRol, ctx.integrado, tarea, etiqueta);
	const cambios = comparar(antes, snapshot(ctx.integrado));
	if (cambios.length > 0) {
		throw new Bloqueo(`${etiqueta} modificó el repo: ${cambios.join('; ')}`);
	}
	return texto;
}

/** Rol que escribe directamente en el repo integrado (solo para correcciones de código): no puede commitear. */
async function correrEnIntegrado(ctx, nombreRol, tarea, etiqueta) {
	const antes = snapshot(ctx.integrado);
	const texto = await correrRol(ctx, nombreRol, ctx.integrado, tarea, etiqueta);
	if (antes.head !== snapshot(ctx.integrado).head) {
		throw new Bloqueo(`${etiqueta} hizo commit; los commits son del orquestador`);
	}
	return texto;
}

/**
 * Rol que escribe en su worktree. Después de correrlo: no puede haber commits del agente, la validación
 * extra del rol tiene que pasar, y el orquestador confirma los cambios. Devuelve el nuevo HEAD.
 */
async function correrEnWorktree(ctx, { clave, nombreRol, cwd, tarea, etiqueta, validar }) {
	const antes = revision(cwd);
	const texto = await correrRol(ctx, nombreRol, cwd, tarea, etiqueta);
	if (revision(cwd) !== antes) {
		throw new Bloqueo(`${etiqueta} hizo commit; los commits son del orquestador`);
	}
	if (validar) {
		validar(cwd);
	}
	const nuevo = confirmarDelOrquestador(cwd, `${etiqueta}: ${clave}`);
	return { nuevo, texto };
}

/** Aplica al repo integrado el cambio de un worktree entre el último HEAD aplicado y el nuevo. */
function aplicarPendiente(ctx, clave, cwd, nuevo) {
	const desde = ctx.aplicado[clave];
	if (desde === nuevo) {
		return;
	}
	const parche = git(cwd, ['diff', '--binary', desde, nuevo]);
	if (parche.trim() === '') {
		ctx.aplicado[clave] = nuevo;
		return;
	}
	const archivo = path.join(ctx.salida, 'parches', `${clave}-${nuevo.slice(0, 7)}.patch`);
	fs.mkdirSync(path.dirname(archivo), { recursive: true });
	fs.writeFileSync(archivo, parche);
	const r = spawnSync('git', ['-C', ctx.integrado, 'apply', '--whitespace=nowarn', archivo], { encoding: 'utf8' });
	if (r.status !== 0) {
		throw new Bloqueo(`no pude aplicar los cambios de ${clave} en el repo integrado (conflicto): ${(r.stderr || '').trim()}`);
	}
	ctx.aplicado[clave] = nuevo;
}

/** Validación del tester: solo src/test cambia, y el worktree sigue sin src/main en disco. */
function validarTester(cwd) {
	const fuera = rutasCambiadas(cwd).filter(r => !r.startsWith('src/test/'));
	if (fuera.length > 0) {
		throw new Bloqueo(`el tester tocó rutas fuera de src/test: ${fuera.join(', ')}`);
	}
	const problemas = verificarCiego(cwd);
	if (problemas.length > 0) {
		throw new Bloqueo(`el worktree ciego quedó contaminado: ${problemas.join('; ')}`);
	}
}

function correrPruebas(ctx) {
	const r = spawnSync(ctx.comandoTests, { cwd: ctx.integrado, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const salida = `${r.stdout || ''}${r.stderr || ''}`;
	log(ctx, 'pruebas', salida);
	return { ok: r.status === 0, resumen: salida.split('\n').slice(-40).join('\n') };
}

/** Lee el veredicto, los conteos de seguridad y los puntos accionables de las respuestas de los roles. */
function interpretar(textoRevisor, textoSeguridad, seguridad) {
	const veredicto = VERDICTO.exec(textoRevisor)?.[1] ?? null;
	const conteo = textoSeguridad ? CONTEOS.exec(textoSeguridad) : null;
	return {
		veredicto,
		conteo,
		puntos: textoRevisor.match(PUNTO) ?? [],
		seguridadOk: !seguridad || (conteo !== null && Number(conteo[1]) === 0 && Number(conteo[2]) === 0),
	};
}

/** Prepara el contexto: config, roles, worktrees, y verifica que todo lo necesario exista antes de correr nada. */
function preparar(opciones) {
	const cfg = cargarCli(opciones.config, opciones.cli);
	const roles = new Map(leerRoles(path.join(raiz, 'roles')).map(r => [r.nombre, r]));
	const areas = opciones.areas.map((a) => {
		const rol = a.rol ?? 'implementador';
		if (!ROLES_DE_AREA.includes(rol)) {
			throw new Error(`el área "${a.nombre}" tiene rol "${rol}"; solo puede ser ${ROLES_DE_AREA.join(' o ')}`);
		}
		return { ...a, rol };
	});
	const ctx = {
		change: opciones.change,
		integrado: path.resolve(opciones.integrado),
		salida: path.resolve(opciones.salida),
		cfg,
		roles,
		areas,
		seguridad: Boolean(opciones.seguridad),
		maxVueltas: opciones.maxVueltas ?? 3,
		comandoTests: opciones.comandoTests ?? './mvnw -B -q test',
		carpetasSkills: [...(opciones.skills ?? []), path.join(path.resolve(opciones.integrado), '.claude', 'skills'), path.join(raiz, 'skills')],
		aplicado: {},
		historial: [],
	};
	revision(ctx.integrado);
	const usados = new Set(['tester', 'revisor', ...areas.map(a => a.rol), ...(ctx.seguridad ? ['security-auditor'] : [])]);
	for (const nombre of usados) {
		const rol = roles.get(nombre);
		if (!rol) {
			throw new Bloqueo(`no existe el rol ${nombre} en roles/`);
		}
		skillsDelRol(ctx, rol);
	}
	return ctx;
}

async function aplicar(ctx) {
	ctx.ciego = path.join(ctx.salida, 'ciego');
	crearWorktreeCiego(ctx.integrado, ctx.ciego);
	ctx.aplicado.tester = revision(ctx.ciego);
	for (const a of ctx.areas) {
		ctx.aplicado[a.nombre] = revision(a.worktree);
	}

	const tareaTester = `Escribí los tests de los Scenarios del change "${ctx.change}" a partir de la spec, sin leer src/main. Tu worktree es ${ctx.ciego}. Reportá con tu formato fijo.`;
	const resultados = await Promise.all([
		correrEnWorktree(ctx, { clave: 'tester', nombreRol: 'tester', cwd: ctx.ciego, tarea: tareaTester, etiqueta: 'tester', validar: validarTester }),
		...ctx.areas.map(a => correrEnWorktree(ctx, {
			clave: a.nombre,
			nombreRol: a.rol,
			cwd: a.worktree,
			tarea: `Implementá solo estas tareas del change "${ctx.change}": ${a.tareas}. Tu worktree es ${a.worktree}. Reportá con tu formato fijo.`,
			etiqueta: `${a.rol}:${a.nombre}`,
		})),
	]);

	// Join: se aplican los cambios uno por uno, en el orden de las áreas.
	aplicarPendiente(ctx, 'tester', ctx.ciego, resultados[0].nuevo);
	ctx.areas.forEach((a, i) => aplicarPendiente(ctx, a.nombre, a.worktree, resultados[i + 1].nuevo));

	for (let vuelta = 1; vuelta <= ctx.maxVueltas; vuelta++) {
		const pruebas = correrPruebas(ctx);
		const tareaRevisor = [
			`Revisá el código integrado del change "${ctx.change}" contra la spec y el design, sobre este worktree.`,
			`Resultado de las pruebas: ${pruebas.ok ? 'OK' : 'FALLÓ'}`,
			pruebas.resumen,
			'Terminá con la línea VEREDICTO exacta. Si hay cambios, listalos numerados con [código], [tests] o [artefactos].',
		].join('\n');
		const textoRevisor = await correrSoloLectura(ctx, 'revisor', tareaRevisor, `revisor:${vuelta}`);

		let textoSeguridad = null;
		if (ctx.seguridad) {
			textoSeguridad = await correrSoloLectura(ctx, 'security-auditor', `Auditá el código integrado del change "${ctx.change}". Terminá con la línea VEREDICTO y la línea CRITICAL/WARNING exactas.`, `seguridad:${vuelta}`);
		}

		const { veredicto, conteo, puntos, seguridadOk } = interpretar(textoRevisor, textoSeguridad, ctx.seguridad);
		if (veredicto === null) {
			throw new Bloqueo('el revisor no dejó la línea VEREDICTO');
		}
		if (ctx.seguridad && conteo === null) {
			throw new Bloqueo('el auditor no dejó la línea CRITICAL/WARNING');
		}
		ctx.historial.push({
			vuelta,
			pruebas: pruebas.ok ? 'OK' : 'FALLÓ',
			revisor: veredicto,
			seguridad: conteo ? `CRITICAL ${conteo[1]} WARNING ${conteo[2]}` : null,
		});

		if (veredicto === 'APROBADO' && seguridadOk && pruebas.ok) {
			return { estado: 'APROBADO', vuelta };
		}
		if (vuelta === ctx.maxVueltas) {
			return { estado: 'ESCALA_A_PERSONA', motivo: `${ctx.maxVueltas} vueltas sin aprobar` };
		}
		const artefactos = puntos.filter(p => p.includes('[artefactos]'));
		if (artefactos.length > 0) {
			return { estado: 'ESCALA_A_PERSONA', motivo: 'hay cambios en artefactos; los decide la persona con /opsx:update', puntos: artefactos };
		}
		const codigo = puntos.filter(p => p.includes('[código]'));
		const tests = puntos.filter(p => p.includes('[tests]'));
		if (codigo.length === 0 && tests.length === 0 && seguridadOk) {
			return { estado: 'ESCALA_A_PERSONA', motivo: 'no aprobado y sin hallazgos accionables' };
		}

		if (codigo.length > 0 || !seguridadOk) {
			await correrEnIntegrado(ctx, 'implementador', `Corregí solo estos hallazgos de código del change "${ctx.change}", sin tocar artefactos ni tests:\n${codigo.join('\n') || '(ninguno del revisor)'}\n\nAuditoría de seguridad (corregí los CRITICAL y WARNING):\n${seguridadOk ? 'sin hallazgos' : textoSeguridad}`, `corregir-codigo:${vuelta}`);
		}
		if (tests.length > 0) {
			const { nuevo } = await correrEnWorktree(ctx, {
				clave: 'tester',
				nombreRol: 'tester',
				cwd: ctx.ciego,
				tarea: `Corregí solo estos hallazgos de tests, siguiendo la spec. Tu worktree es ${ctx.ciego}.\n${tests.join('\n')}`,
				etiqueta: `corregir-tests:${vuelta}`,
				validar: validarTester,
			});
			aplicarPendiente(ctx, 'tester', ctx.ciego, nuevo);
		}
	}
	return { estado: 'ESCALA_A_PERSONA', motivo: 'sin vueltas' };
}

/**
 * El driver hace `git add -A` en los worktrees: la salida no puede quedar dentro de uno de ellos.
 * Se valida antes de crear nada en disco.
 */
function validarSalida(integrado, areas, salida) {
	for (const carpeta of [integrado, ...areas.map(a => a.worktree)].map(p => path.resolve(p))) {
		const rel = path.relative(carpeta, salida);
		if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
			throw new Bloqueo(`la carpeta de salida ${salida} está dentro de ${carpeta}; ponela fuera de los repos y worktrees`);
		}
	}
}

/** Punto de entrada reutilizable: corre el apply y devuelve el resultado. Nunca lanza por un bloqueo. */
async function orquestar(opciones) {
	const salida = path.resolve(opciones.salida);
	let resultado;
	let ctx = null;
	try {
		validarSalida(opciones.integrado, opciones.areas ?? [], salida);
		fs.mkdirSync(salida, { recursive: true });
		ctx = preparar(opciones);
		resultado = await aplicar(ctx);
	}
	catch (e) {
		if (!(e instanceof Bloqueo)) {
			throw e;
		}
		resultado = { estado: 'BLOQUEADO', motivo: e.message };
	}
	const final = { ...resultado, historial: ctx ? ctx.historial : [] };
	if (fs.existsSync(salida)) {
		fs.writeFileSync(path.join(salida, 'resultado.json'), JSON.stringify(final, null, 2));
	}
	return final;
}

function leerOpciones(argv) {
	const valor = (nombre) => {
		const i = argv.indexOf(nombre);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const skills = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--skills' && argv[i + 1]) {
			skills.push(path.resolve(argv[i + 1]));
		}
	}
	return {
		change: valor('--change'),
		integrado: valor('--integrado'),
		areas: valor('--areas') ? JSON.parse(fs.readFileSync(valor('--areas'), 'utf8')) : null,
		salida: valor('--salida'),
		cli: valor('--cli') ?? 'claude',
		config: path.resolve(valor('--config') ?? path.join(raiz, 'config', 'cli.json')),
		comandoTests: valor('--comando-tests'),
		maxVueltas: valor('--max-vueltas') ? Number(valor('--max-vueltas')) : undefined,
		seguridad: argv.includes('--seguridad'),
		skills,
	};
}

async function main(argv) {
	const opciones = leerOpciones(argv);
	if (!opciones.change || !opciones.integrado || !opciones.areas || !opciones.salida) {
		console.error('uso: orquestar.js --change <id> --integrado <repo> --areas <areas.json> --salida <carpeta> [--cli claude] [--seguridad]');
		return 2;
	}
	const resultado = await orquestar(opciones);
	console.log(JSON.stringify(resultado, null, 2));
	return resultado.estado === 'APROBADO' ? 0 : 1;
}

module.exports = { orquestar, construirArgv, interpretar, ejecutarCli, ejecutarRol, cargarCli, Bloqueo };

if (require.main === module) {
	main(process.argv.slice(2)).then((code) => {
		process.exitCode = code;
	});
}
