// src/database/db.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'database.json');

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
    if (memoryDB) return; // Ya está cargada en memoria
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        memoryDB = JSON.parse(JSON.stringify(defaultData));
    } else {
        try {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            memoryDB = { ...defaultData, ...JSON.parse(raw) };
        } catch (e) {
            logger.error('Error crítico leyendo DB, restaurando default:', e.message);
            memoryDB = JSON.parse(JSON.stringify(defaultData));
        }
    }
}

function scheduleWrite() {
    if (writeTimeout) return;
    writeTimeout = setTimeout(() => {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(memoryDB, null, 2), 'utf8');
        } catch (e) {
            logger.error('Error escribiendo en base de datos:', e.message);
        }
        writeTimeout = null;
    }, 150); // Debounce de 150ms para agrupar transacciones simultáneas
}

// Inicializar al requerir el módulo
initDB();

const db = {
    saveVerification(discordId, robloxUsername, robloxId) {
        const record = { discordId, robloxUsername, robloxId: robloxId || null, verifiedAt: new Date().toISOString() };
        memoryDB.verifications[discordId] = record;
        memoryDB.robloxIndex[robloxUsername.toLowerCase()] = discordId;
        scheduleWrite();
        return record;
    },

    getVerificationByDiscordId(discordId) {
        return memoryDB.verifications[discordId] || null;
    },

    getVerificationByRobloxUser(username) {
        const discordId = memoryDB.robloxIndex[username.toLowerCase()];
        return discordId ? memoryDB.verifications[discordId] : null;
    },

    deleteVerification(discordId) {
        const existing = memoryDB.verifications[discordId];
        if (existing) {
            delete memoryDB.robloxIndex[existing.robloxUsername.toLowerCase()];
            delete memoryDB.verifications[discordId];
            scheduleWrite();
            return true;
        }
        return false;
    },

    addWarn(discordId, reason, moderatorId) {
        if (!memoryDB.warns[discordId]) memoryDB.warns[discordId] = [];

        const warn = { id: Date.now().toString(36), reason, moderatorId, date: new Date().toISOString() };
        memoryDB.warns[discordId].push(warn);

        if (moderatorId && typeof moderatorId === 'string') {
            this.logStaffAction(moderatorId, 'warns', `Warn a <@${discordId}>: ${reason}`, 'Cypher Nativo');
        } else {
            scheduleWrite();
        }
        return warn;
    },

    getWarns(discordId) {
        return memoryDB.warns[discordId] || [];
    },

    clearWarns(discordId) {
        memoryDB.warns[discordId] = [];
        scheduleWrite();
        return true;
    },

    logStaffAction(staffId, type, details, source = 'Manual') {
        if (!staffId || typeof staffId !== 'string') return;

        if (!memoryDB.staffLogs[staffId]) {
            memoryDB.staffLogs[staffId] = { bans: 0, kicks: 0, timeouts: 0, warns: 0, tickets: 0, total: 0, points: 0, recentActions: [] };
        }

        const record = memoryDB.staffLogs[staffId];
        const pointsMap = { bans: 5, kicks: 3, tickets: 3, timeouts: 2, warns: 1 };
        const gainedPoints = pointsMap[type] || 1;

        record[type] = (record[type] || 0) + 1;
        record.total = (record.total || 0) + 1;
        record.points = (record.points || 0) + gainedPoints;

        record.recentActions.unshift({
            type,
            details,
            source,
            timestamp: new Date().toISOString()
        });
        
        if (record.recentActions.length > 25) record.recentActions.pop();

        scheduleWrite();
    },

    purgeBotEntries(botIds) {
        let purged = 0;
        for (const id of botIds) {
            if (memoryDB.staffLogs[id]) {
                delete memoryDB.staffLogs[id];
                purged++;
            }
        }
        if (purged > 0) scheduleWrite();
        return purged;
    },

    getStaffLeaderboard() {
        return Object.entries(memoryDB.staffLogs).map(([id, stats]) => {
            const tickets = stats.tickets || 0;
            const warns = stats.warns || 0;
            const points = (stats.bans * 5) + (stats.kicks * 3) + (tickets * 3) + (stats.timeouts * 2) + (warns * 1);
            return { id, ...stats, tickets, warns, points };
        }).sort((a, b) => b.points - a.points);
    },

    getStaffStats(staffId) {
        const stats = memoryDB.staffLogs[staffId] || { bans: 0, kicks: 0, timeouts: 0, warns: 0, tickets: 0, total: 0, points: 0, recentActions: [] };
        stats.tickets = stats.tickets || 0;
        stats.warns = stats.warns || 0;
        stats.points = (stats.bans * 5) + (stats.kicks * 3) + (stats.tickets * 3) + (stats.timeouts * 2) + (stats.warns * 1);
        return stats;
    },

    setServerConfig(configUpdate) {
        memoryDB.serverConfig = { ...memoryDB.serverConfig, ...configUpdate, updatedAt: new Date().toISOString() };
        scheduleWrite();
        return memoryDB.serverConfig;
    },

    getServerConfig() {
        return memoryDB.serverConfig;
    }
};

module.exports = db;