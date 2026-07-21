import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { processChatMessage } from '@/services/chat.service';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 1. Process the chat message using our orchestration service
    const { audioBuffer, text, emotion } = await processChatMessage(message);

    // 2. Return the audio data AND the emotion data in custom headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        // Pass the telemetry back to the frontend
        'X-Emotion-Valence': emotion.valence.toString(),
        'X-Emotion-Arousal': emotion.arousal.toString(),
        'X-AI-Text': encodeURIComponent(text) // Pass text back safely
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}