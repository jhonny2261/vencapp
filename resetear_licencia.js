// ============================================================
//  resetear_licencia.js
//  Uso: node resetear_licencia.js
//  Borra el archivo data/licencia.dat y reinicia el modo demo.
//  Útil para pruebas o para reasignar la licencia a un cliente.
// ============================================================

const fs   = require('fs');
const path = require('path');

const LIC_PATH = path.join(__dirname, 'data', 'licencia.dat');

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   Control de Vencimientos — Reset Lic.  ║');
console.log('╚══════════════════════════════════════════╝\n');

if (fs.existsSync(LIC_PATH)) {
    fs.unlinkSync(LIC_PATH);
    console.log('✅ Archivo de licencia eliminado:', LIC_PATH);
    console.log('   La próxima vez que inicie el sistema entrará en MODO DEMO (7 días).\n');
} else {
    console.log('ℹ️  No existe archivo de licencia. El sistema ya está en modo demo.\n');
}
