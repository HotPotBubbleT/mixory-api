import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(".");
const referencePath = join(rootDir, "reference_sets", "generated", "reference-sets.json");
const metadataPath = join(rootDir, "data_sources", "generated", "reference-track-metadata.json");
const cachePath = join(rootDir, "data_sources", "generated", "reference-api-cache.json");
const appUserAgent = "Mixory/0.1 (https://mixoryflow.com)";
const limit = Number(process.env.REFERENCE_LABEL_LIMIT ?? process.argv[2] ?? 25);
const musicBrainzDelayMs = Number(process.env.MUSICBRAINZ_DELAY_MS ?? 1300);
const apiDelayMs = Number(process.env.REFERENCE_API_DELAY_MS ?? 800);
const apiState = {
  shouldStop: false,
  stopReason: ""
};
const verbose = process.env.REFERENCE_LABEL_VERBOSE === "1";

loadEnv();

const config = {
  getSongBpmApiKey: process.env.GETSONGBPM_API_KEY ?? "",
  lastFmApiKey: process.env.LASTFM_API_KEY ?? ""
};

if (!existsSync(referencePath)) {
  console.error(`Missing reference library: ${referencePath}`);
  process.exit(1);
}

mkdirSync(join(rootDir, "data_sources", "generated"), { recursive: true });

const library = JSON.parse(readFileSync(referencePath, "utf8"));
const existingMetadata = loadMetadata();
const cache = loadCache();
const referenceTracks = collectReferenceTracks(library);
const candidates = referenceTracks.filter((track) => needsMoreMetadata(track, existingMetadata.get(track.key)) && !hasApiAttempt(track));
const batch = candidates.slice(0, Math.max(0, limit));
let updated = 0;

console.log(`Reference tracks: ${referenceTracks.length}`);
console.log(`Need more labels: ${candidates.length}`);
console.log(`This run limit: ${batch.length}`);

for (const [index, track] of batch.entries()) {
  if (apiState.shouldStop) break;
  if (verbose) console.log(`[${index + 1}/${batch.length}] ${track.title} | ${track.artist}`);
  const current = existingMetadata.get(track.key) ?? makeBaseMetadata(track);
  const apiMetadata = await lookupTrackMetadata(track);
  const merged = mergeMetadata(current, apiMetadata);
  existingMetadata.set(track.key, merged);
  if (apiMetadata.sources.length) updated += 1;
  writeMetadata(existingMetadata);
  writeCache(cache);
  await sleep(apiDelayMs);
}

console.log(`Updated from API this run: ${updated}`);
if (apiState.shouldStop) console.log(`Stopped early: ${apiState.stopReason}`);
console.log(`Metadata rows: ${existingMetadata.size}`);
console.log(`Wrote: ${metadataPath}`);
console.log("Next step when ready: node scripts/enrich-reference-labels.mjs");

function collectReferenceTracks(data) {
  const seen = new Set();
  const rows = [];
  for (const set of Array.isArray(data.sets) ? data.sets : []) {
    for (const track of Array.isArray(set.tracks) ? set.tracks : []) {
      if (!track.title || !track.artist || track.isId) continue;
      const key = makeTrackKey(track.title, track.artist);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        title: track.title,
        artist: track.artist,
        referenceSetId: set.id,
        referenceSet: set.name,
        dj: set.dj
      });
    }
  }
  return rows;
}

function needsMoreMetadata(track, metadata = {}) {
  const genres = Array.isArray(metadata.genres) ? metadata.genres : [];
  return !metadata.mbid || !metadata.tempo || !metadata.key || !genres.length;
}

async function lookupTrackMetadata(track) {
  const cacheKey = makeApiCacheKey(track);
  if (cache[cacheKey]?.sources?.length || cache[cacheKey]?.confirmedMiss) return cache[cacheKey];
  const queryTrack = {
    ...track,
    title: cleanReferenceTitleForLookup(track.title),
    artist: cleanReferenceArtistForLookup(track.artist)
  };

  const result = {
    title: track.title,
    artist: track.artist,
    mbid: "",
    tempo: null,
    key: "",
    scale: "",
    danceability: null,
    durationMs: null,
    genres: [],
    confidence: "medium",
    sources: []
  };

  const musicBrainz = await lookupMusicBrainz(queryTrack);
  if (musicBrainz) {
    result.mbid = musicBrainz.mbid;
    result.title = musicBrainz.title || result.title;
    result.artist = musicBrainz.artist || result.artist;
    result.genres.push(...musicBrainz.tags);
    result.confidence = musicBrainz.score >= 90 ? "high" : "medium";
    result.sources.push("musicbrainz");
  }

  await sleep(apiDelayMs);
  const getSongBpm = config.getSongBpmApiKey ? await lookupGetSongBpm(queryTrack) : null;
  if (getSongBpm) {
    result.tempo = getSongBpm.tempo;
    result.key = getSongBpm.key || result.key;
    result.danceability = getSongBpm.danceability ?? result.danceability;
    result.genres.push(...getSongBpm.genres);
    result.sources.push("getsongbpm");
  }

  await sleep(apiDelayMs);
  const lastFm = config.lastFmApiKey ? await lookupLastFm(queryTrack) : null;
  if (lastFm) {
    result.durationMs = lastFm.durationMs ?? result.durationMs;
    result.genres.push(...lastFm.tags);
    result.sources.push("lastfm");
  }

  result.genres = uniqueClean(result.genres).slice(0, 12);
  result.confirmedMiss = result.sources.length === 0;
  cache[cacheKey] = result;
  return result;
}

function isKnownApiMiss(track) {
  const cached = cache[makeApiCacheKey(track)];
  return Boolean(cached?.confirmedMiss);
}

function hasApiAttempt(track) {
  const cached = cache[makeApiCacheKey(track)];
  return Boolean(cached?.sources?.length || cached?.confirmedMiss);
}

function makeApiCacheKey(track) {
  return `${track.key}::${normalizeText(cleanReferenceTitleForLookup(track.title))}::${normalizeText(cleanReferenceArtistForLookup(track.artist))}`;
}

function cleanReferenceTitleForLookup(title = "") {
  let value = String(title);
  value = value.replace(/\s+(MOBLACK|KEINEMUSIK|CALAMAR|MACCABI HOUSE|PARANORMAL SOCIETY|REALM|TRR|BEB[ÉE]|G-TOWN RECORDS|ARMADA|ROOM TWO|XL|COLUMBIA \(SONY\)|TESSELLATE|THREE SIX ZERO|WOOZ!)$/i, "");
  value = value.replace(/\s+[A-Z][A-Z0-9&'!. -]{2,}$/g, (match) => {
    const words = match.trim().split(/\s+/);
    return words.length <= 4 ? "" : match;
  });
  return value.trim();
}

function cleanReferenceArtistForLookup(artist = "") {
  return String(artist)
    .replace(/\s+(ft\.|feat\.)\s+.+$/i, "")
    .trim();
}

async function lookupMusicBrainz(track) {
  const candidates = [
    { title: track.title, artist: track.artist },
    { title: track.artist, artist: track.title }
  ];

  let best = null;
  for (const [index, candidate] of candidates.entries()) {
    await sleep(musicBrainzDelayMs);
    const match = await searchMusicBrainz(candidate.title, candidate.artist);
    if (!match) continue;
    const scored = { ...match, candidateIndex: index };
    if (!best || scored.score > best.score || (scored.score === best.score && scored.candidateIndex < best.candidateIndex)) {
      best = scored;
    }
  }

  return best;
}

async function searchMusicBrainz(title, artist) {
  const params = new URLSearchParams({
    query: `recording:"${escapeMusicBrainzQuery(title)}" AND artist:"${escapeMusicBrainzQuery(artist)}"`,
    fmt: "json",
    limit: "3"
  });

  try {
    const response = await fetch(`https://musicbrainz.org/ws/2/recording?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (isRateLimited(response)) {
      apiState.shouldStop = true;
      apiState.stopReason = `MusicBrainz returned ${response.status}`;
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json();
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    const best = recordings.find((recording) => Number(recording.score) >= 80) ?? recordings[0];
    if (!best || Number(best.score) < 70) return null;

    return {
      mbid: best.id,
      title: best.title || title,
      artist: getMusicBrainzArtistCredit(best) || artist,
      score: Number(best.score),
      tags: normalizeTagRows(best.tags)
    };
  } catch {
    return null;
  }
}

async function lookupGetSongBpm(track) {
  const params = new URLSearchParams({
    api_key: config.getSongBpmApiKey,
    type: "both",
    lookup: `song:${track.title} artist:${track.artist}`,
    limit: "1"
  });

  try {
    const response = await fetch(`https://api.getsong.co/search/?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (isRateLimited(response)) {
      apiState.shouldStop = true;
      apiState.stopReason = `GetSongBPM returned ${response.status}`;
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json();
    const match = Array.isArray(data.search) ? data.search[0] : null;
    if (!isAcceptableGetSongBpmMatch(match, track.title, track.artist)) return null;
    const artist = Array.isArray(match.artist) ? match.artist[0] : match.artist;
    return {
      tempo: toNumber(match.tempo),
      key: match.open_key || match.key_of || "",
      danceability: normalizeDanceability(match.danceability),
      genres: Array.isArray(artist?.genres) ? artist.genres : []
    };
  } catch {
    return null;
  }
}

async function lookupLastFm(track) {
  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: config.lastFmApiKey,
    artist: track.artist,
    track: track.title,
    autocorrect: "1",
    format: "json"
  });

  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      headers: { "User-Agent": appUserAgent }
    });
    if (isRateLimited(response)) {
      apiState.shouldStop = true;
      apiState.stopReason = `Last.fm returned ${response.status}`;
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json();
    if (data.error === 29) {
      apiState.shouldStop = true;
      apiState.stopReason = "Last.fm rate limit exceeded";
      return null;
    }
    if (!data.track) return null;
    return {
      durationMs: toNumber(data.track.duration),
      tags: normalizeTagRows(data.track.toptags?.tag)
    };
  } catch {
    return null;
  }
}

function mergeMetadata(current, incoming) {
  const currentIsAcoustic = String(current.source ?? "").includes("acousticbrainz");
  const incomingSources = Array.isArray(incoming.sources) ? incoming.sources : [];
  const source = uniqueClean([
    ...(String(current.source ?? "").split("+").filter(Boolean)),
    ...incomingSources
  ]).join("+") || current.source || "api-reference-labeler";

  return {
    ...current,
    artist: current.artist || incoming.artist,
    title: current.title || incoming.title,
    mbid: current.mbid || incoming.mbid,
    tempo: currentIsAcoustic && current.tempo ? current.tempo : current.tempo ?? incoming.tempo,
    key: currentIsAcoustic && current.key ? current.key : current.key || incoming.key,
    scale: currentIsAcoustic && current.scale ? current.scale : current.scale || incoming.scale,
    danceability: currentIsAcoustic && current.danceability !== null ? current.danceability : current.danceability ?? incoming.danceability,
    durationMs: current.durationMs ?? incoming.durationMs,
    genres: uniqueClean([...(current.genres ?? []), ...(incoming.genres ?? [])]).slice(0, 12),
    confidence: current.confidence || incoming.confidence || "medium",
    source
  };
}

function makeBaseMetadata(track) {
  return {
    artist: track.artist,
    title: track.title,
    referenceSetId: track.referenceSetId,
    referenceSet: track.referenceSet,
    dj: track.dj,
    mbid: "",
    tempo: null,
    key: "",
    scale: "",
    danceability: null,
    durationMs: null,
    genres: [],
    source: ""
  };
}

function loadMetadata() {
  if (!existsSync(metadataPath)) return new Map();
  const data = JSON.parse(readFileSync(metadataPath, "utf8"));
  const rows = Array.isArray(data.tracks) ? data.tracks : [];
  return new Map(rows.filter((row) => row.title && row.artist).map((row) => [makeTrackKey(row.title, row.artist), row]));
}

function writeMetadata(rowsByKey) {
  const tracks = [...rowsByKey.values()].sort((left, right) => {
    const setCompare = String(left.referenceSet ?? "").localeCompare(String(right.referenceSet ?? ""));
    return setCompare || String(left.artist ?? "").localeCompare(String(right.artist ?? "")) || String(left.title ?? "").localeCompare(String(right.title ?? ""));
  });
  writeFileSync(metadataPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "mixed-local-and-slow-api-reference-labels",
    trackCount: tracks.length,
    tracks
  }, null, 2)}\n`);
}

function loadCache() {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(data) {
  writeFileSync(cachePath, `${JSON.stringify(data, null, 2)}\n`);
}

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

function isAcceptableGetSongBpmMatch(match, title, artist) {
  if (!match) return false;
  const requestedTitle = normalizeText(title);
  const requestedArtist = normalizeText(artist);
  const matchedTitle = normalizeText(match.title || match.song_title || match.song?.title || match.name || "");
  const matchedArtist = normalizeText(getGetSongBpmArtistName(match));
  const titleOk = !matchedTitle || includesPhrase(matchedTitle, requestedTitle) || includesPhrase(requestedTitle, matchedTitle) || tokenOverlap(matchedTitle, requestedTitle) >= 0.66;
  const artistOk = !matchedArtist || includesPhrase(matchedArtist, requestedArtist) || includesPhrase(requestedArtist, matchedArtist) || tokenOverlap(matchedArtist, requestedArtist) >= 0.5;
  return titleOk && artistOk;
}

function getGetSongBpmArtistName(match = {}) {
  const artist = Array.isArray(match.artist) ? match.artist[0] : match.artist;
  if (typeof artist === "string") return artist;
  return artist?.name || artist?.title || "";
}

function getMusicBrainzArtistCredit(recording) {
  return (recording["artist-credit"] ?? [])
    .map((credit) => `${credit.name ?? credit.artist?.name ?? ""}${credit.joinphrase ?? ""}`)
    .join("")
    .trim();
}

function normalizeTagRows(tags) {
  const rows = Array.isArray(tags) ? tags : tags ? [tags] : [];
  return rows
    .map((tag) => String(tag.name ?? tag).trim())
    .filter(Boolean)
    .filter((tag) => !/seen live|favorites?|fixme|under 2000 listeners/i.test(tag));
}

function uniqueClean(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function escapeMusicBrainzQuery(value = "") {
  return String(value).replace(/["\\]/g, " ");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDanceability(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function isRateLimited(response) {
  return response.status === 429 || response.status === 403;
}

function tokenOverlap(left = "", right = "") {
  const leftTokens = new Set(left.split(/\s+/).filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(/\s+/).filter((token) => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / Math.min(leftTokens.size, rightTokens.size);
}

function includesPhrase(haystack = "", needle = "") {
  if (!haystack || !needle) return false;
  if (needle.length <= 3) return haystack.split(/\s+/).includes(needle);
  return haystack.includes(needle);
}

function makeTrackKey(title = "", artist = "") {
  return `${normalizeText(title)}::${normalizeText(artist)}`;
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*(remix|edit|version|mix|demo|live)[^)]*\)/gi, " ")
    .replace(/\[[^\]]*(remix|edit|version|mix|demo|live)[^\]]*\]/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
