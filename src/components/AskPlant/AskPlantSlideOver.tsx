import React, { useState, useEffect, useRef } from 'react';
import { useBharatApex } from '../../context';
import { ChatMessage, sendAskPlantQuery } from '../../services/askService';

export interface AskPlantSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  'What is Tata Motors buffer status and run-out time?',
  'Simulate 3h delay for truck MH-14-GH-4091',
  'Which BOM parts are currently below safety stock?',
  'What is the status of machine CNC-01 and plant OEE?',
];

export const AskPlantSlideOver: React.FC<AskPlantSlideOverProps> = ({
  isOpen,
  onClose,
}) => {
  const { state } = useBharatApex();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      text: "👋 **Hello, Lead Controller.** I am connected directly to your shop-floor telemetry and pure calculation engines via Gemini function calling.\n\nI answer **strictly from live tool results** (`getBufferStatus`, `simulateTruckDelay`, `getLowStockItems`, `getMachineStatus`). Ask me anything about plant operations below!",
      timestamp: 'Ready',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedToolIndex, setExpandedToolIndex] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputValue).trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      const result = await sendAskPlantQuery(textToSend, messages, state);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        text: result.answer,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        calledTools: result.calledTools,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          text: "Add GEMINI_API_KEY to .env to enable the 'Ask the Plant' AI assistant.",
          timestamp: 'Offline',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      />

      {/* Slide-over Drawer Panel */}
      <div
        role="dialog"
        aria-label="Ask the Plant Chat"
        className="relative w-full sm:w-[480px] lg:w-[540px] h-full bg-surface-container-lowest dark:bg-[#0c1424] border-l border-outline-variant/30 dark:border-[#222e4a] shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 dark:border-[#222e4a] flex items-center justify-between bg-surface-container-low dark:bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-on-surface dark:text-white">
                  Ask the Plant
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary dark:text-indigo-400 border border-primary/20">
                  Tool-Calling AI
                </span>
              </div>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Real-time answers computed strictly by pure domain functions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'init-1',
                    role: 'assistant',
                    text: '👋 Chat history cleared. Ask a new inquiry below!',
                    timestamp: 'Ready',
                  },
                ])
              }
              title="Clear Conversation"
              className="p-1.5 rounded-lg text-secondary hover:text-on-surface dark:hover:text-white hover:bg-surface-container dark:hover:bg-[#1e293b] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close panel"
              className="p-1.5 rounded-lg text-secondary hover:text-on-surface dark:hover:text-white hover:bg-surface-container dark:hover:bg-[#1e293b] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Suggested Questions */}
        <div className="px-4 py-2.5 bg-surface-container-low/60 dark:bg-[#0a0f1c] border-b border-outline-variant/10 dark:border-[#1a253d] overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider mr-1">
              Suggested:
            </span>
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a] text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white hover:border-primary/40 transition-colors shadow-2xs"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-secondary">
                  <span className="font-bold">{isUser ? 'Lead Controller' : 'Plant Cockpit AI'}</span>
                  <span>·</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[90%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-primary text-white rounded-tr-xs shadow-sm'
                      : 'bg-surface-container-low dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] text-on-surface dark:text-[#e2e8f0] rounded-tl-xs shadow-xs'
                  }`}
                >
                  {/* Tool Call Trace Indicator */}
                  {msg.calledTools && msg.calledTools.length > 0 && (
                    <div className="mb-2.5 pb-2 border-b border-outline-variant/20 dark:border-[#222e4a] flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-tertiary dark:text-emerald-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">bolt</span>
                        <span>Tools Executed from Pure Functions:</span>
                      </span>
                      {msg.calledTools.map((tool, tIdx) => {
                        const toolKey = `${msg.id}-tool-${tIdx}`;
                        const isExpanded = expandedToolIndex === toolKey;

                        return (
                          <div
                            key={tIdx}
                            className="bg-surface-container dark:bg-[#0c1424] rounded-lg p-1.5 border border-outline-variant/30 dark:border-[#1e293b] font-mono text-[10px]"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-primary dark:text-indigo-400 font-bold">
                                {tool.name}({JSON.stringify(tool.args)})
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedToolIndex(isExpanded ? null : toolKey)}
                                className="text-secondary hover:text-on-surface dark:hover:text-white underline text-[9px]"
                              >
                                {isExpanded ? 'Hide Data' : 'Inspect Tool Result'}
                              </button>
                            </div>
                            {isExpanded && (
                              <pre className="mt-1.5 p-1.5 bg-black/40 rounded text-[9px] overflow-x-auto text-[#94a3b8] max-h-36">
                                {JSON.stringify(tool.result, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Message Markdown prose formatted simply */}
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-secondary">
                <span className="font-bold">Plant Cockpit AI</span>
                <span>·</span>
                <span className="text-primary font-semibold animate-pulse">Calling domain tools...</span>
              </div>
              <div className="bg-surface-container-low dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] rounded-2xl rounded-tl-xs p-3.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="text-xs text-secondary dark:text-[#94a3b8] font-mono">
                  Evaluating pure functions & buffer metrics...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 border-t border-outline-variant/20 dark:border-[#222e4a] bg-surface-container-low dark:bg-[#0f172a]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about buffer run-outs, truck delays, BOM deficits..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
              className="flex-1 h-10 px-3.5 bg-surface-container dark:bg-[#162035] border border-outline-variant/40 dark:border-[#222e4a] rounded-xl text-xs text-on-surface dark:text-white placeholder:text-secondary/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || loading}
              className={`h-10 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                !inputValue.trim() || loading
                  ? 'bg-surface-container text-secondary/40 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-container text-white shadow-md shadow-primary/20'
              }`}
            >
              <span>Ask</span>
              <span className="material-symbols-outlined text-[16px]">send</span>
            </button>
          </form>
          <div className="flex items-center justify-between text-[10px] text-secondary dark:text-[#64748b] mt-1.5 px-1">
            <span>Ground truth enforced via Gemini Function Calling</span>
            <span>15s timeout protected</span>
          </div>
        </div>
      </div>
    </div>
  );
};
