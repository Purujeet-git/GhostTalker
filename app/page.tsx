'use client';

import { useState, useRef, FormEvent, ChangeEvent } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface EmotionData {
  time: number;
  valence: number;
  arousal: number;
  message: string;
}

export default function Home() {
  const [inputA, setInputA] = useState<string>('');
  const [inputB, setInputB] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<EmotionData[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputA.trim() || !inputB.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageA: inputA, messageB: inputB }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const valenceStr = response.headers.get('X-Emotion-Valence');
      const arousalStr = response.headers.get('X-Emotion-Arousal');
      const textEncoded = response.headers.get('X-AI-Text');

      const valence = valenceStr ? parseFloat(valenceStr) : 0;
      const arousal = arousalStr ? parseFloat(arousalStr) : 0;
      const aiText = textEncoded ? decodeURIComponent(textEncoded) : "";

      setHistory(prev => [...prev, { 
        time: Date.now(), 
        valence, 
        arousal, 
        message: aiText 
      }]);

      // BROWSER VOICE: Safely triggering built-in TTS and ignoring the empty backend buffer
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stops previous speech if you send a new message quickly
        const utterance = new SpeechSynthesisUtterance(aiText);
        utterance.rate = 0.95; 
        utterance.pitch = valence > 0 ? 1.2 : 0.8; 
        window.speechSynthesis.speak(utterance);
      }
      
      setInputA('');
      setInputB('');
    } catch (error) {
      console.error('Error fetching audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900 border border-gray-700 p-3 rounded text-sm text-gray-300 w-64 shadow-xl">
          <p className="font-bold text-white mb-2">Response:</p>
          <p className="italic">"{data.message}"</p>
          <div className="mt-2 text-xs font-mono text-gray-500">
            [V: {data.valence.toFixed(2)}, A: {data.arousal.toFixed(2)}]
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 lg:p-24 bg-[#0a0a0a] text-gray-200">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="flex flex-col justify-center space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Persona Core</h1>
            <p className="text-gray-500 text-sm">Neural Link Established with Pinecone Memory. Awaiting input.</p>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <textarea
                value={inputA}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputA(e.target.value)}
                placeholder="Partner A: Tell me your side of the conflict..."
                className="w-full p-4 h-32 resize-none rounded-md bg-[#121212] border border-[#2a2a2a] text-white focus:outline-none focus:border-blue-500 transition-colors"
                disabled={isLoading}
              />
              <textarea
                value={inputB}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputB(e.target.value)}
                placeholder="Partner B: Tell me your side of the conflict..."
                className="w-full p-4 h-32 resize-none rounded-md bg-[#121212] border border-[#2a2a2a] text-white focus:outline-none focus:border-blue-500 transition-colors"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-white text-black font-semibold rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Retrieving Frameworks & Mediating...' : 'Analyze Conflict'}
            </button>
          </form>

          {history.length > 0 && (
            <div className="p-4 bg-[#121212] border border-gray-800 rounded-md">
              <span className="text-xs text-blue-500 uppercase tracking-widest font-bold mb-2 block">Latest Response</span>
              <p className="text-gray-300 italic">
                "{history[history.length - 1].message}"
              </p>
            </div>
          )}
        </div>

        <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-lg flex flex-col h-125">
          <h2 className="text-sm font-mono text-gray-400 mb-6 uppercase tracking-widest">Emotional Telemetry (Valence x Arousal)</h2>
          
          <div className="flex-1 w-full h-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis type="number" dataKey="valence" name="Valence" domain={[-1, 1]} tick={{fill: '#666'}} axisLine={{stroke: '#444'}} />
                <YAxis type="number" dataKey="arousal" name="Arousal" domain={[-1, 1]} tick={{fill: '#666'}} axisLine={{stroke: '#444'}} />
                <ReferenceLine y={0} stroke="#444" />
                <ReferenceLine x={0} stroke="#444" />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Emotions" data={history} fill="#3b82f6" line={{ stroke: '#1d4ed8', strokeWidth: 1 }} shape="circle" />
              </ScatterChart>
            </ResponsiveContainer>

            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 text-[10px] text-gray-500 uppercase">Excited / Tense</div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 text-[10px] text-gray-500 uppercase">Calm / Lethargic</div>
            <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-4 -rotate-90 text-[10px] text-gray-500 uppercase">Negative</div>
            <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-4 -rotate-90 text-[10px] text-gray-500 uppercase">Positive</div>
          </div>
        </div>
      </div>
    </main>
  );
}