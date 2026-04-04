// ============================================================
//  server.js — Servidor principal Control de Vencimientos
//  SQLite embebido · JWT · bcrypt · Sin SQL Server
// ============================================================

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const https      = require('https');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const jwt        = require('jsonwebtoken');

const db    = require('./core/database');
const lic   = require('./core/licencia');
const notif = require('./core/notificaciones');

const app  = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'VencCom_Secret_2026_Jhony';

// ─── Detectar si corremos como .exe empaquetado con pkg ───────
const APP_DIR = process.pkg
    ? path.dirname(process.execPath)   // carpeta del .exe
    : __dirname;                       // carpeta del proyecto

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(APP_DIR, 'public')));

// ─── Inicializar base de datos y arrancar servidor ───────────
// sql.js requiere inicialización asíncrona
db.inicializarDB().then(arrancarServidor).catch(err => {
    console.error('[DB] Error al inicializar base de datos:', err);
    process.exit(1);
});

// ─── Middleware de autenticación JWT ─────────────────────────
function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Bearer <token>

    if (!token) {
        return res.status(401).json({ success: false, message: 'Acceso denegado. Inicie sesión.' });
    }
    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(403).json({ success: false, message: 'Sesión expirada. Inicie sesión nuevamente.' });
    }
}

// ─── Middleware solo admin ────────────────────────────────────
function soloAdmin(req, res, next) {
    if (req.usuario.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acción reservada para administradores.' });
    }
    next();
}

// ─── Middleware solo supervisor o admin ───────────────────────
function supervisorOAdmin(req, res, next) {
    if (!['supervisor', 'admin'].includes(req.usuario.rol)) {
        return res.status(403).json({ success: false, message: 'Acción reservada para supervisores o administradores.' });
    }
    next();
}

// ─── Middleware solo Plan Pro ─────────────────────────────────
function soloPro(req, res, next) {
    const licInfo = lic.verificarLicencia();
    if (licInfo.plan !== 'pro') {
        return res.status(403).json({
            success: false,
            message: 'Esta función es exclusiva del Plan Pro. Contáctenos para actualizar su licencia.',
            requiere_pro: true
        });
    }
    next();
}

// ============================================================
//  LICENCIA
// ============================================================

// Verificar estado de licencia
app.get('/api/licencia', (req, res) => {
    try {
        const info = lic.verificarLicencia();
        res.json({ success: true, licencia: info });
    } catch (err) {
        console.error('[Licencia]', err);
        res.status(500).json({ success: false, message: 'Error al verificar licencia.' });
    }
});

// Activar licencia con código
app.post('/api/licencia/activar', (req, res) => {
    try {
        const { codigo } = req.body;
        const resultado  = lic.activarLicencia(codigo);
        res.json(resultado);
    } catch (err) {
        console.error('[Licencia]', err);
        res.status(500).json({ success: false, message: 'Error al activar licencia.' });
    }
});

// Resetear licencia a modo demo (solo admin autenticado)
app.post('/api/licencia/resetear', autenticar, soloAdmin, (req, res) => {
    try {
        const resultado = lic.resetearLicencia();
        res.json(resultado);
    } catch (err) {
        console.error('[Licencia Reset]', err);
        res.status(500).json({ success: false, message: 'Error al resetear licencia.' });
    }
});

// ============================================================
//  AUTENTICACIÓN
// ============================================================

// Login
app.post('/api/login', (req, res) => {
    try {
        // Verificar licencia antes de permitir login
        const licInfo = lic.verificarLicencia();
        if (licInfo.estado === 'vencida') {
            return res.status(403).json({ success: false, message: 'Licencia vencida. Contáctese con su proveedor.', licencia: licInfo });
        }

        const { usuario, clave } = req.body;
        if (!usuario || !clave) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos.' });
        }

        const user = db.buscarUsuario(usuario);
        if (!user || !db.verificarPassword(clave, user.clave_hash)) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        // Generar token JWT (expira en 8 horas)
        const token = jwt.sign(
            { id: user.id, nombre: user.nombre_usuario, nombreCompleto: user.nombre_completo, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            usuario: { id: user.id, nombre: user.nombre_usuario, nombreCompleto: user.nombre_completo, rol: user.rol },
            licencia: licInfo
        });
    } catch (err) {
        console.error('[Login]', err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// ============================================================
//  PRODUCTOS
// ============================================================

// Importar catálogo desde JSON (viene del CSV/Excel parseado en el frontend)
// ⚠️ DEBE ir antes de /:codigo para que Express no lo confunda con un código
app.post('/api/productos/importar', autenticar, soloAdmin, (req, res) => {
    try {
        const { productos } = req.body;
        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({ success: false, message: 'No se recibieron productos para importar.' });
        }
        const resultado = db.importarProductos(productos);
        res.json({ success: true, message: `Importación completada.`, ...resultado });
    } catch (err) {
        console.error('[Importar]', err);
        res.status(500).json({ success: false, message: 'Error al importar productos.' });
    }
});

// Buscar productos por texto (para buscador desktop)
app.get('/api/productos', autenticar, (req, res) => {
    try {
        const { buscar } = req.query;
        const lista = buscar ? db.buscarProductos(buscar) : db.listarProductos();
        res.json({ success: true, productos: lista });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al listar productos.' });
    }
});

// Crear producto nuevo
app.post('/api/productos', autenticar, (req, res) => {
    try {
        const { codigo, descripcion, precio } = req.body;
        if (!codigo || !descripcion) {
            return res.status(400).json({ success: false, message: 'Código y descripción son requeridos.' });
        }
        // Verificar si ya existe
        const existe = db.buscarProducto(codigo.trim().toUpperCase());
        if (existe) {
            return res.status(400).json({ success: false, message: 'Ya existe un producto con ese código.' });
        }
        const result = db.crearProducto({ codigo, descripcion, precio });
        res.json({ success: true, message: 'Producto creado exitosamente.', id: result.lastInsertRowid });
    } catch (err) {
        console.error('[Productos POST]', err);
        res.status(500).json({ success: false, message: 'Error al crear producto.' });
    }
});

// Buscar producto por código (para el escáner móvil)
app.get('/api/productos/:codigo', autenticar, (req, res) => {
    try {
        const codigo   = req.params.codigo.trim().toUpperCase();
        const producto = db.buscarProducto(codigo);
        if (producto) {
            res.json({ success: true, producto });
        } else {
            res.json({ success: false, message: 'Producto no encontrado en el catálogo.' });
        }
    } catch (err) {
        console.error('[Productos GET]', err);
        res.status(500).json({ success: false, message: 'Error al buscar producto.' });
    }
});

// Actualizar producto
app.put('/api/productos/:codigo', autenticar, supervisorOAdmin, (req, res) => {
    try {
        const { descripcion, precio } = req.body;
        db.actualizarProducto({ codigo: req.params.codigo, descripcion, precio });
        res.json({ success: true, message: 'Producto actualizado.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar producto.' });
    }
});

// Eliminar producto
app.delete('/api/productos/:codigo', autenticar, soloAdmin, (req, res) => {
    try {
        db.eliminarProducto(req.params.codigo);
        res.json({ success: true, message: 'Producto eliminado.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al eliminar producto.' });
    }
});

// ============================================================
//  VENCIMIENTOS
// ============================================================

// Registrar vencimiento
app.post('/api/vencimientos', autenticar, (req, res) => {
    try {
        const { codigo_producto, descripcion, fecha_vencimiento, cantidad_unidades, ubicacion_pasillo, lote, observaciones } = req.body;

        if (!codigo_producto || !fecha_vencimiento) {
            return res.status(400).json({ success: false, message: 'Código de producto y fecha de vencimiento son requeridos.' });
        }

        const result = db.registrarVencimiento({
            codigo_producto,
            descripcion:       descripcion || '',
            fecha_vencimiento,
            cantidad_unidades: cantidad_unidades || 1,
            ubicacion_pasillo: ubicacion_pasillo || '',
            lote:              lote || '',
            observaciones:     observaciones || '',
            usuario_registro:  req.usuario.nombre
        });

        res.json({ success: true, message: 'Vencimiento registrado exitosamente.', id: result.lastInsertRowid });
    } catch (err) {
        console.error('[Vencimientos POST]', err);
        res.status(500).json({ success: false, message: 'Error al registrar vencimiento.' });
    }
});

// Listar vencimientos con filtros
app.get('/api/vencimientos', autenticar, (req, res) => {
    try {
        const { estado, codigo, desde, hasta } = req.query;
        const config = db.obtenerConfigAlertas();
        const hoy    = new Date().toISOString().split('T')[0];

        const lista = db.listarVencimientos({ estado, codigo, desde, hasta });

        // Calcular días restantes y nivel de alerta
        const vencimientos = lista.map(v => {
            const dias = Math.floor((new Date(v.fecha_vencimiento) - new Date(hoy)) / (1000 * 60 * 60 * 24));
            let nivel = 'NORMAL';
            if (dias < 0)                                       nivel = 'VENCIDO';
            else if (dias <= config.dias_alerta_critica)        nivel = 'CRITICO';
            else if (dias <= config.dias_alerta_advertencia)    nivel = 'ADVERTENCIA';
            else if (dias <= config.dias_alerta_preventiva)     nivel = 'PREVENTIVO';
            return { ...v, dias_restantes: dias, nivel_alerta: nivel };
        });

        res.json({ success: true, vencimientos });
    } catch (err) {
        console.error('[Vencimientos GET]', err);
        res.status(500).json({ success: false, message: 'Error al obtener vencimientos.' });
    }
});

// Alertas activas (≤ días preventivo)
app.get('/api/alertas', autenticar, (req, res) => {
    try {
        const config = db.obtenerConfigAlertas();
        const hoy    = new Date().toISOString().split('T')[0];
        const lista  = db.listarVencimientos({ estado: 'activo' });

        const alertas = lista
            .map(v => {
                const dias = Math.floor((new Date(v.fecha_vencimiento) - new Date(hoy)) / (1000 * 60 * 60 * 24));
                let nivel = 'NORMAL';
                if (dias < 0)                                       nivel = 'VENCIDO';
                else if (dias <= config.dias_alerta_critica)        nivel = 'CRITICO';
                else if (dias <= config.dias_alerta_advertencia)    nivel = 'ADVERTENCIA';
                else if (dias <= config.dias_alerta_preventiva)     nivel = 'PREVENTIVO';
                return { ...v, dias_restantes: dias, nivel_alerta: nivel };
            })
            .filter(v => v.nivel_alerta !== 'NORMAL');

        res.json({ success: true, alertas });
    } catch (err) {
        console.error('[Alertas]', err);
        res.status(500).json({ success: false, message: 'Error al obtener alertas.' });
    }
});

// Dashboard (resumen numérico)
app.get('/api/dashboard', autenticar, (req, res) => {
    try {
        const resumen = db.obtenerDashboard();
        res.json({ success: true, dashboard: resumen });
    } catch (err) {
        console.error('[Dashboard]', err);
        res.status(500).json({ success: false, message: 'Error al obtener dashboard.' });
    }
});

// Retirar producto
app.put('/api/vencimientos/:id/retirar', autenticar, supervisorOAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { motivo, observaciones, cantidad_retirada } = req.body;

        if (!motivo) {
            return res.status(400).json({ success: false, message: 'El motivo de retiro es requerido.' });
        }

        // Obtener datos del vencimiento
        const lista = db.listarVencimientos({});
        const venc  = lista.find(v => v.id === parseInt(id));
        if (!venc) {
            return res.status(404).json({ success: false, message: 'Vencimiento no encontrado.' });
        }

        db.registrarRetiro({
            id_vencimiento:   parseInt(id),
            codigo_producto:  venc.codigo_producto,
            descripcion:      venc.descripcion,
            motivo,
            cantidad_retirada: cantidad_retirada || venc.cantidad_unidades,
            usuario_retiro:   req.usuario.nombre,
            observaciones:    observaciones || ''
        });

        res.json({ success: true, message: 'Producto retirado exitosamente.' });
    } catch (err) {
        console.error('[Retirar]', err);
        res.status(500).json({ success: false, message: 'Error al retirar producto.' });
    }
});

// ============================================================
//  HISTORIAL DE RETIROS
// ============================================================

app.get('/api/historial', autenticar, (req, res) => {
    try {
        const { desde, hasta, codigo } = req.query;
        const historial = db.listarHistorial({ desde, hasta, codigo });
        res.json({ success: true, historial });
    } catch (err) {
        console.error('[Historial]', err);
        res.status(500).json({ success: false, message: 'Error al obtener historial.' });
    }
});

// ============================================================
//  CONFIGURACIÓN DE ALERTAS
// ============================================================

app.get('/api/configuracion', autenticar, (req, res) => {
    try {
        res.json({ success: true, configuracion: db.obtenerConfigAlertas() });
    } catch (err) {
        console.error('[Config GET]', err);
        res.status(500).json({ success: false, message: 'Error al obtener configuración.' });
    }
});

app.put('/api/configuracion', autenticar, soloAdmin, (req, res) => {
    try {
        const { dias_alerta_critica, dias_alerta_advertencia, dias_alerta_preventiva,
                notificaciones_activas, hora_notificacion,
                twilio_account_sid, twilio_auth_token, twilio_from,
                notif_telefono, notif_canal } = req.body;

        console.log('[Config PUT] Usuario:', req.usuario.nombre, '| Rol:', req.usuario.rol);

        db.actualizarConfigAlertas({
            dias_alerta_critica:     dias_alerta_critica     !== undefined ? dias_alerta_critica     : 3,
            dias_alerta_advertencia: dias_alerta_advertencia !== undefined ? dias_alerta_advertencia : 7,
            dias_alerta_preventiva:  dias_alerta_preventiva  !== undefined ? dias_alerta_preventiva  : 15,
            notificaciones_activas:  notificaciones_activas  !== undefined ? notificaciones_activas  : 0,
            hora_notificacion:       hora_notificacion       || '08:00',
            twilio_account_sid:      twilio_account_sid      || '',
            twilio_auth_token:       twilio_auth_token       || '',
            twilio_from:             twilio_from             || '',
            notif_telefono:          notif_telefono          || '',
            notif_canal:             notif_canal             || 'whatsapp'
        });
        // Reprogramar el scheduler con la nueva hora
        programarNotificaciones();
        console.log('[Config PUT] Configuración actualizada OK');
        res.json({ success: true, message: 'Configuración actualizada correctamente.' });
    } catch (err) {
        console.error('[Config PUT] ERROR:', err);
        res.status(500).json({ success: false, message: `Error al actualizar configuración: ${err.message}` });
    }
});

// Probar notificación (envía mensaje de prueba inmediatamente)
app.post('/api/notificaciones/probar', autenticar, soloAdmin, soloPro, async (req, res) => {
    try {
        const { twilio_account_sid, twilio_auth_token, twilio_from, notif_telefono, notif_canal } = req.body;
        if (!twilio_account_sid || !twilio_auth_token || !twilio_from || !notif_telefono) {
            return res.status(400).json({ success: false, message: 'Complete todos los datos de Twilio antes de probar.' });
        }
        // Validaciones rápidas de formato
        if (!twilio_account_sid.startsWith('AC')) {
            return res.status(400).json({ success: false, message: 'El Account SID debe comenzar con "AC". Verifique el dato en twilio.com' });
        }
        const canal = notif_canal || 'whatsapp';
        const telOk = notif_telefono.startsWith('+');
        const fromOk = twilio_from.startsWith('+');
        if (!telOk) return res.status(400).json({ success: false, message: 'El teléfono destino debe incluir el código de país con + (ej: +5849876543)' });
        if (!fromOk) return res.status(400).json({ success: false, message: 'El número Twilio debe incluir el + (ej: +14155238886)' });

        const resultado = await notif.enviarPrueba(twilio_account_sid, twilio_auth_token, twilio_from, notif_telefono, canal);
        res.json({ success: true, message: '✅ Mensaje de prueba enviado correctamente.', sid: resultado.sid });
    } catch (err) {
        console.error('[Notif Prueba]', err.message);
        // Traducir errores comunes de Twilio al español
        let msg = err.message;
        if (msg.includes('could not find a Channel') || msg.includes('From address')) {
            msg = 'El número remitente no tiene WhatsApp habilitado. ' +
                  'Para WhatsApp debes usar el número del Sandbox de Twilio (+14155238886), NO tu número de teléfono. ' +
                  'Encuéntralo en: Twilio Console → Messaging → Try it out → Send a WhatsApp message. ' +
                  'Alternativamente, cambia el canal a SMS y usa tu número normal.';
        } else if (msg.includes('authenticate') || msg.includes('Unauthorized') || msg.includes('20003')) {
            msg = 'Account SID o Auth Token incorrecto. Verifique los datos en twilio.com → Console';
        } else if (msg.includes('not a valid phone number') || msg.includes('21211')) {
            msg = 'El número de teléfono destino no es válido. Use formato internacional: +5849876543';
        } else if (msg.includes('unverified') || msg.includes('21608')) {
            msg = 'El número destino no está verificado en el Sandbox de Twilio. Primero envíe "join" al número del sandbox desde su WhatsApp.';
        } else if (msg.includes('blacklisted') || msg.includes('21610')) {
            msg = 'El número destino bloqueó los mensajes de Twilio. Verifique en Twilio Console.';
        }
        res.status(500).json({ success: false, message: msg });
    }
});

// Enviar alerta manualmente (sin esperar la hora programada)
app.post('/api/notificaciones/enviar', autenticar, soloAdmin, soloPro, async (req, res) => {
    try {
        const resultado = await notif.enviarAlertaDiaria();
        if (resultado.ok) {
            res.json({ success: true, message: resultado.enviado
                ? `Alerta enviada: ${resultado.criticos} críticos, ${resultado.advertencias} en advertencia.`
                : resultado.razon });
        } else {
            res.status(400).json({ success: false, message: resultado.razon || resultado.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al enviar notificación.' });
    }
});

// ============================================================
//  USUARIOS (solo admin)
// ============================================================

app.get('/api/usuarios', autenticar, soloAdmin, (req, res) => {
    try {
        res.json({ success: true, usuarios: db.listarUsuarios() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al obtener usuarios.' });
    }
});

app.post('/api/usuarios', autenticar, soloAdmin, (req, res) => {
    try {
        const { nombre_usuario, nombre_completo, clave, rol } = req.body;
        if (!nombre_usuario || !nombre_completo || !clave || !rol) {
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos.' });
        }
        db.crearUsuario({ nombre_usuario, nombre_completo, clave, rol });
        res.json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya existe.' });
        }
        res.status(500).json({ success: false, message: 'Error al crear usuario.' });
    }
});

app.put('/api/usuarios/:id/toggle', autenticar, soloAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;
        db.toggleUsuario(id, activo ? 1 : 0);
        res.json({ success: true, message: `Usuario ${activo ? 'activado' : 'desactivado'}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar usuario.' });
    }
});

// ============================================================
//  ENDPOINT IP LOCAL — Para generar QR de conexion movil
// ============================================================

app.get('/api/ip', (req, res) => {
    try {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        let ipLocal = null;

        // Palabras clave de interfaces virtuales a ignorar
        const virtuales = ['zerotier', 'vpn', 'virtual', 'vmware', 'vbox', 'hyper-v', 'tunnel', 'tap', 'tun', 'pseudo'];

        // Prioridad: Wi-Fi y Ethernet primero, ignorar interfaces virtuales
        const prioridad = ['wi-fi', 'wifi', 'ethernet', 'local area connection', 'inalambrica', 'inalámbrica', 'lan'];

        // Primero buscar en interfaces prioritarias (WiFi/Ethernet)
        for (const nombre of Object.keys(interfaces)) {
            const nombreLower = nombre.toLowerCase();
            const esVirtual = virtuales.some(v => nombreLower.includes(v));
            const esPrioritaria = prioridad.some(p => nombreLower.includes(p));
            if (esVirtual || !esPrioritaria) continue;
            for (const iface of interfaces[nombre]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ipLocal = iface.address;
                    break;
                }
            }
            if (ipLocal) break;
        }

        // Si no encontró en las prioritarias, buscar en cualquier interfaz no virtual
        if (!ipLocal) {
            for (const nombre of Object.keys(interfaces)) {
                const nombreLower = nombre.toLowerCase();
                const esVirtual = virtuales.some(v => nombreLower.includes(v));
                if (esVirtual) continue;
                for (const iface of interfaces[nombre]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        ipLocal = iface.address;
                        break;
                    }
                }
                if (ipLocal) break;
            }
        }

        console.log('[IP] Interfaces detectadas:', JSON.stringify(Object.keys(interfaces)));
        console.log('[IP] IP encontrada:', ipLocal);

        if (!ipLocal) {
            return res.status(404).json({ success: false, message: 'No se pudo detectar la IP local. Verifique que la computadora esté conectada a una red WiFi o Ethernet.' });
        }

        const url = `https://${ipLocal}:${PORT}/mobile.html`;
        console.log('[IP] URL generada:', url);
        res.json({ success: true, ip: ipLocal, url });
    } catch (err) {
        console.error('[IP] Error:', err.message);
        res.status(500).json({ success: false, message: 'Error al obtener IP: ' + err.message });
    }
});

// ============================================================
//  ENDPOINT QR — Genera imagen QR offline con el paquete qrcode
// ============================================================

app.get('/api/qr', async (req, res) => {
    try {
        const QRCode = require('qrcode');
        const { url } = req.query;
        if (!url) return res.status(400).json({ success: false, message: 'Falta el parámetro url.' });
        const pngBuffer = await QRCode.toBuffer(url, { width: 200, margin: 1 });
        res.set('Content-Type', 'image/png');
        res.send(pngBuffer);
    } catch (err) {
        console.error('[QR] Error:', err.message);
        res.status(500).json({ success: false, message: 'Error al generar QR: ' + err.message });
    }
});

// ============================================================
//  SCHEDULER DE NOTIFICACIONES DIARIAS
// ============================================================

let _schedulerTimer = null;

function programarNotificaciones() {
    // Cancelar timer anterior si existe
    if (_schedulerTimer) clearTimeout(_schedulerTimer);

    const config = db.obtenerConfigAlertas();
    if (!config.notificaciones_activas) return;

    // Calcular milisegundos hasta la hora configurada (ej. "08:00")
    const ahora   = new Date();
    const [hh, mm] = (config.hora_notificacion || '08:00').split(':').map(Number);
    const objetivo = new Date(ahora);
    objetivo.setHours(hh, mm, 0, 0);

    // Si la hora ya pasó hoy, programar para mañana
    if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);

    const msHasta = objetivo - ahora;
    console.log(`[Notif] Próxima alerta programada: ${objetivo.toLocaleString('es')} (en ${Math.round(msHasta/60000)} min)`);

    _schedulerTimer = setTimeout(async () => {
        console.log('[Notif] Ejecutando alerta diaria...');
        const resultado = await notif.enviarAlertaDiaria();
        if (resultado.ok && resultado.enviado) {
            console.log(`[Notif] Enviada OK — ${resultado.criticos} críticos, ${resultado.advertencias} advertencias`);
        } else {
            console.log('[Notif]', resultado.razon || resultado.error || 'Sin alertas');
        }
        // Reprogramar para mañana a la misma hora
        programarNotificaciones();
    }, msHasta);
}

// ============================================================
//  ARRANQUE DEL SERVIDOR (llamado después de inicializar DB)
// ============================================================

function obtenerIPLocal() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const virtuales = ['zerotier', 'vpn', 'virtual', 'vmware', 'vbox', 'hyper-v', 'tunnel', 'tap', 'tun', 'pseudo'];
    const prioridad = ['wi-fi', 'wifi', 'ethernet', 'local area connection', 'inalambrica', 'inalámbrica', 'lan'];
    let ip = null;
    for (const nombre of Object.keys(interfaces)) {
        const n = nombre.toLowerCase();
        if (virtuales.some(v => n.includes(v)) || !prioridad.some(p => n.includes(p))) continue;
        for (const iface of interfaces[nombre]) {
            if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
        }
        if (ip) break;
    }
    if (!ip) {
        for (const nombre of Object.keys(interfaces)) {
            const n = nombre.toLowerCase();
            if (virtuales.some(v => n.includes(v))) continue;
            for (const iface of interfaces[nombre]) {
                if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
            }
            if (ip) break;
        }
    }
    return ip;
}

function arrancarServidor() {
    const banner = (protocolo) => {
        console.log(`\n╔══════════════════════════════════════════════╗`);
        console.log(`║    Control de Vencimientos — v2.0            ║`);
        console.log(`║  Servidor ${protocolo.padEnd(5)} corriendo en puerto ${PORT}    ║`);
        console.log(`║  ${protocolo.toLowerCase()}://localhost:${PORT}                  ║`);
        console.log(`╚══════════════════════════════════════════════╝\n`);
    };

    try {
        const forge   = require('node-forge');
        const ipLocal = obtenerIPLocal() || '127.0.0.1';
        console.log(`[HTTPS] Generando certificado para IP: ${ipLocal}`);

        const keys = forge.pki.rsa.generateKeyPair(2048);
        const cert = forge.pki.createCertificate();

        cert.publicKey    = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter  = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        const subject = [
            { name: 'commonName',       value: 'ControlVencimientos' },
            { name: 'organizationName', value: 'ControlVencimientos' },
            { name: 'countryName',      value: 'VE' }
        ];
        cert.setSubject(subject);
        cert.setIssuer(subject);
        cert.setExtensions([
            { name: 'basicConstraints', cA: true },
            { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
            { name: 'extKeyUsage', serverAuth: true },
            { name: 'subjectAltName', altNames: [
                { type: 7, ip: ipLocal },
                { type: 7, ip: '127.0.0.1' },
                { type: 2, value: 'localhost' }
            ]}
        ]);
        cert.sign(keys.privateKey, forge.md.sha256.create());

        const certPem = forge.pki.certificateToPem(cert);
        const keyPem  = forge.pki.privateKeyToPem(keys.privateKey);

        https.createServer({ cert: certPem, key: keyPem }, app).listen(PORT, '0.0.0.0', () => {
            banner('HTTPS');
            programarNotificaciones();
        });
    } catch (err) {
        console.warn('[HTTPS] No se pudo generar certificado, usando HTTP:', err.message);
        http.createServer(app).listen(PORT, '0.0.0.0', () => {
            banner('HTTP');
            programarNotificaciones();
        });
    }
}

process.on('SIGINT', () => {
    console.log('\nServidor detenido.');
    process.exit(0);
});
