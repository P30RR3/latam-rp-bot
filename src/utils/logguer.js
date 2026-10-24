
// src/utils/logger.js
const colors = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
    info: (msg) => console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warn: (msg) => console.warn(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`),
    error: (msg, err = '') => console.error(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${msg}`, err),
    system: (msg) => console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.cyan}[SYSTEM]${colors.reset} ${msg}`)
};

module.exports = logger;