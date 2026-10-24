// src/utils/roblox.js
const axios = require('axios');
const logger = require('./logger');

// MEJORA REAL: Sistema de Caché en memoria para evitar Rate Limits de Roblox
const avatarCache = new Map();
const headshotCache = new Map();

async function validateRobloxUser(username) {
    const targetUrl = 'https://users.roblox.com/v1/usernames/users';
    const requestPayload = {
        usernames: [username],
        excludeBannedUsers: false
    };
    
    const requestConfig = {
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
    };

    try {
        const response = await axios.post(targetUrl, requestPayload, requestConfig);
        const responseData = response.data;
        const usersArray = responseData?.data;
        
        const isArrayEmpty = !usersArray || usersArray.length === 0;
        if (isArrayEmpty) {
            const errorMsg = 'El usuario de Roblox no existe en la plataforma.';
            return { success: false, error: errorMsg };
        }

        const firstUser = usersArray[0];
        const validUsername = firstUser.name;
        const validDisplayName = firstUser.displayName;
        const validId = firstUser.id;

        const successPayload = {
            success: true,
            username: validUsername,
            displayName: validDisplayName,
            id: validId
        };
        
        return successPayload;
        
    } catch (err) {
        const errorMsg = err.message;
        logger.warn(`API de Roblox inaccesible temporalmente (${errorMsg}).`);
        
        const fallbackPayload = { 
            success: true, 
            username: username, 
            id: null 
        };
        return fallbackPayload;
    }
}

async function getRobloxAvatar(robloxId) {
    if (!robloxId) return null;
    
    const isCached = avatarCache.has(robloxId);
    if (isCached) {
        return avatarCache.get(robloxId);
    }
    
    const baseUrl = 'https://thumbnails.roblox.com/v1/users/avatar';
    const queryParams = `?userIds=${robloxId}&size=720x720&format=Png&isCircular=false`;
    const targetUrl = `${baseUrl}${queryParams}`;
    
    const requestConfig = { timeout: 4000 };

    try {
        const response = await axios.get(targetUrl, requestConfig);
        const responseData = response.data;
        const dataArray = responseData?.data;
        
        const firstResult = dataArray?.[0];
        const imageUrl = firstResult?.imageUrl || null;
        
        if (imageUrl) {
            avatarCache.set(robloxId, imageUrl);
            setTimeout(() => avatarCache.delete(robloxId), 3600000); // Limpiar caché en 1 hora
        }
        
        return imageUrl;
    } catch (error) {
        return null;
    }
}

async function getRobloxHeadshot(robloxId) {
    if (!robloxId) return null;
    
    const isCached = headshotCache.has(robloxId);
    if (isCached) {
        return headshotCache.get(robloxId);
    }
    
    const baseUrl = 'https://thumbnails.roblox.com/v1/users/avatar-headshot';
    const queryParams = `?userIds=${robloxId}&size=150x150&format=Png&isCircular=true`;
    const targetUrl = `${baseUrl}${queryParams}`;
    
    const requestConfig = { timeout: 4000 };

    try {
        const response = await axios.get(targetUrl, requestConfig);
        const responseData = response.data;
        const dataArray = responseData?.data;
        
        const firstResult = dataArray?.[0];
        const imageUrl = firstResult?.imageUrl || null;
        
        if (imageUrl) {
            headshotCache.set(robloxId, imageUrl);
            setTimeout(() => headshotCache.delete(robloxId), 3600000); // Limpiar caché en 1 hora
        }
        
        return imageUrl;
    } catch (error) {
        return null;
    }
}

module.exports = { validateRobloxUser, getRobloxAvatar, getRobloxHeadshot };