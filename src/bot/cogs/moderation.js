// src/bot/cogs/moderation.js
const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const db = require('../../database/db');

module.exports = {
    category: 'Moderación y Seguridad',
    commands: [
        {
            data: new SlashCommandBuilder()
                .setName('ban')
                .setDescription('[STAFF] Banea a un usuario del servidor')
                .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a sancionar').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Motivo de la expulsión')),
                
            async execute(interaction) {
                const interactionOptions = interaction.options;
                const targetMember = interactionOptions.getMember('usuario');
                const rawReason = interactionOptions.getString('razon');
                const razon = rawReason || 'Infracción grave de normas';
                
                // MEJORA REAL: Validaciones estrictas de seguridad
                if (!targetMember) {
                    const errorMsg = '❌ El usuario no se encuentra en el servidor.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }
                
                const interactionMember = interaction.member;
                const targetId = targetMember.id;
                const interactionMemberId = interactionMember.id;
                
                const isSelf = targetId === interactionMemberId;
                if (isSelf) {
                    const errorMsg = '❌ No puedes banearte a ti mismo.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }
                
                const targetHighestRole = targetMember.roles.highest.position;
                const executorHighestRole = interactionMember.roles.highest.position;
                
                if (executorHighestRole <= targetHighestRole) {
                    const errorMsg = '❌ No tienes jerarquía suficiente para banear a este usuario.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }
                
                const isBannable = targetMember.bannable;
                if (!isBannable) {
                    const errorMsg = '❌ Mi jerarquía como bot es inferior a la del usuario. No puedo banearlo.';
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }

                const interactionUser = interaction.user;
                const interactionUserTag = interactionUser.tag;
                const guildInstance = interaction.guild;
                const guildName = guildInstance.name;

                // MEJORA REAL: Notificación por DM antes del ban
                try {
                    const dmEmbed = new EmbedBuilder();
                    dmEmbed.setColor(0xEF4444);
                    dmEmbed.setTitle(`🔨 Has sido baneado de ${guildName}`);
                    dmEmbed.setDescription(`**Motivo:** ${razon}\n**Moderador:** ${interactionUserTag}`);
                    
                    await targetMember.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // DMs cerrados, continuamos con el ban sin crashear
                }

                const banOptions = { reason: razon };
                await targetMember.ban(banOptions);
                
                const interactionUserId = interactionUser.id;
                const targetUserObj = targetMember.user;
                const targetTag = targetUserObj.tag;
                const logMessage = `Ban a ${targetTag}: ${razon}`;
                
                db.logStaffAction(interactionUserId, 'bans', logMessage);
                
                const successMessage = `🔨 **${targetTag}** fue baneado permanentemente. Motivo: *${razon}*`;
                const replyPayload = { content: successMessage };
                
                return interaction.reply(replyPayload);
            }
        },

        {
            data: new SlashCommandBuilder()
                .setName('limpiar')
                .setDescription('[STAFF] Purga mensajes en lote')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addIntegerOption(opt => opt.setName('cantidad').setDescription('Número de mensajes (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),
                
            async execute(interaction) {
                const deferPayload = { ephemeral: true };
                await interaction.deferReply(deferPayload);
                
                const interactionOptions = interaction.options;
                const count = interactionOptions.getInteger('cantidad');
                const interactionChannel = interaction.channel;
                const filterOldMessages = true;
                
                // MEJORA REAL: Manejo de error de 14 días de Discord
                try {
                    const deletedMessages = await interactionChannel.bulkDelete(count, filterOldMessages);
                    const deletedSize = deletedMessages.size;
                    
                    if (deletedSize === 0) {
                        const warningMsg = '⚠️ No se borró ningún mensaje. Es posible que todos tengan más de 14 días de antigüedad (Límite de Discord).';
                        return interaction.editReply({ content: warningMsg });
                    }
                    
                    const successMessage = `🧹 Se eliminaron \`${deletedSize}\` mensajes exitosamente.`;
                    return interaction.editReply({ content: successMessage });
                } catch (error) {
                    const errorDetail = error.message;
                    const errorMessage = `❌ Ocurrió un error al intentar borrar los mensajes: ${errorDetail}`;
                    return interaction.editReply({ content: errorMessage });
                }
            }
        }
    ]
};