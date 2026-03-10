"use client";
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.ok) {
      router.push("/dashboard");
    } else {
      setError("Fel email eller lösenord");
      setLoading(false);
    }
  };

  if (status === "loading" || status === "authenticated") return (
    <div className="min-h-screen bg-[#0d0b12] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0b12] relative overflow-hidden">
      {/* Bakgrundsglöd */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-fuchsia-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm px-6 relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold mx-auto mb-4 shadow-xl shadow-fuchsia-900/40">AI</div>
          <h1 className="text-xl font-bold text-white">AI Operator</h1>
          <p className="text-[#7a7090] text-sm mt-1">Logga in på ditt konto</p>
        </div>

        <div className="bg-[#14111e] border border-[#2a2440] rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                placeholder="din@email.se"
                className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9b93b3] mb-1.5">Lösenord</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="w-full bg-[#1c1829] border border-[#3d3456] text-white placeholder:text-[#4d4468] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500/60 transition" />
            </div>
            {error && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-fuchsia-900/30 flex items-center justify-center gap-2">
              {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Loggar in...</> : "Logga in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#6b6280] mt-5">
          Inget konto?{" "}
          <Link href="/register" className="text-fuchsia-400 hover:text-fuchsia-300 font-medium transition">Registrera dig</Link>
        </p>
      </div>
    </div>
  );
}
