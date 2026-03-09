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
};

const INDUSTRY_ICON: Record<string, string> = {
  golf:      "⛳",
  restaurang: "🍽️",
  hotell:    "🏨",
  frisör:    "✂️",
  annan:     "🏢",
};

const INDUSTRY_LABEL: Record<string, string> = {
  golf:      "Golf",
  restaurang: "Restaurang",
  hotell:    "Hotell",
  frisör:    "Frisör",
  annan:     "Annan bransch",
};

function completeness(p: Project): number {
  let score = 0;
  if (p.hasWebsite)    score += 33;
  if (p.hasSynthesis)  score += 33;
  if (p.latestVersion) score += 34;
  return score;
}

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? "from-emerald-500 to-emerald-400"
    : value >= 66 ? "from-fuchsia-500 to-violet-500"
    : value >= 33 ? "from-violet-500 to-blue-500"
    : "from-[#3d3456] to-[#3d3456]";
  return (
    <div className="w-full h-1 bg-[#1e1a2e] rounded-full overflow-hidden">
      <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
    </div>
  );
}

function DeleteModal({ name, onConfirm, onCancel, loading }: { name: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-800/50 flex items-center justify-center text-red-400 mb-4">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-white font-semibold mb-1">Radera projekt</h3>
        <p className="text-[#7a7090] text-sm mb-5">
          Är du säker på att du vill radera <span className="text-white font-medium">"{name}"</span>? All data raderas permanent.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 bg-[#1c1829] border border-[#3d3456] text-[#9b93b3] hover:text-white rounded-xl py-2 text-sm font-medium transition disabled:opacity-50">
            Avbryt
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition flex items-center justify-center gap-2">
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

  const activeBots  = projects.filter(p => p.latestVersion).length;
  const readyBots   = projects.filter(p => completeness(p) === 100).length;
  const totalBots   = projects.length;

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0b12]">
      <div className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const firstName = session?.user?.name?.split(" ")[0] ?? session?.user?.email?.split("@")[0] ?? "";

  return (
    <div className="min-h-screen bg-[#0d0b12]">
      {deleteTarget && (
        <DeleteModal name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}

      {/* Nav */}
      <nav className="bg-[#0a0910]/80 backdrop-blur border-b border-[#1e1a2e] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow shadow-fuchsia-900/40">R</div>
          <span className="font-semibold text-white">Receptionist Builder</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[#6b6280] hidden sm:block">{session?.user?.email}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="text-[#9b93b3] hover:text-white transition text-sm">Logga ut</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {firstName ? `Hej, ${firstName} 👋` : "Mina projekt"}
          </h1>
          <p className="text-[#7a7090] mt-1">Hantera dina kunders AI-receptionister</p>
        </div>

        {/* Stats */}
        {!loadingProjects && totalBots > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl px-5 py-4">
              <p className="text-[#7a7090] text-xs font-medium uppercase tracking-wider mb-1">Projekt</p>
              <p className="text-2xl font-bold text-white">{totalBots}</p>
            </div>
            <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl px-5 py-4">
              <p className="text-[#7a7090] text-xs font-medium uppercase tracking-wider mb-1">Aktiva botar</p>
              <p className="text-2xl font-bold text-fuchsia-400">{activeBots}</p>
            </div>
            <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl px-5 py-4">
              <p className="text-[#7a7090] text-xs font-medium uppercase tracking-wider mb-1">Färdiga (100%)</p>
              <p className="text-2xl font-bold text-emerald-400">{readyBots}</p>
            </div>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[#7a7090] uppercase tracking-wider">
            {loadingProjects ? "Laddar..." : `${totalBots} ${totalBots === 1 ? "projekt" : "projekt"}`}
          </h2>
          <Link href="/projects/new"
            className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-fuchsia-900/30 flex items-center gap-2">
            <span className="text-base leading-none">+</span> Nytt projekt
          </Link>
        </div>

        {/* Grid */}
        {loadingProjects ? (
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#14111e] rounded-2xl border border-[#2a2440] p-5 h-48 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24 bg-[#14111e] rounded-2xl border border-[#2a2440]">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-900/40 to-violet-900/40 border border-fuchsia-800/20 flex items-center justify-center text-3xl mx-auto mb-4">🤖</div>
            <h2 className="text-lg font-semibold text-white mb-2">Inga projekt än</h2>
            <p className="text-[#7a7090] text-sm mb-6">Skapa ditt första projekt för att komma igång</p>
            <Link href="/projects/new" className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition">
              Skapa projekt
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {projects.map((p) => {
              const pct   = completeness(p);
              const icon  = INDUSTRY_ICON[p.industry ?? ""] ?? "🤖";
              const label = INDUSTRY_LABEL[p.industry ?? ""] ?? p.industry ?? "";
              const updatedAt = p.latestPromptUpdated
                ? new Date(p.latestPromptUpdated).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
                : null;

              return (
                <div key={p.id} className="group bg-[#14111e] rounded-2xl border border-[#2a2440] hover:border-fuchsia-500/40 transition-all duration-200 overflow-hidden flex flex-col">
                  <Link href={`/projects/${p.id}/questions`} className="p-5 flex-1 block">

                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-900/50 to-violet-900/50 border border-fuchsia-800/20 flex items-center justify-center text-xl flex-shrink-0">
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white group-hover:text-fuchsia-300 transition truncate leading-tight">{p.name}</h3>
                        {label && <p className="text-violet-400/80 text-xs mt-0.5">{label}</p>}
                      </div>
                      {pct === 100 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-[10px] font-bold">✓</span>
                      )}
                    </div>

                    {/* Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-[#4d4468] font-medium uppercase tracking-wider">Setup</span>
                        <span className={`text-[10px] font-semibold ${pct === 100 ? "text-emerald-400" : pct >= 66 ? "text-fuchsia-400" : "text-[#4d4468]"}`}>{pct}%</span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>

                    {/* Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${p.hasWebsite ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-[#1c1829] border-[#2a2440] text-[#3d3456]"}`}>
                        {p.hasWebsite ? "✓ Hemsida" : "Ingen hemsida"}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${p.hasSynthesis ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-[#1c1829] border-[#2a2440] text-[#3d3456]"}`}>
                        {p.hasSynthesis ? "✓ Agenter" : "Ingen analys"}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${p.latestVersion ? "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400" : "bg-[#1c1829] border-[#2a2440] text-[#3d3456]"}`}>
                        {p.latestVersion ? `✓ Prompt v${p.latestVersion}` : "Ingen prompt"}
                      </span>
                    </div>

                    {/* Date */}
                    {updatedAt && (
                      <p className="text-[10px] text-[#3d3456] mt-3">Uppdaterad {updatedAt}</p>
                    )}
                  </Link>

                  {/* Action row */}
                  <div className="border-t border-[#1e1a2e] px-4 py-2.5 flex items-center justify-between bg-[#0f0d18]">
                    <Link href={`/projects/${p.id}/test`}
                      className="text-xs text-[#6b6280] hover:text-fuchsia-400 transition font-medium flex items-center gap-1.5"
                      onClick={e => e.stopPropagation()}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Testa chatbot
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="text-xs text-[#3d3456] hover:text-red-400 transition flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Radera
                    </button>
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
