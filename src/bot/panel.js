// src/bot/panel.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config/env');

function createVerificationCard() {
    const baseUrl = (config.baseUrl || 'https://latam-rp-bot.onrender.com').trim().replace(/\/$/, '');
    const embed = new EmbedBuilder()
        .setColor(0x2563EB)
        .setAuthor({ name: 'LATAM ROLEPLAY • SISTEMA DE IDENTIDAD', iconURL: 'https://cdn.discordapp.com/emojis/1069695420188987483.webp?size=96' })
        .setTitle('🛡️ VINCULACIÓN OFICIAL & VERIFICACIÓN V-SYNC')
        .setDescription(
            `> **Bienvenido a la comunidad oficial de LATAM RP.**\n` +
            `Para acceder a la ciudad y a los canales del servidor, debes verificar tu cuenta de **Roblox** con tu perfil de **Discord**.\n\n` +
            `**📋 INSTRUCCIONES:**\n` +
            `**1.** Presiona el botón **\`Vincular Cuenta (V-Sync)\`**.\n` +
            `**2.** Autoriza tu cuenta mediante Discord OAuth2.\n` +
            `**3.** Ingresa tu usuario de Roblox en la terminal web y completa el filtro.\n\n` +
            `**🎁 BENEFICIOS:**\n` +
            `▫️ Asignación automática de roles de Ciudadano\n` +
            `▫️ Sincronización de tu apodo en Discord`
        )
        .setImage('https://images.alphacoders.com/133/1338018.png')
        .setFooter({ text: 'V-Sync v3.0 Powered by Cypher' });

    const btn = new ButtonBuilder()
        .setLabel('Vincular Cuenta (V-Sync)')
        .setStyle(ButtonStyle.Link)
        .setURL(`${baseUrl}/auth/login`)
        .setEmoji('🔗');

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] };
}

module.exports = { createVerificationCard };