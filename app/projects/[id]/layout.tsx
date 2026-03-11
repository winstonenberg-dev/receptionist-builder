"use client";
import { useEffect, useState } from "react";

const SESSION_KEY = "admin_pin_verified";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "open" | "locked">("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setStatus("open");
      return;
    }
    fetch("/api/admin-pin")
      .then(r => r.json())
      .then(data => setStatus(data.hasPin ? "locked" : "open"))
      .catch(() => setStatus("open"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin-pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        setStatus("open");
      } else {
        const data = await res.json();
        setError(data.error ?? "Fel PIN-kod");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-5 mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-white font-semibold text-center mb-1">Skyddat område</h2>
          <p className="text-white/40 text-sm text-center mb-6">Ange PIN-koden för att komma åt projektet</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="PIN-kod"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30 tracking-widest text-center"
            />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button
              type="submit"
              disabled={submitting || pin.length < 4}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2">
              {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Lås upp
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
