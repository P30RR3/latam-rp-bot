// src/bot/cogs/expediente.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');

function createProgressBar(current, max = 50, size = 10) {
    const percentage = Math.min(Math.max(current / max, 0), 1);
    const progress = Math.round(size * percentage);
    const empty = size - progress;
    return '▰'.repeat(progress) + '▱'.repeat(empty) + ` ${Math.round(percentage * 100)}%`;
}

module.exports = {
    category: 'Expediente y Auditoría Staff',
    commands: [
        {
            data: new SlashCommandBuilder()
                .setName('warn')
                .setDescription('[STAFF] Registra un llamado de atención formal en el expediente')
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a sancionar').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Causa justificada').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const razon = interaction.options.getString('razon');

                // La DB ahora es atómica en memoria, esto se refleja al instante
                db.addWarn(target.id, razon, interaction.user.id);
                const updatedStats = db.getStaffStats(interaction.user.id);

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'SISTEMA DISCIPLINARIO • LATAM RP', iconURL: interaction.guild.iconURL() })
                    .setTitle('⚠️ INFRACCIÓN ASIGNADA AL EXPEDIENTE')
                    .setDescription(`Se ha emitido una advertencia oficial contra <@${target.id}>.`)
                    .addFields(
                        { name: '👤 Infractor', value: `\`${target.tag}\` (${target.id})`, inline: true },
                        { name: '🛡️ Moderador', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '🏆 Puntuación del Staff', value: `**\`${updatedStats.points} PTS\`** *(+1 punto sumado)*`, inline: true },
                        { name: '📄 Causa', value: `\`\`\`${razon}\`\`\``, inline: false }
                    )
                    .setFooter({ text: 'Infracción indexada con éxito en la base de datos de LATAM RP.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }
        },

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

        {
            data: new SlashCommandBuilder()
                .setName('clearwarns')
                .setDescription('[ADMIN] Purga todo el historial disciplinario de un ciudadano')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                db.clearWarns(target.id);
                return interaction.reply({ content: `🧹 Se ha restablecido el expediente de <@${target.id}>.` });
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('staff-stats')
                .setDescription('Despliega la ficha táctica y métricas de un Staff')
                .addUserOption(opt => opt.setName('staff').setDescription('Miembro del Staff (opcional)')),
            async execute(interaction) {
                const target = interaction.options.getUser('staff') || interaction.user;
                if (target.bot) return interaction.reply({ content: '❌ Los bots no tienen expediente de Staff.', ephemeral: true });

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
                        `*(Ban: 5 | Kick: 3 | Ticket: 3 | Timeout: 2 | Warn: 1)*`
                    )
                    .addFields(
                        { name: '🎫 Tickets Atendidos', value: `\`\`\`yaml\n${stats.tickets || 0} tickets\n\`\`\``, inline: true },
                        { name: '⚠️ Warns / Infracciones', value: `\`\`\`yaml\n${stats.warns || 0} warns\n\`\`\``, inline: true },
                        { name: '⏱️ Silencios (Timeouts)', value: `\`\`\`yaml\n${stats.timeouts} mutes\n\`\`\``, inline: true },
                        { name: '🔨 Baneos Ejecutados', value: `\`\`\`yaml\n${stats.bans} bans\n\`\`\``, inline: true },
                        { name: '👢 Expulsiones (Kicks)', value: `\`\`\`yaml\n${stats.kicks} kicks\n\`\`\``, inline: true },
                        { name: '📊 Total de Acciones', value: `\`\`\`yaml\n${stats.total} intervenciones\n\`\`\``, inline: true }
                    );

                if (stats.recentActions && stats.recentActions.length > 0) {
                    const recent = stats.recentActions.slice(0, 4).map(a => 
                        `• **[${a.source || 'Audit'}]** ${a.details} *(<t:${Math.floor(new Date(a.timestamp).getTime()/1000)}:R>)*`
                    ).join('\n');
                    embed.addFields({ name: '🕒 Actividad Reciente Auditada', value: recent, inline: false });
                }

                embed.setFooter({ text: 'Soporte integrado: DracoGuard, Dyno, Tickets y Cypher' }).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('staff-ranking')
                .setDescription('Tabla de clasificación Staff consolidada'),
            async execute(interaction) {
                await interaction.deferReply();

                const rawBoard = db.getStaffLeaderboard();
                const humanBoard = [];

                for (const entry of rawBoard) {
                    try {
                        const user = await interaction.client.users.fetch(entry.id).catch(() => null);
                        if (user && !user.bot && entry.points > 0) {
                            humanBoard.push({ ...entry, user });
                        }
                    } catch {
                        // Usuario inaccesible
                    }
                }

                if (humanBoard.length === 0) {
                    return interaction.editReply({ content: 'Aún no hay moderadores con puntos registrados en la base de datos.' });
                }

                let leaderboardText = '';
                const rankIcons = ['👑', '🥈', '🥉', '🔹', '🔹', '▫️', '▫️', '▫️', '▫️', '▫️'];

                humanBoard.slice(0, 10).forEach((staff, index) => {
                    const icon = rankIcons[index] || '▫️';
                    leaderboardText += 
                        `${icon} **#${index + 1}** <@${staff.id}>\n` +
                        `╚═> **${staff.points} PTS** • Total: \`${staff.total}\` ` +
                        `*(🎫 ${staff.tickets || 0} | ⚠️ ${staff.warns || 0} | ⏱️ ${staff.timeouts} | 🔨 ${staff.bans})*\n\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'ALTO MANDO • DEPARTAMENTO DE AUDITORÍA', iconURL: interaction.guild.iconURL() })
                    .setTitle('🏆 CLASIFICACIÓN GENERAL DE ACTIVIDAD STAFF')
                    .setDescription(
                        `*Clasificación de moderadores: incluye atención de tickets, comandos y sanciones.*\n\n` +
                        leaderboardText
                    )
                    .setFooter({ text: 'LATAM RP Staff Protocol • Ticket: 3pts | Ban: 5pts | Timeout: 2pts | Warn: 1pt' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('ticket-reclamar')
                .setDescription('[STAFF] Reclama la atención de este ticket y suma 3 puntos a tu ranking')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
            async execute(interaction) {
                db.logStaffAction(interaction.user.id, 'tickets', `Reclamó ticket en #${interaction.channel.name}`, 'Comando-Slash');
                const stats = db.getStaffStats(interaction.user.id);

                const embed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('🎫 TICKET RECLAMADO OFICIALMENTE')
                    .setDescription(`El oficial <@${interaction.user.id}> ha tomado control de este caso.\n*+3 Puntos sumados al Staff Ranking (Total: ${stats.points} PTS).*`)
                    .setFooter({ text: 'LATAM RP Soporte al Ciudadano' });

                return interaction.reply({ embeds: [embed] });
            }
        }
    ]
};