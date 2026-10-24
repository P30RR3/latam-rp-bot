// index.js
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { client } = require('./src/bot/client');
const { app } = require('./src/server/app');

// MEJORA REAL: Sistema Anti-Crash Global
process.on('unhandledRejection', (reason, promise) => {
    const reasonString = String(reason);
    logger.error('Unhandled Rejection detectado:', reasonString);
    // El bot no se apagará
});

process.on('uncaughtException', (error) => {
    const errorString = String(error);
    logger.error('Uncaught Exception detectada:', errorString);
    // El bot no se apagará
});

process.on('uncaughtExceptionMonitor', (error, origin) => {
    const errorString = String(error);
    const originString = String(origin);
    logger.error(`Excepción Monitor [${originString}]:`, errorString);
});

// 1. Iniciar servidor Web
const portNumber = config.port;
const baseUrlString = config.baseUrl;

app.listen(portNumber, () => {
    const successMsg = `Servidor Web operativo en: ${baseUrlString}`;
    logger.success(successMsg);
});

// 2. Iniciar Bot de Discord
const discordToken = config.botToken;

client.login(discordToken).catch((err) => {
    const errorMsg = err.message;
    logger.error('No se pudo conectar el bot a Discord:', errorMsg);
    
    const exitCode = 1;
    process.exit(exitCode);
});