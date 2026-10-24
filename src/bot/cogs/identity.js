// src/bot/cogs/identity.js
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
const { getRobloxAvatar, getRobloxHeadshot } = require('../../utils/roblox');

module.exports = {
    category: 'Identidad y Roblox',
    commands: [
        {
            data: new SlashCommandBuilder()
                .setName('desvincular')
                .setDescription('[STAFF] Desvincula y remueve el registro V-Sync de un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a remover').setRequired(true)),
                
            async execute(interaction) {
                const interactionOptions = interaction.options;
                const targetUser = interactionOptions.getUser('usuario');
                const targetId = targetUser.id;
                const targetTag = targetUser.tag;
                
                const record = db.getVerificationByDiscordId(targetId);
                if (!record) {
                    const errorMsg = `⚠️ **${targetTag}** no posee vinculación previa en la base de datos.`;
                    return interaction.reply({ content: errorMsg, ephemeral: true });
                }

                const robloxUsername = record.robloxUsername;

                // MEJORA REAL: Sistema de confirmación interactiva para desvincular
                const confirmBtn = new ButtonBuilder();
                confirmBtn.setCustomId('confirm_unlink');
                confirmBtn.setLabel('Desvincular');
                confirmBtn.setStyle(ButtonStyle.Danger);
                confirmBtn.setEmoji('🔗');
                
                const cancelBtn = new ButtonBuilder();
                cancelBtn.setCustomId('cancel_unlink');
                cancelBtn.setLabel('Cancelar');
                cancelBtn.setStyle(ButtonStyle.Secondary);
                
                const actionRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
                const warningMsg = `⚠️ ¿Estás seguro de que deseas eliminar la identidad de Roblox (**${robloxUsername}**) vinculada a <@${targetId}>?`;

                const responseMessage = await interaction.reply({ 
                    content: warningMsg, 
                    components: [actionRow], 
                    ephemeral: true 
                });

                try {
                    const interactionUser = interaction.user;
                    const interactionUserId = interactionUser.id;
                    
                    const filter = i => i.user.id === interactionUserId;
                    const collectorOptions = { filter: filter, time: 15000, componentType: ComponentType.Button };
                    
                    const confirmation = await responseMessage.awaitMessageComponent(collectorOptions);
                    const customId = confirmation.customId;
                    
                    if (customId === 'confirm_unlink') {
                        db.deleteVerification(targetId);
                        const successMsg = `✅ Registro de **${targetTag}** purgado de la base de datos exitosamente.`;
                        await confirmation.update({ content: successMsg, components: [] });
                    } else {
                        const cancelMsg = '❌ Operación de desvinculación cancelada.';
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
                .setName('sincronizar')
                .setDescription('Fuerza la re-evaluación y sincronización de tu apodo de Roblox'),
                
            async execute(interaction) {
                const deferPayload = { ephemeral: true };
                await interaction.deferReply(deferPayload);
                
                const interactionUser = interaction.user;
                const interactionUserId = interactionUser.id;
                
                const data = db.getVerificationByDiscordId(interactionUserId);
                
                if (!data) {
                    const errorMessage = '❌ Debes verificarte primero a través del portal V-Sync.';
                    return interaction.editReply({ content: errorMessage });
                }
                
                const member = interaction.member;
                const globalName = interactionUser.globalName;
                const username = interactionUser.username;
                const baseName = globalName || username;
                const robloxUsername = data.robloxUsername;
                
                const rawFormatted = `[${robloxUsername}] | ${baseName}`;
                const formatted = rawFormatted.substring(0, 32);
                
                const memberId = member.id;
                const guildInstance = interaction.guild;
                const ownerId = guildInstance.ownerId;
                const isOwner = memberId === ownerId;
                
                // MEJORA REAL: Explicación clara si es el dueño
                if (isOwner) {
                    const ownerMsg = `⚠️ Eres el dueño del servidor. Discord prohíbe a los bots cambiar tu apodo. Tu apodo ideal sería: \`${formatted}\``;
                    return interaction.editReply({ content: ownerMsg });
                }
                
                try {
                    await member.setNickname(formatted);
                    const successMessage = `✅ Sincronización aplicada: \`${formatted}\``;
                    return interaction.editReply({ content: successMessage });
                } catch (error) {
                    const permissionErrorMessage = '⚠️ No tengo permisos suficientes para editar tu apodo. Asegúrate de que mi rol esté por encima del tuyo.';
                    return interaction.editReply({ content: permissionErrorMessage });
                }
            }
        }
    ]
};