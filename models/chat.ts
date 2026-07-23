import mongoose, { Schema, Document, Model } from 'mongoose';

// 1. Define the structure of a single message
export interface IMessage {
  role: 'user' | 'assistant' | 'system' | 'data';
  content: string;
  createdAt: Date;
}

// 2. Define the structure of the overall chat session
export interface IChat extends Document {
  sessionId: string;      // A unique ID for this specific chat window
  personaId: string;      // Which AI clone they are talking to (e.g., 'therapist-001')
  messages: IMessage[];   // The array of chat messages
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ChatSchema = new Schema<IChat>({
  sessionId: { type: String, required: true, unique: true },
  personaId: { type: String, required: true },
  messages: [MessageSchema],
}, { 
  timestamps: true // Automatically manages createdAt and updatedAt
});

// 3. Prevent Mongoose from recompiling the model upon Next.js hot-reloads
export const Chat: Model<IChat> = mongoose.models.Chat || mongoose.model<IChat>('Chat', ChatSchema);