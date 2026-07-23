import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';

// Initialize the Gemini client for embeddings
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Safely initialize Pinecone only if the API key exists
const pineconeApiKey = process.env.PINECONE_API_KEY;
let pineconeIndex: any = null;

if (pineconeApiKey) {
  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  // Ensure this index name matches what you create in your Pinecone dashboard
  pineconeIndex = pinecone.Index('persona-memory-index'); 
}

/**
 * Turns text into a mathematical vector using Gemini's embedding model.
 */
async function createEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'embedding-001', // Safest fallback: Always 768 dimensions and globally available
    contents: text,
  });
  
  if (!response.embeddings || !response.embeddings[0].values) {
      throw new Error("Failed to generate embeddings from Gemini.");
  }
  
  return response.embeddings[0].values;
}

/**
 * Retrieves relevant memories and behavioral traits from Pinecone based on the user's message AND the target Persona ID.
 */
export async function retrievePersonaContext(userMessage: string, personaId: string): Promise<string> {
  // Fallback if Pinecone isn't set up yet
  if (!pineconeIndex) {
    console.warn("Pinecone API key missing or index not initialized. Skipping RAG retrieval.");
    return "Use your base personality instructions to respond.";
  }

  try {
    // 1. Convert the user's question into a vector
    const queryVector = await createEmbedding(userMessage);

    // 2. Query the vector database for the top 5 most relevant pieces of information
    // MULTI-USER UPGRADE: We now filter by the specific persona!
    const queryResponse = await pineconeIndex.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true, 
      filter: { 
        personaId: personaId // <-- THE MAGIC KEY: This prevents memories from mixing!
      }
    });

    // 3. Separate the retrieved data into Categories
    let factsAndMemories = "";
    let decisionFrameworks = "";

    queryResponse.matches.forEach((match: any) => {
      const metadata = match.metadata;
      if (!metadata) return;
      
      // If the DB returned a memory (e.g., a past vacation or event)
      if (metadata.type === "memory") {
        factsAndMemories += `- ${metadata.content}\n`;
      } 
      // If the DB returned a behavioral trait (e.g., risk tolerance)
      else if (metadata.type === "decision_framework") {
        decisionFrameworks += `- CORE BEHAVIOR: ${metadata.content}\n`;
      }
    });

    // If nothing relevant was found, return a fallback
    if (!factsAndMemories && !decisionFrameworks) {
        return "No specific memories triggered. Rely on your general personality parameters.";
    }

    // 4. Format this into a prompt injection block
    const injectedContext = `
--- RELEVANT CONTEXT FOR THIS RESPONSE ---

PAST MEMORIES / FACTS:
${factsAndMemories || "No specific memories found for this topic."}

HOW TO THINK / DECIDE:
${decisionFrameworks || "Rely on your general personality parameters."}
------------------------------------------
    `;

    return injectedContext;

  } catch (error) {
    console.error("Error retrieving context from Pinecone:", error);
    // Graceful degradation: If the DB fails, the chat still works, just without deep memory.
    return "Use your base personality instructions to respond.";
  }
}