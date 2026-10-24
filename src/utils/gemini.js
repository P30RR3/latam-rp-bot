// src/utils/gemini.js
require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

async function generateAIContent(prompt, systemInstruction = '') {
    const rawKey = process.env.GEMINI_API_KEY || '';
    const cleanKey = rawKey.trim().replace(/^["']|["']$/g, '');

    if (!cleanKey) {
        logger.error('[GEMINI] La variable GEMINI_API_KEY no existe o está vacía en tu archivo .env');
        return {
            success: false,
            text: '⚠️ **Error de Configuración**: Falta la clave `GEMINI_API_KEY` en el archivo `.env`.',
            isFallback: true
        };
    }

    // Usamos el endpoint nativo compatible con claves AQ. y AIza pasándolo en query y en header
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`;

    let finalPrompt = prompt;
    if (systemInstruction && systemInstruction.trim().length > 0) {
        finalPrompt = `${systemInstruction.trim()}\n\nInput:\n${prompt}`;
    }

    const payload = {
        contents: [
            {
                role: 'user',
                parts: [{ text: finalPrompt }]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    };

    try {
        const res = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': cleanKey
            },
            timeout: 15000
        });

        const output = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!output) {
            return { success: false, text: 'No se obtuvo respuesta del modelo Gemini.', isFallback: true };
        }

        return { success: true, text: output };
    } catch (err) {
        const errorData = err.response?.data;
        const statusCode = err.response?.status;
        
        // DEPURACIÓN EXACTA EN CONSOLA PARA SABER QUÉ DICE GOOGLE
        console.error('\n========== [DEBUG CRÍTICO GEMINI] ==========');
        console.error('Código HTTP:', statusCode);
        console.error('Respuesta de Google:', JSON.stringify(errorData, null, 2));
        console.error('============================================\n');

        const errorMsg = errorData?.error?.message || err.message;
        return {
            success: false,
            text: `❌ **Error de Gemini API (${statusCode || 'ERR'}):** \`${errorMsg}\`\n*Revisa la consola de Node.js para ver el diagnóstico completo.*`,
            isFallback: true
        };
    }
}

module.exports = { generateAIContent };