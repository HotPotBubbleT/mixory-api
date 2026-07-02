# Mixory

Mixory is a tracklist-to-DJ-set prototype. The current frontend is in `outputs/`; the backend in `server.mjs` is a no-dependency Node server that can parse pasted tracklists or uploaded TXT/CSV text, estimate a first-pass music profile, and generate a DJ-style set direction.

## Live demo

- Frontend: https://hotpotbubblet.github.io/playlist-remixer/
- Backend health check: https://mixory-api.onrender.com/api/health

## Run locally

1. Start the app:
   ```bash
   npm start
   ```
2. Open:
   `http://127.0.0.1:3000`

## Current backend status

- Serves the existing frontend from `outputs/`.
- Accepts pasted tracklists and TXT/CSV uploads without requiring Spotify login.
- Parses common formats such as `Artist - Track`, `Track by Artist`, and simple CSV rows.
- Estimates a basic genre mix from artist/title keywords.
- Uses MusicBrainz recording search to improve track/artist identity matching without an API key.
- Enriches pasted tracks with GetSongBPM when `GETSONGBPM_API_KEY` is configured.
- Enriches genre and mood signals with Last.fm top tags when `LASTFM_API_KEY` is configured.
- Returns a first-pass recommendation profile to the frontend.
- Keeps a placeholder for future Songstats enrichment via `SONGSTATS_API_KEY`.
- Keeps the older Spotify playlist endpoint as an experimental path, but current Spotify API behavior requires user authentication for playlist items.

This is still an MVP backend. MusicBrainz, GetSongBPM, and Last.fm improve coverage, while future Songstats or Beatport layers can make DJ-specific metadata more reliable.
