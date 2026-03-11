"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  industry: string | null;
  createdAt: string;
  latestVersion: number | null;
  latestPromptUpdated: string | null;
  hasWebsite: boolean;
  hasSynthesis: boolean;
  promptLocked: boolean;
};

const INDUSTRY_ICON: Record<string, string> = {
  golf:       "⛳",
  restaurang: "🍽️",
  hotell:     "🏨",
  frisör:     "✂️",
  annan:      "🏢",
};

const INDUSTRY_LABEL: Record<string, string> = {
  golf:       "Golf",
  restaurang: "Restaurang",
  hotell:     "Hotell",
  frisör:     "Frisör",
  annan:      "Annan bransch",
};

// 24 golden blobs — varied sizes and positions
const BLOBS = [
  { top:  "3%",  left:  "8%", w: 700, h: 450, opacity: 0.50 },
  { top:  "6%",  left: "58%", w: 800, h: 500, opacity: 0.45 },
  { top:  "2%",  left: "85%", w: 400, h: 280, opacity: 0.48 },
  { top: "18%",  left: "28%", w: 300, h: 200, opacity: 0.40 },
  { top: "22%",  left: "74%", w: 500, h: 340, opacity: 0.42 },
  { top: "30%",  left:  "4%", w: 380, h: 260, opacity: 0.40 },
  { top: "35%",  left: "90%", w: 320, h: 220, opacity: 0.38 },
  { top: "38%",  left: "44%", w: 700, h: 440, opacity: 0.35 },
  { top: "45%",  left: "18%", w: 260, h: 180, opacity: 0.44 },
  { top: "48%",  left: "66%", w: 480, h: 320, opacity: 0.40 },
  { top: "52%",  left: "91%", w: 300, h: 200, opacity: 0.40 },
  { top: "55%",  left:  "2%", w: 540, h: 360, opacity: 0.38 },
  { top: "58%",  left: "36%", w: 280, h: 190, opacity: 0.42 },
  { top: "60%",  left: "79%", w: 580, h: 380, opacity: 0.40 },
  { top: "65%",  left: "51%", w: 320, h: 220, opacity: 0.38 },
  { top: "68%",  left: "12%", w: 440, h: 300, opacity: 0.44 },
  { top: "72%",  left: "68%", w: 280, h: 200, opacity: 0.40 },
  { top: "75%",  left: "89%", w: 520, h: 340, opacity: 0.40 },
  { top: "78%",  left: "25%", w: 660, h: 420, opacity: 0.38 },
  { top: "82%",  left: "59%", w: 240, h: 160, opacity: 0.44 },
  { top: "85%",  left:  "4%", w: 360, h: 240, opacity: 0.40 },
  { top: "88%",  left: "43%", w: 480, h: 320, opacity: 0.40 },
  { top: "92%",  left: "76%", w: 400, h: 270, opacity: 0.42 },
  { top: "95%",  left: "14%", w: 580, h: 360, opacity: 0.40 },
];

function completeness(p: Project): number {
  let score = 0;
  if (p.hasWebsite)    score += 33;
  if (p.hasSynthesis)  score += 33;
  if (p.latestVersion) score += 34;
  return score;
}

function ProgressBar({ value }: { value: number }) {
  const color = value === 100
    ? "bg-emerald-400"
    : value >= 66 ? "bg-amber-400"
    : value >= 33 ? "bg-amber-600"
    : "bg-white/15";
  return (
    <div className="w-full h-[2px] bg-white/8 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
    </div>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  );
}

function PinModal({
  project,
  onSuccess,
  onCancel,
}: {
  project: Project;
  onSuccess: (newLocked: boolean) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLocking = !project.promptLocked;
  const [confirmPin, setConfirmPin] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isLocking && pin !== confirmPin) {
      setError("PIN-koderna matchar inte");
      return;
    }
    if (pin.length < 4) {
      setError("PIN måste vara minst 4 tecken");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: isLocking, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Något gick fel"); return; }
      onSuccess(isLocking);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${isLocking ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"}`}>
          <LockIcon locked={isLocking} />
        </div>
        <h3 className="text-white font-semibold mb-1">
          {isLocking ? "Lås projekt" : "Lås upp projekt"}
        </h3>
        <p className="text-white/40 text-sm mb-5">
          {isLocking
            ? <>Ange en PIN-kod för att låsa <span className="text-white/80 font-medium">"{project.name}"</span>. Koden krävs för att redigera prompts.</>
            : <>Ange PIN-koden för att låsa upp <span className="text-white/80 font-medium">"{project.name}"</span>.</>
          }
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN-kod"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30 tracking-widest"
          />
          {isLocking && (
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              placeholder="Bekräfta PIN-kod"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30 tracking-widest"
            />
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} disabled={loading}
              className="flex-1 bg-white/5 border border-white/10 text-white/60 hover:text-white rounded-xl py-2 text-sm font-medium transition disabled:opacity-50">
              Avbryt
            </button>
            <button type="submit" disabled={loading}
              className={`flex-1 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition flex items-center justify-center gap-2 ${isLocking ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isLocking ? "Lås" : "Lås upp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ name, onConfirm, onCancel, loading }: { name: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-white font-semibold mb-1">Radera projekt</h3>
        <p className="text-white/40 text-sm mb-5">
          Är du säker på att du vill radera <span className="text-white/80 font-medium">"{name}"</span>? All data raderas permanent.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 text-white/60 hover:text-white rounded-xl py-2 text-sm font-medium transition disabled:opacity-50">
            Avbryt
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Radera
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lockTarget, setLockTarget] = useState<Project | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") loadProjects();
  }, [status]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const basic = await fetch("/api/projects").then(r => r.json()) as { id: string; name: string; industry: string | null; createdAt: string }[];
      const detailed = await Promise.all(
        basic.map(p =>
          fetch(`/api/projects/${p.id}`).then(r => r.json()).catch(() => ({
            ...p, latestVersion: null, latestPromptUpdated: null, hasWebsite: false, hasSynthesis: false,
          }))
        )
      );
      setProjects(detailed);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleLockSuccess = (newLocked: boolean) => {
    if (!lockTarget) return;
    setProjects(prev => prev.map(p => p.id === lockTarget.id ? { ...p, promptLocked: newLocked } : p));
    setLockTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const incompleteBots   = projects.filter(p => completeness(p) < 100).length;
  const websiteDrivenBots = projects.filter(p => p.hasWebsite).length;
  const totalBots        = projects.length;

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const firstName = session?.user?.name?.split(" ")[0] ?? session?.user?.email?.split("@")[0] ?? "";

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Golden blobs — fixed to viewport, outside overflow constraints */}
      {BLOBS.map((b, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: "fixed",
            top: b.top,
            left: b.left,
            width: b.w,
            height: b.h,
            borderRadius: "50%",
            filter: "blur(80px)",
            background: `radial-gradient(ellipse, rgba(255,200,50,${b.opacity}) 0%, transparent 70%)`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      ))}

      {deleteTarget && (
        <DeleteModal name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
      {lockTarget && (
        <PinModal project={lockTarget} onSuccess={handleLockSuccess} onCancel={() => setLockTarget(null)} />
      )}

      {/* Nav */}
      <nav className="bg-black/80 backdrop-blur border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-black font-bold text-xs">AI</div>
          <span className="font-semibold text-white text-sm">AI Operator</span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-white/30 hidden sm:block">{session?.user?.email}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="text-white/50 hover:text-white transition text-sm">Logga ut</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 relative" style={{ zIndex: 2 }}>

        {/* Heading */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">
            {firstName ? `Hej, ${firstName}` : "Mina projekt"}
          </h1>
          <p className="text-white/40 mt-1 text-sm">Hantera dina kunders AI-receptionister</p>
        </div>

        {/* Stats */}
        {!loadingProjects && totalBots > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-10">
            <div className="border border-white/10 rounded-2xl px-5 py-4 bg-black/40 backdrop-blur-sm">
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2">Projekt</p>
              <p className="text-2xl font-bold text-white">{totalBots}</p>
            </div>
            <div className="border border-white/10 rounded-2xl px-5 py-4 bg-black/40 backdrop-blur-sm">
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2">Ej klara</p>
              <p className="text-2xl font-bold text-amber-400">{incompleteBots}</p>
            </div>
            <div className="border border-white/10 rounded-2xl px-5 py-4 bg-black/40 backdrop-blur-sm">
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2">Hemsidedrivna</p>
              <p className="text-2xl font-bold text-emerald-400">{websiteDrivenBots}</p>
            </div>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-white/30 text-xs uppercase tracking-widest font-medium">
            {loadingProjects ? "Laddar..." : `${totalBots} projekt`}
          </p>
          <Link href="/projects/new"
            className="bg-white text-black px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/90 transition flex items-center gap-2">
            + Nytt projekt
          </Link>
        </div>

        {/* Grid */}
        {loadingProjects ? (
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-white/8 rounded-2xl p-5 h-48 animate-pulse bg-white/3" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24 border border-white/10 rounded-2xl bg-black/40 backdrop-blur-sm">
            <div className="text-4xl mb-4">🤖</div>
            <h2 className="text-lg font-semibold mb-2">Inga projekt än</h2>
            <p className="text-white/40 text-sm mb-6">Skapa ditt första projekt för att komma igång</p>
            <Link href="/projects/new" className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/90 transition">
              Skapa projekt
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {projects.map((p) => {
              const pct      = completeness(p);
              const icon     = INDUSTRY_ICON[p.industry ?? ""] ?? "🤖";
              const label    = INDUSTRY_LABEL[p.industry ?? ""] ?? p.industry ?? "";
              const updatedAt = p.latestPromptUpdated
                ? new Date(p.latestPromptUpdated).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
                : null;

              return (
                <div key={p.id} className="group border border-white/10 hover:border-white/25 rounded-2xl transition-all duration-200 overflow-hidden flex flex-col bg-black/50 backdrop-blur-sm">
                  <Link href={`/projects/${p.id}/questions`} className="p-5 flex-1 block">

                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center text-lg flex-shrink-0">
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white group-hover:text-white/80 transition truncate leading-tight">{p.name}</h3>
                        {label && <p className="text-white/35 text-xs mt-0.5">{label}</p>}
                      </div>
                      {pct === 100 && (
                        <span className="flex-shrink-0 text-emerald-400 text-xs font-medium mt-0.5">✓</span>
                      )}
                    </div>

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-white/25 uppercase tracking-widest">Setup</span>
                        <span className={`text-[10px] font-semibold ${pct === 100 ? "text-emerald-400" : pct >= 33 ? "text-amber-400" : "text-white/30"}`}>{pct}%</span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>

                    {/* Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        p.hasWebsite
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                          : "border-white/8 text-white/20"
                      }`}>
                        {p.hasWebsite ? "✓ Hemsida" : "Ingen hemsida"}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        p.hasSynthesis
                          ? "bg-blue-500/10 border-blue-500/25 text-blue-400"
                          : "border-white/8 text-white/20"
                      }`}>
                        {p.hasSynthesis ? "✓ Agenter" : "Ingen analys"}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        p.latestVersion
                          ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                          : "border-white/8 text-white/20"
                      }`}>
                        {p.latestVersion ? `✓ Prompt v${p.latestVersion}` : "Ingen prompt"}
                      </span>
                    </div>

                    {updatedAt && (
                      <p className="text-[10px] text-white/20 mt-3">Uppdaterad {updatedAt}</p>
                    )}
                  </Link>

                  {/* Action row */}
                  <div className="border-t border-white/8 px-4 py-2.5 flex items-center justify-between">
                    <Link href={`/projects/${p.id}/test`}
                      className="text-xs text-white/35 hover:text-white transition font-medium flex items-center gap-1.5"
                      onClick={e => e.stopPropagation()}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Testa chatbot
                    </Link>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={e => { e.stopPropagation(); setLockTarget(p); }}
                        title={p.promptLocked ? "Lås upp projekt" : "Lås projekt"}
                        className={`text-xs transition flex items-center gap-1.5 ${p.promptLocked ? "text-amber-400 hover:text-amber-300" : "text-white/20 hover:text-amber-400"}`}>
                        <LockIcon locked={p.promptLocked} />
                        {p.promptLocked ? "Låst" : "Lås"}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="text-xs text-white/20 hover:text-red-400 transition flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Radera
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
