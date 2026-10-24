// src/utils/logger.js
const fs = require('fs');
const path = require('path');

const colors = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

// MEJORA REAL: Guardado de logs en archivos físicos
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

function getTimestamp() {
    const currentDate = new Date();
    const isoString = currentDate.toISOString();
    const replacedString = isoString.replace('T', ' ');
    const finalTimestamp = replacedString.substring(0, 19);
    return finalTimestamp;
}

function writeToFile(level, message) {
    const dateStr = new Date().toISOString().substring(0, 10);
    const logFile = path.join(logsDir, `cypher_${dateStr}.log`);
    const logEntry = `[${getTimestamp()}] [${level}] ${message}\n`;
    
    try {
        fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (e) {
        // Ignorar errores de escritura para no crashear
    }
}

const logger = {
    info: (msg) => {
        const formattedMsg = `${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${msg}`;
        console.log(formattedMsg);
        writeToFile('INFO', msg);
    },
    success: (msg) => {
        const formattedMsg = `${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${msg}`;
        console.log(formattedMsg);
        writeToFile('SUCCESS', msg);
    },
    warn: (msg) => {
        const formattedMsg = `${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`;
        console.warn(formattedMsg);
        writeToFile('WARN', msg);
    },
    error: (msg, err = '') => {
        const formattedMsg = `${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${msg}`;
        console.error(formattedMsg, err);
        const fullError = err ? `${msg} | ${err}` : msg;
        writeToFile('ERROR', fullError);
    },
    system: (msg) => {
        const formattedMsg = `${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.cyan}[SYSTEM]${colors.reset} ${msg}`;
        console.log(formattedMsg);
        writeToFile('SYSTEM', msg);
    }
};

module.exports = logger;