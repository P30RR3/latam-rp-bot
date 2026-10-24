// src/bot/client.js
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Mapa en memoria (garantiza nombres únicos automáticamente)
client.commands = new Map();

// Carga modular de Cogs
const cogsPath = path.join(__dirname, 'cogs');

if (fs.existsSync(cogsPath)) {
    const cogFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));

    for (const file of cogFiles) {
        try {
            const cog = require(path.join(cogsPath, file));
            if (cog.commands && Array.isArray(cog.commands)) {
                for (const cmd of cog.commands) {
                    if (cmd.data && cmd.data.name) {
                        // El Map sobreescribe si hay colisión, previniendo duplicados
                        client.commands.set(cmd.data.name, cmd);
                    }
                }
                logger.info(`Cog cargado: [${cog.category || file}]`);
            }
        } catch (err) {
            logger.error(`Error al cargar el cog ${file}:`, err.message);
        }
    }
} else {
    logger.error('No se encontró la carpeta cogs en src/bot/cogs/');
}

client.once('clientReady', async () => {
    logger.success(`Cypher Engine conectado como ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.botToken);

    // DEDUPLICACIÓN ESTRICTA: Extrae solo comandos únicos del Map
    const slashCommandsPayload = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());

    try {
        if (config.clientId && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: slashCommandsPayload }
            );
            logger.success(`¡Sincronización exitosa! ${slashCommandsPayload.length} comandos slash registrados sin duplicados.`);
        } else {
            logger.warn('Faltan CLIENT_ID o GUILD_ID para registrar comandos.');
        }
    } catch (err) {
        logger.error('Error al registrar comandos slash:', err.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
        await cmd.execute(interaction);
    } catch (err) {
        logger.error(`Excepción ejecutando /${interaction.commandName}:`, err.message);
        const reply = { content: '❌ Ocurrió un error al procesar esta instrucción.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(reply).catch(() => null);
        } else {
            await interaction.reply(reply).catch(() => null);
        }
    }
});

module.exports = { client };