import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const generatedPath = join(rootDir, "reference_sets", "generated", "reference-sets.json");
const firstExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-2026-06-26.txt");
const secondExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-ukg-bass-afro-disco-2026-06-26.txt");
const thirdExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-lofi-coffee-disco-bass-2026-06-26.txt");

const firstExpansionConfigs = [
  {
    id: "gun-gun-chill-vibe-brunch-coffee",
    heading: "Chill Vibe Mix (Brunch & Coffee)",
    name: "Chill Vibe Mix (Brunch & Coffee) by Gun Gun",
    dj: "Gun Gun",
    genres: ["lo-fi", "nu soul"],
    vibes: ["morning coffee", "brunch", "chill"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "above-beyond-edc-las-vegas-2026",
    heading: "Above & Beyond: Live from EDC Las Vegas 2026",
    name: "Above & Beyond: Live from EDC Las Vegas 2026",
    dj: "Above & Beyond",
    genres: ["trance"],
    vibes: ["festival", "euphoric", "mainstage"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "armin-van-buuren-edc-las-vegas-2026",
    heading: "Armin van Buuren live at EDC Las Vegas 2026",
    name: "Armin van Buuren live at EDC Las Vegas 2026",
    dj: "Armin van Buuren",
    genres: ["trance"],
    vibes: ["festival", "euphoric", "mainstage"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "charlotte-de-witte-edc-las-vegas-2026",
    heading: "Charlotte de Witte at EDC Las Vegas 2026",
    name: "Charlotte de Witte at EDC Las Vegas 2026",
    dj: "Charlotte de Witte",
    genres: ["techno"],
    vibes: ["festival", "peak time", "dark club"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "carl-cox-we-belong-here-brooklyn",
    heading: "Carl Cox - DJ Set - We Belong Here - Brooklyn",
    name: "Carl Cox - DJ Set - We Belong Here - Brooklyn, New York",
    dj: "Carl Cox",
    genres: ["techno", "house"],
    vibes: ["club", "peak time", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "solomun-edc-las-vegas-2026",
    heading: "Solomun Live at EDC Las Vegas 2026",
    name: "Solomun Live at EDC Las Vegas 2026",
    dj: "Solomun",
    genres: ["deep house"],
    vibes: ["after party", "deep", "festival"],
    defaultInputFormat: "mixed"
  },
  {
    id: "nora-en-pure-edc-vegas-2025",
    heading: "Nora En Pure @ EDC Vegas",
    name: "Nora En Pure @ EDC Vegas | May 2025",
    dj: "Nora En Pure",
    genres: ["deep house", "melodic house"],
    vibes: ["sunset", "festival", "melodic"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "dj-komori-neo-soul-mellow-rnb",
    heading: "DJ KOMORI Neo Soul & Mellow R&B Mix",
    name: "DJ KOMORI Neo Soul & Mellow R&B Mix",
    dj: "DJ KOMORI",
    genres: ["nu soul", "r&b"],
    vibes: ["chill", "brunch", "morning coffee"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "gun-gun-wav-session-16-rnb-neo-soul",
    heading: "GUN GUN Wav Session 16",
    name: "GUN GUN Wav Session 16: 1990s-2000s R&B / Neo Soul",
    dj: "Gun Gun",
    genres: ["nu soul", "r&b"],
    vibes: ["chill", "morning coffee", "nostalgic"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "anjunadeep-roadtrip-2023",
    heading: "Anjunadeep Roadtrip",
    name: "Anjunadeep Roadtrip | Deep Melodic House Mix 2023",
    dj: "Anjunadeep",
    genres: ["melodic house", "progressive house"],
    vibes: ["road trip", "sunset", "melodic"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "andy-c-rampage-2018",
    heading: "Andy C feat. MC Tonn Piper Rampage 2018",
    name: "Andy C feat. MC Tonn Piper Rampage 2018",
    dj: "Andy C",
    genres: ["drum and bass"],
    vibes: ["workout", "high energy", "festival"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "sub-focus-dnb-allstars-360",
    heading: "Sub Focus | Live From DnB Allstars 360",
    name: "Sub Focus | Live From DnB Allstars 360",
    dj: "Sub Focus",
    genres: ["drum and bass"],
    vibes: ["workout", "high energy", "festival"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "fred-again-rooftop-live-aruns-roof",
    heading: "Fred again.. - Rooftop Live",
    name: "Fred again.. - Rooftop Live (Arun's Roof, London)",
    dj: "Fred again..",
    genres: ["uk garage", "house"],
    vibes: ["rooftop", "emotional", "club"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "james-hype-edc-las-vegas-2025",
    heading: "James Hype live @ EDC Las Vegas 2025",
    name: "James Hype live @ EDC Las Vegas 2025, Kinetic Field",
    dj: "James Hype",
    genres: ["tech house", "house"],
    vibes: ["festival", "club", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "john-summit-ultra-miami-main-stage-2026",
    heading: "JOHN SUMMIT LIVE @ ULTRA MIAMI MAIN STAGE 2026",
    name: "John Summit Live @ Ultra Miami Main Stage 2026",
    dj: "John Summit",
    genres: ["mainstage", "big room", "tech house", "house"],
    vibes: ["festival", "mainstage", "peak time"],
    defaultInputFormat: "artist-title"
  }
];

const secondExpansionConfigs = [
  {
    id: "disclosure-kindred-radio-london",
    heading: "Disclosure DJ Set - London // Kindred Radio",
    name: "Disclosure DJ Set - London // Kindred Radio",
    dj: "Disclosure",
    genres: ["uk garage", "house"],
    vibes: ["club", "london", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "mj-cole-in-waves-radio",
    heading: "MJ COLE IN WAVES RADIO",
    name: "MJ Cole In Waves Radio",
    dj: "MJ Cole",
    genres: ["uk garage", "2-step"],
    vibes: ["club", "london", "shuffle"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "knock2-room202",
    heading: "Knock2 Presents ROOM202",
    name: "Knock2 Presents ROOM202",
    dj: "Knock2",
    genres: ["bass house", "mainstage"],
    vibes: ["festival", "high energy", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "joyryde-electric-mile",
    heading: "JOYRYDE at Electric Mile",
    name: "JOYRYDE at Electric Mile",
    dj: "JOYRYDE",
    genres: ["bass house", "dubstep", "drum and bass"],
    vibes: ["festival", "high energy", "club"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "mochakk-coachella-2026",
    heading: "Mochakk @ Coachella 2026",
    name: "Mochakk @ Coachella 2026",
    dj: "Mochakk",
    genres: ["afro house", "tech house", "house"],
    vibes: ["festival", "groove", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "shimza-cercle-citadelle-de-sisteron",
    heading: "Shimza for Cercle at Citadelle de Sisteron",
    name: "Shimza for Cercle at Citadelle de Sisteron, France",
    dj: "Shimza",
    genres: ["afro house", "organic house", "deep house"],
    vibes: ["sunset", "organic", "outdoor"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "purple-disco-machine-in-the-house",
    heading: "Purple Disco Machine In The House",
    name: "Purple Disco Machine In The House",
    dj: "Purple Disco Machine",
    genres: ["nu disco", "funky house", "indie dance"],
    vibes: ["friday night", "bright", "groove"],
    defaultInputFormat: "artist-title"
  }
];

const thirdExpansionConfigs = [
  {
    id: "nujabes-jazzy-hiphop-elly",
    heading: "Nujabes | Jazzy Hiphop Set | Elly",
    name: "Nujabes | Jazzy Hiphop Set | Elly",
    dj: "Elly",
    genres: ["lo-fi", "jazzy hip hop", "hip hop"],
    vibes: ["chill", "morning coffee", "nostalgic"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "lika-morning-coffee-grooves",
    heading: "LIKA - Morning coffee grooves",
    name: "LIKA - Morning coffee grooves",
    dj: "LIKA",
    genres: ["deep house", "funky house", "groovy house"],
    vibes: ["morning coffee", "brunch", "day drinking"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "never-dull-disco-house-boogie-brooklyn",
    heading: "Disco House Boogie Mix in Brooklyn",
    name: "Disco House Boogie Mix in Brooklyn | Never Dull",
    dj: "Never Dull",
    genres: ["disco house", "funky house", "nu disco"],
    vibes: ["friday night", "bright", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "wax-motif-edc-las-vegas-2026",
    heading: "WAX MOTIF LIVE @ EDC LAS VEGAS 2026",
    name: "Wax Motif Live @ EDC Las Vegas 2026",
    dj: "Wax Motif",
    genres: ["bass house", "tech house", "house"],
    vibes: ["festival", "club", "peak time"],
    defaultInputFormat: "artist-title"
  }
];

const existing = JSON.parse(readFileSync(generatedPath, "utf8"));
const parsedSets = [
  ...parseExpansion(normalizeText(readFileSync(firstExpansionPath, "utf8")), firstExpansionConfigs),
  ...parseExpansion(normalizeText(readFileSync(secondExpansionPath, "utf8")), secondExpansionConfigs),
  ...parseExpansion(normalizeText(readFileSync(thirdExpansionPath, "utf8")), thirdExpansionConfigs)
];
const parsedIds = new Set(parsedSets.map((set) => set.id));

const nextLibrary = {
  ...existing,
  generatedAt: new Date().toISOString(),
  note: "Raw text is preserved in reference_sets/raw/. Parsed tracks are a local index for flow learning; ID/unreleased/layered lines are intentionally retained.",
  sets: [
    ...(existing.sets ?? []).filter((set) => !parsedIds.has(set.id)),
    ...parsedSets
  ]
};

writeFileSync(generatedPath, `${JSON.stringify(nextLibrary, null, 2)}\n`);

console.log(`Added/updated ${parsedSets.length} reference sets.`);
console.log(`Reference library now has ${nextLibrary.sets.length} sets and ${nextLibrary.sets.reduce((sum, set) => sum + (set.stats?.trackCount ?? 0), 0)} parsed tracks.`);

function parseExpansion(raw, configs) {
  return configs.map((config, index) => {
    const start = raw.indexOf(config.heading);
    if (start === -1) {
      throw new Error(`Could not find heading: ${config.heading}`);
    }
    const nextStarts = configs
      .slice(index + 1)
      .map((next) => raw.indexOf(next.heading, start + config.heading.length))
      .filter((position) => position !== -1);
    const end = nextStarts.length ? Math.min(...nextStarts) : raw.length;
    const block = raw.slice(start, end);
    const tracks = block
      .split(/\n+/)
      .map((line) => parseTrackLine(line, config))
      .filter(Boolean);

    return {
      id: config.id,
      name: config.name,
      dj: config.dj,
      sourceType: "user-curated",
      genres: config.genres,
      vibes: config.vibes,
      defaultInputFormat: config.defaultInputFormat,
      stats: {
        trackCount: tracks.length,
        timedTracks: tracks.filter((track) => track.time).length,
        layeredElements: tracks.filter((track) => track.isLayer).length,
        idTracks: tracks.filter((track) => track.isId).length
      },
      tracks
    };
  });
}

function parseTrackLine(input, config) {
  const raw = input.trim();
  if (!raw || shouldSkipLine(raw, config)) return null;

  let line = raw;
  let time = "";
  let isLayer = false;

  if (/^w\/\s*/i.test(line)) {
    isLayer = true;
    line = line.replace(/^w\/\s*/i, "").trim();
  }

  const timeMatch = line.match(/^(?:\d+\.\s*)?(?:[\[(])?(\d{1,2}:\d{2}(?::\d{2})?)(?:[\])])?\s*(?:[|—-]\s*)?/);
  if (timeMatch) {
    time = timeMatch[1];
    line = line.slice(timeMatch[0].length).trim();
  }

  line = line
    .replace(/^\d+\.\s*/, "")
    .replace(/^\d{1,3}\s*[-.)]\s*/, "")
    .replace(/^\d{1,3}\s+/, "")
    .replace(/\s+\[[^\]]+\]\s*$/g, "")
    .trim();

  if (!line || shouldSkipLine(line, config)) return null;

  const parsed = splitArtistTitle(line, config.defaultInputFormat);
  if (!parsed.title && !parsed.artist) return null;

  return {
    raw,
    time,
    artist: parsed.artist,
    title: parsed.title,
    label: extractLabel(raw),
    isLayer,
    isId: /\bID\b/i.test(parsed.artist) || /\bID\b/i.test(parsed.title)
  };
}

function splitArtistTitle(line, format) {
  const slashParts = line.split(/\s+\/\s+/);
  if (slashParts.length === 2 && format === "title-artist") {
    return cleanPair({ title: slashParts[0], artist: slashParts[1] });
  }

  const parts = line.split(/\s+(?:—|–|-)\s+|(?:—|–|-)/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const left = parts[0];
    const right = parts.slice(1).join(" - ");
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(right)) return cleanPair({ artist: "", title: left });
    if (format === "title-artist") return cleanPair({ title: left, artist: right });
    if (format === "mixed") return guessMixedPair(left, right);
    return cleanPair({ artist: left, title: right });
  }

  return cleanPair({ artist: "", title: line });
}

function guessMixedPair(left, right) {
  const idLike = /^id$/i;
  if (idLike.test(left) || looksLikeArtist(right)) return cleanPair({ title: left, artist: right });
  if (looksLikeArtist(left)) return cleanPair({ artist: left, title: right });
  return cleanPair({ title: left, artist: right });
}

function looksLikeArtist(value = "") {
  return /&|feat\.|ft\.|vs\.|pres\.|solomun|skrillex|nora|rampa|fred|john summit|above|armin|sub focus|andy c|james hype|charlotte|carl cox|disclosure|mj cole|knock2|joyryde|mochakk|shimza|purple disco machine/i.test(value);
}

function cleanPair(pair) {
  return {
    artist: cleanTrackText(pair.artist ?? ""),
    title: cleanTrackText(pair.title ?? "")
  };
}

function cleanTrackText(value) {
  return String(value)
    .replace(/\s+\[[^\]]+\]\s*$/g, "")
    .replace(/\s*(?:-|—|–)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/g, "")
    .replace(/\s+\((?:anjunabeats|atlantic|warner music|ninja|polydor|kntxt|armada|kontor|exhale|iboga|alteza|smash the house|all ways dance|ninetozero|be yourself|unfaced|electric ballroom)[^)]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLabel(raw) {
  const square = raw.match(/\[([^\]]+)\]\s*$/);
  if (square) return square[1].trim();
  const paren = raw.match(/\(([^()]+)\)\s*$/);
  return paren && /^[A-Z0-9 &.'-]+$/.test(paren[1]) ? paren[1].trim() : "";
}

function shouldSkipLine(line, config) {
  const lower = line.toLowerCase();
  return [
    "lofi",
    "trance:",
    "tracklist:",
    "techno:",
    "deep house:",
    "neo soul",
    "road trip:",
    "dnb:",
    "uk garage",
    "tech house",
    "festival house/big room"
  ].some((heading) => lower === heading || lower.startsWith(`${heading} `))
    || lower.includes(config.heading.toLowerCase())
    || lower.includes(config.name.toLowerCase());
}

function normalizeText(value) {
  return value
    .replace(/\u2028/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}
