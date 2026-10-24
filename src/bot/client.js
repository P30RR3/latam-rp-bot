// src/bot/client.js
const { Client, GatewayIntentBits, REST, Routes, AuditLogEvent, Events, PermissionFlagsBits } = require('discord.js');
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
        GatewayIntentBits.GuildModeration
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
            logger.error(`Error cargando cog ${file}:`, err.message);
        }
    }
}

// =========================================================================
// 1. DETECTOR DE COMANDOS EN CHAT (DRACOGUARD, DYNO, CARL, ETC.)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim().toLowerCase();

    // Detección de Tickets (!claim, ?claim, -claim, !reclamar)
    if (content.match(/^[?!.-](claim|reclamar|atender)\b/)) {
        db.logStaffAction(message.author.id, 'tickets', `Ticket atendido en #${message.channel.name}`, 'Chat');
        logger.info(`[TICKETS] Reclamo registrado para: ${message.author.tag}`);
        return;
    }

    // Prefijos ampliados: d!, dg!, ?, !, ., -, ;
    const match = content.match(/^(?:d!|dg!|[?!.\-;])(warn|advertir|aviso|mute|tempmute|timeout|kick|ban)\b/i);
    if (!match) return;

    const member = message.member;
    if (!member) return;

    const isStaff = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                    member.permissions.has(PermissionFlagsBits.KickMembers) ||
                    member.permissions.has(PermissionFlagsBits.BanMembers) ||
                    member.permissions.has(PermissionFlagsBits.ManageMessages);

    if (!isStaff) return;

    const cmd = match[1].toLowerCase();
    const targetMention = message.mentions.users.first();
    const targetName = targetMention ? targetMention.tag : 'Usuario';

    if (cmd === 'warn' || cmd === 'advertir' || cmd === 'aviso') {
        db.logStaffAction(message.author.id, 'warns', `Warn vía comando a ${targetName}`, 'Chat-Prefix');
        logger.info(`[STAFF TRACKER] Warn por prefijo acreditado a: ${message.author.tag}`);
    } else if (cmd === 'mute' || cmd === 'tempmute' || cmd === 'timeout') {
        db.logStaffAction(message.author.id, 'timeouts', `Mute a ${targetName}`, 'Chat-Prefix');
    } else if (cmd === 'kick') {
        db.logStaffAction(message.author.id, 'kicks', `Kick a ${targetName}`, 'Chat-Prefix');
    } else if (cmd === 'ban') {
        db.logStaffAction(message.author.id, 'bans', `Ban a ${targetName}`, 'Chat-Prefix');
    }
});

// =========================================================================
// 2. INTERCEPTOR HEURÍSTICO DE RESPUESTAS Y LOGS (DRACOGUARD, DYNO, ETC.)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.author.bot) return;

    // Ignorar si es el propio bot de LATAM RP
    if (message.author.id === client.user.id) return;

    // 1. Análisis de Embeds generados por DracoGuard, Dyno, Ticket Tool, etc.
    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            const title = (embed.title || embed.author?.name || '').toLowerCase();
            const description = (embed.description || '').toLowerCase();
            const footer = (embed.footer?.text || '').toLowerCase();
            const fieldsText = (embed.fields || []).map(f => `${f.name} ${f.value}`).join(' ').toLowerCase();
            const fullContent = `${title} ${description} ${footer} ${fieldsText}`;

            // --- CASO A: WARN DETECTADO DE DRACOGUARD / DYNO ---
            if (fullContent.includes('warn') || fullContent.includes('advertencia') || fullContent.includes('advertido') || fullContent.includes('aviso')) {
                let staffId = null;

                // Buscar mención de moderador en fields
                for (const f of embed.fields || []) {
                    const fname = f.name.toLowerCase();
                    if (fname.includes('moderador') || fname.includes('staff') || fname.includes('responsable') || fname.includes('autor')) {
                        const m = f.value.match(/<@!?(\d{17,20})>/) || f.value.match(/\b(\d{17,20})\b/);
                        if (m) staffId = m[1];
                    }
                }

                // Si no estaba en fields, buscar en la descripción o footer
                if (!staffId) {
                    const descMatch = (embed.description || '').match(/(?:moderador|staff|responsable|por)[:\s]*<@!?(\d{17,20})>/i);
                    if (descMatch) staffId = descMatch[1];
                }

                if (staffId) {
                    const staffUser = await client.users.fetch(staffId).catch(() => null);
                    if (staffUser && !staffUser.bot) {
                        db.logStaffAction(staffId, 'warns', `Warn detectado de ${message.author.username}`, message.author.username);
                        logger.success(`[DRACOGUARD/DYNO INTERCEPTOR] Warn acreditado a Staff Humano: ${staffUser.tag}`);
                    }
                }
            }

            // --- CASO B: TICKET RECLAMADO DE CUALQUIER BOT ---
            if (fullContent.includes('claimed by') || fullContent.includes('reclamado por') || fullContent.includes('atendido por')) {
                const matchUser = fullContent.match(/<@!?(\d{17,20})>/);
                if (matchUser) {
                    const staffId = matchUser[1];
                    const staffUser = await client.users.fetch(staffId).catch(() => null);
                    if (staffUser && !staffUser.bot) {
                        db.logStaffAction(staffId, 'tickets', `Ticket reclamado en #${message.channel.name}`, message.author.username);
                        logger.success(`[TICKETS] Reclamo detectado de ${message.author.username} para: ${staffUser.tag}`);
                    }
                }
            }
        }
    }

    // 2. Análisis de mensajes de texto plano de Dyno o DracoGuard (Sin Embed)
    const rawText = message.content.toLowerCase();
    if (rawText.includes('warned') || rawText.includes('advertido')) {
        const matchUser = message.content.match(/<@!?(\d{17,20})>/);
        // Si hay una interacción previa en el canal por un staff, se indexa
    }
});

// =========================================================================
// 3. AUDITORÍA NATIVA DE DISCORD
// =========================================================================
client.on(Events.GuildAuditLogEntryCreate, async (auditEntry, guild) => {
    try {
        const { action, executorId, targetId, reason } = auditEntry;
        if (!executorId) return;

        const executorUser = await client.users.fetch(executorId).catch(() => null);
        if (!executorUser) return;

        let responsibleStaffId = null;
        let sourceName = 'Discord UI';

        if (!executorUser.bot) {
            responsibleStaffId = executorUser.id;
        } else {
            sourceName = executorUser.username;
            if (reason) {
                const matchId = reason.match(/\b(\d{17,20})\b/);
                const matchTag = reason.match(/\[([^\]]+)\]/);
                if (matchId) responsibleStaffId = matchId[1];
                else if (matchTag) {
                    const found = guild.members.cache.find(m => m.user.tag === matchTag[1].trim() || m.user.username === matchTag[1].trim());
                    if (found) responsibleStaffId = found.id;
                }
            }
        }

        if (!responsibleStaffId) return;
        const verifiedHuman = await client.users.fetch(responsibleStaffId).catch(() => null);
        if (!verifiedHuman || verifiedHuman.bot) return;

        if (action === AuditLogEvent.MemberBanAdd) {
            db.logStaffAction(responsibleStaffId, 'bans', `Ban a <@${targetId}>`, sourceName);
        } else if (action === AuditLogEvent.MemberKick) {
            db.logStaffAction(responsibleStaffId, 'kicks', `Kick a <@${targetId}>`, sourceName);
        } else if (action === AuditLogEvent.MemberUpdate) {
            const timeoutChange = auditEntry.changes?.find(c => c.key === 'communication_disabled_until');
            if (timeoutChange && timeoutChange.new) {
                db.logStaffAction(responsibleStaffId, 'timeouts', `Timeout a <@${targetId}>`, sourceName);
            }
        }
    } catch (err) {
        logger.error('Error en auditoría:', err.message);
    }
});

client.once('clientReady', async () => {
    logger.success(`Cypher Engine conectado como ${client.user.tag}`);

    const botIds = client.users.cache.filter(u => u.bot).map(u => u.id);
    db.purgeBotEntries(botIds);

    const rest = new REST({ version: '10' }).setToken(config.botToken);
    const slashCommandsPayload = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());

    try {
        if (config.clientId && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: slashCommandsPayload }
            );
            logger.success(`30 Comandos Slash sincronizados con éxito.`);
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
        const reply = { content: '❌ Error al procesar el comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
        else await interaction.reply(reply).catch(() => null);
    }
});

module.exports = { client };