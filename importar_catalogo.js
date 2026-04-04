// ============================================================
//  importar_catalogo.js — Importa bdFull.csv a la base de datos
//  Ejecutar: node importar_catalogo.js
// ============================================================

const path = require('path');
const fs   = require('fs');

const DATA_DIR  = path.join(__dirname, 'data');
const DB_PATH   = path.join(DATA_DIR, 'vencimientos.db');
const CSV_PATH  = path.join(__dirname, 'bdFull.csv');

if (!fs.existsSync(CSV_PATH)) {
    console.error('[Error] No se encontró bdFull.csv en la carpeta.');
    process.exit(1);
}

async function main() {
    const SQL      = require('sql.js');
    const sqlWasm  = fs.readFileSync(path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
    const SQL_     = await SQL({ wasmBinary: sqlWasm });

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    let db;
    if (fs.existsSync(DB_PATH)) {
        db = new SQL_.Database(fs.readFileSync(DB_PATH));
        console.log('[OK] Base de datos existente cargada.');
    } else {
        db = new SQL_.Database();
        db.run(`CREATE TABLE IF NOT EXISTS productos (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo         TEXT NOT NULL UNIQUE,
            descripcion    TEXT NOT NULL,
            precio         REAL DEFAULT 0,
            fecha_creacion TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`);
        console.log('[OK] Base de datos nueva creada.');
    }

    // Leer CSV
    const contenido = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, ''); // quitar BOM
    const lineas    = contenido.split('\n').filter(l => l.trim() !== '');

    console.log(`[Info] Total de líneas en CSV: ${lineas.length}`);
    console.log('[Info] Importando productos...\n');

    let insertados = 0;
    let omitidos   = 0;
    let errores    = 0;

    // Usar transacción para mayor velocidad
    db.run('BEGIN TRANSACTION');

    for (const linea of lineas) {
        const partes = linea.split(';');
        if (partes.length < 2) continue;

        const codigo      = partes[0].trim();
        const descripcion = partes[1].trim();
        const precio      = parseFloat((partes[2] || '0').trim().replace(',', '.')) || 0;

        if (!codigo || !descripcion) continue;

        try {
            db.run(
                'INSERT OR IGNORE INTO productos (codigo, descripcion, precio) VALUES (?, ?, ?)',
                [codigo, descripcion, precio]
            );
            // Verificar si se insertó
            const cambios = db.exec('SELECT changes()');
            if (cambios[0] && cambios[0].values[0][0] > 0) {
                insertados++;
            } else {
                omitidos++;
            }
        } catch (e) {
            errores++;
        }
    }

    db.run('COMMIT');

    // Guardar
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    db.close();

    console.log('═══════════════════════════════════════');
    console.log('  IMPORTACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════');
    console.log(`  ✔ Insertados:  ${insertados}`);
    console.log(`  ○ Ya existían: ${omitidos}`);
    console.log(`  ✗ Errores:     ${errores}`);
    console.log(`  Base de datos: ${DB_PATH}`);
    console.log('═══════════════════════════════════════\n');
}

main().catch(err => {
    console.error('[Error]', err.message);
    process.exit(1);
});
