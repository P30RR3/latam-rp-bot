// src/utils/discord.js
const logger = require('./logger');

async function syncUserOnGuild(member, robloxUsername, roleIds) {
    const resultsObject = {
        rolesAdded: false,
        nicknameChanged: false,
        warning: null
    };

    const memberUser = member.user;
    const memberTag = memberUser.tag;

    // 1. Asignación de Roles
    try {
        const hasRolesToAssign = roleIds && roleIds.length > 0;
        
        if (hasRolesToAssign) {
            await member.roles.add(roleIds);
            resultsObject.rolesAdded = true;
            
            const rolesString = roleIds.join(', ');
            logger.success(`Roles [${rolesString}] asignados a ${memberTag}`);
        } else {
            logger.warn('No se encontraron IDs de roles válidas para asignar.');
        }
    } catch (err) {
        const errorMsg = err.message;
        logger.error(`Error al asignar roles a ${memberTag}:`, errorMsg);
        
        const throwMsg = 'Permisos insuficientes: el rol del Bot debe estar físicamente POR ENCIMA de los roles que va a entregar en Ajustes del Servidor.';
        throw new Error(throwMsg);
    }

    // 2. Modificación del Apodo
    try {
        const globalName = memberUser.globalName;
        const username = memberUser.username;
        const discordBaseName = globalName || username;
        
        const prefixString = `[${robloxUsername}] | `;
        let formattedNick = `${prefixString}${discordBaseName}`;

        const maxDiscordLength = 32;
        const isTooLong = formattedNick.length > maxDiscordLength;
        
        if (isTooLong) {
            const prefixLength = prefixString.length;
            const maxBaseLen = maxDiscordLength - prefixLength;
            const safeBaseLen = Math.max(0, maxBaseLen);
            
            const cutBase = discordBaseName.substring(0, safeBaseLen);
            formattedNick = `${prefixString}${cutBase}`;
        }

        const memberId = member.id;
        const guildInstance = member.guild;
        const ownerId = guildInstance.ownerId;
        const isOwner = memberId === ownerId;
        
        if (isOwner) {
            const warningMsg = 'Eres el dueño del servidor: Discord no permite a los bots cambiar el apodo del dueño, pero los roles sí fueron asignados.';
            resultsObject.warning = warningMsg;
            
            logger.warn(`Omitiendo cambio de apodo para ${memberTag} (Es el Dueño del Servidor).`);
        } else {
            const auditReason = 'Verificación V-Sync completada';
            await member.setNickname(formattedNick, auditReason);
            
            resultsObject.nicknameChanged = true;
            logger.success(`Apodo sincronizado a "${formattedNick}" para ${memberTag}`);
        }
    } catch (err) {
        const errorMsg = err.message;
        const warningMsg = 'No se pudo cambiar el apodo (posible jerarquía superior del usuario o falta de permisos).';
        
        resultsObject.warning = warningMsg;
        logger.warn(`No se pudo cambiar el apodo a ${memberTag}: ${errorMsg}`);
    }

    return resultsObject;
}

module.exports = { syncUserOnGuild };