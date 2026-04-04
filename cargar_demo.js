// ============================================================
//  cargar_demo.js — Carga productos y vencimientos de ejemplo
//  Ejecutar una sola vez: node cargar_demo.js
// ============================================================

const path = require('path');
const fs   = require('fs');

// Apuntar a la base de datos
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SQL    = require('sql.js');
const DB_PATH = path.join(DATA_DIR, 'vencimientos.db');

async function main() {
    const sqlWasm = fs.readFileSync(path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
    const SQL_     = await SQL({ wasmBinary: sqlWasm });

    let db;
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL_.Database(fileBuffer);
        console.log('[Demo] Base de datos existente cargada.');
    } else {
        db = new SQL_.Database();
        console.log('[Demo] Base de datos nueva creada.');
    }

    const save = () => {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    };

    // ─── PRODUCTOS ───────────────────────────────────────────
    const productos = [
        { codigo: '7590001001001', descripcion: 'Leche Entera 1L',               precio: 2.50 },
        { codigo: '7590001001002', descripcion: 'Leche Descremada 1L',            precio: 2.60 },
        { codigo: '7590001002001', descripcion: 'Yogur Natural 200g',             precio: 1.20 },
        { codigo: '7590001002002', descripcion: 'Yogur de Fresa 200g',            precio: 1.30 },
        { codigo: '7590001003001', descripcion: 'Queso Blanco 500g',              precio: 4.50 },
        { codigo: '7590001004001', descripcion: 'Mantequilla 250g',               precio: 3.80 },
        { codigo: '7590002001001', descripcion: 'Jamón de Pierna Rebanado 200g',  precio: 3.20 },
        { codigo: '7590002001002', descripcion: 'Mortadela Rebanada 200g',        precio: 2.10 },
        { codigo: '7590002002001', descripcion: 'Pollo Entero 1.5kg',             precio: 6.00 },
        { codigo: '7590002002002', descripcion: 'Pechuga de Pollo 500g',          precio: 4.20 },
        { codigo: '7590003001001', descripcion: 'Pan de Sándwich Blanco',         precio: 1.80 },
        { codigo: '7590003001002', descripcion: 'Pan de Sándwich Integral',       precio: 2.00 },
        { codigo: '7590003002001', descripcion: 'Galletas de Soda x12',           precio: 1.10 },
        { codigo: '7590004001001', descripcion: 'Jugo de Naranja 1L',             precio: 2.20 },
        { codigo: '7590004001002', descripcion: 'Jugo de Mango 1L',               precio: 2.20 },
        { codigo: '7590004002001', descripcion: 'Refresco Cola 2L',               precio: 1.50 },
        { codigo: '7590005001001', descripcion: 'Mayonesa 400g',                  precio: 2.80 },
        { codigo: '7590005001002', descripcion: 'Ketchup 400g',                   precio: 2.50 },
        { codigo: '7590005002001', descripcion: 'Salsa de Tomate 200g',           precio: 1.40 },
        { codigo: '7590006001001', descripcion: 'Margarina 500g',                 precio: 3.10 },
        { codigo: '7590006002001', descripcion: 'Aceite Vegetal 1L',              precio: 3.50 },
        { codigo: '7590007001001', descripcion: 'Atún en Lata 140g',              precio: 1.90 },
        { codigo: '7590007001002', descripcion: 'Sardinas en Lata 125g',          precio: 1.60 },
        { codigo: '7590008001001', descripcion: 'Cereal de Maíz 500g',            precio: 3.40 },
        { codigo: '7590008001002', descripcion: 'Avena en Hojuelas 400g',         precio: 2.70 },
        { codigo: '7590009001001', descripcion: 'Helado de Vainilla 1L',          precio: 4.80 },
        { codigo: '7590009001002', descripcion: 'Helado de Chocolate 1L',         precio: 4.80 },
        { codigo: '7590010001001', descripcion: 'Crema de Leche 200ml',           precio: 2.30 },
        { codigo: '7590010002001', descripcion: 'Huevos de Gallina x12',          precio: 3.00 },
        { codigo: '7590010003001', descripcion: 'Tofu Firme 300g',                precio: 2.90 },
    ];

    console.log('\n[Demo] Insertando productos...');
    let insertados = 0, omitidos = 0;
    for (const p of productos) {
        try {
            db.run(
                'INSERT INTO productos (codigo, descripcion, precio) VALUES (?, ?, ?)',
                [p.codigo, p.descripcion, p.precio]
            );
            insertados++;
        } catch (e) {
            omitidos++; // Ya existe
        }
    }
    console.log(`  ✔ ${insertados} productos insertados, ${omitidos} ya existían.`);

    // ─── VENCIMIENTOS ────────────────────────────────────────
    // Calcular fechas relativas a hoy
    const hoy = new Date();
    const fecha = (dias) => {
        const d = new Date(hoy);
        d.setDate(d.getDate() + dias);
        return d.toISOString().split('T')[0];
    };

    // Distribuir alertas: críticas (<=3 días), advertencia (4-7 días), preventiva (8-15 días), normales (>15 días)
    const vencimientos = [
        // ── CRÍTICAS (vencen en 1-3 días) ──
        { codigo: '7590001001001', fecha: fecha(1),  cantidad: 8,  pasillo: 'A-1', lote: 'L2024-01', obs: 'Revisar urgente' },
        { codigo: '7590002002001', fecha: fecha(2),  cantidad: 3,  pasillo: 'C-2', lote: 'L2024-02', obs: '' },
        { codigo: '7590001002001', fecha: fecha(2),  cantidad: 12, pasillo: 'A-2', lote: 'L2024-03', obs: 'Temperatura controlada' },
        { codigo: '7590003001001', fecha: fecha(3),  cantidad: 5,  pasillo: 'D-1', lote: 'L2024-04', obs: '' },
        { codigo: '7590009001001', fecha: fecha(1),  cantidad: 4,  pasillo: 'F-3', lote: 'L2024-05', obs: 'Congelado' },

        // ── ADVERTENCIA (vencen en 4-7 días) ──
        { codigo: '7590001001002', fecha: fecha(5),  cantidad: 15, pasillo: 'A-1', lote: 'L2024-06', obs: '' },
        { codigo: '7590002001001', fecha: fecha(4),  cantidad: 6,  pasillo: 'B-1', lote: 'L2024-07', obs: '' },
        { codigo: '7590001003001', fecha: fecha(6),  cantidad: 7,  pasillo: 'A-3', lote: 'L2024-08', obs: '' },
        { codigo: '7590004001001', fecha: fecha(7),  cantidad: 20, pasillo: 'E-1', lote: 'L2024-09', obs: '' },
        { codigo: '7590002002002', fecha: fecha(5),  cantidad: 4,  pasillo: 'C-1', lote: 'L2024-10', obs: 'Refrigerado' },
        { codigo: '7590010002001', fecha: fecha(6),  cantidad: 24, pasillo: 'A-4', lote: 'L2024-11', obs: '' },

        // ── PREVENTIVA (vencen en 8-15 días) ──
        { codigo: '7590001002002', fecha: fecha(10), cantidad: 18, pasillo: 'A-2', lote: 'L2024-12', obs: '' },
        { codigo: '7590001004001', fecha: fecha(12), cantidad: 9,  pasillo: 'A-3', lote: 'L2024-13', obs: '' },
        { codigo: '7590002001002', fecha: fecha(9),  cantidad: 8,  pasillo: 'B-1', lote: 'L2024-14', obs: '' },
        { codigo: '7590003001002', fecha: fecha(14), cantidad: 10, pasillo: 'D-1', lote: 'L2024-15', obs: '' },
        { codigo: '7590004001002', fecha: fecha(11), cantidad: 14, pasillo: 'E-1', lote: 'L2024-16', obs: '' },
        { codigo: '7590005001001', fecha: fecha(13), cantidad: 6,  pasillo: 'E-2', lote: 'L2024-17', obs: '' },
        { codigo: '7590009001002', fecha: fecha(10), cantidad: 3,  pasillo: 'F-3', lote: 'L2024-18', obs: 'Congelado' },

        // ── NORMALES (vencen en 20-90 días) ──
        { codigo: '7590004002001', fecha: fecha(45), cantidad: 30, pasillo: 'E-3', lote: 'L2024-19', obs: '' },
        { codigo: '7590005001002', fecha: fecha(30), cantidad: 12, pasillo: 'E-2', lote: 'L2024-20', obs: '' },
        { codigo: '7590005002001', fecha: fecha(60), cantidad: 24, pasillo: 'E-2', lote: 'L2024-21', obs: '' },
        { codigo: '7590006001001', fecha: fecha(25), cantidad: 8,  pasillo: 'E-4', lote: 'L2024-22', obs: '' },
        { codigo: '7590006002001', fecha: fecha(90), cantidad: 15, pasillo: 'E-4', lote: 'L2024-23', obs: '' },
        { codigo: '7590007001001', fecha: fecha(180),cantidad: 40, pasillo: 'G-1', lote: 'L2024-24', obs: '' },
        { codigo: '7590007001002', fecha: fecha(180),cantidad: 35, pasillo: 'G-1', lote: 'L2024-25', obs: '' },
        { codigo: '7590008001001', fecha: fecha(120),cantidad: 20, pasillo: 'G-2', lote: 'L2024-26', obs: '' },
        { codigo: '7590008001002', fecha: fecha(90), cantidad: 18, pasillo: 'G-2', lote: 'L2024-27', obs: '' },
        { codigo: '7590003002001', fecha: fecha(60), cantidad: 24, pasillo: 'D-2', lote: 'L2024-28', obs: '' },
        { codigo: '7590010001001', fecha: fecha(30), cantidad: 10, pasillo: 'A-4', lote: 'L2024-29', obs: 'Refrigerado' },
        { codigo: '7590010003001', fecha: fecha(20), cantidad: 6,  pasillo: 'B-2', lote: 'L2024-30', obs: 'Refrigerado' },
    ];

    console.log('[Demo] Insertando vencimientos...');
    let vInsertados = 0;
    for (const v of vencimientos) {
        try {
            db.run(
                `INSERT INTO vencimientos
                 (codigo_producto, descripcion, fecha_vencimiento, cantidad_unidades, ubicacion_pasillo, lote, observaciones, usuario_registro, estado)
                 VALUES (?, (SELECT descripcion FROM productos WHERE codigo = ?), ?, ?, ?, ?, ?, 'admin', 'activo')`,
                [v.codigo, v.codigo, v.fecha, v.cantidad, v.pasillo, v.lote, v.obs]
            );
            vInsertados++;
        } catch (e) {
            console.warn(`  ⚠ Error en ${v.codigo}:`, e.message);
        }
    }
    console.log(`  ✔ ${vInsertados} vencimientos insertados.`);

    save();
    console.log('\n[Demo] ¡Base de datos guardada exitosamente!');
    console.log(`  Ruta: ${DB_PATH}`);
    console.log('\n  Resumen de alertas cargadas:');
    console.log('  🔴 Críticas  (1-3 días):   5 registros');
    console.log('  🟡 Advertencia (4-7 días): 6 registros');
    console.log('  🔵 Preventiva (8-15 días): 8 registros');
    console.log('  ✅ Normales  (>15 días):   11 registros');
    console.log('\n  Total: 30 vencimientos con 30 productos.\n');

    db.close();
}

main().catch(err => {
    console.error('[Demo] Error:', err.message);
    process.exit(1);
});
