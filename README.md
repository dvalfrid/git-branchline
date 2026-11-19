# git-graf

En Claude Code-mod som visar Git-historiken för sessionens repo i en panel
bredvid chatten: brancher, taggar, remotes, `HEAD` och hur varje gren ligger
mot `main`. Panelen uppdateras när historiken ändras.

Status: inte påbörjad. Se `ROADMAP.md`.

## Köra under utveckling

Terminal:

```powershell
claude --plugin-dir D:\Development\git-graf
```

Desktopappen: lägg till `"CLAUDE_CODE_PLUGIN_DIRS": "D:\\Development\\git-graf"`
i `env` i `~/.claude/settings.json` och starta en ny session. Öppna sedan
panelen med `/git-graf`.
