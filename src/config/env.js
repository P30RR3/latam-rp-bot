// src/config/env.js
require('dotenv').config();

const clean = (val, fallback = '') => {
    if (!val) return fallback;
    const stringVal = String(val);
    const trimmedVal = stringVal.trim();
    const regexQuotes = /^["']|["']$/g;
    const finalVal = trimmedVal.replace(regexQuotes, '');
    return finalVal;
};

const rawPort = process.env.PORT || '3000';
const parsedPort = parseInt(rawPort, 10);

const rawBaseUrl = process.env.BASE_URL;
const fallbackUrl = 'http://localhost:3000';
const cleanedBaseUrl = clean(rawBaseUrl, fallbackUrl);
const finalBaseUrl = cleanedBaseUrl.replace(/\/$/, '');

const botToken = clean(process.env.BOT_TOKEN);
const clientId = clean(process.env.CLIENT_ID);
const clientSecret = clean(process.env.CLIENT_SECRET);
const guildId = clean(process.env.GUILD_ID);

// MEJORA REAL: Validación estricta de variables críticas
if (!botToken || botToken.length < 10) {
    console.error('\x1b[31m[ERROR CRÍTICO] BOT_TOKEN no está configurado correctamente en el archivo .env\x1b[0m');
    process.exit(1);
}

if (!clientId || !guildId) {
    console.warn('\x1b[33m[ADVERTENCIA] CLIENT_ID o GUILD_ID faltan. Los comandos Slash podrían no registrarse.\x1b[0m');
}

const sessionSecret = clean(process.env.SESSION_SECRET, 'latam_rp_secure_session_key_2026');

const roleCiudadano = clean(process.env.ROLE_CIUDADANO_ID);
const roleVerificado = clean(process.env.ROLE_VERIFICADO_ID);
const roleStaff = clean(process.env.ROLE_STAFF_ID);

const rolesConfig = {
    ciudadano: roleCiudadano,
    verificado: roleVerificado,
    staff: roleStaff
};

const configObject = {
    port: parsedPort,
    baseUrl: finalBaseUrl,
    botToken: botToken,
    clientId: clientId,
    clientSecret: clientSecret,
    guildId: guildId,
    sessionSecret: sessionSecret,
    roles: rolesConfig
};

module.exports = configObject;