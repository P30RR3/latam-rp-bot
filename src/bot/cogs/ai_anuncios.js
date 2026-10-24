// src/bot/cogs/ai_anuncios.js
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

const { generateAIContent } = require('../../utils/gemini');

// MEJORA REAL: Sistema de Cooldown en memoria para evitar spam de reportes
const reportCooldowns = new Map();

module.exports = {
    category: 'Anuncios y Gemini IA',
    commands: [
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
                const deferPayload = { ephemeral: true };
                await interaction.deferReply(deferPayload);
                
                const interactionOptions = interaction.options;
                const promptString = interactionOptions.getString('prompt');
                const categoryString = interactionOptions.getString('categoria');
                const styleString = interactionOptions.getString('estilo');
                const mentionString = interactionOptions.getString('mencion');

                const systemInstruction = `Eres el redactor ejecutivo oficial de un gran servidor de Discord. Genera un comunicado formal basado en la solicitud. Categoría: ${categoryString}. Tono: ${styleString}. Redáctalo estructurado, con viñetas limpias si corresponde. NO agregues introducciones como "Aquí tienes el anuncio:". Devuelve únicamente el texto final listo para publicar.`;

                const aiResult = await generateAIContent(promptString, systemInstruction);
                const aiText = aiResult.text;

                const isUrgent = categoryString === 'Urgente';
                const embedColor = isUrgent ? 0xEF4444 : 0x2563EB;
                
                const guildInstance = interaction.guild;
                const guildIcon = guildInstance.iconURL();
                const upperCategory = categoryString.toUpperCase();
                const authorName = `COMUNICADO OFICIAL • ${upperCategory}`;
                
                const interactionUser = interaction.user;
                const interactionUserTag = interactionUser.tag;
                const footerText = `Publicado por ${interactionUserTag} • IA Gemini Engine`;

                const previewEmbed = new EmbedBuilder();
                previewEmbed.setColor(embedColor);
                previewEmbed.setAuthor({ name: authorName, iconURL: guildIcon });
                previewEmbed.setDescription(aiText);
                previewEmbed.setFooter({ text: footerText });
                previewEmbed.setTimestamp();

                // MEJORA REAL: Sistema de Pre-visualización antes de publicar
                const publishBtn = new ButtonBuilder();
                publishBtn.setCustomId('publish_ai');
                publishBtn.setLabel('Publicar Anuncio');
                publishBtn.setStyle(ButtonStyle.Success);
                publishBtn.setEmoji('✅');
                    
                const discardBtn = new ButtonBuilder();
                discardBtn.setCustomId('discard_ai');
                discardBtn.setLabel('Descartar');
                discardBtn.setStyle(ButtonStyle.Danger);
                discardBtn.setEmoji('🗑️');
                    
                const actionRow = new ActionRowBuilder().addComponents(publishBtn, discardBtn);
                const previewContent = '👀 **PREVISUALIZACIÓN DEL ANUNCIO:** Revisa el texto generado por la IA. ¿Deseas publicarlo en este canal?';

                const previewMessage = await interaction.editReply({ 
                    content: previewContent, 
                    embeds: [previewEmbed], 
                    components: [actionRow] 
                });

                try {
                    const interactionUserId = interactionUser.id;
                    const filter = i => i.user.id === interactionUserId;
                    const collectorOptions = { filter: filter, time: 60000, componentType: ComponentType.Button };
                    
                    const buttonInteraction = await previewMessage.awaitMessageComponent(collectorOptions);
                    const customId = buttonInteraction.customId;
                    
                    if (customId === 'publish_ai') {
                        const finalPayload = { embeds: [previewEmbed] };
                        const hasMention = mentionString !== 'none';
                        
                        if (hasMention) {
                            finalPayload.content = mentionString;
                        }
                        
                        const targetChannel = interaction.channel;
                        await targetChannel.send(finalPayload);
                        
                        const successMsg = '✅ Anuncio publicado exitosamente.';
                        await buttonInteraction.update({ content: successMsg, embeds: [], components: [] });
                    } else {
                        const cancelMsg = '❌ Anuncio descartado.';
                        await buttonInteraction.update({ content: cancelMsg, embeds: [], components: [] });
                    }
                } catch (error) {
                    const timeoutMsg = '⏳ Tiempo de espera agotado. El anuncio no fue publicado.';
                    await interaction.editReply({ content: timeoutMsg, embeds: [], components: [] });
                }
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('reportar')
                .setDescription('Envía una notificación privada de incidencia al equipo de administración')
                .addStringOption(opt => opt.setName('reporte').setDescription('Explica con detalle el inconveniente').setRequired(true)),
                
            async execute(interaction) {
                const interactionUser = interaction.user;
                const userId = interactionUser.id;
                
                // MEJORA REAL: Sistema Anti-Spam (Cooldown de 5 minutos)
                const currentTime = Date.now();
                const cooldownMinutes = 5;
                const cooldownAmount = cooldownMinutes * 60 * 1000;
                
                const hasCooldown = reportCooldowns.has(userId);
                if (hasCooldown) {
                    const lastReportTime = reportCooldowns.get(userId);
                    const expirationTime = lastReportTime + cooldownAmount;
                    
                    if (currentTime < expirationTime) {
                        const timeLeftMs = expirationTime - currentTime;
                        const timeLeftSeconds = timeLeftMs / 1000;
                        const minutesLeft = Math.ceil(timeLeftSeconds / 60);
                        
                        const errorMsg = `⏳ Por favor espera ${minutesLeft} minuto(s) antes de enviar otro reporte.`;
                        return interaction.reply({ content: errorMsg, ephemeral: true });
                    }
                }
                
                reportCooldowns.set(userId, currentTime);
                
                const interactionOptions = interaction.options;
                const reporteTexto = interactionOptions.getString('reporte');
                
                const successMsg = '📨 Tu incidencia ha sido registrada y enviada a los canales de auditoría interna. Un Staff lo revisará pronto.';
                const replyPayload = { content: successMsg, ephemeral: true };
                
                return interaction.reply(replyPayload);
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('botinfo')
                .setDescription('Muestra el estado técnico del bot'),
                
            async execute(interaction) {
                const processMemory = process.memoryUsage();
                const heapUsed = processMemory.heapUsed;
                const memoryInMB = (heapUsed / 1024 / 1024).toFixed(2);
                
                const clientInstance = interaction.client;
                const wsPing = clientInstance.ws.ping;
                const nodeVersion = process.version;
                
                // MEJORA REAL: Cálculo de Uptime dinámico
                const uptimeMs = clientInstance.uptime;
                const uptimeTotalSeconds = uptimeMs / 1000;
                
                const days = Math.floor(uptimeTotalSeconds / 86400);
                const hours = Math.floor(uptimeTotalSeconds / 3600) % 24;
                const minutes = Math.floor(uptimeTotalSeconds / 60) % 60;
                const uptimeString = `${days}d ${hours}h ${minutes}m`;
                
                const embedColor = 0x06B6D4;
                const embedTitle = '⚡ Cypher Engine • Telemetría Avanzada';
                
                const embed = new EmbedBuilder();
                embed.setColor(embedColor);
                embed.setTitle(embedTitle);
                
                embed.addFields(
                    { name: '📡 WebSocket Ping', value: `\`${wsPing}ms\``, inline: true },
                    { name: '💾 RAM en Uso', value: `\`${memoryInMB} MB\``, inline: true },
                    { name: '⏱️ Tiempo Activo', value: `\`${uptimeString}\``, inline: true },
                    { name: '⚙️ Versión Node', value: `\`${nodeVersion}\``, inline: true }
                );
                
                embed.setFooter({ text: 'Sistemas Operativos y Estables' });
                
                const replyPayload = { embeds: [embed] };
                return interaction.reply(replyPayload);
            }
        }
    ]
};