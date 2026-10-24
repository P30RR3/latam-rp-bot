// src/bot/client.js
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    AuditLogEvent, 
    Events, 
    ActivityType,
    PermissionFlagsBits
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');
const db = require('../database/db');

const clientIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
];

const clientOptions = {
    intents: clientIntents
};

const client = new Client(clientOptions);
client.commands = new Map();

const cogsPath = path.join(__dirname, 'cogs');
const dedupCache = new Set();

// Carga de Cogs expandida y con manejo de errores detallado
const checkCogsDirectory = fs.existsSync(cogsPath);
if (checkCogsDirectory) {
    const allFiles = fs.readdirSync(cogsPath);
    const cogFiles = allFiles.filter(file => file.endsWith('.js'));
    
    for (const file of cogFiles) {
        const fullPath = path.join(cogsPath, file);
        try {
            const cogModule = require(fullPath);
            const hasCommands = cogModule.commands;
            const isArray = Array.isArray(hasCommands);
            
            if (hasCommands && isArray) {
                const commandsList = cogModule.commands;
                for (const cmd of commandsList) {
                    const cmdData = cmd.data;
                    const cmdName = cmdData.name;
                    if (cmdData && cmdName) {
                        client.commands.set(cmdName, cmd);
                    }
                }
                const categoryName = cogModule.category || file;
                logger.info(`Cog cargado exitosamente: [${categoryName}]`);
            }
        } catch (err) {
            const errorMessage = err.message;
            logger.error(`Error crítico cargando cog ${file}:`, errorMessage);
        }
    }
}

// =========================================================================
// MOTOR HEURÍSTICO UNIVERSAL Y DEDUPLICACIÓN (CYPHER ENGINE V2)
// =========================================================================

const WARN_KEYWORDS = [
    /\bwarn(ed|ing|s)?\b/i, 
    /\badvert(encia|ido|ir)?\b/i, 
    /\binfracci[oó]n\b/i, 
    /\bstrike\b/i, 
    /\baviso\b/i
];

const MOD_IDENTIFIERS = [
    /(?:moderador|moderator|staff|sancionado por|warned by|issued by|responsable|autor|oficial)\s*[:=-]?\s*(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/i
];

const TARGET_IDENTIFIERS = [
    /(?:usuario|user|member|miembro|target|sancionado|infractor)\s*[:=-]?\s*(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/i
];

async function processModerationMessage(message) {
    const guildInstance = message.guild;
    const messageAuthor = message.author;
    const authorId = messageAuthor.id;
    const clientId = client.user.id;
    
    if (!guildInstance) return;
    if (authorId === clientId) return;

    const rawContent = message.content;
    const trimmedContent = rawContent.trim();
    const lowerContent = trimmedContent.toLowerCase();
    const isBotAuthor = messageAuthor.bot;

    // 1. Detección de Tickets (Chat normal)
    const ticketRegex = /^[?!.-](claim|reclamar|atender)\b/;
    const isTicketCommand = lowerContent.match(ticketRegex);
    
    if (!isBotAuthor && isTicketCommand) {
        const guildId = message.guildId;
        const channelName = message.channel.name;
        const timeMinute = Math.floor(Date.now() / 60000);
        const dedupKey = `ticket:${guildId}:${authorId}:${timeMinute}`;
        
        const isCached = dedupCache.has(dedupKey);
        if (!isCached) {
            dedupCache.add(dedupKey);
            const logDetails = `Ticket atendido en #${channelName}`;
            db.logStaffAction(authorId, 'tickets', logDetails, 'Chat');
            
            const authorTag = messageAuthor.tag;
            logger.info(`[TICKETS] Reclamo registrado para: ${authorTag}`);
            
            const cacheTimeout = 65000;
            setTimeout(() => {
                dedupCache.delete(dedupKey);
            }, cacheTimeout);
        }
        return;
    }

    // 2. Análisis Profundo de Embeds (Solo Bots)
    if (!isBotAuthor) return;

    const textSegments = [];
    if (rawContent) {
        textSegments.push(rawContent);
    }

    const messageEmbeds = message.embeds;
    const hasEmbeds = messageEmbeds && messageEmbeds.length > 0;
    
    if (hasEmbeds) {
        for (const embed of messageEmbeds) {
            const embedTitle = embed.title;
            if (embedTitle) textSegments.push(embedTitle);
            
            const embedDesc = embed.description;
            if (embedDesc) textSegments.push(embedDesc);
            
            const embedAuthor = embed.author;
            if (embedAuthor && embedAuthor.name) textSegments.push(embedAuthor.name);
            
            const embedFooter = embed.footer;
            if (embedFooter && embedFooter.text) textSegments.push(embedFooter.text);
            
            const embedFields = embed.fields;
            if (embedFields) {
                for (const field of embedFields) {
                    const fieldName = field.name;
                    const fieldValue = field.value;
                    const combinedField = `${fieldName}: ${fieldValue}`;
                    textSegments.push(combinedField);
                }
            }
        }
    }

    const joinedText = textSegments.join('\n');
    const markdownRegex = /[*_`~]/g;
    const cleanText = joinedText.replace(markdownRegex, '');
    const fullText = cleanText.toLowerCase();
    
    const isTextEmpty = !fullText.trim();
    if (isTextEmpty) return;

    // A. Detección de Tickets reclamados por botones/embeds
    const claimRegex = /(?:claimed by|reclamado por|atendido por)\s*[:=-]?\s*<@!?(\d{17,20})>/i;
    const isClaimedEmbed = fullText.match(claimRegex);
    
    if (isClaimedEmbed) {
        const userMatchRegex = /<@!?(\d{17,20})>/;
        const matchUser = fullText.match(userMatchRegex);
        
        if (matchUser) {
            const staffId = matchUser[1];
            const guildId = message.guildId;
            const timeMinute = Math.floor(Date.now() / 60000);
            const dedupKey = `ticket_bot:${guildId}:${staffId}:${timeMinute}`;
            
            const isCached = dedupCache.has(dedupKey);
            if (!isCached) {
                dedupCache.add(dedupKey);
                const channelName = message.channel.name;
                const botUsername = messageAuthor.username;
                const logDetails = `Ticket reclamado en #${channelName}`;
                
                db.logStaffAction(staffId, 'tickets', logDetails, botUsername);
                logger.success(`[TICKETS] Reclamo detectado vía ${botUsername} para ID: ${staffId}`);
                
                const cacheTimeout = 65000;
                setTimeout(() => {
                    dedupCache.delete(dedupKey);
                }, cacheTimeout);
            }
        }
        return;
    }

    // B. Detección de Warns (DracoGuard, Dyno, Carl, etc.)
    let isWarn = false;
    for (const regex of WARN_KEYWORDS) {
        const testResult = regex.test(fullText);
        if (testResult) {
            isWarn = true;
            break;
        }
    }
    
    if (!isWarn) return;

    let staffId = null;
    const messageInteraction = message.interaction;

    if (messageInteraction) {
        const interactionUser = messageInteraction.user;
        if (interactionUser) {
            staffId = interactionUser.id;
        }
    }

    if (!staffId) {
        for (const regex of MOD_IDENTIFIERS) {
            const match = fullText.match(regex);
            if (match) {
                const firstGroup = match[1];
                const secondGroup = match[2];
                staffId = firstGroup || secondGroup;
                break;
            }
        }
    }

    if (!staffId) {
        const botUsername = messageAuthor.username;
        console.log(`\n[CYPHER DEBUG] ⚠️ Se detectó un Warn de ${botUsername}, pero no se encontró la ID del Staff.`);
        console.log(`[CYPHER DEBUG] Texto analizado (sin markdown):\n${fullText}\n`);
        return;
    }

    let targetId = 'unknown';
    for (const regex of TARGET_IDENTIFIERS) {
        const match = fullText.match(regex);
        if (match) {
            const firstGroup = match[1];
            const secondGroup = match[2];
            targetId = firstGroup || secondGroup;
            break;
        }
    }

    const guildId = message.guildId;
    const windowBucket = Math.floor(Date.now() / 30000);
    const deduplicationKey = `warn:${guildId}:${staffId}:${targetId}:${windowBucket}`;

    const isWarnCached = dedupCache.has(deduplicationKey);
    if (isWarnCached) return;
    
    dedupCache.add(deduplicationKey);
    const warnCacheTimeout = 35000;
    setTimeout(() => {
        dedupCache.delete(deduplicationKey);
    }, warnCacheTimeout);

    try {
        const staffUser = await client.users.fetch(staffId);
        const isStaffBot = staffUser.bot;
        
        if (staffUser && !isStaffBot) {
            const botUsername = messageAuthor.username;
            const logDetails = `Warn detectado vía ${botUsername}`;
            db.logStaffAction(staffId, 'warns', logDetails, botUsername);
            
            const staffTag = staffUser.tag;
            logger.success(`[HEURISTIC ENGINE] Warn acreditado a Staff Humano: ${staffTag} (Bot: ${botUsername})`);
        }
    } catch (error) {
        // Usuario no encontrado, se ignora
    }
}

client.on(Events.MessageCreate, processModerationMessage);

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    const isPartial = newMessage.partial;
    if (isPartial) {
        try {
            await newMessage.fetch();
        } catch (error) {
            return;
        }
    }
    processModerationMessage(newMessage);
});

// =========================================================================
// AUDITORÍA NATIVA DE DISCORD (BANS, KICKS, TIMEOUTS)
// =========================================================================
client.on(Events.GuildAuditLogEntryCreate, async (auditEntry, guild) => {
    try {
        const clientId = client.user.id;
        const botMember = await guild.members.fetch(clientId).catch(() => null);
        if (!botMember) return;
        
        const auditPermission = PermissionFlagsBits.ViewAuditLog;
        const hasAuditPerms = botMember.permissions.has(auditPermission);
        
        if (!hasAuditPerms) {
            const guildName = guild.name;
            logger.warn(`[SEGURIDAD] El bot no tiene permisos para ver el Registro de Auditoría en ${guildName}.`);
            return;
        }

        const actionType = auditEntry.action;
        const executorId = auditEntry.executorId;
        const targetId = auditEntry.targetId;
        const reasonText = auditEntry.reason;
        
        if (!executorId) return;

        const executorUser = await client.users.fetch(executorId).catch(() => null);
        if (!executorUser) return;

        let responsibleStaffId = null;
        let sourceName = 'Discord UI';
        const isExecutorBot = executorUser.bot;

        if (!isExecutorBot) {
            responsibleStaffId = executorUser.id;
        } else {
            const executorUsername = executorUser.username;
            sourceName = executorUsername;
            
            if (reasonText) {
                const idRegex = /\b(\d{17,20})\b/;
                const matchId = reasonText.match(idRegex);
                
                const tagRegex = /\[([^\]]+)\]/;
                const matchTag = reasonText.match(tagRegex);
                
                if (matchId) {
                    responsibleStaffId = matchId[1];
                } else if (matchTag) {
                    const extractedTag = matchTag[1].trim();
                    const guildMembers = guild.members.cache;
                    const foundMember = guildMembers.find(m => {
                        const userTag = m.user.tag;
                        const userName = m.user.username;
                        return userTag === extractedTag || userName === extractedTag;
                    });
                    
                    if (foundMember) {
                        responsibleStaffId = foundMember.id;
                    }
                }
            }
        }

        if (!responsibleStaffId) return;
        
        const verifiedHuman = await client.users.fetch(responsibleStaffId).catch(() => null);
        const isVerifiedBot = verifiedHuman ? verifiedHuman.bot : true;
        if (!verifiedHuman || isVerifiedBot) return;

        const guildId = guild.id;
        const timeBucket = Math.floor(Date.now() / 30000);
        const dedupKey = `audit:${actionType}:${guildId}:${responsibleStaffId}:${targetId}:${timeBucket}`;
        
        const isAuditCached = dedupCache.has(dedupKey);
        if (isAuditCached) return;
        
        dedupCache.add(dedupKey);
        const auditCacheTimeout = 35000;
        setTimeout(() => {
            dedupCache.delete(dedupKey);
        }, auditCacheTimeout);

        if (actionType === AuditLogEvent.MemberBanAdd) {
            const logMsg = `Ban a <@${targetId}>`;
            db.logStaffAction(responsibleStaffId, 'bans', logMsg, sourceName);
        } else if (actionType === AuditLogEvent.MemberKick) {
            const logMsg = `Kick a <@${targetId}>`;
            db.logStaffAction(responsibleStaffId, 'kicks', logMsg, sourceName);
        } else if (actionType === AuditLogEvent.MemberUpdate) {
            const auditChanges = auditEntry.changes;
            if (auditChanges) {
                const timeoutChange = auditChanges.find(c => c.key === 'communication_disabled_until');
                if (timeoutChange && timeoutChange.new) {
                    const logMsg = `Timeout a <@${targetId}>`;
                    db.logStaffAction(responsibleStaffId, 'timeouts', logMsg, sourceName);
                }
            }
        }
    } catch (err) {
        const errorMsg = err.message;
        logger.error('Error en auditoría:', errorMsg);
    }
});

client.once(Events.ClientReady, async () => {
    const botTag = client.user.tag;
    logger.success(`Cypher Engine conectado exitosamente como ${botTag}`);

    // MEJORA: Sistema de Presencia Dinámica (Status Rotativo)
    const activitiesList = [
        { name: 'LATAM RP', type: ActivityType.Watching },
        { name: 'Auditoría Staff', type: ActivityType.Playing },
        { name: 'Verificaciones V-Sync', type: ActivityType.Listening }
    ];
    
    let activityIndex = 0;
    const rotationInterval = 15000;
    
    setInterval(() => {
        const currentActivity = activitiesList[activityIndex];
        const activityName = currentActivity.name;
        const activityType = currentActivity.type;
        
        client.user.setActivity(activityName, { type: activityType });
        
        const nextIndex = activityIndex + 1;
        activityIndex = nextIndex % activitiesList.length;
    }, rotationInterval);

    const allUsers = client.users.cache;
    const botUsers = allUsers.filter(u => u.bot);
    const botIdsArray = botUsers.map(u => u.id);
    
    db.purgeBotEntries(botIdsArray);

    const restVersion = '10';
    const restClient = new REST({ version: restVersion });
    const botToken = config.botToken;
    restClient.setToken(botToken);
    
    const commandsValues = Array.from(client.commands.values());
    const slashCommandsPayload = commandsValues.map(cmd => {
        const cmdData = cmd.data;
        return cmdData.toJSON();
    });

    try {
        const clientId = config.clientId;
        const guildId = config.guildId;
        
        if (clientId && guildId) {
            const route = Routes.applicationGuildCommands(clientId, guildId);
            const putPayload = { body: slashCommandsPayload };
            
            await restClient.put(route, putPayload);
            const commandsCount = slashCommandsPayload.length;
            logger.success(`${commandsCount} Comandos Slash sincronizados con éxito en el servidor.`);
        }
    } catch (err) {
        const errorMsg = err.message;
        logger.error('Error registrando comandos:', errorMsg);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    const isChatCommand = interaction.isChatInputCommand();
    const isButtonInteraction = interaction.isButton();
    
    if (isButtonInteraction) {
        const customId = interaction.customId;
        if (customId === 'help_verify') {
            const helpMessage = 'ℹ️ **Guía de Verificación:**\n1. Haz clic en el botón azul.\n2. Inicia sesión con Discord.\n3. Escribe tu nombre de Roblox.\nSi tienes problemas, abre un ticket.';
            const replyPayload = { content: helpMessage, ephemeral: true };
            return interaction.reply(replyPayload);
        }
    }
    
    if (!isChatCommand) return;
    
    const commandName = interaction.commandName;
    const cmd = client.commands.get(commandName);
    
    if (!cmd) return;

    try {
        await cmd.execute(interaction);
    } catch (err) {
        const errorMsg = err.message;
        logger.error(`Excepción en /${commandName}:`, errorMsg);
        
        const replyPayload = { content: '❌ Error interno al procesar el comando.', ephemeral: true };
        
        const isDeferred = interaction.deferred;
        const isReplied = interaction.replied;
        
        if (isDeferred || isReplied) {
            await interaction.editReply(replyPayload).catch(() => null);
        } else {
            await interaction.reply(replyPayload).catch(() => null);
        }
    }
});

module.exports = { client };