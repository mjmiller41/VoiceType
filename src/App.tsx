/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Copy, Check, Settings2, Trash2, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [isActuallyRecording, setIsActuallyRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const transcriptTextRef = useRef('');
  useEffect(() => { transcriptTextRef.current = transcript; }, [transcript]);

  const [interimTranscript, setInterimTranscript] = useState('');
  const [pendingPunctuation, setPendingPunctuation] = useState('');
  const pendingTextRef = useRef('');
  const debounceTimerRef = useRef<any>(null);

  const [autoCopy, setAutoCopy] = useState(true);
  const [autoPunctuate, setAutoPunctuate] = useState(true);
  const [isPunctuating, setIsPunctuating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please try Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsActuallyRecording(true);
      setError(null);
    };

    const handleFinalTranscript = async (chunk: string) => {
      if (!chunk.trim()) return;
      
      let processedChunk = chunk;
      
      if (autoPunctuate) {
        setIsPunctuating(true);
        try {
          const res = await fetch('/api/punctuate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) processedChunk = data.text;
          }
        } catch (e) {
          console.error("Failed to punctuate", e);
        } finally {
          setIsPunctuating(false);
        }
      }

      setTranscript((prev) => {
        const newTranscript = prev 
          ? prev + (processedChunk.match(/^[.,?!]/) ? '' : ' ') + processedChunk.trim() 
          : processedChunk.trim();
        
        // Auto-copy to clipboard
        if (autoCopy) {
          copyToClipboard(newTranscript);
        }
        
        return newTranscript;
      });
    };

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let finalTranscriptChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscriptChunk += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(currentInterim);

      if (finalTranscriptChunk) {
        handleFinalTranscript(finalTranscriptChunk);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone permission denied. Please allow microphone access.");
        setIsListening(false);
        setIsActuallyRecording(false);
      } else if (event.error === 'no-speech') {
        // Just ignore no-speech, it will restart if continuous
      } else {
        setError(`Microphone error: ${event.error}. If you are in the preview window, please try opening the app in a new tab.`);
      }
    };

    recognition.onend = () => {
      setIsActuallyRecording(false);
      // Automatically restart if it was supposed to be listening (continuous dictation)
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition", e);
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [autoCopy, autoPunctuate, isListening]);

  // Scroll to bottom when transcript updates
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript]);

  const errorRef = useRef(error);
  useEffect(() => { errorRef.current = error; }, [error]);

  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const autoCopyRef = useRef(autoCopy);
  useEffect(() => { autoCopyRef.current = autoCopy; }, [autoCopy]);

  const autoPunctuateRef = useRef(autoPunctuate);
  useEffect(() => { autoPunctuateRef.current = autoPunctuate; }, [autoPunctuate]);

  const playSound = (type: 'on' | 'off') => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      if (type === 'on') {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
      } else {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      }
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio context error", e);
    }
  };

  const startListening = () => {
    if (errorRef.current && !recognitionRef.current) return;
    if (!isListeningRef.current) {
      try {
        setError(null);
        recognitionRef.current?.start();
        setIsListening(true);
        playSound('on');
      } catch (err) {
        console.error("Error starting recognition:", err);
      }
    }
  };

  const stopListening = () => {
    if (isListeningRef.current) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setIsActuallyRecording(false);
      playSound('off');
    }
  };

  const toggleListening = () => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startListening();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        stopListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const pendingCopyText = useRef<string | null>(null);

  const copyToClipboard = React.useCallback(async (text: string) => {
    if (!text) return;
    
    try {
      if (document.hasFocus && !document.hasFocus()) {
        pendingCopyText.current = text;
        return;
      }
      
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      console.error("Failed to copy", err);
      pendingCopyText.current = text;
      if (err.message?.includes('Document is not focused') || err.name === 'NotAllowedError') {
        // Handle silently by queuing it for focus
      } else {
        setError(`Clipboard error: ${err.message}. Try opening in a new tab.`);
      }
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (pendingCopyText.current && autoCopyRef.current) {
        copyToClipboard(pendingCopyText.current);
        pendingCopyText.current = null;
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [copyToClipboard]);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please try Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsActuallyRecording(true);
      setError(null);
    };

    const handleFinalTranscript = async (chunk: string) => {
      if (!chunk.trim()) return;
      
      if (!autoPunctuateRef.current) {
        setTranscript((prev) => {
          const newTranscript = prev 
            ? prev + (chunk.match(/^[.,?!]/) ? '' : ' ') + chunk.trim() 
            : chunk.trim();
          
          if (autoCopyRef.current) copyToClipboard(newTranscript);
          return newTranscript;
        });
        return;
      }

      // Add to buffer
      pendingTextRef.current = pendingTextRef.current 
        ? pendingTextRef.current + ' ' + chunk.trim() 
        : chunk.trim();
      setPendingPunctuation(pendingTextRef.current);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce for 2 seconds of silence
      debounceTimerRef.current = setTimeout(async () => {
        const textToProcess = pendingTextRef.current;
        if (!textToProcess) return;

        pendingTextRef.current = '';
        setPendingPunctuation('');
        setIsPunctuating(true);

        let processedChunk = textToProcess;
        try {
          const res = await fetch('/api/punctuate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: textToProcess,
              previousText: transcriptTextRef.current.slice(-200)
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) processedChunk = data.text;
          } else {
            const errData = await res.json().catch(() => ({}));
            console.error("API Error punctuating:", errData);
            const errStr = JSON.stringify(errData).toLowerCase();
            if (errStr.includes('quota') || errStr.includes('429')) {
               setError("AI Punctuation paused: API rate limit exceeded. Falling back to raw text.");
               setAutoPunctuate(false);
            } else if (errStr.includes('503') || errStr.includes('unavailable') || errStr.includes('overloaded')) {
               setError("AI Punctuation temporarily unavailable due to high demand. Retrying later.");
            }
          }
        } catch (e) {
          console.error("Failed to punctuate", e);
        } finally {
          setIsPunctuating(false);
          setTranscript((prev) => {
            const newTranscript = prev 
              ? prev + (processedChunk.match(/^[.,?!]/) ? '' : ' ') + processedChunk.trim() 
              : processedChunk.trim();
            
            if (autoCopyRef.current) {
              copyToClipboard(newTranscript);
            }
            
            return newTranscript;
          });
        }
      }, 2000);
    };

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let finalTranscriptChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscriptChunk += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(currentInterim);

      if (finalTranscriptChunk) {
        handleFinalTranscript(finalTranscriptChunk);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone permission denied. Please allow microphone access.");
        setIsListening(false);
        setIsActuallyRecording(false);
      } else if (event.error === 'no-speech') {
        // Just ignore no-speech, it will restart if continuous
      } else {
        setError(`Microphone error: ${event.error}. If you are in the preview window, please try opening the app in a new tab.`);
      }
    };

    recognition.onend = () => {
      setIsActuallyRecording(false);
      // Automatically restart if it was supposed to be listening (continuous dictation)
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition", e);
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [copyToClipboard]);

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    setPendingPunctuation('');
    pendingTextRef.current = '';
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans selection:bg-blue-500/30">
      <div className="w-full max-w-2xl bg-zinc-900/50 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col h-[85vh]">
        
        {/* Header */}
        <header className="px-6 py-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Mic className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg">VoiceType</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer group" title="Use AI to automatically add punctuation">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoPunctuate ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={autoPunctuate}
                  onChange={() => setAutoPunctuate(!autoPunctuate)}
                />
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoPunctuate ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                AI Punctuate
              </span>
            </label>

            <div className="w-px h-4 bg-zinc-800"></div>

            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoCopy ? 'bg-blue-500' : 'bg-zinc-700'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={autoCopy}
                  onChange={() => setAutoCopy(!autoCopy)}
                />
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoCopy ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">Auto-copy</span>
            </label>
          </div>
        </header>

        {/* Info Banner */}
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-6 py-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200/80 leading-relaxed">
            <p>
              As a progressive web app, VoiceType cannot type directly into other applications. Keep this window open and use the <strong>Auto-copy</strong> feature to instantly paste your speech anywhere.
            </p>
            <p className="mt-1 font-medium text-blue-300">
              Shortcuts: Hold <strong>Space</strong> to speak, or use <strong>Ctrl+M</strong> (Cmd+M) to toggle. If the mic isn't working, click "Open in New Tab".
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 text-sm text-red-400 flex items-center gap-2">
            {error}
          </div>
        )}

        {/* Transcript Area */}
        <div 
          ref={transcriptRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 text-lg leading-relaxed font-light"
        >
          <div className="text-zinc-200 whitespace-pre-wrap">
            {transcript}
            {pendingPunctuation && <span className="text-zinc-300">{transcript ? ' ' : ''}{pendingPunctuation}</span>}
            {interimTranscript && <span className="text-zinc-500 italic">{transcript || pendingPunctuation ? ' ' : ''}{interimTranscript}</span>}
          </div>
          
          {!transcript && !pendingPunctuation && !isListening && (
            <p className="text-zinc-600 italic text-center mt-20">Tap the microphone to start dictating...</p>
          )}
          
          {isActuallyRecording && !interimTranscript && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-2 h-5 bg-blue-500 inline-block align-middle ml-1"
            />
          )}
          
          {isPunctuating && (
             <p className="text-purple-400 italic text-sm mt-4 flex items-center justify-center gap-2">
               <Sparkles className="w-4 h-4 animate-pulse" />
               Adding punctuation...
             </p>
          )}

          {isListening && !isActuallyRecording && !error && (
             <p className="text-zinc-500 italic text-center mt-4">Starting microphone...</p>
          )}
        </div>

        {/* Controls Footer */}
        <footer className="p-6 border-t border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between">
          <button
            onClick={clearTranscript}
            disabled={!transcript && !interimTranscript}
            className="p-3 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            title="Clear transcript"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="relative group">
            {isListening && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1.2 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse" }}
                className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl"
              />
            )}
            <button
              onClick={toggleListening}
              title="Hold Space to dictate, or Ctrl+M to toggle"
              className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                isListening 
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
              }`}
            >
              {isListening ? (
                <MicOff className="w-7 h-7 text-white" />
              ) : (
                <Mic className="w-7 h-7 text-white" />
              )}
            </button>
          </div>

          <button
            onClick={() => copyToClipboard(transcript)}
            disabled={!transcript}
            className="flex items-center gap-2 px-4 py-2.5 text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-zinc-800"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            <span className="font-medium text-sm">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
