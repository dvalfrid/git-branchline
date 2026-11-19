# ROADMAP

## Nu / Next

Steg 4 klart, grafen syns i desktopappen. Nästa: steg 5, komprimering.

## Steg

- [x] **1. Skelett som laddas**: `plugin.json`, `hooks.json` och en
      `register.tsx` som öppnar en tom panel "Branchline" och registrerar
      `/branchline`. Ladda den i desktopappen (se CLAUDE.md) och bekräfta att
      panelen syns.
- [x] **2. Läsa repot**: kör git via `$.process.run`, parsa refs och log
      (avgränsare `%x1f`), spara i en atom. Visa först grentabellen (gren,
      datum, efter/före main, status).
- [x] **3. Banlayout**: räkna ut banor automatiskt och testa mot ett fall med
      merge-commits (två föräldrar) och grenar som gått ihop.
- [x] **4. SVG-graf på desktop**: prickar, kanter, ref-piller, HEAD markerad.
- [ ] **5. Komprimera** commitföljder utan refs (valbart).
- [ ] **6. Levande uppdatering**: `tool.call`-hook för git-kommandon och
      polling av HEAD/refs-hash via `$.clock.every`.
- [ ] **7. Terminalreserv**: textgraf för `surface === 'terminal'`.
- [ ] **8. Interaktion** (senare): klick på en commit visar diffstat, klick på
      en gren frågar Claude om den ("ska den här slås ihop?") via `sendPrompt`
      eller motsvarande i API:t.
- [ ] **9. Dela**: marketplace.json och README-installationsrad, om Daniel vill.

## Öppna frågor

- Ska grenar som är helt sammanslagna i main döljas som standard?
- Hur många commits bakåt (200?) och hur långt bakåt i tid för gamla grenar?
- Automatisk `git fetch`: av som standard. Slå på via `userConfig`?

## Beslut

- 2026-11-19: projektet skapat. Desktopappen på Windows är huvudmålet. Modden
  läser bara repot och ändrar ingenting i det.
- 2026-11-19: namnet blev `git-branchline` (visningsnamn "Branchline for
  Claude Code", kommando `/branchline`, panelrubrik "Branchline"). Mappen
  heter `D:\Development\git-branchline`. Panelen öppnas vid sessionsstart.
- 2026-11-19: steg 1 bekräftat, panelen syns i desktopappen. Efter en ändring
  av `CLAUDE_CODE_PLUGIN_DIRS` måste desktopappen avslutas helt och startas om;
  en ny session med + räcker inte.
- 2026-11-19, steg 2: grenarna jämförs med `origin/<förvald gren>` om den finns,
  annars den lokala förvalda grenen (från `origin/HEAD`, annars main, master,
  annars HEAD). Före/efter läses med `%(ahead-behind:…)` i ett anrop (git 2.41+),
  annars en `rev-list` per gren. Status: `base`, `merged` (inga egna commits),
  `stale` (äldre än 90 dagar), annars `open`; HEAD visas för sig. Fjärrgrenar
  visas bara när ingen lokal gren följer eller speglar dem. Tabellen ritas som
  Markdown, som fungerar på alla ytor. Ren logik ligger i `hooks/core/` (utan
  `$`) så att den kan återanvändas, till exempel i en MCP-server.
- 2026-11-19, steg 3: `hooks/core/layout.ts` lägger varje commit i en bana.
  Basgrenens first-parent-linje (från `origin/main` eller `main`) har bana 0
  ensam. Första föräldern fortsätter i barnets bana; en merges övriga föräldrar
  får en ny bana om ingen redan väntar på dem. Varje kant har `fromLane`,
  `viaLane` (banan den går ned i) och `toLane`, så att steg 4 kan rita en böj
  direkt efter barnet och en vid föräldern. En förälder nedanför de 200
  commitarna ger en öppen kant (`to` saknas). Testat mot en riktig historik
  med två merges och en gren från en gren, samma form som `git log --graph`.
- 2026-11-19, steg 4: `hooks/core/svg.ts` ritar grafen som ett enda SVG-dokument
  (radhöjd 24 px, banbredd 16 px): prickar i banans färg, större prick för
  commits med refs, en ring runt HEAD, ref-piller (HEAD i varningsfärg, taggar
  streckade, `origin/`/`upstream/` utan fyllning), ämne och "författare · datum".
  Färgerna följer ljust/mörkt läge via `prefers-color-scheme`, eftersom SVG:n
  visas som bild och inte ärver textfärg. Högst 150 rader, och färre om källan
  annars blir längre än 131 072 tecken. Grafen ritas på `desktop` och `vscode`;
  terminal och mobil visar bara grentabellen än så länge.