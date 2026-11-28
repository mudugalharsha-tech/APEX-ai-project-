import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Database, History, MessageSquare } from 'lucide-react';
import KnowledgeSidebar from './components/KnowledgeSidebar';
import ChatPanel from './components/ChatPanel';
import ToastContainer from './components/ToastContainer';
import SettingsModal from './components/SettingsModal';
import RagInspectorDrawer from './components/RagInspectorDrawer';

const DataGalaxy3D = lazy(() => import('./components/DataGalaxy3D'));

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000');

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.status >= 500
        ? `Server error (${res.status}). If using Render Free, the backend may be waking up—please try again in 30s.`
        : `Unexpected response (${res.status})`
    );
  }
}
const SOURCES_STORAGE_KEY = 'aura_rag_sources';
const SESSIONS_STORAGE_KEY = 'aura_rag_sessions';
const API_KEY_STORAGE_KEY = 'openrouter_api_key';
const MODEL_STORAGE_KEY = 'openrouter_model';
const DEVICE_ID_KEY = 'aura_device_id';
const DEVICE_SECRET_KEY = 'aura_device_secret';

function getDeviceHeaders() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  let deviceSecret = localStorage.getItem(DEVICE_SECRET_KEY);

  if (!deviceId || deviceId.length < 16) {
    deviceId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  if (!deviceSecret || deviceSecret.length < 32) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    deviceSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_SECRET_KEY, deviceSecret);
  }

  return {
    'X-Device-ID': deviceId,
    'X-Device-Secret': deviceSecret,
  };
}

function loadPersistedJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [sourcesList, setSourcesList] = useState(() =>
    loadPersistedJson(SOURCES_STORAGE_KEY, [])
  );
  const [activeSources, setActiveSources] = useState([]);

  // Multi-session chat history persisted in localStorage
  const [chatSessions, setChatSessions] = useState(() =>
    loadPersistedJson(SESSIONS_STORAGE_KEY, [])
  );
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const existing = loadPersistedJson(SESSIONS_STORAGE_KEY, []);
    return existing.length > 0 ? existing[0].id : null;
  });
  const [messages, setMessages] = useState(() => {
    const existing = loadPersistedJson(SESSIONS_STORAGE_KEY, []);
    return existing.length > 0 ? existing[0].messages || [] : [];
  });

  const [isThinking, setIsThinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [toasts, setToasts] = useState([]);

  // OpenRouter API Key & Live Model Selection
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(API_KEY_STORAGE_KEY) || ''
  );
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MODEL_STORAGE_KEY) || 'openrouter/free'
  );
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [responseStyle, setResponseStyle] = useState('tailored');
  const [mobileView, setMobileView] = useState('chat'); // 'chat' | 'sources' | 'history' | 'xray'
  const [sidebarTab, setSidebarTab] = useState('sources');

  // RAG & LangChain X-Ray Inspector state
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectedTelemetry, setInspectedTelemetry] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [hoveredSource, setHoveredSource] = useState(null);
  const [sessionTotals, setSessionTotals] = useState({
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  });

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message, type = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast]
  );

  // Persist sourcesList in localStorage to stay aligned with ChromaDB across reloads
  useEffect(() => {
    try {
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sourcesList));
    } catch {
      // Ignore storage quota errors
    }
  }, [sourcesList]);

  // Persist chatSessions in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(chatSessions));
    } catch {
      // Ignore storage quota errors
    }
  }, [chatSessions]);

  const syncMessagesToSession = useCallback(
    (nextMessages, sessionIdOverride = null) => {
      const targetId =
        sessionIdOverride ||
        activeSessionId ||
        `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (!activeSessionId && !sessionIdOverride) {
        setActiveSessionId(targetId);
      }

      const firstUser = nextMessages.find((m) => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 42) + (firstUser.content.length > 42 ? '…' : '')
        : 'New Conversation';

      setChatSessions((prev) => {
        const exists = prev.some((s) => s.id === targetId);
        const updatedSession = {
          id: targetId,
          title,
          updatedAt: Date.now(),
          messages: nextMessages,
        };
        if (exists) {
          return prev.map((s) => (s.id === targetId ? updatedSession : s));
        }
        return [updatedSession, ...prev];
      });

      return targetId;
    },
    [activeSessionId]
  );

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setActiveSources([]);
  };

  const handleSelectSession = (sessionId) => {
    const found = chatSessions.find((s) => s.id === sessionId);
    if (!found) return;
    setActiveSessionId(found.id);
    setMessages(found.messages || []);
    const lastAssistantWithSources = [...(found.messages || [])]
      .reverse()
      .find((m) => m.role === 'assistant' && m.sources?.length > 0);
    setActiveSources(lastAssistantWithSources?.sources || []);
  };

  const handleDeleteSession = (sessionId) => {
    setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setActiveSources([]);
    }
  };

  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const res = await fetch(`${API_BASE}/models`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to load OpenRouter models.');
      }
      const loadedModels = data.models || [];
      setModels(loadedModels);
      if (!localStorage.getItem(MODEL_STORAGE_KEY) && loadedModels.length > 0) {
        const freeRouter = loadedModels.find((m) => m.id === 'openrouter/free');
        const firstFree = loadedModels.find((m) => m.is_free);
        if (freeRouter) {
          setSelectedModel(freeRouter.id);
        } else if (firstFree) {
          setSelectedModel(firstFree.id);
        }
      }
    } catch (err) {
      addToast(err.message || 'Could not fetch live OpenRouter models.', 'error');
    } finally {
      setIsLoadingModels(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const selectedModelInfo = useMemo(
    () => models.find((m) => m.id === selectedModel) || null,
    [models, selectedModel]
  );

  const handleSaveApiKey = (key) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      addToast('OpenRouter API key saved.', 'success');
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      addToast('OpenRouter API key cleared.', 'info');
    }
  };

  const handleSelectModel = (modelId) => {
    setSelectedModel(modelId);
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
    addToast(`Selected model: ${modelId}`, 'success');
  };

  const handleUploadFiles = async (files) => {
    setIsUploading(true);
    setUploadError('');
    addToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/upload-file`, {
          method: 'POST',
          headers: getDeviceHeaders(),
          body: formData,
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) {
          throw new Error(data.detail || `Failed to upload ${file.name}`);
        }
        setSourcesList((prev) => [...prev, data]);
        addToast(`Indexed "${data.name}" (${data.chunks_added} chunks)`, 'success');
      }
    } catch (err) {
      const msg = err.message || 'File upload failed.';
      setUploadError(msg);
      addToast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadUrl = async (url) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      const msg = 'Invalid URL. Please enter a valid http:// or https:// link.';
      setUploadError(msg);
      addToast(msg, 'error');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    addToast('Fetching and indexing URL...', 'info');
    try {
      const res = await fetch(`${API_BASE}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDeviceHeaders(),
        },
        body: JSON.stringify({ url }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to ingest URL.');
      }
      setSourcesList((prev) => [...prev, data]);
      addToast(`Indexed "${data.name}" (${data.chunks_added} chunks)`, 'success');
    } catch (err) {
      const msg = err.message || 'URL ingestion failed.';
      setUploadError(msg);
      addToast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = async () => {
    setIsUploading(true);
    setUploadError('');
    try {
      const res = await fetch(`${API_BASE}/reset`, {
        method: 'DELETE',
        headers: getDeviceHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to reset knowledge base.');
      }

      if (sourcesList.length > 0) {
        setIsResetting(true);
        await new Promise((resolve) => setTimeout(resolve, 380));
      }

      setSourcesList([]);
      setActiveSources([]);
      setMessages([]);
      setActiveSessionId(null);
      localStorage.removeItem(SOURCES_STORAGE_KEY);
      addToast('Knowledge base and 3D galaxy cleared.', 'success');
    } catch (err) {
      const msg = err.message || 'Reset failed.';
      setUploadError(msg);
      addToast(msg, 'error');
    } finally {
      setIsResetting(false);
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (question) => {
    if (!apiKey.trim()) {
      addToast('Please enter your OpenRouter API key before chatting.', 'info');
      setIsSettingsOpen(true);
      return;
    }

    const userMessage = { role: 'user', content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    const sessionId = syncMessagesToSession(nextMessages);
    setPendingQuestion(question);
    setIsThinking(true);

    try {
      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDeviceHeaders(),
        },
        body: JSON.stringify({
          question,
          chat_history: chatHistory,
          api_key: apiKey,
          model: selectedModel,
          response_style: responseStyle,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setIsSettingsOpen(true);
        }
        throw new Error(data.detail || 'Failed to get response.');
      }

      const citedSources = data.sources || [];
      setActiveSources(citedSources);
      if (data.telemetry) {
        setInspectedTelemetry(data.telemetry);
        const t = data.telemetry.tokens || {};
        setSessionTotals((prev) => ({
          input_tokens: prev.input_tokens + (t.input_tokens || 0),
          output_tokens: prev.output_tokens + (t.output_tokens || 0),
          total_tokens: prev.total_tokens + (t.total_tokens || 0),
        }));
      }
      const completedMessages = [
        ...nextMessages,
        {
          role: 'assistant',
          content: data.answer || 'No answer returned.',
          sources: citedSources,
          telemetry: data.telemetry || null,
        },
      ];
      setMessages(completedMessages);
      syncMessagesToSession(completedMessages, sessionId);
    } catch (err) {
      const msg = err.message || 'Could not reach backend at http://localhost:8000';
      addToast(msg, 'error');
      const erroredMessages = [
        ...nextMessages,
        {
          role: 'assistant',
          content: `**Error:** ${msg}`,
          sources: [],
        },
      ];
      setMessages(erroredMessages);
      syncMessagesToSession(erroredMessages, sessionId);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Interactive 3D Floating Document & Data Galaxy Background (lazy-loaded) */}
      <Suspense fallback={null}>
        <DataGalaxy3D
          sourcesList={sourcesList}
          activeSources={activeSources}
          hoveredSource={hoveredSource}
          isThinking={isThinking}
          isResetting={isResetting}
        />
      </Suspense>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* API Key & Live Model Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
        models={models}
        isLoadingModels={isLoadingModels}
        onRefreshModels={fetchModels}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
      />

      {/* Ambient warm honey-gold, copper, and rose-blush glows matching the artwork */}
      <div
        className="pointer-events-none fixed -top-32 right-1/4 w-[520px] h-[520px] rounded-full blur-3xl opacity-25 z-[1]"
        style={{
          background:
            'radial-gradient(circle, rgba(251,113,133,0.38) 0%, rgba(234,88,12,0.22) 45%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none fixed -bottom-32 left-1/4 w-[540px] h-[540px] rounded-full blur-3xl opacity-25 z-[1]"
        style={{
          background:
            'radial-gradient(circle, rgba(252,211,77,0.42) 0%, rgba(194,65,12,0.22) 50%, transparent 75%)',
        }}
      />

      {/* Main Mobile-First Frosted-Glass Shell */}
      <div className="pointer-events-none relative z-10 h-full w-full p-2 sm:p-3 md:p-5 flex flex-col md:flex-row gap-2 md:gap-4 justify-between">
        {/* Desktop Sidebar OR Mobile Sources/History View */}
        <div
          className={`pointer-events-auto flex-1 md:flex-none min-h-0 md:h-full shrink-0 ${
            mobileView === 'sources' || mobileView === 'history'
              ? 'block'
              : 'hidden md:block'
          }`}
        >
          <KnowledgeSidebar
            sourcesList={sourcesList}
            activeSources={activeSources}
            onUploadFiles={handleUploadFiles}
            onUploadUrl={handleUploadUrl}
            onReset={handleReset}
            isUploading={isUploading}
            uploadError={uploadError}
            chatSessions={chatSessions}
            activeSessionId={activeSessionId}
            onNewChat={() => {
              handleNewChat();
              setMobileView('chat');
            }}
            onSelectSession={(id) => {
              handleSelectSession(id);
              setMobileView('chat');
            }}
            onDeleteSession={handleDeleteSession}
            activeTab={sidebarTab}
            onTabChange={(tab) => {
              setSidebarTab(tab);
              setMobileView(tab);
            }}
          />
        </div>

        {/* Full-Height Chat Panel */}
        <div
          className={`pointer-events-auto flex-1 min-h-0 md:h-full min-w-0 ${
            mobileView === 'chat' ? 'block' : 'hidden md:block'
          }`}
        >
          <ChatPanel
            messages={messages}
            isThinking={isThinking}
            onSendMessage={handleSendMessage}
            selectedModelInfo={selectedModelInfo}
            selectedModel={selectedModel}
            hasApiKey={Boolean(apiKey.trim())}
            onOpenSettings={() => setIsSettingsOpen(true)}
            responseStyle={responseStyle}
            onChangeResponseStyle={setResponseStyle}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => {
              setIsInspectorOpen((prev) => {
                const next = !prev;
                if (next) setMobileView('xray');
                else if (mobileView === 'xray') setMobileView('chat');
                return next;
              });
            }}
            onInspectMessage={(telemetry) => {
              setInspectedTelemetry(telemetry);
              setIsInspectorOpen(true);
              setMobileView('xray');
            }}
          />
        </div>

        {/* Right-Side Collapsible RAG & LangChain X-Ray Inspector */}
        {isInspectorOpen && (
          <div
            className={`pointer-events-auto flex-1 md:flex-none min-h-0 md:h-full shrink-0 ${
              mobileView === 'xray' ? 'block' : 'hidden md:block'
            }`}
          >
            <RagInspectorDrawer
              isOpen={isInspectorOpen}
              onClose={() => {
                setIsInspectorOpen(false);
                if (mobileView === 'xray') setMobileView('chat');
              }}
              telemetry={inspectedTelemetry}
              sessionTotals={sessionTotals}
              isThinking={isThinking}
              pendingQuestion={pendingQuestion}
              selectedModel={selectedModel}
              selectedModelInfo={selectedModelInfo}
              onHoverSource={setHoveredSource}
            />
          </div>
        )}

        {/* Mobile Bottom Tab Bar (Chat | Sources | History | X-Ray) */}
        <nav
          className="pointer-events-auto md:hidden shrink-0 flex items-center gap-1 p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] rounded-2xl backdrop-blur-xl bg-slate-950/85 border border-white/15 shadow-2xl"
          aria-label="Mobile navigation"
        >
          <button
            type="button"
            onClick={() => setMobileView('chat')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              mobileView === 'chat'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSidebarTab('sources');
              setMobileView('sources');
            }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              mobileView === 'sources'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Sources</span>
            {sourcesList.length > 0 && (
              <span className="px-1 rounded-full text-[10px] bg-white/10 text-slate-200">
                {sourcesList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSidebarTab('history');
              setMobileView('history');
            }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              mobileView === 'history'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsInspectorOpen(true);
              setMobileView('xray');
            }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              mobileView === 'xray'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>X-Ray</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
