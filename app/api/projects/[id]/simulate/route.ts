import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Regelbaserad scoring — 100% deterministisk, samma resultat varje körning ──
// Mäter vad receptionisten faktiskt vet, inte hur AI mår den dagen.
function ruleScore(answer: string): { stars: number; reason: string } {
  const a = answer.toLowerCase().trim();
  const len = a.length;

  // 1⭐ — Total avvisning, ingen info
  if (
    /tyvärr (vet|har|kan) (jag inte|vi inte)/.test(a) ||
    /ingen (information|uppgift|kännedom)/.test(a) ||
    /kan inte (svara|hjälpa|bekräfta)/.test(a) ||
    /saknar (information|uppgift|kännedom|data)/.test(a) ||
    /dessvärre (vet|har|kan|saknar)/.test(a) ||
    (len < 35 && /vet inte|okänt/.test(a))
  ) {
    return { stars: 1, reason: "Ingen info — total avvisning" };
  }

  // Kontrollera om svaret innehåller specifik data
  const hasTime   = /\d{1,2}[:.]\d{2}|\d{1,2}\s*[–-]\s*\d{1,2}\s*(på|till|–)|kl\.?\s*\d|\d{1,2}\s*till\s*\d{1,2}/.test(a);
  const hasPrice  = /\d+\s*(kr|sek|:-|kronor)|kostar\s+\d|pris(et)?\s+\d|greenfee\s+\d/.test(a);
  const hasNumber = /\d+/.test(a);
  const hasYes    = /(^|[\s,])(ja|absolut|självklart|visst|givetvis|naturligtvis)([\s,!.]|$)/.test(a);
  const hasNo     = /(^|[\s,])(nej|tyvärr inte|tyvärr ej|för tillfället inte)([\s,!.]|$)/.test(a);
  const hasClearYesNo = hasYes || hasNo;
  const hasContact = /kontakta (oss|klubben)|ring oss|maila|telefon|e-post/.test(a);
  const isLong    = len > 120;
  const isMedium  = len > 60;

  // 5⭐ — Specifik info med tid ELLER pris OCH tillräcklig längd
  if ((hasTime || hasPrice) && isMedium) {
    return { stars: 5, reason: "Specifik data med tid/pris" };
  }

  // 5⭐ — Tydligt ja/nej + siffra + längre förklaring
  if (hasClearYesNo && hasNumber && isLong) {
    return { stars: 5, reason: "Tydlig info med siffra" };
  }

  // 4⭐ — Tydligt ja/nej med förklaring, ELLER tid/pris med kort svar
  if ((hasClearYesNo && isMedium) || (hasTime || hasPrice)) {
    return { stars: 4, reason: "Bra svar med viss specifik info" };
  }

  // 4⭐ — Siffra + lång förklaring (utan kontakthänvisning)
  if (hasNumber && isLong && !hasContact) {
    return { stars: 4, reason: "Info med nummer" };
  }

  // 2⭐ — Hänvisar till kontakt utan att ge info, kort svar
  if (hasContact && !hasClearYesNo && !hasNumber && len < 100) {
    return { stars: 2, reason: "Hänvisar vidare utan info" };
  }

  // 3⭐ — Generellt svar, viss hjälp
  if (isMedium) {
    return { stars: 3, reason: "Generellt men hjälpsamt" };
  }

  // 2⭐ — Kortare, vagt svar
  return { stars: 2, reason: "Vagt, otillräcklig info" };
}

const CLUBS = [
  { name: "Midsommarkransens GK", city: "Stockholm",   question: "Vilka är era öppettider under högsäsongen?" },
  { name: "Djursholms GK",        city: "Djursholm",   question: "Hur bokar jag en starttid?" },
  { name: "Lidingö GK",           city: "Lidingö",     question: "Vad kostar greenfee för en dag?" },
  { name: "Österåkers GK",        city: "Österåker",   question: "Har ni restaurang på banan?" },
  { name: "Haninge GK",           city: "Haninge",     question: "Finns det parkering vid klubben?" },
  { name: "Botkyrka GK",          city: "Botkyrka",    question: "Erbjuder ni nybörjarkurser?" },
  { name: "Huddinge GK",          city: "Huddinge",    question: "Kan vi ta med hunden på banan?" },
  { name: "Nacka GK",             city: "Nacka",       question: "Accepterar ni kreditkort för betalning?" },
  { name: "Tyresö GK",            city: "Tyresö",      question: "Hur fungerar er avbokningspolicy?" },
  { name: "Sollentuna GK",        city: "Sollentuna",  question: "Finns det omklädningsrum och duschar?" },
  { name: "Täby GK",              city: "Täby",        question: "Kan man hyra golfklubbor?" },
  { name: "Vallentuna GK",        city: "Vallentuna",  question: "Har ni wifi i klubbhuset?" },
  { name: "Sigtuna GK",           city: "Sigtuna",     question: "Finns det möjlighet till privatlektioner?" },
  { name: "Uppsala GK",           city: "Uppsala",     question: "Vad ingår i ett årsmedlemskap?" },
  { name: "Enköpings GK",         city: "Enköping",    question: "Är banan öppen under vintern?" },
  { name: "Västerås GK",          city: "Västerås",    question: "Hur lång tid tar en runda?" },
  { name: "Eskilstuna GK",        city: "Eskilstuna",  question: "Kan man spela på kvällen?" },
  { name: "Örebro GK",            city: "Örebro",      question: "Har ni driving range?" },
  { name: "Karlstad GK",          city: "Karlstad",    question: "Vad är ert hcp-krav för att spela?" },
  { name: "Falun GK",             city: "Falun",       question: "Erbjuder ni företagsevent och konferenser?" },
  { name: "Borlänge GK",          city: "Borlänge",    question: "Finns det café eller kiosk på banan?" },
  { name: "Gävle GK",             city: "Gävle",       question: "Hur tidigt öppnar ni på morgonen?" },
  { name: "Sundsvall GK",         city: "Sundsvall",   question: "Kan man boka tee-time via app?" },
  { name: "Härnösands GK",        city: "Härnösand",   question: "Har ni rabatt för seniorer?" },
  { name: "Östersunds GK",        city: "Östersund",   question: "Erbjuder ni weekendpaket med logi?" },
  { name: "Umeå GK",              city: "Umeå",        question: "Hur många hål har er bana?" },
  { name: "Skellefteå GK",        city: "Skellefteå",  question: "Finns det hotell i närheten av klubben?" },
  { name: "Luleå GK",             city: "Luleå",       question: "Vad kostar ett juniormedlemskap?" },
  { name: "Piteå GK",             city: "Piteå",       question: "Hur lång är er golfsäsong?" },
  { name: "Göteborg GK",          city: "Göteborg",    question: "Har ni en välsorterad proshop?" },
  { name: "Halmstad GK",          city: "Halmstad",    question: "Kan man boka grupprundor för 20+ personer?" },
  { name: "Malmö GK",             city: "Malmö",       question: "Finns det faciliteter för rörelsehindrade?" },
  { name: "Helsingborgs GK",      city: "Helsingborg", question: "Hur bokar man privatlektioner med pro?" },
  { name: "Kristianstads GK",     city: "Kristianstad",question: "Erbjuder ni övernattning på plats?" },
  { name: "Kalmar GK",            city: "Kalmar",      question: "Kan vi anordna bröllop eller fest hos er?" },
  { name: "Växjö GK",             city: "Växjö",       question: "Vad är greenfee på helgen vs vardag?" },
  { name: "Jönköpings GK",        city: "Jönköping",   question: "Är ni barnvänliga — kan barn spela?" },
  { name: "Linköpings GK",        city: "Linköping",   question: "Accepterar ni gäster utan registrerat handicap?" },
  { name: "Norrköpings GK",       city: "Norrköping",  question: "Hur många starttider finns per dag?" },
  { name: "Nyköpings GK",         city: "Nyköping",    question: "Vad är skillnaden på era prisklasser?" },
  { name: "Södertälje GK",        city: "Södertälje",  question: "Har ni elektriska golfvagnar att hyra?" },
  { name: "Norrtälje GK",         city: "Norrtälje",   question: "Kan man spela under midsommar?" },
  { name: "Vaxholms GK",          city: "Vaxholm",     question: "Erbjuder ni presentkort som gåva?" },
  { name: "Ekerö GK",             city: "Ekerö",       question: "Kräver ni reservation eller är det drop-in?" },
  { name: "Märsta GK",            city: "Märsta",      question: "Vad händer om det regnar — kan man avboka?" },
  { name: "Knivsta GK",           city: "Knivsta",     question: "Har ni pitching green och putting green?" },
  { name: "Tierp GK",             city: "Tierp",       question: "Vad är lägsta åldern för att spela?" },
  { name: "Strängnäs GK",         city: "Strängnäs",   question: "Vad ingår exakt i dagspriset?" },
  { name: "Mariefred GK",         city: "Mariefred",   question: "Erbjuder ni rabatt för par?" },
  { name: "Trosa GK",             city: "Trosa",       question: "Finns det 9-håls alternativ?" },
  { name: "Gnesta GK",            city: "Gnesta",      question: "Hur är mobilsignalen ute på banan?" },
  { name: "Flen GK",              city: "Flen",        question: "Vad är er avbokningspolicy för tävlingar?" },
  { name: "Katrineholm GK",       city: "Katrineholm", question: "Hur gammal måste man vara för att spela utan vuxen?" },
  { name: "Vingåker GK",          city: "Vingåker",    question: "Är banvagnar inkluderade i greenfee?" },
  { name: "Hallsberg GK",         city: "Hallsberg",   question: "Kräver ni medlemskap för att boka tider?" },
  { name: "Laxå GK",              city: "Laxå",        question: "Erbjuder ni sommarläger för ungdomar?" },
  { name: "Degerfors GK",         city: "Degerfors",   question: "Har ni erbjudanden för nya golfare?" },
  { name: "Filipstad GK",         city: "Filipstad",   question: "Kan man se scorecard digitalt?" },
  { name: "Arvika GK",            city: "Arvika",      question: "Har ni lokal för möten och teambuilding?" },
  { name: "Säffle GK",            city: "Säffle",      question: "Vad är banans slopeindex?" },
  { name: "Åmål GK",              city: "Åmål",        question: "Finns det fler banor i närheten?" },
  { name: "Trollhättan GK",       city: "Trollhättan", question: "Hur fungerar ert bokningssystem?" },
  { name: "Lidköpings GK",        city: "Lidköping",   question: "Erbjuder ni lunch i restaurangen?" },
  { name: "Skara GK",             city: "Skara",       question: "Har ni golfpro på plats för träning?" },
  { name: "Skövde GK",            city: "Skövde",      question: "Vad gör er bana unik?" },
  { name: "Tidaholms GK",         city: "Tidaholm",    question: "Finns det parkering för grupper och bussar?" },
  { name: "Hjo GK",               city: "Hjo",         question: "Hur bokar man för en grupp på 30 personer?" },
  { name: "Karlsborg GK",         city: "Karlsborg",   question: "Har ni erbjudanden för resande golfare?" },
  { name: "Borås GK",             city: "Borås",       question: "Är banan kuperad eller relativt plan?" },
  { name: "Ulricehamn GK",        city: "Ulricehamn",  question: "Erbjuder ni lektioner för nybörjare?" },
  { name: "Tranemo GK",           city: "Tranemo",     question: "Vad gör ni för miljön på banan?" },
  { name: "Varberg GK",           city: "Varberg",     question: "Kan man spela bara 9 hål?" },
  { name: "Falkenberg GK",        city: "Falkenberg",  question: "Hur nära havet ligger ni?" },
  { name: "Laholm GK",            city: "Laholm",      question: "Vad kostar det att hyra en banvagn?" },
  { name: "Ängelholm GK",         city: "Ängelholm",   question: "Har ni simulatorgolf vintertid?" },
  { name: "Landskrona GK",        city: "Landskrona",  question: "Accepterar ni utländska golfkort?" },
  { name: "Trelleborg GK",        city: "Trelleborg",  question: "Hur hanterar ni handicap för gäster?" },
  { name: "Vellinge GK",          city: "Vellinge",    question: "Kan man spela på vintern?" },
  { name: "Staffanstorp GK",      city: "Staffanstorp",question: "Finns det cykelparking vid klubben?" },
  { name: "Burlöv GK",            city: "Burlöv",      question: "Vad är högsta tillåtna handicap?" },
  { name: "Lomma GK",             city: "Lomma",       question: "Erbjuder ni guidad runda?" },
  { name: "Kävlinge GK",          city: "Kävlinge",    question: "Har ni företagsabonnemang?" },
  { name: "Bjuv GK",              city: "Bjuv",        question: "Anordnar ni tävlingar för medlemmar?" },
  { name: "Åstorp GK",            city: "Åstorp",      question: "Kan man prova spela utan att vara medlem?" },
  { name: "Klippan GK",           city: "Klippan",     question: "Hur snabbt svarar ni på förfrågningar?" },
  { name: "Perstorp GK",          city: "Perstorp",    question: "Finns det enklare hål för barn?" },
  { name: "Hässleholm GK",        city: "Hässleholm",  question: "Vad ingår i ett dagskort?" },
  { name: "Osby GK",              city: "Osby",        question: "Har ni uthyrning av handvagnar?" },
  { name: "Älmhult GK",           city: "Älmhult",     question: "Hur anpassad är ni för rullstolsanvändare?" },
  { name: "Markaryd GK",          city: "Markaryd",    question: "Har ni rabatt för greencard-innehavare?" },
  { name: "Ljungby GK",           city: "Ljungby",     question: "Är ni öppna på helgdagar?" },
  { name: "Alvesta GK",           city: "Alvesta",     question: "Har ni förvaringsskåp i omklädningsrummet?" },
  { name: "Tingsryd GK",          city: "Tingsryd",    question: "Är greener bevattnade under sommartorkan?" },
  { name: "Emmaboda GK",          city: "Emmaboda",    question: "Vilket hotell ligger närmast er klubb?" },
  { name: "Nybro GK",             city: "Nybro",       question: "Kan man äta middag efter en kvällsrunda?" },
  { name: "Borgholm GK",          city: "Borgholm",    question: "Kan man boka halvdagsspel?" },
  { name: "Mörbylånga GK",        city: "Mörbylånga",  question: "Finns det bastu eller gym på anläggningen?" },
  { name: "Kalmar Stads GK",      city: "Kalmar",      question: "Har ni något lojalitetsprogram för stamgäster?" },
];

const RESTAURANTS = [
  { name: "Kund 1",   city: "Stockholm",   question: "Vilka är era öppettider på helgen?" },
  { name: "Kund 2",   city: "Göteborg",    question: "Kan man boka bord för 8 personer?" },
  { name: "Kund 3",   city: "Malmö",       question: "Har ni veganska rätter på menyn?" },
  { name: "Kund 4",   city: "Uppsala",     question: "Vad kostar en genomsnittlig middag?" },
  { name: "Kund 5",   city: "Linköping",   question: "Accepterar ni Swish som betalning?" },
  { name: "Kund 6",   city: "Örebro",      question: "Har ni uteservering på sommaren?" },
  { name: "Kund 7",   city: "Västerås",    question: "Kan man ta med hundar om man sitter ute?" },
  { name: "Kund 8",   city: "Helsingborg", question: "Serverar ni lunch vardagar?" },
  { name: "Kund 9",   city: "Norrköping",  question: "Har ni glutenfria alternativ?" },
  { name: "Kund 10",  city: "Jönköping",   question: "Kan man boka hela restaurangen för fest?" },
  { name: "Kund 11",  city: "Lund",        question: "Vad är er avbokningspolicy?" },
  { name: "Kund 12",  city: "Umeå",        question: "Har ni barnmeny?" },
  { name: "Kund 13",  city: "Sundsvall",   question: "Serverar ni frukost?" },
  { name: "Kund 14",  city: "Gävle",       question: "Finns det parkering i närheten?" },
  { name: "Kund 15",  city: "Borås",       question: "Erbjuder ni take-away?" },
  { name: "Kund 16",  city: "Eskilstuna",  question: "Har ni alkoholfria alternativ till drinkar?" },
  { name: "Kund 17",  city: "Södertälje",  question: "Kan man beställa tårta till ett kalas?" },
  { name: "Kund 18",  city: "Halmstad",    question: "Vad är er senaste tid för bordbokning?" },
  { name: "Kund 19",  city: "Karlstad",    question: "Har ni WiFi för gäster?" },
  { name: "Kund 20",  city: "Trollhättan", question: "Serverar ni à la carte på lunchmenyn?" },
  { name: "Kund 21",  city: "Östersund",   question: "Finns det ett piano eller musik på kvällar?" },
  { name: "Kund 22",  city: "Växjö",       question: "Hur lång tid tar en typisk middag hos er?" },
  { name: "Kund 23",  city: "Falun",       question: "Erbjuder ni catering för företagsevent?" },
  { name: "Kund 24",  city: "Skövde",      question: "Kan vi ta med en egen tårta till kalaset?" },
  { name: "Kund 25",  city: "Kalmar",      question: "Är ni öppna på röda dagar?" },
  { name: "Kund 26",  city: "Kristianstad",question: "Har ni en bar eller bara matservering?" },
  { name: "Kund 27",  city: "Varberg",     question: "Kan man sitta utan bordsbokning?" },
  { name: "Kund 28",  city: "Trelleborg",  question: "Vad ingår i trerättersmenyn?" },
  { name: "Kund 29",  city: "Visby",       question: "Har ni specialmeny för allergiker?" },
  { name: "Kund 30",  city: "Nyköping",    question: "Är restaurangen tillgänglig för rullstolsanvändare?" },
  { name: "Kund 31",  city: "Lidköping",   question: "Erbjuder ni vinpaket till maten?" },
  { name: "Kund 32",  city: "Motala",      question: "Kan man sitta utomhus om det regnar?" },
  { name: "Kund 33",  city: "Ängelholm",   question: "Hur bokar man en privat sällskapslokal?" },
  { name: "Kund 34",  city: "Piteå",       question: "Finns det presentkort att köpa?" },
  { name: "Kund 35",  city: "Kiruna",      question: "Har ni laktosfria alternativ?" },
  { name: "Kund 36",  city: "Luleå",       question: "Serverar ni mat sent på kvällen?" },
  { name: "Kund 37",  city: "Skellefteå",  question: "Kan man köpa vin från er vinkällare hem?" },
  { name: "Kund 38",  city: "Härnösand",   question: "Är det trångt att sitta hos er?" },
  { name: "Kund 39",  city: "Hudiksvall",  question: "Har ni lokal för möten med projector?" },
  { name: "Kund 40",  city: "Bollnäs",     question: "Vad händer om vi är fler än bokat?" },
  { name: "Kund 41",  city: "Sandviken",   question: "Kan ni laga mat för 50+ gäster?" },
  { name: "Kund 42",  city: "Sala",        question: "Är det möjligt att anpassa menyn för oss?" },
  { name: "Kund 43",  city: "Arboga",      question: "Hur gammal måste man vara för att sitta i baren?" },
  { name: "Kund 44",  city: "Strängnäs",   question: "Har ni dressade salladsmöjligheter?" },
  { name: "Kund 45",  city: "Mariefred",   question: "Serverar ni brunch på helger?" },
  { name: "Kund 46",  city: "Trosa",       question: "Kan man fira bröllop hos er?" },
  { name: "Kund 47",  city: "Enköping",    question: "Har ni en chef som kan anpassa rätter?" },
  { name: "Kund 48",  city: "Märsta",      question: "Vad är era bästa rätter?" },
  { name: "Kund 49",  city: "Norrtälje",   question: "Kan man se matlagningen i ett öppet kök?" },
  { name: "Kund 50",  city: "Vaxholm",     question: "Tar ni emot Rikskuponger eller liknande?" },
  { name: "Kund 51",  city: "Lidingö",     question: "Har ni lojalitetsprogram eller stämpelkort?" },
  { name: "Kund 52",  city: "Nacka",       question: "Erbjuder ni after work-meny?" },
  { name: "Kund 53",  city: "Tyresö",      question: "Kan man äta ute trots regn (tält/värmelampor)?" },
  { name: "Kund 54",  city: "Haninge",     question: "Hur snabbt får man mat efter beställning?" },
  { name: "Kund 55",  city: "Huddinge",    question: "Serverar ni franska viner?" },
  { name: "Kund 56",  city: "Botkyrka",    question: "Är er restaurang bra för dejt?" },
  { name: "Kund 57",  city: "Sollentuna",  question: "Tar ni betalt per person eller per bord?" },
  { name: "Kund 58",  city: "Täby",        question: "Finns det en lounge-del?" },
  { name: "Kund 59",  city: "Vallentuna",  question: "Kan ni anordna en överraskning för jubileum?" },
  { name: "Kund 60",  city: "Sigtuna",     question: "Är det svårt att parkera här på kvällstid?" },
  { name: "Kund 61",  city: "Knivsta",     question: "Har ni meny på engelska?" },
  { name: "Kund 62",  city: "Tierp",       question: "Hur hanterar ni stora grupper med olika allergier?" },
  { name: "Kund 63",  city: "Östhammar",   question: "Kan man fira barnkalas här?" },
  { name: "Kund 64",  city: "Älvkarleby",  question: "Serverar ni husmanskost?" },
  { name: "Kund 65",  city: "Tierp",       question: "Har ni möjlighet att servera matkassar hem?" },
  { name: "Kund 66",  city: "Gimo",        question: "Erbjuder ni personalmiddagar?" },
  { name: "Kund 67",  city: "Rimbo",       question: "Kan man ta med egna drycker (korkavgift)?" },
  { name: "Kund 68",  city: "Hallstavik",  question: "Vad skiljer er från andra restauranger?" },
  { name: "Kund 69",  city: "Väddö",       question: "Har ni råvaror från lokala producenter?" },
  { name: "Kund 70",  city: "Söderhamn",   question: "Finns det möjlighet till livelmusik?" },
  { name: "Kund 71",  city: "Ljusdal",     question: "Kan vi beställa hemkörning av mat?" },
  { name: "Kund 72",  city: "Ånge",        question: "Har ni meny som byts ut säsong för säsong?" },
  { name: "Kund 73",  city: "Sundsvall",   question: "Erbjuder ni hållbar och ekologisk mat?" },
  { name: "Kund 74",  city: "Timrå",       question: "Hur ser bordsplaceringen ut vid festsittning?" },
  { name: "Kund 75",  city: "Härnösand",   question: "Kan man hyra restaurangen exklusivt?" },
  { name: "Kund 76",  city: "Kramfors",    question: "Servar ni mat eller beställer gästerna själva?" },
  { name: "Kund 77",  city: "Sollefteå",   question: "Tar ni emot bokningar samma dag?" },
  { name: "Kund 78",  city: "Örnsköldsvik",question: "Har ni ett separat rum för rökare?" },
  { name: "Kund 79",  city: "Sundsvall",   question: "Erbjuder ni lunch för under 100 kr?" },
  { name: "Kund 80",  city: "Timrå",       question: "Kan man boka bord via Instagram/sociala medier?" },
  { name: "Kund 81",  city: "Härnösand",   question: "Har ni en Michelin-stjärna eller annan utmärkelse?" },
  { name: "Kund 82",  city: "Stenungsund", question: "Erbjuder ni mat för folk med nötallergier?" },
  { name: "Kund 83",  city: "Kungälv",     question: "Hur länge i förväg bör man boka bord?" },
  { name: "Kund 84",  city: "Ale",         question: "Kan man hänga av sig jackan vid ingången?" },
  { name: "Kund 85",  city: "Lerum",       question: "Serverar ni bara a la carte eller också buffé?" },
  { name: "Kund 86",  city: "Mölndal",     question: "Har ni några vegetariska specialrätter?" },
  { name: "Kund 87",  city: "Partille",    question: "Är det möjligt att sitta ensam och arbeta?" },
  { name: "Kund 88",  city: "Härryda",     question: "Erbjuder ni mat sent på natten?" },
  { name: "Kund 89",  city: "Kungsbacka",  question: "Kan man köpa mat att ta med hem?" },
  { name: "Kund 90",  city: "Falkenberg",  question: "Har ni studentrabatt?" },
  { name: "Kund 91",  city: "Laholm",      question: "Erbjuder ni matkuponger för stora sällskap?" },
  { name: "Kund 92",  city: "Båstad",      question: "Kan man sitta länge och umgås utan att bli bortvisad?" },
  { name: "Kund 93",  city: "Ängelholm",   question: "Har ni kockar med internationell erfarenhet?" },
  { name: "Kund 94",  city: "Landskrona",  question: "Serverar ni mat med säsongsbetonade råvaror?" },
  { name: "Kund 95",  city: "Eslöv",       question: "Erbjuder ni privat middagsupplevelse för par?" },
  { name: "Kund 96",  city: "Sjöbo",       question: "Kan man kombinera restaurangbesök med hotellvistelse?" },
  { name: "Kund 97",  city: "Ystad",       question: "Hur hanterar ni bokningar som inte dyker upp?" },
  { name: "Kund 98",  city: "Simrishamn",  question: "Har ni havsvy eller naturskönt läge?" },
  { name: "Kund 99",  city: "Tomelilla",   question: "Erbjuder ni kurskvällar eller matlagningskurser?" },
  { name: "Kund 100", city: "Vellinge",    question: "Kan man anmäla sig till er nyhetsbrev för erbjudanden?" },
];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
    include: {
      answers: true,
      prompts: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

  // Välj rätt scenariolista baserat på bransch
  const SCENARIOS = project.industry === "restaurang" ? RESTAURANTS : CLUBS;

  const qaLines = (project.answers ?? [])
    .filter(a => a.answer?.trim() && !a.questionKey.endsWith("_findings") && a.questionKey !== "website_knowledge")
    .map(a => `- ${a.question}: ${a.answer}`);

  const websiteKnowledge = project.answers.find(a => a.questionKey === "website_knowledge")?.answer ?? "";
  const systemPrompt = project.prompts[0]?.prompt ?? "";

  const receptionistContext = [
    qaLines.length > 0 ? `FAKTA OM FÖRETAGET:\n${qaLines.join("\n")}` : "",
    websiteKnowledge ? `HEMSIDEKUNSKAP:\n${websiteKnowledge.slice(0, 3000)}` : "",
    systemPrompt ? `INSTRUKTIONER:\n${systemPrompt.slice(0, 2000)}` : "",
  ].filter(Boolean).join("\n\n---\n\n");

  if (!receptionistContext.trim()) {
    return NextResponse.json({
      error: "Ingen information hittad. Analysera hemsidan eller kör agenter först.",
    }, { status: 400 });
  }

  const clubsList = SCENARIOS.map((c, i) => `${i + 1}. "${c.question}"`).join("\n");

  // ── FAS 1: Receptionisten svarar — temperature låg för konsekvens ──
  const answerPrompt = `Du är en AI-receptionist med följande information:

${receptionistContext}

---

Svara på dessa frågor som om du är receptionisten. Var ärlig — om du inte har informationen, säg det direkt.
Varje svar max 2 meningar. Svara ENBART med JSON-array:
[{"i":1,"answer":"..."},{"i":2,"answer":"..."},...]

Frågor:
${clubsList}`;

  const answerCompletion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: answerPrompt }],
    temperature: 0.2, // Låg temp = konsekventa svar
    max_tokens: 14000,
  });

  const rawAnswers = answerCompletion.choices[0].message.content ?? "[]";
  let answerItems: { i: number; answer: string }[] = [];
  try {
    const m = rawAnswers.match(/\[[\s\S]*\]/);
    if (m) answerItems = JSON.parse(m[0]);
  } catch {
    return NextResponse.json({ error: "Kunde inte tolka svaren. Försök igen." }, { status: 500 });
  }

  // ── FAS 2: Regelbaserad scoring — 100% deterministisk ──
  // Betyget baseras på VAD svaret innehåller, inte hur AI:n känner för dagen.
  const scored = answerItems.map(item => {
    const club = SCENARIOS[item.i - 1];
    const { stars, reason } = ruleScore(item.answer);
    return {
      i: item.i,
      club: club?.name ?? `Kund ${item.i}`,
      city: club?.city ?? "",
      question: club?.question ?? "",
      answer: item.answer,
      stars,
      feedback: reason, // Ersätts av AI-feedback nedan
    };
  });

  // ── FAS 3: AI genererar mänsklig feedback-text — separerad från scoring ──
  // temperature: 0 för konsekvens, men texten behöver inte vara identisk varje gång
  const feedbackItems = scored.slice(0, 50).map(r =>
    `${r.i}. [${r.stars}⭐] Fråga: "${r.question}" | Svar: "${r.answer.slice(0, 80)}..."`
  ).join("\n");

  const feedbackPrompt = `Skriv en 4-6 ords feedback-kommentar (på svenska) för varje av dessa AI-receptionistsvar, ur kundens perspektiv.
Betyget är redan satt (1-5 ⭐) baserat på om svaret innehöll specifik info.

Exempel feedback:
- 5⭐: "Perfekt — exakta tider!" / "Klart svar om priser!"
- 4⭐: "Bra, hjälpsamt svar" / "Tydlig info om faciliteter"
- 3⭐: "OK men lite vagt" / "Allmänt, saknar detaljer"
- 2⭐: "Hänvisar vidare, ingen info" / "Vagt, ej specifikt"
- 1⭐: "Vet ingenting om detta" / "Saknar all information"

Svara ENBART med JSON: [{"i":1,"feedback":"..."},{"i":2,"feedback":"..."},...]

Svar:
${feedbackItems}`;

  const [feedbackCompletion] = await Promise.all([
    groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: feedbackPrompt }],
      temperature: 0,
      max_tokens: 2000,
    }),
  ]);

  // Merge feedback text into scored results
  try {
    const rawFB = feedbackCompletion.choices[0].message.content ?? "[]";
    const m = rawFB.match(/\[[\s\S]*\]/);
    if (m) {
      const fbItems: { i: number; feedback: string }[] = JSON.parse(m[0]);
      for (const fb of fbItems) {
        const s = scored.find(r => r.i === fb.i);
        if (s) s.feedback = fb.feedback;
      }
    }
  } catch { /* keep rule-based reason as fallback */ }

  const avgStars = scored.length > 0
    ? scored.reduce((sum, r) => sum + r.stars, 0) / scored.length
    : 0;

  const lowRated  = scored.filter(r => r.stars <= 2);
  const highRated = scored.filter(r => r.stars >= 4);

  // ── FAS 4: Sammanfattning baserad på faktiska regelpoäng ──
  const summaryPrompt = `En AI-receptionist testades med ${scored.length} frågor från golfklubbar.
Scoring är regelbaserad (inte AI-betygsättning) och baseras på om svaret innehöll specifik info.

Resultat:
- Genomsnittsbetyg: ${avgStars.toFixed(1)}/5
- Bra svar (4-5⭐): ${highRated.length} frågor — receptionisten hade konkret information
- Dåliga svar (1-2⭐): ${lowRated.length} frågor — saknade information

De ${Math.min(12, lowRated.length)} frågorna receptionisten INTE kan svara på:
${lowRated.slice(0, 12).map(r => `• "${r.question}"`).join("\n")}

Skriv en konkret analys på svenska (4-5 meningar):
1. Vad receptionisten svarar bra på (baserat på vilken info som finns)
2. Vilka TYPER av info som saknas (gruppera de lågt betygsatta frågorna)
3. Vad som bör läggas till i systemet för att täcka luckorna

Var specifik om informationsluckorna.`;

  const summaryCompletion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: summaryPrompt }],
    temperature: 0.4,
    max_tokens: 600,
  });

  return NextResponse.json({
    results: scored,
    avgStars: parseFloat(avgStars.toFixed(1)),
    summary: summaryCompletion.choices[0].message.content ?? "",
    total: scored.length,
    lowCount: lowRated.length,
    highCount: highRated.length,
    projectName: project.name,
    scoringMethod: "rule-based", // Transparens: visa att scoring är deterministisk
  });
}
