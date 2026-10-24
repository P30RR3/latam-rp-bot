// src/bot/cogs/expediente.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { generateAIContent } = require('../../utils/gemini');

module.exports = {
    category: 'Expediente y Auditoría Staff',
    commands: [
        // 13. Warn
        {
            data: new SlashCommandBuilder()
                .setName('warn')
                .setDescription('[STAFF] Aplica una sanción oficial al expediente')
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Causa de la falta').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const razon = interaction.options.getString('razon');
                db.addWarn(target.id, razon, interaction.user.id);
                return interaction.reply({ content: `⚠️ Se registró una falta en el expediente de <@${target.id}>: *${razon}*` });
            }
        },

        // 14. Warns
        {
            data: new SlashCommandBuilder()
                .setName('warns')
                .setDescription('Consulta las sanciones de un usuario')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const list = db.getWarns(target.id);
                if (list.length === 0) return interaction.reply({ content: `✅ <@${target.id}> no posee advertencias.` });

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle(`📋 Expediente Disciplinario • ${target.tag}`)
                    .setDescription(list.map((w, i) => `\`#${i + 1}\` [${w.date.substring(0, 10)}] ${w.reason} (Por: <@${w.moderatorId}>)`).join('\n'));
                return interaction.reply({ embeds: [embed] });
            }
        },

        // 15. Clearwarns
        {
            data: new SlashCommandBuilder()
                .setName('clearwarns')
                .setDescription('[ADMIN] Limpia el historial disciplinario de un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                db.clearWarns(target.id);
                return interaction.reply({ content: `🧹 Se limpió el expediente de <@${target.id}>.` });
            }
        },

        // 16. Staff Stats
        {
            data: new SlashCommandBuilder()
                .setName('staff-stats')
                .setDescription('[STAFF] Muestra el registro individual de moderaciones de un Staff')
                .addUserOption(opt => opt.setName('staff').setDescription('Miembro del staff a auditar')),
            async execute(interaction) {
                const target = interaction.options.getUser('staff') || interaction.user;
                const stats = db.getStaffStats(target.id);

                const embed = new EmbedBuilder()
                    .setColor(0x3B82F6)
                    .setTitle(`🛡️ Métricas de Moderación • ${target.tag}`)
                    .addFields(
                        { name: '🔨 Baneos', value: `\`${stats.bans}\``, inline: true },
                        { name: '👢 Expulsiones', value: `\`${stats.kicks}\``, inline: true },
                        { name: '⏱️ Mutes / Timeouts', value: `\`${stats.timeouts}\``, inline: true },
                        { name: '⚠️ Advertencias', value: `\`${stats.warns}\``, inline: true },
                        { name: '📈 Total Intervenciones', value: `\`${stats.total}\``, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }
        },

        // 17. Staff Ranking Leaderboard
        {
            data: new SlashCommandBuilder()
                .setName('staff-ranking')
                .setDescription('Visualiza la tabla de actividad y efectividad del Staff'),
            async execute(interaction) {
                const board = db.getStaffLeaderboard();
                if (board.length === 0) return interaction.reply({ content: 'Aún no hay acciones de moderación registradas en el sistema.' });

                const description = board.slice(0, 10).map((s, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
                    return `${medal} **#${i + 1}** <@${s.id}> — **${s.total}** acciones \`(B:${s.bans} | K:${s.kicks} | T:${s.timeouts} | W:${s.warns})\``;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setTitle('🏆 Cuadro de Honor y Actividad Staff')
                    .setDescription(description)
                    .setFooter({ text: 'LATAM RP Staff Monitoring System' });

                return interaction.reply({ embeds: [embed] });
            }
        },

        // 18. Staff Evaluación con Gemini IA
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
                    .setFooter({ text: 'Powered by Gemini AI Engine' });

                return interaction.editReply({ embeds: [embed] });
            }
        }
    ]
};