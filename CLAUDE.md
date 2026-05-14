# Israel Travel Map — Architecture & Setup

## Project Overview
A personal web-based interactive map of travels in Israel.
Built with vanilla HTML/CSS/JS and a minimal Node.js/Express server.

## Stack
| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Map | Google Maps JavaScript API + Places API |
| Backend | Node.js + Express (serves static files + writes data.json) |
| Storage | `data.json` in this project folder (plain JSON, version-control friendly) |

## Project Structure
```
israel-travel-map/
├── index.html   — App shell: topbar, sidebar, map container, modal
├── style.css    — All styles: layout, sidebar, modal, status colors
├── app.js       — All logic: map init, search, markers, modal, save
├── server.js    — Express server: static file serving + POST /save endpoint
├── data.json    — Persisted location data (auto-written on every save)
├── package.json — npm manifest (only dependency: express)
└── CLAUDE.md    — This file
```

## Data Model
Each location in `data.json` follows this shape:
```json
{
  "id": "uuid-v4-string",
  "name": "Jerusalem",
  "lat": 31.7683,
  "lng": 35.2137,
  "status": "visited",
  "notes": "Old City is incredible",
  "addedAt": "2026-05-12T10:00:00Z"
}
```

**Status values:** `visited` | `plan` | `wont` | `favorite`

## Deployment

### Live URL
https://israel-travel-map.fly.dev (hosted on Fly.io, free tier, persistent volume at `/data/data.json`)

### Deploy an update
```bash
C:\Users\simch\.fly\bin\flyctl.exe deploy
```
**Fly.io does NOT auto-deploy on git push.** You must run `flyctl deploy` manually after pushing changes.

### Workflow
```
edit files → git add . && git commit -m "..." && git push → flyctl deploy
```

---

## How to Run

### First time
```bash
cd israel-travel-map
npm install
node server.js
```
Then open http://localhost:3000 in your browser.

### Every time after
```bash
node server.js
```

### Moving to a new computer
Copy the entire `israel-travel-map/` folder. On the new machine:
```bash
npm install
node server.js
```
All your data is in `data.json` — it travels with the folder.

---

## Google Maps API Key Setup

The app requires a Google Maps API key with **Maps JavaScript API** and **Places API** enabled.

### Step-by-step

1. Go to https://console.cloud.google.com/
2. Click **Select a project** → **New Project** → name it "Israel Travel Map" → Create
3. In the left menu go to **APIs & Services → Library**
4. Search for **Maps JavaScript API** → Enable
5. Search for **Places API** → Enable
6. Go to **APIs & Services → Credentials** → **+ Create Credentials → API key**
7. Copy the key shown

### Restrict the key (recommended)
In the credential settings:
- Under **Application restrictions** → select **HTTP referrers**
- Add `http://localhost:3000/*`

### Add the key to the app
Open `index.html` and find this line near the bottom:
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&...
```
Replace `YOUR_API_KEY` with your actual key.

---

## Architecture Notes

### Why a Node.js server?
Browsers cannot write files to disk. The tiny Express server exposes a single
`POST /save` endpoint that receives the full locations array as JSON and writes
it to `data.json`. This keeps data persistent in the project folder without
needing a database or cloud service.

### Auto-save flow
Every time the user adds, edits, or deletes a location, `app.js` calls
`saveData()` → `POST /save` → `server.js` writes `data.json`.
On next page load, the app fetches `data.json` and re-renders all markers.

### Marker icons
Custom SVG pin icons are generated inline per status using `markerIcon(status)`.
Colors: Visited=green, Plan=blue, Won't Visit=gray, Favorite=gold.

### Search
Uses Google Places Autocomplete restricted to Israel (`componentRestrictions: { country: 'il' }`).
Selecting a result opens the Add modal with name/coordinates pre-filled.
