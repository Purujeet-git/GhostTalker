import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config'; 

// 1. Initialize Clients securely
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
const index = pinecone.Index('persona-memory-index');

// 2. Define the TypeScript interface matching our JSON
interface PersonaEntry {
  id?: string;
  type: "memory" | "decision_framework" | "core_belief" | "behavioral_trait";
  topic: string;
  content: string;
}

async function seedDatabase() {
  console.log("🌱 Starting Pinecone seeding process...");

  try {
    // 3. Read the JSON file from the data folder
    const dataPath = path.join(process.cwd(), 'data', 'persona.json');
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Could not find persona.json at path: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const personaData: PersonaEntry[] = JSON.parse(rawData);

    console.log(`Found ${personaData.length} entries to process.`);

    const allRecords: any[] = [];

    // 4. Process each entry and create embeddings
    let indexCounter = 1;
    for (const entry of personaData) {
      const safeId = entry.id || `mem-${String(indexCounter++).padStart(3, '0')}`;
      
      console.log(`Generating embedding for: [${safeId}] ${entry.topic}...`);
      
      const textToEmbed = `Topic: ${entry.topic}\nContent: ${entry.content}`;

      // Call Gemini to get the 768-dimensional vector
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: textToEmbed,
        config:{
            outputDimensionality: 768,
        },
      });

      if (!response.embeddings || !response.embeddings[0].values) {
        console.warn(`Failed to generate embedding for ${safeId}, skipping.`);
        continue;
      }

      const vectorValues = response.embeddings[0].values;

      // 5. Format record correctly for Pinecone's v6+ SDK specification
      allRecords.push({
        id: safeId,
        values: vectorValues,
        metadata: {
          type: entry.type,
          topic: entry.topic,
          content: entry.content
        }
      });

      // Prevent hitting Gemini rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (allRecords.length === 0) {
       console.log("❌ No valid vectors generated. Aborting upload.");
       return;
    }

    console.log(`📤 Uploading ${allRecords.length} vectors to Pinecone in chunks...`);

    // 6. Upload in chunks of 10 using the exact { records: [...] } object syntax required by Pinecone SDK
    const chunkSize = 10;
    for (let j = 0; j < allRecords.length; j += chunkSize) {
      const chunk = allRecords.slice(j, j + chunkSize);
      console.log(`   Uploading chunk ${Math.floor(j / chunkSize) + 1} (${chunk.length} records)...`);
      
      await index.upsert({
        records: chunk
      });
    }
    
    console.log("✅ Seeding complete! The AI's memory is now online.");

  } catch (error) {
    console.error("❌ Error during seeding:", error);
  }
}

seedDatabase();
