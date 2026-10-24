// src/utils/roblox.js
const axios = require('axios');
const logger = require('./logger');

async function validateRobloxUser(username) {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: false
        }, {
            timeout: 5000,
            headers: { 'Accept': 'application/json' }
        });

        const data = response.data?.data;
        if (!data || data.length === 0) {
            return { success: false, error: 'El usuario de Roblox no existe en la plataforma.' };
        }

        return {
            success: true,
            username: data[0].name,
            displayName: data[0].displayName,
            id: data[0].id
        };
    } catch (err) {
        logger.warn(`API de Roblox inaccesible temporalmente (${err.message}).`);
        return { success: true, username: username, id: null };
    }
}

async function getRobloxAvatar(robloxId) {
    if (!robloxId) return null;
    try {
        // Thumbnail de cuerpo completo en 720x720
        const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxId}&size=720x720&format=Png&isCircular=false`, { timeout: 4000 });
        return res.data?.data?.[0]?.imageUrl || null;
    } catch {
        return null;
    }
}

async function getRobloxHeadshot(robloxId) {
    if (!robloxId) return null;
    try {
        // Headshot circular para iconos
        const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=true`, { timeout: 4000 });
        return res.data?.data?.[0]?.imageUrl || null;
    } catch {
        return null;
    }
}

module.exports = { validateRobloxUser, getRobloxAvatar, getRobloxHeadshot };