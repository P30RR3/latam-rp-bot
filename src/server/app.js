// src/server/app.js
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const config = require('../config/env');
const logger = require('../utils/logger');
const db = require('../database/db');
const { validateRobloxUser } = require('../utils/roblox');
const { syncUserOnGuild } = require('../utils/discord');
const { client } = require('../bot/client');

const app = express();

// Soporte de proxy para Render y balanceadores
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: config.sessionSecret || 'latam_rp_secure_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',
        maxAge: 1000 * 60 * 60 // 1 hora
    }
}));

app.use(express.static(path.join(__dirname, '../../public')));

// 1. Iniciar Login OAuth2 de Discord
app.get('/auth/login', (req, res) => {
    const clientId = config.clientId;
    const baseUrl = config.baseUrl;

    if (!clientId) {
        return res.status(500).send('Falta CLIENT_ID en variables de entorno.');
    }

    const redirectUri = encodeURIComponent(`${baseUrl}/auth/callback`);
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=identify%20guilds.members.read`;
    res.redirect(discordAuthUrl);
});

// 2. Callback de Discord OAuth2
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Código ausente.');

    const redirectUri = `${config.baseUrl}/auth/callback`;

    try {
        const params = new URLSearchParams();
        params.append('client_id', config.clientId);
        params.append('client_secret', config.clientSecret);
        params.append('grant_type', 'authorization_code');
        params.append('code', code.toString());
        params.append('redirect_uri', redirectUri);

        const tokenRes = await axios.post('https://discord.com/api/v10/oauth2/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const userRes = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
        });

        req.session.user = {
            id: userRes.data.id,
            username: userRes.data.username,
            globalName: userRes.data.global_name || userRes.data.username,
            avatar: userRes.data.avatar
        };

        req.session.save(() => res.redirect('/'));
    } catch (err) {
        logger.error('Error en callback OAuth2:', err.response?.data || err.message);
        res.status(500).send('Error durante la autenticación de Discord.');
    }
});

// 3. Endpoint de estado de sesión para el frontend
app.get('/api/me', (req, res) => {
    if (!req.session?.user) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user: req.session.user });
});

// 4. Verificación y Persistencia en Base de Datos
app.post('/api/verify', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    }

    const { robloxUser, answer } = req.body;

    if (parseInt(answer, 10) !== 4) {
        return res.status(400).json({ success: false, error: 'Respuesta de seguridad incorrecta.' });
    }

    if (!robloxUser || robloxUser.trim().length < 3) {
        return res.status(400).json({ success: false, error: 'Nombre de usuario de Roblox inválido.' });
    }

    const robloxCheck = await validateRobloxUser(robloxUser.trim());
    if (!robloxCheck.success) {
        return res.status(400).json({ success: false, error: robloxCheck.error });
    }

    try {
        const guild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null);
        if (!guild) return res.status(500).json({ success: false, error: 'Servidor de Discord no disponible.' });

        const member = guild.members.cache.get(req.session.user.id) || await guild.members.fetch(req.session.user.id).catch(() => null);
        if (!member) return res.status(404).json({ success: false, error: 'No estás dentro del servidor de Discord de LATAM RP.' });

        // Sincronizar roles
        const rolesToAssign = [config.roles.ciudadano, config.roles.verificado].filter(r => r && r.length > 5);
        const syncResult = await syncUserOnGuild(member, robloxCheck.username, rolesToAssign);

        // Guardado en la base de datos
        db.saveVerification(req.session.user.id, robloxCheck.username, robloxCheck.id);
        logger.success(`Sincronización guardada: Discord [${req.session.user.id}] ⇄ Roblox [${robloxCheck.username}]`);

        return res.json({
            success: true,
            robloxUsername: robloxCheck.username,
            syncResult
        });
    } catch (err) {
        logger.error('Error procesando verificación:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { app };