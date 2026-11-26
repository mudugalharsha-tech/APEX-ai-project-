import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  models,
  isLoadingModels,
  onRefreshModels,
  selectedModel,
  onSelectModel,
}) {
  const [draftKey, setDraftKey] = useState(apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'free' | 'paid'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setDraftKey(apiKey || '');
  }, [apiKey, isOpen]);

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return models.filter((m) => {
      if (filterMode === 'free' && !m.is_free) return false;
      if (filterMode === 'paid' && m.is_free) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q)
      );
    });
  }, [models, filterMode, searchQuery]);

  if (!isOpen) return null;

  const handleSaveKey = (e) => {
    e.preventDefault();
    onSaveApiKey(draftKey.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-2xl backdrop-blur-xl bg-slate-950/90 border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                API & Model Settings
              </h2>
              <p className="text-[11px] text-slate-400">
                Connect your OpenRouter key and choose a live model
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* OpenRouter API Key Section */}
          <form onSubmit={handleSaveKey} className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              OpenRouter API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full pl-3 pr-10 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
              >
                Save Key
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Stored locally in your browser&apos;s <code className="text-slate-400">localStorage</code> and sent per chat request.
            </p>
          </form>

          {/* Live Model Selector Section */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-slate-200">
                  Live OpenRouter Models ({filteredModels.length})
                </span>
              </div>
              <button
                type="button"
                onClick={onRefreshModels}
                disabled={isLoadingModels}
                className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'All Models' },
                { key: 'free', label: 'Free Only' },
                { key: 'paid', label: 'Paid' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilterMode(tab.key)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    filterMode === tab.key
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models (e.g. llama-3.3-70b, gemini-2.0-flash, gpt-4o-mini)..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* Model List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {isLoadingModels && models.length === 0 ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading live OpenRouter models...</span>
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No models match your filter.
                </div>
              ) : (
                filteredModels.map((m) => {
                  const isSelected = m.id === selectedModel;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectModel(m.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-400/50'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-100 truncate">
                            {m.name}
                          </span>
                          {m.is_free && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shrink-0">
                              FREE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {m.id}
                          {m.context_length
                            ? ` • ${Math.round(m.context_length / 1000)}k ctx`
                            : ''}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
