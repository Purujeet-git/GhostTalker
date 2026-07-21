import axios from 'axios';

// Define the Voice Matrix
// These should be distinct Voice IDs from your ElevenLabs dashboard,
// representing the persona speaking in different emotional states.
const VOICE_MATRIX = {
  ANGRY: process.env.ELEVENLABS_VOICE_ID_ANGRY || process.env.ELEVENLABS_VOICE_ID,
  HAPPY: process.env.ELEVENLABS_VOICE_ID_HAPPY || process.env.ELEVENLABS_VOICE_ID,
  SAD:   process.env.ELEVENLABS_VOICE_ID_SAD   || process.env.ELEVENLABS_VOICE_ID,
  CALM:  process.env.ELEVENLABS_VOICE_ID       || process.env.ELEVENLABS_VOICE_ID 
};

/**
 * Determines which Voice ID to use based on the LLM's reported emotional state.
 */
export function determineVoiceId(valence: number, arousal: number): string | undefined {
  // If High Energy and Negative Emotion -> Angry Voice
  if (arousal > 0.5 && valence < -0.3) return VOICE_MATRIX.ANGRY;
  
  // If Low Energy and Negative Emotion -> Sad Voice
  if (arousal < -0.2 && valence < -0.3) return VOICE_MATRIX.SAD;
  
  // If High Energy and Positive Emotion -> Happy Voice
  if (arousal > 0.4 && valence > 0.3) return VOICE_MATRIX.HAPPY;
  
  // Default fallback
  return VOICE_MATRIX.CALM;
}

/**
 * Calls the ElevenLabs API to generate speech, dynamically adjusting settings.
 */
export async function generateAudioStream(text: string, voiceId: string | undefined, valence: number, arousal: number) {
    if (!voiceId) {
        throw new Error("Voice ID is undefined");
    }
    
    // Dynamically adjust ElevenLabs Voice Settings based on Emotion
    // High arousal = less stable (more expressive/erratic)
    // Low arousal = highly stable (monotone/calm)
    const dynamicStability = Math.max(0.1, 1.0 - Math.abs(arousal));
    
    // Positive valence = higher similarity boost (clearer voice)
    // Negative valence = slightly lower similarity (more grit/distortion)
    const dynamicSimilarity = valence > 0 ? 0.8 : 0.6;

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

    try {
        const audioResponse = await axios.post(
            elevenLabsUrl,
            {
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: dynamicStability,
                    similarity_boost: dynamicSimilarity
                }
            },
            {
                headers: {
                    Accept: 'audio/mpeg',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer', 
            }
        );
        return audioResponse.data;
    } catch (error) {
        console.error("ElevenLabs API Error:", error);
        throw new Error("Failed to generate audio stream");
    }
}