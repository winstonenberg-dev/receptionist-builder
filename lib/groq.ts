import Groq from "groq-sdk";

/**
 * Returnerar en Groq-klient med automatisk key rotation.
 * Om GROQ_API_KEY_2 finns växlar vi slumpmässigt (50/50) mellan nycklarna
 * så att token-budgeten sprids jämnt över båda kontona.
 */
export function getGroqClient(): Groq {
  const key1 = process.env.GROQ_API_KEY ?? "";
  const key2 = process.env.GROQ_API_KEY_2;

  const apiKey = key2 && Math.random() < 0.5 ? key2 : key1;
  return new Groq({ apiKey });
}

/**
 * Kör ett Groq-anrop med automatisk retry på det andra kontot vid 429.
 * Fungerar även om bara ett konto är konfigurerat.
 */
export async function groqWithFallback(
  fn: (groq: Groq) => Promise<string>
): Promise<string> {
  const key1 = process.env.GROQ_API_KEY ?? "";
  const key2 = process.env.GROQ_API_KEY_2;

  try {
    const groq = new Groq({ apiKey: key1 });
    return await fn(groq);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Om rate limit och vi har en andra nyckel — försök med den
    if (key2 && (msg.includes("429") || msg.toLowerCase().includes("rate_limit"))) {
      const groq2 = new Groq({ apiKey: key2 });
      return await fn(groq2);
    }
    throw e;
  }
}
