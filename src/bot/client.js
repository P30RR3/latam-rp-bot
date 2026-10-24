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
        GatewayIntentBits.MessageContent, // Requiere estar ON en Discord Developer Portal
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
// 1. ESCUCHA DE COMANDOS DE STAFF EN CHAT (DYNO, TICKETS, ETC.)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim().toLowerCase();

    // Detección de comandos de tickets (!claim, ?claim, -claim, !reclamar)
    if (content.match(/^[?!.-](claim|reclamar|atender)\b/)) {
        db.logStaffAction(message.author.id, 'tickets', `Ticket atendido en #${message.channel.name}`, 'Chat-Claim');
        logger.info(`[TICKET TRACKER] Ticket reclamado por ${message.author.tag}`);
        return;
    }

    // Detección de comandos de moderación de Dyno / Carl
    const match = content.match(/^[?!.-](warn|advertir|mute|tempmute|timeout|kick|ban|expulsar)\b/);
    if (!match) return;

    const member = message.member;
    if (!member) return;

    const isStaff = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                    member.permissions.has(PermissionFlagsBits.KickMembers) ||
                    member.permissions.has(PermissionFlagsBits.BanMembers) ||
                    member.permissions.has(PermissionFlagsBits.ManageMessages);

    if (!isStaff) return;

    const cmd = match[1];
    const targetMention = message.mentions.users.first();
    const targetName = targetMention ? targetMention.tag : 'Usuario';

    if (cmd === 'warn' || cmd === 'advertir') {
        db.logStaffAction(message.author.id, 'warns', `Warn vía Dyno a ${targetName}`, 'Dyno');
    } else if (cmd === 'mute' || cmd === 'tempmute' || cmd === 'timeout') {
        db.logStaffAction(message.author.id, 'timeouts', `Mute vía Dyno a ${targetName}`, 'Dyno');
    } else if (cmd === 'kick' || cmd === 'expulsar') {
        db.logStaffAction(message.author.id, 'kicks', `Kick vía Dyno a ${targetName}`, 'Dyno');
    } else if (cmd === 'ban') {
        db.logStaffAction(message.author.id, 'bans', `Ban vía Dyno a ${targetName}`, 'Dyno');
    }
});

// =========================================================================
// 2. PARSER DE BOT DE TICKETS (TICKET TOOL / TICKETS BOT)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.author.bot) return;

    // Detectar si un bot de tickets envió un mensaje de reclamo
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const fullText = `${embed.title || ''} ${embed.description || ''} ${(embed.fields || []).map(f => `${f.name} ${f.value}`).join(' ')}`.toLowerCase();

        if (fullText.includes('claimed by') || fullText.includes('reclamado por') || fullText.includes('atendido por')) {
            const matchUser = fullText.match(/<@!?(\d{17,20})>/);
            if (matchUser) {
                const staffId = matchUser[1];
                const staffUser = await client.users.fetch(staffId).catch(() => null);
                if (staffUser && !staffUser.bot) {
                    db.logStaffAction(staffId, 'tickets', `Reclamo de ticket en #${message.channel.name}`, 'TicketBot-Embed');
                    logger.info(`[TICKET TRACKER] Ticket detectado de bot asignado a: ${staffUser.tag}`);
                }
            }
        }
    }
});

// =========================================================================
// 3. AUDITORÍA NATIVA DE DISCORD (SOLO HUMANOS)
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
        logger.error('Error en auditoría en vivo:', err.message);
    }
});

client.once('clientReady', async () => {
    logger.success(`Cypher Engine conectado como ${client.user.tag}`);

    // Limpieza automática de bots
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