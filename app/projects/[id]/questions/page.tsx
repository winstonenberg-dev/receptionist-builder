"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type AgentResults = Record<string, { findings: string; searchResults?: number }>;
type Message = { role: "user" | "assistant"; content: string };

const QA_QUESTIONS = [
  { key: "qa_greenfee",      label: "Greenfee-priser",          placeholder: "T.ex. Veckdag 350 kr, Helg 450 kr, Junior 150 kr" },
  { key: "qa_opening_hours", label: "Öppettider (bana)",        placeholder: "T.ex. Mån–Sön 07:00–20:00 (april–oktober)" },
  { key: "qa_season",        label: "Säsong",                   placeholder: "T.ex. Banan öppen april–oktober, stängd vintertid" },
  { key: "qa_holes",         label: "Antal hål & bana",         placeholder: "T.ex. 18-håls + 9-håls kort bana, par 72, slope 130" },
  { key: "qa_booking",       label: "Bokning av tee-tid",       placeholder: "T.ex. Bokas via MinGolf-appen eller tel 0171-123 45" },
  { key: "qa_handicap",      label: "Handicap-krav",            placeholder: "T.ex. Max hcp 54 krävs, inget krav på 9-håls" },
  { key: "qa_guests",        label: "Gästspel",                 placeholder: "T.ex. Gäster välkomna, boka i förväg, medföljande medlem ej krav" },
  { key: "qa_membership",    label: "Medlemskap",               placeholder: "T.ex. Årsmedlem 4 500 kr, ansökan via hemsidan" },
  { key: "qa_golf_carts",    label: "Golfbilar",                placeholder: "T.ex. 8 st, 295 kr/runda, bokas i receptionen" },
  { key: "qa_trolley",       label: "Draggkärra & bag-drop",    placeholder: "T.ex. Draggkärror gratis, eltrolla 150 kr/dag" },
  { key: "qa_club_rental",   label: "Klubbuthyrning",           placeholder: "T.ex. Fullset 200 kr/dag, finns i receptionen" },
  { key: "qa_driving_range", label: "Driving range",            placeholder: "T.ex. Öppen 07–20, 50 bollar 50 kr, 100 bollar 90 kr" },
  { key: "qa_lessons",       label: "Golfträning & lektioner",  placeholder: "T.ex. PGA-pro på plats, 45 min lektion 600 kr, bokas via tel" },
  { key: "qa_proshop",       label: "Proshop",                  placeholder: "T.ex. Öppen 09–18 alla dagar, kläder, bollar, utrustning" },
  { key: "qa_restaurant",    label: "Restaurang & café",        placeholder: "T.ex. Serverar lunch 11–15, à la carte 15–20, stängt måndag" },
  { key: "qa_locker_room",   label: "Omklädningsrum & dusch",   placeholder: "T.ex. Ja, finns för herr och dam, dusch ingår" },
  { key: "qa_parking",       label: "Parkering",                placeholder: "T.ex. Gratis parkering direkt vid klubbhuset" },
  { key: "qa_address",       label: "Adress",                   placeholder: "T.ex. Golfvägen 1, 745 98 Enköping" },
  { key: "qa_phone",         label: "Telefon",                  placeholder: "T.ex. 0171-123 45" },
  { key: "qa_email",         label: "Email",                    placeholder: "T.ex. info@klubben.se" },
];

function diffLines(oldText: string, newText: string): { text: string; added: boolean }[] {
  const oldSet = new Set(oldText.split("\n"));
  return newText.split("\n").map(line => ({
    text: line,
    added: line.trim().length > 0 && !oldSet.has(line),
  }));
}

const AGENTS = [
  { key: "faq",       dbKey: "faq_findings",       label: "FAQ",  desc: "Vanliga kundfrågor" },
  { key: "service",   dbKey: "service_findings",    label: "TON",  desc: "Bemötande & empati" },
  { key: "focus",     dbKey: "focus_findings",      label: "PRIO", desc: "Prioriteringar" },
  { key: "season",    dbKey: "season_findings",     label: "SÄS",  desc: "Säsongsanpassning" },
  { key: "industry",  dbKey: "industry_findings",   label: "BRA",  desc: "Branschkunskap" },
  { key: "synthesis", dbKey: "synthesis_findings",  label: "SYN",  desc: "Syntes & förbättringar" },
];

function StepCircle({ num, done, disabled }: { num: number; done: boolean; disabled?: boolean }) {
  if (done) {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm shadow-emerald-900/40">
        ✓
      </div>
    );
  }
  if (disabled) {
    return (
      <div className="w-7 h-7 rounded-full border border-[#2a2440] flex items-center justify-center text-[#4d4468] font-bold text-xs flex-shrink-0">
        {num}
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full border-2 border-amber-400/60 bg-amber-400/10 flex items-center justify-center text-amber-300 font-bold text-xs flex-shrink-0">
      {num}
    </div>
  );
}

export default function ConfigurePage() {
  const { id } = useParams<{ id: string }>();

  // Steg-state
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [websiteResult, setWebsiteResult] = useState<{ pagesRead: number } | null>(null);
  const [websiteError, setWebsiteError] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentResults, setAgentResults] = useState<AgentResults | null>(null);
  const [agentError, setAgentError] = useState("");
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [implementLoading, setImplementLoading] = useState(false);
  const [implementDone, setImplementDone] = useState(false);
  const [simulateDone, setSimulateDone] = useState(false);

  // Q&A snabbfakta
  const [qaAnswers, setQaAnswers] = useState<Record<string, string>>({});
  const [qaLocked, setQaLocked] = useState(false);
  const [qaSaving, setQaSaving] = useState(false);
  const [qaSaved, setQaSaved] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Utseende
  const [appBotName, setAppBotName] = useState("AI-receptionist");
  const [appTheme, setAppTheme] = useState<"dark" | "light" | "white">("dark");
  const [appAccent, setAppAccent] = useState("#a855f7");
  const [appSize, setAppSize] = useState<"small" | "medium" | "large">("medium");
  const [appSaving, setAppSaving] = useState(false);
  const [appSaved, setAppSaved] = useState(false);

  // Prompt-panel
  const [promptText, setPromptText] = useState("");
  const [promptVersion, setPromptVersion] = useState<number | null>(null);
  const [websiteKnowledge, setWebsiteKnowledge] = useState("");
  const [promptDiff, setPromptDiff] = useState<{ text: string; added: boolean }[] | null>(null);
  const [promptLocked, setPromptLocked] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  // Chattbot
  const [chatMsgs, setChatMsgs] = useState<Message[]>([
    { role: "assistant", content: "Hej! Jag är din AI-receptionist. Hur kan jag hjälpa dig?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Promptassistenten
  const [assistantMsgs, setAssistantMsgs] = useState<Message[]>([
    { role: "assistant", content: "Skriv en instruktion för att ändra chatboten:\n• \"Lägg till gratis parkering\"\n• \"Gör tonen varmare\"\n• \"Erbjud alltid bokning\"" }
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const assistantBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "instant" }); }, [chatMsgs]);
  useEffect(() => { assistantBottomRef.current?.scrollIntoView({ behavior: "instant" }); }, [assistantMsgs]);

  useEffect(() => {
    fetch(`/api/projects/${id}/prompt`)
      .then(r => r.json())
      .then(p => { if (p?.prompt) { setPromptText(p.prompt); setPromptVersion(p.version); } });

    Promise.all([
      fetch(`/api/projects/${id}/answers`).then(r => r.json()),
      fetch(`/api/projects/${id}`).then(r => r.json()),
    ]).then(([answers, project]: [{ questionKey: string; answer: string }[], { websiteUrl?: string; promptLocked?: boolean }]) => {
      const wk = answers.find(a => a.questionKey === "website_knowledge");
      if (wk?.answer) { setWebsiteKnowledge(wk.answer); setWebsiteResult({ pagesRead: 1 }); }

      const restored: AgentResults = {};
      let any = false;
      for (const a of AGENTS) {
        const found = answers.find(ans => ans.questionKey === a.dbKey);
        if (found?.answer) { restored[a.key] = { findings: found.answer }; any = true; }
      }
      if (any) setAgentResults(restored);
      if (project?.websiteUrl) setWebsiteUrl(project.websiteUrl);
      if (project?.promptLocked) setPromptLocked(project.promptLocked);

      const qaMap: Record<string, string> = {};
      for (const q of QA_QUESTIONS) {
        const found = answers.find(a => a.questionKey === q.key);
        if (found?.answer) qaMap[q.key] = found.answer;
      }
      setQaAnswers(qaMap);
      const qaLock = answers.find(a => a.questionKey === "qa_locked");
      if (qaLock?.answer === "true") setQaLocked(true);

      const botNameAns = answers.find(a => a.questionKey === "appearance_bot_name");
      if (botNameAns?.answer) setAppBotName(botNameAns.answer);
      const themeAns = answers.find(a => a.questionKey === "appearance_theme");
      if (themeAns?.answer) setAppTheme(themeAns.answer as "dark" | "light" | "white");
      const accentAns = answers.find(a => a.questionKey === "appearance_accent");
      if (accentAns?.answer) setAppAccent(accentAns.answer);
      const sizeAns = answers.find(a => a.questionKey === "appearance_size");
      if (sizeAns?.answer) setAppSize(sizeAns.answer as "small" | "medium" | "large");

      const synthImpl = answers.find(a => a.questionKey === "synthesis_implemented");
      const synthFinding = answers.find(a => a.questionKey === "synthesis_findings");
      // Infer step 3 done: flag in DB OR synthesis findings exist (ran before flag was added)
      if (synthImpl?.answer === "true" || synthFinding?.answer) setImplementDone(true);

      const simDone = answers.find(a => a.questionKey === "simulate_done");
      if (simDone?.answer === "true") setSimulateDone(true);
    });
  }, [id]);

  const handleQaChange = (key: string, label: string, value: string) => {
    setQaAnswers(prev => ({ ...prev, [key]: value }));
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      fetch(`/api/projects/${id}/answers`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [{ questionKey: key, question: label, answer: value }] }),
      });
    }, 800);
  };

  const saveQa = async (lock: boolean) => {
    setQaSaving(true);
    const filled = QA_QUESTIONS
      .filter(q => qaAnswers[q.key]?.trim())
      .map(q => ({ questionKey: q.key, question: q.label, answer: qaAnswers[q.key] }));
    filled.push({ questionKey: "qa_locked", question: "QA-lås", answer: lock ? "true" : "false" });
    await fetch(`/api/projects/${id}/answers`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: filled }),
    });
    setQaLocked(lock);
    setQaSaving(false);
    setQaSaved(true);
    setTimeout(() => setQaSaved(false), 2000);
  };

  const saveAppearance = async () => {
    setAppSaving(true);
    await fetch(`/api/projects/${id}/answers`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [
        { questionKey: "appearance_bot_name", question: "Botens namn", answer: appBotName },
        { questionKey: "appearance_theme", question: "Tema", answer: appTheme },
        { questionKey: "appearance_accent", question: "Accentfärg", answer: appAccent },
        { questionKey: "appearance_size", question: "Storlek", answer: appSize },
      ]}),
    });
    setAppSaving(false);
    setAppSaved(true);
    setTimeout(() => setAppSaved(false), 2000);
  };

  const learnWebsite = async () => {
    if (!websiteUrl.trim() || websiteLoading) return;
    setWebsiteLoading(true); setWebsiteError("");
    try {
      const res = await fetch(`/api/projects/${id}/learn-website`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Något gick fel");
      setWebsiteResult({ pagesRead: data.pagesRead });
      setWebsiteKnowledge(data.summary);
      setPromptDiff(null);
    } catch (e) { setWebsiteError(String(e instanceof Error ? e.message : e)); }
    finally { setWebsiteLoading(false); }
  };

  const runAgents = async () => {
    setAgentLoading(true); setAgentError(""); setImplementDone(false); setPromptDiff(null);
    try {
      const res = await fetch(`/api/projects/${id}/agents`, { method: "POST" });
      if (!res.ok) throw new Error("Något gick fel");
      const data = await res.json();
      setAgentResults(data);
      setOpenCards({ synthesis: true });
      const p = await fetch(`/api/projects/${id}/prompt`).then(r => r.json());
      if (p?.prompt) { setPromptText(p.prompt); setPromptVersion(p.version); }
    } catch (e) { setAgentError(String(e)); }
    finally { setAgentLoading(false); }
  };

  const implementSynthesis = async () => {
    if (!agentResults?.synthesis || implementLoading) return;
    setImplementLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/improve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: `Implementera alla dessa förbättringsförslag:\n\n${agentResults.synthesis.findings}` }),
      });
      const data = await res.json();
      if (data.prompt) {
        setPromptDiff(diffLines(promptText, data.prompt));
        setPromptText(data.prompt); setPromptVersion(data.version); setImplementDone(true);
        await fetch(`/api/projects/${id}/answers`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: [{ questionKey: "synthesis_implemented", answer: "true" }] }),
        });
      }
    } finally { setImplementLoading(false); }
  };

  const toggleLock = async () => {
    setLockLoading(true);
    const newLocked = !promptLocked;
    try {
      await fetch(`/api/projects/${id}/lock`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: newLocked }),
      });
      setPromptLocked(newLocked);
      setPromptDiff(null);
    } finally { setLockLoading(false); }
  };

  const MAX_USER_MESSAGES = 12;

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userCount = chatMsgs.filter(m => m.role === "user").length;
    if (userCount >= MAX_USER_MESSAGES) {
      setChatMsgs(prev => [...prev, {
        role: "assistant",
        content: "Tack för att du chattat med oss! För mer hjälp, kontakta oss gärna direkt via telefon eller email."
      }]);
      return;
    }
    const userMsg: Message = { role: "user", content: chatInput };
    const newMsgs = [...chatMsgs, userMsg];
    setChatMsgs(newMsgs); setChatInput(""); setChatLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      setChatMsgs([...newMsgs, { role: "assistant", content: data.message }]);
    } finally { setChatLoading(false); }
  };

  const sendImprovement = async (instruction?: string) => {
    const text = instruction ?? assistantInput;
    if (!text.trim() || assistantLoading) return;
    setAssistantMsgs(prev => [...prev, { role: "user", content: text }]);
    setAssistantInput(""); setAssistantLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/improve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      const data = await res.json();
      if (data.error) {
        setAssistantMsgs(prev => [...prev, { role: "assistant", content: `Fel: ${data.error}` }]);
      } else {
        setPromptDiff(diffLines(promptText, data.prompt));
        setPromptText(data.prompt); setPromptVersion(data.version);
        setChatMsgs([{ role: "assistant", content: "Prompt uppdaterad! Ställ en fråga." }]);
        setAssistantMsgs(prev => [...prev, { role: "assistant", content: `✓ Uppdaterad (v${data.version}) — se grön text i prompten →` }]);
      }
    } catch {
      setAssistantMsgs(prev => [...prev, { role: "assistant", content: "Något gick fel." }]);
    } finally { setAssistantLoading(false); }
  };

  const step3Disabled = !agentResults?.synthesis;

  return (
    <div className="h-screen bg-[#0d0b12] flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="bg-[#0a0910] border-b border-[#1e1a2e] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs">R</div>
          <span className="font-semibold text-white text-sm">Receptionist Builder</span>
        </div>
        <Link href="/dashboard" className="text-[#9b93b3] hover:text-white transition text-sm">← Dashboard</Link>
      </nav>

      {/* 4-kolumns layout */}
      <div className="flex flex-1 min-h-0">

        {/* ── KOL 1: Workflow-steg + agentresultat (1/3) ── */}
        <div className="w-1/3 border-r border-[#1e1a2e] flex flex-col min-h-0 flex-shrink-0">

          {/* Steg — fast topp, inte scrollbar */}
          <div className="flex-shrink-0 px-4 pt-4 pb-2 space-y-2">

            {/* Rubrik */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-widest">Arbetsflöde</span>
              <div className="flex-1 h-px bg-[#1e1a2e]" />
              <span className="text-[10px] text-[#3d3456]">
                {[!!websiteResult, !!agentResults, implementDone, simulateDone].filter(Boolean).length}/4 klara
              </span>
            </div>

            {/* ── Steg 1: Läs in hemsidan ── */}
            <div className={`bg-[#14111e] border rounded-2xl p-3.5 transition ${websiteResult ? "border-emerald-500/30" : "border-[#2a2440]"}`}>
              <div className="flex items-center gap-3 mb-2.5">
                <StepCircle num={1} done={!!websiteResult} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-xs leading-snug">Läs in hemsidan</p>
                  <p className="text-[#5a5270] text-[10px] mt-0.5 leading-snug">AI läser alla undersidor och lär sig om företaget</p>
                </div>
                {websiteResult && (
                  <span className="text-emerald-400 text-[10px] flex-shrink-0 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Klar
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && learnWebsite()}
                  placeholder="https://enkopinggolf.se"
                  className="flex-1 bg-[#0d0b12] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 min-w-0" />
                <button onClick={learnWebsite} disabled={websiteLoading || !websiteUrl.trim()}
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 flex-shrink-0">
                  {websiteLoading
                    ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Läser...</>
                    : websiteResult ? "↺ Analysera igen" : "Analysera"}
                </button>
              </div>
              {websiteError && <p className="text-pink-400 text-[10px] mt-1.5">{websiteError}</p>}
            </div>

            {/* ── Steg 2: Kör AI-agenter ── */}
            <div className={`bg-[#14111e] border rounded-2xl p-3.5 transition ${agentResults ? "border-emerald-500/30" : "border-[#2a2440]"}`}>
              <div className="flex items-center gap-3 mb-2.5">
                <StepCircle num={2} done={!!agentResults} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-xs leading-snug">Kör AI-agenter</p>
                  <p className="text-[#5a5270] text-[10px] mt-0.5 leading-snug">6 agenter analyserar bransch, ton och säsong</p>
                </div>
                {agentResults && (
                  <div className="flex gap-0.5 flex-shrink-0">
                    {AGENTS.map(a => (
                      <div key={a.key} className={`w-4 h-4 rounded text-[7px] font-bold flex items-center justify-center ${
                        agentResults[a.key]
                          ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
                          : "bg-[#1c1829] border border-[#2a2440] text-[#4d4468]"
                      }`}>{a.label.slice(0, 1)}</div>
                    ))}
                  </div>
                )}
              </div>
              {!agentResults && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {AGENTS.map(a => (
                    <span key={a.key} className="bg-[#1c1829] border border-[#2a2440] rounded-lg px-1.5 py-0.5 text-[9px] text-[#5a5270] font-medium">
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
              <button onClick={runAgents} disabled={agentLoading}
                className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white py-2 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2">
                {agentLoading
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Agenter arbetar... (ca 60 sek)</>
                  : agentResults ? "↺ Kör om alla agenter" : "▶ Kör alla agenter"}
              </button>
              {agentError && <p className="text-pink-400 text-[10px] mt-1.5">{agentError}</p>}
            </div>

            {/* ── Steg 3: Implementera syntesen ── */}
            <div className={`bg-[#14111e] border rounded-2xl p-3.5 transition ${
              implementDone ? "border-emerald-500/30" : step3Disabled ? "border-[#1e1a2e] opacity-60" : "border-amber-400/20"
            }`}>
              <div className="flex items-center gap-3 mb-2.5">
                <StepCircle num={3} done={implementDone} disabled={step3Disabled} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-xs leading-snug ${step3Disabled ? "text-[#5a5270]" : "text-white"}`}>
                    Implementera syntesen
                  </p>
                  <p className="text-[#5a5270] text-[10px] mt-0.5 leading-snug">Uppdatera prompten med agenternas lärdomar</p>
                </div>
              </div>
              {implementDone ? (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <span className="text-emerald-400 text-xs font-medium">✓ Förbättringar implementerade</span>
                  <span className="text-emerald-600 text-[10px] ml-auto">Se grön text →</span>
                </div>
              ) : (
                <button onClick={implementSynthesis} disabled={step3Disabled || implementLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2">
                  {implementLoading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Implementerar...</>
                    : step3Disabled ? "Kör agenter först" : "✦ Implementera syntesens förbättringar"}
                </button>
              )}
            </div>

            {/* ── Steg 4: Simulera 100 golfklubbar ── */}
            <div className={`bg-[#14111e] border rounded-2xl p-3.5 transition ${simulateDone ? "border-emerald-500/30" : "border-[#2a2440]"}`}>
              <div className="flex items-center gap-3 mb-2.5">
                <StepCircle num={4} done={simulateDone} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-xs leading-snug">Simulera 100 golfklubbar</p>
                  <p className="text-[#5a5270] text-[10px] mt-0.5 leading-snug">Testa botten mot 100 riktiga svenska golfklubbar</p>
                </div>
                {simulateDone && (
                  <span className="text-emerald-400 text-[10px] flex-shrink-0 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Klar
                  </span>
                )}
              </div>
              <Link href={`/projects/${id}/simulate`}
                className="flex items-center justify-center gap-2 w-full bg-[#1c1829] hover:bg-[#2a2440] border border-[#3d3456] hover:border-[#5a5270] text-[#c4bcd4] hover:text-white py-2 rounded-xl font-semibold text-xs transition">
                🧪 {simulateDone ? "Kör om simulering" : "Starta simulering"} →
              </Link>
            </div>

          </div>

          {/* Agentresultat + Q&A — scrollbar */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-3">

            {/* ── Snabbfakta ── */}
            <div className="pt-3 pb-3 border-b border-[#1e1a2e] mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-widest">Snabbfakta</span>
                {qaLocked && <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">🔒 Låst</span>}
                <div className="flex-1 h-px bg-[#1e1a2e]" />
              </div>
              <div className="space-y-1.5">
                {QA_QUESTIONS.map(q => (
                  <div key={q.key}>
                    <label className="text-[9px] font-medium text-[#5a5270] mb-0.5 block">{q.label}</label>
                    <input
                      type="text"
                      value={qaAnswers[q.key] ?? ""}
                      onChange={e => !qaLocked && handleQaChange(q.key, q.label, e.target.value)}
                      placeholder={q.placeholder}
                      readOnly={qaLocked}
                      className={`w-full border rounded-lg px-2 py-1.5 text-[10px] focus:outline-none transition ${
                        qaLocked
                          ? "bg-[#0a0910] border-[#1e1a2e] text-[#5a5270] cursor-not-allowed"
                          : "bg-[#0d0b12] border-[#2a2440] focus:border-[#4d4468] text-white placeholder:text-[#2a2440] focus:ring-1 focus:ring-fuchsia-500/20"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2.5">
                {qaLocked ? (
                  <button onClick={() => saveQa(false)} disabled={qaSaving}
                    className="w-full flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 py-2 rounded-xl text-xs font-semibold transition">
                    🔒 Lås upp för att redigera
                  </button>
                ) : (
                  <button onClick={() => saveQa(true)} disabled={qaSaving}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-semibold transition">
                    {qaSaving ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sparar...</>
                      : qaSaved ? "✓ Sparat & låst!"
                      : "💾 Spara & lås snabbfakta"}
                  </button>
                )}
              </div>
            </div>

            {/* ── Embed-kod ── */}
            <div className="pb-3 border-b border-[#1e1a2e] mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-widest">Embed-kod</span>
                <div className="flex-1 h-px bg-[#1e1a2e]" />
              </div>
              <p className="text-[9px] text-[#5a5270] mb-1.5">Klistra in detta på kundens hemsida:</p>
              <div className="bg-[#0a0910] border border-[#2a2440] rounded-lg p-2 relative group">
                <code className="text-[9px] text-emerald-400/80 font-mono break-all leading-relaxed">
                  {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/embed.js?id=${id}"></script>`}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`<script src="${window.location.origin}/embed.js?id=${id}"></script>`)}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-[#2a2440] hover:bg-[#3d3456] text-[#9b93b3] text-[9px] px-1.5 py-0.5 rounded transition">
                  Kopiera
                </button>
              </div>
            </div>

            {/* ── Utseende ── */}
            <div className="pb-3 border-b border-[#1e1a2e] mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-widest">Utseende</span>
                <div className="flex-1 h-px bg-[#1e1a2e]" />
              </div>

              {/* Botens namn */}
              <div className="mb-2">
                <label className="text-[9px] font-medium text-[#5a5270] mb-0.5 block">Botens namn</label>
                <input type="text" value={appBotName} onChange={e => setAppBotName(e.target.value)}
                  placeholder="AI-receptionist"
                  className="w-full bg-[#0d0b12] border border-[#2a2440] focus:border-[#4d4468] text-white placeholder:text-[#2a2440] rounded-lg px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-fuchsia-500/20" />
              </div>

              {/* Tema */}
              <div className="mb-2">
                <label className="text-[9px] font-medium text-[#5a5270] mb-0.5 block">Tema</label>
                <div className="flex gap-1">
                  {([
                    { value: "dark",  label: "Mörk",  swatch: "#0d0b12", border: "#3d3456" },
                    { value: "light", label: "Ljus",  swatch: "#ede9fe", border: "#c4b5fd" },
                    { value: "white", label: "Vit",   swatch: "#ffffff", border: "#d1d5db" },
                  ] as const).map(t => (
                    <button key={t.value} onClick={() => setAppTheme(t.value)}
                      className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition ${
                        appTheme === t.value
                          ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300"
                          : "border-[#2a2440] bg-[#0d0b12] text-[#5a5270] hover:border-[#4d4468]"
                      }`}>
                      <span className="w-3 h-3 rounded-sm flex-shrink-0 border" style={{ background: t.swatch, borderColor: t.border }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accentfärg */}
              <div className="mb-2">
                <label className="text-[9px] font-medium text-[#5a5270] mb-0.5 block">Accentfärg</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={appAccent} onChange={e => setAppAccent(e.target.value)}
                    className="w-8 h-7 rounded border border-[#2a2440] bg-transparent cursor-pointer p-0.5" />
                  <span className="text-[10px] text-[#5a5270] font-mono flex-1">{appAccent}</span>
                  <div className="flex gap-1">
                    {["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"].map(c => (
                      <button key={c} onClick={() => setAppAccent(c)}
                        className="w-4 h-4 rounded-full border-2 transition flex-shrink-0"
                        style={{ background: c, borderColor: appAccent === c ? "white" : "transparent" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Storlek */}
              <div className="mb-2.5">
                <label className="text-[9px] font-medium text-[#5a5270] mb-0.5 block">Widgetstorlek</label>
                <div className="flex gap-1">
                  {([
                    { value: "small",  label: "Liten",  sub: "340px" },
                    { value: "medium", label: "Mellan", sub: "380px" },
                    { value: "large",  label: "Stor",   sub: "440px" },
                  ] as const).map(s => (
                    <button key={s.value} onClick={() => setAppSize(s.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition text-center ${
                        appSize === s.value
                          ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300"
                          : "border-[#2a2440] bg-[#0d0b12] text-[#5a5270] hover:border-[#4d4468]"
                      }`}>
                      <div>{s.label}</div>
                      <div className="text-[8px] text-[#4d4468]">{s.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={saveAppearance} disabled={appSaving}
                className="w-full flex items-center justify-center gap-1.5 bg-[#1c1829] hover:bg-[#2a2440] border border-[#3d3456] hover:border-[#5a5270] text-[#c4bcd4] py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50">
                {appSaving
                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sparar...</>
                  : appSaved ? "✓ Sparat!"
                  : "💾 Spara utseende"}
              </button>
            </div>

            {/* ── Agentresultat ── */}
            <div className="space-y-1.5">
            {agentResults ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-[#5a5270] uppercase tracking-widest">Agenternas resultat</span>
                  <div className="flex-1 h-px bg-[#1e1a2e]" />
                </div>
                {AGENTS.map(a => agentResults[a.key] ? (
                  <div key={a.key} className="bg-[#14111e] border border-[#2a2440] rounded-xl overflow-hidden">
                    <button onClick={() => setOpenCards(p => ({ ...p, [a.key]: !p[a.key] }))}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#1a1628] transition text-left">
                      <span className="text-[9px] font-bold bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 rounded-md w-7 h-7 flex items-center justify-center flex-shrink-0">{a.label}</span>
                      <span className="text-xs text-white flex-1">{a.desc}</span>
                      <span className="text-[#4d4468] text-[10px]">{openCards[a.key] ? "▲" : "▼"}</span>
                    </button>
                    {openCards[a.key] && (
                      <div className="px-3 pb-3 border-t border-[#1e1a2e]">
                        <pre className="text-[11px] text-[#9b93b3] whitespace-pre-wrap font-sans leading-relaxed pt-2.5">{agentResults[a.key].findings}</pre>
                      </div>
                    )}
                  </div>
                ) : null)}
              </>
            ) : (
              <div className="flex items-center justify-center py-6">
                <p className="text-[#3d3456] text-xs text-center">Agentresultat visas här efter körning</p>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* ── KOL 2: Chattbot (1/6) ── */}
        <div className="w-1/6 border-r border-[#1e1a2e] flex flex-col min-h-0 flex-shrink-0">
          <div className="bg-[#14111e] border-b border-[#2a2440] px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold">AI</div>
            <div>
              <p className="font-semibold text-xs text-white">AI-receptionist</p>
              <p className="text-[#6b6280] text-[10px]">Testläge · Live</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 bg-[#0d0b12]">
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-fuchsia-600 to-violet-700 text-white rounded-br-sm"
                    : "bg-[#1c1829] border border-[#2a2440] text-[#c4bcd4] rounded-bl-sm"
                }`}>{m.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1c1829] border border-[#2a2440] rounded-xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1 h-1 bg-fuchsia-500 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex-shrink-0 p-2 border-t border-[#1e1a2e] bg-[#0d0b12] flex gap-1.5">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder="Testa en fråga..."
              className="flex-1 bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-fuchsia-500/40 min-w-0" />
            <button onClick={sendChat} disabled={chatLoading}
              className="bg-gradient-to-br from-fuchsia-500 to-violet-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex-shrink-0">↑</button>
          </div>
        </div>

        {/* ── KOL 3: Promptassistenten (1/6) ── */}
        <div className="w-1/6 border-r border-[#1e1a2e] flex flex-col min-h-0 flex-shrink-0">
          <div className="bg-[#14111e] border-b border-[#2a2440] px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">✦</div>
            <div>
              <p className="font-semibold text-xs text-white">Promptassistenten</p>
              <p className="text-[#6b6280] text-[10px]">Finjustera manuellt</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 bg-[#0d0b12]">
            {assistantMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-br-sm"
                    : "bg-[#1c1829] border border-[#2a2440] text-[#c4bcd4] rounded-bl-sm"
                }`}>{m.content}</div>
              </div>
            ))}
            {assistantLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1c1829] border border-[#2a2440] rounded-xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</span>
                </div>
              </div>
            )}
            <div ref={assistantBottomRef} />
          </div>
          <div className="flex-shrink-0 p-2 border-t border-[#1e1a2e] bg-[#0d0b12]">
            {promptLocked ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
                <span className="text-amber-400 text-[10px]">🔒</span>
                <span className="text-amber-300/70 text-[10px]">Prompten är låst — lås upp för att ändra</span>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input type="text" value={assistantInput} onChange={e => setAssistantInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendImprovement()}
                  placeholder="T.ex. 'Lägg till gratis parkering'..."
                  className="flex-1 bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/40 min-w-0" />
                <button onClick={() => sendImprovement()} disabled={assistantLoading}
                  className="bg-gradient-to-br from-violet-500 to-purple-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex-shrink-0">↑</button>
              </div>
            )}
          </div>
        </div>

        {/* ── KOL 4: Live-prompt ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0a0910]">
          <div className="px-4 py-2.5 border-b border-[#1e1a2e] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Live-prompt</span>
              {promptLocked && <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">🔒 Låst</span>}
            </div>
            <div className="flex items-center gap-2">
              {promptDiff && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Grön = nytt</span>}
              {promptVersion && <span className="text-[10px] text-[#4d4468] bg-[#1c1829] px-2 py-0.5 rounded-full">v{promptVersion}</span>}
              {promptText && (
                <button onClick={toggleLock} disabled={lockLoading}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                    promptLocked
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                      : "bg-[#1c1829] border-[#3d3456] text-[#9b93b3] hover:text-white hover:border-[#5a5270]"
                  }`}>
                  {lockLoading ? "..." : promptLocked ? "🔒 Lås upp" : "🔓 Spara & lås"}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {websiteKnowledge && (
              <div className="border-b border-[#1e1a2e]">
                <div className="px-4 py-1.5 bg-[#0f0d18]">
                  <span className="text-[10px] font-semibold text-emerald-500/70 uppercase tracking-wider">Hemsidekunskap</span>
                </div>
                <div className="p-4">
                  <pre className="text-[10px] text-[#4a4468] whitespace-pre-wrap font-mono leading-relaxed">{websiteKnowledge}</pre>
                </div>
              </div>
            )}

            {promptText ? (
              <div>
                <div className="px-4 py-1.5 bg-[#0f0d18] border-b border-[#1e1a2e]">
                  <span className="text-[10px] font-semibold text-fuchsia-400/70 uppercase tracking-wider">
                    System-prompt{promptVersion ? ` v${promptVersion}` : ""}
                  </span>
                </div>
                <div className="p-4">
                  {promptDiff ? (
                    <pre className="text-[10px] whitespace-pre-wrap font-mono leading-relaxed">
                      {promptDiff.map((line, i) => (
                        <span key={i} className={line.added ? "text-emerald-400" : "text-[#7a7090]"}>
                          {line.text}{"\n"}
                        </span>
                      ))}
                    </pre>
                  ) : (
                    <pre className="text-[10px] text-[#7a7090] whitespace-pre-wrap font-mono leading-relaxed">{promptText}</pre>
                  )}
                </div>
              </div>
            ) : !websiteKnowledge ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <p className="text-[#3d3456] text-2xl mb-2">📄</p>
                <p className="text-[#4d4468] text-xs">Analysera hemsida eller kör agenter för att se prompten</p>
              </div>
            ) : null}
          </div>

          {(promptText || websiteKnowledge) && (
            <div className="px-4 py-2 border-t border-[#1e1a2e] flex-shrink-0">
              <p className="text-[10px] text-[#3d3456]">
                <span className="text-emerald-500/50">Hemsidekunskap</span> + <span className="text-fuchsia-400/50">system-prompt</span> kombineras i chatboten
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
