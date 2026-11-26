import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowUp,
  Bot,
  FileCheck2,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  SlidersHorizontal,
  Sparkles,
  User,
} from 'lucide-react';
import ContourHero from './ContourHero';

export default function ChatPanel({
  messages,
  isThinking,
  onSendMessage,
  sourcesCount,
  selectedModelInfo,
  selectedModel,
  hasApiKey,
  onOpenSettings,
  user,
  onOpenAuth,
  onSignOut,
}) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const recognitionRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleListening = () => {
    setSpeechError('');
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError('Voice input is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    const baseText = input.trim();

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(baseText ? `${baseText} ${transcript}` : transcript);
    };
    recognition.onerror = (event) => {
      setSpeechError(
        event.error === 'not-allowed'
          ? 'Microphone permission denied.'
          : `Voice error: ${event.error}`
      );
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <main className="relative flex-1 flex flex-col rounded-2xl backdrop-blur-xl bg-slate-950/60 border border-white/15 shadow-2xl h-full overflow-hidden">
      {/* Subtle atmospheric watermark when chat has messages */}
      {messages.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <ContourHero compact />
        </div>
      )}

      {/* Top Bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-light tracking-[0.28em] uppercase text-slate-200">
            Neural Context Chat
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Active Model + API Key Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 text-xs transition-colors cursor-pointer max-w-[260px]"
            title="API & Model Settings"
          >
            <KeyRound
              className={`w-3.5 h-3.5 shrink-0 ${
                hasApiKey ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <span className="truncate text-slate-200 font-medium">
              {selectedModelInfo?.name || selectedModel}
            </span>
            {selectedModelInfo?.is_free && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shrink-0">
                FREE
              </span>
            )}
            <SlidersHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Firebase Auth User / Sign In Button */}
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-rose-500/15 border border-emerald-500/30 hover:border-rose-500/35 text-xs text-emerald-200 hover:text-rose-200 transition-colors cursor-pointer max-w-[160px]"
              title={`Signed in as ${user.email || user.displayName || 'User'} — Click to sign out`}
            >
              <span className="truncate">{user.displayName || user.email}</span>
              <LogOut className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-medium text-amber-200 transition-colors cursor-pointer"
              title="Sign in with Firebase"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Sign In</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                sourcesCount > 0 ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-600'
              }`}
            />
            <span>{sourcesCount > 0 ? 'Ready' : 'No Sources'}</span>
          </div>
        </div>
      </header>

      {/* Scrollable Message History */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <ContourHero />
            <p className="mt-4 max-w-md text-xs md:text-sm text-slate-400 leading-relaxed">
              Upload documents, spreadsheets, web articles, or YouTube links in the Knowledge Base,
              then ask anything across your sources.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-amber-500/20 border border-amber-500/35 text-slate-100'
                      : 'bg-white/[0.04] border border-white/10 text-slate-200'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="space-y-2.5 text-sm text-slate-200 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-900/90 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-amber-300 [&_pre]:bg-slate-900/90 [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_a]:text-amber-400 [&_a]:underline">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}

                  {/* Source Citation Pills */}
                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap gap-1.5">
                      {msg.sources.map((src, sIdx) => (
                        <span
                          key={sIdx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300 max-w-xs truncate"
                          title={src}
                        >
                          <FileCheck2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{src}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading / Thinking State */}
        {isThinking && (
          <div className="flex gap-3.5 justify-start">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/10 text-xs text-amber-200/80 flex items-center gap-2">
              <span>Synthesizing answer from retrieved context...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 p-4 border-t border-white/10 bg-slate-950/40"
      >
        {speechError && (
          <p className="mb-2 text-[11px] text-rose-300 px-1">{speechError}</p>
        )}
        <div className="flex items-center gap-2.5 rounded-2xl bg-slate-900/80 border border-white/15 px-4 py-2 focus-within:border-amber-500/60 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isListening
                ? 'Listening... speak your question'
                : 'Ask a question about your uploaded sources...'
            }
            disabled={isThinking}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={toggleListening}
            disabled={isThinking}
            className={`p-2 rounded-xl border transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
              isListening
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/15 text-slate-300 hover:text-amber-300'
            }`}
            title={isListening ? 'Stop voice input' : 'Speak your question'}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            {isListening ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
          <button
            type="submit"
            disabled={isThinking || !input.trim()}
            className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
            title="Send message"
          >
            {isThinking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </main>
  );
}
