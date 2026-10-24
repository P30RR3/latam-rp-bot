// src/bot/panel.js
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

const config = require('../config/env');

function createVerificationCard() {
    const rawBaseUrl = config.baseUrl || 'https://latam-rp-bot.onrender.com';
    const trimmedUrl = rawBaseUrl.trim();
    const finalBaseUrl = trimmedUrl.replace(/\/$/, '');
    
    const embedColor = 0x2563EB;
    const authorName = 'LATAM ROLEPLAY • SISTEMA DE IDENTIDAD';
    const authorIcon = 'https://cdn.discordapp.com/emojis/1069695420188987483.webp?size=96';
    const embedTitle = '🛡️ VINCULACIÓN OFICIAL & VERIFICACIÓN V-SYNC';
    
    const line1 = `> **Bienvenido a la comunidad oficial de LATAM RP.**\n`;
    const line2 = `Para acceder a la ciudad y a los canales del servidor, debes verificar tu cuenta de **Roblox** con tu perfil de **Discord**.\n\n`;
    const line3 = `**📋 INSTRUCCIONES:**\n`;
    const line4 = `**1.** Presiona el botón **\`Vincular Cuenta (V-Sync)\`**.\n`;
    const line5 = `**2.** Autoriza tu cuenta mediante Discord OAuth2.\n`;
    const line6 = `**3.** Ingresa tu usuario de Roblox en la terminal web y completa el filtro.\n\n`;
    const line7 = `**🎁 BENEFICIOS:**\n`;
    const line8 = `▫️ Asignación automática de roles de Ciudadano\n`;
    const line9 = `▫️ Sincronización de tu apodo en Discord`;
    
    const descriptionText = line1 + line2 + line3 + line4 + line5 + line6 + line7 + line8 + line9;
        
    const imageUrl = 'https://images.alphacoders.com/133/1338018.png';
    const footerText = 'V-Sync v3.0 Powered by Cypher';
    
    const embed = new EmbedBuilder();
    embed.setColor(embedColor);
    embed.setAuthor({ name: authorName, iconURL: authorIcon });
    embed.setTitle(embedTitle);
    embed.setDescription(descriptionText);
    embed.setImage(imageUrl);
    embed.setFooter({ text: footerText });

    const verifyPath = '/auth/login';
    const verifyUrl = `${finalBaseUrl}${verifyPath}`;
    
    const verifyButton = new ButtonBuilder();
    verifyButton.setLabel('Vincular Cuenta (V-Sync)');
    verifyButton.setStyle(ButtonStyle.Link);
    verifyButton.setURL(verifyUrl);
    verifyButton.setEmoji('🔗');
    
    const supportButton = new ButtonBuilder();
    supportButton.setCustomId('help_verify');
    supportButton.setLabel('¿Necesitas Ayuda?');
    supportButton.setStyle(ButtonStyle.Secondary);
    supportButton.setEmoji('❓');

    const actionRow = new ActionRowBuilder();
    actionRow.addComponents(verifyButton, supportButton);
    
    const payload = { 
        embeds: [embed], 
        components: [actionRow] 
    };
    
    return payload;
}

module.exports = { createVerificationCard };