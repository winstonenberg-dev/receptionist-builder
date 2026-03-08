"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };
type Theme = { bg: string; header: string; border: string; msgBg: string; msgBorder: string; text: string; nameText: string; sub: string; inputBg: string; inputBorder: string; inputText: string; inputPh: string; footerText: string };

const THEMES: Record<string, Theme> = {
  dark: {
    bg: "#0d0b12", header: "#14111e", border: "#2a2440",
    msgBg: "#1c1829", msgBorder: "#2a2440", text: "#d4cce4", nameText: "#ffffff",
    sub: "#6b6280", inputBg: "#1c1829", inputBorder: "#3d3456",
    inputText: "#ffffff", inputPh: "#4d4468", footerText: "#3d3456",
  },
  light: {
    bg: "#f5f3ff", header: "#ede9fe", border: "#c4b5fd",
    msgBg: "#e9d5ff", msgBorder: "#c4b5fd", text: "#4c1d95", nameText: "#3b0764",
    sub: "#7c3aed", inputBg: "#ffffff", inputBorder: "#c4b5fd",
    inputText: "#1f2937", inputPh: "#a78bfa", footerText: "#7c3aed",
  },
  white: {
    bg: "#ffffff", header: "#f9fafb", border: "#e5e7eb",
    msgBg: "#f3f4f6", msgBorder: "#e5e7eb", text: "#374151", nameText: "#111827",
    sub: "#6b7280", inputBg: "#f9fafb", inputBorder: "#d1d5db",
    inputText: "#111827", inputPh: "#9ca3af", footerText: "#9ca3af",
  },
};

export default function EmbedPage() {
  const { id } = useParams<{ id: string }>();
  const [botName, setBotName] = useState("AI-receptionist");
  const [theme, setTheme] = useState<Theme>(THEMES.dark);
  const [accent, setAccent] = useState("#a855f7");
  const [msgs, setMsgs] = useState<Message[]>([
    { role: "assistant", content: "Hej! Hur kan jag hjälpa dig?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/embed/${id}`)
      .then(r => r.json())
      .then(d => {
        setBotName(d.botName || d.name || "AI-receptionist");
        setAccent(d.accent || "#a855f7");
        setTheme(THEMES[d.theme] ?? THEMES.dark);
      });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const t = theme;

  const send = async () => {
    if (!input.trim() || loading) return;
    if (userCount >= 12) {
      setMsgs(prev => [...prev, {
        role: "assistant",
        content: "Tack för att du chattat med oss! Kontakta oss gärna direkt för mer hjälp.",
      }]);
      return;
    }
    const userMsg: Message = { role: "user", content: input };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInput("");
    setLoading(true);
    setUserCount(c => c + 1);
    try {
      const res = await fetch(`/api/projects/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      setMsgs([...newMsgs, { role: "assistant", content: data.message }]);
    } catch {
      setMsgs([...newMsgs, { role: "assistant", content: "Något gick fel. Försök igen." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: t.bg, fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes chatbounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: t.header, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: 12, flexShrink: 0 }}>
          AI
        </div>
        <div>
          <p style={{ color: t.nameText, fontWeight: 600, fontSize: 14, margin: 0, lineHeight: "1.2" }}>{botName}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }} />
            <p style={{ color: t.sub, fontSize: 11, margin: 0 }}>Online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "assistant" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: "bold", marginRight: 8, flexShrink: 0, marginTop: 2 }}>
                AI
              </div>
            )}
            <div style={{
              maxWidth: "80%", borderRadius: 18, padding: "8px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
              ...(m.role === "user"
                ? { background: accent, color: "white", borderBottomRightRadius: 4 }
                : { background: t.msgBg, border: `1px solid ${t.msgBorder}`, color: t.text, borderBottomLeftRadius: 4 }
              ),
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: "bold", marginRight: 8, flexShrink: 0 }}>
              AI
            </div>
            <div style={{ background: t.msgBg, border: `1px solid ${t.msgBorder}`, borderRadius: 18, borderBottomLeftRadius: 4, padding: "10px 14px", display: "flex", gap: 4 }}>
              {[0, 150, 300].map(d => (
                <span key={d} style={{ width: 6, height: 6, background: accent, borderRadius: "50%", display: "inline-block", animation: "chatbounce 1s infinite", animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: 12, borderTop: `1px solid ${t.border}`, background: t.bg }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Skriv din fråga..."
            style={{ flex: 1, background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, borderRadius: 12, padding: "10px 16px", fontSize: 14, outline: "none", minWidth: 0 }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{ background: accent, border: "none", color: "white", padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1, flexShrink: 0 }}
          >
            ↑
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 10, color: t.footerText, marginTop: 8, marginBottom: 0 }}>
          Drivs av AI · Kontakta oss direkt för viktigare ärenden
        </p>
      </div>
    </div>
  );
}
