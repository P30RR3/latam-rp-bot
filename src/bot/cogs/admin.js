// src/bot/cogs/admin.js
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

const db = require('../../database/db');
const { generateAIContent } = require('../../utils/gemini');

module.exports = {
    category: 'Administración Avanzada',
    commands: [
        {
            data: new SlashCommandBuilder()
                .setName('staff-evaluar')
                .setDescription('[ADMIN] Realiza una auditoría analítica con IA sobre el rendimiento de un Staff')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addUserOption(opt => opt.setName('staff').setDescription('Miembro del staff a evaluar').setRequired(true)),
                
            async execute(interaction) {
                const deferPayload = { ephemeral: false };
                await interaction.deferReply(deferPayload);
                
                const interactionOptions = interaction.options;
                const targetUser = interactionOptions.getUser('staff');
                const targetId = targetUser.id;
                const targetTag = targetUser.tag;
                
                const stats = db.getStaffStats(targetId);
                
                const bansCount = stats.bans;
                const kicksCount = stats.kicks;
                const timeoutsCount = stats.timeouts;
                const warnsCount = stats.warns;
                const totalCount = stats.total;
                
                const recentActionsArray = stats.recentActions || [];
                const recentActionsString = JSON.stringify(recentActionsArray);
                
                const promptString = `Analiza el rendimiento del moderador ${targetTag}. Datos técnicos: Baneos: ${bansCount}, Expulsiones: ${kicksCount}, Silencios: ${timeoutsCount}, Advertencias: ${warnsCount}, Acciones Totales: ${totalCount}. Acciones recientes: ${recentActionsString}. Proporciona un diagnóstico ejecutivo breve de su actividad y su nivel de proactividad.`;
                const systemString = 'Eres Cypher, una IA de auditoría interna de servidores de alta jerarquía. Sé preciso, profesional, sin rodeos y evalúa la coherencia de las sanciones.';
                
                // MEJORA REAL: Manejo de errores de la API de Gemini
                let aiText = '';
                try {
                    const aiResult = await generateAIContent(promptString, systemString);
                    const isSuccess = aiResult.success;
                    
                    if (isSuccess) {
                        aiText = aiResult.text;
                    } else {
                        const fallbackText = aiResult.text;
                        aiText = `⚠️ **Aviso del Sistema:** ${fallbackText}\n\n*Mostrando datos crudos:* El moderador tiene un total de ${totalCount} acciones registradas.`;
                    }
                } catch (error) {
                    const errorDetail = error.message;
                    aiText = `❌ **Error Crítico de IA:** No se pudo contactar con los servidores de Gemini. \nDetalle: ${errorDetail}`;
                }
                
                const embedColor = 0x8B5CF6;
                const embedTitle = `🤖 Auditoría de Rendimiento IA • ${targetTag}`;
                const footerText = 'Powered by Gemini AI Engine & Cypher';
                
                const embed = new EmbedBuilder();
                embed.setColor(embedColor);
                embed.setTitle(embedTitle);
                embed.setDescription(aiText);
                embed.setFooter({ text: footerText });
                embed.setTimestamp();
                
                const replyPayload = { embeds: [embed] };
                return interaction.editReply(replyPayload);
            }
        }
    ]
};