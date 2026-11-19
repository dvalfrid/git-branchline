# Branchline for Claude Code (`git-branchline`)

En Claude Code-mod som visar Git-historiken för sessionens repo i en panel
bredvid chatten: brancher, taggar, remotes, `HEAD` och hur varje gren ligger
mot `main`. Panelen uppdateras när historiken ändras.

Status: inte påbörjad. Se `ROADMAP.md`.

## Köra under utveckling

Terminal:

```powershell
claude --plugin-dir D:\Development\git-branchline
```

Desktopappen: lägg till `"CLAUDE_CODE_PLUGIN_DIRS": "D:\\Development\\git-branchline"`
i `env` i `~/.claude/settings.json` och starta om desktopappen helt. Öppna sedan
panelen med `/branchline`.
