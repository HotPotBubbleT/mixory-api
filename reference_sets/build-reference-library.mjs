import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const generatedPath = join(rootDir, "reference_sets", "generated", "reference-sets.json");
const firstExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-2026-06-26.txt");
const secondExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-ukg-bass-afro-disco-2026-06-26.txt");
const thirdExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-lofi-coffee-disco-bass-2026-06-26.txt");
const fourthExpansionPath = join(rootDir, "reference_sets", "raw", "tracklist-expansion-public-test-2026-07-02.txt");

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

const fourthExpansionConfigs = [
  {
    id: "dua-lipa-blessed-madonna-club-future-nostalgia",
    heading: "Dua Lipa & The Blessed Madonna - Club Future Nostalgia",
    name: "Dua Lipa & The Blessed Madonna - Club Future Nostalgia",
    dj: "The Blessed Madonna",
    genres: ["pop dance", "mainstream dance", "house"],
    vibes: ["party", "bright", "friday night"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "calvin-harris-ultra-miami-2024",
    heading: "Calvin Harris - Live at Ultra Music Festival Miami 2024",
    name: "Calvin Harris - Live at Ultra Music Festival Miami 2024",
    dj: "Calvin Harris",
    genres: ["mainstage", "pop dance", "big room", "house"],
    vibes: ["festival", "mainstage", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "tomorrowland-2025-mainstream-dance",
    heading: "Tomorrowland 2025",
    name: "Tomorrowland 2025 Mainstream Dance Mix",
    dj: "Various DJs",
    genres: ["mainstage", "pop dance", "big room"],
    vibes: ["festival", "mainstage", "party"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "jozier-wine-down-vol-2",
    heading: "Wine Down Vol. 2",
    name: "Wine Down Vol. 2: Mashups, R&B, Afrobeats, Hip-Hop",
    dj: "JOZIER",
    genres: ["r&b", "hip hop", "afrobeats"],
    vibes: ["chill", "party", "after party"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "baby-vaye-playgrnd-hiphop-rnb-club-edits",
    heading: "HIP-HOP, R&B, CLUB EDITS",
    name: "PLAYGRND Series | Baby Vaye | Hip-hop, R&B, Club Edits",
    dj: "Baby Vaye",
    genres: ["hip hop", "r&b", "club edits"],
    vibes: ["party", "club", "high energy"],
    defaultInputFormat: "mixed"
  },
  {
    id: "dcr-milda-playgrnd-hiphop-rnb-amapiano",
    heading: "PLAYGRND SERIES | DCR MILDA",
    name: "PLAYGRND Series | DCR Milda | Hip-hop, R&B, Amapiano, Electronic",
    dj: "DCR Milda",
    genres: ["hip hop", "r&b", "amapiano", "electronic"],
    vibes: ["party", "club", "eclectic"],
    defaultInputFormat: "mixed"
  },
  {
    id: "healing-amapiano-bali",
    heading: "Healing Amapiano Mix | Bali",
    name: "Healing Amapiano Mix | Bali",
    dj: "Amapiano Reference",
    genres: ["amapiano", "afro house", "afrobeats"],
    vibes: ["sunset", "chill", "organic"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "shimza-camden-roundhouse-london",
    heading: "Shimza Live From Camden Roundhouse",
    name: "Shimza Live From Camden Roundhouse, London",
    dj: "Shimza",
    genres: ["afro house", "organic house", "deep house"],
    vibes: ["club", "sunset", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "black-coffee-lets-pipa-new-years-2026",
    heading: "Black Coffee live @Let's Pipa New Years 2026",
    name: "Black Coffee live @ Let's Pipa New Years 2026",
    dj: "Black Coffee",
    genres: ["afro house", "organic house", "deep house"],
    vibes: ["sunset", "deep", "after party"],
    defaultInputFormat: "mixed"
  },
  {
    id: "dj-niktel-funk-disco-nu-disco-studio24",
    heading: "Funk, Disco & Nu Disco Grooves",
    name: "Funk, Disco & Nu Disco Grooves | DJ NIKTEL | STUDIO24 Sessions",
    dj: "DJ NIKTEL",
    genres: ["nu disco", "funk", "disco"],
    vibes: ["groove", "bright", "friday night"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "harry-romero-defected-disco-house-summer-2026",
    heading: "Disco House - Defected - Mixed by Harry Romero",
    name: "Disco House - Defected - Mixed by Harry Romero Summer Mix 2026",
    dj: "Harry Romero",
    genres: ["disco house", "funky house", "soulful house"],
    vibes: ["summer", "groove", "party"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "defected-glitterbox-summer-soundtrack-2022",
    heading: "Disco House - Defected x Glitterbox",
    name: "Disco House - Defected x Glitterbox - Summer Soundtrack Mix 2022",
    dj: "Glitterbox",
    genres: ["disco house", "soulful house", "nu disco"],
    vibes: ["summer", "bright", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "nujabes-compilation-best-of",
    heading: "Nujabes Compilation",
    name: "Nujabes Compilation | Best of Nujabes",
    dj: "Nujabes Reference",
    genres: ["lo-fi", "jazzy hip hop", "chillhop"],
    vibes: ["chill", "morning coffee", "nostalgic"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "jandifull-nujabes-jazz-hiphop",
    heading: "누자베스, 힙합의 리듬과 재즈의 온기",
    name: "Nujabes | Jazz Hiphop | jandifull",
    dj: "jandifull",
    genres: ["lo-fi", "jazzy hip hop", "hip hop"],
    vibes: ["chill", "morning coffee", "nostalgic"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "elly-full-vinyl-90s-jazzy-hiphop",
    heading: "FULL VINYL | 90s Jazzy Hiphop Set",
    name: "Full Vinyl | 90s Jazzy Hiphop Set (Dirty Side B) | Elly",
    dj: "Elly",
    genres: ["jazzy hip hop", "hip hop", "lo-fi"],
    vibes: ["nostalgic", "chill", "vinyl"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "yunji-ukg-bassline-nyc-bodega",
    heading: "UKG & Bassline Mix in an NYC Bodega",
    name: "UKG & Bassline Mix in an NYC Bodega | Yunji",
    dj: "Yunji",
    genres: ["uk garage", "bassline", "2-step"],
    vibes: ["club", "london", "shuffle"],
    defaultInputFormat: "title-artist"
  },
  {
    id: "sammy-virji-dj-mag-hq",
    heading: "Sammy Virji's Energetic UKG & Bassline Set",
    name: "Sammy Virji's Energetic UKG & Bassline Set From DJ Mag HQ",
    dj: "Sammy Virji",
    genres: ["uk garage", "bassline", "garage house"],
    vibes: ["club", "high energy", "shuffle"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "jvna-la-rooftop-future-bass-melodic-dubstep",
    heading: "JVNA Live DJ Set @ LA Rooftop",
    name: "JVNA Live DJ Set @ LA Rooftop - Future Bass & Melodic Dubstep",
    dj: "JVNA",
    genres: ["melodic bass", "future bass", "dubstep"],
    vibes: ["emotional", "high energy", "rooftop"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "seven-lions-north-coast-2025",
    heading: "Seven Lions - North Coast Music Festival 2025",
    name: "Seven Lions - North Coast Music Festival 2025",
    dj: "Seven Lions",
    genres: ["melodic bass", "dubstep", "trance"],
    vibes: ["festival", "emotional", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "work-music-deep-focus-efficiency",
    heading: "Work Music for Deep Focus and Efficiency",
    name: "Work Music for Deep Focus and Efficiency",
    dj: "Deep Focus Reference",
    genres: ["ambient", "downtempo", "chill"],
    vibes: ["deep focus", "working", "minimal"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "no-vocals-house-studying-working-coding",
    heading: "no vocals house music for studying",
    name: "No Vocals House Music for Studying / Working / Coding",
    dj: "Focus House Reference",
    genres: ["organic house", "deep house", "minimal"],
    vibes: ["deep focus", "working", "no vocals"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "cid-live-from-the-edge-new-york-city",
    heading: "CID LIVE FROM THE EDGE IN NEW YORK CITY",
    name: "CID Live From The Edge in New York City",
    dj: "CID",
    genres: ["tech house", "house"],
    vibes: ["club", "peak time", "groove"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "odd-mob-seismic-dance-event-8",
    heading: "Odd Mob at Seismic Dance Event 8.0",
    name: "Odd Mob at Seismic Dance Event 8.0",
    dj: "Odd Mob",
    genres: ["bass house", "tech house", "house"],
    vibes: ["club", "high energy", "peak time"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "tony-romera-crusy-low-steppa-toolroom-miami-2025",
    heading: "Tony Romera B2B Crusy B2B Low Steppa",
    name: "Tony Romera B2B Crusy B2B Low Steppa - Live at Toolroom Miami 2025",
    dj: "Tony Romera / Crusy / Low Steppa",
    genres: ["french house", "funky house", "tech house"],
    vibes: ["groove", "club", "friday night"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "sonny-fodera-silverworks-island-london-2025",
    heading: "Sonny Fodera live at Silverworks Island London 2025",
    name: "Sonny Fodera live at Silverworks Island London 2025",
    dj: "Sonny Fodera",
    genres: ["vocal house", "deep house", "uk house"],
    vibes: ["club", "bright", "festival"],
    defaultInputFormat: "artist-title"
  },
  {
    id: "chris-lorenzo-grand-park-la-2026",
    heading: "CHRIS LORENZO LIVE AT GRAND PARK",
    name: "Chris Lorenzo Live at Grand Park, Los Angeles 2026",
    dj: "Chris Lorenzo",
    genres: ["bass house", "tech house", "house"],
    vibes: ["club", "peak time", "high energy"],
    defaultInputFormat: "artist-title"
  }
];

const existing = JSON.parse(readFileSync(generatedPath, "utf8"));
const parsedSets = [
  ...parseExpansion(normalizeText(readFileSync(firstExpansionPath, "utf8")), firstExpansionConfigs),
  ...parseExpansion(normalizeText(readFileSync(secondExpansionPath, "utf8")), secondExpansionConfigs),
  ...parseExpansion(normalizeText(readFileSync(thirdExpansionPath, "utf8")), thirdExpansionConfigs),
  ...parseExpansion(normalizeText(readFileSync(fourthExpansionPath, "utf8")), fourthExpansionConfigs)
];
const parsedIds = new Set(parsedSets.map((set) => set.id));

const nextLibrary = {
  ...existing,
  generatedAt: new Date().toISOString(),
  note: "Raw text and timestamp details are preserved in reference_sets/raw/. The generated index keeps compact ordered artist/title data for flow learning.",
  sets: [
    ...(existing.sets ?? []).filter((set) => !parsedIds.has(set.id)),
    ...parsedSets
  ].map(compactSet)
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

    const compactTracks = tracks.map((track, trackIndex) => compactTrack(track, config, trackIndex, tracks.length));
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
      learning: buildLearningSummary(compactTracks, config),
      tracks: compactTracks
    };
  });
}

function compactTrack(track, setConfig = {}, index = 0, total = 1) {
  const mix = labelReferenceTrack(track, setConfig, index, total);
  return {
    artist: track.artist,
    title: track.title,
    mix,
    ...(track.isLayer ? { isLayer: true } : {}),
    ...(track.isId ? { isId: true } : {})
  };
}

function compactSet(set) {
  const tracks = (set.tracks ?? []).map((track, index, allTracks) => compactTrack(track, set, index, allTracks.length));
  return {
    ...set,
    learning: set.learning ?? buildLearningSummary(tracks, set),
    tracks
  };
}

function labelReferenceTrack(track, setConfig = {}, index = 0, total = 1) {
  const position = total <= 1 ? 0 : index / (total - 1);
  const section =
    position < 0.12 ? "intro" :
    position < 0.34 ? "warmup" :
    position < 0.64 ? "build" :
    position < 0.84 ? "peak" :
    position < 0.94 ? "release" :
    "outro";
  const text = `${track.artist ?? ""} ${track.title ?? ""}`.toLowerCase();
  const tags = [...(setConfig.genres ?? []), ...(setConfig.vibes ?? [])].join(" ").toLowerCase();
  const baseAnchors = getEnergyAnchorsForSet(tags);
  const energy = interpolateAnchors(baseAnchors, position);
  const adjustedEnergy = Math.round(Math.max(8, Math.min(98,
    energy
    + (/festival|mainstage|bass house|dubstep|peak|high energy/.test(tags) ? 6 : 0)
    + (/focus|working|lo-fi|jazzy|chill|ambient|downtempo/.test(tags) ? -10 : 0)
    + (/drop|vip|bootleg|festival|extended|remix/.test(text) ? 5 : 0)
    + (/intro|interlude|acoustic|ambient/.test(text) ? -8 : 0)
    + (track.isLayer ? -4 : 0)
  )));

  const role =
    track.isLayer ? "layer" :
    track.isId ? "id" :
    /acappella|a cappella|w\/|mashup|vs\.| x /.test(text) ? "blend-tool" :
    /intro|interlude/.test(text) ? "intro-tool" :
    /remix|edit|bootleg|vip|dub/.test(text) ? "transition-record" :
    /vocal|feat\.|ft\.|featuring/.test(text) ? "vocal-anchor" :
    section === "peak" ? "peak-anchor" :
    section === "outro" ? "closer" :
    "groove-record";

  const transitionHint =
    role === "layer" || role === "blend-tool" ? "layered transition" :
    /drop|bass|dubstep|festival|mainstage/.test(`${text} ${tags}`) ? "drop transition" :
    /lo-fi|jazzy|focus|ambient|downtempo|chill/.test(tags) ? "soft blend" :
    /uk garage|2-step|shuffle|bassline/.test(tags) ? "shuffle blend" :
    /afro|organic|amapiano|percussion/.test(tags) ? "percussion layer" :
    "groove blend";

  return {
    section,
    energy: adjustedEnergy,
    role,
    transitionHint
  };
}

function buildLearningSummary(tracks, setConfig = {}) {
  const energyCurve = sampleEnergyCurve(tracks);
  const sectionCounts = countBy(tracks.map((track) => track.mix?.section).filter(Boolean));
  const roleCounts = countBy(tracks.map((track) => track.mix?.role).filter(Boolean));
  const transitionHints = countBy(tracks.map((track) => track.mix?.transitionHint).filter(Boolean));
  return {
    energyCurve,
    dominantSections: topKeys(sectionCounts, 4),
    dominantRoles: topKeys(roleCounts, 5),
    transitionHints: topKeys(transitionHints, 4),
    confidence: getLearningConfidence(tracks, setConfig)
  };
}

function sampleEnergyCurve(tracks, points = 7) {
  if (!tracks.length) return [];
  return Array.from({ length: points }, (_, index) => {
    const position = points === 1 ? 0 : index / (points - 1);
    const target = position * (tracks.length - 1);
    const left = Math.floor(target);
    const right = Math.min(tracks.length - 1, left + 1);
    const progress = target - left;
    const leftEnergy = tracks[left]?.mix?.energy ?? 50;
    const rightEnergy = tracks[right]?.mix?.energy ?? leftEnergy;
    return Math.round(leftEnergy + (rightEnergy - leftEnergy) * progress);
  });
}

function getLearningConfidence(tracks, setConfig = {}) {
  const count = tracks.length;
  const layerRatio = count ? tracks.filter((track) => track.isLayer).length / count : 0;
  const idRatio = count ? tracks.filter((track) => track.isId).length / count : 0;
  if (count >= 20 && layerRatio < 0.35 && idRatio < 0.25) return "high";
  if (count >= 10) return "medium";
  return "low";
}

function countBy(values) {
  return values.reduce((map, value) => {
    map[value] = (map[value] ?? 0) + 1;
    return map;
  }, {});
}

function topKeys(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function getEnergyAnchorsForSet(tags) {
  if (/focus|working|ambient|downtempo|minimal|no vocals/.test(tags)) return [18, 24, 32, 38, 36, 30, 22];
  if (/lo-fi|jazzy|chillhop|nu soul|morning coffee|brunch/.test(tags)) return [16, 22, 30, 38, 34, 28, 20];
  if (/dubstep|bass house|melodic bass|future bass|mainstage|festival/.test(tags)) return [50, 68, 86, 94, 82, 90, 72];
  if (/uk garage|2-step|bassline|shuffle/.test(tags)) return [34, 48, 60, 74, 80, 72, 56];
  if (/afro|amapiano|organic|deep/.test(tags)) return [36, 48, 60, 72, 78, 72, 58];
  if (/disco|funk|groove|soulful/.test(tags)) return [30, 46, 60, 72, 78, 70, 52];
  if (/hip hop|r&b|club edits|party/.test(tags)) return [28, 42, 58, 72, 82, 76, 54];
  return [34, 48, 62, 76, 84, 76, 58];
}

function interpolateAnchors(anchors, position) {
  const scaled = Math.max(0, Math.min(1, position)) * (anchors.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(anchors.length - 1, left + 1);
  const progress = scaled - left;
  return Math.round(anchors[left] + (anchors[right] - anchors[left]) * progress);
}

function parseTrackLine(input, config) {
  const raw = input.trim();
  if (!raw || shouldSkipLine(raw, config)) return null;

  let line = raw.replace(/^[*•►]\s*/, "").trim();
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
  const byParts = line.split(/\s+by\s+/i).map((part) => part.trim()).filter(Boolean);
  if (byParts.length === 2) {
    return cleanPair({ title: byParts[0], artist: byParts[1] });
  }

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
    || /^\d+\.\s*.+：\d+\s*个/.test(line)
    || /^参考方向[:：]/.test(line)
    || /^适合普通用户歌单/.test(line)
    || /^你现在/.test(line)
    || /^对 Apple Music/.test(line)
    || /^另外还有\d+个/.test(line)
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
