// src/server/app.js
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const config = require('../config/env');
const logger = require('../utils/logger');
const { validateRobloxUser } = require('../utils/roblox');
const { syncUserOnGuild } = require('../utils/discord');
const { client } = require('../bot/client');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesiones de usuario seguras
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Cambiar a true si usas HTTPS (recomendado en producción)
        maxAge: 1000 * 60 * 30 // 30 minutos de sesión
    }
}));

// Servir la carpeta frontend pública (donde está tu index.html)
app.use(express.static(path.join(__dirname, '../../public')));

// ========================================================
// RUTAS DE AUTENTICACIÓN (OAUTH2 DE DISCORD)
// ========================================================

// 1. Redirección a Discord
app.get('/auth/login', (req, res) => {
    const redirectUri = encodeURIComponent(`${config.baseUrl}/auth/callback`);
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=identify%20guilds.members.read`;
    res.redirect(discordAuthUrl);
});

// 2. Callback de Discord (Retorno tras autorización)
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Código de autorización faltante.');
    }

    try {
        // Intercambiar el código temporal por el access token
        const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', 
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code: code.toString(),
                redirect_uri: `${config.baseUrl}/auth/callback`
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // Obtener la identidad del usuario de Discord
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Guardar sesión
        req.session.user = {
            id: userResponse.data.id,
            username: userResponse.data.username,
            globalName: userResponse.data.global_name || userResponse.data.username,
            avatar: userResponse.data.avatar
        };

        logger.info(`Usuario autenticado vía OAuth2: ${req.session.user.username} (${req.session.user.id})`);
        
        // Redirigir al formulario web
        res.redirect('/');
    } catch (err) {
        logger.error('Fallo en el callback OAuth2:', err.response?.data || err.message);
        res.status(500).send('Error durante la autenticación con Discord. Inténtalo de nuevo.');
    }
});

// Endpoint para que el Frontend obtenga los datos del usuario logueado
app.get('/api/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, user: req.session.user });
});

// ========================================================
// ENDPOINT DE VERIFICACIÓN (PROCESAMIENTO REAL)
// ========================================================
app.post('/api/verify', async (req, res) => {
    // 1. Validar si el usuario está autenticado con Discord
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Sesión expirada o no iniciada. Vuelve a hacer login.' });
    }

    const { robloxUser, answer } = req.body;

    // 2. Validación de seguridad de la prueba matemática en el servidor (Anti-Trampas)
    if (parseInt(answer, 10) !== 4) {
        return res.status(400).json({ success: false, error: 'Respuesta matemática incorrecta.' });
    }

    // 3. Validación de la cuenta en los servidores de Roblox
    if (!robloxUser || robloxUser.trim().length < 3) {
        return res.status(400).json({ success: false, error: 'Nombre de usuario de Roblox inválido.' });
    }

    const robloxCheck = await validateRobloxUser(robloxUser.trim());
    if (!robloxCheck.success) {
        return res.status(400).json({ success: false, error: robloxCheck.error });
    }

    try {
        // 4. Buscar al miembro en el servidor de Discord
        const guild = await client.guilds.fetch(config.guildId);
        if (!guild) {
            return res.status(500).json({ success: false, error: 'Servidor de Discord no encontrado.' });
        }

        const member = await guild.members.fetch(req.session.user.id).catch(() => null);
        if (!member) {
            return res.status(404).json({ 
                success: false, 
                error: 'No te encuentras dentro del servidor de Discord de LATAM RP. Únete primero.' 
            });
        }

        // 5. Asignar los 2 roles y aplicar el apodo con los utils creados
        const rolesToAssign = [config.roles.ciudadano, config.roles.verificado];
        const syncResult = await syncUserOnGuild(member, robloxCheck.username, rolesToAssign);

        return res.json({
            success: true,
            robloxUsername: robloxCheck.username,
            discordTag: member.user.tag,
            syncResult
        });

    } catch (err) {
        logger.error('Error durante el proceso de asignación:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Error interno del servidor.' });
    }
});

module.exports = { app };