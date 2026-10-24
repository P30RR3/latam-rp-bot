// src/database/db.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'database.json');
const DB_BACKUP_PATH = path.join(DB_DIR, 'database.bak.json');

const defaultData = {
    verifications: {},
    robloxIndex: {},
    warns: {},
    staffLogs: {},
    serverConfig: {
        brookhavenStatus: 'En Línea',
        brookhavenLink: 'https://www.roblox.com/games/4924922222/Brookhaven-RP',
        motd: 'Servidor oficial de LATAM RP abierto a ciudadanos verificados.',
        updatedBy: null,
        updatedAt: null
    }
};

// ==========================================
// MOTOR DE PERSISTENCIA EN MEMORIA (CERO CORRUPCIÓN)
// ==========================================
let memoryDB = null;
let writeTimeout = null;

function initDB() {
    if (memoryDB) return; 
    
    const dirExists = fs.existsSync(DB_DIR);
    if (!dirExists) {
        const mkdirOptions = { recursive: true };
        fs.mkdirSync(DB_DIR, mkdirOptions);
        logger.system('Directorio de base de datos creado.');
    }
    
    const fileExists = fs.existsSync(DB_PATH);
    if (!fileExists) {
        const defaultString = JSON.stringify(defaultData, null, 2);
        const writeEncoding = 'utf8';
        fs.writeFileSync(DB_PATH, defaultString, writeEncoding);
        
        const parsedDefault = JSON.parse(defaultString);
        memoryDB = parsedDefault;
        logger.system('Archivo de base de datos inicializado por primera vez.');
    } else {
        try {
            const readEncoding = 'utf8';
            const rawData = fs.readFileSync(DB_PATH, readEncoding);
            const parsedData = JSON.parse(rawData);
            
            memoryDB = { ...defaultData, ...parsedData };
            logger.system('Base de datos cargada en memoria exitosamente.');
        } catch (e) {
            const errorMessage = e.message;
            logger.error('Error crítico leyendo DB, intentando restaurar backup:', errorMessage);
            
            const backupExists = fs.existsSync(DB_BACKUP_PATH);
            if (backupExists) {
                try {
                    const rawBackup = fs.readFileSync(DB_BACKUP_PATH, 'utf8');
                    const parsedBackup = JSON.parse(rawBackup);
                    memoryDB = { ...defaultData, ...parsedBackup };
                    logger.success('Base de datos restaurada desde el archivo de respaldo (.bak).');
                } catch (backupError) {
                    logger.error('El backup también está corrupto. Restaurando a valores por defecto.');
                    const stringifiedDefault = JSON.stringify(defaultData);
                    memoryDB = JSON.parse(stringifiedDefault);
                }
            } else {
                const stringifiedDefault = JSON.stringify(defaultData);
                memoryDB = JSON.parse(stringifiedDefault);
            }
        }
    }
}

// MEJORA: Escritura Atómica y Backups Automáticos
function scheduleWrite() {
    if (writeTimeout) return;
    
    const debounceDelay = 250; // 250ms para agrupar transacciones
    
    writeTimeout = setTimeout(() => {
        try {
            const dataString = JSON.stringify(memoryDB, null, 2);
            const writeEncoding = 'utf8';
            
            // 1. Crear backup del archivo actual antes de sobrescribir
            const fileExists = fs.existsSync(DB_PATH);
            if (fileExists) {
                fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
            }
            
            // 2. Escritura atómica (escribir en temp y renombrar)
            const tempPath = `${DB_PATH}.tmp`;
            fs.writeFileSync(tempPath, dataString, writeEncoding);
            fs.renameSync(tempPath, DB_PATH);
            
        } catch (e) {
            const errorMessage = e.message;
            logger.error('Error crítico escribiendo en base de datos:', errorMessage);
        }
        
        writeTimeout = null;
    }, debounceDelay);
}

initDB();

const db = {
    saveVerification(discordId, robloxUsername, robloxId) {
        const currentDate = new Date();
        const isoDate = currentDate.toISOString();
        const finalRobloxId = robloxId || null;
        
        const record = { 
            discordId: discordId, 
            robloxUsername: robloxUsername, 
            robloxId: finalRobloxId, 
            verifiedAt: isoDate 
        };
        
        memoryDB.verifications[discordId] = record;
        
        const lowerUsername = robloxUsername.toLowerCase();
        memoryDB.robloxIndex[lowerUsername] = discordId;
        
        scheduleWrite();
        return record;
    },

    getVerificationByDiscordId(discordId) {
        const record = memoryDB.verifications[discordId];
        const finalRecord = record || null;
        return finalRecord;
    },

    getVerificationByRobloxUser(username) {
        const lowerUsername = username.toLowerCase();
        const discordId = memoryDB.robloxIndex[lowerUsername];
        
        if (discordId) {
            const record = memoryDB.verifications[discordId];
            return record;
        }
        
        return null;
    },

    deleteVerification(discordId) {
        const existingRecord = memoryDB.verifications[discordId];
        
        if (existingRecord) {
            const robloxUsername = existingRecord.robloxUsername;
            const lowerUsername = robloxUsername.toLowerCase();
            
            delete memoryDB.robloxIndex[lowerUsername];
            delete memoryDB.verifications[discordId];
            
            scheduleWrite();
            return true;
        }
        
        return false;
    },

    addWarn(discordId, reason, moderatorId) {
        const userWarns = memoryDB.warns[discordId];
        if (!userWarns) {
            memoryDB.warns[discordId] = [];
        }

        const currentTime = Date.now();
        const uniqueId = currentTime.toString(36);
        const currentDate = new Date();
        const isoDate = currentDate.toISOString();
        
        const warnObject = { 
            id: uniqueId, 
            reason: reason, 
            moderatorId: moderatorId, 
            date: isoDate 
        };
        
        memoryDB.warns[discordId].push(warnObject);

        const isModeratorString = typeof moderatorId === 'string';
        if (moderatorId && isModeratorString) {
            const logDetails = `Warn a <@${discordId}>: ${reason}`;
            const sourceName = 'Cypher Nativo';
            this.logStaffAction(moderatorId, 'warns', logDetails, sourceName);
        } else {
            scheduleWrite();
        }
        
        return warnObject;
    },

    getWarns(discordId) {
        const userWarns = memoryDB.warns[discordId];
        const finalWarns = userWarns || [];
        return finalWarns;
    },

    clearWarns(discordId) {
        const emptyArray = [];
        memoryDB.warns[discordId] = emptyArray;
        
        scheduleWrite();
        return true;
    },

    logStaffAction(staffId, type, details, source = 'Manual') {
        const isStaffString = typeof staffId === 'string';
        if (!staffId || !isStaffString) return;

        const staffRecord = memoryDB.staffLogs[staffId];
        if (!staffRecord) {
            const newRecord = { 
                bans: 0, 
                kicks: 0, 
                timeouts: 0, 
                warns: 0, 
                tickets: 0, 
                total: 0, 
                points: 0, 
                recentActions: [] 
            };
            memoryDB.staffLogs[staffId] = newRecord;
        }

        const record = memoryDB.staffLogs[staffId];
        
        const pointsMap = { 
            bans: 5, 
            kicks: 3, 
            tickets: 3, 
            timeouts: 2, 
            warns: 1 
        };
        
        const gainedPoints = pointsMap[type] || 1;

        const currentTypeCount = record[type] || 0;
        record[type] = currentTypeCount + 1;
        
        const currentTotalCount = record.total || 0;
        record.total = currentTotalCount + 1;
        
        const currentPoints = record.points || 0;
        record.points = currentPoints + gainedPoints;

        const currentDate = new Date();
        const isoDate = currentDate.toISOString();
        
        const actionObject = {
            type: type,
            details: details,
            source: source,
            timestamp: isoDate
        };
        
        record.recentActions.unshift(actionObject);
        
        const maxRecentActions = 25;
        const currentActionsLength = record.recentActions.length;
        
        if (currentActionsLength > maxRecentActions) {
            record.recentActions.pop();
        }

        scheduleWrite();
    },

    purgeBotEntries(botIds) {
        let purgedCount = 0;
        
        for (const id of botIds) {
            const botRecord = memoryDB.staffLogs[id];
            if (botRecord) {
                delete memoryDB.staffLogs[id];
                purgedCount++;
            }
        }
        
        if (purgedCount > 0) {
            scheduleWrite();
        }
        
        return purgedCount;
    },

    getStaffLeaderboard() {
        const staffEntries = Object.entries(memoryDB.staffLogs);
        const mappedEntries = staffEntries.map(entry => {
            const id = entry[0];
            const stats = entry[1];
            
            const ticketsCount = stats.tickets || 0;
            const warnsCount = stats.warns || 0;
            
            const bansPoints = stats.bans * 5;
            const kicksPoints = stats.kicks * 3;
            const ticketsPoints = ticketsCount * 3;
            const timeoutsPoints = stats.timeouts * 2;
            const warnsPoints = warnsCount * 1;
            
            const totalPoints = bansPoints + kicksPoints + ticketsPoints + timeoutsPoints + warnsPoints;
            
            const finalObject = { 
                id: id, 
                ...stats, 
                tickets: ticketsCount, 
                warns: warnsCount, 
                points: totalPoints 
            };
            
            return finalObject;
        });
        
        const sortedEntries = mappedEntries.sort((a, b) => {
            const pointsA = a.points;
            const pointsB = b.points;
            return pointsB - pointsA;
        });
        
        return sortedEntries;
    },

    getStaffStats(staffId) {
        const existingStats = memoryDB.staffLogs[staffId];
        const defaultStats = { 
            bans: 0, 
            kicks: 0, 
            timeouts: 0, 
            warns: 0, 
            tickets: 0, 
            total: 0, 
            points: 0, 
            recentActions: [] 
        };
        
        const stats = existingStats || defaultStats;
        
        const ticketsCount = stats.tickets || 0;
        stats.tickets = ticketsCount;
        
        const warnsCount = stats.warns || 0;
        stats.warns = warnsCount;
        
        const bansPoints = stats.bans * 5;
        const kicksPoints = stats.kicks * 3;
        const ticketsPoints = stats.tickets * 3;
        const timeoutsPoints = stats.timeouts * 2;
        const warnsPoints = stats.warns * 1;
        
        const totalPoints = bansPoints + kicksPoints + ticketsPoints + timeoutsPoints + warnsPoints;
        stats.points = totalPoints;
        
        return stats;
    },

    setServerConfig(configUpdate) {
        const currentConfig = memoryDB.serverConfig;
        const currentDate = new Date();
        const isoDate = currentDate.toISOString();
        
        const newConfig = { 
            ...currentConfig, 
            ...configUpdate, 
            updatedAt: isoDate 
        };
        
        memoryDB.serverConfig = newConfig;
        scheduleWrite();
        
        return memoryDB.serverConfig;
    },

    getServerConfig() {
        const currentConfig = memoryDB.serverConfig;
        return currentConfig;
    }
};

module.exports = db;