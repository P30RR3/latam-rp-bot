// index.js
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { client } = require('./src/bot/client');
const { app } = require('./src/server/app');

// 1. Iniciar servidor Web
app.listen(config.port, () => {
    logger.success(`Servidor Web operativo en: ${config.baseUrl}`);
});

// 2. Iniciar Bot de Discord
client.login(config.botToken).catch((err) => {
    logger.error('No se pudo conectar el bot a Discord:', err.message);
    process.exit(1);
});