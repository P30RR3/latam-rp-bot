// src/utils/gemini.js
require('dotenv').config();

const axios = require('axios');
const logger = require('./logger');

async function generateAIContent(prompt, systemInstruction = '') {
    // 1. Lectura en tiempo de ejecución para evitar variables vacías
    const environmentApiKey = process.env.GEMINI_API_KEY;
    const rawApiKey = environmentApiKey || '';
    const cleanApiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');

    const hasValidKey = cleanApiKey.length > 0;
    
    if (!hasValidKey) {
        const fallbackMessage = '⚠️ **Modo de Respaldo**: La clave `GEMINI_API_KEY` no ha sido configurada o está vacía en el archivo `.env`.';
        
        logger.error('No se encontró GEMINI_API_KEY en las variables de entorno.');
        
        const failurePayload = {
            success: false,
            text: fallbackMessage,
            isFallback: true
        };
        
        return failurePayload;
    }

    // 2. Endpoint nativo v1beta (Sin exponer la clave en la URL)
    const baseApiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    
    let constructedPrompt = prompt;
    const hasInstruction = systemInstruction && systemInstruction.trim().length > 0;
    
    if (hasInstruction) {
        const cleanInstruction = systemInstruction.trim();
        constructedPrompt = `${cleanInstruction}\n\nInput:\n${prompt}`;
    }

    // 3. Estructuración del Payload
    const textPart = { text: constructedPrompt };
    const partsArray = [textPart];
    
    const contentMessage = {
        role: 'user',
        parts: partsArray
    };
    
    const requestBody = {
        contents: [contentMessage],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    };

    // 4. Cabecera HTTP x-goog-api-key (SOPORTE COMPLETO PARA CLAVES AQ. Y AIza)
    const requestHeaders = {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanApiKey
    };

    const requestTimeout = 15000;
    const axiosConfiguration = {
        headers: requestHeaders,
        timeout: requestTimeout
    };

    try {
        const apiResponse = await axios.post(
            baseApiEndpoint, 
            requestBody, 
            axiosConfiguration
        );
        
        const responseData = apiResponse.data;
        const candidates = responseData.candidates;
        
        const hasCandidates = candidates && candidates.length > 0;
        if (!hasCandidates) {
            const noCandidatesMsg = 'El modelo de IA no generó texto de respuesta.';
            return {
                success: false,
                text: noCandidatesMsg,
                isFallback: true
            };
        }

        const primaryCandidate = candidates[0];
        const candidateContent = primaryCandidate.content;
        const candidateParts = candidateContent.parts;
        const firstPart = candidateParts[0];
        const outputText = firstPart.text;

        const successPayload = {
            success: true,
            text: outputText
        };
        
        return successPayload;

    } catch (error) {
        const responseError = error.response;
        const statusCode = responseError?.status;
        const errorData = responseError?.data;
        const apiErrorMessage = errorData?.error?.message;
        
        const errorDetails = apiErrorMessage || error.message;
        
        logger.error(`Fallo en Gemini API (Código HTTP ${statusCode || 'ERR'}):`, errorDetails);

        let customUserMessage = `Error de la IA (${statusCode || 'Desconocido'}): ${errorDetails}`;
        
        if (statusCode === 400 || statusCode === 401) {
            customUserMessage = '❌ **Error de autenticación**: Tu clave de Gemini no es válida o ha sido revocada. Genera una nueva en Google AI Studio.';
        } else if (statusCode === 429) {
            customUserMessage = '⏳ **Límite de cuota excedido**: La API de Gemini ha alcanzado el límite de peticiones gratuitas. Espera un momento.';
        }

        const errorPayload = {
            success: false,
            text: customUserMessage,
            isFallback: true
        };
        
        return errorPayload;
    }
}

module.exports = { generateAIContent };