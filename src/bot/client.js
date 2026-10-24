// src/bot/client.js
const { Client, GatewayIntentBits, REST, Routes, AuditLogEvent, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');
const db = require('../database/db');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration // Vital para interceptar moderaciones de Dyno y Discord
    ]
});

client.commands = new Map();
const cogsPath = path.join(__dirname, 'cogs');

if (fs.existsSync(cogsPath)) {
    const cogFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));
    for (const file of cogFiles) {
        try {
            const cog = require(path.join(cogsPath, file));
            if (cog.commands && Array.isArray(cog.commands)) {
                for (const cmd of cog.commands) {
                    if (cmd.data && cmd.data.name) client.commands.set(cmd.data.name, cmd);
                }
                logger.info(`Cog cargado: [${cog.category || file}]`);
            }
        } catch (err) {
            logger.error(`Error al cargar el cog ${file}:`, err.message);
        }
    }
}

// ==========================================
// INTERCEPTOR DE AUDITORÍA EN TIEMPO REAL
// (Captura Dyno, MEE6, Carl-bot y Discord UI)
// ==========================================
client.on(Events.GuildAuditLogEntryCreate, async (auditEntry, guild) => {
    try {
        const { action, executorId, targetId, reason } = auditEntry;
        if (!executorId) return;

        let responsibleStaffId = executorId;
        let sourceName = 'Discord UI';

        // Si la acción la ejecutó un bot (ej. Dyno)
        const executorUser = await client.users.fetch(executorId).catch(() => null);
        if (executorUser && executorUser.bot) {
            sourceName = executorUser.username; // Dyno, MEE6, etc.
            
            // Extracción de moderador en razones típicas de Dyno: "[Mod#1234]: Razón" o "Mod (123456): Razón"
            if (reason) {
                const matchTag = reason.match(/\[([^\]]+)\]/);
                const matchId = reason.match(/\b(\d{17,20})\b/);
                
                if (matchId) {
                    responsibleStaffId = matchId[1];
                } else if (matchTag) {
                    const tagOrName = matchTag[1].trim();
                    const foundMember = guild.members.cache.find(m => m.user.tag === tagOrName || m.user.username === tagOrName);
                    if (foundMember) responsibleStaffId = foundMember.id;
                }
            }
        }

        // Si el ejecutor sigue siendo el propio bot (Cypher), omitimos para no duplicar
        if (responsibleStaffId === client.user.id) return;

        // Mapeo de tipos de auditoría
        if (action === AuditLogEvent.MemberBanAdd) {
            db.logStaffAction(responsibleStaffId, 'bans', `Ban a <@${targetId}> | ${reason || 'Sin razón'}`, sourceName);
            logger.info(`[AUDIT] Baneo detectado de ${sourceName} asignado a Staff ID: ${responsibleStaffId}`);
        } else if (action === AuditLogEvent.MemberKick) {
            db.logStaffAction(responsibleStaffId, 'kicks', `Kick a <@${targetId}> | ${reason || 'Sin razón'}`, sourceName);
            logger.info(`[AUDIT] Expulsión detectada de ${sourceName} asignada a Staff ID: ${responsibleStaffId}`);
        } else if (action === AuditLogEvent.MemberUpdate) {
            const timeoutChange = auditEntry.changes?.find(c => c.key === 'communication_disabled_until');
            if (timeoutChange && timeoutChange.new) {
                db.logStaffAction(responsibleStaffId, 'timeouts', `Timeout a <@${targetId}>`, sourceName);
                logger.info(`[AUDIT] Timeout detectado de ${sourceName} asignado a Staff ID: ${responsibleStaffId}`);
            }
        }
    } catch (err) {
        logger.error('Error procesando entrada de auditoría:', err.message);
    }
});

client.once('clientReady', async () => {
    logger.success(`Cypher Engine conectado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(config.botToken);
    const slashCommandsPayload = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());

    try {
        if (config.clientId && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: slashCommandsPayload }
            );
            logger.success(`¡Sincronización exitosa! ${slashCommandsPayload.length} comandos slash registrados.`);
        }
    } catch (err) {
        logger.error('Error registrando comandos:', err.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
        await cmd.execute(interaction);
    } catch (err) {
        logger.error(`Excepción en /${interaction.commandName}:`, err.message);
        const reply = { content: '❌ Ocurrió un error al procesar esta instrucción.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
        else await interaction.reply(reply).catch(() => null);
    }
});

module.exports = { client };