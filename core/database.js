// ============================================================
//  database.js — Gestión de base de datos SQLite embebida
//  Usa sql.js (puro JavaScript, sin compilar)
//  Control de Vencimientos
// ============================================================

const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');

// ── Detectar si corremos como .exe empaquetado con pkg ───────
// pkg empaqueta el código pero los archivos binarios (.wasm)
// deben estar junto al .exe en tiempo de ejecución.
// process.pkg existe cuando corremos dentro de un ejecutable pkg.
const APP_DIR  = process.pkg
    ? path.dirname(process.execPath)   // carpeta donde está el .exe
    : path.join(__dirname, '..');      // carpeta raíz del proyecto

const DATA_DIR = path.join(APP_DIR, 'data');
const DB_PATH  = path.join(DATA_DIR, 'vencimientos.db');

// Asegurar que la carpeta data exista
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db;  // instancia de sql.js Database

// ─── Guardar base de datos en disco ──────────────────────────
function guardarDB() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Ejecutar query sin retorno y guardar ────────────────────
function run(sql, params = []) {
    db.run(sql, params);
    guardarDB();
}

// ─── Obtener una fila ────────────────────────────────────────
function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

// ─── Obtener todas las filas ─────────────────────────────────
function all(sql, params = []) {
    const stmt    = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ─── Obtener lastInsertRowid ──────────────────────────────────
function lastId() {
    return get('SELECT last_insert_rowid() as id').id;
}

// ============================================================
//  Inicializar base de datos
// ============================================================
async function inicializarDB() {
    // Cuando corre como .exe, sql.js necesita encontrar el .wasm
    // junto al ejecutable (no dentro del paquete)
    const wasmPath = process.pkg
        ? path.join(path.dirname(process.execPath), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
        : null;

    const sqlConfig = wasmPath && fs.existsSync(wasmPath)
        ? { locateFile: () => wasmPath }
        : {};

    const SQL = await initSqlJs(sqlConfig);

    // Cargar base existente o crear nueva
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Crear tablas si no existen
    db.run(`
        CREATE TABLE IF NOT EXISTS productos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo          TEXT NOT NULL UNIQUE,
            descripcion     TEXT NOT NULL,
            precio          REAL DEFAULT 0,
            fecha_creacion  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_usuario  TEXT NOT NULL UNIQUE,
            nombre_completo TEXT NOT NULL,
            clave_hash      TEXT NOT NULL,
            rol             TEXT NOT NULL,
            activo          INTEGER NOT NULL DEFAULT 1,
            fecha_creacion  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS vencimientos (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_producto     TEXT NOT NULL,
            descripcion         TEXT,
            fecha_vencimiento   TEXT NOT NULL,
            cantidad_unidades   INTEGER NOT NULL DEFAULT 1,
            ubicacion_pasillo   TEXT,
            lote                TEXT,
            observaciones       TEXT,
            usuario_registro    TEXT NOT NULL,
            fecha_registro      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            estado              TEXT NOT NULL DEFAULT 'activo'
        );

        CREATE TABLE IF NOT EXISTS historial_retiros (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            id_vencimiento    INTEGER NOT NULL,
            codigo_producto   TEXT NOT NULL,
            descripcion       TEXT,
            fecha_retiro      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            motivo            TEXT NOT NULL,
            cantidad_retirada INTEGER NOT NULL DEFAULT 1,
            usuario_retiro    TEXT NOT NULL,
            observaciones     TEXT
        );

        CREATE TABLE IF NOT EXISTS configuracion_alertas (
            id                      INTEGER PRIMARY KEY DEFAULT 1,
            dias_alerta_critica     INTEGER NOT NULL DEFAULT 3,
            dias_alerta_advertencia INTEGER NOT NULL DEFAULT 7,
            dias_alerta_preventiva  INTEGER NOT NULL DEFAULT 15,
            notificaciones_activas  INTEGER NOT NULL DEFAULT 0,
            hora_notificacion       TEXT NOT NULL DEFAULT '08:00',
            twilio_account_sid      TEXT DEFAULT '',
            twilio_auth_token       TEXT DEFAULT '',
            twilio_from             TEXT DEFAULT '',
            notif_telefono          TEXT DEFAULT '',
            notif_canal             TEXT NOT NULL DEFAULT 'whatsapp'
        );
    `);

    // ── Migración: agregar columnas de Twilio si la tabla ya existía sin ellas
    const columnasNuevas = [
        "ALTER TABLE configuracion_alertas ADD COLUMN twilio_account_sid TEXT DEFAULT ''",
        "ALTER TABLE configuracion_alertas ADD COLUMN twilio_auth_token   TEXT DEFAULT ''",
        "ALTER TABLE configuracion_alertas ADD COLUMN twilio_from         TEXT DEFAULT ''",
        "ALTER TABLE configuracion_alertas ADD COLUMN notif_telefono      TEXT DEFAULT ''",
        "ALTER TABLE configuracion_alertas ADD COLUMN notif_canal         TEXT DEFAULT 'whatsapp'",
        "ALTER TABLE configuracion_alertas ADD COLUMN hora_notificacion   TEXT DEFAULT '08:00'",
        "ALTER TABLE configuracion_alertas ADD COLUMN notificaciones_activas INTEGER DEFAULT 0"
    ];
    for (const sql of columnasNuevas) {
        try { db.run(sql); } catch (e) { /* columna ya existe, ignorar */ }
    }

    guardarDB();
    _insertarDatosIniciales();
    console.log('[DB] Base de datos SQLite iniciada:', DB_PATH);
}

// ─── Datos iniciales ──────────────────────────────────────────
function _insertarDatosIniciales() {
    const config = get('SELECT COUNT(*) as cnt FROM configuracion_alertas');
    if (!config || config.cnt === 0) {
        run('INSERT INTO configuracion_alertas (dias_alerta_critica, dias_alerta_advertencia, dias_alerta_preventiva) VALUES (3, 7, 15)');
    }

    const usuarios = get('SELECT COUNT(*) as cnt FROM usuarios');
    if (!usuarios || usuarios.cnt === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        run('INSERT INTO usuarios (nombre_usuario, nombre_completo, clave_hash, rol) VALUES (?, ?, ?, ?)',
            ['admin', 'Administrador', hash, 'admin']);
        console.log('[DB] Usuario admin creado (contraseña: admin123)');
    }
}

// ============================================================
//  USUARIOS
// ============================================================

function buscarUsuario(nombre_usuario) {
    return get('SELECT * FROM usuarios WHERE nombre_usuario = ? AND activo = 1', [nombre_usuario]);
}

function verificarPassword(plaintext, hash) {
    return bcrypt.compareSync(plaintext, hash);
}

function listarUsuarios() {
    return all('SELECT id, nombre_usuario, nombre_completo, rol, activo, fecha_creacion FROM usuarios ORDER BY nombre_completo');
}

function crearUsuario({ nombre_usuario, nombre_completo, clave, rol }) {
    const hash = bcrypt.hashSync(clave, 10);
    run('INSERT INTO usuarios (nombre_usuario, nombre_completo, clave_hash, rol) VALUES (?, ?, ?, ?)',
        [nombre_usuario, nombre_completo, hash, rol]);
    return lastId();
}

function cambiarPassword(nombre_usuario, nueva_clave) {
    const hash = bcrypt.hashSync(nueva_clave, 10);
    run('UPDATE usuarios SET clave_hash = ? WHERE nombre_usuario = ?', [hash, nombre_usuario]);
}

function toggleUsuario(id, activo) {
    run('UPDATE usuarios SET activo = ? WHERE id = ?', [activo, id]);
}

// ============================================================
//  VENCIMIENTOS
// ============================================================

function registrarVencimiento({ codigo_producto, descripcion, fecha_vencimiento, cantidad_unidades, ubicacion_pasillo, lote, observaciones, usuario_registro }) {
    run(`INSERT INTO vencimientos
            (codigo_producto, descripcion, fecha_vencimiento, cantidad_unidades, ubicacion_pasillo, lote, observaciones, usuario_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [codigo_producto, descripcion || '', fecha_vencimiento, cantidad_unidades || 1,
         ubicacion_pasillo || '', lote || '', observaciones || '', usuario_registro]);
    return { lastInsertRowid: lastId() };
}

function listarVencimientos({ estado, codigo, desde, hasta } = {}) {
    let sql    = 'SELECT * FROM vencimientos WHERE 1=1';
    const params = [];
    if (estado) { sql += ' AND estado = ?';                params.push(estado); }
    if (codigo) { sql += ' AND codigo_producto LIKE ?';    params.push(`%${codigo}%`); }
    if (desde)  { sql += ' AND fecha_vencimiento >= ?';    params.push(desde); }
    if (hasta)  { sql += ' AND fecha_vencimiento <= ?';    params.push(hasta); }
    sql += ' ORDER BY fecha_vencimiento ASC';
    return all(sql, params);
}

function obtenerDashboard() {
    const config = obtenerConfigAlertas();
    const hoy    = new Date().toISOString().split('T')[0];

    return get(`
        SELECT
            SUM(CASE WHEN estado='activo' AND julianday(fecha_vencimiento) - julianday(?) <= ? AND julianday(fecha_vencimiento) - julianday(?) >= 0 THEN 1 ELSE 0 END) AS criticos,
            SUM(CASE WHEN estado='activo' AND julianday(fecha_vencimiento) - julianday(?) <= ? AND julianday(fecha_vencimiento) - julianday(?) > ? THEN 1 ELSE 0 END) AS advertencia,
            SUM(CASE WHEN estado='activo' AND julianday(fecha_vencimiento) - julianday(?) <= ? AND julianday(fecha_vencimiento) - julianday(?) > ? THEN 1 ELSE 0 END) AS preventivos,
            SUM(CASE WHEN estado='activo' AND julianday(fecha_vencimiento) - julianday(?) < 0 THEN 1 ELSE 0 END) AS vencidos
        FROM vencimientos
    `, [
        hoy, config.dias_alerta_critica, hoy,
        hoy, config.dias_alerta_advertencia, hoy, config.dias_alerta_critica,
        hoy, config.dias_alerta_preventiva,  hoy, config.dias_alerta_advertencia,
        hoy
    ]);
}

function actualizarEstadoVencimiento(id, estado) {
    run('UPDATE vencimientos SET estado = ? WHERE id = ?', [estado, id]);
}

// ============================================================
//  HISTORIAL DE RETIROS
// ============================================================

function registrarRetiro({ id_vencimiento, codigo_producto, descripcion, motivo, cantidad_retirada, usuario_retiro, observaciones }) {
    actualizarEstadoVencimiento(id_vencimiento, 'retirado');
    run(`INSERT INTO historial_retiros
            (id_vencimiento, codigo_producto, descripcion, motivo, cantidad_retirada, usuario_retiro, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id_vencimiento, codigo_producto, descripcion || '', motivo,
         cantidad_retirada || 1, usuario_retiro, observaciones || '']);
    return { lastInsertRowid: lastId() };
}

function listarHistorial({ desde, hasta, codigo } = {}) {
    let sql    = 'SELECT * FROM historial_retiros WHERE 1=1';
    const params = [];
    if (desde)  { sql += ' AND date(fecha_retiro) >= ?';  params.push(desde); }
    if (hasta)  { sql += ' AND date(fecha_retiro) <= ?';  params.push(hasta); }
    if (codigo) { sql += ' AND codigo_producto LIKE ?';   params.push(`%${codigo}%`); }
    sql += ' ORDER BY fecha_retiro DESC';
    return all(sql, params);
}

// ============================================================
//  CONFIGURACIÓN DE ALERTAS
// ============================================================

function obtenerConfigAlertas() {
    return get('SELECT * FROM configuracion_alertas WHERE id = 1') ||
           { dias_alerta_critica: 3, dias_alerta_advertencia: 7, dias_alerta_preventiva: 15 };
}

function actualizarConfigAlertas({ dias_alerta_critica, dias_alerta_advertencia, dias_alerta_preventiva,
    notificaciones_activas, hora_notificacion,
    twilio_account_sid, twilio_auth_token, twilio_from, notif_telefono, notif_canal }) {
    // INSERT OR REPLACE garantiza que siempre haya una fila con id=1
    run(`INSERT OR REPLACE INTO configuracion_alertas
            (id, dias_alerta_critica, dias_alerta_advertencia, dias_alerta_preventiva,
             notificaciones_activas, hora_notificacion,
             twilio_account_sid, twilio_auth_token, twilio_from, notif_telefono, notif_canal)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            dias_alerta_critica     !== undefined ? parseInt(dias_alerta_critica)     : 3,
            dias_alerta_advertencia !== undefined ? parseInt(dias_alerta_advertencia) : 7,
            dias_alerta_preventiva  !== undefined ? parseInt(dias_alerta_preventiva)  : 15,
            notificaciones_activas  !== undefined ? (notificaciones_activas ? 1 : 0)  : 0,
            hora_notificacion || '08:00',
            twilio_account_sid || '', twilio_auth_token || '', twilio_from || '',
            notif_telefono || '', notif_canal || 'whatsapp'
        ]
    );
}

// ============================================================
//  PRODUCTOS
// ============================================================

function buscarProducto(codigo) {
    return get('SELECT * FROM productos WHERE codigo = ?', [codigo]);
}

function buscarProductos(texto) {
    return all(
        'SELECT * FROM productos WHERE codigo LIKE ? OR descripcion LIKE ? ORDER BY descripcion LIMIT 50',
        [`%${texto}%`, `%${texto}%`]
    );
}

function listarProductos() {
    return all('SELECT * FROM productos ORDER BY descripcion');
}

function crearProducto({ codigo, descripcion, precio }) {
    run('INSERT INTO productos (codigo, descripcion, precio) VALUES (?, ?, ?)',
        [codigo.trim().toUpperCase(), descripcion.trim(), precio || 0]);
    return { lastInsertRowid: lastId() };
}

function actualizarProducto({ codigo, descripcion, precio }) {
    run('UPDATE productos SET descripcion = ?, precio = ? WHERE codigo = ?',
        [descripcion.trim(), precio || 0, codigo.trim().toUpperCase()]);
}

function eliminarProducto(codigo) {
    run('DELETE FROM productos WHERE codigo = ?', [codigo]);
}

function importarProductos(lista) {
    // lista = [{ codigo, descripcion, precio }, ...]
    let insertados = 0, omitidos = 0;
    for (const p of lista) {
        try {
            const existe = buscarProducto(p.codigo?.trim().toUpperCase());
            if (!existe) {
                run('INSERT INTO productos (codigo, descripcion, precio) VALUES (?, ?, ?)',
                    [p.codigo.trim().toUpperCase(), p.descripcion?.trim() || '', parseFloat(p.precio) || 0]);
                insertados++;
            } else {
                omitidos++;
            }
        } catch { omitidos++; }
    }
    return { insertados, omitidos };
}

// ============================================================
//  Exportar
// ============================================================
module.exports = {
    inicializarDB,
    // Usuarios
    buscarUsuario, verificarPassword, listarUsuarios,
    crearUsuario, cambiarPassword, toggleUsuario,
    // Productos
    buscarProducto, buscarProductos, listarProductos,
    crearProducto, actualizarProducto, eliminarProducto, importarProductos,
    // Vencimientos
    registrarVencimiento, listarVencimientos,
    obtenerDashboard, actualizarEstadoVencimiento,
    // Historial
    registrarRetiro, listarHistorial,
    // Configuración
    obtenerConfigAlertas, actualizarConfigAlertas
};
