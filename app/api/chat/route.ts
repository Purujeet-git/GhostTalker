import { streamText, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { Pinecone } from '@pinecone-database/pinecone';
import { BASE_PERSONA_PROMPT } from '../../../lib/prompts';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/db';
import { Chat } from '../../../models/Chat';

// Initialize Pinecone outside the request handler to reuse the connection
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
const pineconeIndex = pinecone.Index('persona-memory-index');

// IMPORTANT: We MUST NOT use `export const runtime = 'edge'` here!
// Mongoose relies on Node.js core modules (like 'net' and 'crypto') which 
// are not available in the lightweight Edge runtime.

// We allow up to 30 seconds for the LLM to think, call tools, and respond
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // 1. Parse the incoming request
    const { messages, personaId, sessionId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required.' }), { status: 400 });
    }

    // Default to the base persona if one isn't provided (for multi-tenant support)
    const activePersonaId = personaId || "therapist-001";
    
    // Default to a test session ID if the frontend doesn't send one yet
    const activeSessionId = sessionId || "session-test-123";

    // 2. Stream text using the Vercel AI SDK
    const result = streamText({
      model: google('gemini-2.5-flash'), // Use a fast model for agentic tool calling
      system: BASE_PERSONA_PROMPT,
      messages,
      stopWhen: stepCountIs(3), // Allow the model to call tools and then generate a response (Agentic Loop)
      
      // 3. Define the Tools the AI can use
      tools: {
        search_knowledge_base: tool({
          description: 'Search the therapeutic knowledge base for frameworks, theories, or advice relevant to the user\'s current conflict. ALWAYS use this tool if you need to recall specific psychological concepts.',
          inputSchema: z.object({
            query: z.string().describe('The search query to find relevant frameworks. E.g., "communication issues" or "feeling ignored".'),
          }),
          // Explicitly typing the query string prevents the 'undefined' overload mismatch error
          execute: async ({ query }: { query: string }) => {
            console.log(`[Tool Call] Searching Pinecone for: "${query}" (Persona: ${activePersonaId})`);
            
            try {
              // A. Convert the query to an embedding using the SDK
              // (Using fetch directly here to avoid importing the heavy legacy Google Gen AI SDK just for embeddings)
               const embedResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      model: 'models/text-embedding-004',
                      content: { parts: [{ text: query }] }
                  })
              });

              const embedData = await embedResponse.json();
              
              if (!embedData.embedding || !embedData.embedding.values) {
                 throw new Error("Failed to generate embedding");
              }

              const queryVector = embedData.embedding.values;

              // B. Query Pinecone with strict Metadata Filtering
              const queryResponse = await pineconeIndex.query({
                vector: queryVector,
                topK: 3, // Get top 3 most relevant frameworks
                includeMetadata: true,
                filter: { 
                  // CRITICAL: This ensures we only search the knowledge base for the active persona!
                  personaId: { $eq: activePersonaId } 
                }
              });

              // C. Format the results for the LLM
              if (queryResponse.matches.length === 0) {
                 return { context: "No relevant frameworks found. Rely on your general training." };
              }

              const context = queryResponse.matches.map(match => {
                const md = match.metadata;
                return `[Framework: ${md?.topic || 'Unknown'}] ${md?.content || ''}`;
              }).join('\n\n');

              console.log(`[Tool Result] Found ${queryResponse.matches.length} matches.`);
              return { context };

            } catch (e) {
              console.error("Tool execution failed:", e);
              return { context: "Error retrieving knowledge base. Do your best to mediate without it." };
            }
          },
        }),
      },
      // 4. Save to MongoDB when the AI finishes generating its response!
      onFinish: async ({ text }) => {
        try {
          await connectToDatabase();
          
          // Combine the user's past messages with the AI's new response
          const fullConversation = [
            ...messages.map((m: any) => ({ role: m.role, content: String(m.content || "") })),
            { role: 'assistant', content: text }
          ];

          // Upsert the chat document (Create it if it doesn't exist, update if it does)
          await Chat.findOneAndUpdate(
            { sessionId: activeSessionId },
            { 
              sessionId: activeSessionId,
              personaId: activePersonaId,
              messages: fullConversation
            },
            { upsert: true, new: true }
          );
          
          console.log(`[DB] Successfully saved chat session: ${activeSessionId}`);
        } catch (err) {
          console.error("[DB] Error saving chat to MongoDB:", err);
        }
      }
    });

    // 5. Return the stream directly to the client
    return result.toUIMessageStreamResponse();

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process request' }), { status: 500 });
  }
}