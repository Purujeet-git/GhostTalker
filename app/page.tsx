'use client';

import { useState, useRef, FormEvent, ChangeEvent } from 'react';

export default function Home() {
  // Primitives can be inferred, but it is good practice to be explicit
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // The ref must be typed to the specific HTML media element it will attach to
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Type the form submission event
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
      
      setInput('');
    } catch (error) {
      console.error('Error fetching audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-[#0a0a0a] text-gray-200">
      <div className="w-full max-w-md space-y-8">
        <h1 className="text-3xl font-bold text-center tracking-tight text-white">Voice Terminal</h1>
        
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            // Type the input change event
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-3 rounded-md bg-[#121212] border border-[#2a2a2a] text-white focus:outline-none focus:border-gray-500 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing' : 'Transmit'}
          </button>
        </form>

        <audio ref={audioRef} className="hidden" />
      </div>
    </main>
  );
}