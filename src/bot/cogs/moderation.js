// src/bot/cogs/moderation.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');

module.exports = {
    category: 'Moderación y Seguridad',
    commands: [
        // 7. Ban
        {
            data: new SlashCommandBuilder()
                .setName('ban')
                .setDescription('[STAFF] Banea a un usuario del servidor')
                .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a sancionar').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Motivo de la expulsión')),
            async execute(interaction) {
                const target = interaction.options.getMember('usuario');
                const razon = interaction.options.getString('razon') || 'Infracción grave de normas';
                if (!target || !target.bannable) return interaction.reply({ content: '❌ Permisos insuficientes para banear a este usuario.', ephemeral: true });
                await target.ban({ reason: razon });
                db.logStaffAction(interaction.user.id, 'bans', `Ban a ${target.user.tag}: ${razon}`);
                return interaction.reply({ content: `🔨 **${target.user.tag}** fue baneado permanentemente. Motivo: *${razon}*` });
            }
        },

        // 8. Kick
        {
            data: new SlashCommandBuilder()
                .setName('kick')
                .setDescription('[STAFF] Expulsa a un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Razón')),
            async execute(interaction) {
                const target = interaction.options.getMember('usuario');
                const razon = interaction.options.getString('razon') || 'Expulsión disciplinaria';
                if (!target || !target.kickable) return interaction.reply({ content: '❌ No puedo expulsar a este miembro.', ephemeral: true });
                await target.kick(razon);
                db.logStaffAction(interaction.user.id, 'kicks', `Kick a ${target.user.tag}: ${razon}`);
                return interaction.reply({ content: `👢 **${target.user.tag}** ha sido expulsado del servidor.` });
            }
        },

        // 9. Timeout
        {
            data: new SlashCommandBuilder()
                .setName('timeout')
                .setDescription('[STAFF] Silencia y aísla temporalmente a un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Miembro').setRequired(true))
                .addIntegerOption(opt => opt.setName('minutos').setDescription('Minutos de silencio').setMinValue(1).setMaxValue(10080).setRequired(true))
                .addStringOption(opt => opt.setName('razon').setDescription('Causa')),
            async execute(interaction) {
                const member = interaction.options.getMember('usuario');
                const mins = interaction.options.getInteger('minutos');
                const razon = interaction.options.getString('razon') || 'Aislamiento preventivo';
                if (!member || !member.moderatable) return interaction.reply({ content: '❌ Jerarquía insuficiente para silenciar al miembro.', ephemeral: true });
                await member.timeout(mins * 60 * 1000, razon);
                db.logStaffAction(interaction.user.id, 'timeouts', `Timeout ${mins}m a ${member.user.tag}`);
                return interaction.reply({ content: `⏱️ **${member.user.tag}** aislado durante \`${mins}\` minutos.` });
            }
        },

        // 10. Untimeout
        {
            data: new SlashCommandBuilder()
                .setName('untimeout')
                .setDescription('[STAFF] Remueve el aislamiento de un miembro')
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addUserOption(opt => opt.setName('usuario').setDescription('Miembro').setRequired(true)),
            async execute(interaction) {
                const member = interaction.options.getMember('usuario');
                if (!member) return interaction.reply({ content: '❌ Miembro no encontrado.', ephemeral: true });
                await member.timeout(null);
                return interaction.reply({ content: `🔊 Aislamiento retirado de **${member.user.tag}**.` });
            }
        },

        // 11. Limpiar mensajes
        {
            data: new SlashCommandBuilder()
                .setName('limpiar')
                .setDescription('[STAFF] Purga mensajes en lote')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .addIntegerOption(opt => opt.setName('cantidad').setDescription('Número de mensajes (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),
            async execute(interaction) {
                await interaction.deferReply({ ephemeral: true });
                const count = interaction.options.getInteger('cantidad');
                const deleted = await interaction.channel.bulkDelete(count, true);
                return interaction.editReply({ content: `🧹 Se eliminaron \`${deleted.size}\` mensajes.` });
            }
        },

        // 12. Slowmode
        {
            data: new SlashCommandBuilder()
                .setName('slowmode')
                .setDescription('[STAFF] Configura el modo lento del canal')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
                .addIntegerOption(opt => opt.setName('segundos').setDescription('Segundos de espera (0 = desactivado)').setMinValue(0).setMaxValue(21600).setRequired(true)),
            async execute(interaction) {
                const secs = interaction.options.getInteger('segundos');
                await interaction.channel.setRateLimitPerUser(secs);
                return interaction.reply({ content: `⏱️ Modo lento establecido en \`${secs}s\`.` });
            }
        }
    ]
};