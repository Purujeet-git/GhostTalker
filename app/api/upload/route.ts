import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';

// Initialize Clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
const index = pinecone.Index('persona-memory-index');

export async function POST(req: NextRequest) {
  try {
    // 1. Get the JSON payload uploaded by the user
    const body = await req.json();
    const { personaId, personaData } = body;

    if (!personaId || !Array.isArray(personaData)) {
      return NextResponse.json({ error: 'Missing personaId or invalid personaData array' }, { status: 400 });
    }

    console.log(`Processing ${personaData.length} memories for Persona: ${personaId}`);
    const allRecords: any[] = [];
    let indexCounter = 1;

    // 2. Loop through their uploaded data and generate embeddings
    for (const entry of personaData) {
      const safeId = `${personaId}-mem-${String(indexCounter++).padStart(3, '0')}`;
      const textToEmbed = `Topic: ${entry.topic}\nContent: ${entry.content}`;

      // Using embedding-001 just like in your memory.service.ts to ensure 768 dimensions match!
      const response = await ai.models.embedContent({
        model: 'embedding-001',
        contents: textToEmbed,
      });

      if (!response.embeddings || !response.embeddings[0].values) {
        console.warn(`Failed to generate embedding for ${safeId}, skipping.`);
        continue;
      }

      // 3. Format the record and inject the MULTI-USER personaId into the metadata!
      allRecords.push({
        id: safeId,
        values: response.embeddings[0].values,
        metadata: {
          personaId: personaId, // <-- THIS IS HOW WE SEPARATE USERS
          type: entry.type || "memory",
          topic: entry.topic || "General",
          content: entry.content
        }
      });

      // Brief pause to avoid hitting Gemini rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (allRecords.length === 0) {
      return NextResponse.json({ error: 'No valid vectors generated.' }, { status: 500 });
    }

    // 4. Upload to Pinecone in chunks of 10
    const chunkSize = 10;
    for (let j = 0; j < allRecords.length; j += chunkSize) {
      const chunk = allRecords.slice(j, j + chunkSize);
      await index.upsert({
        records: chunk
      });
    }

    return NextResponse.json({ success: true, message: `Successfully uploaded ${allRecords.length} memories for ${personaId}` });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process upload' }, { status: 500 });
  }
}