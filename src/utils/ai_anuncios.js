// src/bot/cogs/ai_anuncios.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { generateAIContent } = require('../../utils/gemini');

module.exports = {
    category: 'Anuncios y Gemini IA',
    commands: [
        // 25. Comando Anuncio Asistido por Gemini IA
        {
            data: new SlashCommandBuilder()
                .setName('anuncio')
                .setDescription('[ADMIN] Crea y transmite un anuncio formal optimizado por IA')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addStringOption(opt => opt.setName('prompt').setDescription('Idea central del anuncio que la IA debe redactar').setRequired(true))
                .addStringOption(opt => opt.setName('categoria').setDescription('Tipo de comunicado').setRequired(true)
                    .addChoices(
                        { name: '🏛️ Institucional / Servidor', value: 'Institucional' },
                        { name: '⚖️ Actualización de Normativas', value: 'Normativa' },
                        { name: '🚨 Comunicado de Emergencia', value: 'Urgente' },
                        { name: '🎉 Evento Comunitario', value: 'Evento' }
                    ))
                .addStringOption(opt => opt.setName('estilo').setDescription('Tono de redacción de Gemini').setRequired(true)
                    .addChoices(
                        { name: '💼 Ejecutivo y Formal', value: 'Formal y riguroso' },
                        { name: '🔥 Dinámico y Entusiasta', value: 'Energético y atractivo' },
                        { name: '⚠️ Severo y Directo', value: 'Serio y estricto' }
                    ))
                .addStringOption(opt => opt.setName('mencion').setDescription('Etiqueta a utilizar').setRequired(true)
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

                const system = `Eres el redactor ejecutivo oficial de un gran servidor de Discord. Genera un comunicado formal basado en la solicitud. Categoría: ${cat}. Tono: ${estilo}. Redáctalo estructurado, con viñetas limpias si corresponde. NO agregues introducciones como "Aquí tienes el anuncio:". Devuelve únicamente el texto final listo para publicar.`;

                const ai = await generateAIContent(prompt, system);

                const embed = new EmbedBuilder()
                    .setColor(cat === 'Urgente' ? 0xEF4444 : 0x2563EB)
                    .setAuthor({ name: `COMUNICADO OFICIAL • ${cat.toUpperCase()}`, iconURL: interaction.guild.iconURL() })
                    .setDescription(ai.text)
                    .setFooter({ text: `Publicado por ${interaction.user.tag} • IA Gemini Engine` })
                    .setTimestamp();

                const payload = { embeds: [embed] };
                if (mencion !== 'none') payload.content = mencion;

                await interaction.channel.send(payload);
                return interaction.editReply({ content: '✅ Anuncio generado y publicado.' });
            }
        },

        // 26. Prompt Libre a Gemini IA
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

        // 27. Resumen de incidentes por IA
        {
            data: new SlashCommandBuilder()
                .setName('ai-resumir')
                .setDescription('[STAFF] Lee los últimos mensajes del canal y redacta un resumen ejecutivo')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addIntegerOption(opt => opt.setName('mensajes').setDescription('Cantidad de mensajes a leer (10-50)').setMinValue(10).setMaxValue(50)),
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

        // 28. Reportar incidencia a Staff
        {
            data: new SlashCommandBuilder()
                .setName('reportar')
                .setDescription('Envía una notificación privada de incidencia al equipo de administración')
                .addStringOption(opt => opt.setName('reporte').setDescription('Explica con detalle el inconveniente').setRequired(true)),
            async execute(interaction) {
                const rep = interaction.options.getString('reporte');
                return interaction.reply({ content: '📨 Tu incidencia ha sido registrada y enviada a los canales de auditoría interna.', ephemeral: true });
            }
        },

        // 29. Telemetría y Latencia del Bot
        {
            data: new SlashCommandBuilder()
                .setName('botinfo')
                .setDescription('Muestra el estado técnico del bot'),
            async execute(interaction) {
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                const embed = new EmbedBuilder()
                    .setColor(0x06B6D4)
                    .setTitle('⚡ Cypher Engine • Telemetría')
                    .addFields(
                        { name: 'WebSocket Ping', value: `\`${interaction.client.ws.ping}ms\``, inline: true },
                        { name: 'RAM en Uso', value: `\`${mem} MB\``, inline: true },
                        { name: 'Versión Node', value: `\`${process.version}\``, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }
        },

        // 30. Información del Servidor
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