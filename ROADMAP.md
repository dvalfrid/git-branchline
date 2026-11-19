# ROADMAP

## Nu / Next

Steg 2 klart, grentabellen syns i desktopappen. Nästa: steg 3, banlayouten.

## Steg

- [x] **1. Skelett som laddas**: `plugin.json`, `hooks.json` och en
      `register.tsx` som öppnar en tom panel "Branchline" och registrerar
      `/branchline`. Ladda den i desktopappen (se CLAUDE.md) och bekräfta att
      panelen syns.
- [x] **2. Läsa repot**: kör git via `$.process.run`, parsa refs och log
      (avgränsare `%x1f`), spara i en atom. Visa först grentabellen (gren,
      datum, efter/före main, status).
- [ ] **3. Banlayout**: räkna ut banor automatiskt och testa mot ett fall med
      merge-commits (två föräldrar) och grenar som gått ihop.
- [ ] **4. SVG-graf på desktop**: prickar, kanter, ref-piller, HEAD markerad.
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