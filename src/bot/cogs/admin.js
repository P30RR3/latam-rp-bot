// src/bot/cogs/admin.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
                await interaction.deferReply();
                const target = interaction.options.getUser('staff');
                const stats = db.getStaffStats(target.id);

                const prompt = `Analiza el rendimiento del moderador ${target.tag}. Datos técnicos: Baneos: ${stats.bans}, Expulsiones: ${stats.kicks}, Silencios: ${stats.timeouts}, Advertencias: ${stats.warns}, Acciones Totales: ${stats.total}. Acciones recientes: ${JSON.stringify(stats.recentActions)}. Proporciona un diagnóstico ejecutivo breve de su actividad y su nivel de proactividad.`;
                const system = 'Eres Cypher, una IA de auditoría interna de servidores de alta jerarquía. Sé preciso, profesional, sin rodeos y evalúa la coherencia de las sanciones.';

                const aiResult = await generateAIContent(prompt, system);

                const embed = new EmbedBuilder()
                    .setColor(0x8B5CF6)
                    .setTitle(`🤖 Auditoría de Rendimiento IA • ${target.tag}`)
                    .setDescription(aiResult.text)
                    .setFooter({ text: 'Powered by Gemini AI Engine & Cypher' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        }
    ]
};