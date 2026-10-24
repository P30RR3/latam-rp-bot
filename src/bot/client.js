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
// 1. ESCUCHA DE COMANDOS DE MODERACIÓN EN CHAT (DYNO, CARL-BOT, ETC.)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    // Si el autor es un bot o no es del servidor, ignorar
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim().toLowerCase();
    // Prefijos típicos: ?, !, ., -
    const match = content.match(/^[?!.-](warn|advertir|mute|tempmute|timeout|kick|ban|expulsar)\b/);
    if (!match) return;

    // Verificar si el usuario que ejecutó el comando tiene permisos de staff
    const member = message.member;
    if (!member) return;

    const hasStaffPerms = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                          member.permissions.has(PermissionFlagsBits.KickMembers) ||
                          member.permissions.has(PermissionFlagsBits.BanMembers) ||
                          member.permissions.has(PermissionFlagsBits.ManageMessages);

    if (!hasStaffPerms) return;

    const cmd = match[1];
    const targetMention = message.mentions.users.first();
    const targetName = targetMention ? targetMention.tag : 'Usuario';

    if (cmd === 'warn' || cmd === 'advertir') {
        db.logStaffAction(message.author.id, 'warns', `Warn con Dyno a ${targetName}`, 'Dyno/Chat');
        logger.info(`[STAFF TRACKER] Warn ejecutado por HUMANO: ${message.author.tag}`);
    } else if (cmd === 'mute' || cmd === 'tempmute' || cmd === 'timeout') {
        db.logStaffAction(message.author.id, 'timeouts', `Mute con Dyno a ${targetName}`, 'Dyno/Chat');
        logger.info(`[STAFF TRACKER] Mute ejecutado por HUMANO: ${message.author.tag}`);
    } else if (cmd === 'kick' || cmd === 'expulsar') {
        db.logStaffAction(message.author.id, 'kicks', `Kick con Dyno a ${targetName}`, 'Dyno/Chat');
        logger.info(`[STAFF TRACKER] Kick ejecutado por HUMANO: ${message.author.tag}`);
    } else if (cmd === 'ban') {
        db.logStaffAction(message.author.id, 'bans', `Ban con Dyno a ${targetName}`, 'Dyno/Chat');
        logger.info(`[STAFF TRACKER] Ban ejecutado por HUMANO: ${message.author.tag}`);
    }
});

// =========================================================================
// 2. PARSER DE EMBEDS DE REGISTROS DE DYNO (CANALES DE LOGS)
// =========================================================================
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.author.bot) return;

    // Solo nos interesa si es un bot de moderación como Dyno
    if (!message.author.username.toLowerCase().includes('dyno') && !message.author.username.toLowerCase().includes('carl')) return;

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const title = (embed.title || embed.author?.name || '').toLowerCase();
        const description = (embed.description || '').toLowerCase();

        // Extraer moderador responsable dentro de los campos del Embed de Dyno
        let modId = null;
        for (const field of embed.fields || []) {
            if (field.name.toLowerCase().includes('moderator') || field.name.toLowerCase().includes('moderador')) {
                const matchId = field.value.match(/\b(\d{17,20})\b/);
                if (matchId) modId = matchId[1];
            }
        }

        if (!modId) {
            const descMatch = (embed.description || '').match(/(?:moderator|moderador):\s*<@!?(\d{17,20})>/i);
            if (descMatch) modId = descMatch[1];
        }

        if (modId) {
            // Verificar que no le estemos dando puntos a otro bot
            const modUser = await client.users.fetch(modId).catch(() => null);
            if (modUser && !modUser.bot) {
                if (title.includes('warn') || description.includes('warn')) {
                    db.logStaffAction(modId, 'warns', 'Warn detectado en Logs de Dyno', 'Dyno-Log');
                } else if (title.includes('mute') || description.includes('mute')) {
                    db.logStaffAction(modId, 'timeouts', 'Mute detectado en Logs de Dyno', 'Dyno-Log');
                } else if (title.includes('ban')) {
                    db.logStaffAction(modId, 'bans', 'Ban detectado en Logs de Dyno', 'Dyno-Log');
                } else if (title.includes('kick')) {
                    db.logStaffAction(modId, 'kicks', 'Kick detectado en Logs de Dyno', 'Dyno-Log');
                }
            }
        }
    }
});

// =========================================================================
// 3. AUDITORÍA NATIVA DE DISCORD (CON FILTRO INFRANQUEABLE ANTI-BOT)
// =========================================================================
client.on(Events.GuildAuditLogEntryCreate, async (auditEntry, guild) => {
    try {
        const { action, executorId, targetId, reason } = auditEntry;
        if (!executorId) return;

        const executorUser = await client.users.fetch(executorId).catch(() => null);
        if (!executorUser) return;

        let responsibleStaffId = null;
        let sourceName = 'Discord UI';

        // SI ES HUMANO: Se le asigna directamente
        if (!executorUser.bot) {
            responsibleStaffId = executorUser.id;
        } else {
            // SI ES UN BOT (Ej: Dyno ejecutó el Ban en la API): Extraer al humano de la razón
            sourceName = executorUser.username;
            if (reason) {
                const matchId = reason.match(/\b(\d{17,20})\b/);
                const matchTag = reason.match(/\[([^\]]+)\]/);
                if (matchId) {
                    responsibleStaffId = matchId[1];
                } else if (matchTag) {
                    const found = guild.members.cache.find(m => m.user.tag === matchTag[1].trim() || m.user.username === matchTag[1].trim());
                    if (found) responsibleStaffId = found.id;
                }
            }
        }

        // BARRERA DE HIERRO: Si no se logró extraer a un humano, ABORTAR. Jamás dar puntos al bot.
        if (!responsibleStaffId) return;

        const verifiedHuman = await client.users.fetch(responsibleStaffId).catch(() => null);
        if (!verifiedHuman || verifiedHuman.bot) return; // Si sigue siendo bot, descartar.

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

    // Limpieza automática preventiva de cualquier bot guardado previamente
    const knownBotIds = client.users.cache.filter(u => u.bot).map(u => u.id);
    const cleaned = db.purgeBotEntries(knownBotIds);
    if (cleaned > 0) logger.warn(`[PURGA] Se eliminaron ${cleaned} cuentas bot del Staff Ranking.`);

    const rest = new REST({ version: '10' }).setToken(config.botToken);
    const slashCommandsPayload = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());

    try {
        if (config.clientId && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: slashCommandsPayload }
            );
            logger.success(`Comandos sincronizados con éxito.`);
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