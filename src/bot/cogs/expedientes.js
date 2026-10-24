// src/bot/cogs/expediente.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const db = require('../../database/db');
const { generateAIContent } = require('../../utils/gemini');

function createProgressBar(current, max = 50, size = 10) {
    const percentage = Math.min(Math.max(current / max, 0), 1);
    const progress = Math.round(size * percentage);
    const empty = size - progress;
    return '▰'.repeat(progress) + '▱'.repeat(empty) + ` ${Math.round(percentage * 100)}%`;
}

module.exports = {
    category: 'Expediente y Auditoría Staff',
    commands: [
        // 13. Warn interno
        {
            data: new SlashCommandBuilder()
                .setName('warn')
                .setDescription('[STAFF] Registra un llamado de atención formal en el expediente')
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Causa justificada').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const razon = interaction.options.getString('razon');
                db.addWarn(target.id, razon, interaction.user.id);

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'SISTEMA DISCIPLINARIO • LATAM RP', iconURL: interaction.guild.iconURL() })
                    .setTitle('⚠️ INFRACCIÓN ASIGNADA AL EXPEDIENTE')
                    .setDescription(`Se ha emitido una advertencia oficial contra el ciudadano <@${target.id}>.`)
                    .addFields(
                        { name: '👤 Infractor', value: `\`${target.tag}\` (${target.id})`, inline: true },
                        { name: '🛡️ Moderador', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📄 Causa', value: `\`\`\`${razon}\`\`\``, inline: false }
                    )
                    .setFooter({ text: 'Infracción indexada en el registro de auditoría de Staff.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }
        },

        // 14. Ver Warns
        {
            data: new SlashCommandBuilder()
                .setName('warns')
                .setDescription('Consulta el historial de faltas de un ciudadano')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const list = db.getWarns(target.id);

                if (list.length === 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x10B981)
                                .setTitle('🛡️ EXPEDIENTE LIMPIO')
                                .setDescription(`El ciudadano <@${target.id}> no posee ninguna sanción disciplinaria activa.`)
                        ]
                    });
                }

                const description = list.map((w, i) => 
                    `\`[#${i + 1}]\` 📅 **${w.date.substring(0, 10)}**\n` +
                    `├ **Motivo:** ${w.reason}\n` +
                    `└ **Oficial:** <@${w.moderatorId}>`
                ).join('\n\n');

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setAuthor({ name: 'REGISTRO DE ANTECEDENTES CIVILES', iconURL: target.displayAvatarURL() })
                    .setTitle(`Expediente de ${target.tag}`)
                    .setDescription(description)
                    .setFooter({ text: `Total de faltas acumuladas: ${list.length}` });

                return interaction.reply({ embeds: [embed] });
            }
        },

        // 15. Limpiar warns
        {
            data: new SlashCommandBuilder()
                .setName('clearwarns')
                .setDescription('[ADMIN] Purga todo el historial disciplinario de un ciudadano')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                db.clearWarns(target.id);
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x10B981)
                            .setTitle('🧹 EXPEDIENTE PURGADO')
                            .setDescription(`Se ha restablecido el registro de antecedentes para <@${target.id}>.`)
                    ]
                });
            }
        },

        // 16. Staff Stats
        {
            data: new SlashCommandBuilder()
                .setName('staff-stats')
                .setDescription('Despliega la ficha táctica y métricas operacionales de un Staff')
                .addUserOption(opt => opt.setName('staff').setDescription('Miembro del Staff (opcional)')),
            async execute(interaction) {
                const target = interaction.options.getUser('staff') || interaction.user;

                if (target.bot) {
                    return interaction.reply({ content: '❌ Los bots no poseen expedientes de Staff.', ephemeral: true });
                }

                const stats = db.getStaffStats(target.id);

                const embed = new EmbedBuilder()
                    .setColor(0x2563EB)
                    .setAuthor({ name: 'DIVISIÓN DE AUDITORÍA INTERNA • LATAM RP', iconURL: interaction.guild.iconURL() })
                    .setTitle(`🛡️ DOSSIER DE RENDIMIENTO: ${target.tag}`)
                    .setThumbnail(target.displayAvatarURL({ size: 256 }))
                    .setDescription(
                        `> **Rango de Actividad:** \`${stats.points > 100 ? 'DIVISIÓN ALFA 🎖️' : stats.points > 40 ? 'OPERATIVO ACTIVO 🔹' : 'EN DESARROLLO ▫️'}\`\n` +
                        `> **Efectividad Global:** \`${createProgressBar(stats.points, 120, 12)}\`\n` +
                        `> **Puntuación Táctica Acumulada:** **\`${stats.points} PTS\`**\n` +
                        `*(5 pts/Ban • 3 pts/Kick • 2 pts/Timeout • 1 pt/Warn)*`
                    )
                    .addFields(
                        { name: '🔨 Baneos Ejecutados', value: `\`\`\`yaml\n${stats.bans} registros\n\`\`\``, inline: true },
                        { name: '👢 Expulsiones (Kicks)', value: `\`\`\`yaml\n${stats.kicks} registros\n\`\`\``, inline: true },
                        { name: '⏱️ Silencios (Timeouts)', value: `\`\`\`yaml\n${stats.timeouts} registros\n\`\`\``, inline: true },
                        { name: '⚠️ Infracciones (Warns)', value: `\`\`\`yaml\n${stats.warns} registros\n\`\`\``, inline: true },
                        { name: '📊 Total Acciones', value: `\`\`\`yaml\n${stats.total} intervenciones\n\`\`\``, inline: true },
                        { name: '🌐 Fuentes Auditadas', value: `\`\`\`fix\nDyno, Discord UI & Cypher\n\`\`\``, inline: true }
                    );

                if (stats.recentActions && stats.recentActions.length > 0) {
                    const recent = stats.recentActions.slice(0, 4).map(a => 
                        `• **[${a.source || 'Audit'}]** ${a.details} *(<t:${Math.floor(new Date(a.timestamp).getTime()/1000)}:R>)*`
                    ).join('\n');
                    embed.addFields({ name: '🕒 Actividad Reciente Auditada', value: recent, inline: false });
                }

                embed.setFooter({ text: 'Sistema de Telemetría Staff Universal' }).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }
        },

        // 17. Staff Ranking (SOLO HUMANOS)
        {
            data: new SlashCommandBuilder()
                .setName('staff-ranking')
                .setDescription('Tabla de honor y ranking de actividad Staff consolidada (SOLO HUMANOS)'),
            async execute(interaction) {
                await interaction.deferReply();

                const rawBoard = db.getStaffLeaderboard();
                if (rawBoard.length === 0) {
                    return interaction.editReply({ content: 'No hay actividades registradas aún en el sistema de auditoría.' });
                }

                // FILTRO ESTRICTO: Descartar bots en tiempo real
                const humanBoard = [];
                for (const entry of rawBoard) {
                    try {
                        const user = await interaction.client.users.fetch(entry.id).catch(() => null);
                        if (user && !user.bot && entry.points > 0) {
                            humanBoard.push({ ...entry, user });
                        }
                    } catch {
                        // Si el usuario no existe, omitir
                    }
                }

                if (humanBoard.length === 0) {
                    return interaction.editReply({ content: 'No se encontraron miembros humanos con sanciones registradas todavía.' });
                }

                const topMembers = humanBoard.slice(0, 10);
                let leaderboardText = '';

                topMembers.forEach((staff, index) => {
                    const rankIcons = ['👑', '🥈', '🥉', '🔹', '🔹', '▫️', '▫️', '▫️', '▫️', '▫️'];
                    const icon = rankIcons[index] || '▫️';
                    leaderboardText += 
                        `${icon} **#${index + 1}** <@${staff.id}> (\`${staff.user.username}\`)\n` +
                        `╚═> **${staff.points} PTS** • Total: \`${staff.total}\` ` +
                        `*(🔨 ${staff.bans} | 👢 ${staff.kicks} | ⏱️ ${staff.timeouts} | ⚠️ ${staff.warns})*\n\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'ALTO MANDO • DEPARTAMENTO DE AUDITORÍA', iconURL: interaction.guild.iconURL() })
                    .setTitle('🏆 CLASIFICACIÓN GENERAL DE ACTIVIDAD STAFF (HUMANOS)')
                    .setDescription(
                        `*Auditoría de moderadores humanos: analiza comandos de chat de Dyno, embeds y moderación manual.*\n\n` +
                        leaderboardText
                    )
                    .setFooter({ text: 'LATAM RP Staff Protocol • 5pts Ban | 3pts Kick | 2pts Timeout | 1pt Warn' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 18. Purgar bots del ranking (Comando de limpieza para el Admin)
        {
            data: new SlashCommandBuilder()
                .setName('staff-purgar-bots')
                .setDescription('[ADMIN] Elimina instantáneamente a Dyno y a todos los bots del Staff Ranking')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
            async execute(interaction) {
                await interaction.deferReply({ ephemeral: true });

                const botIds = interaction.guild.members.cache.filter(m => m.user.bot).map(m => m.user.id);
                const count = db.purgeBotEntries(botIds);

                return interaction.editReply({
                    content: `🧹 **Purga completada:** Se eliminaron \`${count}\` cuentas bot que estaban ensuciando la tabla de posiciones.`
                });
            }
        }
    ]
};