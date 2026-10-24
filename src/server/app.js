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

// MEJORA REAL: Configuración de Proxy para Render/VPS
const proxyTrustLevel = 1;
app.set('trust proxy', proxyTrustLevel);

const corsOptions = { origin: '*' };
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecretKey = config.sessionSecret || 'latam_rp_secure_key_2026';
const sessionMaxAge = 1000 * 60 * 60; // 1 hora

const sessionConfig = {
    secret: sessionSecretKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',
        maxAge: sessionMaxAge
    }
};

app.use(session(sessionConfig));

const publicDirectoryPath = path.join(__dirname, '../../public');
app.use(express.static(publicDirectoryPath));

// MEJORA REAL: Sistema Anti-DDoS (Rate Limiting) manual para endpoints críticos
const rateLimitCache = new Map();

function checkRateLimit(ip) {
    const currentTime = Date.now();
    const windowMs = 60000; // 1 minuto
    const maxRequests = 15; // Máximo 15 intentos por minuto
    
    if (!rateLimitCache.has(ip)) {
        rateLimitCache.set(ip, { count: 1, startTime: currentTime });
        return true;
    }
    
    const record = rateLimitCache.get(ip);
    const timePassed = currentTime - record.startTime;
    
    if (timePassed > windowMs) {
        rateLimitCache.set(ip, { count: 1, startTime: currentTime });
        return true;
    }
    
    record.count += 1;
    if (record.count > maxRequests) {
        return false;
    }
    
    return true;
}

// 1. Iniciar Login OAuth2 de Discord
app.get('/auth/login', (req, res) => {
    const clientId = config.clientId;
    const baseUrl = config.baseUrl;

    if (!clientId) {
        const errorMsg = 'Falta CLIENT_ID en variables de entorno.';
        return res.status(500).send(errorMsg);
    }

    const callbackPath = '/auth/callback';
    const fullRedirectUri = `${baseUrl}${callbackPath}`;
    const encodedRedirectUri = encodeURIComponent(fullRedirectUri);
    
    const oauthScopes = 'identify%20guilds.members.read';
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodedRedirectUri}&scope=${oauthScopes}`;
    
    res.redirect(discordAuthUrl);
});

// 2. Callback de Discord OAuth2
app.get('/auth/callback', async (req, res) => {
    const queryCode = req.query.code;
    
    if (!queryCode) {
        const errorMsg = 'Código de autorización ausente.';
        return res.status(400).send(errorMsg);
    }

    const baseUrl = config.baseUrl;
    const redirectUri = `${baseUrl}/auth/callback`;

    try {
        const params = new URLSearchParams();
        params.append('client_id', config.clientId);
        params.append('client_secret', config.clientSecret);
        params.append('grant_type', 'authorization_code');
        params.append('code', queryCode.toString());
        params.append('redirect_uri', redirectUri);

        const tokenEndpoint = 'https://discord.com/api/v10/oauth2/token';
        const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
        
        const tokenRes = await axios.post(tokenEndpoint, params.toString(), { headers: tokenHeaders });
        const accessToken = tokenRes.data.access_token;

        const userEndpoint = 'https://discord.com/api/v10/users/@me';
        const userHeaders = { Authorization: `Bearer ${accessToken}` };
        
        const userRes = await axios.get(userEndpoint, { headers: userHeaders });
        const userData = userRes.data;

        const sessionUser = {
            id: userData.id,
            username: userData.username,
            globalName: userData.global_name || userData.username,
            avatar: userData.avatar
        };

        req.session.user = sessionUser;
        
        req.session.save(() => {
            res.redirect('/');
        });
        
    } catch (err) {
        const errorDetail = err.response?.data || err.message;
        logger.error('Error en callback OAuth2:', errorDetail);
        
        const publicErrorMsg = 'Error durante la autenticación de Discord. Por favor, inténtalo de nuevo.';
        res.status(500).send(publicErrorMsg);
    }
});

// 3. Endpoint de estado de sesión para el frontend
app.get('/api/me', (req, res) => {
    const sessionUser = req.session?.user;
    
    if (!sessionUser) {
        const unauthPayload = { authenticated: false };
        return res.status(401).json(unauthPayload);
    }
    
    const authPayload = { authenticated: true, user: sessionUser };
    res.json(authPayload);
});

// 4. Verificación y Persistencia en Base de Datos
app.post('/api/verify', async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const isAllowed = checkRateLimit(clientIp);
    
    if (!isAllowed) {
        const rateLimitMsg = 'Demasiadas peticiones. Por favor, espera un minuto.';
        return res.status(429).json({ success: false, error: rateLimitMsg });
    }

    const sessionUser = req.session?.user;
    if (!sessionUser) {
        const sessionErrorMsg = 'Sesión expirada. Vuelve a iniciar sesión.';
        return res.status(401).json({ success: false, error: sessionErrorMsg });
    }

    const requestBody = req.body;
    const robloxUser = requestBody.robloxUser;
    const securityAnswer = requestBody.answer;

    const parsedAnswer = parseInt(securityAnswer, 10);
    if (parsedAnswer !== 4) {
        const captchaErrorMsg = 'Respuesta de seguridad incorrecta.';
        return res.status(400).json({ success: false, error: captchaErrorMsg });
    }

    const isRobloxUserValid = robloxUser && robloxUser.trim().length >= 3;
    if (!isRobloxUserValid) {
        const invalidUserMsg = 'Nombre de usuario de Roblox inválido.';
        return res.status(400).json({ success: false, error: invalidUserMsg });
    }

    const cleanRobloxUser = robloxUser.trim();
    const robloxCheck = await validateRobloxUser(cleanRobloxUser);
    
    if (!robloxCheck.success) {
        const apiErrorMsg = robloxCheck.error;
        return res.status(400).json({ success: false, error: apiErrorMsg });
    }

    try {
        const guildId = config.guildId;
        const cachedGuild = client.guilds.cache.get(guildId);
        const guild = cachedGuild || await client.guilds.fetch(guildId).catch(() => null);
        
        if (!guild) {
            const guildErrorMsg = 'Servidor de Discord no disponible.';
            return res.status(500).json({ success: false, error: guildErrorMsg });
        }

        const userId = sessionUser.id;
        const cachedMember = guild.members.cache.get(userId);
        const member = cachedMember || await guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            const memberErrorMsg = 'No estás dentro del servidor de Discord de LATAM RP.';
            return res.status(404).json({ success: false, error: memberErrorMsg });
        }

        const roleCiudadano = config.roles.ciudadano;
        const roleVerificado = config.roles.verificado;
        
        const rawRoles = [roleCiudadano, roleVerificado];
        const rolesToAssign = rawRoles.filter(r => r && r.length > 5);
        
        const verifiedUsername = robloxCheck.username;
        const syncResult = await syncUserOnGuild(member, verifiedUsername, rolesToAssign);

        const verifiedRobloxId = robloxCheck.id;
        db.saveVerification(userId, verifiedUsername, verifiedRobloxId);
        
        const logMsg = `Sincronización guardada: Discord [${userId}] ⇄ Roblox [${verifiedUsername}]`;
        logger.success(logMsg);

        const successPayload = {
            success: true,
            robloxUsername: verifiedUsername,
            syncResult: syncResult
        };
        
        return res.json(successPayload);
        
    } catch (err) {
        const catchErrorMsg = err.message;
        logger.error('Error procesando verificación:', catchErrorMsg);
        
        const errorPayload = { success: false, error: catchErrorMsg };
        return res.status(500).json(errorPayload);
    }
});

module.exports = { app };