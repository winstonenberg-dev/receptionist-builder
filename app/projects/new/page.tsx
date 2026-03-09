"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProjectPage() {
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, websiteUrl, industry }),
      });
      const text = await res.text();
      let project: { id?: string; error?: string } = {};
      try { project = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || !project.id) {
        setError(project.error ?? `Serverfel ${res.status} — kontrollera terminalen`);
        setLoading(false);
        return;
      }
      router.push(`/projects/${project.id}/questions`);
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0b12]">
      <nav className="bg-[#0a0910] border-b border-[#1e1a2e] px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow shadow-fuchsia-900/40">R</div>
        <span className="font-semibold text-white">Receptionist Builder</span>
      </nav>

      <div className="max-w-lg mx-auto px-6 py-12">
        <Link href="/dashboard" className="text-[#9b93b3] hover:text-fuchsia-400 text-sm transition mb-6 inline-block">← Tillbaka</Link>
        <h1 className="text-2xl font-bold text-white mb-2">Nytt projekt</h1>
        <p className="text-[#7a7090] text-sm mb-8">Ange grundinfo om kunden — du fyller i detaljerna i nästa steg</p>

        <form onSubmit={handleSubmit} className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Företagsnamn *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="t.ex. Orresta Golf & Konferens"
              className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Webbplats</label>
            <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Bransch</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}
              className="w-full bg-[#1c1829] border border-[#3d3456] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60 appearance-none cursor-pointer">
              <option value="">Välj bransch...</option>
              <option value="golf">⛳ Golf</option>
              <option value="restaurang">🍽️ Restaurang / Café</option>
              <option value="hotell">🏨 Hotell</option>
              <option value="frisör">✂️ Frisör / Skönhet</option>
              <option value="annan">🏢 Annan bransch</option>
            </select>
          </div>
          {error && (
            <p className="text-pink-400 text-sm bg-pink-500/10 border border-pink-500/20 rounded-xl px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-fuchsia-900/30">
            {loading ? "Skapar projekt..." : "Skapa projekt →"}
          </button>
        </form>
      </div>
    </div>
  );
}
