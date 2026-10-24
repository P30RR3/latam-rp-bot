// src/utils/gemini.js
const axios = require('axios');
const logger = require('./logger');

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

async function generateAIContent(prompt, systemInstruction = '') {
    if (!GEMINI_API_KEY) {
        return {
            success: false,
            text: '⚠️ **Modo de Respaldo**: La clave `GEMINI_API_KEY` no ha sido configurada en las variables de entorno. Proporcionando salida predeterminada.',
            isFallback: true
        };
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, {
            contents: [
                {
                    parts: [
                        { text: systemInstruction ? `${systemInstruction}\n\nInput:\n${prompt}` : prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        }, { timeout: 10000 });

        const output = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return { success: true, text: output || 'No se obtuvo respuesta de Gemini.' };
    } catch (err) {
        logger.error('Fallo en Gemini API:', err.response?.data?.error?.message || err.message);
        return {
            success: false,
            text: `Error de procesamiento en la IA: ${err.response?.data?.error?.message || err.message}`,
            isFallback: true
        };
    }
}

module.exports = { generateAIContent };