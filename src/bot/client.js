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

// Almacén de comandos en memoria
client.commands = new Map();
const slashCommandsData = [];

// Carga modular de Cogs
const cogsPath = path.join(__dirname, 'cogs');
const cogFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));

for (const file of cogFiles) {
    const cog = require(path.join(cogsPath, file));
    if (cog.commands && Array.isArray(cog.commands)) {
        for (const cmd of cog.commands) {
            client.commands.set(cmd.data.name, cmd);
            slashCommandsData.push(cmd.data.toJSON());
        }
        logger.info(`Cog cargado: [${cog.category}] con ${cog.commands.length} comandos.`);
    }
}

client.once('ready', async () => {
    logger.success(`Cypher Engine conectado como ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.botToken);
    try {
        if (config.clientId && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: slashCommandsData }
            );
            logger.success(`30 Comandos Slash sincronizados con éxito en el servidor [${config.guildId}].`);
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