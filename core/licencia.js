// ============================================================
//  licencia.js — Sistema de demo y activación de licencia
//  Control de Vencimientos — v2.0
//  Planes: basico ($200/año) | pro ($400/año)
//
//  PROTECCIÓN ANTI-COPIA (doble candado):
//  1. Huella de hardware: número de serie del disco duro
//  2. Archivo oculto del sistema: C:\ProgramData\VencCom\
//     Si cualquiera de los dos falla → licencia inválida
// ============================================================

const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

// ─── Configuración ───────────────────────────────────────────
const SEMILLA       = 'VencCom2026JhonyLorenzoPanama';  // ⚠️ NO cambiar después de distribuir
const PREFIJO       = 'VENC';
const DIAS_DEMO     = 7;
const DIAS_LICENCIA = 365;
const PREFIJO_BASICO = 'B';
const PREFIJO_PRO    = 'P';

// Carpeta oculta del sistema (fuera de la carpeta de la app)
const OCULTO_DIR  = path.join('C:\\ProgramData', 'VencCom');
const OCULTO_PATH = path.join(OCULTO_DIR, 'vc.dat');

// Detectar si corremos como .exe empaquetado con pkg
const APP_DIR  = process.pkg
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..');

const DATA_DIR = path.join(APP_DIR, 'data');
const LIC_PATH = path.join(DATA_DIR, 'licencia.dat');

// Asegurar carpeta data
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Cifrado simple (Base64) ─────────────────────────────────
function _cifrar(datos) {
    return Buffer.from(JSON.stringify(datos), 'utf8').toString('base64');
}
function _descifrar(enc) {
    return JSON.parse(Buffer.from(enc, 'base64').toString('utf8'));
}

// ─── Lectura/escritura del archivo principal ─────────────────
function _leerEstado() {
    if (!fs.existsSync(LIC_PATH)) return null;
    try { return _descifrar(fs.readFileSync(LIC_PATH, 'utf8').trim()); }
    catch { return null; }
}
function _guardarEstado(estado) {
    fs.writeFileSync(LIC_PATH, _cifrar(estado), 'utf8');
}

// ─── Archivo oculto del sistema ───────────────────────────────
function _guardarOculto(estado) {
    try {
        if (!fs.existsSync(OCULTO_DIR)) {
            fs.mkdirSync(OCULTO_DIR, { recursive: true });
        }
        fs.writeFileSync(OCULTO_PATH, _cifrar(estado), 'utf8');
        // Marcar como oculto en Windows
        try { execSync(`attrib +H +S "${OCULTO_PATH}"`, { stdio: 'ignore' }); } catch {}
    } catch { /* si no se puede escribir (Linux/dev) lo ignoramos */ }
}

function _leerOculto() {
    try {
        if (!fs.existsSync(OCULTO_PATH)) return null;
        return _descifrar(fs.readFileSync(OCULTO_PATH, 'utf8').trim());
    } catch { return null; }
}

function _borrarOculto() {
    try {
        if (fs.existsSync(OCULTO_PATH)) fs.unlinkSync(OCULTO_PATH);
    } catch {}
}

// ─── Huella de hardware ───────────────────────────────────────
// Lee el número de serie del disco C: usando WMIC (solo Windows)
// En Linux/dev devuelve un valor fijo para no romper el desarrollo
function _obtenerHuella() {
    try {
        // Solo en Windows
        if (process.platform !== 'win32') return 'DEV-NOHARDWARE';
        const out = execSync('wmic diskdrive get SerialNumber', { stdio: ['pipe','pipe','pipe'] })
            .toString().replace(/\s+/g, ' ').trim();
        // Tomar primeras líneas relevantes y hashear
        const raw = `${SEMILLA}-HW-${out}`;
        return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
    } catch {
        // Si WMIC falla (algunos Windows lo tienen desactivado) usar nombre del equipo
        try {
            const host = execSync('hostname', { stdio: ['pipe','pipe','pipe'] }).toString().trim();
            const raw  = `${SEMILLA}-HOST-${host}`;
            return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
        } catch {
            return 'NOHARDWARE';
        }
    }
}

// ─── Verificar doble candado ──────────────────────────────────
// Devuelve true si la licencia activa corresponde a esta máquina
function _verificarCandado(estado) {
    // En modo demo no aplica el candado
    if (!estado || estado.tipo !== 'activa') return true;
    // Si la licencia no tiene huella (licencias antiguas) la dejamos pasar
    // pero la actualizamos en la próxima activación
    if (!estado.huella) return true;

    const huellaActual = _obtenerHuella();

    // Candado 1: hardware
    if (estado.huella !== huellaActual) {
        console.warn('[Licencia] Huella de hardware no coincide. Posible copia ilegal.');
        return false;
    }

    // Candado 2: archivo oculto del sistema
    // En Linux/dev lo saltamos
    if (process.platform !== 'win32') return true;

    const oculto = _leerOculto();
    if (!oculto || oculto.huella !== estado.huella || oculto.codigo !== estado.codigo) {
        console.warn('[Licencia] Archivo de sistema no encontrado o inválido. Posible copia ilegal.');
        return false;
    }

    return true;
}

// ─── Generación de firma del código ──────────────────────────
function _generarFirma(cuerpo, anio) {
    const raw = `${SEMILLA}-${cuerpo}-${anio}`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase().slice(0, 8);
}

// ─── Detectar plan desde el cuerpo del código ────────────────
function _detectarPlan(cuerpo) {
    return cuerpo.startsWith(PREFIJO_PRO) ? 'pro' : 'basico';
}

// ─── Validación del código ────────────────────────────────────
function _validarCodigo(codigo) {
    const partes = codigo.trim().toUpperCase().split('-');
    if (partes.length !== 4 || partes[0] !== PREFIJO) return false;
    const [, cuerpo, firma, anio] = partes;
    return firma === _generarFirma(cuerpo, anio).slice(0, 4);
}

// ─── Helpers de fecha ────────────────────────────────────────
function _hoy() { return new Date().toISOString().split('T')[0]; }

function _sumarDias(fechaISO, dias) {
    const d = new Date(fechaISO);
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function _diasRestantes(fechaISO) {
    return Math.floor((new Date(fechaISO) - new Date(_hoy())) / (1000 * 60 * 60 * 24));
}

function _formatFecha(fechaISO) {
    const [y, m, d] = fechaISO.split('-');
    return `${d}/${m}/${y}`;
}

function _nombrePlan(plan) {
    return plan === 'pro' ? 'Plan Pro' : 'Plan Básico';
}

// ============================================================
//  verificarLicencia() — función principal
// ============================================================
function verificarLicencia() {
    let estado = _leerEstado();

    // Primera vez: crear demo limpio
    if (!estado) {
        const hoy   = _hoy();
        const vence = _sumarDias(hoy, DIAS_DEMO);
        estado = { tipo: 'demo', plan: 'basico', instalado: hoy,
                   vence, activado: null, codigo: null, huella: null };
        _guardarEstado(estado);
    }

    if (!estado.plan) estado.plan = 'basico';

    const dias       = _diasRestantes(estado.vence);
    const plan       = estado.plan;
    const planNombre = _nombrePlan(plan);

    if (estado.tipo === 'activa') {
        // Verificar doble candado
        if (!_verificarCandado(estado)) {
            return {
                estado:         'invalida',
                plan:           'basico',
                plan_nombre:    'Sin licencia',
                dias_restantes: 0,
                fecha_vence:    '',
                mensaje:        'Licencia inválida en este equipo. Contáctese con su proveedor.'
            };
        }

        if (dias >= 0) {
            return {
                estado: 'activa', plan, plan_nombre: planNombre,
                dias_restantes: dias, fecha_vence: _formatFecha(estado.vence),
                mensaje: `${planNombre} · Licencia activa · vence el ${_formatFecha(estado.vence)}`
            };
        } else {
            return {
                estado: 'vencida', plan, plan_nombre: planNombre,
                dias_restantes: dias, fecha_vence: _formatFecha(estado.vence),
                mensaje: `Licencia vencida el ${_formatFecha(estado.vence)} · Contáctenos para renovar`
            };
        }
    }

    // Demo
    if (dias >= 0) {
        return {
            estado: 'demo', plan: 'basico', plan_nombre: 'Demo (Plan Básico)',
            dias_restantes: dias, fecha_vence: _formatFecha(estado.vence),
            mensaje: `Demo · ${dias} día(s) restante(s) · vence el ${_formatFecha(estado.vence)}`
        };
    } else {
        return {
            estado: 'vencida', plan: 'basico', plan_nombre: 'Demo vencido',
            dias_restantes: dias, fecha_vence: _formatFecha(estado.vence),
            mensaje: `Período demo vencido el ${_formatFecha(estado.vence)} · Ingrese su código de activación`
        };
    }
}

// ============================================================
//  activarLicencia(codigo) — graba huella + archivo oculto
// ============================================================
function activarLicencia(codigo) {
    codigo = (codigo || '').trim().toUpperCase();

    if (!codigo) return { ok: false, mensaje: 'Ingrese un código de activación.' };

    const partes = codigo.split('-');
    if (partes.length !== 4 || partes[0] !== PREFIJO) {
        return { ok: false, mensaje: `Formato inválido. Debe ser: ${PREFIJO}-XXXX-XXXX-XXXX` };
    }
    if (!_validarCodigo(codigo)) {
        return { ok: false, mensaje: 'Código de activación inválido. Verifique el código e intente nuevamente.' };
    }

    const cuerpo = partes[1];
    const plan   = _detectarPlan(cuerpo);
    const hoy    = _hoy();
    const vence  = _sumarDias(hoy, DIAS_LICENCIA);
    const huella = _obtenerHuella();   // ← captura huella de esta PC

    const nuevoEstado = {
        ..._leerEstado(),
        tipo:     'activa',
        plan,
        activado: hoy,
        vence,
        codigo,
        huella             // ← se guarda en licencia.dat
    };

    // Candado 1: guardar en carpeta de la app
    _guardarEstado(nuevoEstado);

    // Candado 2: guardar archivo oculto del sistema
    _guardarOculto({ huella, codigo, plan, activado: hoy });

    console.log(`[Licencia] Activada. Plan: ${plan} | Huella: ${huella}`);

    return {
        ok: true, plan, plan_nombre: _nombrePlan(plan),
        mensaje: `¡Activación exitosa! ${_nombrePlan(plan)} · Licencia válida hasta el ${_formatFecha(vence)}.`,
        fecha_vence: _formatFecha(vence)
    };
}

// ============================================================
//  generarCodigo() — solo para uso de Jhony
// ============================================================
function generarCodigo(identificador, plan, anio) {
    anio = anio || new Date().getFullYear();
    plan = (plan || 'basico').toLowerCase().trim();
    const prefijoP = plan === 'pro' ? PREFIJO_PRO : PREFIJO_BASICO;
    const idClean  = identificador.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
    const cuerpo   = `${prefijoP}${idClean}`;
    const anioStr  = String(anio);
    const firma    = _generarFirma(cuerpo, anioStr).slice(0, 4);
    return `${PREFIJO}-${cuerpo}-${firma}-${anioStr}`;
}

// ============================================================
//  resetearLicencia() — borra ambos archivos
// ============================================================
function resetearLicencia() {
    try {
        if (fs.existsSync(LIC_PATH)) fs.unlinkSync(LIC_PATH);
        _borrarOculto();
        const nueva = verificarLicencia();
        return {
            ok: true,
            mensaje: `Licencia reseteada. Demo activo por ${nueva.dias_restantes} días (vence ${nueva.fecha_vence}).`,
            licencia: nueva
        };
    } catch (err) {
        return { ok: false, mensaje: `Error al resetear: ${err.message}` };
    }
}

module.exports = { verificarLicencia, activarLicencia, generarCodigo, resetearLicencia };
