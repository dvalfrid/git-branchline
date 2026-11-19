# ROADMAP

## Nu / Next

Inget påbörjat. Börja med steg 1.

## Steg

- [ ] **1. Skelett som laddas**: `plugin.json`, `hooks.json` och en
      `register.tsx` som öppnar en tom panel "Git-graf" och registrerar
      `/git-graf`. Ladda den i desktopappen (se CLAUDE.md) och bekräfta att
      panelen syns.
- [ ] **2. Läsa repot**: kör git via `$.process.run`, parsa refs och log
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
