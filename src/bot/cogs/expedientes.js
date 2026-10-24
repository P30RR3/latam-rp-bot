// src/bot/cogs/expediente.js
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

const db = require('../../database/db');

function createProgressBar(current, max = 50, size = 10) {
    const safeCurrent = Math.max(current, 0);
    const ratio = safeCurrent / max;
    const percentage = Math.min(ratio, 1);
    const progress = Math.round(size * percentage);
    const empty = size - progress;
    
    const filledBar = '▰'.repeat(progress);
    const emptyBar = '▱'.repeat(empty);
    const percentageText = `${Math.round(percentage * 100)}%`;
    
    return `${filledBar}${emptyBar} ${percentageText}`;
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
                const interactionOptions = interaction.options;
                const targetUser = interactionOptions.getUser('usuario');
                const targetId = targetUser.id;
                const targetTag = targetUser.tag;
                
                const guildInstance = interaction.guild;
                const targetMember = await guildInstance.members.fetch(targetId).catch(() => null);
                
                const razon = interactionOptions.getString('razon');
                const interactionUser = interaction.user;
                const interactionUserId = interactionUser.id;
                const interactionUserTag = interactionUser.tag;

                // MEJORA REAL: Validaciones de seguridad y jerarquía
                const isSelf = targetId === interactionUserId;
                if (isSelf) {
                    const errorMsg = '❌ No puedes sancionarte a ti mismo.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }
                
                const isBot = targetUser.bot;
                if (isBot) {
                    const errorMsg = '❌ No puedes advertir a un bot del sistema.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }
                
                const interactionMember = interaction.member;
                if (targetMember) {
                    const executorRolePos = interactionMember.roles.highest.position;
                    const targetRolePos = targetMember.roles.highest.position;
                    
                    if (executorRolePos <= targetRolePos) {
                        const errorMsg = '❌ No tienes jerarquía suficiente para advertir a este usuario.';
                        return interaction.reply({ content: errorMsg, ephemeral: true });
                    }
                }

                // Registro en base de datos
                db.addWarn(targetId, razon, interactionUserId);
                const updatedStats = db.getStaffStats(interactionUserId);
                const currentPoints = updatedStats.points;

                // MEJORA REAL: Intento de notificación por DM al infractor
                try {
                    const guildName = guildInstance.name;
                    const dmEmbed = new EmbedBuilder();
                    dmEmbed.setColor(0xEF4444);
                    dmEmbed.setTitle(`⚠️ Has recibido una advertencia en ${guildName}`);
                    dmEmbed.setDescription(`**Motivo:** ${razon}\n**Moderador:** ${interactionUserTag}`);
                    dmEmbed.setFooter({ text: 'Por favor, respeta las normativas del servidor.' });
                    
                    await targetUser.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // Si tiene los DMs cerrados, ignoramos el error silenciosamente para no crashear
                }

                // =========================================================
                // TEXTO ORIGINAL INTACTO (No se modificó ni una letra)
                // =========================================================
                const embed = new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setAuthor({ name: 'SISTEMA DISCIPLINARIO • LATAM RP', iconURL: interaction.guild.iconURL() })
                    .setTitle('⚠️ INFRACCIÓN ASIGNADA AL EXPEDIENTE')
                    .setDescription(`Se ha emitido una advertencia oficial contra <@${targetId}>.`)
                    .addFields(
                        { name: '👤 Infractor', value: `\`${targetTag}\` (${targetId})`, inline: true },
                        { name: '🛡️ Moderador', value: `<@${interactionUserId}>`, inline: true },
                        { name: '🏆 Puntuación del Staff', value: `**\`${currentPoints} PTS\`** *(+1 punto sumado)*`, inline: true },
                        { name: '📄 Causa', value: `\`\`\`${razon}\`\`\``, inline: false }
                    )
                    .setFooter({ text: 'Infracción indexada con éxito en la base de datos de LATAM RP.' })
                    .setTimestamp();

                const replyPayload = { embeds: [embed] };
                return interaction.reply(replyPayload);
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('warns')
                .setDescription('Consulta el historial de faltas de un ciudadano')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
                
            async execute(interaction) {
                const interactionOptions = interaction.options;
                const targetUser = interactionOptions.getUser('usuario');
                const targetId = targetUser.id;
                const targetTag = targetUser.tag;
                
                const warnsList = db.getWarns(targetId);
                const warnsCount = warnsList.length;

                if (warnsCount === 0) {
                    const cleanEmbed = new EmbedBuilder();
                    cleanEmbed.setColor(0x10B981);
                    cleanEmbed.setTitle('🛡️ EXPEDIENTE LIMPIO');
                    cleanEmbed.setDescription(`El ciudadano <@${targetId}> no posee ninguna sanción disciplinaria activa.`);
                    
                    const replyPayload = { embeds: [cleanEmbed] };
                    return interaction.reply(replyPayload);
                }

                // MEJORA REAL: Sistema de Nivel de Riesgo basado en cantidad de warns
                let riskLevel = '🟢 Riesgo Bajo';
                let embedColor = 0xFBBF24; // Amarillo
                
                if (warnsCount >= 3 && warnsCount <= 4) {
                    riskLevel = '🟠 Riesgo Medio (Propenso a Timeout)';
                    embedColor = 0xF97316; // Naranja
                } else if (warnsCount >= 5) {
                    riskLevel = '🔴 Riesgo Crítico (Propenso a Ban)';
                    embedColor = 0xEF4444; // Rojo
                }

                // MEJORA REAL: Paginación visual si hay demasiados warns
                const maxDisplay = 10;
                const displayList = warnsList.slice(-maxDisplay);
                
                const descriptionArray = displayList.map((warn, index) => {
                    const warnNumber = index + 1;
                    const warnDate = warn.date.substring(0, 10);
                    const warnReason = warn.reason;
                    const warnModerator = warn.moderatorId;
                    
                    return `\`[#${warnNumber}]\` 📅 **${warnDate}**\n├ **Motivo:** ${warnReason}\n└ **Oficial:** <@${warnModerator}>`;
                });
                
                const descriptionString = descriptionArray.join('\n\n');
                const targetAvatar = targetUser.displayAvatarURL();
                
                const embed = new EmbedBuilder();
                embed.setColor(embedColor);
                embed.setAuthor({ name: 'REGISTRO DE ANTECEDENTES CIVILES', iconURL: targetAvatar });
                embed.setTitle(`Expediente de ${targetTag}`);
                embed.setDescription(`**Estado Actual:** ${riskLevel}\n\n${descriptionString}`);
                
                const footerNote = warnsCount > maxDisplay ? '(Mostrando últimas 10)' : '';
                embed.setFooter({ text: `Total de faltas acumuladas: ${warnsCount} ${footerNote}` });

                const replyPayload = { embeds: [embed] };
                return interaction.reply(replyPayload);
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('clearwarns')
                .setDescription('[ADMIN] Purga todo el historial disciplinario de un ciudadano')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
                
            async execute(interaction) {
                const interactionOptions = interaction.options;
                const targetUser = interactionOptions.getUser('usuario');
                const targetId = targetUser.id;
                
                const warnsList = db.getWarns(targetId);
                const warnsCount = warnsList.length;

                if (warnsCount === 0) {
                    const errorMsg = `⚠️ <@${targetId}> ya tiene el expediente limpio.`;
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }

                // MEJORA REAL: Sistema de confirmación con botones
                const confirmBtn = new ButtonBuilder();
                confirmBtn.setCustomId('confirm_clear');
                confirmBtn.setLabel('Sí, Purgar');
                confirmBtn.setStyle(ButtonStyle.Danger);
                confirmBtn.setEmoji('🧹');
                
                const cancelBtn = new ButtonBuilder();
                cancelBtn.setCustomId('cancel_clear');
                cancelBtn.setLabel('Cancelar');
                cancelBtn.setStyle(ButtonStyle.Secondary);
                
                const actionRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
                const warningMsg = `⚠️ ¿Estás seguro de que deseas borrar **${warnsCount}** advertencias del expediente de <@${targetId}>? Esta acción es irreversible.`;

                const responseMessage = await interaction.reply({ 
                    content: warningMsg, 
                    components: [actionRow], 
                    ephemeral: true 
                });

                try {
                    const interactionUserId = interaction.user.id;
                    const filter = i => i.user.id === interactionUserId;
                    const collectorOptions = { filter: filter, time: 15000, componentType: ComponentType.Button };
                    
                    const confirmation = await responseMessage.awaitMessageComponent(collectorOptions);
                    const customId = confirmation.customId;
                    
                    if (customId === 'confirm_clear') {
                        db.clearWarns(targetId);
                        const successMsg = `✅ Se ha restablecido el expediente de <@${targetId}> exitosamente.`;
                        await confirmation.update({ content: successMsg, components: [] });
                    } else {
                        const cancelMsg = '❌ Operación cancelada.';
                        await confirmation.update({ content: cancelMsg, components: [] });
                    }
                } catch (e) {
                    const timeoutMsg = '⏳ Tiempo de espera agotado. Operación cancelada.';
                    await interaction.editReply({ content: timeoutMsg, components: [] });
                }
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('staff-ranking')
                .setDescription('Tabla de clasificación Staff consolidada'),
                
            async execute(interaction) {
                const deferPayload = { ephemeral: false };
                await interaction.deferReply(deferPayload);

                const rawBoard = db.getStaffLeaderboard();
                const humanBoard = [];
                const guildInstance = interaction.guild;

                // MEJORA REAL: Filtrado asíncrono seguro para evitar crasheos
                for (const entry of rawBoard) {
                    try {
                        const entryId = entry.id;
                        const member = await guildInstance.members.fetch(entryId).catch(() => null);
                        
                        if (member) {
                            const isBot = member.user.bot;
                            const hasPoints = entry.points > 0;
                            
                            if (!isBot && hasPoints) {
                                const validEntry = { ...entry, user: member.user };
                                humanBoard.push(validEntry);
                            }
                        }
                    } catch (error) {
                        // Usuario inaccesible, se ignora
                    }
                }

                const activeStaffCount = humanBoard.length;
                if (activeStaffCount === 0) {
                    const emptyMsg = 'Aún no hay moderadores activos con puntos registrados en la base de datos.';
                    return interaction.editReply({ content: emptyMsg });
                }

                let leaderboardText = '';
                const rankIcons = ['👑', '🥈', '🥉', '🔹', '🔹', '▫️', '▫️', '▫️', '▫️', '▫️'];
                
                // LÓGICA DE PROMOTE / DEMOTE (10+ Puestos)
                const totalStaff = humanBoard.length;
                const promoteCount = 3;
                const demoteCount = 4;
                const maxDisplay = 15; // Muestra hasta 15 para que se vea el demote

                const displayBoard = humanBoard.slice(0, maxDisplay);
                
                displayBoard.forEach((staff, index) => {
                    const icon = rankIcons[index] || '▫️';
                    const position = index + 1;
                    let statusTag = '';

                    // Evaluador de estado
                    if (position <= promoteCount) {
                        statusTag = '🟢 **[PROMOTE - ASCENSO]**';
                    } else if (position > (totalStaff - demoteCount) && totalStaff >= 10) {
                        statusTag = '🔴 **[DEMOTE - DESCENSO]**';
                    } else {
                        statusTag = '🟡 **[ESTABLE]**';
                    }

                    const staffId = staff.id;
                    const staffPoints = staff.points;
                    const staffTotal = staff.total;
                    const staffTickets = staff.tickets || 0;
                    const staffWarns = staff.warns || 0;
                    const staffTimeouts = staff.timeouts;
                    const staffBans = staff.bans;

                    const line1 = `${icon} **#${position}** <@${staffId}> ${statusTag}\n`;
                    const line2 = `╚═> **${staffPoints} PTS** • Total: \`${staffTotal}\` `;
                    const line3 = `*(🎫 ${staffTickets} | ⚠️ ${staffWarns} | ⏱️ ${staffTimeouts} | 🔨 ${staffBans})*\n\n`;
                    
                    leaderboardText += line1 + line2 + line3;
                });

                const guildIcon = guildInstance.iconURL();
                const embed = new EmbedBuilder();
                
                embed.setColor(0xF59E0B);
                embed.setAuthor({ name: 'ALTO MANDO • DEPARTAMENTO DE AUDITORÍA', iconURL: guildIcon });
                embed.setTitle('🏆 CLASIFICACIÓN GENERAL DE ACTIVIDAD STAFF');
                
                const descriptionHeader = '*Clasificación de moderadores: incluye atención de tickets, comandos y sanciones.*\n\n';
                embed.setDescription(descriptionHeader + leaderboardText);
                
                const footerText = 'LATAM RP Staff Protocol • Ticket: 3pts | Ban: 5pts | Timeout: 2pts | Warn: 1pt';
                embed.setFooter({ text: footerText });
                embed.setTimestamp();

                const replyPayload = { embeds: [embed] };
                return interaction.editReply(replyPayload);
            }
        }
    ]
};