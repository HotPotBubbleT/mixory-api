import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const rootDir = resolve(".");
const publicDir = join(rootDir, "outputs");
const maxRequestBytes = 512 * 1024;
const maxRawTextChars = 240_000;
const maxTrackLines = 300;
const appUserAgent = "Mixory/0.1 (https://mixoryflow.com)";
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

    if (url.pathname === "/api/flow/generate" && req.method === "POST") {
      return await handleFlowGenerate(req, res);
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
  const profile = buildTextTrackProfile(profiledTracks, body.vibe, matchedCount, lastFmMatchedCount, musicBrainzMatchedCount, body.genre, body.dj);
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

  const lines = normalizePlaylistText(rawText)
    .slice(0, maxRawTextChars)
    .split(/\r\n|\n|\r/)
    .slice(0, maxTrackLines)
    .map((line) => normalizeTrackLine(line))
    .filter(Boolean);
  const dominantOrder = detectDominantTrackOrder(lines);

  return lines
    .map((line) => parseTrackLine(line, dominantOrder))
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
      raw: `${record[titleIndex] ?? ""} - ${record[artistIndex] ?? ""}`,
      source: "structured-playlist"
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

function parseTrackLine(line, dominantOrder = "auto") {
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
    }, dominantOrder);
  }

  const csvParts = splitCsvLine(line);
  if (csvParts.length >= 2) {
    return normalizeTrackOrder({
      left: csvParts[0],
      right: csvParts[1],
      raw: line
    }, dominantOrder);
  }

  return cleanTrack({
    title: line,
    artist: "",
    raw: line
  });
}

function detectDominantTrackOrder(lines = []) {
  const votes = lines.reduce((counts, line) => {
    const parts = getTrackOrderParts(line);
    if (!parts) return counts;
    const confidence = getTrackOrderConfidence(parts.left, parts.right);
    if (confidence === "artist-title") counts.artistTitle += 1;
    if (confidence === "title-artist") counts.titleArtist += 1;
    return counts;
  }, { artistTitle: 0, titleArtist: 0 });
  const total = votes.artistTitle + votes.titleArtist;
  if (total < 2) return "auto";

  const winningCount = Math.max(votes.artistTitle, votes.titleArtist);
  const losingCount = Math.min(votes.artistTitle, votes.titleArtist);
  const hasClearMajority = winningCount >= total * 0.6 || winningCount - losingCount >= 2;
  if (!hasClearMajority) return "auto";

  return votes.artistTitle > votes.titleArtist ? "artist-title" : "title-artist";
}

function getTrackOrderParts(line) {
  if (/^(.+?)\s+by\s+(.+)$/i.test(line)) return null;

  const separatorMatch = line.match(/^(.+?)\s*(?:[-–—|/:]|\t)\s*(.+)$/);
  if (separatorMatch) {
    return {
      left: separatorMatch[1],
      right: separatorMatch[2]
    };
  }

  const csvParts = splitCsvLine(line);
  if (csvParts.length >= 2) {
    return {
      left: csvParts[0],
      right: csvParts[1]
    };
  }

  return null;
}

function getTrackOrderConfidence(leftValue, rightValue) {
  const left = cleanTrackPart(leftValue);
  const right = cleanTrackPart(rightValue);
  const leftAsArtist = scoreArtistLike(left) + scoreTitleLike(right);
  const rightAsArtist = scoreArtistLike(right) + scoreTitleLike(left);
  const leftAsTitlePenalty = scoreArtistLike(left) > 3 ? -3 : 0;
  const rightAsTitlePenalty = scoreArtistLike(right) > 3 ? -3 : 0;
  const normalScore = leftAsArtist + rightAsTitlePenalty;
  const swappedScore = rightAsArtist + leftAsTitlePenalty;

  if (normalScore > swappedScore + 1) return "artist-title";
  if (swappedScore > normalScore + 1) return "title-artist";
  return "unknown";
}

function normalizeTrackOrder(track, dominantOrder = "auto") {
  const left = cleanTrackPart(track.left);
  const right = cleanTrackPart(track.right);
  const confidence = getTrackOrderConfidence(left, right);

  if (confidence === "title-artist" || (confidence === "unknown" && dominantOrder === "title-artist")) {
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
    "sultan shepard", "sultan shepherd", "sultan + shepard", "sultan + shepherd", "sultan & shepard", "sultan & shepherd",
    "jerro", "le youth", "marsh", "embrz", "kx5", "rufus du sol", "rüfüs du sol", "rufus du sol", "tinlicker",
    "nora en pure", "jan blomqvist", "bob moses", "ben bohmer", "ben böhmer", "luttrell", "eli & fur",
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
    source: track.source || "",
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
  if (track.source === "structured-playlist") {
    return {
      title: track.title,
      artist: track.artist
    };
  }

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

function buildTextTrackProfile(tracks, requestedVibe = "Sunset", matchedCount = 0, lastFmMatchedCount = 0, musicBrainzMatchedCount = 0, preferredGenre = "", djReference = "") {
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
    tracks,
    djReference
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

function matchReferenceSets({ requestedVibe, recommendedGenre, genres, tracks, djReference = "" }) {
  if (!referenceLibrary.sets.length) return null;

  const genreWeights = new Map(genres.map(([genre, value]) => [normalizeTag(genre), Number(value) || 0]));
  const requestedVibeTag = normalizeTag(requestedVibe);
  const recommendedGenreTag = normalizeTag(recommendedGenre);
  const inferredTrackTags = tracks.flatMap((track) => [track.artist, track.title, ...(track.genres ?? [])]).map(normalizeTag);
  const djReferenceTags = normalizeDjReferenceTags(djReference);

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
      if (djName && djReferenceTags.some((tag) => tag.includes(djName) || djName.includes(tag))) score += 10;
      for (const tag of djReferenceTags) {
        for (const genre of setGenres) score += getGenreAffinity(tag, genre) * 4;
        for (const vibe of setVibes) score += getVibeAffinity(tag, vibe) * 3;
      }
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

function normalizeDjReferenceTags(value = "") {
  const base = normalizeTag(value);
  if (!base) return [];
  const tags = new Set(
    base
      .split(/[,;/]+|\band\b|\+|&/)
      .map(normalizeTag)
      .filter((tag) => tag.length >= 3)
  );
  const profileTags = [
    {
      refs: ["lane 8", "sultan", "shepard", "shepherd", "ben bohmer", "ben bo hmer", "yotto", "marsh", "jerro", "le youth", "anjunadeep"],
      tags: ["melodic house", "progressive house", "deep house", "sunset", "melodic"]
    },
    {
      refs: ["keinemusik", "black coffee", "rampa", "adam port", "mochakk"],
      tags: ["afro house", "organic house", "deep house", "sunset", "groove"]
    },
    {
      refs: ["fred again", "peggy gou", "four tet", "bicep", "bonobo"],
      tags: ["indie dance", "house", "uk garage", "warm", "club"]
    }
  ];
  for (const profile of profileTags) {
    if (profile.refs.some((ref) => base.includes(ref))) {
      profile.tags.forEach((tag) => tags.add(tag));
    }
  }
  return Array.from(tags);
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

async function handleFlowGenerate(req, res) {
  const body = await readJson(req);
  const data = normalizeFlowRequestData(body.data ?? body);
  const tracks = Array.isArray(body.tracks)
    ? body.tracks.slice(0, maxTrackLines).map((track, index) => normalizeFlowTrack(track, data, index)).filter((track) => track.title)
    : [];

  if (tracks.length < 2) {
    return sendJson(res, {
      error: "At least two tracks are required to generate a flow."
    }, 400);
  }

  const requestedProfile = body.profile && typeof body.profile === "object" ? body.profile : null;
  const profile = requestedProfile ?? buildTextTrackProfile(tracks, data.vibe, 0, 0, 0, data.genre, data.dj);
  const desiredTracks = Math.min(getFlowDesiredTrackCount(data.length), tracks.length);
  const referencePattern = profile.referenceMatch?.pattern ?? matchReferenceSets({
    requestedVibe: data.vibe,
    recommendedGenre: profile.recommendedGenre ?? data.genre,
    genres: profile.genres ?? [[data.genre, 100]],
    tracks,
    djReference: data.dj
  })?.pattern ?? null;
  const energyValues = makeFlowVersionEnergyValues(data, desiredTracks, referencePattern);
  const candidatePool = selectFlowCandidatePool(tracks, data, desiredTracks);
  const sequence = makeFlowSequence(candidatePool, data, energyValues, desiredTracks, referencePattern);
  const rows = sequence.slice(0, desiredTracks).map((source, index) => {
    const transitionKey = getFlowTransitionKey(data, index, desiredTracks);
    const energy = energyValues[index] ?? estimateFlowTrackEnergy(source, data);
    return {
      id: `${source.title}-${source.artist}-${index}`,
      title: source.title,
      artist: source.artist,
      meta: source.meta,
      transitionKey,
      transition: transitionKey,
      energy,
      normalizedEnergy: Math.max(0, Math.min(1, Math.round(energy) / 100)),
      role: getFlowPrimaryRole(source, data, index, desiredTracks),
      roles: source.roles || [],
      energyDirection: getFlowEnergyDirection(index, energyValues),
      transitionReason: getFlowTransitionReason(source, sequence[index - 1], data, transitionKey),
      section: getFlowSetSection(index, desiredTracks),
      warnings: getFlowTransitionWarnings(source, sequence[index - 1], data),
      tempo: source.tempo,
      camelotKey: source.camelotKey,
      genre: source.genre,
      metadataEstimated: source.metadataEstimated,
      risk: null
    };
  });

  return sendJson(res, {
    source: "backend-flow",
    trackCount: rows.length,
    referencePattern,
    rows
  });
}

function normalizeFlowRequestData(data = {}) {
  return {
    length: Number(data.length) || 45,
    genre: normalizePreferredGenre(data.genre) || "House",
    vibe: String(data.vibe || "Sunset"),
    dj: String(data.dj || ""),
    mustHave: String(data.mustHave || ""),
    notes: String(data.notes || "")
  };
}

function normalizeFlowTrack(track = {}, data = {}, index = 0) {
  const title = String(track.title || "").trim() || `Track ${index + 1}`;
  const artist = String(track.artist || "").trim();
  const knownTempo = Number(track.tempo) || getFlowTempoFromMeta(track.meta);
  const knownCamelotKey = normalizeFlowCamelotKey(track.camelotKey || track.openKey || getFlowCamelotFromMeta(track.meta) || track.keyOf);
  const tempo = knownTempo || estimateFlowBpm(data, index);
  const camelotKey = knownCamelotKey || estimateFlowKey(index);
  const genre = mapExternalGenre(track.genre || data.genre, data.genre);
  const metadataEstimated = Boolean(track.metadataEstimated || !knownTempo || !knownCamelotKey);
  const base = {
    title,
    artist,
    meta: String(track.meta || `${tempo} BPM / ${camelotKey}`).trim(),
    tempo,
    camelotKey,
    genre,
    durationMinutes: Number(track.durationMinutes) || 4,
    metadataEstimated,
    sourceIndex: Number.isFinite(Number(track.sourceIndex)) ? Number(track.sourceIndex) : index
  };
  const strategy = getGenreSequencingStrategy(genre || data.genre);
  const dimensions = inferFlowTrackDimensions(base, data, strategy);

  return {
    ...base,
    dimensions,
    effectiveEnergy: getFlowEffectiveEnergy(dimensions, strategy),
    roles: classifyFlowTrackRoles(base, dimensions, strategy, data)
  };
}

function getFlowDesiredTrackCount(length) {
  return Math.max(6, Math.round((Number(length) || 45) / 4));
}

function selectFlowCandidatePool(sourcePool, data, desiredTracks) {
  if (!sourcePool.length || sourcePool.length <= desiredTracks) return sourcePool;
  const mustHaveTracks = parseFlowMustHaveTracks(data.mustHave);
  if (!mustHaveTracks.length) return sourcePool.slice(0, desiredTracks);

  const selected = [];
  const selectedIndexes = new Set();
  sourcePool.forEach((track, index) => {
    if (getFlowMustHaveAffinity(track, mustHaveTracks) < 0.58) return;
    selected.push(track);
    selectedIndexes.add(index);
  });

  sourcePool.forEach((track, index) => {
    if (selected.length >= desiredTracks) return;
    if (selectedIndexes.has(index)) return;
    selected.push(track);
  });

  return selected.slice(0, desiredTracks);
}

function makeFlowSequence(sourcePool, data, energyValues, desiredTracks, referencePattern) {
  const pool = sourcePool.slice(0, desiredTracks);
  if (pool.length <= 2) return pool;

  const strategy = getGenreSequencingStrategy(data.genre);
  const sortedPool = [...pool].sort((a, b) => estimateFlowTrackEnergy(a, data) - estimateFlowTrackEnergy(b, data));
  const seedIndexes = sortedPool
    .map((track, index) => ({
      index,
      score: scoreFlowStartCandidate(track, data, referencePattern, sortedPool, strategy)
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.min(7, sortedPool.length))
    .map((entry) => entry.index);

  return seedIndexes
    .map((seedIndex) => makeFlowGreedySequenceFromSeed(seedIndex, sortedPool, data, energyValues, referencePattern, strategy))
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + scoreFlowGlobalSequence(candidate.sequence, data, energyValues, strategy)
    }))
    .sort((a, b) => a.score - b.score)[0]?.sequence ?? sortedPool;
}

function makeFlowGreedySequenceFromSeed(seedIndex, sortedPool, data, energyValues, referencePattern, strategy) {
  const sequence = [sortedPool[seedIndex]];
  const remaining = sortedPool.filter((_, index) => index !== seedIndex);
  let score = scoreFlowStartCandidate(sequence[0], data, referencePattern, sortedPool, strategy);

  while (remaining.length) {
    const targetEnergy = energyValues[sequence.length] ?? 50;
    const nextIndex = findFlowBestNextIndex(sequence.at(-1), remaining, data, targetEnergy, sequence, sortedPool, referencePattern);
    const nextTrack = remaining.splice(nextIndex, 1)[0];
    score += scoreFlowTransition(sequence.at(-1), nextTrack, data, targetEnergy, sequence, sortedPool, referencePattern, strategy);
    sequence.push(nextTrack);
  }

  return { sequence, score };
}

function findFlowBestStartIndex(tracks, data, referencePattern) {
  let bestIndex = 0;
  let bestScore = Infinity;
  const strategy = getGenreSequencingStrategy(data.genre);
  tracks.forEach((track, index) => {
    const score = scoreFlowStartCandidate(track, data, referencePattern, tracks, strategy);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function findFlowBestNextIndex(previous, candidates, data, targetEnergy, sequence, poolContext, referencePattern) {
  let bestIndex = 0;
  let bestScore = Infinity;
  const strategy = getGenreSequencingStrategy(data.genre);
  candidates.forEach((candidate, index) => {
    const score = scoreFlowTransition(previous, candidate, data, targetEnergy, sequence, poolContext, referencePattern, strategy);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function scoreFlowStartCandidate(track, data, referencePattern, poolContext = [], strategy = getGenreSequencingStrategy(data.genre)) {
  const preference = getFlowPreferenceProfile(data);
  const referencePriority = getFlowReferencePriority(referencePattern);
  const roleScore = getFlowRoleScore(track, ["intro", "warm-up", "groove"], strategy);
  const peakPenalty = getFlowRoleScore(track, ["peak", "impact"], strategy) * strategy.startPeakPenalty;
  return Math.abs(estimateFlowTrackEnergy(track, data) - preference.startTarget)
    + Math.abs(track.tempo - getFlowTargetTempo(data, 0, poolContext.length || 8)) * preference.startTempoWeight
    + peakPenalty
    - roleScore * 10
    - getFlowReferenceStartFit(track, data, referencePattern) * referencePriority.referencePattern * 6
    - getFlowDjReferenceAffinity(track, data) * preference.djReferenceWeight * 1.6
    - getFlowMustHaveAffinity(track, parseFlowMustHaveTracks(data.mustHave)) * preference.mustHaveWeight;
}

function scoreFlowTransition(previous, candidate, data, targetEnergy, sequence = [], poolContext = [], referencePattern = null, strategy = getGenreSequencingStrategy(data.genre)) {
  const preference = getFlowPreferenceProfile(data);
  const referencePriority = getFlowReferencePriority(referencePattern);
  const weights = {
    tempo: (2.35 + referencePriority.tempo * 1.6) * strategy.weights.tempo,
    key: (1.05 + referencePriority.camelotKey * 2) * strategy.weights.key,
    energy: (1.05 + referencePriority.energyCurve * 1.4) * strategy.weights.energy,
    genre: (1.25 + referencePriority.genreTexture * 1.9) * strategy.weights.genre
  };
  const tempoGap = Math.abs(candidate.tempo - previous.tempo);
  const tempoDirectionPenalty = getFlowTempoDirectionPenalty(previous, candidate, sequence.length, poolContext.length, strategy);
  const keyGap = getFlowCamelotDistance(previous.camelotKey, candidate.camelotKey);
  const keyConfidence = previous.metadataEstimated || candidate.metadataEstimated ? 0.48 : 1;
  const candidateEnergy = estimateFlowTrackEnergy(candidate, data);
  const previousEnergy = estimateFlowTrackEnergy(previous, data);
  const energyGap = Math.abs(candidateEnergy - targetEnergy);
  const genrePenalty = getFlowGenreCompatibilityPenalty(previous.genre, candidate.genre);
  const referencePatternPenalty = getFlowReferencePatternPenalty(previous, candidate, data, targetEnergy, referencePattern);
  const releasePenalty = getFlowReleasePenalty(previous, candidate, data, sequence.length, targetEnergy, poolContext.length, strategy);
  const rolePenalty = getFlowRoleProgressionPenalty(sequence, candidate, data, targetEnergy, poolContext.length, strategy);
  const vocalPenalty = getFlowVocalSpacingPenalty(sequence, candidate, strategy);
  const texturePenalty = getFlowTextureContinuityPenalty(previous, candidate, strategy);
  const peakPenalty = getFlowPeakTimingPenalty(candidate, sequence.length, poolContext.length, strategy);
  const artistRepeatPenalty = getFlowArtistRepeatPenalty(sequence, candidate, data, poolContext);

  return tempoGap * weights.tempo * preference.tempoWeight
    + tempoDirectionPenalty
    + keyGap * weights.key * preference.keyWeight * keyConfidence
    + energyGap * weights.energy * preference.energyWeight
    + genrePenalty * weights.genre * preference.genreWeight
    + referencePatternPenalty * referencePriority.referencePattern
    + releasePenalty * strategy.weights.release
    + rolePenalty * strategy.weights.role
    + vocalPenalty * strategy.weights.vocalSpacing
    + texturePenalty
    + peakPenalty
    + artistRepeatPenalty * preference.artistRepeatWeight
    - getFlowDjReferenceAffinity(candidate, data) * preference.djReferenceWeight
    - getFlowMustHaveAffinity(candidate, parseFlowMustHaveTracks(data.mustHave)) * preference.mustHaveWeight;
}

function scoreFlowPartialShape(sequence = [], data = {}, energyValues = [], strategy = getGenreSequencingStrategy(data.genre)) {
  if (sequence.length < 3) return 0;
  return sequence.reduce((sum, track, index) => {
    const targetEnergy = energyValues[index] ?? 50;
    const rolePenalty = getFlowRoleProgressionPenalty(sequence.slice(0, index), track, data, targetEnergy, energyValues.length, strategy);
    return sum + Math.abs(estimateFlowTrackEnergy(track, data) - targetEnergy) * 0.14 + rolePenalty * 0.18;
  }, 0);
}

function scoreFlowGlobalSequence(sequence = [], data = {}, energyValues = [], strategy = getGenreSequencingStrategy(data.genre)) {
  let score = 0;
  let peakCountBeforeWindow = 0;
  const peakStart = Math.floor(sequence.length * strategy.peakWindow[0]);
  const peakEnd = Math.ceil(sequence.length * strategy.peakWindow[1]);
  sequence.forEach((track, index) => {
    const energy = estimateFlowTrackEnergy(track, data);
    if (getFlowRoleScore(track, ["peak", "impact"], strategy) > 0.5 && index < peakStart) peakCountBeforeWindow += 1;
    if (index === sequence.length - 1) score -= getFlowRoleScore(track, ["outro", "peak", "impact", "groove"], strategy) * strategy.outroBonus;
    if (index >= peakStart && index <= peakEnd && energy >= 74) score -= 2.5;
  });
  score += peakCountBeforeWindow * strategy.earlyPeakPenalty;
  return score;
}

function makeFlowVersionEnergyValues(data, count, referencePattern) {
  const strategy = getGenreSequencingStrategy(data.genre);
  const values = makeFlowEnergyValues(data.vibe, count, referencePattern, strategy);
  const preference = getFlowPreferenceProfile(data);
  const shapedValues = values.map((value, index) => {
    const position = values.length === 1 ? 0 : index / (values.length - 1);
    const softIntro = index === 0 ? preference.introBias : 0;
    const softOutro = index === values.length - 1 ? preference.outroBias : 0;
    const middleLift = Math.sin(position * Math.PI) * preference.midLift;
    return Math.round(Math.max(8, Math.min(98, value + preference.energyBias + softIntro + softOutro + middleLift)));
  });
  return applyFlowReleaseDips(shapedValues, data, strategy);
}

function makeFlowEnergyValues(vibe, count, referencePattern, strategy = getGenreSequencingStrategy()) {
  const baseAnchors = strategy.energyCurve;
  const vibeAnchors = {
      Sunset: [34, 46, 62, 78, 86, 68],
      "Morning coffee": [18, 28, 38, 44, 36, 24],
      "After party": [52, 62, 78, 84, 74, 58],
      Chill: [20, 26, 34, 38, 30, 22],
      Working: [28, 38, 48, 54, 50, 36],
      Workout: [58, 74, 88, 96, 90, 72],
      "Road trip": [32, 44, 58, 70, 64, 46],
      "Friday night": [38, 52, 66, 80, 74, 56],
      "Pre-game": [42, 58, 72, 84, 88, 70],
      "Deep focus": [24, 32, 40, 46, 42, 30]
    }[vibe] ?? [32, 45, 58, 72, 66, 45];
  const referenceAnchors = Array.isArray(referencePattern?.energyCurve) && referencePattern.energyCurve.length >= 3
    ? referencePattern.energyCurve
    : null;
  const anchors = blendFlowEnergyAnchors(baseAnchors, vibeAnchors, referenceAnchors, strategy);

  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0 : index / (count - 1);
    const scaled = position * (anchors.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(anchors.length - 1, left + 1);
    const progress = scaled - left;
    const value = anchors[left] + (anchors[right] - anchors[left]) * progress;
    const pulse = Math.sin(index * 1.7) * 3;
    return Math.round(Math.max(8, Math.min(98, value + pulse)));
  });
}

function applyFlowBreathingDips(values = [], data = {}) {
  return applyFlowReleaseDips(values, data, getGenreSequencingStrategy(data.genre));
}

function applyFlowReleaseDips(values = [], data = {}, strategy = getGenreSequencingStrategy(data.genre)) {
  const indexes = getFlowReleaseIndexes(values.length, data, strategy);
  if (!indexes.length) return values;
  const shaped = [...values];
  indexes.forEach((index) => {
    const previous = shaped[index - 1] ?? shaped[index];
    const drop = strategy.releaseDepth ?? 10;
    const floor = strategy.releaseFloor ?? 20;
    const cap = strategy.releaseCap ?? 56;
    shaped[index] = Math.round(Math.max(floor, Math.min(shaped[index] - drop, previous - Math.max(4, drop - 3), cap)));
    if (index + 1 < shaped.length && shaped[index + 1] < shaped[index] + 6) {
      shaped[index + 1] = Math.min(98, shaped[index] + 6);
    }
  });
  return shaped;
}

function blendFlowEnergyAnchors(baseAnchors = [], vibeAnchors = [], referenceAnchors = null, strategy = getGenreSequencingStrategy()) {
  const length = Math.max(baseAnchors.length, vibeAnchors.length, referenceAnchors?.length || 0, 3);
  const sample = (anchors, index) => {
    if (!anchors?.length) return 50;
    const position = length === 1 ? 0 : index / (length - 1);
    const scaled = position * (anchors.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(anchors.length - 1, left + 1);
    const progress = scaled - left;
    return anchors[left] + (anchors[right] - anchors[left]) * progress;
  };
  return Array.from({ length }, (_, index) => {
    const base = sample(baseAnchors, index);
    const vibe = sample(vibeAnchors, index);
    const reference = referenceAnchors ? sample(referenceAnchors, index) : base;
    const value = base * 0.58 + vibe * 0.24 + reference * (referenceAnchors ? 0.18 : 0);
    return Math.round(Math.max(8, Math.min(98, value + (strategy.energyBias || 0))));
  });
}

function getFlowPreferenceProfile(data = {}) {
  const text = normalizeTag(`${data.dj || ""} ${data.notes || ""}`);
  const isSmooth = /smooth|soft|gentle|dreamy|warm|melodic|chill|coffee|focus|lo fi|nujabes|bonobo|ben bohmer|lane 8|four tet|black coffee|keinemusik|deep/.test(text);
  const isHighEnergyContext = /peak|club|rave|festival|workout|hard|high energy|punchy|fred again|peggy gou|chris lake|fisher|skrillex|knock2|mau p|charlotte/.test(text);
  const wantsSoftIntro = /soft intro|gentle intro|slow intro|warm intro/.test(text);
  const wantsPeak = /mid set peak|peak/.test(text);
  const wantsDreamyOutro = /dreamy outro|soft outro|gentle ending|closing|outro/.test(text);
  return {
    energyBias: (isHighEnergyContext ? 4 : 0) + (isSmooth ? -6 : 0),
    introBias: wantsSoftIntro || isSmooth ? -8 : 0,
    outroBias: wantsDreamyOutro || isSmooth ? -7 : 0,
    midLift: wantsPeak || isHighEnergyContext ? 5 : 0,
    startTarget: wantsSoftIntro || isSmooth ? 18 : isHighEnergyContext ? 30 : 25,
    startTempoWeight: isSmooth ? 0.35 : 0.25,
    tempoWeight: isSmooth ? 1.36 : 1.2,
    keyWeight: isSmooth ? 0.82 : 0.72,
    genreWeight: isSmooth ? 1.28 : 1.12,
    energyWeight: isSmooth ? 1.32 : 1.16,
    djReferenceWeight: 2.65,
    mustHaveWeight: 3.8,
    breathingMomentWeight: isFlowBreathingContext(data) ? 1.15 : 0,
    artistRepeatWeight: 1
  };
}

function getFlowReferencePriority(referencePattern) {
  const priority = referencePattern?.smoothPriority ?? {};
  return {
    tempo: Number(priority.tempo) || 0.34,
    genreTexture: Number(priority.genreTexture) || 0.23,
    energyCurve: Number(priority.energyCurve) || 0.22,
    camelotKey: Number(priority.camelotKey) || 0.16,
    referencePattern: Number(priority.referencePattern) || 0.05
  };
}

const DEFAULT_FLOW_STRATEGY = {
  id: "house",
  targetCurve: [36, 48, 62, 74, 66, 82, 70],
  bpmTolerance: 8,
  preferredResetInterval: [5, 6],
  resetRole: "breathing moment",
  sectionRole: "breathing",
  resetDepth: 10,
  resetFloor: 22,
  resetCap: 58,
  peakWindow: [0.62, 0.9],
  startPeakPenalty: 9,
  earlyPeakPenalty: 10,
  outroBonus: 5,
  roleOrder: ["intro", "warm-up", "groove", "builder", "vocal lift", "emotional lift", "impact", "peak", "reset", "outro"],
  transitionWeights: {
    bpm: 1,
    key: 0.78,
    energy: 1.08,
    mood: 1,
    groove: 1,
    percussion: 1,
    bass: 1,
    vocalSpacing: 1,
    structure: 1,
    reset: 1
  },
  rules: {
    maxConsecutiveVocals: 2,
    maxConsecutivePeaks: 2,
    allowMidSetBpmDrop: true,
    requireFinalPeak: false,
    preferResolvingOutro: true
  }
};

const FLOW_GENRE_STRATEGIES = {
  house: DEFAULT_FLOW_STRATEGY,
  "melodic-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "melodic-house",
    targetCurve: [30, 42, 56, 70, 52, 76, 86, 64],
    preferredResetInterval: [5, 6],
    resetRole: "breathing moment",
    sectionRole: "breathing",
    resetDepth: 13,
    resetCap: 54,
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.08, key: 1.08, energy: 1.12, reset: 1.28, structure: 1.2, vocalSpacing: 1.05 }
  },
  "tech-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "tech-house",
    targetCurve: [55, 62, 70, 82, 72, 84, 95, 88],
    bpmTolerance: 5,
    preferredResetInterval: [4, 5],
    resetRole: "groove reset",
    sectionRole: "reset",
    resetDepth: 7,
    resetFloor: 52,
    resetCap: 74,
    peakWindow: [0.68, 0.95],
    roleOrder: ["intro", "groove", "builder", "impact", "reset", "builder", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.34, key: 0.58, energy: 1.12, mood: 1.15, reset: 1.22, structure: 1.15, vocalSpacing: 1.34, groove: 1.42, percussion: 1.3, bass: 1.32 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, maxConsecutiveVocals: 1, allowMidSetBpmDrop: false, requireFinalPeak: true }
  },
  "progressive-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "progressive-house",
    targetCurve: [35, 45, 58, 70, 82, 62, 75, 92, 68],
    preferredResetInterval: [6, 7],
    resetRole: "floating release",
    sectionRole: "floating release",
    resetDepth: 12,
    resetCap: 60,
    peakWindow: [0.68, 0.92],
    roleOrder: ["intro", "warm-up", "groove", "builder", "emotional lift", "floating release", "builder", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.04, key: 1.06, energy: 1.1, reset: 1.18, structure: 1.22, vocalSpacing: 1.02 }
  },
  "organic-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "organic-house",
    targetCurve: [25, 40, 55, 65, 78, 52, 68, 58],
    preferredResetInterval: [5, 6],
    resetRole: "natural breathing space",
    sectionRole: "breathing",
    resetDepth: 14,
    resetFloor: 28,
    resetCap: 56,
    peakWindow: [0.55, 0.82],
    roleOrder: ["intro", "warm-up", "groove", "builder", "emotional lift", "breathing", "groove", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1, key: 0.86, energy: 1.2, mood: 1.12, reset: 1.28, structure: 1.18, percussion: 1.18 }
  },
  "deep-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "deep-house",
    targetCurve: [40, 52, 65, 50, 62, 72, 55, 70, 58],
    preferredResetInterval: [5, 6],
    resetRole: "deep reset",
    sectionRole: "reset",
    resetDepth: 9,
    resetFloor: 38,
    resetCap: 58,
    peakWindow: [0.55, 0.88],
    roleOrder: ["intro", "warm-up", "groove", "reset", "groove", "builder", "deep reset", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.1, key: 0.86, energy: 1.18, mood: 1.12, reset: 1.18, structure: 1.1, groove: 1.24, bass: 1.12 }
  },
  "afro-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "afro-house",
    targetCurve: [35, 50, 65, 72, 84, 66, 78, 94, 72],
    bpmTolerance: 7,
    preferredResetInterval: [5, 6],
    resetRole: "percussion reset",
    sectionRole: "percussion reset",
    resetDepth: 9,
    resetFloor: 48,
    resetCap: 68,
    peakWindow: [0.64, 0.92],
    roleOrder: ["intro", "warm-up", "groove", "builder", "percussion reset", "vocal lift", "impact", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.12, key: 0.62, energy: 1.08, mood: 1.12, reset: 1.2, structure: 1.16, percussion: 1.5, vocalSpacing: 1.14 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, maxConsecutiveVocals: 1 }
  },
  trance: {
    ...DEFAULT_FLOW_STRATEGY,
    id: "trance",
    targetCurve: [35, 55, 72, 88, 52, 95, 75, 100, 70],
    preferredResetInterval: [5, 6],
    resetRole: "breakdown and release",
    sectionRole: "floating release",
    resetDepth: 17,
    resetFloor: 34,
    resetCap: 56,
    peakWindow: [0.58, 0.95],
    roleOrder: ["intro", "warm-up", "builder", "emotional lift", "floating release", "impact", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.02, key: 1.22, energy: 1.04, reset: 1.32, structure: 1.3, vocalSpacing: 1.04 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, maxConsecutivePeaks: 2, requireFinalPeak: true }
  },
  "drum-and-bass": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "drum-and-bass",
    targetCurve: [35, 52, 68, 88, 55, 72, 98, 65],
    bpmTolerance: 8,
    preferredResetInterval: [4, 5],
    resetRole: "liquid release",
    sectionRole: "liquid release",
    resetDepth: 16,
    resetFloor: 40,
    resetCap: 60,
    peakWindow: [0.58, 0.9],
    roleOrder: ["intro", "builder", "impact", "peak", "liquid release", "builder", "peak", "outro"],
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.18, key: 0.52, energy: 1.16, mood: 1.16, reset: 1.26, structure: 1.2, bass: 1.46, vocalSpacing: 0.96 }
  },
  "uk-garage": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "uk-garage",
    targetCurve: [45, 56, 68, 72, 60, 78, 66],
    bpmTolerance: 6,
    preferredResetInterval: [4, 5],
    resetRole: "shuffle reset",
    sectionRole: "reset",
    resetDepth: 8,
    resetFloor: 44,
    resetCap: 66,
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.18, key: 0.62, energy: 1.1, mood: 1.12, groove: 1.35, vocalSpacing: 1.16 }
  },
  "bass-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "bass-house",
    targetCurve: [54, 68, 78, 92, 64, 88, 76],
    bpmTolerance: 5,
    preferredResetInterval: [4, 5],
    resetRole: "bass reset",
    sectionRole: "reset",
    resetDepth: 12,
    resetFloor: 46,
    resetCap: 66,
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.2, key: 0.5, energy: 1.18, mood: 1.08, bass: 1.55, structure: 1.2 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, requireFinalPeak: true }
  },
  "lo-fi-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "lo-fi-house",
    targetCurve: [24, 34, 44, 50, 40, 46, 32],
    bpmTolerance: 10,
    preferredResetInterval: [6, 7],
    resetRole: "dusty reset",
    sectionRole: "reset",
    resetDepth: 8,
    resetFloor: 18,
    resetCap: 46,
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 0.86, key: 0.82, energy: 1.28, mood: 1.25, groove: 1.12, vocalSpacing: 0.9 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, requireFinalPeak: false }
  },
  "electro-house": {
    ...DEFAULT_FLOW_STRATEGY,
    id: "electro-house",
    targetCurve: [50, 64, 80, 92, 70, 94, 82],
    bpmTolerance: 6,
    preferredResetInterval: [4, 5],
    resetRole: "synth reset",
    sectionRole: "reset",
    resetDepth: 10,
    resetFloor: 48,
    resetCap: 70,
    transitionWeights: { ...DEFAULT_FLOW_STRATEGY.transitionWeights, bpm: 1.16, key: 0.58, energy: 1.16, mood: 1.08, bass: 1.28, structure: 1.2 },
    rules: { ...DEFAULT_FLOW_STRATEGY.rules, requireFinalPeak: true }
  }
};

function resolveFlowStrategyKey(primaryGenre = "") {
  const text = normalizeTag(primaryGenre).replace(/-/g, " ");
  if (text.includes("tech house")) return "tech-house";
  if (text.includes("progressive")) return "progressive-house";
  if (text.includes("organic")) return "organic-house";
  if (text.includes("deep house")) return "deep-house";
  if (text.includes("afro")) return "afro-house";
  if (text.includes("uk garage") || text.includes("garage")) return "uk-garage";
  if (text.includes("bass house")) return "bass-house";
  if (text.includes("lo fi house") || text.includes("lofi house")) return "lo-fi-house";
  if (text.includes("electro house")) return "electro-house";
  if (text.includes("trance")) return "trance";
  if (text.includes("drum and bass") || text.includes("dnb")) return "drum-and-bass";
  if (text.includes("melodic")) return "melodic-house";
  return "house";
}

function makeFlowStrategy(config = DEFAULT_FLOW_STRATEGY) {
  const weights = config.transitionWeights;
  return {
    ...config,
    energyCurve: config.targetCurve,
    releaseName: config.resetRole,
    releaseRole: config.sectionRole,
    releaseDepth: config.resetDepth,
    releaseFloor: config.resetFloor,
    releaseCap: config.resetCap,
    releaseEvery: Math.round((config.preferredResetInterval[0] + config.preferredResetInterval[1]) / 2),
    stableBpm: !config.rules.allowMidSetBpmDrop,
    weights: {
      tempo: weights.bpm,
      key: weights.key,
      energy: weights.energy,
      genre: weights.mood,
      release: weights.reset,
      role: weights.structure,
      vocalSpacing: weights.vocalSpacing,
      groove: weights.groove,
      percussion: weights.percussion,
      bass: weights.bass
    }
  };
}

function getGenreSequencingStrategy(primaryGenre = "") {
  const key = resolveFlowStrategyKey(primaryGenre);
  return makeFlowStrategy(FLOW_GENRE_STRATEGIES[key] ?? DEFAULT_FLOW_STRATEGY);
}

function inferFlowTrackDimensions(track = {}, data = {}, strategy = getGenreSequencingStrategy(data.genre)) {
  const text = normalizeTag(`${track.title || ""} ${track.artist || ""} ${track.genre || data.genre || ""} ${track.meta || ""}`);
  const tempo = Number(track.tempo) || estimateFlowBpm(data, 0);
  const tempoEnergy = Math.max(0, Math.min(1, (tempo - 86) / 58));
  const has = (regex) => regex.test(text);
  const vocalPresence = has(/feat|featuring|ft\.|vocal|voice|love|you|me|heart|tonight|eyes|feel|dream|sing|chant|choir/) ? 0.8 : has(/dub|instrumental|tool|loop|drum|percussion/) ? 0.18 : 0.42;
  const percussionIntensity = Math.max(0, Math.min(1, 0.36 + (has(/drum|percussion|afro|tribal|rhythm|groove|beat|chant|latin/) ? 0.34 : 0) + (strategy.id === "afro-house" || strategy.id === "tech-house" ? 0.18 : 0)));
  const bassIntensity = Math.max(0, Math.min(1, 0.34 + (has(/bass|sub|drop|rave|banger|pressure|warehouse|raw|acid|dubstep|dnb|jungle/) ? 0.42 : 0) + (strategy.id === "drum-and-bass" ? 0.2 : 0)));
  const acousticness = has(/acoustic|organic|piano|sunset|warm|soul|jazz|lofi|lo fi|ambient|natural|desert/) ? 0.7 : 0.22;
  const emotionalIntensity = Math.max(0, Math.min(1, 0.3 + (has(/melodic|progressive|trance|dream|lost|love|moment|home|aurora|sunrise|soul|eyes/) ? 0.38 : 0) + (strategy.id === "melodic-house" || strategy.id === "progressive-house" ? 0.16 : 0)));
  const dropIntensity = Math.max(0, Math.min(1, 0.18 + tempoEnergy * 0.35 + (has(/drop|impact|banger|festival|big room|rave|peak|overdrive|control/) ? 0.44 : 0)));
  const breakdownIntensity = Math.max(0, Math.min(1, 0.18 + (has(/break|breakdown|release|float|dream|ambient|cinematic|pad/) ? 0.45 : 0) + (strategy.id === "trance" || strategy.id === "progressive-house" ? 0.16 : 0)));
  return {
    tempoEnergy,
    vocalPresence,
    percussionIntensity,
    bassIntensity,
    acousticness,
    emotionalIntensity,
    dropIntensity,
    breakdownIntensity,
    introSuitability: Math.max(0, Math.min(1, 0.45 + (has(/intro|extended|original|groove|loop|tool|warm|deep|sunset/) ? 0.35 : 0) - dropIntensity * 0.25)),
    outroSuitability: Math.max(0, Math.min(1, 0.35 + (has(/outro|closing|dream|home|release|sunset|late|night|final/) ? 0.38 : 0) + emotionalIntensity * 0.16))
  };
}

function getFlowEffectiveEnergy(dimensions = {}, strategy = getGenreSequencingStrategy()) {
  const value = dimensions.tempoEnergy * 44
    + dimensions.dropIntensity * 22
    + dimensions.bassIntensity * strategy.weights.bass * 7
    + dimensions.percussionIntensity * strategy.weights.percussion * 7
    + dimensions.emotionalIntensity * 9
    + dimensions.vocalPresence * 4
    - dimensions.acousticness * 4;
  return Math.round(Math.max(8, Math.min(98, value + 22)));
}

function classifyFlowTrackRoles(track = {}, dimensions = {}, strategy = getGenreSequencingStrategy(), data = {}) {
  const roles = [];
  const text = normalizeTag(`${track.title || ""} ${track.artist || ""} ${track.genre || data.genre || ""}`);
  const energy = getFlowEffectiveEnergy(dimensions, strategy);
  if (dimensions.introSuitability >= 0.58 || energy <= 42) roles.push("intro");
  if (energy <= 54) roles.push("warm-up");
  if (dimensions.percussionIntensity >= 0.58 || dimensions.bassIntensity >= 0.55) roles.push("groove");
  if (energy >= 58 && energy <= 78) roles.push("builder");
  if (dimensions.vocalPresence >= 0.66) roles.push("vocal lift");
  if (dimensions.emotionalIntensity >= 0.62) roles.push("emotional lift");
  if (dimensions.dropIntensity >= 0.62 || energy >= 78) roles.push("impact");
  if (energy >= 86 || dimensions.dropIntensity >= 0.78) roles.push("peak");
  if (dimensions.breakdownIntensity >= 0.58) roles.push("floating release");
  if (dimensions.percussionIntensity >= 0.68 && dimensions.dropIntensity < 0.62) roles.push("percussion reset");
  if (strategy.id === "drum-and-bass" && /liquid|soul|roll|vocal|deep/.test(text)) roles.push("liquid release");
  if (energy <= 60 && dimensions.dropIntensity < 0.56 && dimensions.vocalPresence < 0.68) roles.push("reset");
  if (strategy.id === "melodic-house" && energy <= 60 && dimensions.emotionalIntensity >= 0.5) roles.push("breathing");
  if (dimensions.outroSuitability >= 0.56 || energy <= 60) roles.push("outro");
  return [...new Set(roles.length ? roles : ["groove"])];
}

function getFlowRoleScore(track = {}, roles = [], strategy = getGenreSequencingStrategy()) {
  const trackRoles = Array.isArray(track.roles) ? track.roles : [];
  return roles.reduce((score, role) => Math.max(score, trackRoles.includes(role) ? 1 : 0), 0);
}

function getFlowReferenceStartFit(track = {}, data = {}, referencePattern) {
  if (!referencePattern) return 0;
  const flow = normalizeTag(referencePattern.flow || "");
  const genre = normalizeTag(track.genre || data.genre || "");
  const energy = estimateFlowTrackEnergy(track, data);
  let score = 0;
  if (/slow rise|low pressure/.test(flow) && energy <= 38) score += 1;
  if (/deep layered|club groove|uk garage/.test(flow) && energy >= 30 && energy <= 56) score += 0.75;
  if (/festival burst/.test(flow) && energy >= 48) score += 0.65;
  if (/melodic|progressive|deep|organic|afro|garage|house|lo fi|jazz|soul/.test(`${flow} ${genre}`)) score += 0.35;
  return Math.min(1, score);
}

function getFlowReferencePatternPenalty(previous = {}, candidate = {}, data = {}, targetEnergy = 50, referencePattern) {
  if (!referencePattern) return 0;
  const flow = normalizeTag(referencePattern.flow || "");
  const transitionStyle = normalizeTag(referencePattern.transitionStyle || "");
  const candidateEnergy = estimateFlowTrackEnergy(candidate, data);
  const previousEnergy = estimateFlowTrackEnergy(previous, data);
  const energyMovement = candidateEnergy - previousEnergy;
  let penalty = 0;
  if (/slow rise|melodic/.test(flow)) {
    if (Math.abs(candidate.tempo - previous.tempo) > 8) penalty += 7;
    if (energyMovement < -14) penalty += 6;
  }
  if (/low pressure/.test(flow)) {
    if (candidateEnergy > 62) penalty += 8;
    if (Math.abs(energyMovement) > 18) penalty += 5;
  }
  if (/deep layered|club groove/.test(flow)) {
    if (getFlowGenreCompatibilityPenalty(previous.genre, candidate.genre) >= 12) penalty += 6;
    if (Math.abs(energyMovement) > 24) penalty += 4;
  }
  if (/uk garage/.test(flow) && !/garage|house|groove|dance|pop/.test(normalizeTag(candidate.genre || ""))) penalty += 4;
  if (/festival burst/.test(flow) && candidateEnergy < targetEnergy - 24) penalty += 5;
  if (/long blends|harmonic/.test(transitionStyle) && getFlowCamelotDistance(previous.camelotKey, candidate.camelotKey) > 3) penalty += 3;
  return penalty;
}

function isFlowBreathingContext(data = {}) {
  const text = normalizeTag(`${data.vibe || ""} ${data.genre || ""} ${data.dj || ""} ${data.notes || ""}`);
  if (/workout|rave|mainstage|big room|dubstep|drum and bass|dnb|hard|peak|festival/.test(text)) return false;
  return /melodic|progressive|organic|afro|deep|sunset|focus|road|chill|lane 8|ben bohmer|marsh|nora en pure|sultan|shepard|yotto|anjuna|tinlicker|jerro|le youth/.test(text);
}

function getFlowBreathingIndexes(count = 0, data = {}) {
  return getFlowReleaseIndexes(count, data, getGenreSequencingStrategy(data.genre)).filter((index) => getFlowReleaseTransitionKey(data, index, count) === "breathing moment");
}

function getFlowReleaseIndexes(count = 0, data = {}, strategy = getGenreSequencingStrategy(data.genre)) {
  if (count < 8) return [];
  if (strategy.releaseName === "breathing moment" && !isFlowBreathingContext(data)) return [];
  const indexes = [];
  const interval = Math.max(4, Number(strategy.releaseEvery) || 6);
  let next = count <= 10 ? Math.floor(count / 2) : Math.min(interval, Math.floor(count * 0.45));
  next = Math.max(4, Math.min(count - 3, next));
  while (next <= count - 3) {
    indexes.push(next);
    next += interval;
  }
  return indexes;
}

function getFlowReleaseTransitionKey(data = {}, index = 0, count = 0) {
  const strategy = getGenreSequencingStrategy(data.genre);
  return getFlowReleaseIndexes(count, data, strategy).includes(index) ? strategy.releaseName : "";
}

function getFlowBreathingPenalty(previous = {}, candidate = {}, data = {}, nextIndex = 0, targetEnergy = 50, count = 0) {
  return getFlowReleasePenalty(previous, candidate, data, nextIndex, targetEnergy, count, getGenreSequencingStrategy(data.genre));
}

function getFlowReleasePenalty(previous = {}, candidate = {}, data = {}, nextIndex = 0, targetEnergy = 50, count = 0, strategy = getGenreSequencingStrategy(data.genre)) {
  if (!getFlowReleaseIndexes(count, data, strategy).includes(nextIndex)) return 0;
  const candidateEnergy = estimateFlowTrackEnergy(candidate, data);
  const previousEnergy = estimateFlowTrackEnergy(previous, data);
  const energyMovement = candidateEnergy - previousEnergy;
  const tempoGap = Math.abs(candidate.tempo - previous.tempo);
  const genrePenalty = getFlowGenreCompatibilityPenalty(previous.genre, candidate.genre);
  const textureFit = getFlowReleaseTextureFit(candidate, data, strategy);
  let penalty = Math.abs(candidateEnergy - targetEnergy) * 1.05;
  const expectsDrop = strategy.releaseDepth >= 11;
  if (expectsDrop && energyMovement > -3) penalty += 10 + Math.max(0, energyMovement) * 0.45;
  if (!expectsDrop && energyMovement < -18) penalty += 8;
  if (energyMovement < -26) penalty += 7;
  const tolerance = Number(strategy.bpmTolerance) || (strategy.stableBpm ? 5 : 8);
  if (tempoGap > tolerance) penalty += (tempoGap - tolerance) * 1.4;
  if (genrePenalty >= 12) penalty += 5;
  if (candidate.metadataEstimated) penalty += 2.5;
  penalty -= textureFit * 9;
  return Math.max(-5, penalty);
}

function getFlowBreathingTextureFit(track = {}, data = {}) {
  return getFlowReleaseTextureFit(track, data, getGenreSequencingStrategy(data.genre));
}

function getFlowReleaseTextureFit(track = {}, data = {}, strategy = getGenreSequencingStrategy(data.genre)) {
  const text = normalizeTag(`${track.title || ""} ${track.artist || ""} ${track.genre || data.genre || ""}`);
  const family = getFlowGenreFamily(track.genre || data.genre || "");
  const dimensions = track.dimensions || inferFlowTrackDimensions(track, data, strategy);
  let score = 0;
  if (family === "deep-melodic") score += 0.75;
  if (family === "chill-soul") score += 0.55;
  if (family === "house-groove") score += 0.25;
  if (strategy.releaseRole === "reset" && dimensions.percussionIntensity >= 0.48 && dimensions.dropIntensity < 0.66) score += 0.45;
  if (strategy.releaseRole === "percussion reset" && dimensions.percussionIntensity >= 0.62) score += 0.62;
  if (strategy.releaseRole === "floating release" && dimensions.breakdownIntensity >= 0.52) score += 0.62;
  if (strategy.releaseRole === "liquid release" && /liquid|soul|roll|deep|vocal/.test(text)) score += 0.7;
  if (/melodic|progressive|organic|deep|afro|ambient|chill|sunset|dub|vocal|piano|dream|night|love|lost|float|slow|warm/.test(text)) score += 0.35;
  if (/mainstage|big room|dubstep|drum and bass|dnb|bass|rave|festival|drop|hard/.test(text)) score -= 0.35;
  return Math.max(0, Math.min(1, score));
}

function getFlowTransitionKey(data, index, count) {
  const releaseKey = getFlowReleaseTransitionKey(data, index, count);
  if (releaseKey) return releaseKey;
  const genreNotes = {
    House: ["Deep house opener", "percussion tease", "low-pass blend", "bassline switch"],
    "Tech house": ["groove-forward transition", "bassline switch", "percussion tease", "impact drop switch"],
    "Deep house": ["Deep house opener", "warm pad blend", "low-pass blend", "late-night handoff"],
    "Melodic house": ["melodic handoff", "warm pad blend", "emotional phrase handoff", "dreamy outro"],
    "Progressive house": ["melodic handoff", "long blend", "floating release", "wide breakdown resolve"],
    "Organic house": ["organic percussion blend", "natural breathing space", "warm pad blend", "soft percussion lift"],
    "Melodic techno": ["melodic handoff", "long blend", "tension lift", "controlled peak"],
    "Lo-fi": ["soft fade", "warm drums", "subtle key shift", "dreamy outro"],
    "Nu soul": ["warm drums", "soft fade", "vocal bridge", "subtle key shift"],
    "UK garage": ["2-step bounce", "vocal chop bridge", "shuffle lift", "bassline switch"],
    Disco: ["groove handoff", "bassline switch", "hook tease", "warm drums"],
    Techno: ["drum bridge", "tension lift", "filter push", "controlled peak"],
    Trance: ["melodic handoff", "long blend", "breakdown and release", "controlled peak"],
    Dubstep: ["impact cut", "drop contrast", "bass reset", "short cooldown"],
    "Bass house": ["bassline switch", "drum bridge", "filter push", "impact cut"],
    "Mainstage / Big room": ["wide intro", "tension lift", "drop contrast", "short cooldown"],
    "Afro house": ["percussion tease", "percussion reset", "deep house opener", "warm pad blend"],
    "Drum and bass": ["drum bridge", "liquid release", "bass reset", "impact cut"],
    "Indie dance": ["groove handoff", "hook tease", "warm pad blend", "dreamy outro"]
  };
  const vibeTransitions = {
    Sunset: ["wide intro", "melodic handoff", "warm pad blend", "dreamy outro"],
    "Morning coffee": ["soft fade", "warm drums", "subtle key shift", "dreamy outro"],
    "After party": ["Deep house opener", "late-night handoff", "low-pass blend", "warm pad blend"],
    Chill: ["soft fade", "warm drums", "breathing moment", "dreamy outro"],
    Working: ["subtle key shift", "steady loop", "warm pad blend", "soft fade"],
    Workout: ["drum bridge", "filter push", "controlled peak", "short cooldown"],
    "Road trip": ["wide intro", "road fade", "melodic handoff", "dreamy outro"],
    "Friday night": ["hook tease", "bassline switch", "controlled peak", "short cooldown"],
    "Pre-game": ["vocal bridge", "filter push", "hook tease", "controlled peak"],
    "Deep focus": ["soft fade", "steady loop", "breathing moment", "dreamy outro"]
  };
  const notes = genreNotes[data.genre] ?? genreNotes.House;
  const transitions = vibeTransitions[data.vibe] ?? vibeTransitions.Sunset;
  return index % 3 === 0 ? notes[index % notes.length] : transitions[index % transitions.length];
}

function getFlowTempoDirectionPenalty(previous = {}, candidate = {}, nextIndex = 0, count = 0, strategy = getGenreSequencingStrategy()) {
  const diff = (candidate.tempo || 0) - (previous.tempo || candidate.tempo || 0);
  if (!Number.isFinite(diff)) return 0;
  const position = count <= 1 ? 0 : nextIndex / (count - 1);
  let penalty = 0;
  const tolerance = Number(strategy.bpmTolerance) || (strategy.stableBpm ? 5 : 8);
  if (strategy.stableBpm && Math.abs(diff) > tolerance / 2) penalty += (Math.abs(diff) - tolerance / 2) * 2.4;
  if (position > 0.25 && position < 0.78 && diff < -4) penalty += Math.abs(diff) * 1.1;
  if (strategy.id === "progressive-house" && diff < -5 && position < 0.75) penalty += Math.abs(diff) * 0.9;
  if (strategy.id === "drum-and-bass" && Math.abs(diff) > tolerance) penalty += (Math.abs(diff) - tolerance) * 1.1;
  return penalty;
}

function getFlowRoleProgressionPenalty(sequence = [], candidate = {}, data = {}, targetEnergy = 50, count = 0, strategy = getGenreSequencingStrategy(data.genre)) {
  const index = sequence.length;
  const position = count <= 1 ? 0 : index / Math.max(1, count - 1);
  const targetRole = strategy.roleOrder[Math.min(strategy.roleOrder.length - 1, Math.floor(position * strategy.roleOrder.length))];
  let penalty = 0;
  if (targetRole && !candidate.roles?.includes(targetRole)) {
    const softRoles = {
      intro: ["warm-up", "groove"],
      "warm-up": ["intro", "groove"],
      groove: ["warm-up", "builder", "reset", "percussion reset"],
      builder: ["groove", "vocal lift", "emotional lift", "impact"],
      "vocal lift": ["builder", "emotional lift"],
      "emotional lift": ["builder", "vocal lift", "floating release"],
      impact: ["builder", "peak"],
      peak: ["impact", "builder"],
      reset: ["groove", "breathing", "percussion reset", "liquid release"],
      "deep reset": ["reset", "groove"],
      breathing: ["reset", "floating release", "warm-up"],
      "floating release": ["breathing", "emotional lift", "reset"],
      "percussion reset": ["reset", "groove"],
      "liquid release": ["reset", "warm-up"],
      outro: ["warm-up", "groove", "emotional lift", "peak"]
    };
    penalty += softRoles[targetRole]?.some((role) => candidate.roles?.includes(role)) ? 2.5 : 7;
  }
  const energy = estimateFlowTrackEnergy(candidate, data);
  if (position < 0.18 && (candidate.roles?.includes("peak") || energy > 82)) penalty += strategy.earlyPeakPenalty;
  if (position > 0.8 && energy < 42 && !candidate.roles?.includes("outro")) penalty += 5;
  if (index > 1) {
    const maxPeaks = Number(strategy.rules?.maxConsecutivePeaks) || 2;
    const previousPeaks = sequence.slice(-maxPeaks);
    const highImpactRun = previousPeaks.length >= maxPeaks && previousPeaks.every((track) => track.roles?.some((role) => ["peak", "impact"].includes(role)));
    if (highImpactRun && candidate.roles?.some((role) => ["peak", "impact"].includes(role))) penalty += 9;
    const previousTwo = sequence.slice(-2);
    const releaseRun = previousTwo.every((track) => track.roles?.some((role) => ["breathing", "floating release", "reset", "liquid release"].includes(role)));
    if (releaseRun && candidate.roles?.some((role) => ["breathing", "floating release", "reset", "liquid release"].includes(role))) penalty += 8;
  }
  return penalty + Math.abs(energy - targetEnergy) * 0.04;
}

function getFlowVocalSpacingPenalty(sequence = [], candidate = {}, strategy = getGenreSequencingStrategy()) {
  const vocalPresence = candidate.dimensions?.vocalPresence ?? 0.4;
  if (vocalPresence < 0.66) return 0;
  const maxVocals = Number(strategy.rules?.maxConsecutiveVocals) || 2;
  const recentVocals = sequence.slice(-maxVocals).filter((track) => (track.dimensions?.vocalPresence ?? 0.4) >= 0.66).length;
  if (!recentVocals) return 0;
  if (recentVocals < maxVocals) return recentVocals * 2.5;
  return recentVocals * (strategy.id === "tech-house" || strategy.id === "afro-house" ? 7 : 5);
}

function getFlowTextureContinuityPenalty(previous = {}, candidate = {}, strategy = getGenreSequencingStrategy()) {
  const left = previous.dimensions || {};
  const right = candidate.dimensions || {};
  const grooveGap = Math.abs((left.percussionIntensity ?? 0.5) - (right.percussionIntensity ?? 0.5));
  const bassGap = Math.abs((left.bassIntensity ?? 0.5) - (right.bassIntensity ?? 0.5));
  const moodGap = Math.abs((left.emotionalIntensity ?? 0.5) - (right.emotionalIntensity ?? 0.5));
  return grooveGap * 6 * strategy.weights.groove + bassGap * 5 * strategy.weights.bass + moodGap * 3;
}

function getFlowPeakTimingPenalty(candidate = {}, nextIndex = 0, count = 0, strategy = getGenreSequencingStrategy()) {
  const isPeak = candidate.roles?.some((role) => role === "peak" || role === "impact") || false;
  if (!isPeak || count < 6) return 0;
  const position = count <= 1 ? 0 : nextIndex / (count - 1);
  if (position < strategy.peakWindow[0]) return (strategy.peakWindow[0] - position) * strategy.earlyPeakPenalty;
  if (position > 0.96) return 2;
  return position <= strategy.peakWindow[1] ? -2 : 0;
}

function getFlowPrimaryRole(track = {}, data = {}, index = 0, count = 0) {
  const strategy = getGenreSequencingStrategy(data.genre);
  const position = count <= 1 ? 0 : index / (count - 1);
  const releaseKey = getFlowReleaseTransitionKey(data, index, count);
  if (releaseKey) return strategy.releaseRole;
  if (index === 0) return track.roles?.includes("intro") ? "intro" : "warm-up";
  if (index === count - 1) return track.roles?.includes("outro") ? "outro" : "closing groove";
  if (position >= strategy.peakWindow[0] && track.roles?.includes("peak")) return "peak";
  const orderedRole = strategy.roleOrder.find((role) => track.roles?.includes(role));
  return orderedRole || track.roles?.[0] || "groove";
}

function getFlowEnergyDirection(index = 0, values = []) {
  const previous = values[index - 1];
  const current = values[index];
  const next = values[index + 1];
  if (!Number.isFinite(current)) return "steady";
  if (Number.isFinite(previous) && current < previous - 8) return "release";
  if (Number.isFinite(next) && next > current + 8) return "build";
  if (Number.isFinite(next) && next < current - 8) return "peak-to-release";
  return "steady";
}

function getFlowSetSection(index = 0, count = 0) {
  const position = count <= 1 ? 0 : index / (count - 1);
  if (position < 0.18) return "intro";
  if (position < 0.42) return "build";
  if (position < 0.72) return "middle";
  if (position < 0.9) return "peak";
  return "outro";
}

function getFlowTransitionReason(track = {}, previous = null, data = {}, transitionKey = "") {
  if (!previous) return "opens with a controlled intro or groove";
  const tempoGap = Math.abs((track.tempo || 0) - (previous.tempo || track.tempo || 0));
  const keyGap = getFlowCamelotDistance(previous.camelotKey, track.camelotKey);
  const release = /reset|release|breathing|breakdown/.test(normalizeTag(transitionKey));
  if (release) return `${transitionKey} lowers density while keeping the flow connected`;
  if (tempoGap <= 3 && keyGap <= 1.5) return "close BPM and Camelot movement support a smooth blend";
  if (tempoGap <= 5) return "tempo stays close while texture or energy moves the set forward";
  return "placed for energy storytelling despite a wider technical gap";
}

function getFlowTransitionWarnings(track = {}, previous = null, data = {}) {
  if (!previous) return [];
  const warnings = [];
  const tempoGap = Math.abs((track.tempo || 0) - (previous.tempo || track.tempo || 0));
  const keyGap = getFlowCamelotDistance(previous.camelotKey, track.camelotKey);
  if (tempoGap >= 9) warnings.push("large BPM jump");
  if (keyGap >= 4 && !track.metadataEstimated && !previous.metadataEstimated) warnings.push("wide Camelot move");
  if ((track.dimensions?.vocalPresence ?? 0) >= 0.66 && (previous.dimensions?.vocalPresence ?? 0) >= 0.66) warnings.push("back-to-back vocal hooks");
  return warnings;
}

function estimateFlowTrackEnergy(track, data) {
  if (Number.isFinite(Number(track.effectiveEnergy))) return Number(track.effectiveEnergy);
  const tempo = Number(track.tempo) || estimateFlowBpm(data, 0);
  const genre = normalizeTag(track.genre || data.genre);
  const tempoScore = Math.max(0, Math.min(100, ((tempo - 76) / 64) * 100));
  const genreBoost =
    /mainstage|big room|bass|dubstep|techno|trance/.test(genre) ? 12 :
    /house|garage|disco|funk|groove/.test(genre) ? 6 :
    /lo fi|nu soul|jazzy|chill|ambient/.test(genre) ? -10 :
    0;
  return Math.max(8, Math.min(98, tempoScore + genreBoost));
}

function getFlowTargetTempo(data, index, count) {
  const range = (makeFallbackProfile(data.vibe).bpmRange || "96-124").match(/\d+/g)?.map(Number) ?? [96, 124];
  const low = range[0] ?? 96;
  const high = range[1] ?? low + 18;
  const progress = count <= 1 ? 0 : index / (count - 1);
  return low + (high - low) * progress;
}

function getFlowGenreCompatibilityPenalty(left = "", right = "") {
  const a = normalizeTag(left);
  const b = normalizeTag(right);
  if (!a || !b || a === b) return 0;
  const leftFamily = getFlowGenreFamily(a);
  const rightFamily = getFlowGenreFamily(b);
  if (!leftFamily || !rightFamily) return 9;
  if (leftFamily === rightFamily) return 2;
  const pair = [leftFamily, rightFamily].sort().join("|");
  const softPairs = new Set(["deep-melodic|house-groove", "chill-soul|house-groove", "house-groove|pop-dance", "club-rave|deep-melodic", "club-rave|house-groove"]);
  const mediumPairs = new Set(["chill-soul|deep-melodic", "bass|club-rave", "bass|house-groove", "deep-melodic|pop-dance"]);
  if (softPairs.has(pair)) return 5;
  if (mediumPairs.has(pair)) return 9;
  return 16;
}

function getFlowGenreFamily(value = "") {
  const text = normalizeTag(value).replace(/-/g, " ");
  const families = [
    { name: "deep-melodic", terms: ["melodic house", "progressive house", "organic house", "deep house", "afro house"] },
    { name: "house-groove", terms: ["uk garage", "garage", "disco", "funk", "groove", "house"] },
    { name: "club-rave", terms: ["techno", "trance", "mainstage", "big room", "rave"] },
    { name: "bass", terms: ["bass house", "dubstep", "drum and bass", "dnb", "bass"] },
    { name: "chill-soul", terms: ["lo fi", "lofi", "jazzy", "hip hop", "nu soul", "soul", "chill", "ambient"] },
    { name: "pop-dance", terms: ["dance pop", "pop", "dance"] }
  ];
  return families.find((family) => family.terms.some((term) => text.includes(term)))?.name || "";
}

function getFlowCamelotDistance(left = "", right = "") {
  const a = parseFlowCamelotKey(left);
  const b = parseFlowCamelotKey(right);
  if (!a || !b) return 0.75;
  const wheelDistance = Math.min(Math.abs(a.number - b.number), 12 - Math.abs(a.number - b.number));
  const modeDistance = a.mode === b.mode ? 0 : 0.5;
  return wheelDistance + modeDistance;
}

function parseFlowCamelotKey(value = "") {
  const match = normalizeFlowCamelotKey(value).match(/^([1-9]|1[0-2])([AB])$/);
  return match ? { number: Number(match[1]), mode: match[2] } : null;
}

function normalizeFlowCamelotKey(value = "") {
  const match = String(value).trim().match(/\b([1-9]|1[0-2])\s*([ABd])\b/i);
  if (!match) return "";
  const side = match[2].toUpperCase() === "D" ? "B" : match[2].toUpperCase();
  return `${Number(match[1])}${side}`;
}

function getFlowTempoFromMeta(meta = "") {
  const match = String(meta).match(/(\d{2,3}(?:\.\d+)?)\s*BPM/i);
  const tempo = Number(match?.[1]);
  return Number.isFinite(tempo) ? Math.round(tempo) : null;
}

function getFlowCamelotFromMeta(meta = "") {
  return String(meta).match(/\b([1-9]|1[0-2])\s*[ABd]\b/i)?.[0] ?? "";
}

function estimateFlowBpm(data, index) {
  const range = (makeFallbackProfile(data.vibe).bpmRange || "96-124").match(/\d+/g)?.map(Number) ?? [96, 124];
  const low = range[0] ?? 96;
  const high = range[1] ?? low + 18;
  const arc = index < 2 ? low + index * 3 : index < 8 ? low + Math.min(high - low, index * 4) : high - (index % 4) * 2;
  return Math.max(70, Math.min(150, Math.round(arc)));
}

function estimateFlowKey(index) {
  return ["8A", "9A", "9B", "10B", "11B", "10A", "7A", "6B"][index % 8];
}

function parseFlowMustHaveTracks(value = "") {
  return String(value)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      label: line,
      raw: normalizeTag(line),
      title: normalizeTag(line.split(/\s*[-–—]\s*/)[0] || line),
      artist: normalizeTag(line.split(/\s*[-–—]\s*/)[1] || "")
    }))
    .filter((item) => item.raw.length >= 3);
}

function getFlowMustHaveAffinity(track, mustHaveTracks = []) {
  if (!mustHaveTracks.length) return 0;
  const title = normalizeTag(track.title || "");
  const artist = normalizeTag(track.artist || "");
  const combined = `${title} ${artist}`.trim();
  let best = 0;
  mustHaveTracks.forEach((item) => {
    let score = 0;
    if (item.title && (title.includes(item.title) || item.title.includes(title))) score += 0.62;
    if (item.artist && (artist.includes(item.artist) || item.artist.includes(artist))) score += 0.48;
    if (item.raw && (combined.includes(item.raw) || item.raw.includes(combined))) score = Math.max(score, 0.92);
    if (!item.artist && item.title && combined.includes(item.title)) score = Math.max(score, 0.7);
    best = Math.max(best, score);
  });
  return Math.max(0, Math.min(1, best));
}

function getFlowDjReferenceAffinity(track, data = {}) {
  const reference = normalizeTag(`${data.dj || ""} ${data.notes || ""}`);
  if (!reference) return 0;
  const artist = normalizeTag(track.artist || "");
  const title = normalizeTag(track.title || "");
  const genre = normalizeTag(track.genre || data.genre || "");
  const trackText = `${artist} ${title} ${genre}`;
  let score = 0;
  const referenceTokens = reference.split(/[,;/]+|\band\b|\+|&/i).map(normalizeTag).filter((token) => token.length >= 3);
  if (referenceTokens.some((token) => artist.includes(token) || token.includes(artist))) score += 0.75;
  const profiles = [
    { refs: ["lane 8", "sultan", "shepard", "ben bohmer", "yotto", "marsh", "jerro", "le youth", "anjunadeep"], genres: ["melodic house", "progressive house", "deep house"], artists: ["lane 8", "sultan", "shepard", "ben bohmer", "yotto", "marsh", "jerro", "le youth", "tinlicker", "nora en pure", "luttrell", "eli & fur"] },
    { refs: ["keinemusik", "black coffee", "rampa", "adam port", "mochakk"], genres: ["afro house", "deep house", "organic house"], artists: ["keinemusik", "black coffee", "rampa", "adam port", "mochakk"] },
    { refs: ["fred again", "peggy gou", "four tet", "bicep", "bonobo"], genres: ["indie dance", "house", "deep house", "uk garage"], artists: ["fred again", "peggy gou", "four tet", "bicep", "bonobo", "caribou", "jungle"] }
  ];
  profiles.forEach((profile) => {
    if (!profile.refs.some((ref) => reference.includes(ref))) return;
    if (profile.artists.some((name) => trackText.includes(name))) score += 0.55;
    if (profile.genres.some((name) => genre.includes(name))) score += 0.25;
  });
  return Math.max(0, Math.min(1, score));
}

function getFlowArtistRepeatPenalty(sequence = [], candidate = {}, data = {}, poolContext = []) {
  const candidateArtist = getFlowPrimaryArtist(candidate.artist);
  if (!candidateArtist) return 0;
  const recentTracks = sequence.slice(-3);
  const samePrevious = isFlowSamePrimaryArtist(sequence.at(-1)?.artist, candidate.artist);
  const recentSameCount = recentTracks.filter((track) => isFlowSamePrimaryArtist(track.artist, candidate.artist)).length;
  if (!samePrevious && !recentSameCount) return 0;
  let penalty = samePrevious ? 8 : 3;
  if (recentSameCount >= 2) penalty += 6;
  const artistShare = getFlowArtistShare(candidateArtist, poolContext);
  const isPreferred = normalizeTag(`${data.dj || ""} ${data.mustHave || ""} ${data.notes || ""}`).includes(candidateArtist);
  if (artistShare >= 0.25) penalty *= 0.45;
  if (isPreferred) penalty *= 0.38;
  return penalty;
}

function isFlowSamePrimaryArtist(left = "", right = "") {
  const a = getFlowPrimaryArtist(left);
  const b = getFlowPrimaryArtist(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b));
}

function getFlowPrimaryArtist(value = "") {
  return normalizeTag(value).split(/\s*(?:,|&|\+|\bx\b|\bfeat\.?\b|\bfeaturing\b|\bwith\b)\s*/i).find(Boolean) || "";
}

function getFlowArtistShare(primaryArtist = "", poolContext = []) {
  if (!primaryArtist || !poolContext.length) return 0;
  return poolContext.filter((track) => isFlowSamePrimaryArtist(track.artist, primaryArtist)).length / poolContext.length;
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
    "Tech house",
    "Deep house",
    "Melodic house",
    "Organic house",
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
  if (value.includes("tech house")) return "Tech house";
  if (value.includes("organic house") || value.includes("organic downtempo")) return "Organic house";
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
    ["Tech house", ["tech house", "chris lake", "fisher", "john summit", "mau p", "cloonee", "pawsa", "green velvet", "walker & royce"]],
    ["Organic house", ["organic house", "satori", "bedouin", "monolink", "yokoo", "lee burridge", "all day i dream", "desert", "organic"]],
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
    "https://mixoryflow.com",
    "https://www.mixoryflow.com",
    "https://hotpotbubblet.github.io"
  ]);
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.has(origin) ? origin : "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
