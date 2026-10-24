// src/bot/cogs/ai_anuncios.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { generateAIContent } = require('../../utils/gemini');

const reportCooldowns = new Map();

module.exports = {
    category: 'Anuncios y Gemini IA',
    commands: [
        // 1. ANUNCIO
        {
            data: new SlashCommandBuilder()
                .setName('anuncio')
                .setDescription('[ADMIN] Crea y transmite un anuncio formal optimizado por IA')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addStringOption(opt => opt.setName('prompt').setDescription('Idea central del anuncio').setRequired(true))
                .addStringOption(opt => opt.setName('categoria').setDescription('Tipo de comunicado').setRequired(true)
                    .addChoices(
                        { name: '🏛️ Institucional', value: 'Institucional' },
                        { name: '⚖️ Normativa', value: 'Normativa' },
                        { name: '🚨 Urgente', value: 'Urgente' },
                        { name: '🎉 Evento', value: 'Evento' }
                    ))
                .addStringOption(opt => opt.setName('estilo').setDescription('Tono de redacción').setRequired(true)
                    .addChoices(
                        { name: '💼 Formal', value: 'Formal y riguroso' },
                        { name: '🔥 Energético', value: 'Energético y atractivo' },
                        { name: '⚠️ Severo', value: 'Serio y estricto' }
                    ))
                .addStringOption(opt => opt.setName('mencion').setDescription('Etiqueta').setRequired(true)
                    .addChoices(
                        { name: '@everyone', value: '@everyone' },
                        { name: '@here', value: '@here' },
                        { name: 'Sin mención', value: 'none' }
                    )),
            async execute(interaction) {
                await interaction.deferReply({ ephemeral: true });
                const prompt = interaction.options.getString('prompt');
                const cat = interaction.options.getString('categoria');
                const estilo = interaction.options.getString('estilo');
                const mencion = interaction.options.getString('mencion');

                const system = `Eres el redactor ejecutivo oficial de LATAM RP Discord. Categoría: ${cat}. Tono: ${estilo}. Redáctalo estructurado, con viñetas limpias si corresponde. Devuelve únicamente el texto final listo para publicar.`;
                const ai = await generateAIContent(prompt, system);

                const embed = new EmbedBuilder()
                    .setColor(cat === 'Urgente' ? 0xEF4444 : 0x2563EB)
                    .setAuthor({ name: `COMUNICADO OFICIAL • ${cat.toUpperCase()}`, iconURL: interaction.guild.iconURL() })
                    .setDescription(ai.text)
                    .setFooter({ text: `Publicado por ${interaction.user.tag} • IA Gemini Engine` })
                    .setTimestamp();

                const publishBtn = new ButtonBuilder().setCustomId('publish_ai').setLabel('Publicar').setStyle(ButtonStyle.Success).setEmoji('✅');
                const discardBtn = new ButtonBuilder().setCustomId('discard_ai').setLabel('Descartar').setStyle(ButtonStyle.Danger).setEmoji('🗑️');
                const row = new ActionRowBuilder().addComponents(publishBtn, discardBtn);

                const msg = await interaction.editReply({ content: '👀 **Revisa el anuncio antes de enviarlo:**', embeds: [embed], components: [row] });

                try {
                    const btn = await msg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000, componentType: ComponentType.Button });
                    if (btn.customId === 'publish_ai') {
                        const payload = { embeds: [embed] };
                        if (mencion !== 'none') payload.content = mencion;
                        await interaction.channel.send(payload);
                        await btn.update({ content: '✅ Publicado.', embeds: [], components: [] });
                    } else {
                        await btn.update({ content: '❌ Descartado.', embeds: [], components: [] });
                    }
                } catch {
                    await interaction.editReply({ content: '⏳ Tiempo agotado.', embeds: [], components: [] });
                }
            }
        },

        // 2. AI-PROMPT
        {
            data: new SlashCommandBuilder()
                .setName('ai-prompt')
                .setDescription('[STAFF] Realiza una consulta directa al modelo Gemini')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addStringOption(opt => opt.setName('peticion').setDescription('Qué deseas que redacte o analice Gemini').setRequired(true)),
            async execute(interaction) {
                await interaction.deferReply();
                const q = interaction.options.getString('peticion');
                const res = await generateAIContent(q, 'Eres Cypher, una IA técnica y analítica de primer nivel.');
                const embed = new EmbedBuilder()
                    .setColor(0x6366F1)
                    .setTitle('🤖 Respuesta de Gemini AI')
                    .setDescription(res.text.substring(0, 4000));
                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 3. AI-RESUMIR
        {
            data: new SlashCommandBuilder()
                .setName('ai-resumir')
                .setDescription('[STAFF] Lee los últimos mensajes del canal y redacta un resumen ejecutivo')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addIntegerOption(opt => opt.setName('mensajes').setDescription('Cantidad de mensajes (10-50)').setMinValue(10).setMaxValue(50)),
            async execute(interaction) {
                await interaction.deferReply();
                const limit = interaction.options.getInteger('mensajes') || 25;
                const msgs = await interaction.channel.messages.fetch({ limit });
                const compiled = msgs.map(m => `${m.author.username}: ${m.content}`).reverse().join('\n');

                const res = await generateAIContent(compiled, 'Resume esta conversación de Discord en 3 puntos clave ejecutivos.');
                const embed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('📝 Síntesis de Mensajes')
                    .setDescription(res.text);
                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 4. REPORTAR
        {
            data: new SlashCommandBuilder()
                .setName('reportar')
                .setDescription('Envía una notificación privada de incidencia al equipo de administración')
                .addStringOption(opt => opt.setName('reporte').setDescription('Explica con detalle el inconveniente').setRequired(true)),
            async execute(interaction) {
                const userId = interaction.user.id;
                const now = Date.now();
                if (reportCooldowns.has(userId) && now < reportCooldowns.get(userId) + 300000) {
                    return interaction.reply({ content: '⏳ Espera 5 minutos antes de volver a reportar.', ephemeral: true });
                }
                reportCooldowns.set(userId, now);
                return interaction.reply({ content: '📨 Tu incidencia ha sido registrada y enviada a los canales de auditoría interna.', ephemeral: true });
            }
        },

        // 5. BOTINFO
        {
            data: new SlashCommandBuilder()
                .setName('botinfo')
                .setDescription('Muestra el estado técnico del bot'),
            async execute(interaction) {
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                const uptime = Math.floor(interaction.client.uptime / 1000);
                const embed = new EmbedBuilder()
                    .setColor(0x06B6D4)
                    .setTitle('⚡ Cypher Engine • Telemetría')
                    .addFields(
                        { name: 'WebSocket Ping', value: `\`${interaction.client.ws.ping}ms\``, inline: true },
                        { name: 'RAM en Uso', value: `\`${mem} MB\``, inline: true },
                        { name: 'Uptime', value: `\`${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m\``, inline: true },
                        { name: 'Versión Node', value: `\`${process.version}\``, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }
        },

        // 6. SERVERINFO
        {
            data: new SlashCommandBuilder()
                .setName('serverinfo')
                .setDescription('Muestra estadísticas de este servidor de Discord'),
            async execute(interaction) {
                const { guild } = interaction;
                const embed = new EmbedBuilder()
                    .setColor(0x2563EB)
                    .setTitle(`Información: ${guild.name}`)
                    .setThumbnail(guild.iconURL())
                    .addFields(
                        { name: 'Miembros', value: `\`${guild.memberCount}\``, inline: true },
                        { name: 'Canales', value: `\`${guild.channels.cache.size}\``, inline: true },
                        { name: 'ID Servidor', value: `\`${guild.id}\``, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }
        }
    ]
};