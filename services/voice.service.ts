/**
 * Voice Service - Simplified for Free Browser TTS
 * Premium ElevenLabs integration has been omitted.
 */

export function determineVoiceId(valence: number, arousal: number): string | undefined {
  // We no longer need ElevenLabs Voice IDs, but we keep the function 
  // so we don't have to rewrite the chat.service.ts logic.
  return "browser-default";
}

export async function generateAudioStream(text: string, voiceId: string | undefined, valence: number, arousal: number) {
    // We instantly return an empty audio buffer.
    // This safely signals your app/page.tsx frontend to trigger the 
    // 100% free built-in window.speechSynthesis robot voice!
    return new ArrayBuffer(0);
}