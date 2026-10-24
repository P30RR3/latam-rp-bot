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

function initDB() {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
}

function readDB() {
    initDB();
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return { ...defaultData, ...JSON.parse(raw) };
    } catch (e) {
        logger.error('Error leyendo base de datos:', e.message);
        return defaultData;
    }
}

function writeDB(data) {
    initDB();
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        logger.error('Error escribiendo en base de datos:', e.message);
        return false;
    }
}

const db = {
    saveVerification(discordId, robloxUsername, robloxId) {
        const data = readDB();
        const record = { discordId, robloxUsername, robloxId: robloxId || null, verifiedAt: new Date().toISOString() };
        data.verifications[discordId] = record;
        data.robloxIndex[robloxUsername.toLowerCase()] = discordId;
        writeDB(data);
        return record;
    },

    getVerificationByDiscordId(discordId) {
        return readDB().verifications[discordId] || null;
    },

    getVerificationByRobloxUser(username) {
        const data = readDB();
        const discordId = data.robloxIndex[username.toLowerCase()];
        return discordId ? data.verifications[discordId] : null;
    },

    deleteVerification(discordId) {
        const data = readDB();
        const existing = data.verifications[discordId];
        if (existing) {
            delete data.robloxIndex[existing.robloxUsername.toLowerCase()];
            delete data.verifications[discordId];
            writeDB(data);
            return true;
        }
        return false;
    },

    // Warns internos
    addWarn(discordId, reason, moderatorId) {
        const data = readDB();
        if (!data.warns[discordId]) data.warns[discordId] = [];
        const warn = { id: Date.now().toString(36), reason, moderatorId, date: new Date().toISOString() };
        data.warns[discordId].push(warn);
        this.logStaffAction(moderatorId, 'warns', `Warn a <@${discordId}>: ${reason}`, 'Internal');
        writeDB(data);
        return warn;
    },

    getWarns(discordId) {
        return readDB().warns[discordId] || [];
    },

    clearWarns(discordId) {
        const data = readDB();
        data.warns[discordId] = [];
        writeDB(data);
        return true;
    },

    // REGISTRO DE STAFF UNIVERSAL (CYPHER ENGINE)
    // Puntos: Ban = 5 pts | Kick = 3 pts | Timeout = 2 pts | Warn = 1 pt
    logStaffAction(staffId, type, details, source = 'AuditLog') {
        if (!staffId) return;
        const data = readDB();
        if (!data.staffLogs[staffId]) {
            data.staffLogs[staffId] = { bans: 0, kicks: 0, timeouts: 0, warns: 0, total: 0, points: 0, recentActions: [] };
        }
        const record = data.staffLogs[staffId];
        
        // Asignación de puntos ponderados
        const pointsMap = { bans: 5, kicks: 3, timeouts: 2, warns: 1 };
        const gainedPoints = pointsMap[type] || 1;

        if (record[type] !== undefined) record[type]++;
        record.total = (record.total || 0) + 1;
        record.points = (record.points || 0) + gainedPoints;

        // Evitar duplicados de acciones idénticas en la misma ventana de tiempo
        const actionHash = `${type}_${details}_${source}`;
        const isDuplicate = record.recentActions.slice(0, 5).some(a => a.hash === actionHash);
        if (!isDuplicate) {
            record.recentActions.unshift({ type, details, source, timestamp: new Date().toISOString(), hash: actionHash });
            if (record.recentActions.length > 30) record.recentActions.pop();
        }

        writeDB(data);
    },

    getStaffLeaderboard() {
        const data = readDB();
        return Object.entries(data.staffLogs).map(([id, stats]) => ({
            id,
            ...stats,
            points: stats.points || (stats.bans * 5 + stats.kicks * 3 + stats.timeouts * 2 + stats.warns * 1)
        })).sort((a, b) => b.points - a.points);
    },

    getStaffStats(staffId) {
        const data = readDB();
        const stats = data.staffLogs[staffId] || { bans: 0, kicks: 0, timeouts: 0, warns: 0, total: 0, points: 0, recentActions: [] };
        stats.points = stats.points || (stats.bans * 5 + stats.kicks * 3 + stats.timeouts * 2 + stats.warns * 1);
        return stats;
    },

    setServerConfig(configUpdate) {
        const data = readDB();
        data.serverConfig = { ...data.serverConfig, ...configUpdate, updatedAt: new Date().toISOString() };
        writeDB(data);
        return data.serverConfig;
    },

    getServerConfig() {
        return readDB().serverConfig;
    }
};

module.exports = db;