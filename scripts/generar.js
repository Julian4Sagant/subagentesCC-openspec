#!/usr/bin/env node
// Genera los agentes instalables a partir de la fuente neutral de roles/.
// La fuente no nombra modelos, herramientas ni hooks de una herramienta concreta: dice el nivel de
// capacidad (fuerte, medio, rapido), las capacidades que necesita (leer, escribir, ejecutar) y las
// guardas. Este script traduce eso al formato que hoy lee Claude Code en agents/.
//
// Uso (desde la raíz del repo):
//   node scripts/generar.js              escribe agents/ desde roles/
//   node scripts/generar.js --verificar  no escribe; sale con 1 si agents/ no coincide con roles/
//
// Para editar un agente, editá roles/<nombre>.md y volvé a generar. No edites agents/ a mano.

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const CARPETA_ROLES = path.join(raiz, 'roles');
const CARPETA_AGENTES = path.join(raiz, 'agents');

/** Nivel de capacidad → alias de modelo de Claude Code. */
const NIVELES = { fuerte: 'opus', medio: 'sonnet', rapido: 'haiku' };

/** Capacidad → herramientas de Claude Code, en el orden en que se escriben en `tools:`. */
const HERRAMIENTAS = {
	leer: ['Read', 'Grep', 'Glob'],
	ejecutar: ['Bash'],
	escribir: ['Write', 'Edit'],
};

/** Guarda → matcher y argumentos del hook de Claude Code. */
const GUARDAS = {
	'sin-escritura': {
		matcher: 'Bash',
		argumentos: (rol) => (rol.soloLectura ? ['--solo-lectura'] : []),
	},
	'tester-sin-src-main': {
		matcher: 'Read|Grep|Glob|Bash',
		argumentos: () => ['--siempre'],
	},
};

const TIMEOUT_HOOK = 10;

/** Separa el frontmatter neutral del cuerpo. El cuerpo se copia tal cual. */
function partir(texto, rel) {
	const m = /^---\n([\s\S]*?)\n---[ \t]*\n/.exec(texto);
	if (!m) {
		throw new Error(`${rel}: falta el frontmatter (bloque entre dos líneas ---)`);
	}
	return { fm: m[1], cuerpo: texto.slice(m[0].length) };
}

/** Lee `clave: valor` de primer nivel. `[a, b]` da una lista; el resto, texto. */
function leerCampos(fm, rel) {
	const campos = {};
	for (const linea of fm.split('\n')) {
		if (linea.trim() === '') {
			continue;
		}
		const m = /^([a-z_]+):[ \t]*(.*)$/.exec(linea);
		if (!m) {
			throw new Error(`${rel}: línea de frontmatter no reconocida: "${linea}"`);
		}
		const valor = m[2].trim();
		campos[m[1]] = valor.startsWith('[')
			? valor.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
			: valor;
	}
	return campos;
}

/** Valida una fuente y devuelve el rol normalizado. Lanza un error con el archivo si algo no cuadra. */
function validarRol(campos, nombreArchivo, cuerpo, rel) {
	const base = path.basename(nombreArchivo, '.md');
	if (campos.name !== base) {
		throw new Error(`${rel}: name "${campos.name}" no coincide con el nombre del archivo "${base}"`);
	}
	if (!campos.description) {
		throw new Error(`${rel}: falta description`);
	}
	if (!Object.prototype.hasOwnProperty.call(NIVELES, campos.nivel)) {
		throw new Error(`${rel}: nivel "${campos.nivel}" no es uno de ${Object.keys(NIVELES).join(', ')}`);
	}
	const todas = campos.herramientas === 'todas';
	if (!todas) {
		if (!Array.isArray(campos.herramientas) || campos.herramientas.length === 0) {
			throw new Error(`${rel}: herramientas debe ser "todas" o una lista de ${Object.keys(HERRAMIENTAS).join(', ')}`);
		}
		const desconocidas = campos.herramientas.filter(h => !HERRAMIENTAS[h]);
		if (desconocidas.length > 0) {
			throw new Error(`${rel}: herramientas desconocidas: ${desconocidas.join(', ')}`);
		}
	}
	const guardas = Array.isArray(campos.guardas) ? campos.guardas : [];
	if (!guardas.includes('sin-escritura')) {
		throw new Error(`${rel}: falta la guarda sin-escritura; ningún agente commitea, eso es del orquestador`);
	}
	const desconocidas = guardas.filter(g => !GUARDAS[g]);
	if (desconocidas.length > 0) {
		throw new Error(`${rel}: guardas desconocidas: ${desconocidas.join(', ')}`);
	}
	if (!cuerpo.trim()) {
		throw new Error(`${rel}: el cuerpo está vacío`);
	}
	const skills = Array.isArray(campos.skills) ? campos.skills : [];
	const escribe = todas || campos.herramientas.includes('escribir');
	return {
		nombre: base,
		descripcion: campos.description,
		nivel: campos.nivel,
		herramientas: todas ? null : campos.herramientas,
		guardas,
		skills,
		soloLectura: !escribe,
	};
}

/** Arma el bloque YAML de hooks de Claude Code, con un matcher por guarda, en el orden de la fuente. */
function bloqueHooks(rol) {
	const lineas = ['hooks:', '  PreToolUse:'];
	for (const nombre of rol.guardas) {
		const guarda = GUARDAS[nombre];
		const args = guarda.argumentos(rol).map(a => ` ${a}`).join('');
		lineas.push(
			`    - matcher: "${guarda.matcher}"`,
			'      hooks:',
			'        - type: command',
			`          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/${nombre}.js"${args}`,
			`          timeout: ${TIMEOUT_HOOK}`,
		);
	}
	return lineas;
}

/** Genera el archivo de agente de Claude Code para un rol validado. */
function generarAgente(rol, cuerpo) {
	const lineas = [
		'---',
		`# Generado por scripts/generar.js desde roles/${rol.nombre}.md. No editar: cambiá la fuente y volvé a generar.`,
		`name: ${rol.nombre}`,
		`description: ${rol.descripcion}`,
		`model: ${NIVELES[rol.nivel]}`,
	];
	if (rol.herramientas) {
		const tools = [];
		for (const cap of ['leer', 'ejecutar', 'escribir']) {
			if (rol.herramientas.includes(cap)) {
				tools.push(...HERRAMIENTAS[cap]);
			}
		}
		lineas.push(`tools: ${tools.join(', ')}`);
	}
	if (rol.skills.length > 0) {
		lineas.push('skills:', ...rol.skills.map(s => `  - ${s}`));
	}
	lineas.push(...bloqueHooks(rol));
	lineas.push('---');
	return `${lineas.join('\n')}\n${cuerpo}`;
}

/** Convierte el texto de una fuente en el texto del agente generado. Pura: no toca el disco. */
function generarDesdeTexto(texto, nombreArchivo) {
	const rel = `roles/${nombreArchivo}`;
	const normal = texto.replace(/\r\n/g, '\n');
	const { fm, cuerpo } = partir(normal, rel);
	const rol = validarRol(leerCampos(fm, rel), nombreArchivo, cuerpo, rel);
	return { nombre: rol.nombre, contenido: generarAgente(rol, cuerpo) };
}

/** Genera todos los agentes de una carpeta de roles. Devuelve [{ nombre, contenido }]. */
function generarTodo(carpetaRoles) {
	const archivos = fs.readdirSync(carpetaRoles).filter(f => f.endsWith('.md')).sort();
	if (archivos.length === 0) {
		throw new Error(`${carpetaRoles}: no hay roles`);
	}
	return archivos.map(archivo => generarDesdeTexto(fs.readFileSync(path.join(carpetaRoles, archivo), 'utf8'), archivo));
}

/** Compara lo generado con carpetaAgentes. Devuelve la lista de archivos que faltan o difieren. */
function desvios(generados, carpetaAgentes) {
	const problemas = [];
	for (const { nombre, contenido } of generados) {
		const ruta = path.join(carpetaAgentes, `${nombre}.md`);
		if (!fs.existsSync(ruta)) {
			problemas.push(`agents/${nombre}.md no existe; corré node scripts/generar.js`);
		} else if (fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n') !== contenido) {
			problemas.push(`agents/${nombre}.md no coincide con roles/${nombre}.md; corré node scripts/generar.js`);
		}
	}
	return problemas;
}

function main(argv) {
	const verificar = argv.includes('--verificar');
	const generados = generarTodo(CARPETA_ROLES);
	if (verificar) {
		const problemas = desvios(generados, CARPETA_AGENTES);
		if (problemas.length > 0) {
			for (const p of problemas) {
				console.log(`DESVIO  ${p}`);
			}
			return 1;
		}
		console.log(`OK: agents/ coincide con roles/ (${generados.length} agentes)`);
		return 0;
	}
	fs.mkdirSync(CARPETA_AGENTES, { recursive: true });
	for (const { nombre, contenido } of generados) {
		fs.writeFileSync(path.join(CARPETA_AGENTES, `${nombre}.md`), contenido);
		console.log(`generado agents/${nombre}.md`);
	}
	return 0;
}

/** Lee y valida todas las fuentes de roles/. Devuelve el rol normalizado más su cuerpo. */
function leerRoles(carpetaRoles) {
	return fs.readdirSync(carpetaRoles).filter(f => f.endsWith('.md')).sort().map((archivo) => {
		const rel = `roles/${archivo}`;
		const texto = fs.readFileSync(path.join(carpetaRoles, archivo), 'utf8').replace(/\r\n/g, '\n');
		const { fm, cuerpo } = partir(texto, rel);
		return { ...validarRol(leerCampos(fm, rel), archivo, cuerpo, rel), cuerpo };
	});
}

module.exports = { generarDesdeTexto, generarTodo, desvios, leerRoles, NIVELES, HERRAMIENTAS };

if (require.main === module) {
	process.exitCode = main(process.argv.slice(2));
}
