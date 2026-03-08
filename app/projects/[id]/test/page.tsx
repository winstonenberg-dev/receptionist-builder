"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Message = { role: "user" | "assistant"; content: string };

function parseSuggestions(text: string): string[] {
  const lines = text.split("\n");
  const suggestions: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^[\s*•\-–—\d.]+/, "").trim();
    if (stripped.length > 15 && stripped.length < 120) {
      suggestions.push(stripped);
    }
  }
  return suggestions.slice(0, 8);
}

export default function TestPage() {
  const { id } = useParams<{ id: string }>();

  // Vänster: test-chat
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hej! Jag är din AI-receptionist. Hur kan jag hjälpa dig?" }]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Höger: Promptassistenten
  const [assistantMsgs, setAssistantMsgs] = useState<Message[]>([
    { role: "assistant", content: "Hej! Jag kan hjälpa dig förbättra chatboten. Välj ett AI-förslag nedan eller skriv en egen instruktion, t.ex:\n\n• \"Gör botten mer vänlig och avslappnad\"\n• \"Lägg till att parkering kostar 50 kr\"\n• \"Botten ska alltid erbjuda att boka tid i slutet\"" }
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const assistantBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { assistantBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [assistantMsgs]);

  useEffect(() => {
    fetch(`/api/projects/${id}/prompt`).then(r => r.json()).then(p => { if (p?.prompt) setPrompt(p.prompt); });

    // Hämta syntesresultatet för snabbåtgärder
    fetch(`/api/projects/${id}/answers`).then(r => r.json()).then((answers: { questionKey: string; answer: string }[]) => {
      const synthesis = answers.find(a => a.questionKey === "synthesis_findings");
      if (synthesis?.answer) {
        setSuggestions(parseSuggestions(synthesis.answer));
      }
    });
  }, [id]);

  const sendMessage = async () => {
    if (!input.trim() || chatLoading) return;
    const userMsg: Message = { role: "user", content: input };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      setMessages([...newMsgs, { role: "assistant", content: data.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  const sendImprovement = async (instruction?: string) => {
    const text = instruction ?? assistantInput;
    if (!text.trim() || assistantLoading) return;
    setAssistantMsgs(prev => [...prev, { role: "user", content: text }]);
    setAssistantInput("");
    setAssistantLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      const data = await res.json();
      if (data.error) {
        setAssistantMsgs(prev => [...prev, { role: "assistant", content: `Fel: ${data.error}` }]);
      } else {
        setPrompt(data.prompt);
        setAssistantMsgs(prev => [...prev, { role: "assistant", content: `✓ System-prompten är uppdaterad (v${data.version}). Testa chatboten till vänster!` }]);
        setMessages([{ role: "assistant", content: "Prompt uppdaterad! Ställ din fråga." }]);
      }
    } catch {
      setAssistantMsgs(prev => [...prev, { role: "assistant", content: "Något gick fel, försök igen." }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0b12] flex flex-col">
      <nav className="bg-[#0a0910] border-b border-[#1e1a2e] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs shadow shadow-fuchsia-900/40">R</div>
          <span className="font-semibold text-white text-sm">Testläge</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/projects/${id}/questions`} className="text-[#9b93b3] hover:text-white transition">← Konfigurera</Link>
          <Link href="/dashboard" className="text-[#9b93b3] hover:text-white transition">Dashboard</Link>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 52px)" }}>

        {/* VÄNSTER: Test-chat */}
        <div className="flex flex-col w-1/2 border-r border-[#1e1a2e]">
          <div className="bg-[#14111e] border-b border-[#2a2440] px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs">AI</div>
            <div>
              <p className="font-semibold text-sm text-white">AI-receptionist</p>
              <p className="text-[#6b6280] text-xs">Testläge · Live</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0d0b12]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-fuchsia-600 to-violet-700 text-white rounded-br-sm"
                    : "bg-[#1c1829] border border-[#2a2440] text-[#c4bcd4] rounded-bl-sm"
                }`}>{m.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1c1829] border border-[#2a2440] rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="p-3 border-t border-[#1e1a2e] bg-[#0d0b12] flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Testa en fråga..." autoFocus
              className="flex-1 bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40" />
            <button onClick={sendMessage} disabled={chatLoading}
              className="bg-gradient-to-br from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition">↑</button>
          </div>
        </div>

        {/* HÖGER: Promptassistenten */}
        <div className="flex flex-col w-1/2 overflow-hidden bg-[#0d0b12]">
          <div className="bg-[#14111e] border-b border-[#2a2440] px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">✦</div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-white">Promptassistenten</p>
              <p className="text-[#6b6280] text-xs">Förbättra chatboten med instruktioner</p>
            </div>
            <button onClick={() => setShowPrompt(!showPrompt)}
              className="text-[10px] text-[#4d4468] hover:text-[#9b93b3] transition border border-[#2a2440] rounded px-2 py-1">
              {showPrompt ? "Dölj prompt" : "Visa prompt"}
            </button>
          </div>

          {showPrompt && (
            <div className="border-b border-[#2a2440] bg-[#0f0d18] px-4 py-3 max-h-40 overflow-y-auto flex-shrink-0">
              <pre className="text-xs text-[#6b6280] whitespace-pre-wrap font-sans leading-relaxed">
                {prompt || "(Ingen prompt ännu — kör agenter på konfigureringssidan)"}
              </pre>
            </div>
          )}

          {/* Snabbåtgärder från syntesagenten */}
          {suggestions.length > 0 && (
            <div className="border-b border-[#1e1a2e] px-4 py-3 flex-shrink-0 bg-[#0a0910]">
              <p className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-wider mb-2">
                ✦ AI-förslag från syntesagenten — klicka för att tillämpa
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendImprovement(s)}
                    disabled={assistantLoading}
                    className="text-[11px] bg-[#1c1829] hover:bg-violet-900/30 border border-[#2a2440] hover:border-violet-500/40 text-[#7a7090] hover:text-violet-300 rounded-lg px-2.5 py-1.5 transition text-left disabled:opacity-50 leading-snug">
                    {s.length > 55 ? s.slice(0, 55) + "…" : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {assistantMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-br-sm"
                    : "bg-[#1c1829] border border-[#2a2440] text-[#c4bcd4] rounded-bl-sm"
                }`}>{m.content}</div>
              </div>
            ))}
            {assistantLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1c1829] border border-[#2a2440] rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</span>
                </div>
              </div>
            )}
            <div ref={assistantBottomRef} />
          </div>
          <div className="p-3 border-t border-[#1e1a2e] bg-[#0d0b12] flex gap-2">
            <input type="text" value={assistantInput} onChange={e => setAssistantInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendImprovement()}
              placeholder="Ge en instruktion, t.ex. 'Lägg till gratis parkering'..."
              className="flex-1 bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            <button onClick={() => sendImprovement()} disabled={assistantLoading}
              className="bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition">↑</button>
          </div>
        </div>

      </div>
    </div>
  );
}
