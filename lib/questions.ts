export type Question = {
  key: string;
  question: string;
  category: string;
  type: "yesno" | "select";
  options?: string[];
};

export const QUESTIONS: Question[] = [
  // Kontakt & Tid
  { key: "telefon", question: "Kan kunder kontakta er via telefon?", category: "Kontakt & Tid", type: "yesno" },
  { key: "email_kontakt", question: "Kan kunder kontakta er via email?", category: "Kontakt & Tid", type: "yesno" },
  { key: "fysisk_adress", question: "Har ni en fysisk adress kunder kan besöka?", category: "Kontakt & Tid", type: "yesno" },
  { key: "oppettider", question: "Vilka öppettider har ni i huvudsak?", category: "Kontakt & Tid", type: "select", options: ["Vardagar 8–17", "Vardagar 9–18", "7 dagar i veckan", "Säsongsbaserat"] },
  { key: "ppen_hela_aret", question: "Är ni öppna hela året?", category: "Kontakt & Tid", type: "yesno" },

  // Bokning
  { key: "kräver_bokning", question: "Kräver ni bokning i förväg?", category: "Bokning", type: "yesno" },
  { key: "bokningssatt", question: "Hur bokar man hos er?", category: "Bokning", type: "select", options: ["Endast online", "Endast telefon", "Online eller telefon", "Drop-in välkomnas"] },
  { key: "gratis_avbokning", question: "Har ni gratis avbokning?", category: "Bokning", type: "yesno" },
  { key: "presentkort", question: "Erbjuder ni presentkort?", category: "Bokning", type: "yesno" },

  // Priser
  { key: "gratis_besoek", question: "Är det gratis att besöka er?", category: "Priser", type: "yesno" },
  { key: "prisniva", question: "Vilken prisnivå har ni ungefär?", category: "Priser", type: "select", options: ["Budget (–200 kr)", "Mellanklass (200–500 kr)", "Premium (500–1500 kr)", "Lyx (1500+ kr)"] },
  { key: "rabatter", question: "Erbjuder ni rabatter för grupper, seniorer eller studenter?", category: "Priser", type: "yesno" },

  // Faciliteter
  { key: "parkering", question: "Finns det gratis parkering?", category: "Faciliteter", type: "yesno" },
  { key: "tillganglighet", question: "Är ni tillgängliga för rörelsehindrade?", category: "Faciliteter", type: "yesno" },
  { key: "wifi", question: "Erbjuder ni WiFi till gäster?", category: "Faciliteter", type: "yesno" },
  { key: "husdjur", question: "Är husdjur välkomna?", category: "Faciliteter", type: "yesno" },
  { key: "kladkod", question: "Har ni klädkod?", category: "Faciliteter", type: "yesno" },
  { key: "forvaring", question: "Finns det förvaringsutrymmen/skåp?", category: "Faciliteter", type: "yesno" },

  // Mat & Dryck
  { key: "mat", question: "Serverar ni mat?", category: "Mat & Dryck", type: "yesno" },
  { key: "alkohol", question: "Serverar ni alkohol?", category: "Mat & Dryck", type: "yesno" },
  { key: "specialkost", question: "Kan ni hantera specialkost (vegan, glutenfri etc)?", category: "Mat & Dryck", type: "yesno" },
  { key: "fika", question: "Finns kaffe/fika tillgängligt?", category: "Mat & Dryck", type: "yesno" },

  // Personal & Storlek
  { key: "engelska", question: "Har ni engelsktalande personal?", category: "Personal & Storlek", type: "yesno" },
  { key: "storlek", question: "Hur stor är er verksamhet?", category: "Personal & Storlek", type: "select", options: ["1–5 anställda", "6–20 anställda", "21–50 anställda", "50+ anställda"] },
  { key: "personal_pa_plats", question: "Finns personal på plats under alla öppettider?", category: "Personal & Storlek", type: "yesno" },

  // Övrigt
  { key: "events", question: "Arrangerar ni events eller aktiviteter?", category: "Övrigt", type: "yesno" },
  { key: "lojalitet", question: "Har ni ett lojalitetsprogram?", category: "Övrigt", type: "yesno" },
  { key: "swish", question: "Accepterar ni Swish?", category: "Övrigt", type: "yesno" },
  { key: "kontanter", question: "Accepterar ni kontanter?", category: "Övrigt", type: "yesno" },
  { key: "sociala_medier", question: "Är ni aktiva på sociala medier?", category: "Övrigt", type: "yesno" },
];

export const CATEGORIES = [...new Set(QUESTIONS.map((q) => q.category))];
