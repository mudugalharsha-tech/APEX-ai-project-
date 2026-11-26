import React, { useRef, useState } from 'react';
import {
  Database,
  File,
  FileSpreadsheet,
  FileText,
  Globe,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';

function getSourceIcon(type) {
  switch ((type || '').toLowerCase()) {
    case 'pdf':
    case 'docx':
    case 'txt':
      return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />;
    case 'youtube':
      return <Video className="w-4 h-4 text-rose-400 shrink-0" />;
    case 'web':
      return <Globe className="w-4 h-4 text-sky-400 shrink-0" />;
    default:
      return <File className="w-4 h-4 text-slate-400 shrink-0" />;
  }
}

export default function KnowledgeSidebar({
  sourcesList,
  activeSources,
  onUploadFiles,
  onUploadUrl,
  onReset,
  isUploading,
  uploadError,
  chatSessions = [],
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}) {
  const fileInputRef = useRef(null);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('sources'); // 'sources' | 'history'

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onUploadFiles(files);
      e.target.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      onUploadFiles(files);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onUploadUrl(trimmed);
    setUrlInput('');
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 shrink-0 flex flex-col gap-3.5 p-4 rounded-2xl backdrop-blur-xl bg-slate-950/60 border border-white/15 shadow-2xl h-full overflow-hidden">
      {/* Sidebar Header + Tab Switcher */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10 flex-1">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'sources'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Sources</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300">
              {sourcesList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300">
              {chatSessions.length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 transition-colors cursor-pointer"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {activeTab === 'sources' ? (
        <>
          {/* File Dropzone / Picker */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`group cursor-pointer rounded-xl border border-dashed p-4 text-center transition-all ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-white/20 bg-white/[0.02] hover:border-amber-500/50 hover:bg-white/[0.04]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-1.5">
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
              ) : (
                <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-amber-400 transition-colors" />
              )}
              <p className="text-xs font-medium text-slate-200">
                {isUploading ? 'Ingesting into Chroma...' : 'Drop files or click to browse'}
              </p>
              <p className="text-[11px] text-slate-400">
                PDF, DOCX, TXT, CSV, XLSX
              </p>
            </div>
          </div>

          {/* URL / YouTube Input */}
          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste Web URL or YouTube link..."
                disabled={isUploading}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-900/70 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={isUploading || !urlInput.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </form>

          {/* Error banner */}
          {uploadError && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {uploadError}
            </div>
          )}

          {/* Scrollable Ingested Sources List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {sourcesList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 text-slate-500">
                <p className="text-xs">No sources uploaded yet.</p>
                <p className="text-[11px] mt-1">
                  Upload documents or URLs to build your knowledge graph.
                </p>
              </div>
            ) : (
              sourcesList.map((src) => {
                const isActive = activeSources.includes(src.name);
                return (
                  <div
                    key={src.id}
                    className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-amber-500/15 border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getSourceIcon(src.type)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-100 truncate" title={src.name}>
                          {src.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">
                          {src.type}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-slate-300">
                      {src.chunks_added} chunks
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Reset Knowledge Base */}
          <button
            type="button"
            onClick={onReset}
            disabled={isUploading}
            className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset Knowledge Base
          </button>
        </>
      ) : (
        /* Chat History Tab */
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Start New Chat
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {chatSessions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 text-slate-500">
                <MessageSquare className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-xs">No saved conversations yet.</p>
                <p className="text-[11px] mt-1">
                  Your chat history will appear here automatically.
                </p>
              </div>
            ) : (
              chatSessions.map((session) => {
                const isSelected = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400/50'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MessageSquare
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'text-amber-400' : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-100 truncate">
                          {session.title || 'New Conversation'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {session.messages.length} messages
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-all cursor-pointer"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
