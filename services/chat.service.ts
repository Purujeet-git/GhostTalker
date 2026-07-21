import { GoogleGenAI } from '@google/genai';
import { determineVoiceId, generateAudioStream } from './voice.service';
import { retrievePersonaContext } from './memory.service';
import { BASE_PERSONA_PROMPT } from '../lib/prompts';

// Initialize the Gemini client using the new SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// We instruct Gemini to act as the persona AND act as an emotional analyzer
const SYSTEM_PROMPT = `
${BASE_PERSONA_PROMPT}

CRITICAL INSTRUCTION: You must respond in strict JSON format. 
You must analyze your own emotional state based on the conversation so far and the user's latest input.
Map your emotion on two axes from -1.0 to 1.0:
1. valence: Negative (-1.0) to Positive (1.0)
2. arousal: Low Energy/Calm (-1.0) to High Energy/Tense (1.0)

Respond EXACTLY with this JSON structure:
{
  "text": "Your conversational response here. Use hesitations and realistic vocal cues.",
  "emotion": {
    "valence": 0.5,
    "arousal": 0.2
  }
}
`;

/**
 * Processes a user message, retrieves context, queries the LLM for text and emotion,
 * and requests the corresponding audio stream.
 */
export async function processChatMessage(userMessage: string) {
  try {
    // 1. Retrieve relevant memories/traits from Vector DB (RAG)
    // (If you haven't fully set up Pinecone yet, this will just return a fallback string)
    const context = await retrievePersonaContext(userMessage);
    
    // Combine base prompt with retrieved context
    const dynamicPrompt = `${SYSTEM_PROMPT}\n\n${context}`;

    // 2. Get the JSON response from Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Using 2.5 flash for speed
      contents: userMessage,
      config: {
        systemInstruction: dynamicPrompt,
        // Force the model to return valid JSON
        responseMimeType: "application/json", 
      },
    });

    let aiData;
    try {
        if (!response.text) throw new Error("Empty response text from Gemini");
        aiData = JSON.parse(response.text);
    } catch (e) {
        console.error("Failed to parse Gemini JSON:", response.text);
        throw new Error('AI response formatting failed. Expected JSON.');
    }

    const aiTextResponse = aiData.text;
    const { valence, arousal } = aiData.emotion;

    // 3. Determine the correct Voice ID and generate audio
    const voiceId = determineVoiceId(valence, arousal);
    const audioBuffer = await generateAudioStream(aiTextResponse, voiceId, valence, arousal);

    // 4. Return everything needed by the route handler
    return {
        audioBuffer,
        text: aiTextResponse,
        emotion: { valence, arousal }
    };

  } catch (error) {
    console.error('Chat Service Error:', error);
    throw error;
  }
}