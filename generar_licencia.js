// ============================================================
//  generar_licencia.js — Herramienta para generar códigos
//  ⚠️  USO EXCLUSIVO DE JHONY LORENZO — NO distribuir
//  Control de Vencimientos
// ============================================================
//
//  Uso directo desde terminal:
//    node generar_licencia.js CLIENTE basico 2026
//    node generar_licencia.js CLIENTE pro    2026
//    node generar_licencia.js validar VENC-BSUP-XXXX-2026
//
//  Sin argumentos abre el menú interactivo.
//
// ============================================================

const { generarCodigo } = require('./core/licencia');
const crypto = require('crypto');

const SEMILLA = 'VencCom2026JhonyLorenzoPanama';
const PREFIJO = 'VENC';

function validarCodigo(codigo) {
    const partes = codigo.trim().toUpperCase().split('-');
    if (partes.length !== 4 || partes[0] !== PREFIJO) return { ok: false, plan: null };
    const [, cuerpo, firma, anio] = partes;
    const raw  = `${SEMILLA}-${cuerpo}-${anio}`;
    const hash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase();
    const ok   = firma === hash.slice(0, 4);
    const plan = ok ? (cuerpo.startsWith('P') ? 'Pro' : 'Básico') : null;
    return { ok, plan };
}

function linea() { console.log('─'.repeat(54)); }

// ─── Modo argumento directo ───────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === 'validar' && args[1]) {
    linea();
    console.log('  VALIDADOR DE CÓDIGO — Control de Vencimientos');
    linea();
    const codigo = args[1].toUpperCase();
    const { ok, plan } = validarCodigo(codigo);
    console.log(`  Código : ${codigo}`);
    console.log(`  Estado : ${ok ? '✔  VÁLIDO' : '✘  INVÁLIDO'}`);
    if (ok) console.log(`  Plan   : ${plan}`);
    linea();
    process.exit(0);
}

if (args[0] && args[0] !== 'menu') {
    const id   = args[0];
    const plan = args[1] || 'basico';
    const anio = args[2] ? parseInt(args[2]) : new Date().getFullYear();
    const code = generarCodigo(id, plan, anio);
    linea();
    console.log('  CÓDIGO GENERADO — Control de Vencimientos');
    linea();
    console.log(`  Cliente : ${id}`);
    console.log(`  Plan    : ${plan === 'pro' ? 'Pro ($400/año)' : 'Básico ($200/año)'}`);
    console.log(`  Año     : ${anio}`);
    console.log(`  Código  : ${code}`);
    linea();
    process.exit(0);
}

// ─── Modo menú interactivo ────────────────────────────────────
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function preguntar(texto) {
    return new Promise(resolve => rl.question(texto, resolve));
}

async function menuPrincipal() {
    console.clear();
    linea();
    console.log('    GENERADOR DE LICENCIAS — Control de Vencimientos');
    console.log('    Uso exclusivo de Jhony Lorenzo');
    linea();
    console.log('  1. Generar código Plan Básico  ($200/año)');
    console.log('  2. Generar código Plan Pro     ($400/año)');
    console.log('  3. Validar código existente');
    console.log('  4. Salir');
    linea();

    const opcion = await preguntar('  Seleccione opción (1-4): ');

    switch (opcion.trim()) {
        case '1': await opcionGenerar('basico'); break;
        case '2': await opcionGenerar('pro');    break;
        case '3': await opcionValidar();         break;
        case '4': rl.close(); process.exit(0);  break;
        default:
            console.log('\n  Opción inválida.');
            await esperar();
            await menuPrincipal();
    }
}

async function opcionGenerar(plan) {
    console.clear();
    linea();
    const planNombre = plan === 'pro' ? 'Plan Pro ($400/año)' : 'Plan Básico ($200/año)';
    console.log(`    GENERAR CÓDIGO — ${planNombre}`);
    linea();
    const id          = await preguntar('  Identificador del cliente (ej. SUPERM, FARM1): ');
    const anioDefault = new Date().getFullYear();
    const anioInput   = await preguntar(`  Año [${anioDefault}]: `);
    const anio        = anioInput.trim() ? parseInt(anioInput) : anioDefault;
    const code        = generarCodigo(id.trim(), plan, anio);

    console.log('\n' + '─'.repeat(54));
    console.log(`  ✔  CÓDIGO GENERADO EXITOSAMENTE`);
    console.log('─'.repeat(54));
    console.log(`\n     ${code}\n`);
    console.log('─'.repeat(54));
    console.log(`  Plan    : ${planNombre}`);
    console.log(`  Cliente : ${id.trim().toUpperCase()}`);
    console.log(`  Válido  : 365 días desde la activación`);
    console.log('\n  Comparte este código con el cliente.');

    await esperar('\n  Presione ENTER para volver al menú...');
    await menuPrincipal();
}

async function opcionValidar() {
    console.clear();
    linea();
    console.log('    VALIDAR CÓDIGO DE ACTIVACIÓN');
    linea();
    const codigo        = await preguntar('  Ingrese el código a validar: ');
    const { ok, plan }  = validarCodigo(codigo.trim());

    console.log('\n' + '─'.repeat(54));
    console.log(`  Código : ${codigo.trim().toUpperCase()}`);
    console.log(`  Estado : ${ok ? '✔  VÁLIDO' : '✘  INVÁLIDO'}`);
    if (ok) console.log(`  Plan   : ${plan}`);
    console.log('─'.repeat(54));

    await esperar('\n  Presione ENTER para volver al menú...');
    await menuPrincipal();
}

function esperar(msg = '') {
    return new Promise(resolve => rl.question(msg || '\n  Presione ENTER para continuar...', resolve));
}

menuPrincipal().catch(console.error);
