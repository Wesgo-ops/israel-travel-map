Read the following files in this project:
- CLAUDE.md
- package.json

Then run: git log --oneline -5

Based on those, print a session briefing in this exact format:

## Israel Travel Map — Session Context

**Live app:** https://israel-travel-map.fly.dev
**GitHub repo:** https://github.com/Wesgo-ops/israel-travel-map
**Deploy command:** `C:\Users\simch\.fly\bin\flyctl.exe deploy`
**Stack:** Vanilla HTML/CSS/JS · Node.js/Express · Google Maps API · Fly.io
**Data file:** `data.json` (local) / `/data/data.json` (on Fly.io volume)
**Cache version:** (check the current ?v= number in index.html — increment when deploying JS/CSS changes)

**Recent commits:**
(paste the 5 lines from git log here)

**Reminder:** After every change → `git add` · `git commit` · `git push` · `flyctl deploy`
