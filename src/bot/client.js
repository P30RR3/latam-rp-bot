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
        GatewayIntentBits.MessageContent, // ¡ESTO DEBE ESTAR ACTIVO EN EL PORTAL DE DISCORD!
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
// MOTOR HEURÍSTICO UNIVERSAL Y DEDUPLICACIÓN (CYPHER ENGINE V2)
// =========================================================================
const dedupCache = new Set();

// Palabras clave ampliadas
const WARN_KEYWORDS = [/\bwarn(ed|ing|s)?\b/i, /\badvert(encia|ido|ir)?\b/i, /\binfracci[oó]n\b/i, /\bstrike\b/i, /\baviso\b/i];
const MOD_IDENTIFIERS = [/(?:moderador|moderator|staff|sancionado por|warned by|issued by|responsable|autor|oficial)\s*[:=-]?\s*(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/i];
const TARGET_IDENTIFIERS = [/(?:usuario|user|member|miembro|target|sancionado|infractor)\s*[:=-]?\s*(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/i];

async function processModerationMessage(message) {
    if (!message.guild || message.author.id === client.user.id) return;

    // 1. Detección de Tickets (Chat normal)
    const content = message.content.trim().toLowerCase();
    if (!message.author.bot && content.match(/^[?!.-](claim|reclamar|atender)\b/)) {
        const dedupKey = `ticket:${message.guildId}:${message.author.id}:${Math.floor(Date.now() / 60000)}`;
        if (!dedupCache.has(dedupKey)) {
            dedupCache.add(dedupKey);
            db.logStaffAction(message.author.id, 'tickets', `Ticket atendido en #${message.channel.name}`, 'Chat');
            logger.info(`[TICKETS] Reclamo registrado para: ${message.author.tag}`);
            setTimeout(() => dedupCache.delete(dedupKey), 65000);
        }
        return;
    }

    // 2. Análisis Profundo de Embeds (Solo Bots)
    if (!message.author.bot) return;

    const textSegments = [];
    if (message.content) textSegments.push(message.content);

    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            if (embed.title) textSegments.push(embed.title);
            if (embed.description) textSegments.push(embed.description);
            if (embed.author?.name) textSegments.push(embed.author.name);
            if (embed.footer?.text) textSegments.push(embed.footer.text);
            if (embed.fields) {
                for (const field of embed.fields) {
                    textSegments.push(`${field.name}: ${field.value}`);
                }
            }
        }
    }

    // Limpiamos TODO el formato Markdown (**, __, ``, ~~) para que el Regex no se asfixie
    const rawText = textSegments.join('\n');
    const fullText = rawText.replace(/[*_`~]/g, '').toLowerCase();
    
    if (!fullText.trim()) return;

    // A. Detección de Tickets reclamados por botones/embeds
    if (fullText.match(/(?:claimed by|reclamado por|atendido por)\s*[:=-]?\s*<@!?(\d{17,20})>/i)) {
        const matchUser = fullText.match(/<@!?(\d{17,20})>/);
        if (matchUser) {
            const staffId = matchUser[1];
            const dedupKey = `ticket_bot:${message.guildId}:${staffId}:${Math.floor(Date.now() / 60000)}`;
            if (!dedupCache.has(dedupKey)) {
                dedupCache.add(dedupKey);
                db.logStaffAction(staffId, 'tickets', `Ticket reclamado en #${message.channel.name}`, message.author.username);
                logger.success(`[TICKETS] Reclamo detectado vía ${message.author.username} para ID: ${staffId}`);
                setTimeout(() => dedupCache.delete(dedupKey), 65000);
            }
        }
        return;
    }

    // B. Detección de Warns (DracoGuard, Dyno, Carl, etc.)
    const isWarn = WARN_KEYWORDS.some(regex => regex.test(fullText));
    if (!isWarn) return;

    let staffId = null;

    // ESTRATEGIA 1: Interacciones Nativas (Infalible si el Staff usó un Slash Command de Dyno/DracoGuard)
    if (message.interaction && message.interaction.user) {
        staffId = message.interaction.user.id;
    }

    // ESTRATEGIA 2: Extracción por Regex en el texto limpio
    if (!staffId) {
        for (const regex of MOD_IDENTIFIERS) {
            const match = fullText.match(regex);
            if (match) {
                staffId = match[1] || match[2];
                break;
            }
        }
    }

    // Si detectó que es un warn pero no encontró al Staff, lo imprime en consola para depurar
    if (!staffId) {
        console.log(`\n[CYPHER DEBUG] ⚠️ Se detectó un Warn de ${message.author.username}, pero no se encontró la ID del Staff.`);
        console.log(`[CYPHER DEBUG] Texto analizado (sin markdown):\n${fullText}\n`);
        return;
    }

    let targetId = 'unknown';
    for (const regex of TARGET_IDENTIFIERS) {
        const match = fullText.match(regex);
        if (match) {
            targetId = match[1] || match[2];
            break;
        }
    }

    // Ventana de deduplicación de 30 segundos
    const windowBucket = Math.floor(Date.now() / 30000);
    const deduplicationKey = `warn:${message.guildId}:${staffId}:${targetId}:${windowBucket}`;

    if (dedupCache.has(deduplicationKey)) return;
    dedupCache.add(deduplicationKey);
    setTimeout(() => dedupCache.delete(deduplicationKey), 35000);

    const staffUser = await client.users.fetch(staffId).catch(() => null);
    if (staffUser && !staffUser.bot) {
        db.logStaffAction(staffId, 'warns', `Warn detectado vía ${message.author.username}`, message.author.username);
        logger.success(`[HEURISTIC ENGINE] Warn acreditado a Staff Humano: ${staffUser.tag} (Bot: ${message.author.username})`);
    }
}

// Escuchar creación y edición de mensajes
client.on(Events.MessageCreate, processModerationMessage);
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (newMessage.partial) await newMessage.fetch().catch(() => null);
    processModerationMessage(newMessage);
});

// =========================================================================
// AUDITORÍA NATIVA DE DISCORD (BANS, KICKS, TIMEOUTS)
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

        const dedupKey = `audit:${action}:${guild.id}:${responsibleStaffId}:${targetId}:${Math.floor(Date.now() / 30000)}`;
        if (dedupCache.has(dedupKey)) return;
        dedupCache.add(dedupKey);
        setTimeout(() => dedupCache.delete(dedupKey), 35000);

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