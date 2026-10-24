// src/utils/discord.js
const logger = require('./logger');

/**
 * Aplica los 2 roles configurados y el apodo de Roblox de manera segura.
 * @param {import('discord.js').GuildMember} member - Instancia del miembro en el servidor
 * @param {string} robloxUsername - Nombre verificado de Roblox
 * @param {string[]} roleIds - Array con las IDs de los roles a otorgar
 */
async function syncUserOnGuild(member, robloxUsername, roleIds) {
    const results = {
        rolesAdded: false,
        nicknameChanged: false,
        warning: null
    };

    // 1. Asignación de Roles
    try {
        if (roleIds && roleIds.length > 0) {
            await member.roles.add(roleIds);
            results.rolesAdded = true;
            logger.success(`Roles [${roleIds.join(', ')}] asignados a ${member.user.tag}`);
        } else {
            logger.warn('No se encontraron IDs de roles válidas para asignar.');
        }
    } catch (err) {
        logger.error(`Error al asignar roles a ${member.user.tag}:`, err.message);
        throw new Error('Permisos insuficientes: el rol del Bot debe estar físicamente POR ENCIMA de los roles que va a entregar en Ajustes del Servidor.');
    }

    // 2. Modificación del Apodo
    try {
        const discordBaseName = member.user.globalName || member.user.username;
        let formattedNick = `[${robloxUsername}] | ${discordBaseName}`;

        // Truncar a 32 caracteres máximos (límite estricto de Discord)
        if (formattedNick.length > 32) {
            const prefix = `[${robloxUsername}] | `;
            const maxBaseLen = 32 - prefix.length;
            const cutBase = discordBaseName.substring(0, Math.max(0, maxBaseLen));
            formattedNick = `${prefix}${cutBase}`;
        }

        // Discord prohíbe terminantemente cambiarle el apodo al Dueño del servidor
        if (member.id === member.guild.ownerId) {
            results.warning = 'Eres el dueño del servidor: Discord no permite a los bots cambiar el apodo del dueño, pero los roles sí fueron asignados.';
            logger.warn(`Omitiendo cambio de apodo para ${member.user.tag} (Es el Dueño del Servidor).`);
        } else {
            await member.setNickname(formattedNick, 'Verificación V-Sync completada');
            results.nicknameChanged = true;
            logger.success(`Apodo sincronizado a "${formattedNick}" para ${member.user.tag}`);
        }
    } catch (err) {
        results.warning = 'No se pudo cambiar el apodo (posible jerarquía superior del usuario o falta de permisos).';
        logger.warn(`No se pudo cambiar el apodo a ${member.user.tag}: ${err.message}`);
    }

    return results;
}

module.exports = { syncUserOnGuild };