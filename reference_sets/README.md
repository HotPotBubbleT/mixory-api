# Reference Sets

This folder stores user-provided DJ set references for local flow learning.

- `raw/tracklist-genre-demo.txt` preserves the original pasted material.
- `raw/tracklist-expansion-2026-06-26.txt` adds Lo-fi, Trance, Techno, Deep House, Neo Soul, Road Trip, DnB, UK Garage, Tech House, and Festival House / Big Room examples.
- `raw/tracklist-expansion-ukg-bass-afro-disco-2026-06-26.txt` adds UK Garage, Bass House, Afro / Organic House, and Nu Disco / Funky House examples.
- `raw/tracklist-expansion-lofi-coffee-disco-bass-2026-06-26.txt` adds Jazzy Hip-hop / Lo-fi, Morning Coffee deep groove, Disco House, and Bass / Tech House examples.
- `generated/reference-sets.json` is a first-pass structured index used for future recommendation logic.
- `build-reference-library.mjs` rebuilds the structured index from the current raw reference files.

The parsed JSON keeps uncertain material instead of deleting it:

- `ID - ID` or unreleased IDs are marked with `isId`.
- `w/` acappella, mashup, or layered elements are marked with `isLayer`.
- Original text for every parsed line is preserved in `raw`.

Current purpose:

1. Learn set structure, not copy tracks.
2. Compare requested vibe/genre against known reference patterns.
3. Improve generated set flow: intro, warm-up, groove, peak, and outro.

This library is local-only and does not scrape external sites.

Backend usage:

- `server.mjs` loads `generated/reference-sets.json` at startup.
- Track analysis matches the user's dominant genre and selected vibe against these reference sets.
- The API response includes `profile.referenceMatch`, including the primary reference, secondary references, and a reusable pattern:
  - `flow`
  - `energyCurve`
  - `bpmRange`
  - `transitionDensity`
  - `transitionStyle`

The frontend keeps using the user's own pasted tracks for the generated setlist, but uses the matched pattern to shape the energy curve and explain the recommendation.
