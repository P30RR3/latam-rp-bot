// src/bot/cogs/identity.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database/db');
const { getRobloxAvatar, getRobloxHeadshot } = require('../../utils/roblox');

module.exports = {
    category: 'Identidad y Roblox',
    commands: [
        // 1. AVATAR
        {
            data: new SlashCommandBuilder()
                .setName('avatar')
                .setDescription('Muestra el avatar oficial de Roblox en 3D del usuario')
                .addUserOption(opt => opt.setName('usuario').setDescription('Miembro a consultar (dejar en blanco para ver el tuyo)')),
            async execute(interaction) {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario') || interaction.user;
                const record = db.getVerificationByDiscordId(target.id);

                if (!record || !record.robloxId) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor(0xEF4444).setTitle('❌ Cuenta No Vinculada').setDescription(`**${target.tag}** no tiene una cuenta de Roblox sincronizada con V-Sync.`)]
                    });
                }

                const avatarUrl = await getRobloxAvatar(record.robloxId);
                const embed = new EmbedBuilder()
                    .setColor(0x2563EB)
                    .setTitle(`Avatar Roblox • ${record.robloxUsername}`)
                    .setDescription(`Identidad vinculada a <@${target.id}>`)
                    .setImage(avatarUrl || 'https://images.rbxcdn.com/default-avatar.png')
                    .setFooter({ text: `Roblox ID: ${record.robloxId}` });

                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 2. BUSCAR-ROBLOX
        {
            data: new SlashCommandBuilder()
                .setName('buscar-roblox')
                .setDescription('Encuentra el usuario de Roblox vinculado a un miembro de Discord')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario de Discord').setRequired(true)),
            async execute(interaction) {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario');
                const data = db.getVerificationByDiscordId(target.id);

                if (!data) return interaction.editReply({ content: `❌ El usuario <@${target.id}> no se encuentra verificado en la base de datos.` });

                const headshot = await getRobloxHeadshot(data.robloxId);
                const embed = new EmbedBuilder()
                    .setColor(0x3B82F6)
                    .setTitle(`🔍 Identidad Civil: ${data.robloxUsername}`)
                    .setThumbnail(headshot)
                    .addFields(
                        { name: 'Discord', value: `<@${data.discordId}> (\`${data.discordId}\`)`, inline: true },
                        { name: 'Roblox ID', value: `\`${data.robloxId || 'N/A'}\``, inline: true },
                        { name: 'Perfil Directo', value: `[Ir a Roblox](https://www.roblox.com/users/${data.robloxId}/profile)`, inline: false }
                    );

                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 3. BUSCAR-DISCORD
        {
            data: new SlashCommandBuilder()
                .setName('buscar-discord')
                .setDescription('Busca qué usuario de Discord es dueño de un usuario de Roblox')
                .addStringOption(opt => opt.setName('roblox').setDescription('Nombre de usuario exacto en Roblox').setRequired(true)),
            async execute(interaction) {
                await interaction.deferReply();
                const query = interaction.options.getString('roblox').trim();
                const data = db.getVerificationByRobloxUser(query);

                if (!data) return interaction.editReply({ content: `❌ No existe ninguna cuenta de Discord asociada a **${query}**.` });

                const headshot = await getRobloxHeadshot(data.robloxId);
                const embed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle(`🔗 Registro Encontrado`)
                    .setThumbnail(headshot)
                    .addFields(
                        { name: 'Roblox', value: `**${data.robloxUsername}** (\`${data.robloxId}\`)`, inline: true },
                        { name: 'Usuario Discord', value: `<@${data.discordId}>`, inline: true }
                    );

                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 4. PERFIL
        {
            data: new SlashCommandBuilder()
                .setName('perfil')
                .setDescription('Consulta tu ficha de usuario y estado en LATAM RP')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a consultar')),
            async execute(interaction) {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario') || interaction.user;
                const data = db.getVerificationByDiscordId(target.id);
                const warns = db.getWarns(target.id);
                const headshot = data ? await getRobloxHeadshot(data.robloxId) : null;

                const embed = new EmbedBuilder()
                    .setColor(data ? 0x2563EB : 0x475569)
                    .setTitle(`🪪 Credencial Civil • LATAM RP`)
                    .setThumbnail(headshot || target.displayAvatarURL())
                    .addFields(
                        { name: 'Ciudadano', value: `<@${target.id}>`, inline: true },
                        { name: 'Roblox', value: data ? `\`${data.robloxUsername}\`` : '*No Sincronizado*', inline: true },
                        { name: 'Expediente', value: `\`${warns.length}\` advertencias`, inline: true },
                        { name: 'Fecha Verificación', value: data ? `<t:${Math.floor(new Date(data.verifiedAt).getTime()/1000)}:d>` : '*Pendiente*', inline: false }
                    );

                return interaction.editReply({ embeds: [embed] });
            }
        },

        // 5. DESVINCULAR
        {
            data: new SlashCommandBuilder()
                .setName('desvincular')
                .setDescription('[STAFF] Desvincula y remueve el registro V-Sync de un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a remover').setRequired(true)),
            async execute(interaction) {
                const target = interaction.options.getUser('usuario');
                const record = db.getVerificationByDiscordId(target.id);
                if (!record) return interaction.reply({ content: `⚠️ **${target.tag}** no poseía vinculación previa.`, ephemeral: true });

                const confirmBtn = new ButtonBuilder().setCustomId('confirm_unlink').setLabel('Desvincular').setStyle(ButtonStyle.Danger).setEmoji('🔗');
                const cancelBtn = new ButtonBuilder().setCustomId('cancel_unlink').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                const response = await interaction.reply({ content: `⚠️ ¿Estás seguro de que deseas desvincular a **${record.robloxUsername}** (<@${target.id}>)?`, components: [row], ephemeral: true });

                try {
                    const confirmation = await response.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 15000, componentType: ComponentType.Button });
                    if (confirmation.customId === 'confirm_unlink') {
                        db.deleteVerification(target.id);
                        await confirmation.update({ content: `✅ Registro de **${target.tag}** purgado exitosamente.`, components: [] });
                    } else {
                        await confirmation.update({ content: '❌ Cancelado.', components: [] });
                    }
                } catch {
                    await interaction.editReply({ content: '⏳ Tiempo agotado.', components: [] });
                }
            }
        },

        // 6. SINCRONIZAR
        {
            data: new SlashCommandBuilder()
                .setName('sincronizar')
                .setDescription('Fuerza la re-evaluación y sincronización de tu apodo de Roblox'),
            async execute(interaction) {
                await interaction.deferReply({ ephemeral: true });
                const data = db.getVerificationByDiscordId(interaction.user.id);
                if (!data) return interaction.editReply({ content: '❌ Debes verificarte primero a través del portal V-Sync.' });

                const member = interaction.member;
                const baseName = interaction.user.globalName || interaction.user.username;
                const formatted = `[${data.robloxUsername}] | ${baseName}`.substring(0, 32);

                if (member.id === interaction.guild.ownerId) {
                    return interaction.editReply({ content: `⚠️ Eres el dueño del servidor, Discord no permite que un bot te cambie el apodo. Tu apodo es: \`${formatted}\`` });
                }

                try {
                    await member.setNickname(formatted);
                    return interaction.editReply({ content: `✅ Sincronización aplicada: \`${formatted}\`` });
                } catch {
                    return interaction.editReply({ content: '⚠️ Permisos insuficientes para editar tu apodo.' });
                }
            }
        }
    ]
};