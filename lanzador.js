// ============================================================
//  lanzador.js — Inicia el servidor y abre el navegador
//  Se empaqueta como AbrirSistema.exe
// ============================================================

const { spawn, exec } = require('child_process');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const https = require('https');

const PUERTO = 3002;
const SERVER = path.join(path.dirname(process.execPath), 'ControlVencimientos.exe');

// Detectar la IP local de la máquina (primera IPv4 no-loopback)
function obtenerIPLocal() {
    const interfaces = os.networkInterfaces();
    for (const nombre of Object.keys(interfaces)) {
        for (const iface of interfaces[nombre]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost'; // fallback si no se detecta ninguna IP
}

const IP  = obtenerIPLocal();
const URL = `https://${IP}:${PUERTO}`;

// Verificar si el servidor ya está respondiendo
function servidorActivo(callback) {
    const req = https.get({ hostname: 'localhost', port: PUERTO, path: '/', rejectUnauthorized: false }, (res) => {
        callback(true);
    });
    req.on('error', () => callback(false));
    req.setTimeout(1500, () => { req.destroy(); callback(false); });
}

// Abrir el navegador
function abrirNavegador() {
    exec(`start "" "${URL}"`);
}

// Esperar hasta que el servidor responda
function esperarServidor(intentos, callback) {
    if (intentos <= 0) { callback(false); return; }
    servidorActivo((activo) => {
        if (activo) {
            callback(true);
        } else {
            setTimeout(() => esperarServidor(intentos - 1, callback), 1000);
        }
    });
}

// Iniciar
servidorActivo((activo) => {
    if (activo) {
        // Ya estaba corriendo, solo abre el navegador
        abrirNavegador();
    } else {
        // Iniciar el servidor en segundo plano sin ventana
        const srv = spawn(SERVER, [], {
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        });
        srv.unref();

        // Esperar hasta 15 segundos que responda
        esperarServidor(15, (listo) => {
            if (listo) {
                abrirNavegador();
            } else {
                // Si tardó mucho igual abrimos el navegador
                abrirNavegador();
            }
        });
    }
});
