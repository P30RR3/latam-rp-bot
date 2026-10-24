// src/config/env.js
require('dotenv').config();

const clean = (val, fallback = '') => {
    if (!val) return fallback;
    return String(val).trim().replace(/^["']|["']$/g, '');
};

module.exports = {
    port: parseInt(process.env.PORT || '3000', 10),
    baseUrl: clean(process.env.BASE_URL, 'http://localhost:3000').replace(/\/$/, ''),
    botToken: clean(process.env.BOT_TOKEN),
    clientId: clean(process.env.CLIENT_ID),
    clientSecret: clean(process.env.CLIENT_SECRET),
    guildId: clean(process.env.GUILD_ID),
    sessionSecret: clean(process.env.SESSION_SECRET, 'latam_rp_secure_session_key_2026'),
    roles: {
        ciudadano: clean(process.env.ROLE_CIUDADANO_ID),
        verificado: clean(process.env.ROLE_VERIFICADO_ID),
        staff: clean(process.env.ROLE_STAFF_ID) // Rol para comandos de moderación
    }
};