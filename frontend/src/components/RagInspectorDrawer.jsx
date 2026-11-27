import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Code2,
  Coins,
  Cpu,
  Database,
  FileSearch,
  GitBranch,
  HelpCircle,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

function TooltipBadge({ text }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <HelpCircle className="w-3 h-3 text-slate-400 group-hover:text-amber-300 transition-colors" />
      <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 p-2 rounded-xl bg-slate-950/95 border border-amber-500/30 text-[10px] leading-relaxed text-slate-200 shadow-2xl z-50">
        {text}
      </span>
    </span>
  );
}

function estimateCost(tokens, modelInfo) {
  if (!tokens || !modelInfo || modelInfo.is_free) return 0;
  const pPrice = parseFloat(modelInfo.prompt_price || '0') || 0;
  const cPrice = parseFloat(modelInfo.completion_price || '0') || 0;
  return (tokens.input_tokens || 0) * pPrice + (tokens.output_tokens || 0) * cPrice;
}

export default function RagInspectorDrawer({
  isOpen,
  onClose,
  telemetry,
  sessionTotals,
  isThinking,
  pendingQuestion,
  selectedModel,
  selectedModelInfo,
  onHoverSource,
}) {
  const [activeTab, setActiveTab] = useState('flow'); // 'flow' | 'chunks' | 'tokens' | 'prompt'

  const latestCost = useMemo(
    () => estimateCost(telemetry?.tokens, selectedModelInfo),
    [telemetry, selectedModelInfo]
  );

  const sessionCost = useMemo(
    () => estimateCost(sessionTotals, selectedModelInfo),
    [sessionTotals, selectedModelInfo]
  );

  if (!isOpen) return null;

  const chunks = telemetry?.retrieved_chunks || [];
  const tokens = telemetry?.tokens;
  const breakdown = tokens?.breakdown || {};
  const anatomy = telemetry?.prompt_anatomy;
  const totalInputApprox =
    (breakdown.system_tokens || 0) +
    (breakdown.context_tokens || 0) +
    (breakdown.history_question_tokens || 0) || 1;

  return (
    <aside className="w-full md:w-96 shrink-0 flex flex-col gap-3 p-4 rounded-2xl backdrop-blur-xl bg-slate-950/75 border border-white/15 shadow-2xl h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-100">
              LangChain X-Ray Inspector
            </h2>
            <p className="text-[10px] text-slate-400">
              Live RAG pipeline & token telemetry
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close X-Ray Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Execution Mode Banner (RAG Grounded vs Base LLM Knowledge) */}
      {telemetry?.answer_mode && (
        <div
          className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${telemetry.answer_mode === 'RAG_GROUNDED'
              ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-100'
              : 'bg-purple-500/10 border-purple-400/35 text-purple-100'
            }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${telemetry.answer_mode === 'RAG_GROUNDED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                }`}
            >
              {telemetry.answer_mode === 'RAG_GROUNDED'
                ? 'RAG Grounded'
                : 'Base LLM Knowledge'}
            </span>
            {telemetry.answer_mode === 'RAG_GROUNDED' ? (
              <span className="text-[10px] text-emerald-300/90">
                +{breakdown.context_tokens || 0} context tokens
              </span>
            ) : (
              <span className="text-[10px] text-purple-300/90">
                Minimal input tokens
              </span>
            )}
          </div>
          <p className="text-[10px] opacity-90">{telemetry.mode_reason}</p>
        </div>
      )}

      {/* 4 Educational Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
        {[
          { id: 'flow', label: 'Flow', icon: GitBranch },
          { id: 'chunks', label: 'Chunks', icon: FileSearch },
          { id: 'tokens', label: 'Tokens', icon: Coins },
          { id: 'prompt', label: 'Prompt', icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${active
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/35'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {!telemetry && !isThinking ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-slate-400">
            <Sparkles className="w-6 h-6 text-amber-400/70 mb-2" />
            <p className="text-xs font-medium text-slate-200">
              No query inspected yet
            </p>
            <p className="text-[11px] mt-1 leading-relaxed text-slate-400">
              Send a message or click <span className="text-amber-300">Inspect Internals</span> on any AI reply to trace how LangChain retrieves chunks and builds the prompt.
            </p>
          </div>
        ) : activeTab === 'flow' ? (
          /* TAB 1: Live Pipeline Flow */
          <div className="space-y-2.5">
            {[
              {
                step: 1,
                title: 'User Query',
                status: isThinking ? 'done' : 'done',
                value: isThinking ? pendingQuestion : telemetry?.raw_query,
                tooltip: 'Your raw input message before any LangChain processing.',
              },
              {
                step: 2,
                title: 'History-Aware Reformulation',
                status: isThinking ? 'active' : 'done',
                value: isThinking
                  ? 'Rewriting query with chat_history...'
                  : telemetry?.reformulated_query,
                badge: telemetry?.was_reformulated ? 'Rewritten' : 'Standalone',
                tooltip:
                  'create_history_aware_retriever uses chat_history to turn follow-up questions (like "What about pricing?") into a standalone search query.',
              },
              {
                step: 3,
                title: 'Vector Search (ChromaDB)',
                status: isThinking ? 'pending' : 'done',
                value: isThinking
                  ? 'Embedding with all-MiniLM-L6-v2...'
                  : `${chunks.length} chunk${chunks.length === 1 ? '' : 's'} matched via all-MiniLM-L6-v2`,
                tooltip:
                  'Your query is converted into a 384-dim vector using HuggingFace all-MiniLM-L6-v2 and compared against stored chunks in ChromaDB.',
              },
              {
                step: 4,
                title: 'LLM Generation (OpenRouter)',
                status: isThinking ? 'pending' : 'done',
                value: isThinking
                  ? `Generating via ${selectedModel}...`
                  : `${telemetry?.llm_model} • ${telemetry?.llm_duration_ms} ms`,
                tooltip:
                  'LangChain stuffs the retrieved chunks into the prompt and streams them to your chosen OpenRouter model.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`p-3 rounded-xl border transition-all ${item.status === 'active'
                    ? 'bg-amber-500/15 border-amber-400/50'
                    : 'bg-white/[0.03] border-white/10'
                  }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {item.status === 'active' ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="text-[11px] font-semibold text-slate-100">
                      {item.step}. {item.title}
                    </span>
                    <TooltipBadge text={item.tooltip} />
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed break-words pl-5">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : activeTab === 'chunks' ? (
          /* TAB 2: Retrieved Chunks Inspector */
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-100/90 leading-relaxed">
              <strong className="text-amber-300">How this works:</strong> Files are split into{' '}
              <code className="text-amber-200">1000-char</code> chunks (<code className="text-amber-200">200</code> overlap). ChromaDB ranks them by cosine similarity. Hover a card to highlight its 3D node!
            </div>

            {chunks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No chunks were retrieved (knowledge base empty or general query).
              </p>
            ) : (
              chunks.map((chunk) => (
                <div
                  key={`${chunk.chunk_index}-${chunk.source}`}
                  onMouseEnter={() => onHoverSource?.(chunk.source)}
                  onMouseLeave={() => onHoverSource?.(null)}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-amber-500/10 border border-white/10 hover:border-amber-400/50 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-amber-300 truncate max-w-[190px]" title={chunk.source}>
                      #{chunk.chunk_index} • {chunk.source}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-300 shrink-0">
                      {chunk.match_percent}% Match
                    </span>
                  </div>

                  {/* Similarity progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400"
                      style={{ width: `${Math.max(4, chunk.match_percent)}%` }}
                    />
                  </div>

                  {chunk.page_or_sheet && (
                    <span className="inline-block px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-slate-300">
                      {chunk.page_or_sheet}
                    </span>
                  )}

                  <div className="max-h-28 overflow-y-auto rounded-lg bg-slate-950/70 border border-white/10 p-2 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {chunk.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'tokens' ? (
          /* TAB 3: Token & Cost Ledger */
          <div className="space-y-3">
            {/* Latest Message Card */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100">
                  Latest Message
                </span>
                {selectedModelInfo?.is_free || latestCost === 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                    $0.00 FREE
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-300">
                    ${latestCost.toFixed(6)}
                  </span>
                )}
              </div>

              {/* Input / Output summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-white/10">
                  <p className="text-[10px] text-slate-400">Input</p>
                  <p className="text-xs font-semibold text-amber-300">
                    {tokens?.input_tokens ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-white/10">
                  <p className="text-[10px] text-slate-400">Output</p>
                  <p className="text-xs font-semibold text-emerald-300">
                    {tokens?.output_tokens ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-white/10">
                  <p className="text-[10px] text-slate-400">Total</p>
                  <p className="text-xs font-semibold text-slate-100">
                    {tokens?.total_tokens ?? 0}
                  </p>
                </div>
              </div>

              {/* Stacked Input Token Breakdown Bar */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-400">Input Token Breakdown (approx.)</p>
                <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-white/10">
                  <div
                    className="bg-sky-400"
                    style={{
                      width: `${((breakdown.system_tokens || 0) / totalInputApprox) * 100}%`,
                    }}
                    title={`System Prompt: ~${breakdown.system_tokens || 0} tokens`}
                  />
                  <div
                    className="bg-amber-400"
                    style={{
                      width: `${((breakdown.context_tokens || 0) / totalInputApprox) * 100}%`,
                    }}
                    title={`Retrieved Chunks: ~${breakdown.context_tokens || 0} tokens`}
                  />
                  <div
                    className="bg-rose-400"
                    style={{
                      width: `${((breakdown.history_question_tokens || 0) / totalInputApprox) * 100}%`,
                    }}
                    title={`History + Question: ~${breakdown.history_question_tokens || 0} tokens`}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-300">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    System ({breakdown.system_tokens || 0})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Chunks ({breakdown.context_tokens || 0})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    History+Q ({breakdown.history_question_tokens || 0})
                  </span>
                </div>
              </div>
            </div>

            {/* Session Totals Card */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  Total Session
                </span>
                <span className="text-xs font-semibold text-emerald-300">
                  {selectedModelInfo?.is_free || sessionCost === 0
                    ? '$0.00'
                    : `$${sessionCost.toFixed(6)}`}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Input: {sessionTotals.input_tokens}</span>
                <span>Output: {sessionTotals.output_tokens}</span>
                <span>Total: {sessionTotals.total_tokens}</span>
              </div>
            </div>

            {/* Educational Note */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-100/90 leading-relaxed space-y-1.5">
              <p>
                <strong className="text-amber-300">Why RAG uses more input tokens:</strong>{' '}
                In <strong className="text-emerald-300">RAG Grounded</strong> mode, every retrieved chunk is stuffed into{' '}
                <code className="text-amber-200">{'{context}'}</code> before sending to OpenRouter.
              </p>
              <p className="text-slate-300">
                In <strong className="text-purple-300">Base LLM Knowledge</strong> mode, no chunks are injected—using far fewer input tokens and lower cost.
              </p>
            </div>
          </div>
        ) : (
          /* TAB 4: Prompt Anatomy */
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-100/90 leading-relaxed">
              <strong className="text-amber-300">create_stuff_documents_chain:</strong>{' '}
              LangChain combines your system rules, retrieved chunks (<code className="text-amber-200">{'{context}'}</code>),{' '}
              {anatomy?.history_messages_count || 0} history messages, and your question into one prompt.
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold mb-1">
                  System Instructions
                </p>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {anatomy?.system_prompt}
                </pre>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Stuffed {'{context}'} ({chunks.length} chunks)
                </p>
                <pre className="max-h-40 overflow-y-auto text-[11px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {anatomy?.context_block}
                </pre>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
                  Human Question
                </p>
                <pre className="text-[11px] text-slate-200 whitespace-pre-wrap font-mono">
                  {anatomy?.user_question}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
