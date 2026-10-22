// src/bot/client.js
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    REST, 
    Routes 
} = require('discord.js');

const config = require('../config/env');
const logger = require('../utils/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers // OBLIGATORIO: Activar en Discord Developer Portal -> Bot -> Privileged Intents
    ]
});

// Definición del comando slash para crear el panel
const commands = [
    new SlashCommandBuilder()
        .setName('setup-panel')
        .setDescription('Despliega el panel oficial de verificación con V-Sync de LATAM RP')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// Función que crea el Embed y el Botón visualmente estéticos
function createVerificationCard() {
    const embed = new EmbedBuilder()
        .setColor(0x2563EB) // Azul táctico neón
        .setAuthor({ 
            name: 'LATAM ROLEPLAY • SISTEMA DE IDENTIDAD', 
            iconURL: 'https://cdn.discordapp.com/emojis/1069695420188987483.webp?size=96&quality=lossless' // Icono decorativo de escudo
        })
        .setTitle('🛡️ VINCULACIÓN OFICIAL & VERIFICACIÓN V-SYNC')
        .setDescription(
            `> **¡Bienvenido a la ciudad de LATAM RP!**\n` +
            `Para garantizar una experiencia de rol segura, ordenada y libre de multicuentas o atacantes, es obligatorio vincular tu cuenta de **Roblox** con tu perfil de **Discord**.\n\n` +
            `**📋 PASOS PARA VERIFICARTE:**\n` +
            `**1.** Presiona el botón táctico **\`Vincular Cuenta (V-Sync)\`** que ves abajo.\n` +
            `**2.** Autoriza tu identidad a través del portal oficial de Discord.\n` +
            `**3.** Ingresa tu usuario de Roblox en nuestra terminal web y resuelve el filtro anti-bot.\n\n` +
            `**🎁 BENEFICIOS Y ASIGNACIÓN INMEDIATA:**\n` +
            `▫️ **Rol:** \`Ciudadano Oficial LATAM RP\`\n` +
            `▫️ **Rol:** \`Acceso Brookhaven Roleplay\`\n` +
            `▫️ **Sincronización:** Modificación automática de tu apodo a \`[TuRoblox] | TuUsuario\`\n\n` +
            `⚠️ *Si tienes problemas con la vinculación, contacta con la Administración abriendo un ticket.*`
        )
        .setImage('https://images.alphacoders.com/133/1338018.png') // Banner estilo FiveM / Ciudad nocturna
        .setFooter({ 
            text: 'LATAM RP Security Protocol • V-Sync Engine v2.4.0', 
            iconURL: 'https://cdn.discordapp.com/emojis/994440954003456041.webp?size=96&quality=lossless'
        })
        .setTimestamp();

    // Botón de enlace directo a la web OAuth2
    const verifyButton = new ButtonBuilder()
        .setLabel('Vincular Cuenta (V-Sync)')
        .setStyle(ButtonStyle.Link)
        .setURL(`${config.baseUrl}/auth/login`)
        .setEmoji('🔗');

    const row = new ActionRowBuilder().addComponents(verifyButton);

    return { embeds: [embed], components: [row] };
}

client.once('ready', async () => {
    logger.success(`Bot conectado como ${client.user.tag}`);

    // Registrar comando slash en el servidor configurado
    try {
        const rest = new REST({ version: '10' }).setToken(config.botToken);
        logger.system('Sincronizando comandos Slash (/setup-panel)...');
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        logger.success('Comando /setup-panel registrado correctamente.');
    } catch (err) {
        logger.error('Error al registrar comandos Slash:', err);
    }
});

// Manejo de la interacción del comando /setup-panel
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-panel') {
        const panel = createVerificationCard();
        await interaction.channel.send(panel);
        await interaction.reply({ 
            content: '✅ Panel de verificación enviado correctamente a este canal.', 
            ephemeral: true 
        });
    }
});

module.exports = { client };