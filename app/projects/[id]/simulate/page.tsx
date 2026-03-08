"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ClubResult = {
  i: number;
  club: string;
  city: string;
  question: string;
  answer: string;
  stars: number;
  feedback: string;
};

type SimulateResponse = {
  results: ClubResult[];
  avgStars: number;
  summary: string;
  total: number;
  lowCount: number;
  highCount: number;
  projectName: string;
  error?: string;
};

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-xs">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < count ? "text-amber-400" : "text-[#2a2440]"}>★</span>
      ))}
    </span>
  );
}

function starColor(stars: number) {
  if (stars >= 4) return "border-emerald-500/30 bg-emerald-500/5";
  if (stars === 3) return "border-amber-500/30 bg-amber-500/5";
  return "border-red-500/30 bg-red-500/5";
}

function starDot(stars: number) {
  if (stars >= 4) return "bg-emerald-400";
  if (stars === 3) return "bg-amber-400";
  return "bg-red-400";
}

export default function SimulatePage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "good" | "mid" | "bad">("all");
  const [improveLoading, setImproveLoading] = useState(false);
  const [improveResult, setImproveResult] = useState<{ version: number } | null>(null);
  const [improveError, setImproveError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setData(null);
    setImproveResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/simulate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Något gick fel");
      setData(json);
      await fetch(`/api/projects/${id}/answers`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [{ questionKey: "simulate_done", answer: "true" }] }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const implementLearnings = async () => {
    if (!data || improveLoading) return;
    setImproveLoading(true);
    setImproveError("");

    const lowRated = data.results.filter(r => r.stars <= 2);
    const midRated = data.results.filter(r => r.stars === 3);

    const instruction = `Förbättra AI-receptionisten baserat på resultat från ett test med 100 golfklubbar.

TESTRESULTAT:
- Genomsnittsbetyg: ${data.avgStars}/5
- Nöjda (4-5⭐): ${data.highCount} klubbar
- Missnöjda (1-2⭐): ${data.lowCount} klubbar

AI-ANALYS OCH REKOMMENDATIONER:
${data.summary}

FRÅGOR SOM FICK LÅGT BETYG — lägg till information om dessa om möjligt:
${lowRated.slice(0, 15).map(r => `• "${r.question}" (${r.stars}⭐ — ${r.feedback})`).join("\n")}

FRÅGOR SOM KAN FÖRBÄTTRAS:
${midRated.slice(0, 10).map(r => `• "${r.question}" (${r.stars}⭐ — ${r.feedback})`).join("\n")}

ABSOLUTA BEGRÄNSNINGAR SOM ALDRIG FÅR ÄNDRAS:
1. Receptionisten är ENBART en informationskälla — den bokar ALDRIG något
2. Ingen bokning av greenfee, boende, restaurang, lektioner eller annat
3. Om kunden vill boka något: hänvisa alltid till att kontakta klubben direkt (telefon/email)
4. Receptionisten svarar på frågor och ger information — inget annat

Förbättra prompten så att receptionisten kan svara bättre på de frågor som fick lågt betyg, men behåll all befintlig information om företaget.`;

    try {
      const res = await fetch(`/api/projects/${id}/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setImproveResult({ version: json.version });
    } catch (e) {
      setImproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setImproveLoading(false);
    }
  };

  const filtered = data?.results.filter(r => {
    if (filter === "good") return r.stars >= 4;
    if (filter === "mid") return r.stars === 3;
    if (filter === "bad") return r.stars <= 2;
    return true;
  }) ?? [];

  return (
    <div className="min-h-screen bg-[#0d0b12] flex flex-col">
      {/* Nav */}
      <nav className="bg-[#0a0910] border-b border-[#1e1a2e] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs">R</div>
          <span className="font-semibold text-white text-sm">Receptionist Builder</span>
          {data?.projectName && (
            <>
              <span className="text-[#3d3456] text-sm">/</span>
              <span className="text-[#9b93b3] text-sm">{data.projectName}</span>
            </>
          )}
        </div>
        <Link href={`/projects/${id}/questions`} className="text-[#9b93b3] hover:text-white transition text-sm">
          ← Konfigurera
        </Link>
      </nav>

      <div className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">🧪 Simulera 100 golfklubbar</h1>
          <p className="text-[#7a7090] text-sm">
            Skickar din AI-receptionist 100 vanliga frågor från svenska golfklubbar och utvärderar svaren automatiskt.
          </p>
        </div>

        {/* Run button + stats */}
        {!data && !loading && (
          <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-8 text-center max-w-xl mx-auto">
            <div className="text-5xl mb-4">🏌️</div>
            <h2 className="text-lg font-semibold text-white mb-2">Redo att testa receptionisten?</h2>
            <p className="text-[#7a7090] text-sm mb-6">
              100 golfklubbar ställer sina vanligaste frågor. AI:n svarar som din receptionist
              och betygsätter sig själv. Tar ca 30–60 sekunder.
            </p>
            <button onClick={run}
              className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 text-white px-8 py-3 rounded-xl font-semibold text-sm transition shadow-lg shadow-fuchsia-900/30">
              ▶ Kör simulering
            </button>
            {error && (
              <div className="mt-4 bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-12 text-center max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-white font-semibold">Simulerar 100 golfklubbar...</span>
            </div>
            <p className="text-[#7a7090] text-sm mb-6">
              Alla 100 frågor skickas och besvaras av din AI-receptionist.<br />
              Betyg och feedback genereras automatiskt. Ca 30–60 sekunder.
            </p>
            {/* Animated dots */}
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-fuchsia-500/30 animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-white mb-0.5">{data.avgStars.toFixed(1)}</p>
                <Stars count={Math.round(data.avgStars)} />
                <p className="text-[#7a7090] text-xs mt-1">Genomsnitt</p>
              </div>
              <div className="bg-[#14111e] border border-emerald-500/20 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400 mb-1">{data.highCount}</p>
                <p className="text-[#7a7090] text-xs">Nöjda (4–5 ⭐)</p>
              </div>
              <div className="bg-[#14111e] border border-amber-500/20 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-amber-400 mb-1">
                  {data.results.filter(r => r.stars === 3).length}
                </p>
                <p className="text-[#7a7090] text-xs">Neutrala (3 ⭐)</p>
              </div>
              <div className="bg-[#14111e] border border-red-500/20 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-red-400 mb-1">{data.lowCount}</p>
                <p className="text-[#7a7090] text-xs">Missnöjda (1–2 ⭐)</p>
              </div>
            </div>

            {/* AI Summary + Implement */}
            <div className="bg-[#14111e] border border-violet-500/20 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">✦</div>
                  <span className="text-sm font-semibold text-white">AI-analys & rekommendationer</span>
                </div>
                {!improveResult && (
                  <button onClick={implementLearnings} disabled={improveLoading}
                    className="flex-shrink-0 flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-900/30">
                    {improveLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Förbättrar receptionist...</>
                      : "✦ Implementera lärdomar i receptionist"}
                  </button>
                )}
                {improveResult && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-lg">
                      ✓ Uppdaterad till v{improveResult.version}
                    </span>
                    <Link href={`/projects/${id}/questions`}
                      className="bg-[#1c1829] hover:bg-[#2a2440] border border-[#3d3456] text-[#c4bcd4] hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                      Testa receptionisten →
                    </Link>
                  </div>
                )}
              </div>

              <p className="text-[#c4bcd4] text-sm leading-relaxed whitespace-pre-line">{data.summary}</p>

              {improveError && (
                <p className="mt-3 text-red-400 text-xs">{improveError}</p>
              )}

              {/* Constraint reminder */}
              <div className="mt-4 pt-4 border-t border-[#2a2440] flex items-start gap-2">
                <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5">⚠</span>
                <p className="text-[#7a7090] text-xs leading-relaxed">
                  Receptionisten förbättras som <strong className="text-[#9b93b3]">informationskälla</strong> — inga bokningar läggs till.
                  Om kunder vill boka greenfee, boende eller restaurang hänvisas de till att kontakta klubben direkt.
                </p>
              </div>
            </div>

            {/* Filter + rerun */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {([["all", "Alla 100"], ["good", `Nöjda (${data.highCount})`], ["mid", `Neutrala (${data.results.filter(r => r.stars === 3).length})`], ["bad", `Missnöjda (${data.lowCount})`]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === key
                      ? "bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300"
                      : "bg-[#14111e] border border-[#2a2440] text-[#7a7090] hover:text-white"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={run} disabled={loading}
                className="text-xs text-[#7a7090] hover:text-white transition border border-[#2a2440] hover:border-[#3d3456] px-3 py-1.5 rounded-lg">
                ↺ Kör igen
              </button>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(r => (
                <div key={r.i} className={`border rounded-xl p-3 ${starColor(r.stars)}`}>
                  <div className="flex items-start justify-between mb-2 gap-1">
                    <div className="min-w-0">
                      <p className="text-white text-[11px] font-semibold leading-tight truncate">{r.club}</p>
                      <p className="text-[#5a5270] text-[10px]">{r.city}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${starDot(r.stars)}`} />
                  </div>
                  <p className="text-[#7a7090] text-[10px] italic mb-2 leading-tight line-clamp-2">
                    &ldquo;{r.question}&rdquo;
                  </p>
                  <p className="text-[#c4bcd4] text-[10px] leading-relaxed mb-2 line-clamp-3">{r.answer}</p>
                  <div className="flex items-center justify-between">
                    <Stars count={r.stars} />
                    <span className="text-[9px] text-[#5a5270] italic truncate max-w-[60%] text-right">{r.feedback}</span>
                  </div>
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[#4d4468] text-sm">Inga resultat i den här kategorin</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
