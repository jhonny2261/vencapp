// ============================================================
//  notificaciones.js — Envío de alertas por WhatsApp / SMS
//  Usa Twilio. Requiere cuenta en twilio.com (gratuita para probar)
//  Control de Vencimientos
// ============================================================

const db = require('./database');

// ─── Enviar mensaje via Twilio ────────────────────────────────
async function enviarMensaje(accountSid, authToken, from, to, body) {
    // Twilio REST API directamente con fetch/https (sin instalar SDK)
    // para no agregar dependencias al proyecto
    const https  = require('https');
    const url    = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth   = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const data   = new URLSearchParams({ From: from, To: to, Body: body }).toString();

    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type':  'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const json = JSON.parse(body);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ ok: true, sid: json.sid });
                } else {
                    reject(new Error(json.message || `Error HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ─── Construir mensaje de alerta diaria ──────────────────────
function construirMensaje(criticos, advertencias, preventivos, negocio = 'su negocio') {
    const hoy = new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let msg = `🔔 *Control de Vencimientos* — ${hoy}\n`;
    msg += `📍 ${negocio}\n\n`;

    if (criticos.length === 0 && advertencias.length === 0 && preventivos.length === 0) {
        msg += `✅ Sin alertas activas. ¡Todo en orden!`;
        return msg;
    }

    if (criticos.length > 0) {
        msg += `🔴 *CRÍTICOS (vencen en ≤3 días): ${criticos.length}*\n`;
        criticos.slice(0, 5).forEach(p => {
            msg += `  • ${p.descripcion} — ${p.dias_restantes < 0 ? 'VENCIDO' : `${p.dias_restantes} día(s)`}\n`;
        });
        if (criticos.length > 5) msg += `  ... y ${criticos.length - 5} más\n`;
        msg += '\n';
    }

    if (advertencias.length > 0) {
        msg += `🟡 *ADVERTENCIA (≤7 días): ${advertencias.length} productos*\n`;
    }

    if (preventivos.length > 0) {
        msg += `🔵 *PREVENTIVOS (≤15 días): ${preventivos.length} productos*\n`;
    }

    msg += `\n📊 Revise el panel completo en su computadora.`;
    return msg;
}

// ─── Ejecutar envío de alerta diaria ─────────────────────────
async function enviarAlertaDiaria() {
    const config = db.obtenerConfigAlertas();

    // Verificar que las notificaciones estén habilitadas y configuradas
    if (!config.notificaciones_activas) {
        return { ok: false, razon: 'Notificaciones desactivadas' };
    }
    if (!config.twilio_account_sid || !config.twilio_auth_token ||
        !config.twilio_from || !config.notif_telefono) {
        return { ok: false, razon: 'Twilio no configurado. Complete los datos en Configuración.' };
    }

    // Obtener alertas activas
    const hoy  = new Date().toISOString().split('T')[0];
    const lista = db.listarVencimientos({ estado: 'activo' });

    const criticos    = [];
    const advertencias = [];
    const preventivos = [];

    lista.forEach(v => {
        const dias = Math.floor((new Date(v.fecha_vencimiento) - new Date(hoy)) / (1000 * 60 * 60 * 24));
        if (dias < 0 || dias <= config.dias_alerta_critica)        criticos.push({ ...v, dias_restantes: dias });
        else if (dias <= config.dias_alerta_advertencia)           advertencias.push({ ...v, dias_restantes: dias });
        else if (dias <= config.dias_alerta_preventiva)            preventivos.push({ ...v, dias_restantes: dias });
    });

    // Si no hay alertas, no enviar (opcional: cambiar a siempre enviar)
    if (criticos.length === 0 && advertencias.length === 0 && preventivos.length === 0) {
        return { ok: true, enviado: false, razon: 'Sin alertas activas, no se envió mensaje.' };
    }

    const mensaje = construirMensaje(criticos, advertencias, preventivos);

    // Formatear número destino según canal
    const canal = config.notif_canal || 'whatsapp';
    const tel   = config.notif_telefono.replace(/\s/g, '');
    const to    = canal === 'whatsapp' ? `whatsapp:${tel}` : tel;
    const from  = canal === 'whatsapp'
        ? `whatsapp:${config.twilio_from}`
        : config.twilio_from;

    try {
        const resultado = await enviarMensaje(
            config.twilio_account_sid,
            config.twilio_auth_token,
            from, to, mensaje
        );
        console.log(`[Notif] Mensaje enviado OK. SID: ${resultado.sid}`);
        return { ok: true, enviado: true, sid: resultado.sid, criticos: criticos.length, advertencias: advertencias.length };
    } catch (err) {
        console.error('[Notif] Error al enviar:', err.message);
        return { ok: false, error: err.message };
    }
}

// ─── Probar configuración (envía mensaje de prueba) ──────────
async function enviarPrueba(accountSid, authToken, from, telefono, canal) {
    const to   = canal === 'whatsapp' ? `whatsapp:${telefono}` : telefono;
    const dest = canal === 'whatsapp' ? `whatsapp:${from}` : from;
    const msg  = `✅ *Control de Vencimientos*\n\nPrueba de conexión exitosa. Las notificaciones de alertas están configuradas correctamente.`;

    return enviarMensaje(accountSid, authToken, dest, to, msg);
}

module.exports = { enviarAlertaDiaria, enviarPrueba };
