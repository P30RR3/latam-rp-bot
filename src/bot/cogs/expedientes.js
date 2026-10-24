// src/bot/cogs/expediente.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const db = require('../../database/db');
const { generateAIContent } = require('../../utils/gemini');

// Generador de barras tácticas de progreso
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

        // 16. Staff Stats (Ficha Táctica Individual)
        {
            data: new SlashCommandBuilder()
                .setName('staff-stats')
                .setDescription('Despliega la ficha táctica y métricas operacionales de un Staff')
                .addUserOption(opt => opt.setName('staff').setDescription('Miembro del Staff (opcional)')),
            async execute(interaction) {
                const target = interaction.options.getUser('staff') || interaction.user;
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
                        { name: '🌐 Fuentes Detectadas', value: `\`\`\`fix\nDiscord UI, Dyno & Cypher\n\`\`\``, inline: true }
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

        // 17. Staff Ranking (Tabla de Posiciones Táctica)
        {
            data: new SlashCommandBuilder()
                .setName('staff-ranking')
                .setDescription('Tabla de honor y ranking de actividad Staff consolidada (Dyno + Discord + Bot)'),
            async execute(interaction) {
                const board = db.getStaffLeaderboard();
                if (board.length === 0) {
                    return interaction.reply({ content: 'No hay actividades registradas aún en el sistema de auditoría.', ephemeral: true });
                }

                const topMembers = board.slice(0, 10);
                let leaderboardText = '';

                topMembers.forEach((staff, index) => {
                    const rankIcons = ['👑', '🥈', '🥉', '🔹', '🔹', '▫️', '▫️', '▫️', '▫️', '▫️'];
                    const icon = rankIcons[index] || '▫️';
                    leaderboardText += 
                        `${icon} **#${index + 1}** <@${staff.id}>\n` +
                        `╚═> **${staff.points} PTS** • Total: \`${staff.total}\` ` +
                        `*(🔨 ${staff.bans} | 👢 ${staff.kicks} | ⏱️ ${staff.timeouts} | ⚠️ ${staff.warns})*\n\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'ALTO MANDO • DEPARTAMENTO DE AUDITORÍA', iconURL: interaction.guild.iconURL() })
                    .setTitle('🏆 CLASIFICACIÓN GENERAL DE ACTIVIDAD STAFF')
                    .setDescription(
                        `*Auditoría global en tiempo real: incluye sanciones aplicadas vía Dyno, moderación manual de Discord y comandos propios.*\n\n` +
                        leaderboardText
                    )
                    .setFooter({ text: 'LATAM RP Staff Protocol • 5pts Ban | 3pts Kick | 2pts Timeout | 1pt Warn' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }
        },

        // 18. Sincronizar Historial Pasado de Dyno y Discord (NUEVO)
        {
            data: new SlashCommandBuilder()
                .setName('staff-sync-audit')
                .setDescription('[ADMIN] Escanea el historial de auditoría de Discord para importar acciones de Dyno')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addIntegerOption(opt => opt.setName('cantidad').setDescription('Número de registros a escanear (máx 100)').setMinValue(10).setMaxValue(100)),
            async execute(interaction) {
                await interaction.deferReply({ ephemeral: true });

                const limit = interaction.options.getInteger('cantidad') || 50;
                let imported = 0;

                try {
                    const auditLogs = await interaction.guild.fetchAuditLogs({ limit });

                    for (const entry of auditLogs.entries.values()) {
                        const { action, executor, target, reason } = entry;
                        if (!executor) continue;

                        let staffId = executor.id;
                        let source = 'Discord UI';

                        if (executor.bot) {
                            source = executor.username;
                            if (reason) {
                                const matchId = reason.match(/\b(\d{17,20})\b/);
                                const matchTag = reason.match(/\[([^\]]+)\]/);
                                if (matchId) {
                                    staffId = matchId[1];
                                } else if (matchTag) {
                                    const m = interaction.guild.members.cache.find(u => u.user.tag === matchTag[1].trim());
                                    if (m) staffId = m.id;
                                }
                            }
                        }

                        if (staffId === interaction.client.user.id) continue;

                        if (action === AuditLogEvent.MemberBanAdd) {
                            db.logStaffAction(staffId, 'bans', `Histórico: Ban a ${target?.tag || target?.id}`, source);
                            imported++;
                        } else if (action === AuditLogEvent.MemberKick) {
                            db.logStaffAction(staffId, 'kicks', `Histórico: Kick a ${target?.tag || target?.id}`, source);
                            imported++;
                        } else if (action === AuditLogEvent.MemberUpdate) {
                            const timeoutChange = entry.changes?.find(c => c.key === 'communication_disabled_until');
                            if (timeoutChange && timeoutChange.new) {
                                db.logStaffAction(staffId, 'timeouts', `Histórico: Timeout a ${target?.tag || target?.id}`, source);
                                imported++;
                            }
                        }
                    }

                    return interaction.editReply({
                        content: `✅ **Sincronización finalizada:** Se han analizado \`${limit}\` registros de auditoría y se indexaron \`${imported}\` acciones de moderación (incluyendo Dyno y manuales).`
                    });
                } catch (err) {
                    return interaction.editReply({ content: `❌ Error al leer los registros de auditoría: ${err.message}` });
                }
            }
        }
    ]
};