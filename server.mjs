import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const rootDir = resolve(".");
const publicDir = join(rootDir, "outputs");
const maxRequestBytes = 512 * 1024;
const maxRawTextChars = 240_000;
const maxTrackLines = 300;
const appUserAgent = "Mixory/0.1 (https://hotpotbubblet.github.io/playlist-remixer/)";
const getSongBpmLookupLimit = 20;
const lastFmLookupLimit = 20;
const musicBrainzLookupLimit = 5;
const metadataConcurrency = 6;
let spotifyAppToken = null;
const metadataCache = {
  musicBrainz: new Map(),
  getSongBpm: new Map(),
  lastFm: new Map()
};
const referenceLibrary = loadReferenceLibrary();

loadEnv();

const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  songstatsApiKey: process.env.SONGSTATS_API_KEY ?? "",
  getSongBpmApiKey: process.env.GETSONGBPM_API_KEY ?? "",
  lastFmApiKey: process.env.LASTFM_API_KEY ?? "",
  port: Number(process.env.PORT ?? 3000)
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      addCorsHeaders(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
    }

    if (url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        spotifyConfigured: Boolean(config.clientId && config.clientSecret),
        songstatsConfigured: Boolean(config.songstatsApiKey),
        getSongBpmConfigured: Boolean(config.getSongBpmApiKey),
        lastFmConfigured: Boolean(config.lastFmApiKey),
        musicBrainzConfigured: true,
        referenceSetCount: referenceLibrary.sets.length,
        mode: "pasted-tracklist"
      });
    }

    if (url.pathname === "/api/playlist/analyze" && req.method === "POST") {
      return await handleAnalyze(req, res);
    }

    if (url.pathname === "/api/tracks/analyze" && req.method === "POST") {
      return await handleTrackTextAnalyze(req, res);
    }

    return await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: "Server error", detail: error.message }, 500);
  }
});

server.listen(config.port, () => {
  console.log(`Mixory running at http://127.0.0.1:${config.port}`);
});

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadReferenceLibrary() {
  const libraryPath = join(rootDir, "reference_sets", "generated", "reference-sets.json");
  if (!existsSync(libraryPath)) return { sets: [] };

  try {
    const library = JSON.parse(readFileSync(libraryPath, "utf8"));
    return {
      ...library,
      sets: Array.isArray(library.sets) ? library.sets : []
    };
  } catch (error) {
    console.warn(`Reference library could not be loaded: ${error.message}`);
    return { sets: [] };
  }
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${safePath}`);
  if (!filePath.startsWith(publicDir)) {
    return sendText(res, "Forbidden", 403);
  }

  try {
    const data = await readFile(filePath);
    const type = mimeTypes[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    sendText(res, "Not found", 404);
  }
}

async function handleAnalyze(req, res) {
  const body = await readJson(req);
  const playlistId = parsePlaylistId(body.playlistUrl);
  if (!playlistId) return sendJson(res, { error: "Invalid Spotify playlist URL" }, 400);

  if (!config.clientId || !config.clientSecret) {
    return sendJson(res, {
      error: "Spotify app credentials are not configured. Create .env from .env.example first.",
      profile: makeFallbackProfile(body.vibe)
    }, 503);
  }

  try {
    const accessToken = await getSpotifyAppAccessToken();
    const tracks = await fetchPlaylistTracks(playlistId, accessToken);
    const artistIds = collectArtistIds(tracks);
    const artists = await fetchArtists(artistIds, accessToken);
    const songstats = await enrichWithSongstats(tracks);
    const profile = buildPlaylistProfile(tracks, artists, body.vibe, songstats);

    return sendJson(res, {
      source: "spotify",
      enrichment: config.songstatsApiKey ? "songstats-placeholder" : "none",
      trackCount: tracks.length,
      profile
    });
  } catch (error) {
    return sendJson(res, {
      error: error.message,
      profile: makeFallbackProfile(body.vibe)
    }, 502);
  }
}

async function handleTrackTextAnalyze(req, res) {
  const body = await readJson(req);
  const tracks = parseTrackText(body.rawText ?? "");
  if (tracks.length < 3) {
    return sendJson(res, {
      error: "Paste at least three readable tracks.",
      trackCount: tracks.length,
      tracks,
      profile: makeFallbackProfile(body.vibe)
    }, 400);
  }

  const musicBrainzTracks = await enrichWithMusicBrainz(tracks);
  const [getSongBpmTracks, lastFmTracks] = await Promise.all([
    enrichWithGetSongBpm(musicBrainzTracks),
    enrichWithLastFm(musicBrainzTracks)
  ]);
  const enrichedTracks = mergeParallelTrackEnrichment(getSongBpmTracks, lastFmTracks);
  const profiledTracks = addTrackGenreProfiles(enrichedTracks, body.genre);
  const musicBrainzMatchedCount = profiledTracks.filter((track) => track.musicBrainz?.matched).length;
  const matchedCount = profiledTracks.filter((track) => track.getSongBpm?.matched).length;
  const lastFmMatchedCount = profiledTracks.filter((track) => track.lastFm?.matched).length;
  const profile = buildTextTrackProfile(profiledTracks, body.vibe, matchedCount, lastFmMatchedCount, musicBrainzMatchedCount, body.genre);
  return sendJson(res, {
    source: "pasted-tracklist",
    enrichment: describeTrackEnrichment(matchedCount, lastFmMatchedCount, musicBrainzMatchedCount),
    trackCount: profiledTracks.length,
    musicBrainzMatchedCount,
    matchedCount,
    lastFmMatchedCount,
    tracks: profiledTracks,
    profile
  });
}

async function getSpotifyAppAccessToken() {
  if (spotifyAppToken && Date.now() < spotifyAppToken.expiresAt - 60_000) {
    return spotifyAppToken.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials"
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Spotify app token request failed: ${await response.text()}`);
  }

  const token = await response.json();
  spotifyAppToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  };
  return spotifyAppToken.accessToken;
}

async function fetchPlaylistTracks(playlistId, accessToken) {
  const tracks = [];
  let next = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&market=US&fields=next,items(track(id,name,popularity,artists(id,name)))`;

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 401) {
        throw new Error(`Spotify playlist items now require user authentication in this app mode: ${detail}`);
      }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new Error(`Spotify playlist is not public or accessible: ${detail}`);
      }
      throw new Error(`Spotify playlist read failed: ${detail}`);
    }
    const page = await response.json();
    for (const item of page.items ?? []) {
      if (item.track?.id) tracks.push(item.track);
    }
    next = page.next;
  }

  return tracks;
}

async function fetchArtists(artistIds, accessToken) {
  const artists = new Map();
  for (let index = 0; index < artistIds.length; index += 50) {
    const batch = artistIds.slice(index, index + 50);
    const response = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(",")}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) continue;
    const data = await response.json();
    for (const artist of data.artists ?? []) {
      if (artist?.id) artists.set(artist.id, artist);
    }
  }
  return artists;
}

async function enrichWithSongstats(tracks) {
  if (!config.songstatsApiKey) return null;

  // Placeholder for the future Songstats API layer. Keep the API boundary here so
  // Spotify analysis can run now, and enrichment can be added without changing UI.
  return {
    enabled: true,
    trackCandidates: tracks.slice(0, 20).map((track) => ({
      title: track.name,
      artists: (track.artists ?? []).map((artist) => artist.name)
    }))
  };
}

function parseTrackText(rawText) {
  const structuredTracks = parseStructuredPlaylistTracks(rawText);
  if (structuredTracks.length) return structuredTracks.slice(0, 500);

  return normalizePlaylistText(rawText)
    .slice(0, maxRawTextChars)
    .split(/\r\n|\n|\r/)
    .slice(0, maxTrackLines)
    .map((line) => normalizeTrackLine(line))
    .filter(Boolean)
    .map(parseTrackLine)
    .filter((track) => track.title || track.artist)
    .slice(0, 500);
}

function parseStructuredPlaylistTracks(rawText) {
  const text = normalizePlaylistText(rawText).slice(0, maxRawTextChars);
  const csvTracks = parseStructuredRecords(parseDelimitedRecords(text, ","));
  if (csvTracks.length) return csvTracks;
  return parseStructuredRecords(parseDelimitedRecords(text, "\t"));
}

function parseStructuredRecords(records) {
  if (records.length < 2) return [];

  const headers = records[0].map((header) => normalizeTableHeader(header));
  const titleIndex = findHeaderIndex(headers, ["track name", "name", "song name", "title"]);
  const artistIndex = findHeaderIndex(headers, ["artist name(s)", "artist", "artists", "artist name", "album artist"]);
  if (titleIndex === -1 || artistIndex === -1) return [];
  if (!looksLikePlaylistTable(headers)) return [];

  return records
    .slice(1, maxTrackLines + 1)
    .map((record) => cleanTrack({
      title: record[titleIndex] ?? "",
      artist: record[artistIndex] ?? "",
      raw: `${record[titleIndex] ?? ""} - ${record[artistIndex] ?? ""}`
    }))
    .filter((track) => track.title && track.artist);
}

function parseDelimitedRecords(text, delimiter = ",") {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      record.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

function normalizePlaylistText(value = "") {
  const text = String(value ?? "");
  const nullCount = (text.match(/\u0000/g) ?? []).length;
  const repaired = nullCount > text.length * 0.1 ? text.replace(/\u0000/g, "") : text;
  return repaired
    .replace(/^\uFEFF/, "")
    .replace(/^\uFFFD+/, "")
    .replace(/^\u00EF\u00BB\u00BF/, "");
}

function normalizeTableHeader(value = "") {
  return String(value)
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

function findHeaderIndex(headers, candidates) {
  return candidates.map((candidate) => headers.indexOf(candidate)).find((index) => index !== -1) ?? -1;
}

function looksLikePlaylistTable(headers) {
  const playlistColumns = [
    "track name",
    "artist name(s)",
    "album",
    "time",
    "genre",
    "track number",
    "location",
    "plays",
    "date added"
  ];
  return playlistColumns.some((column) => headers.includes(column));
}

function normalizeTrackLine(line) {
  return String(line)
    .trim()
    .replace(/^\s*(\d{1,3}[\).\-\s]+|[-*]\s+)/, "")
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+/g, " - ");
}

function parseTrackLine(line) {
  const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return cleanTrack({
      title: byMatch[1],
      artist: byMatch[2],
      raw: line
    });
  }

  const separatorMatch = line.match(/^(.+?)\s*(?:[-–—|/:]|\t)\s*(.+)$/);
  if (separatorMatch) {
    return normalizeTrackOrder({
      left: separatorMatch[1],
      right: separatorMatch[2],
      raw: line
    });
  }

  const csvParts = splitCsvLine(line);
  if (csvParts.length >= 2) {
    return normalizeTrackOrder({
      left: csvParts[0],
      right: csvParts[1],
      raw: line
    });
  }

  return cleanTrack({
    title: line,
    artist: "",
    raw: line
  });
}

function normalizeTrackOrder(track) {
  const left = cleanTrackPart(track.left);
  const right = cleanTrackPart(track.right);
  const leftAsArtist = scoreArtistLike(left) + scoreTitleLike(right);
  const rightAsArtist = scoreArtistLike(right) + scoreTitleLike(left);
  const leftAsTitlePenalty = scoreArtistLike(left) > 3 ? -3 : 0;
  const rightAsTitlePenalty = scoreArtistLike(right) > 3 ? -3 : 0;
  const normalScore = leftAsArtist + rightAsTitlePenalty;
  const swappedScore = rightAsArtist + leftAsTitlePenalty;

  if (swappedScore >= normalScore) {
    return cleanTrack({
      title: left,
      artist: right,
      raw: track.raw
    });
  }

  return cleanTrack({
    artist: left,
    title: right,
    raw: track.raw
  });
}

function scoreArtistLike(value = "") {
  const text = normalizeNameForScore(value);
  const knownArtists = [
    "fred again", "peggy gou", "bicep", "disclosure", "ben bohmer", "ben böhmer", "keinemusik", "rampa", "adam port",
    "black coffee", "mochakk", "kaytranada", "bonobo", "caribou", "jungle", "sg lewis", "lane 8", "yotto",
    "anyma", "artbat", "tale of us", "charlotte", "amelie", "above & beyond", "armin", "sza", "nujabes",
    "elderbrook", "chris lake", "gorgon city", "labjium", "josh butler", "j dilla", "shing02", "nujabes",
    "illyus barrientos", "illy's barrientos", "illys barrientos", "jack truant", "peter brown", "kink gong",
    "kink", "vozmediano", "dennis ferrer", "lane 8", "jo paciello", "a tribe called quest", "the pharcyde",
    "uyama hiroto", "dj nozawa", "five deez", "substantial", "l universe", "lord finesse", "jungle brothers",
    "urbs", "cutex", "kero one", "aim", "dj numark", "pomo", "never dull", "wax motif", "lika",
    "emapea", "sushi music", "jazz liberatorz", "slum village", "ras g", "spaze windu", "thes one",
    "the globetroddas", "midan", "potatohead people", "redman", "kapok", "common"
  ];
  let score = 0;
  if (knownArtists.some((artist) => text.includes(artist))) score += 4;
  if (text.includes("&") || text.includes(" x ") || text.includes(" vs ")) score += 1;
  if (/\b(dj|mc)\b/i.test(text)) score += 1;
  if (/^\d{4}$/.test(text)) score -= 3;
  if (!/[()[\]]/.test(text) && text.split(/\s+/).length <= 4) score += 1;
  if (/\b(remix|edit|mix|version|extended|radio|original|dub|live)\b/i.test(text)) score -= 2;
  if (/\b(feat|ft\.|featuring)\b/i.test(text)) score -= 1;
  return score;
}

function scoreTitleLike(value = "") {
  const text = normalizeNameForScore(value);
  let score = 0;
  if (/\b(remix|edit|mix|version|extended|radio|original|dub|live|feat|ft\.|featuring)\b/i.test(text)) score += 2;
  if (/[()[\]]/.test(text)) score += 1;
  if (text.split(/\s+/).length >= 4) score += 1;
  if (/["'“”]/.test(text)) score += 1;
  if (/^\d{4}$/.test(text)) score += 3;
  if (/\b(love|control|over|raw|soul|dancin|dancing|requiem|aurora|voodoo|howl|rabbit hole)\b/i.test(text)) score += 1;
  return score;
}

function normalizeNameForScore(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function splitCsvLine(line) {
  if (!line.includes(",")) return [];
  const parts = line
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  if (/^(artist|artists?|creator|performer)$/i.test(parts[0]) || /^(title|track|song|name)$/i.test(parts[0])) return [];
  return parts;
}

function cleanTrack(track) {
  const title = cleanTrackPart(track.title);
  const artist = cleanTrackPart(track.artist);
  return {
    title,
    artist,
    raw: track.raw,
    meta: ""
  };
}

function cleanTrackPart(value = "") {
  return String(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\((house|techno|trance|lo-fi|lofi|afro house|deep house|progressive house|melodic techno|indie dance|nu soul|drum and bass|dnb)\)/gi, "")
    .replace(/\([^)]+\b(official|visualizer|lyrics?|audio|remaster|radio edit)\b[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichWithGetSongBpm(tracks) {
  if (!config.getSongBpmApiKey) return tracks;

  const limited = tracks.slice(0, getSongBpmLookupLimit);
  const enriched = await mapWithConcurrency(limited, metadataConcurrency, lookupGetSongBpmTrack);
  return [...enriched, ...tracks.slice(limited.length)];
}

async function enrichWithMusicBrainz(tracks) {
  const limited = tracks.slice(0, musicBrainzLookupLimit);
  const enriched = [];
  for (let index = 0; index < limited.length; index += 1) {
    if (index > 0 && !hasCachedMusicBrainzLookup(limited[index])) await sleep(1100);
    enriched.push(await lookupMusicBrainzRecording(limited[index]));
  }
  return [...enriched, ...tracks.slice(limited.length)];
}

async function enrichWithLastFm(tracks) {
  if (!config.lastFmApiKey) return tracks;

  const limited = tracks.slice(0, lastFmLookupLimit);
  const enriched = await mapWithConcurrency(limited, metadataConcurrency, lookupLastFmTrack);
  return [...enriched, ...tracks.slice(limited.length)];
}

async function lookupGetSongBpmTrack(track) {
  if (!track.title || !track.artist) return track;

  const candidates = [
    { title: track.title, artist: track.artist },
    { title: track.artist, artist: track.title }
  ];

  for (const [index, candidate] of candidates.entries()) {
    const match = await searchGetSongBpm(candidate.title, candidate.artist);
    if (match) return mergeGetSongBpmMatch(track, { ...match, candidateIndex: index });
  }

  return track;
}

async function lookupMusicBrainzRecording(track) {
  if (!track.title || !track.artist) return track;

  const candidates = [
    { title: track.title, artist: track.artist },
    { title: track.artist, artist: track.title }
  ];

  const matches = [];
  for (const [index, candidate] of candidates.entries()) {
    const match = await searchMusicBrainzRecording(candidate.title, candidate.artist);
    if (match) matches.push({ ...match, candidateIndex: index });
  }

  const best = matches.sort((a, b) => Number(b.score) - Number(a.score) || a.candidateIndex - b.candidateIndex)[0];
  return best ? mergeMusicBrainzMatch(track, best) : track;
}

async function lookupLastFmTrack(track) {
  if (!track.title || !track.artist) return track;

  const candidates = [
    { title: track.title, artist: track.artist },
    { title: track.artist, artist: track.title }
  ];

  for (const [index, candidate] of candidates.entries()) {
    const match = await searchLastFmTrack(candidate.title, candidate.artist);
    if (match?.tags?.length) return mergeLastFmMatch(track, { ...match, candidateIndex: index });
  }

  return track;
}

async function searchMusicBrainzRecording(title, artist) {
  const cacheKey = makeLookupCacheKey(title, artist);
  if (metadataCache.musicBrainz.has(cacheKey)) return metadataCache.musicBrainz.get(cacheKey);

  const params = new URLSearchParams({
    query: `recording:"${escapeMusicBrainzQuery(title)}" AND artist:"${escapeMusicBrainzQuery(artist)}"`,
    fmt: "json",
    limit: "3"
  });

  try {
    const response = await fetch(`https://musicbrainz.org/ws/2/recording?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    const best = recordings.find((recording) => Number(recording.score) >= 80) ?? recordings[0];
    if (!best || Number(best.score) < 70) {
      metadataCache.musicBrainz.set(cacheKey, null);
      return null;
    }

    const match = {
      id: best.id,
      title: best.title || title,
      artist: getMusicBrainzArtistCredit(best) || artist,
      score: Number(best.score),
      tags: normalizeMusicBrainzTags(best.tags),
      isrcs: Array.isArray(best.isrcs) ? best.isrcs.slice(0, 4) : [],
      disambiguation: best.disambiguation || ""
    };
    metadataCache.musicBrainz.set(cacheKey, match);
    return match;
  } catch {
    return null;
  }
}

async function searchGetSongBpm(title, artist) {
  const cacheKey = makeLookupCacheKey(title, artist);
  if (metadataCache.getSongBpm.has(cacheKey)) return metadataCache.getSongBpm.get(cacheKey);

  const params = new URLSearchParams({
    api_key: config.getSongBpmApiKey,
    type: "both",
    lookup: `song:${title} artist:${artist}`,
    limit: "1"
  });

  try {
    const response = await fetch(`https://api.getsong.co/search/?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const match = Array.isArray(data.search) ? data.search[0] ?? null : null;
    const acceptedMatch = isAcceptableGetSongBpmMatch(match, title, artist) ? match : null;
    metadataCache.getSongBpm.set(cacheKey, acceptedMatch);
    return acceptedMatch;
  } catch {
    return null;
  }
}

function isAcceptableGetSongBpmMatch(match, title, artist) {
  if (!match) return false;
  const uriTitle = normalizeLookupText(extractTitleFromGetSongBpmUri(match.uri));
  const matchedTitle = normalizeLookupText(
    match.title ||
    match.song_title ||
    match.song?.title ||
    match.name ||
    extractTitleFromGetSongBpmUri(match.uri)
  );
  const requestedTitle = normalizeLookupText(title);
  const matchedArtist = normalizeLookupText(getGetSongBpmArtistName(match));
  const requestedArtist = normalizeLookupText(artist);

  const titleOk = !matchedTitle ||
    includesNormalizedPhrase(matchedTitle, requestedTitle) ||
    includesNormalizedPhrase(requestedTitle, matchedTitle) ||
    getTokenOverlapScore(matchedTitle, requestedTitle) >= 0.66;
  const uriOk = !uriTitle ||
    includesNormalizedPhrase(uriTitle, requestedTitle) ||
    includesNormalizedPhrase(requestedTitle, uriTitle) ||
    getTokenOverlapScore(uriTitle, requestedTitle) >= 0.66;
  const artistOk = !matchedArtist ||
    includesNormalizedPhrase(matchedArtist, requestedArtist) ||
    includesNormalizedPhrase(requestedArtist, matchedArtist) ||
    getTokenOverlapScore(matchedArtist, requestedArtist) >= 0.5;

  return titleOk && uriOk && artistOk;
}

function extractTitleFromGetSongBpmUri(uri = "") {
  const parts = String(uri).split("/").filter(Boolean);
  const slug = parts.at(-2) && /^song$/i.test(parts.at(-3) ?? "") ? parts.at(-2) : parts.at(-1) ?? "";
  return slug.replace(/-/g, " ");
}

function getGetSongBpmArtistName(match = {}) {
  const artist = Array.isArray(match.artist) ? match.artist[0] : match.artist;
  if (typeof artist === "string") return artist;
  return artist?.name || artist?.title || "";
}

function getTokenOverlapScore(left = "", right = "") {
  const leftTokens = new Set(String(left).split(/\s+/).filter((token) => token.length > 1));
  const rightTokens = new Set(String(right).split(/\s+/).filter((token) => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function includesNormalizedPhrase(haystack = "", needle = "") {
  if (!haystack || !needle) return false;
  if (needle.length <= 3) {
    return String(haystack).split(/\s+/).includes(needle);
  }
  return haystack.includes(needle);
}

async function searchLastFmTrack(title, artist) {
  const cacheKey = makeLookupCacheKey(title, artist);
  if (metadataCache.lastFm.has(cacheKey)) return metadataCache.lastFm.get(cacheKey);

  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: config.lastFmApiKey,
    artist,
    track: title,
    autocorrect: "1",
    format: "json"
  });

  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.track) {
      metadataCache.lastFm.set(cacheKey, null);
      return null;
    }

    const tags = normalizeLastFmTags(data.track.toptags?.tag);
    const match = {
      title: data.track.name || title,
      artist: data.track.artist?.name || artist,
      duration: Number(data.track.duration),
      listeners: Number(data.track.listeners),
      playcount: Number(data.track.playcount),
      url: data.track.url || "",
      tags
    };
    metadataCache.lastFm.set(cacheKey, match);
    return match;
  } catch {
    return null;
  }
}

function mergeMusicBrainzMatch(track, match) {
  const existingGenres = Array.isArray(track.genres) ? track.genres : [];
  const mergedGenres = Array.from(new Set([...existingGenres, ...match.tags]));
  const resolved = resolveMatchedTrackOrder(track, match);
  return {
    ...track,
    title: resolved.title,
    artist: resolved.artist,
    genres: mergedGenres,
    musicBrainz: {
      matched: true,
      id: match.id,
      canonicalTitle: match.title || "",
      canonicalArtist: match.artist || "",
      score: match.score,
      tags: match.tags,
      isrcs: match.isrcs,
      disambiguation: match.disambiguation
    }
  };
}

function mergeGetSongBpmMatch(track, match) {
  const tempo = Number(match.tempo);
  const key = match.open_key || match.key_of || "";
  const artist = Array.isArray(match.artist) ? match.artist[0] : match.artist;
  const genres = Array.isArray(artist?.genres) ? artist.genres : [];
  const resolved = resolveMatchedTrackOrder(track, match);
  return {
    ...track,
    title: resolved.title,
    artist: resolved.artist,
    meta: [Number.isFinite(tempo) ? `${tempo} BPM` : "", key].filter(Boolean).join(" / "),
    tempo: Number.isFinite(tempo) ? tempo : null,
    keyOf: match.key_of || "",
    openKey: match.open_key || "",
    danceability: Number.isFinite(Number(match.danceability)) ? Number(match.danceability) : null,
    acousticness: Number.isFinite(Number(match.acousticness)) ? Number(match.acousticness) : null,
    genres,
    getSongBpm: {
      matched: true,
      id: match.id,
      uri: match.uri || ""
    }
  };
}

function mergeLastFmMatch(track, match) {
  const existingGenres = Array.isArray(track.genres) ? track.genres : [];
  const mergedGenres = Array.from(new Set([...existingGenres, ...match.tags]));
  const resolved = resolveMatchedTrackOrder(track, match);
  return {
    ...track,
    title: resolved.title,
    artist: resolved.artist,
    genres: mergedGenres,
    durationMs: Number.isFinite(match.duration) ? match.duration : track.durationMs,
    lastFm: {
      matched: true,
      canonicalTitle: match.title || "",
      canonicalArtist: match.artist || "",
      tags: match.tags,
      listeners: Number.isFinite(match.listeners) ? match.listeners : null,
      playcount: Number.isFinite(match.playcount) ? match.playcount : null,
      url: match.url
    }
  };
}

function resolveMatchedTrackOrder(track, match = {}) {
  if (match.candidateIndex !== 1) {
    return {
      title: track.title,
      artist: track.artist
    };
  }

  return {
    title: cleanTrackPart(typeof match.title === "string" ? match.title : track.artist),
    artist: cleanTrackPart(typeof match.artist === "string" ? match.artist : track.title)
  };
}

function mergeParallelTrackEnrichment(primaryTracks, tagTracks) {
  return primaryTracks.map((primaryTrack, index) => {
    const tagTrack = tagTracks[index] ?? {};
    const primaryGenres = Array.isArray(primaryTrack.genres) ? primaryTrack.genres : [];
    const tagGenres = Array.isArray(tagTrack.genres) ? tagTrack.genres : [];
    const genres = Array.from(new Set([...primaryGenres, ...tagGenres]));
    const shouldUseTagOrder = tagTrack.lastFm?.matched && !primaryTrack.getSongBpm?.matched && !primaryTrack.musicBrainz?.matched;
    return {
      ...tagTrack,
      ...primaryTrack,
      title: shouldUseTagOrder ? tagTrack.title : primaryTrack.title,
      artist: shouldUseTagOrder ? tagTrack.artist : primaryTrack.artist,
      genres,
      durationMs: primaryTrack.durationMs ?? tagTrack.durationMs,
      lastFm: tagTrack.lastFm,
      musicBrainz: primaryTrack.musicBrainz ?? tagTrack.musicBrainz
    };
  });
}

function normalizeLastFmTags(tags) {
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  return tagList
    .map((tag) => String(tag.name ?? "").trim())
    .filter(Boolean)
    .filter((tag) => !/seen live|favorites?|under 2000 listeners/i.test(tag))
    .slice(0, 8);
}

function normalizeMusicBrainzTags(tags) {
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  return tagList
    .map((tag) => String(tag.name ?? "").trim())
    .filter(Boolean)
    .filter((tag) => !/seen live|favorites?|fixme/i.test(tag))
    .slice(0, 8);
}

function getMusicBrainzArtistCredit(recording) {
  return (recording["artist-credit"] ?? [])
    .map((credit) => `${credit.name ?? credit.artist?.name ?? ""}${credit.joinphrase ?? ""}`)
    .join("")
    .trim();
}

function escapeMusicBrainzQuery(value = "") {
  return String(value).replace(/["\\]/g, " ");
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function makeLookupCacheKey(title = "", artist = "") {
  return `${normalizeLookupText(title)}::${normalizeLookupText(artist)}`;
}

function hasCachedMusicBrainzLookup(track) {
  if (!track.title || !track.artist) return true;
  return [
    makeLookupCacheKey(track.title, track.artist),
    makeLookupCacheKey(track.artist, track.title)
  ].some((key) => metadataCache.musicBrainz.has(key));
}

function normalizeLookupText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeTrackEnrichment(getSongBpmMatches, lastFmMatches, musicBrainzMatches = 0) {
  const sources = [];
  if (musicBrainzMatches) sources.push("musicbrainz");
  if (getSongBpmMatches) sources.push("getsongbpm");
  if (lastFmMatches) sources.push("lastfm");
  return sources.length ? sources.join("+") : "heuristic";
}

function addTrackGenreProfiles(tracks, preferredGenre = "") {
  const normalizedPreferredGenre = normalizePreferredGenre(preferredGenre);
  return tracks.map((track) => {
    const genreProfile = inferTrackGenreProfile(track, normalizedPreferredGenre);
    const existingGenres = Array.isArray(track.genres) ? track.genres : [];
    const genres = existingGenres.length
      ? Array.from(new Set([genreProfile.genre, ...existingGenres].filter(Boolean)))
      : [genreProfile.genre].filter(Boolean);

    return {
      ...track,
      genres,
      genreProfile
    };
  });
}

function inferTrackGenreProfile(track, preferredGenre = "") {
  const rawGenres = Array.isArray(track.genres) ? track.genres.filter(Boolean) : [];
  const mappedGenres = rawGenres.map((genre) => mapExternalGenre(genre, preferredGenre));
  const specificMappedGenre = mappedGenres.find((genre, index) => !isGenericGenreTag(rawGenres[index]) && genre);
  if (specificMappedGenre) {
    return {
      genre: specificMappedGenre,
      confidence: "confirmed",
      source: getGenreSourceLabel(track),
      reason: "Specific metadata tag"
    };
  }

  const inferred = inferGenreFromTrack(track, preferredGenre);
  if (rawGenres.length) {
    return {
      genre: inferred,
      confidence: preferredGenre && inferred === preferredGenre ? "weak" : "estimated",
      source: getGenreSourceLabel(track),
      reason: "Generic metadata tag plus local style estimate"
    };
  }

  return {
    genre: inferred,
    confidence: preferredGenre && inferred === preferredGenre ? "weak" : "estimated",
    source: "local-estimate",
    reason: preferredGenre && inferred === preferredGenre
      ? "No API genre; using selected main genre and track clues"
      : "No API genre; estimated from artist/title/reference clues"
  };
}

function isGenericGenreTag(genre = "") {
  const value = String(genre).toLowerCase().trim();
  return [
    "electronic",
    "electronica",
    "dance",
    "club",
    "edm",
    "pop",
    "rock",
    "world",
    "folk"
  ].includes(value);
}

function getGenreSourceLabel(track) {
  if (track.lastFm?.matched) return "lastfm";
  if (track.getSongBpm?.matched) return "getsongbpm";
  if (track.musicBrainz?.matched) return "musicbrainz";
  return "local-estimate";
}

function buildTextTrackProfile(tracks, requestedVibe = "Sunset", matchedCount = 0, lastFmMatchedCount = 0, musicBrainzMatchedCount = 0, preferredGenre = "") {
  const normalizedPreferredGenre = normalizePreferredGenre(preferredGenre);
  const genreCounts = new Map();
  for (const track of tracks) {
    const sourceGenres = track.genreProfile?.genre
      ? [track.genreProfile.genre]
      : Array.isArray(track.genres) && track.genres.length ? track.genres : [inferGenreFromTrack(track, normalizedPreferredGenre)];
    for (const genre of sourceGenres.slice(0, 3)) {
      const mapped = mapExternalGenre(genre, normalizedPreferredGenre);
      genreCounts.set(mapped, (genreCounts.get(mapped) ?? 0) + 1);
    }
  }

  const total = Array.from(genreCounts.values()).reduce((sum, value) => sum + value, 0) || 1;
  let genres = Array.from(genreCounts.entries())
    .map(([genre, count]) => [genre, Math.max(4, Math.round((count / total) * 100))])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const fallbackGenres = [
    normalizedPreferredGenre,
    "House",
    "Melodic house",
    "Deep house",
    "Progressive house",
    "Nu soul",
    "Lo-fi"
  ].filter(Boolean);
  for (const fallbackGenre of fallbackGenres) {
    if (genres.length >= 4) break;
    if (!genres.some(([genre]) => genre === fallbackGenre)) genres.push([fallbackGenre, 8]);
  }
  genres = normalizeGenrePercentages(genres);

  const base = makeFallbackProfile(requestedVibe);
  const recommendedGenre = genres[0][0];
  const bpms = tracks.map((track) => Number(track.tempo)).filter(Number.isFinite);
  const bpmRange = bpms.length >= 2 ? `${Math.min(...bpms)}-${Math.max(...bpms)}` : base.bpmRange;
  const dataSourceLabel = describeHumanDataSources(matchedCount, lastFmMatchedCount, musicBrainzMatchedCount);
  const referenceMatch = matchReferenceSets({
    requestedVibe,
    recommendedGenre,
    genres,
    tracks
  });
  const referenceText = describeReferenceMatch(referenceMatch);
  return {
    ...base,
    recommendedGenre,
    bpmRange: referenceMatch?.pattern?.bpmRange ?? bpmRange,
    genres,
    trackCount: tracks.length,
    referenceMatch,
    reason: {
      en: dataSourceLabel.en
        ? `Mixory used ${dataSourceLabel.en} and found ${recommendedGenre} as the strongest cluster.${referenceText.en} Unmatched tracks still use local estimates.`
        : `Mixory found ${tracks.length} pasted tracks and estimated ${recommendedGenre} as the strongest cluster.${referenceText.en} Add metadata APIs to improve BPM, key, and genre coverage.`,
      zh: dataSourceLabel.zh
        ? `Mixory 已使用 ${dataSourceLabel.zh}，并判断 ${recommendedGenre} 是最强曲风群。${referenceText.zh} 未匹配曲目继续使用本地估算。`
        : `Mixory 从粘贴内容里识别到 ${tracks.length} 首曲目，并初步判断 ${recommendedGenre} 是最强曲风群。${referenceText.zh} 接入 metadata API 后可提升 BPM、调性和曲风覆盖率。`
    }
  };
}

function matchReferenceSets({ requestedVibe, recommendedGenre, genres, tracks }) {
  if (!referenceLibrary.sets.length) return null;

  const genreWeights = new Map(genres.map(([genre, value]) => [normalizeTag(genre), Number(value) || 0]));
  const requestedVibeTag = normalizeTag(requestedVibe);
  const recommendedGenreTag = normalizeTag(recommendedGenre);
  const inferredTrackTags = tracks.flatMap((track) => [track.artist, track.title, ...(track.genres ?? [])]).map(normalizeTag);

  const scored = referenceLibrary.sets
    .map((set) => {
      const setGenres = (set.genres ?? []).map(normalizeTag);
      const setVibes = (set.vibes ?? []).map(normalizeTag);
      let score = 0;

      for (const genre of setGenres) {
        score += getGenreAffinity(recommendedGenreTag, genre) * 34;
        for (const [inputGenre, weight] of genreWeights) {
          score += getGenreAffinity(inputGenre, genre) * Math.min(20, weight / 3);
        }
      }

      for (const vibe of setVibes) {
        score += getVibeAffinity(requestedVibeTag, vibe) * 28;
      }

      const djName = normalizeTag(set.dj);
      if (djName && inferredTrackTags.some((tag) => tag.includes(djName) || djName.includes(tag))) score += 14;
      if (set.sourceType === "user-curated") score += 4;

      return {
        set,
        score: Math.round(score)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) return null;

  const primary = scored[0].set;
  const pattern = buildReferencePattern(primary, requestedVibe, recommendedGenre);
  return {
    primary: serializeReferenceSet(primary, scored[0].score),
    alternatives: scored.slice(1).map((item) => serializeReferenceSet(item.set, item.score)),
    pattern
  };
}

function serializeReferenceSet(set, score) {
  return {
    id: set.id,
    name: set.name,
    dj: set.dj,
    genres: set.genres ?? [],
    vibes: set.vibes ?? [],
    score,
    trackCount: set.stats?.trackCount ?? set.tracks?.length ?? 0,
    layeredElements: set.stats?.layeredElements ?? 0,
    idTracks: set.stats?.idTracks ?? 0
  };
}

function buildReferencePattern(set, requestedVibe, recommendedGenre) {
  const tags = [...(set.genres ?? []), ...(set.vibes ?? []), requestedVibe, recommendedGenre].map(normalizeTag);
  const has = (...needles) => needles.some((needle) => tags.some((tag) => tag.includes(needle)));
  const density = getTransitionDensity(set);
  let basePattern;

  if (has("dubstep", "bass", "mainstage", "festival", "future rave")) {
    basePattern = {
      flow: "festival-burst",
      energyCurve: [54, 72, 90, 96, 84, 92, 76],
      bpmRange: has("dubstep", "bass") ? "126-150" : "124-138",
      transitionDensity: density,
      transitionStyle: "quick drops, mashup peaks, short cooldowns"
    };
    return applyLearnedReferencePattern(basePattern, set);
  }

  if (has("uk garage", "garage", "2 step", "2-step")) {
    basePattern = {
      flow: "uk-garage-bounce",
      energyCurve: [34, 48, 62, 74, 80, 70, 54],
      bpmRange: "124-138",
      transitionDensity: density,
      transitionStyle: "2-step bounce, vocal chops, shuffle-driven lift"
    };
    return applyLearnedReferencePattern(basePattern, set);
  }

  if (has("melodic", "progressive", "sunrise", "sunset", "rooftop", "emotional")) {
    basePattern = {
      flow: "slow-rise-melodic",
      energyCurve: [28, 38, 50, 64, 78, 72, 58],
      bpmRange: "96-124",
      transitionDensity: density,
      transitionStyle: "long blends, harmonic lifts, controlled peak"
    };
    return applyLearnedReferencePattern(basePattern, set);
  }

  if (has("afro", "deep", "spiritual", "after party", "dark club")) {
    basePattern = {
      flow: "deep-layered-groove",
      energyCurve: [40, 52, 62, 74, 82, 76, 64],
      bpmRange: "112-128",
      transitionDensity: density,
      transitionStyle: "percussion layers, vocal teases, late-night pressure"
    };
    return applyLearnedReferencePattern(basePattern, set);
  }

  if (has("lo fi", "lo-fi", "jazz hop", "nu soul", "morning", "coffee", "working", "chill")) {
    basePattern = {
      flow: "low-pressure-groove",
      energyCurve: [16, 24, 34, 42, 36, 28, 20],
      bpmRange: "74-104",
      transitionDensity: density,
      transitionStyle: "soft fades, warm drums, minimal peaks"
    };
    return applyLearnedReferencePattern(basePattern, set);
  }

  basePattern = {
    flow: "club-groove-rise",
    energyCurve: [36, 50, 64, 78, 86, 78, 60],
    bpmRange: "110-128",
    transitionDensity: density,
    transitionStyle: "groove-first blends, hook teases, peak-time lift"
  };
  return applyLearnedReferencePattern(basePattern, set);
}

function applyLearnedReferencePattern(pattern, set) {
  const learnedCurve = Array.isArray(set.learning?.energyCurve) ? set.learning.energyCurve : [];
  const confidence = set.learning?.confidence ?? "low";
  const weight = confidence === "high" ? 0.35 : confidence === "medium" ? 0.25 : 0.15;
  const energyCurve = blendEnergyCurves(pattern.energyCurve, learnedCurve, weight);
  const hints = Array.isArray(set.learning?.transitionHints) ? set.learning.transitionHints.slice(0, 2) : [];
  return {
    ...pattern,
    smoothPriority: {
      tempo: 0.34,
      genreTexture: 0.23,
      energyCurve: 0.22,
      camelotKey: 0.16,
      referencePattern: 0.05
    },
    harmonicRule: "Camelot-compatible keys are a soft bonus, not a hard requirement. Tempo, genre texture, and energy continuity stay higher priority for AutoMix / Mix playback.",
    energyCurve,
    learnedWeight: weight,
    learnedFrom: set.id,
    transitionStyle: hints.length
      ? `${pattern.transitionStyle}; smooth-first harmonic support; learned hints: ${hints.join(", ")}`
      : `${pattern.transitionStyle}; smooth-first harmonic support`
  };
}

function blendEnergyCurves(baseCurve = [], learnedCurve = [], learnedWeight = 0.25) {
  if (!baseCurve.length || !learnedCurve.length) return baseCurve;
  return baseCurve.map((value, index) => {
    const learned = sampleCurveAt(learnedCurve, baseCurve.length, index);
    return Math.round(value * (1 - learnedWeight) + learned * learnedWeight);
  });
}

function sampleCurveAt(curve, targetLength, index) {
  if (curve.length === targetLength) return Number(curve[index]) || 50;
  const position = targetLength <= 1 ? 0 : index / (targetLength - 1);
  const scaled = position * (curve.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(curve.length - 1, left + 1);
  const progress = scaled - left;
  const leftValue = Number(curve[left]) || 50;
  const rightValue = Number(curve[right]) || leftValue;
  return leftValue + (rightValue - leftValue) * progress;
}

function getTransitionDensity(set) {
  const tracks = set.stats?.trackCount ?? set.tracks?.length ?? 0;
  const layers = set.stats?.layeredElements ?? 0;
  if (!tracks) return "medium";
  const ratio = layers / tracks;
  if (ratio > 0.45) return "high";
  if (ratio > 0.15) return "medium";
  return "low";
}

function describeReferenceMatch(referenceMatch) {
  if (!referenceMatch?.primary) return { en: "", zh: "" };
  const primary = referenceMatch.primary;
  const alternatives = referenceMatch.alternatives ?? [];
  const primaryArtist = primary.dj || "local reference artist";
  const altText = alternatives.length
    ? `, with ${alternatives.map((set) => set.dj).join(" / ")} as supporting reference patterns`
    : "";
  const altZh = alternatives.length
    ? `，并把 ${alternatives.map((set) => set.dj).join(" / ")} 作为辅助参考 pattern`
    : "";
  return {
    en: ` It is closest to ${primaryArtist}'s DJ flow${altText}, so the set uses a ${referenceMatch.pattern.flow} structure.`,
    zh: ` 最适合参考 ${primaryArtist} 的 DJ flow${altZh}，因此会使用「${getFlowLabelZh(referenceMatch.pattern.flow)}」的 set 结构。`
  };
}

function getFlowLabelZh(flow = "") {
  const labels = {
    "festival-burst": "festival 爆发型",
    "slow-rise-melodic": "旋律慢升型",
    "deep-layered-groove": "深层叠加 groove",
    "low-pressure-groove": "低压力 groove",
    "club-groove-rise": "club groove 升温型",
    "uk-garage-bounce": "UK garage 弹跳律动型"
  };
  return labels[flow] ?? flow;
}

function getGenreAffinity(inputGenre, setGenre) {
  if (!inputGenre || !setGenre) return 0;
  if (inputGenre === setGenre) return 1;
  const genericGenres = new Set(["house", "bass", "dance", "edm"]);
  if (!genericGenres.has(inputGenre) && !genericGenres.has(setGenre) && (inputGenre.includes(setGenre) || setGenre.includes(inputGenre))) return 0.9;
  const groups = [
    ["house", "tech house", "deep house", "jackin house", "funky house", "future house", "disco house", "groovy house"],
    ["indie dance", "nu disco", "disco", "funky house", "disco house"],
    ["melodic techno", "melodic house", "progressive house"],
    ["mainstage", "big room", "future rave", "trance", "edm"],
    ["uk garage", "garage", "2 step", "2-step"],
    ["dubstep", "bass house", "bass", "melodic bass", "drum and bass"],
    ["lo fi", "lo-fi", "jazz hop", "jazzy hip hop", "nu soul", "hip hop"],
    ["afro house", "deep house", "organic house"]
  ];
  return groups.some((group) => group.some((tag) => inputGenre.includes(tag)) && group.some((tag) => setGenre.includes(tag))) ? 0.65 : 0;
}

function getVibeAffinity(inputVibe, setVibe) {
  if (!inputVibe || !setVibe) return 0;
  if (inputVibe === setVibe || inputVibe.includes(setVibe) || setVibe.includes(inputVibe)) return 1;
  const groups = [
    ["sunset", "sunrise", "rooftop", "outdoor", "drive", "road trip"],
    ["friday night", "party", "club", "peak time", "pre game", "festival"],
    ["after party", "deep", "dark club", "late night"],
    ["morning coffee", "morning", "chill", "working", "deep focus"],
    ["workout", "high energy", "heavy", "festival"]
  ];
  return groups.some((group) => group.some((tag) => inputVibe.includes(tag)) && group.some((tag) => setVibe.includes(tag))) ? 0.7 : 0;
}

function normalizeTag(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+&/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function describeHumanDataSources(getSongBpmMatches, lastFmMatches, musicBrainzMatches = 0) {
  const en = [];
  const zh = [];
  if (musicBrainzMatches) {
    en.push(`MusicBrainz identity matching on ${musicBrainzMatches} tracks`);
    zh.push(`MusicBrainz 校准 ${musicBrainzMatches} 首的歌名/艺人`);
  }
  if (getSongBpmMatches) {
    en.push(`GetSongBPM for BPM/key on ${getSongBpmMatches} tracks`);
    zh.push(`GetSongBPM 匹配 ${getSongBpmMatches} 首的 BPM/调性`);
  }
  if (lastFmMatches) {
    en.push(`Last.fm tags on ${lastFmMatches} tracks`);
    zh.push(`Last.fm 标签匹配 ${lastFmMatches} 首`);
  }
  return {
    en: en.join(" plus "),
    zh: zh.join(" + ")
  };
}

function normalizeGenrePercentages(genres) {
  const total = genres.reduce((sum, [, value]) => sum + value, 0) || 1;
  let normalized = genres.map(([genre, value]) => [genre, Math.max(4, Math.round((value / total) * 100))]);
  const drift = normalized.reduce((sum, [, value]) => sum + value, 0) - 100;
  if (normalized.length && drift !== 0) {
    const [genre, value] = normalized[0];
    normalized[0] = [genre, Math.max(4, value - drift)];
  }
  return normalized;
}

function normalizePreferredGenre(genre = "") {
  const supportedGenres = new Set([
    "House",
    "Deep house",
    "Melodic house",
    "Bass house",
    "Disco",
    "Trance",
    "Techno",
    "Progressive house",
    "Melodic techno",
    "Dubstep",
    "UK garage",
    "Mainstage / Big room",
    "Lo-fi",
    "Nu soul",
    "Indie dance",
    "Afro house",
    "Drum and bass"
  ]);
  return supportedGenres.has(genre) ? genre : "";
}

function mapExternalGenre(genre = "", preferredGenre = "") {
  const value = String(genre).toLowerCase();
  if (value.includes("big room") || value.includes("mainstage") || value.includes("festival") || value.includes("future rave")) return "Mainstage / Big room";
  if (value.includes("uk garage") || value.includes("2-step") || value.includes("2 step") || /\bgarage\b/.test(value)) return "UK garage";
  if (value.includes("dubstep") || value.includes("melodic bass")) return "Dubstep";
  if (value.includes("bass house")) return "Bass house";
  if (value.includes("disco") || value.includes("nu-disco") || value.includes("funk house") || value.includes("funky house")) return "Disco";
  if (value.includes("deep house")) return "Deep house";
  if (value.includes("melodic house")) return "Melodic house";
  if (value.includes("progressive")) return "Progressive house";
  if (value.includes("melodic techno")) return "Melodic techno";
  if (value.includes("techno")) return "Techno";
  if (value.includes("trance")) return "Trance";
  if (value.includes("drum") || value.includes("dnb")) return "Drum and bass";
  if (value.includes("afro")) return "Afro house";
  if (value.includes("soul") || value.includes("r&b") || value.includes("rnb") || value.includes("neo soul")) return "Nu soul";
  if (value.includes("lo-fi") || value.includes("lofi") || value.includes("chill") || value.includes("ambient") || value.includes("downtempo")) return "Lo-fi";
  if (value.includes("indie") || value.includes("electropop") || value.includes("synthpop")) return "Indie dance";
  if (value.includes("dance-pop") || value === "electronic" || value.includes("electronica") || value === "pop") return preferredGenre || "House";
  if (value.includes("house") || value.includes("dance") || value.includes("club") || value.includes("edm")) return "House";
  if (value.includes("hip hop") || value.includes("rap")) return "Nu soul";
  return inferGenreFromTrack({ artist: genre, title: "" }, preferredGenre);
}

function inferGenreFromTrack(track, preferredGenre = "") {
  const text = `${track.artist} ${track.title}`.toLowerCase();
  const rules = [
    ["Mainstage / Big room", ["mainstage", "big room", "martin garrix", "david guetta", "tiesto", "tremor", "animals"]],
    ["UK garage", ["uk garage", "2-step", "2 step", "garage", "fred again", "sammy virji", "interplanetary criminal", "joy anonymous", "ts7"]],
    ["Dubstep", ["dubstep", "skrillex", "illenium", "slander", "excision", "subtronics", "wooli", "ray volpe", "space laces"]],
    ["Bass house", ["bass house", "malaa", "tchami", "habstrakt", "dj snake", "joyryde", "knock2"]],
    ["Disco", ["disco", "nu-disco", "nu disco", "funky house", "funk house", "purple disco machine", "dimitri from paris", "folamour", "cerrone", "chic"]],
    ["Drum and bass", ["drum and bass", "dnb", "breakbeat", "jungle", "sub focus", "chase", "status"]],
    ["Melodic house", ["melodic house", "shingo", "lane 8", "sultan", "shepard", "jerro", "embrz", "ben bohmer", "ben böhmer", "anjunadeep"]],
    ["Melodic techno", ["melodic techno", "tale of us", "anyma", "artbat", "afterlife", "kevin de vries", "argy"]],
    ["Progressive house", ["progressive", "ben bohmer", "lane 8", "yotto", "marsh", "anjunadeep", "deadmau5"]],
    ["Deep house", ["deep house", "black coffee", "moodymann", "kerri chandler", "deep in your soul"]],
    ["Afro house", ["afro", "keinemusik", "adam port", "rampa", "black coffee", "mochakk", "mojo", "moblack"]],
    ["Trance", ["trance", "anjuna", "above & beyond", "armin", "tiesto", "ferry corsten"]],
    ["Techno", ["techno", "charlotte", "amelie", "kobosil", "warehouse", "acid", "detroit"]],
    ["Nu soul", ["soul", "r&b", "sza", "erykah", "d'angelo", "anderson", "cleo sol", "jill scott"]],
    ["Lo-fi", ["lofi", "lo-fi", "chillhop", "nujabes", "jinsang", "potsu", "bsd.u"]],
    ["Indie dance", ["indie", "bicep", "caribou", "bonobo", "jungle", "sg lewis", "tame impala"]],
    ["House", ["house", "disclosure", "fred again", "peggy gou", "fisher", "diplo", "kaytranada", "gorgon"]]
  ];

  for (const [genre, keywords] of rules) {
    if (keywords.some((keyword) => text.includes(keyword))) return genre;
  }

  if (preferredGenre && /electronic|club|dance|mix|edit|extended|dub|remix|original/i.test(text)) return preferredGenre;
  return /club|dance|mix|edit|extended|dub/i.test(text) ? "House" : (preferredGenre || "House");
}

function buildPlaylistProfile(tracks, artists, requestedVibe = "Sunset", songstats = null) {
  const genreCounts = new Map();
  for (const track of tracks) {
    for (const artist of track.artists ?? []) {
      const fullArtist = artists.get(artist.id);
      for (const genre of fullArtist?.genres ?? []) {
        const mapped = mapSpotifyGenre(genre);
        genreCounts.set(mapped, (genreCounts.get(mapped) ?? 0) + 1);
      }
    }
  }

  const total = Array.from(genreCounts.values()).reduce((sum, value) => sum + value, 0) || 1;
  const genres = Array.from(genreCounts.entries())
    .map(([genre, count]) => [genre, Math.max(4, Math.round((count / total) * 100))])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (!genres.length) {
    genres.push(["House", 32], ["Indie dance", 24], ["Nu soul", 16], ["Lo-fi", 12]);
  }

  const recommendedGenre = genres[0][0];
  const base = makeFallbackProfile(requestedVibe);
  return {
    ...base,
    recommendedGenre,
    genres,
    reason: {
      en: `${songstats ? "Spotify plus Songstats-ready metadata" : "Spotify metadata"} suggests ${recommendedGenre} is the strongest cluster, so Mixory builds a ${base.recommendedLength}-minute direction around that majority.`,
      zh: `${songstats ? "Spotify + Songstats-ready metadata" : "Spotify metadata"} 显示 ${recommendedGenre} 是这张歌单里最强的曲风群，所以 Mixory 会围绕这个多数派生成 ${base.recommendedLength} 分钟方向。`
    }
  };
}

function mapSpotifyGenre(genre) {
  const value = genre.toLowerCase();
  if (value.includes("big room") || value.includes("mainstage") || value.includes("future rave")) return "Mainstage / Big room";
  if (value.includes("uk garage") || value.includes("2-step") || value.includes("2 step") || /\bgarage\b/.test(value)) return "UK garage";
  if (value.includes("dubstep") || value.includes("melodic bass")) return "Dubstep";
  if (value.includes("bass house")) return "Bass house";
  if (value.includes("disco") || value.includes("nu-disco") || value.includes("funk house") || value.includes("funky house")) return "Disco";
  if (value.includes("deep house")) return "Deep house";
  if (value.includes("melodic house")) return "Melodic house";
  if (value.includes("progressive")) return "Progressive house";
  if (value.includes("melodic techno")) return "Melodic techno";
  if (value.includes("techno")) return "Techno";
  if (value.includes("trance")) return "Trance";
  if (value.includes("drum and bass") || value.includes("dnb")) return "Drum and bass";
  if (value.includes("afro")) return "Afro house";
  if (value.includes("soul") || value.includes("r&b")) return "Nu soul";
  if (value.includes("lo-fi") || value.includes("chillhop")) return "Lo-fi";
  if (value.includes("indie")) return "Indie dance";
  if (value === "electronic" || value.includes("electronica") || value.includes("dance-pop") || value === "pop") return "House";
  if (value.includes("house") || value.includes("dance")) return "House";
  return "Indie dance";
}

function makeFallbackProfile(vibe = "Sunset") {
  const fallback = {
    Sunset: ["Melodic techno", 60, "96-124", "Warm, melodic, low-pressure"],
    "Morning coffee": ["Nu soul", 45, "78-102", "Soft, acoustic, lightly groovy"],
    "After party": ["House", 90, "112-128", "Loose, deep, late-night"],
    Chill: ["Lo-fi", 45, "82-104", "Calm, spacious, gentle"],
    Working: ["Progressive house", 60, "94-114", "Steady, clean, low-distraction"],
    Workout: ["Drum and bass", 60, "124-138", "High-energy, punchy, motivating"],
    "Road trip": ["Indie dance", 90, "96-122", "Open-road, melodic, rolling"],
    "Friday night": ["House", 60, "104-124", "Bright, social, dance-ready"],
    "Pre-game": ["House", 45, "110-126", "Bright, familiar, quick lift"],
    "Deep focus": ["Lo-fi", 90, "88-108", "Minimal, focused, consistent"]
  };
  const [recommendedGenre, recommendedLength, bpmRange, mood] = fallback[vibe] ?? fallback.Sunset;
  return {
    recommendedGenre,
    recommendedLength,
    bpmRange,
    mood,
    genres: [[recommendedGenre, 34], ["Progressive house", 24], ["Indie dance", 16], ["Nu soul", 10]],
    reason: {
      en: "Demo fallback: connect Spotify to replace this with real playlist metadata.",
      zh: "Demo fallback：连接 Spotify 后会用真实歌单 metadata 替换这里的分析。"
    }
  };
}

function parsePlaylistId(value = "") {
  const match = value.match(/playlist\/([A-Za-z0-9]+)/) ?? value.match(/[?&]list=([A-Za-z0-9]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{20,}$/.test(value.trim())) return value.trim();
  return "";
}

function collectArtistIds(tracks) {
  return Array.from(
    new Set(
      tracks.flatMap((track) => (track.artists ?? []).map((artist) => artist.id).filter(Boolean))
    )
  );
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      throw new Error("Request body is too large. Please upload or paste fewer tracks at a time.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, payload, status = 200) {
  addCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function addCorsHeaders(reqOrRes, resMaybe) {
  const req = resMaybe ? reqOrRes : null;
  const res = resMaybe || reqOrRes;
  const origin = req?.headers?.origin;
  const allowedOrigins = new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://hotpotbubblet.github.io"
  ]);
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.has(origin) ? origin : "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
