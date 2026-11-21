import { useState, useRef, useEffect } from 'react';
import API from '../api/axios';
import { Bot, X, Send, Sparkles } from 'lucide-react';

const QUICK_PROMPTS = [
  'Which halls & labs are available?',
  'What events have seats left?',
  'How does QR pass security work?',
];

export default function AiHelperWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hi! I am CampusHub AI. Ask me about live campus venues, upcoming events, seat availability, or how QR passes work.',
    },
  ]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const { data } = await API.post('/ai/chat', {
        message: trimmed,
        history: nextMessages.slice(1),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to reach CampusHub AI right now. Please try again in a moment.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <div>
                <h3 className="text-sm font-bold text-white leading-none">CampusHub AI</h3>
                <span className="text-[11px] text-indigo-200">Live MongoDB + Groq Assistant</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-indigo-100 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Feed */}
          <div className="p-3.5 h-72 overflow-y-auto space-y-3 text-xs bg-slate-950/70">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl whitespace-pre-line leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-[11px] text-slate-400 animate-pulse">
                Checking campus database...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex gap-1.5 overflow-x-auto">
            {QUICK_PROMPTS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendMessage(q)}
                className="shrink-0 text-[11px] bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 px-2.5 py-1 rounded-full"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSubmit} className="p-2.5 bg-slate-900 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              placeholder="Ask about venues, events, or passes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-full shadow-lg shadow-indigo-950/60 flex items-center gap-2 text-sm font-semibold transition"
        >
          <Sparkles className="w-4 h-4" /> Ask Campus AI
        </button>
      )}
    </div>
  );
}