"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (data.ok) {
      router.push("/?registered=1");
    } else {
      setError(data.error ?? "Något gick fel");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0b12]">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white text-lg font-bold mx-auto mb-4 shadow-lg shadow-fuchsia-900/40">R</div>
          <h1 className="text-xl font-bold text-white">Skapa konto</h1>
          <p className="text-[#7a7090] text-sm mt-1">Kom igång med Receptionist Builder</p>
        </div>
        <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Namn</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Lösenord</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60" />
            </div>
            {error && <p className="text-pink-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-fuchsia-900/30">
              {loading ? "Skapar konto..." : "Skapa konto"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-[#6b6280] mt-5">
          Har du redan ett konto?{" "}
          <Link href="/" className="text-fuchsia-400 hover:text-fuchsia-300 font-medium">Logga in</Link>
        </p>
      </div>
    </div>
  );
}
