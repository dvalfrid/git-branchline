# CLAUDE.md

Startkontext för kodsessioner i det här projektet. Läs den här filen och
`ROADMAP.md` först i varje session.

## Vad det är

**git-branchline** (visningsnamn "Branchline for Claude Code") är en mod (ett plugin) till Claude Code som visar Git-historiken
för sessionens repo i en panel bredvid chatten: brancher, taggar, remotes, var
`HEAD` står och hur grenarna ligger mot `main` (före/efter). Panelen ska
uppdateras av sig själv när historiken ändras: commit, fetch, pull, byte av
gren, merge.

Idén kom ur en suhf.se-session 2026-11-19, där Claude ritade en
engångsgraf som widget i chatten (se "Prototypen" nedan). Den var användbar
men blev en ögonblicksbild som inte uppdateras. Det här projektet ska göra
samma sak levande.

Daniel (ägare) kör främst **Claude-desktopappen på Windows** (Code-fliken),
ibland terminalen. Desktop är huvudmålet, terminalen ska ha en enkel reserv.

## Hur en mod byggs (läs innan du skriver kod)

**Ladda skillen `plugin-authoring` först i varje kodsession** (Skill-verktyget).
Den har API:t, exempel och var typerna ligger för just den Claude Code-build
som körs. Gissa inte API:t ur minnet, det ändras mellan versioner. Typfilen
`claude-code.d.ts` (cirka 14 000 rader) nämns när skillen laddas: greppa i den
efter `Pane: {`, `'tool.call'`, `$.process`, `Svg` och liknande.

Grundformen:

```
git-branchline/
  .claude-plugin/plugin.json   { "name": "git-branchline", "version": "0.1.0", "description": "…", "types": "./types/index.d.ts" }
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           export const register: Register = (on, options) => { … }
  types/index.d.ts             kontraktet för värden i $.state (interface PluginState)
  hooks/*.test.tsx             tester, körs med `claude plugin test .`
  hooks/core/*.ts              ren logik utan $ (parsning, layout, text), återanvändbar
  hooks/repo.ts                läser repot med git via en run-funktion
```

- Varje hook är `($, e, next)`. `$` är motorns gränssnitt (det finns ingen DOM
  och ingen Node i modulen), `e` är händelsen och `next(e)` låter resten köra.
- **Panel:** `$.ui.open({ id, title })` öppnar den, och en
  `on('ui.render', { component: 'Pane', requestId: id }, …)`-hook ritar den.
  Element hämtas per yta: `const { Box, Text, Svg, Button } = $.ui.resolve(e)`,
  där `e.surface` är `desktop`, `terminal`, `vscode` eller `mobile`.
  Mönstret finns i skillens exempel `examples/pane.tsx` och `pane-state.d.ts`.
- **Tillstånd som ritningen läser:** `atom(ref, initial, { shape })`,
  `read($, atom)` medan den ritar, `update($, atom, fn)` från andra hooks. En
  skrivning ritar om panelen. Byt `shape`-taggen när datans form ändras.
- **Köra git:** `$.process.run({ argv: ['git', '-C', repo, …] })`. Skicka
  alltid argv som lista, aldrig en sammanfogad shell-sträng.
- **Slash-kommando:** `$.command.register({ name: 'branchline', … })` i
  `session.start`, besvaras av en `command.run`-hook.
- **Timer:** `$.clock.every(…)` (stoppas vid omladdning).
- Kontroller: `claude plugin validate .`, `tsc -p .` (när typerna lagts ut i
  `.claude-plugin/types/`) och `claude plugin test .`.

### Ladda modden under utveckling

- **Terminal:** `claude --plugin-dir D:\Development\git-branchline`. Mappen bevakas
  och modden laddas om när du sparar.
- **Desktopappen:** lägg mappen i `CLAUDE_CODE_PLUGIN_DIRS` i `env`-blocket i
  `~/.claude/settings.json` (inte i ett projekts settings), till exempel
  `"CLAUDE_CODE_PLUGIN_DIRS": "D:\\Development\\git-branchline"`. Lägg också till
  `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"` om den inte laddas om när du sparar.
  Avsluta sedan desktopappen helt (Quit i systemfältet) och starta om den:
  en ny session med + läser inte om inställningen. **Fråga Daniel innan du ändrar
  `~/.claude/settings.json`.**
- Fel i en hook syns som en grå rad i transkriptet (`git-branchline: … hook skipped:
  …`) och i debugloggen (`claude --debug`).

## Design (utkast, ändra fritt i ROADMAP när det avgörs)

**Data:** en körning ger allt som behövs.

```
git for-each-ref --format=%(refname)|%(objectname:short)|%(upstream:short)|%(upstream:track) refs/heads refs/remotes refs/tags
git log --all --date-order -n 200 --format=%h|%p|%ad|%an|%D|%s --date=short
git rev-list --left-right --count origin/main...<gren>    (före/efter mot main, per gren)
```

Använd en avgränsare som inte förekommer i commitmeddelanden (helst `%x1f`,
inte `|`, som prototypen använde). Parsa till `{ id, parents[], date, author,
refs[], subject }`.

**Layout (filer):** commits nyast överst, en rad var. Varje gren får en bana
(lane). Tilldela banor genom att gå uppifrån och ned och låta en commit ärva
sitt barns bana, och ge en ny gren nästa lediga bana. Kanter ritas som raka
linjer i samma bana och som en böj (path med Q) när de byter bana.
`main`/förvald gren ligger alltid i bana 0.

**Komprimering:** en lång följd commits i samma bana utan refs och utan
förgreningar (typiskt CMS-redigeringar från andra redaktörer) slås ihop till
en rad: "12 CMS-ändringar (Lars, Linda, …)", ritad som en fyrkant i stället
för en prick. Det gjorde prototypen läsbar. Gör det valbart.

**Rita per yta:**
- `desktop`/`vscode`: ett `Svg`-element (källan får vara upp till 131 072
  tecken) för grafen, plus en tabell med grenarna: senaste datum, efter main,
  egna commits, status (öppen, HEAD, sammanslagen, gammal).
- `terminal`: en textgraf i stil med `git log --graph --oneline` i `Text`.
- `mobile`: bara grentabellen.

**När den uppdateras:**
1. Efter ett verktygsanrop: en `tool.call`-hook som efter `await next(e)`
   kollar om ett Bash- eller PowerShell-kommando innehöll `git`, och i så fall
   läser om.
2. Polla billigt med `$.clock.every` (till exempel var 5:e sekund): jämför
   `git rev-parse HEAD` och en hash av `for-each-ref`-utdata, och läs bara om
   allt när den har ändrats. Det fångar ändringar Daniel gör själv i en
   terminal eller i GitKraken.
3. Ett kommando `/branchline` som öppnar panelen och uppdaterar den.

**Vilket repo:** sessionens arbetsmapp. Hitta roten med
`git rev-parse --show-toplevel` och visa ett vänligt "inte ett git-repo"
annars.

## Prototypen

Engångsgrafen från suhf.se-sessionen (HTML-widget): en lista `R` med commits
`{ id, l (bana), m (meddelande), refs, p (föräldrar), d (datum), g (ihopslagen) }`,
radhöjd 30 px, banbredd 18 px, prickar fyllda när commiten har en ref, refs
som piller (HEAD i varningsfärg), och en tabell `B` med gren, datum,
efter/före och status. Banorna sattes för hand där. Det här projektet ska
räkna ut dem automatiskt.

Färger per bana som fungerade i både ljust och mörkt läge: grå `#5F5E5A`
(main), teal `#1D9E75`, korall `#D85A30`, lila `#7F77DD`, rosa `#D4537E` och
blå `#378ADD`. Ta temafärger från `$.ui`/temat om API:t ger dem.

## Konventioner

- Svenska i dokumentationen, engelska i kod och identifierare.
- Inga npm-beroenden i själva modden (modulen har ändå ingen Node). Testerna
  körs med `claude plugin test`.
- Läsa är ofarligt, men modden ska **aldrig** ändra repot (ingen fetch, inget
  checkout, ingen push) utan att Daniel uttryckligen bett om en sådan funktion.
  En automatisk `git fetch` vore bekväm, men den går mot nätet och ändrar
  remote-refs: om den byggs ska den vara avstängd som standard och kunna slås
  på via `userConfig`.
- Undantag som Daniel bett om (2026-11-19): modden får ta bort **sammanslagna
  lokala** grenar med `git branch -d` (som vägrar osammanslaget arbete), och
  bara efter två tryck (knapp och bekräftelse). Allt annat som ändrar repot,
  som `git branch -D` eller att ta bort en gren på origin, lämnas till Claude:
  knappen fyller bara promptrutan, och Claude kör det med sina vanliga
  behörighetsfrågor.
- Håll `ROADMAP.md` aktuell: bocka av steg och skriv beslut där i samma commit.
- Dela/installera: när Daniel vill det, lägg `.claude-plugin/marketplace.json`
  och en installationsrad i README (`/plugin install git-branchline --marketplace
  <owner>/<repo>`), enligt skillens avsnitt "Sharing a mod".
