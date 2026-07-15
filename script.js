const form = document.querySelector("#mixForm");
const resetButton = document.querySelector("#resetButton");
const musicInput = document.querySelector("#musicInput");
const trackFile = document.querySelector("#trackFile");
const inputStatsValue = document.querySelector("#inputStatsValue");
const statusPill = document.querySelector("#statusPill");
const resultTitle = document.querySelector("#resultTitle");
const timeBadge = document.querySelector("#timeBadge");
const bpmArc = document.querySelector("#bpmArc");
const energyArc = document.querySelector("#energyArc");
const trackCount = document.querySelector("#trackCount");
const energyCurveTitle = document.querySelector("#energyCurveTitle");
const energyCurvePeak = document.querySelector("#energyCurvePeak");
const energyCurveLine = document.querySelector("#energyCurveLine");
const energyCurveArea = document.querySelector("#energyCurveArea");
const energyCurvePoints = document.querySelector("#energyCurvePoints");
const tracklist = document.querySelector("#tracklist");
const outputState = document.querySelector("#outputState");
const outputStateIcon = document.querySelector("#outputStateIcon");
const outputStateTitle = document.querySelector("#outputStateTitle");
const outputStateCopy = document.querySelector("#outputStateCopy");
const betaNote = document.querySelector("#betaNote");
const setRationale = document.querySelector("#setRationale");
const setRationaleCopy = document.querySelector("#setRationaleCopy");
const referenceArtistCopy = document.querySelector("#referenceArtistCopy");
const playbackTip = document.querySelector("#playbackTip");
const setlistTools = document.querySelector("#setlistTools");
const mustHaveFeedback = document.querySelector("#mustHaveFeedback");
const setVersion = document.querySelector("#setVersion");
const exportSteps = document.querySelector("#exportSteps");
const resultPanel = document.querySelector("#set-preview");
const exportSimpleButton = document.querySelector("#exportSimpleButton");
const exportDetailedButton = document.querySelector("#exportDetailedButton");
const languageButtons = document.querySelectorAll(".language-toggle__button");
const analyzeButton = document.querySelector("#analyzeButton");
const surpriseButton = document.querySelector("#surpriseButton");
const useRecommendationButton = document.querySelector("#useRecommendationButton");
const genreBars = document.querySelector("#genreBars");
const sourceTrackCount = document.querySelector("#sourceTrackCount");
const moodProfile = document.querySelector("#moodProfile");
const insightBpm = document.querySelector("#insightBpm");
const recommendedSet = document.querySelector("#recommendedSet");
const recommendationReason = document.querySelector("#recommendationReason");
const setLengthWarning = document.querySelector("#setLengthWarning");
const parsedPreview = document.querySelector("#parsedPreview");
const parsedTrackList = document.querySelector("#parsedTrackList");
const formatButtons = document.querySelectorAll(".format-toggle__button");
const productionApiBase = "https://api.mixoryflow.com";

let currentRows = [];
let currentData = {};
let currentLang = "en";
let statusKey = "ready";
let backendInsightProfile = null;
let sourceTracks = [];
let analyzedSourceTracks = [];
let parseFormat = "auto";
let hasPlaylistAnalysis = false;
let draggedTrackIndex = null;
let uploadedPlaylistRawText = "";
const setVersionMode = "smoothest";

try {
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  const savedLang = window.localStorage.getItem("mixoryLang") || window.localStorage.getItem("setflowLang");
  currentLang = urlLang === "zh" || savedLang === "zh" ? "zh" : "en";
} catch {
  currentLang = "en";
}

const copy = {
  en: {
    heroEyebrow: "Playlist to DJ-style flow",
    heroCopy: "Mixory reshapes your playlist into a smoother mix flow for Apple Music AutoMix / Spotify Mix.",
    heroSource: "BPM and key data powered by GetSongBPM.",
    builderKicker: "Input",
    builderTitle: "Build the flow",
    musicInputKicker: "Add music",
    musicInputTitle: "Paste tracks from anywhere",
    musicInputLabel: "Paste tracks or upload TXT / CSV",
    musicInputNote: "Supports common track formats, Exportify CSV, Apple Music TXT, and TuneMyMusic exports. Up to 500 tracks.",
    exportifyNote: "Spotify: export with Exportify, then upload CSV.",
    appleMusicNote: "Apple Music: File > Library > Export Playlist..., then upload TXT.",
    tuneMyMusicNote: "YouTube Music: use TuneMyMusic to export TXT / CSV first.",
    deviceTipNote: "Large playlists are easier to import on desktop. For short lists, pasting on mobile works well.",
    exportifyInputLink: "Open Exportify (Spotify)",
    tuneMyMusicInputLink: "Open TuneMyMusic (YouTube Music or others)",
    fileUploadLabel: "Upload TXT / CSV",
    inputStatsLabel: "Detected tracks",
    insightKicker: "Music insight",
    insightTitle: "Analyze the music first",
    insightBadge: "Demo",
    insightCopy: "Find genre balance, BPM range, and best-fit direction.",
    sourceTrackCountLabel: "Original tracks",
    moodProfileLabel: "Mood profile",
    bpmRangeLabel: "BPM range",
    recommendationLabel: "Best flow direction",
    recommendationLengthNote: "Length follows your source tracks.",
    parsedKicker: "Track check",
    parsedTitle: "Confirm title and artist",
    parsedCopy: "Only tracks that may need review are shown.",
    parsedAllClear: "Parsed {count} tracks. No obvious title / artist issues found.",
    parsedNeedsReview: "{count} tracks may need a quick check.",
    formatAuto: "Auto",
    formatArtistTitle: "Artist - Track",
    formatTitleArtist: "Track - Artist",
    confidenceLow: "Check",
    swapButton: "Swap",
    analyzeButton: "Analyze tracks",
    surpriseButton: "Surprise me",
    useRecommendationButton: "Use recommended settings",
    lengthLabel: "Flow length",
    genreLabel: "Main genre",
    vibeLegend: "Theme / vibe",
    advancedOptionsTitle: "More specific requests",
    advancedOptionsCopy: "Optional: DJ reference, must-have tracks, or extra notes.",
    djLabel: "Favorite DJ or mood reference",
    mustHaveLabel: "Must-have tracks",
    mustHaveNote: "Mixory will try to include these tracks and place them where they transition best.",
    mustHavePlaceholder: "Example: Lane 8 - Atlas\nSultan + Shepard - Assassin",
    notesLabel: "Extra notes",
    notesPlaceholder: "Example: soft intro, mid-set peak, dreamy outro.",
    generateButton: "Generate flow",
    resetButton: "Reset",
    outputKicker: "Output",
    outputEmptyTitle: "Add tracks first",
    outputEmptyCopy: "Add tracks, then analyze.",
    outputReadyTitle: "Ready to analyze",
    outputReadyCopy: "Analyze to clean tracks and find the best fit.",
    outputAnalyzeTitle: "Analyzing tracks",
    outputAnalyzeCopy: "Cleaning tracks and checking metadata.",
    outputAnalyzeSuccessTitle: "Tracks analyzed",
    outputAnalyzeSuccessCopy: "Review the recommendation or generate now.",
    outputAnalyzeErrorTitle: "Could not find enough tracks",
    outputAnalyzeErrorCopy: "Paste at least three readable songs.",
    outputServerRequiredTitle: "Open the local app URL",
    outputServerRequiredCopy: "Use http://127.0.0.1:3000/ for analysis.",
    outputAnalyzeTimeoutTitle: "Analysis is taking longer",
    outputAnalyzeTimeoutCopy: "Metadata lookup took too long. Try again.",
    outputGenerateTitle: "Generating playlist flow",
    outputGenerateCopy: "Mixory is shaping the order and energy arc.",
    outputGenerateSuccessTitle: "Flow ready",
    outputGenerateSuccessCopy: "Your Mixory flow is ready.",
    bpmLabel: "BPM arc",
    energyLabel: "Energy",
    energyCurveLabel: "Energy curve",
    energyCurveTitle: "Flow preview",
    energyCurvePeak: "Peak --",
    energyCurveStart: "Intro",
    energyCurveMiddle: "Peak",
    energyCurveEnd: "Outro",
    tracksLabel: "Tracks",
    setVersionLabel: "Mix mode",
    versionSmoothest: "Smooth Mix",
    betaNoteTitle: "Review before playing",
    betaNoteCopy: "Draft flow. Adjust before playing.",
    setRationaleTitle: "Why this flow",
    setRationaleSummary: "BPM, key, vibe, and transition logic.",
    setRationaleCopy: "Mixory balances genre, BPM, vibe, and transition fit for Apple Music AutoMix / Spotify Mix.",
    playbackTipTitle: "Try the DJ-style playback",
    playbackTipCopy: "Create a playlist with this Mixory order, then turn on Apple Music AutoMix or Spotify Mix to hear smoother DJ-style transitions.",
    appleAutoMixLink: "Apple Music AutoMix",
    spotifyMixLink: "Spotify Mix",
    referenceArtistPrefix: "Reference",
    exportStepOne: "Copy this order.",
    exportStepTwo: "Make a playlist.",
    exportStepThree: "Turn on Apple Music AutoMix / Spotify Mix.",
    riskSmooth: "Smooth",
    riskCheck: "Check",
    riskRisky: "Risky",
    estimatedMetaLabel: "Estimated",
    mustHaveFound: "Must-have included: {found}/{total}",
    mustHaveMissing: "Not found: {tracks}",
    reorderHint: "Copy a title / artist to search one track, or export Simple TXT for the full set. Drag tracks to adjust the order; the curve updates.",
    moveUpLabel: "Move up",
    moveDownLabel: "Move down",
    apiFooterKicker: "Data sources",
    apiFooterCopy: "Mixory combines BPM/key hints from GetSongBPM, metadata clues from MusicBrainz and Last.fm, and local reference sets to shape smoother playlist flows. Results are estimates, so review before playing.",
    exportHelp: "Simple for copying. Detailed includes BPM/key, energy, and risk.",
    exportSimpleButton: "Export Simple TXT",
    exportDetailedButton: "Export Detailed TXT",
    transitionPrefix: "Transition",
    setSuffix: "set",
    min: "min",
    status: {
      ready: "Ready",
      needsLink: "Add tracks",
      draft: "Draft",
      optimized: "Optimized",
      saved: "Saved",
      copied: "Copied",
      copyBlocked: "Copy blocked",
      connectSpotify: "Exported",
      analyzed: "Analyzed",
      recommended: "Recommended",
      surprised: "Surprise ready"
    }
  },
  zh: {
    heroEyebrow: "Playlist to DJ-style flow",
    heroCopy: "Mixory 会读懂你的歌单，把它整理成更适合 Apple Music AutoMix / Spotify Mix 的流畅自然播放顺序。",
    heroSource: "BPM 和调性数据由 GetSongBPM 辅助提供。",
    builderKicker: "输入",
    builderTitle: "生成流畅自然的播放顺序",
    musicInputKicker: "添加音乐",
    musicInputTitle: "从任何地方粘贴曲目",
    musicInputLabel: "粘贴曲目或上传 TXT / CSV",
    musicInputNote: "支持常见曲目格式、Exportify CSV、Apple Music TXT、TuneMyMusic 导出文件。最多分析 500 首。",
    exportifyNote: "Spotify：用 Exportify 导出 CSV 后上传。",
    appleMusicNote: "Apple Music：File > Library > Export Playlist... 导出 TXT。",
    tuneMyMusicNote: "YouTube Music：先用 TuneMyMusic 导出 TXT / CSV，再上传。",
    deviceTipNote: "歌曲很多时建议用电脑导入；歌曲较少时，手机直接粘贴也很方便。",
    exportifyInputLink: "打开 Exportify (Spotify)",
    tuneMyMusicInputLink: "打开 TuneMyMusic (YouTube Music 或其他平台)",
    fileUploadLabel: "上传 TXT / CSV",
    inputStatsLabel: "识别到的曲目",
    insightKicker: "音乐分析",
    insightTitle: "先理解这张歌单",
    insightBadge: "Demo",
    insightCopy: "识别曲风、BPM（节奏速度）和推荐方向。",
    sourceTrackCountLabel: "原歌单曲目",
    moodProfileLabel: "情绪画像",
    bpmRangeLabel: "BPM 范围（节奏速度）",
    recommendationLabel: "最适合的 flow 方向",
    recommendationLengthNote: "时长会按输入歌单估算。",
    parsedKicker: "曲目检查",
    parsedTitle: "确认歌名和艺人",
    parsedCopy: "这里只显示可能需要检查的曲目。",
    parsedAllClear: "已识别 {count} 首曲目，暂未发现明显的歌名 / 艺人问题。",
    parsedNeedsReview: "有 {count} 首曲目建议快速检查。",
    formatAuto: "自动",
    formatArtistTitle: "Artist - Track",
    formatTitleArtist: "Track - Artist",
    confidenceLow: "检查",
    swapButton: "交换",
    analyzeButton: "分析曲目",
    surpriseButton: "给我惊喜",
    useRecommendationButton: "使用推荐设置",
    lengthLabel: "目标时长",
    genreLabel: "主曲风",
    vibeLegend: "主题 / 氛围",
    advancedOptionsTitle: "更多具体要求",
    advancedOptionsCopy: "可选：喜欢的 DJ、必选曲目、补充要求。",
    djLabel: "喜欢的 DJ 或情绪参考",
    mustHaveLabel: "必选曲目",
    mustHaveNote: "Mixory 会尽量保留这些歌，并放在更适合转场的位置。",
    mustHavePlaceholder: "例如：Lane 8 - Atlas\nSultan + Shepard - Assassin",
    notesLabel: "补充要求",
    notesPlaceholder: "例如：柔和开场，中段推高，结尾 dreamy。",
    generateButton: "生成 flow",
    resetButton: "重置",
    outputKicker: "输出",
    outputEmptyTitle: "请先添加曲目",
    outputEmptyCopy: "添加曲目后开始分析。",
    outputReadyTitle: "可以开始分析",
    outputReadyCopy: "分析后会推荐曲风和方向。",
    outputAnalyzeTitle: "正在分析曲目",
    outputAnalyzeCopy: "正在清洗曲目并查询 metadata。",
    outputAnalyzeSuccessTitle: "曲目分析完成",
    outputAnalyzeSuccessCopy: "查看推荐，或生成播放顺序。",
    outputAnalyzeErrorTitle: "没有识别到足够曲目",
    outputAnalyzeErrorCopy: "请至少粘贴三首可识别歌曲。",
    outputServerRequiredTitle: "请用本地网页地址打开",
    outputServerRequiredCopy: "请用 http://127.0.0.1:3000/ 打开。",
    outputAnalyzeTimeoutTitle: "分析时间有点久",
    outputAnalyzeTimeoutCopy: "查询时间过长，可以再试一次。",
    outputGenerateTitle: "正在生成 DJ-style flow",
    outputGenerateCopy: "Mixory 正在编排顺序和能量走势。",
    outputGenerateSuccessTitle: "播放顺序已生成",
    outputGenerateSuccessCopy: "你的 Mixory flow 已生成。",
    bpmLabel: "BPM 走势",
    energyLabel: "能量",
    energyCurveLabel: "能量曲线",
    energyCurveTitle: "Flow 起伏预览",
    energyCurvePeak: "峰值 --",
    energyCurveStart: "Intro",
    energyCurveMiddle: "峰值",
    energyCurveEnd: "Outro",
    tracksLabel: "曲目",
    setVersionLabel: "混音模式",
    versionSmoothest: "流畅模式",
    betaNoteTitle: "正式使用前请检查",
    betaNoteCopy: "这是草稿，播放前可再调整。",
    setRationaleTitle: "为什么这样生成",
    setRationaleSummary: "BPM、调性、氛围和转场逻辑。",
    setRationaleCopy: "Mixory 会综合曲风、BPM、氛围和转场匹配，让顺序更适合 Apple Music AutoMix / Spotify Mix。",
    playbackTipTitle: "在音乐 App 里体验 DJ set 感",
    playbackTipCopy: "按 Mixory 推荐的顺序在 Apple Music 或 Spotify 新建播放列表，再开启 Apple Music AutoMix / Spotify Mix，会更接近连续流畅的 DJ-style 过渡。",
    appleAutoMixLink: "Apple Music AutoMix",
    spotifyMixLink: "Spotify Mix",
    referenceArtistPrefix: "参考",
    exportStepOne: "按此顺序整理歌曲。",
    exportStepTwo: "新建播放列表。",
    exportStepThree: "开启 Apple Music AutoMix / Spotify Mix。",
    riskSmooth: "流畅",
    riskCheck: "可检查",
    riskRisky: "可能突兀",
    estimatedMetaLabel: "估算",
    mustHaveFound: "已加入必选曲目：{found}/{total}",
    mustHaveMissing: "未找到：{tracks}",
    reorderHint: "想找单首歌，可直接复制歌名 / 艺人；想复制整份 set，可导出 Simple TXT。拖动曲目可微调顺序，曲线会同步更新。",
    moveUpLabel: "上移",
    moveDownLabel: "下移",
    apiFooterKicker: "数据来源",
    apiFooterCopy: "Mixory 会结合 GetSongBPM 的 BPM/调性参考、MusicBrainz 和 Last.fm 的曲目信息线索，以及本地 reference set 的能量走势，整理出更流畅自然的 playlist flow。结果是估算，正式播放前建议再检查。",
    exportHelp: "简洁版方便复制；详细版包含 BPM/调性、能量和风险。",
    exportSimpleButton: "导出简洁 TXT",
    exportDetailedButton: "导出详细 TXT",
    transitionPrefix: "转场",
    setSuffix: "歌单",
    min: "分钟",
    status: {
      ready: "就绪",
      needsLink: "先添加曲目",
      draft: "草稿",
      optimized: "已优化",
      saved: "已保存",
      copied: "已复制",
      copyBlocked: "复制受限",
      connectSpotify: "已导出",
      analyzed: "已分析",
      recommended: "已采用推荐",
      surprised: "惊喜 set 已生成"
    }
  }
};

const lengthLabels = {
  en: {
    30: "30 minutes",
    45: "45 minutes",
    60: "1 hour",
    90: "1.5 hours",
    120: "2 hours"
  },
  zh: {
    30: "30 分钟",
    45: "45 分钟",
    60: "1 小时",
    90: "1.5 小时",
    120: "2 小时"
  }
};

const genreLabels = {
  en: {
    House: "House",
    "Deep house": "Deep house",
    "Melodic house": "Melodic house",
    "Bass house": "Bass house",
    Disco: "Disco",
    Trance: "Trance",
    Techno: "Techno",
    "Progressive house": "Progressive house",
    "Melodic techno": "Melodic techno",
    Dubstep: "Dubstep",
    "UK garage": "UK garage",
    "Mainstage / Big room": "Mainstage / Big room",
    "Lo-fi": "Lo-fi",
    "Nu soul": "Nu soul",
    "Indie dance": "Indie dance",
    "Afro house": "Afro house",
    "Drum and bass": "Drum and bass"
  },
  zh: {
    House: "House 浩室",
    "Deep house": "Deep house 深度浩室",
    "Melodic house": "Melodic house 旋律浩室",
    "Bass house": "Bass house 贝斯浩室",
    Disco: "Disco 迪斯科",
    Trance: "Trance 迷幻舞曲",
    Techno: "Techno",
    "Progressive house": "Progressive house 渐进浩室",
    "Melodic techno": "Melodic techno 旋律科技舞曲",
    Dubstep: "Dubstep 回响贝斯",
    "UK garage": "UK garage 英式车库",
    "Mainstage / Big room": "Mainstage / Big room 主舞台大房",
    "Lo-fi": "Lo-fi",
    "Nu soul": "Nu soul 新灵魂",
    "Indie dance": "Indie dance 独立舞曲",
    "Afro house": "Afro house 非洲浩室",
    "Drum and bass": "Drum and bass 鼓打贝斯"
  }
};

const genreThemeGroups = {
  "House": "house-groove",
  "Deep house": "house-groove",
  "Melodic house": "house-groove",
  "Progressive house": "house-groove",
  "Bass house": "house-groove",
  "Afro house": "house-groove",
  "Disco": "house-groove",
  "Techno": "club-rave",
  "Melodic techno": "club-rave",
  "Trance": "club-rave",
  "UK garage": "club-rave",
  "Drum and bass": "club-rave",
  "Dubstep": "club-rave",
  "Mainstage / Big room": "club-rave",
  "Lo-fi": "chill-eclectic",
  "Nu soul": "chill-eclectic",
  "Indie dance": "chill-eclectic"
};

function updateVisualTheme(genre = getFormData().genre, isGenerated = Boolean(currentRows.length)) {
  const theme = genreThemeGroups[genre];
  if (theme) {
    document.body.dataset.theme = theme;
  } else {
    delete document.body.dataset.theme;
  }
  document.body.classList.toggle("is-set-generated", isGenerated);
}

const vibeLabels = {
  en: {
    Sunset: "Sunset",
    "Morning coffee": "Morning coffee",
    "After party": "After party",
    Chill: "Chill",
    Working: "Working",
    Workout: "Workout",
    "Road trip": "Road trip",
    "Friday night": "Friday night",
    "Pre-game": "Pre-game",
    "Deep focus": "Deep focus"
  },
  zh: {
    Sunset: "日落",
    "Morning coffee": "晨间咖啡",
    "After party": "深夜续摊",
    Chill: "放松",
    Working: "工作",
    Workout: "运动",
    "Road trip": "公路旅行",
    "Friday night": "周五夜晚",
    "Pre-game": "派对预热",
    "Deep focus": "深度专注"
  }
};

const energyLabels = {
  en: {},
  zh: {
    "Warm rise": "温暖上升",
    "Soft focus": "柔和专注",
    "Late-night pulse": "深夜律动",
    "Low glide": "低速滑行",
    "Steady focus": "稳定专注",
    "Peak drive": "高能推进",
    "Rolling cruise": "巡航推进",
    "Friday lift": "周五升温",
    "Quick lift": "预热升温",
    "Clean momentum": "清爽动能",
    "festival-burst": "Festival 爆发型",
    "slow-rise-melodic": "旋律慢升型",
    "deep-layered-groove": "深层叠加 groove",
    "low-pressure-groove": "低压力 groove",
    "club-groove-rise": "Club groove 升温",
    "uk-garage-bounce": "UK garage 弹跳律动"
  }
};

const moodLabels = {
  en: {
    "Warm, melodic, low-pressure": "Warm, melodic, low-pressure",
    "Soft, acoustic, lightly groovy": "Soft, acoustic, lightly groovy",
    "Loose, deep, late-night": "Loose, deep, late-night",
    "Calm, spacious, gentle": "Calm, spacious, gentle",
    "Steady, clean, low-distraction": "Steady, clean, low-distraction",
    "High-energy, punchy, motivating": "High-energy, punchy, motivating",
    "Open-road, melodic, rolling": "Open-road, melodic, rolling",
    "Social, smooth, warm vocals": "Social, smooth, warm vocals",
    "Bright, social, dance-ready": "Bright, social, dance-ready",
    "Bright, familiar, quick lift": "Bright, familiar, quick lift",
    "Minimal, focused, consistent": "Minimal, focused, consistent"
  },
  zh: {
    "Warm, melodic, low-pressure": "温暖、旋律感、低压力",
    "Soft, acoustic, lightly groovy": "柔和、原声感、轻 groove",
    "Loose, deep, late-night": "松弛、偏深、深夜感",
    "Calm, spacious, gentle": "平静、留白、轻柔",
    "Steady, clean, low-distraction": "稳定、干净、低干扰",
    "High-energy, punchy, motivating": "高能、冲击、激励感",
    "Open-road, melodic, rolling": "公路感、旋律、滚动推进",
    "Social, smooth, warm vocals": "社交、顺滑、温暖人声",
    "Bright, social, dance-ready": "明亮、社交、准备进入夜晚",
    "Bright, familiar, quick lift": "明亮、熟悉、快速升温",
    "Minimal, focused, consistent": "极简、专注、稳定"
  }
};

const insightProfiles = {
  Sunset: {
    recommendedGenre: "Melodic techno",
    recommendedLength: 60,
    bpmRange: "96-124",
    mood: "Warm, melodic, low-pressure",
    genres: [
      ["Melodic techno", 34],
      ["Progressive house", 28],
      ["Indie dance", 18],
      ["Nu soul", 12]
    ],
    reason: {
      en: "The playlist has enough melodic and mid-tempo material to build a warm arc without forcing peak-time energy.",
      zh: "这张歌单有足够的旋律和中速素材，适合做温暖上升的 set，不需要硬推到 peak-time。"
    }
  },
  "Morning coffee": {
    recommendedGenre: "Nu soul",
    recommendedLength: 45,
    bpmRange: "78-102",
    mood: "Soft, acoustic, lightly groovy",
    genres: [
      ["Nu soul", 36],
      ["Lo-fi", 24],
      ["Indie dance", 16],
      ["House", 10]
    ],
    reason: {
      en: "The strongest cluster is warm vocals and relaxed grooves, so a shorter low-pressure set fits best.",
      zh: "歌单里温暖人声和松弛 groove 占比最高，适合做较短、低压力的早晨 set。"
    }
  },
  "After party": {
    recommendedGenre: "House",
    recommendedLength: 90,
    bpmRange: "112-128",
    mood: "Loose, deep, late-night",
    genres: [
      ["House", 32],
      ["Afro house", 22],
      ["Melodic techno", 18],
      ["Techno", 14]
    ],
    reason: {
      en: "The tracks can hold a deeper late-night groove, with enough percussion to keep the room moving.",
      zh: "这些歌可以撑住偏深的夜晚 groove，也有足够的打击乐让氛围继续流动。"
    }
  },
  Chill: {
    recommendedGenre: "Lo-fi",
    recommendedLength: 45,
    bpmRange: "82-104",
    mood: "Calm, spacious, gentle",
    genres: [
      ["Lo-fi", 38],
      ["Nu soul", 22],
      ["Indie dance", 14],
      ["House", 10]
    ],
    reason: {
      en: "The playlist leans soft and spacious, so the best set keeps transitions subtle and avoids hard peaks.",
      zh: "歌单整体偏柔和、有留白，最适合用细腻转场，不做强烈峰值。"
    }
  },
  Working: {
    recommendedGenre: "Progressive house",
    recommendedLength: 60,
    bpmRange: "94-114",
    mood: "Steady, clean, low-distraction",
    genres: [
      ["Progressive house", 30],
      ["Lo-fi", 24],
      ["Melodic techno", 18],
      ["Nu soul", 12]
    ],
    reason: {
      en: "The best fit is a steady set with clean momentum, minimal vocal spikes, and predictable phrase changes.",
      zh: "最适合做稳定推进的 set，减少突兀人声和强变化，让乐句变化更可预期。"
    }
  },
  Workout: {
    recommendedGenre: "Drum and bass",
    recommendedLength: 60,
    bpmRange: "124-138",
    mood: "High-energy, punchy, motivating",
    genres: [
      ["Drum and bass", 30],
      ["Techno", 24],
      ["House", 18],
      ["Trance", 14]
    ],
    reason: {
      en: "The playlist has enough high-energy tracks for a punchier set, with quick transitions and fewer cooldown moments.",
      zh: "歌单里高能曲目足够，可以做更有冲击力的 set，转场更快，减少降温段落。"
    }
  },
  "Road trip": {
    recommendedGenre: "Indie dance",
    recommendedLength: 90,
    bpmRange: "96-122",
    mood: "Open-road, melodic, rolling",
    genres: [
      ["Indie dance", 32],
      ["Progressive house", 24],
      ["Nu soul", 14],
      ["House", 12]
    ],
    reason: {
      en: "The playlist works best as a rolling journey: melodic enough for attention, steady enough for a long drive.",
      zh: "它更适合做有行进感的旅程型 set：旋律足够抓人，也足够稳定适合长途。"
    }
  },
  "Friday night": {
    recommendedGenre: "House",
    recommendedLength: 60,
    bpmRange: "104-124",
    mood: "Bright, social, dance-ready",
    genres: [
      ["House", 34],
      ["Indie dance", 24],
      ["Afro house", 16],
      ["Nu soul", 10]
    ],
    reason: {
      en: "The best fit is a social, brighter build: enough groove for a Friday night, without going straight to peak-time pressure.",
      zh: "最适合做更社交、更明亮的周五夜晚路线：有 groove 和升温感，但不直接推到 peak-time。"
    }
  },
  "Pre-game": {
    recommendedGenre: "House",
    recommendedLength: 45,
    bpmRange: "110-126",
    mood: "Bright, familiar, quick lift",
    genres: [
      ["House", 36],
      ["Indie dance", 22],
      ["Afro house", 16],
      ["Trance", 10]
    ],
    reason: {
      en: "The strongest path is a fast mood lift with recognizable hooks and short, confident transitions.",
      zh: "最适合做快速升温路线：多用熟悉 hook，转场短一点、果断一点。"
    }
  },
  "Deep focus": {
    recommendedGenre: "Lo-fi",
    recommendedLength: 90,
    bpmRange: "88-108",
    mood: "Minimal, focused, consistent",
    genres: [
      ["Lo-fi", 34],
      ["Progressive house", 22],
      ["Melodic techno", 16],
      ["Nu soul", 12]
    ],
    reason: {
      en: "The playlist should be reduced to the most consistent tracks, keeping vocals and tempo jumps under control.",
      zh: "应该筛出最稳定的一组歌，控制人声突兀感和 tempo 跳跃，保持专注流。"
    }
  }
};

const vibeProfiles = {
  Sunset: {
    energy: "Warm rise",
    bpm: "112 -> 124 -> 118",
    transitions: ["long blend", "filter lift", "sunset break", "warm bass swap"],
    tracks: [
      ["Amber Glass", "Nora Vale", "116 BPM / 8A"],
      ["Terrace Signal", "Mika Sol", "118 BPM / 9A"],
      ["Slow Heat", "Lumen Coast", "120 BPM / 9B"],
      ["Golden Ratio", "Ari North", "122 BPM / 10B"],
      ["Afterlight Dub", "Kaito Room", "124 BPM / 11B"],
      ["Last Orange Sky", "Marea", "118 BPM / 10A"]
    ]
  },
  "Morning coffee": {
    energy: "Soft focus",
    bpm: "82 -> 98 -> 90",
    transitions: ["vinyl fade", "texture bridge", "piano intro", "soft loop"],
    tracks: [
      ["Steam Window", "Ollo", "82 BPM / 5A"],
      ["Small Table", "Veda Lin", "88 BPM / 6A"],
      ["Quiet Avenue", "Kesa", "92 BPM / 7A"],
      ["Pages Turning", "Mint Field", "98 BPM / 7B"],
      ["Cortado Bloom", "Sumi", "94 BPM / 6B"],
      ["Second Cup", "Lio House", "90 BPM / 5B"]
    ]
  },
  "After party": {
    energy: "Late-night pulse",
    bpm: "120 -> 128 -> 122",
    transitions: ["low-pass blend", "percussion tease", "bassline switch", "echo out"],
    tracks: [
      ["Room Three", "Dai Moon", "120 BPM / 2A"],
      ["No Lights", "Korr", "123 BPM / 3A"],
      ["Kitchen Talk", "Levan J", "126 BPM / 4A"],
      ["Blue Smoke", "Cenzo", "128 BPM / 4B"],
      ["Last Text", "Miru", "125 BPM / 5B"],
      ["Close Friends", "Orla Ray", "122 BPM / 6B"]
    ]
  },
  Chill: {
    energy: "Low glide",
    bpm: "88 -> 104 -> 92",
    transitions: ["ambient pad", "drumless bridge", "reverb tail", "gentle crossfade"],
    tracks: [
      ["Pool Shade", "Iri", "88 BPM / 1A"],
      ["Glass Path", "Monde", "94 BPM / 2A"],
      ["Deep Chair", "Sable", "99 BPM / 3A"],
      ["Cloud Tape", "Jun Coast", "104 BPM / 3B"],
      ["Faded Map", "Elo", "98 BPM / 4B"],
      ["Night Plants", "Rue", "92 BPM / 5B"]
    ]
  },
  Working: {
    energy: "Steady focus",
    bpm: "96 -> 112 -> 106",
    transitions: ["clean phrase mix", "minimal break", "looped intro", "smooth outro"],
    tracks: [
      ["Desk Light", "Alta", "96 BPM / 6A"],
      ["Inbox Zero", "Moro", "102 BPM / 7A"],
      ["Flow State", "Taro", "108 BPM / 8A"],
      ["Deep Work", "Lina Park", "112 BPM / 8B"],
      ["No Meeting", "Soto", "110 BPM / 9B"],
      ["Done List", "Evan Rue", "106 BPM / 10B"]
    ]
  },
  Workout: {
    energy: "Peak drive",
    bpm: "126 -> 138 -> 130",
    transitions: ["drop align", "snare roll", "quick swap", "impact break"],
    tracks: [
      ["Rep Count", "Vektor", "126 BPM / 11A"],
      ["Redline", "Juno Fit", "130 BPM / 12A"],
      ["Pulse Lock", "Kane", "134 BPM / 1A"],
      ["Max Set", "Astra Unit", "138 BPM / 2A"],
      ["No Cooldown", "Vox Run", "136 BPM / 2B"],
      ["Final Lap", "Metro Kin", "130 BPM / 3B"]
    ]
  },
  "Road trip": {
    energy: "Rolling cruise",
    bpm: "104 -> 122 -> 110",
    transitions: ["road fade", "wide intro", "drum bridge", "melodic handoff"],
    tracks: [
      ["Exit 12", "Cali Wave", "104 BPM / 7A"],
      ["Open Lane", "Rin Vale", "110 BPM / 8A"],
      ["Gas Station Neon", "Harlo", "116 BPM / 9A"],
      ["Coastline Fast", "Nico Set", "122 BPM / 10A"],
      ["Rearview", "Eli Moss", "118 BPM / 10B"],
      ["Home Stretch", "Sora", "110 BPM / 11B"]
    ]
  },
  "Friday night": {
    energy: "Friday lift",
    bpm: "104 -> 124 -> 112",
    transitions: ["hook-first intro", "groove bridge", "vocal tease", "bright handoff"],
    tracks: [
      ["First Text", "Mina Rue", "104 BPM / 7A"],
      ["Street Lights", "Dale Nori", "110 BPM / 8A"],
      ["Corner Signal", "Sel Vane", "116 BPM / 9A"],
      ["Two Drinks In", "Ayo Fern", "122 BPM / 10A"],
      ["Ride Upstairs", "Rhea Moss", "124 BPM / 10B"],
      ["Night Opens", "June Vale", "112 BPM / 8B"]
    ]
  },
  "Pre-game": {
    energy: "Quick lift",
    bpm: "112 -> 126 -> 124",
    transitions: ["hook-first intro", "drum roll tease", "fast phrase blend", "chorus handoff"],
    tracks: [
      ["Group Chat", "Nova Kin", "112 BPM / 8A"],
      ["First Round", "Melo Crew", "116 BPM / 9A"],
      ["Shoes On", "Kara Lane", "120 BPM / 10A"],
      ["Ride Arrived", "Tino Set", "124 BPM / 11A"],
      ["Door Line", "Vexa", "126 BPM / 12A"],
      ["Main Room Soon", "Eli North", "124 BPM / 1B"]
    ]
  },
  "Deep focus": {
    energy: "Clean momentum",
    bpm: "92 -> 108 -> 100",
    transitions: ["low-distraction blend", "texture lock", "subtle key shift", "steady loop"],
    tracks: [
      ["No Tabs", "Luma Field", "92 BPM / 2A"],
      ["Signal Only", "Kiro", "96 BPM / 3A"],
      ["Long Window", "Mori Desk", "100 BPM / 4A"],
      ["Quiet Sprint", "Tala Grey", "104 BPM / 4B"],
      ["Single Task", "Oren", "108 BPM / 5B"],
      ["Save Point", "Nila", "100 BPM / 3B"]
    ]
  }
};

const genreModifiers = {
  House: ["Deep house opener", "groove-forward transition", "piano-house lift"],
  "Deep house": ["deep groove opener", "subtle percussion layer", "late-night bass handoff"],
  "Melodic house": ["warm melodic blend", "sunrise chord lift", "emotional phrase handoff"],
  "Bass house": ["bassline pressure swap", "short drop tease", "club bounce reset"],
  Disco: ["disco bass bridge", "funky phrase blend", "mirrorball groove lift"],
  Trance: ["euphoric breakdown", "long harmonic blend", "arpeggio peak"],
  Techno: ["driving loop tool", "kick-led pressure", "warehouse reset"],
  "Progressive house": ["slow-building phrase mix", "melodic tension lift", "wide breakdown resolve"],
  "Melodic techno": ["dark melodic handoff", "arpeggio pressure bridge", "cinematic kick return"],
  Dubstep: ["impact drop switch", "bass sustain bridge", "melodic bass cooldown"],
  "UK garage": ["2-step groove handoff", "shuffle percussion lift", "vocal chop tease"],
  "Mainstage / Big room": ["anthem build-up", "festival drop align", "hands-up breakdown"],
  "Lo-fi": ["dusty texture bed", "laid-back drum pocket", "tape-warm outro"],
  "Nu soul": ["vocal pocket blend", "bassline groove handoff", "warm chord transition"],
  "Indie dance": ["new-wave groove swap", "synth hook tease", "disco bass bridge"],
  "Afro house": ["polyrhythm bridge", "vocal chant tease", "organic percussion blend"],
  "Drum and bass": ["double-time energy jump", "breakbeat switch", "bass recoil"]
};

const transitionLabels = {
  zh: {
    "long blend": "长混音衔接",
    "filter lift": "滤波推进",
    "sunset break": "日落 break",
    "warm bass swap": "温暖低频切换",
    "vinyl fade": "黑胶淡出",
    "texture bridge": "质感桥段",
    "piano intro": "钢琴 intro",
    "soft loop": "柔和 loop",
    "low-pass blend": "低通混合",
    "percussion tease": "打击乐预告",
    "bassline switch": "bassline 切换",
    "echo out": "echo 收尾",
    "ambient pad": "氛围 pad 衔接",
    "drumless bridge": "无鼓桥段",
    "reverb tail": "混响尾音",
    "gentle crossfade": "轻柔 crossfade",
    "clean phrase mix": "干净乐句混合",
    "minimal break": "极简 break",
    "looped intro": "loop intro",
    "smooth outro": "顺滑 outro",
    "drop align": "drop 对齐",
    "snare roll": "snare roll 推进",
    "quick swap": "快速切换",
    "impact break": "冲击 break",
    "road fade": "公路感淡入淡出",
    "wide intro": "宽阔 intro",
    "drum bridge": "鼓组桥段",
    "melodic handoff": "旋律交接",
    "silky crossfade": "丝滑 crossfade",
    "vocal tuck": "人声 tucked 衔接",
    "warm groove bridge": "温暖 groove 桥段",
    "soft percussion lift": "轻打击乐推进",
    "hook-first intro": "hook 先入场",
    "drum roll tease": "鼓 roll 预热",
    "fast phrase blend": "快速乐句混合",
    "chorus handoff": "副歌交接",
    "groove bridge": "groove 桥段",
    "vocal tease": "人声预告",
    "bright handoff": "明亮交接",
    "low-distraction blend": "低干扰衔接",
    "texture lock": "质感锁定",
    "subtle key shift": "细微转调",
    "steady loop": "稳定 loop",
    "Deep house opener": "Deep house 开场",
    "groove-forward transition": "groove 优先转场",
    "piano-house lift": "piano house 推进",
    "euphoric breakdown": "高扬 breakdown",
    "long harmonic blend": "长和声混合",
    "arpeggio peak": "琶音峰值",
    "deep groove opener": "deep groove 开场",
    "subtle percussion layer": "细腻打击乐叠加",
    "late-night bass handoff": "深夜低频交接",
    "warm melodic blend": "温暖旋律混合",
    "sunrise chord lift": "日出和弦推进",
    "emotional phrase handoff": "情绪乐句交接",
    "bassline pressure swap": "bassline 压力切换",
    "short drop tease": "短 drop 预告",
    "club bounce reset": "club bounce reset",
    "impact drop switch": "冲击 drop 切换",
    "bass sustain bridge": "持续低频桥段",
    "melodic bass cooldown": "旋律 bass 降温",
    "2-step groove handoff": "2-step groove 交接",
    "shuffle percussion lift": "shuffle 打击乐推进",
    "vocal chop tease": "vocal chop 预告",
    "anthem build-up": "anthem build-up",
    "festival drop align": "festival drop 对齐",
    "hands-up breakdown": "hands-up breakdown",
    "driving loop tool": "推进型 loop tool",
    "kick-led pressure": "kick 主导压迫感",
    "warehouse reset": "warehouse reset",
    "slow-building phrase mix": "慢慢堆叠的乐句混合",
    "melodic tension lift": "旋律张力推进",
    "wide breakdown resolve": "宽阔 breakdown 释放",
    "dark melodic handoff": "暗色旋律交接",
    "arpeggio pressure bridge": "琶音压力桥段",
    "cinematic kick return": "电影感 kick 回归",
    "dusty texture bed": "颗粒质感铺底",
    "laid-back drum pocket": "松弛鼓组 pocket",
    "tape-warm outro": "磁带温暖 outro",
    "vocal pocket blend": "人声 pocket 混合",
    "bassline groove handoff": "bassline groove 交接",
    "warm chord transition": "温暖和弦转场",
    "new-wave groove swap": "新浪潮 groove 切换",
    "synth hook tease": "合成器 hook 预告",
    "disco bass bridge": "disco bass 桥段",
    "polyrhythm bridge": "复合节奏桥段",
    "vocal chant tease": "chant 人声预告",
    "organic percussion blend": "有机打击乐混合",
    "double-time energy jump": "双倍速能量跳转",
    "breakbeat switch": "breakbeat 切换",
    "bass recoil": "低频回弹"
  }
};

function t(key) {
  return copy[currentLang][key];
}

function setStatus(key) {
  statusKey = key;
  statusPill.textContent = copy[currentLang].status[key];
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resetOutputSummary() {
  setResultStage("compact");
  resultTitle.textContent = currentLang === "zh" ? "等待曲目" : "Waiting for tracks";
  timeBadge.textContent = "--";
  bpmArc.textContent = "--";
  energyArc.textContent = "--";
  trackCount.textContent = "--";
  resetEnergyCurve();
  tracklist.innerHTML = "";
  currentRows = [];
  draggedTrackIndex = null;
  if (betaNote) betaNote.hidden = true;
  if (setRationale) setRationale.hidden = true;
  if (playbackTip) playbackTip.hidden = true;
  if (setlistTools) setlistTools.hidden = true;
  if (setVersion) setVersion.hidden = true;
  if (exportSteps) exportSteps.hidden = true;
  setExportEnabled(false);
}

function setResultStage(stage = "compact") {
  resultPanel.classList.toggle("result--compact", stage !== "generated");
  resultPanel.classList.toggle("result--generated", stage === "generated");
}

function setOutputState(mode, titleKey, copyKey) {
  outputState.classList.remove("is-hidden", "is-loading", "is-success", "is-error");
  if (mode === "hidden") {
    outputState.classList.add("is-hidden");
    return;
  }
  if (mode === "loading") outputState.classList.add("is-loading");
  if (mode === "success") outputState.classList.add("is-success");
  if (mode === "error") outputState.classList.add("is-error");
  outputStateIcon.textContent = mode === "success" ? "OK" : mode === "error" ? "!" : "?";
  outputStateTitle.textContent = t(titleKey);
  outputStateCopy.textContent = t(copyKey);
}

function showEmptyOutput() {
  resetOutputSummary();
  setOutputState("idle", hasMusicInput() ? "outputReadyTitle" : "outputEmptyTitle", hasMusicInput() ? "outputReadyCopy" : "outputEmptyCopy");
}

function showOutputLoading(titleKey = "outputGenerateTitle", copyKey = "outputGenerateCopy") {
  setResultStage("compact");
  updateVisualTheme(getFormData().genre, false);
  resultTitle.textContent = currentLang === "zh" ? "正在处理" : "Working";
  timeBadge.textContent = "--";
  bpmArc.textContent = "--";
  energyArc.textContent = "--";
  trackCount.textContent = "--";
  tracklist.innerHTML = "";
  tracklist.classList.add("is-loading");
  if (betaNote) betaNote.hidden = true;
  if (setRationale) setRationale.hidden = true;
  if (playbackTip) playbackTip.hidden = true;
  if (setlistTools) setlistTools.hidden = true;
  if (setVersion) setVersion.hidden = true;
  if (exportSteps) exportSteps.hidden = true;
  setExportEnabled(false);
  setOutputState("loading", titleKey, copyKey);
}

function showOutputSuccess(titleKey = "outputGenerateSuccessTitle", copyKey = "outputGenerateSuccessCopy") {
  tracklist.classList.remove("is-loading");
  setOutputState("success", titleKey, copyKey);
}

function showOutputError(titleKey = "outputAnalyzeErrorTitle", copyKey = "outputAnalyzeErrorCopy") {
  tracklist.classList.remove("is-loading");
  setOutputState("error", titleKey, copyKey);
}

function getEstimatedTrackCount() {
  return parseTrackText(musicInput.value).length;
}

function hasMusicInput() {
  return getEstimatedTrackCount() >= 3;
}

function setFlowEnabled(isEnabled) {
  const canConfigureSet = isEnabled && hasPlaylistAnalysis;
  [
    document.querySelector("#setLength"),
    document.querySelector("#genre"),
    document.querySelector("#djReference"),
    document.querySelector("#mustHaveTracks"),
    document.querySelector("#notes"),
    document.querySelector("#generateButton"),
    surpriseButton,
    useRecommendationButton
  ].forEach((control) => {
    control.disabled = !canConfigureSet;
  });

  analyzeButton.disabled = !isEnabled;

  document.querySelectorAll('input[name="vibe"]').forEach((input) => {
    input.disabled = !canConfigureSet;
  });

  document.querySelector(".builder").classList.toggle("is-waiting-for-link", !isEnabled);
  document.querySelector(".builder").classList.toggle("is-waiting-for-analysis", isEnabled && !hasPlaylistAnalysis);
}

function setExportEnabled(isEnabled) {
  [exportSimpleButton, exportDetailedButton].forEach((control) => {
    control.disabled = !isEnabled;
  });
}

function updateInputGate() {
  const estimatedCount = getEstimatedTrackCount();
  const isEnabled = estimatedCount >= 3;
  inputStatsValue.textContent = estimatedCount;
  setFlowEnabled(isEnabled);
  if (!isEnabled) {
    setStatus("needsLink");
    showEmptyOutput();
  } else if (statusKey === "needsLink") {
    setStatus("ready");
    showEmptyOutput();
  }
}

function getGenreLabel(value) {
  return genreLabels[currentLang][value] ?? value;
}

function getVibeLabel(value) {
  return vibeLabels[currentLang][value] ?? value;
}

function getEnergyLabel(value) {
  return energyLabels[currentLang][value] ?? value;
}

function getTransitionLabel(value) {
  if (currentLang === "en") return value;
  return transitionLabels.zh[value] ?? value;
}

function formatLength(value) {
  return lengthLabels[currentLang][value] ?? `${value} ${copy[currentLang].min}`;
}

function updateStaticCopy() {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  document.title = currentLang === "zh" ? "Mixory - 歌单流畅播放顺序" : "Mixory - Playlist to DJ-style Flow";

  [
    "heroEyebrow",
    "heroCopy",
    "builderKicker",
    "builderTitle",
    "musicInputKicker",
    "musicInputTitle",
    "musicInputLabel",
    "musicInputNote",
    "exportifyNote",
    "appleMusicNote",
    "tuneMyMusicNote",
    "deviceTipNote",
    "exportifyInputLink",
    "tuneMyMusicInputLink",
    "fileUploadLabel",
    "inputStatsLabel",
    "insightKicker",
    "insightTitle",
    "insightBadge",
    "insightCopy",
    "sourceTrackCountLabel",
    "moodProfileLabel",
    "bpmRangeLabel",
    "recommendationLabel",
    "parsedKicker",
    "parsedTitle",
    "parsedCopy",
    "formatAuto",
    "formatArtistTitle",
    "formatTitleArtist",
    "analyzeButton",
    "surpriseButton",
    "useRecommendationButton",
    "lengthLabel",
    "genreLabel",
    "vibeLegend",
    "advancedOptionsTitle",
    "advancedOptionsCopy",
    "djLabel",
    "mustHaveLabel",
    "mustHaveNote",
    "notesLabel",
    "generateButton",
    "resetButton",
    "outputKicker",
    "bpmLabel",
    "energyLabel",
    "energyCurveLabel",
    "energyCurveTitle",
    "energyCurveStart",
    "energyCurveMiddle",
    "energyCurveEnd",
    "tracksLabel",
    "betaNoteTitle",
    "betaNoteCopy",
    "setRationaleTitle",
    "setRationaleSummary",
    "playbackTipTitle",
    "playbackTipCopy",
    "appleAutoMixLink",
    "spotifyMixLink",
    "reorderHint",
    "apiFooterKicker",
    "apiFooterCopy",
    "exportHelp",
    "exportStepOne",
    "exportStepTwo",
    "exportStepThree",
    "exportSimpleButton",
    "exportDetailedButton"
  ].forEach((id) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = t(id);
  });

  document.querySelector("#musicInput").placeholder =
    currentLang === "zh"
      ? "Fred again.. - adore u\nPeggy Gou - It Goes Like Nanana\nBicep - Glue"
      : "Fred again.. - adore u\nPeggy Gou - It Goes Like Nanana\nBicep - Glue";
  document.querySelector("#notes").placeholder = t("notesPlaceholder");
  document.querySelector("#mustHaveTracks").placeholder = t("mustHavePlaceholder");
  renderHeroSource();
  document.querySelector("#setLength").querySelectorAll("option").forEach((option) => {
    option.textContent = formatLength(option.value);
  });
  document.querySelector("#genre").querySelectorAll("option").forEach((option) => {
    option.textContent = getGenreLabel(option.value);
  });
  document.querySelectorAll('input[name="vibe"]').forEach((input) => {
    input.nextElementSibling.textContent = getVibeLabel(input.value);
  });
  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === currentLang);
  });
  setStatus(statusKey);
  updateSetLengthWarning();
  renderParsedPreview();
}

function renderHeroSource() {
  const node = document.querySelector("#heroSource");
  if (!node) return;
  node.innerHTML = currentLang === "zh"
    ? 'BPM 和调性数据由 <a href="https://getsongbpm.com/" target="_blank" rel="noreferrer">GetSongBPM</a> 辅助提供。'
    : 'BPM and key data powered by <a href="https://getsongbpm.com/" target="_blank" rel="noreferrer">GetSongBPM</a>.';
}

function pickSurpriseVibe() {
  const musicText = musicInput.value.trim();
  const vibeKeys = Object.keys(insightProfiles);
  if (!musicText) return getFormData().vibe;
  const score = Array.from(musicText).reduce((total, char) => total + char.charCodeAt(0), 0);
  return vibeKeys[score % vibeKeys.length];
}

function applySetControls({ length, genre, vibe }) {
  document.querySelector("#setLength").value = String(length);
  document.querySelector("#genre").value = genre;
  const vibeInput = Array.from(document.querySelectorAll('input[name="vibe"]')).find((input) => input.value === vibe);
  if (vibeInput) vibeInput.checked = true;
  updateVisualTheme(genre, Boolean(currentRows.length));
  updateSetLengthWarning();
}

function getInsightProfile(vibe) {
  return backendInsightProfile ?? insightProfiles[vibe] ?? insightProfiles.Sunset;
}

function getReferencePattern() {
  return backendInsightProfile?.referenceMatch?.pattern ?? null;
}

function getRecommendedSettings(data = getFormData()) {
  const profile = getInsightProfile(data.vibe);
  return {
    length: getRecommendedLength(profile),
    genre: profile.recommendedGenre,
    vibe: getRecommendedVibe(profile, data.vibe)
  };
}

function getRecommendedLength(profile) {
  const availableMinutes = getAvailableSetMinutes();
  const profileLength = Number(profile?.recommendedLength) || 45;
  const options = getSetLengthOptions();
  const fallbackLength = options.includes(profileLength) ? profileLength : getClosestSetLength(profileLength, options);
  if (!availableMinutes) return fallbackLength;

  const supportedOptions = options.filter((value) => value <= availableMinutes);
  if (supportedOptions.includes(fallbackLength)) return fallbackLength;
  if (supportedOptions.length) return supportedOptions.at(-1);
  return getClosestSetLength(availableMinutes, options);
}

function getSetLengthOptions() {
  return Array.from(document.querySelector("#setLength").options)
    .map((option) => Number(option.value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function getClosestSetLength(minutes, options = getSetLengthOptions()) {
  return options.reduce((best, option) => {
    const diff = Math.abs(option - minutes);
    const bestDiff = Math.abs(best - minutes);
    if (diff < bestDiff) return option;
    if (diff === bestDiff && option > best) return option;
    return best;
  }, options[0] ?? 45);
}

function getRecommendedVibe(profile, fallbackVibe = "Sunset") {
  if (profile?.recommendedVibe && insightProfiles[profile.recommendedVibe]) return profile.recommendedVibe;

  const genre = normalizeNameForScore(profile?.recommendedGenre || "");
  const mood = normalizeNameForScore(profile?.mood || "");
  const [bpmLow = 96, bpmHigh = 124] = getBpmRangeNumbers(profile?.bpmRange);
  const referenceVibes = [
    profile?.referenceMatch?.primary?.vibes,
    ...(profile?.referenceMatch?.alternatives ?? []).map((item) => item.vibes)
  ].flat().filter(Boolean).map(normalizeNameForScore);

  if (referenceVibes.some((vibe) => /friday night|club|party|peak time|festival|groove/.test(vibe))) {
    if (/mainstage|big room|trance|techno|drum and bass|dnb|dubstep|bass/.test(genre) || bpmHigh >= 132) return "Workout";
    return "Friday night";
  }
  if (referenceVibes.some((vibe) => /late|after|deep/.test(vibe))) return "After party";
  if (referenceVibes.some((vibe) => /coffee|brunch|morning/.test(vibe))) return "Morning coffee";

  if (/lo.?fi|jazzy|hip hop|nu soul|soul/.test(genre)) {
    if (/focused|minimal|consistent/.test(mood)) return "Deep focus";
    return bpmHigh <= 102 ? "Morning coffee" : "Chill";
  }
  if (/progressive|melodic|indie dance/.test(genre)) {
    if (bpmHigh <= 114) return "Working";
    return "Sunset";
  }
  if (/deep house|afro house/.test(genre)) return bpmLow >= 112 ? "After party" : "Sunset";
  if (/house|garage|disco|funk|groove/.test(genre)) return bpmHigh >= 124 ? "Pre-game" : "Friday night";
  if (/mainstage|big room|trance|techno|drum and bass|dnb|dubstep|bass/.test(genre)) return "Workout";
  if (/open-road|rolling/.test(mood)) return "Road trip";

  return fallbackVibe;
}

function getBpmRangeNumbers(value = "") {
  return String(value).match(/\d+/g)?.map(Number) ?? [];
}

function renderInsight(data = getFormData()) {
  const profile = getInsightProfile(data.vibe);
  const recommended = getRecommendedSettings(data);
  genreBars.innerHTML = profile.genres
    .map(
      ([genre, value]) => `
        <div class="genre-bar">
          <span>${escapeHtml(getGenreLabel(genre))}</span>
          <span class="genre-bar__track">
            <span class="genre-bar__fill" style="--value: ${value}%"></span>
          </span>
          <span class="genre-bar__value">${value}%</span>
        </div>
      `
    )
    .join("");
  sourceTrackCount.textContent = profile.trackCount ? String(profile.trackCount) : "--";
  moodProfile.textContent = moodLabels[currentLang][profile.mood] ?? profile.mood;
  insightBpm.textContent = formatBpmRange(profile.bpmRange);
  recommendedSet.textContent =
    currentLang === "zh"
      ? `${formatLength(recommended.length)} · ${getVibeLabel(recommended.vibe)} ${getGenreLabel(recommended.genre)} ${t("setSuffix")}`
      : `${formatLength(recommended.length)} · ${getVibeLabel(recommended.vibe)} ${getGenreLabel(recommended.genre).toLowerCase()} ${t("setSuffix")}`;
  recommendationReason.textContent = `${profile.reason[currentLang]} ${t("recommendationLengthNote")}`;
}

function formatBpmRange(value = "") {
  const text = String(value).trim();
  if (!text) return "--";
  return /\bbpm\b/i.test(text) ? text : `${text} BPM`;
}

function shouldUseBackend() {
  return Boolean(getApiBaseUrl());
}

function getApiBaseUrl() {
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "localhost") return window.location.origin;
  return productionApiBase;
}

async function analyzePlaylistWithBackend() {
  if (!shouldUseBackend()) return false;

  const formData = getFormData();
  const rawText = uploadedPlaylistRawText || musicInput.value.trim();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  const response = await fetch(`${getApiBaseUrl()}/api/tracks/analyze`, {
    method: "POST",
    credentials: "omit",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rawText,
      vibe: formData.vibe,
      genre: formData.genre,
      dj: formData.dj,
      mustHave: formData.mustHave,
      notes: formData.notes
    })
  }).finally(() => window.clearTimeout(timeout));

  const payload = await response.json();
  if (!response.ok) {
    if (payload.profile) {
      backendInsightProfile = { ...payload.profile, trackCount: payload.trackCount };
      console.warn(payload.error ?? "Playlist analysis used fallback profile");
      return false;
    }
    throw new Error(payload.error ?? "Playlist analysis failed");
  }
  backendInsightProfile = { ...payload.profile, trackCount: payload.trackCount };
  analyzedSourceTracks = (payload.tracks ?? []).map(cloneTrack);
  sourceTracks = analyzedSourceTracks.map(cloneTrack);
  parseFormat = "auto";
  return true;
}

function cloneTrack(track) {
  return {
    ...track,
    genres: Array.isArray(track.genres) ? [...track.genres] : track.genres
  };
}

function parseTrackText(value) {
  const structuredText = convertStructuredPlaylistTextToTrackText(value);
  return (structuredText || normalizePlaylistText(value))
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\s*(\d{1,3}[\).\-\s]+|[-*]\s+)/, "").trim())
    .filter((line) => line.length > 2 && !/^https?:\/\//i.test(line))
    .slice(0, 500);
}

function convertStructuredPlaylistTextToTrackText(value) {
  const text = normalizePlaylistText(value);
  return convertStructuredRecordsToTrackText(parseDelimitedRecords(text, ",")) ||
    convertStructuredRecordsToTrackText(parseDelimitedRecords(text, "\t"));
}

function convertStructuredCsvToTrackText(value) {
  return convertStructuredPlaylistTextToTrackText(value);
}

function convertStructuredRecordsToTrackText(records) {
  if (records.length < 2) return "";
  const headers = records[0].map(normalizeTableHeader);
  const titleIndex = findHeaderIndex(headers, ["track name", "name", "song name", "title"]);
  const artistIndex = findHeaderIndex(headers, ["artist name(s)", "artist", "artists", "artist name", "album artist"]);
  if (titleIndex === -1 || artistIndex === -1) return "";
  if (!looksLikePlaylistTable(headers)) return "";

  return records
    .slice(1)
    .map((record) => {
      const title = (record[titleIndex] ?? "").trim();
      const artist = (record[artistIndex] ?? "").trim();
      return title && artist ? `${title} - ${artist}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseDelimitedRecords(value, delimiter = ",") {
  const text = normalizePlaylistText(value);
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

function getFormData() {
  const vibe = new FormData(form).get("vibe");
  return {
    length: Number(document.querySelector("#setLength").value),
    genre: document.querySelector("#genre").value,
    vibe,
    dj: document.querySelector("#djReference").value.trim(),
    mustHave: document.querySelector("#mustHaveTracks").value.trim(),
    notes: document.querySelector("#notes").value.trim()
  };
}

function applyParseFormat(format = parseFormat) {
  parseFormat = format;
  sourceTracks = analyzedSourceTracks.map((track) => {
    if (format === "auto") return cloneTrack(track);
    const parsed = parseRawTrackForFormat(track.raw || `${track.title} - ${track.artist}`, format);
    return {
      ...cloneTrack(track),
      title: parsed.title || track.title,
      artist: parsed.artist || track.artist
    };
  });
  renderParsedPreview();
  renderInsight();
  updateSetLengthWarning();
  if (currentRows.length) renderSet(currentData);
  updateFormatButtons();
}

function parseRawTrackForFormat(raw, format) {
  const normalized = String(raw || "")
    .trim()
    .replace(/^\s*(\d{1,3}[\).\-\s]+|[-*]\s+)/, "")
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "")
    .replace(/\((house|techno|trance|lo-fi|lofi|afro house|deep house|progressive house|melodic techno|indie dance|nu soul|drum and bass|dnb)\)/gi, "")
    .replace(/\s+/g, " ");
  const byMatch = normalized.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };

  const separatorMatch = normalized.match(/^(.+?)\s*(?:[-–—|/:]|\t)\s*(.+)$/);
  if (!separatorMatch) return { title: normalized, artist: "" };
  const left = separatorMatch[1].trim();
  const right = separatorMatch[2].trim();
  return format === "artist-title"
    ? { title: right, artist: left }
    : { title: left, artist: right };
}

function swapParsedTrack(index) {
  const track = sourceTracks[index];
  if (!track) return;
  sourceTracks[index] = {
    ...track,
    title: track.artist || track.title,
    artist: track.title || track.artist,
    userSwapped: !track.userSwapped
  };
  renderParsedPreview();
  renderInsight();
  updateSetLengthWarning();
  if (currentRows.length) renderSet(currentData);
}

function updateFormatButtons() {
  formatButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.format === parseFormat);
  });
}

function renderParsedPreview() {
  if (!parsedPreview || !parsedTrackList) return;
  if (!sourceTracks.length) {
    parsedPreview.hidden = true;
    parsedTrackList.innerHTML = "";
    updateFormatButtons();
    return;
  }

  parsedPreview.hidden = false;
  const reviewRows = sourceTracks
    .map((track, index) => ({ track, index, confidence: getParseConfidence(track) }))
    .filter((item) => item.confidence === "low");
  const parsedCopy = document.querySelector("#parsedCopy");
  if (parsedCopy) {
    parsedCopy.textContent = reviewRows.length
      ? t("parsedNeedsReview").replace("{count}", reviewRows.length)
      : t("parsedAllClear").replace("{count}", sourceTracks.length);
  }
  parsedTrackList.innerHTML = reviewRows.length
    ? reviewRows
      .map(({ track, index, confidence }) => {
        return `
          <div class="parsed-row parsed-row--${confidence}">
            <span class="parsed-row__index">${String(index + 1).padStart(2, "0")}</span>
            <div class="parsed-row__main">
              <strong>${escapeHtml(track.title || "--")}</strong>
              <span>${escapeHtml(track.artist || (currentLang === "zh" ? "未知艺人" : "Unknown artist"))}</span>
            </div>
            <span class="parsed-row__confidence">${escapeHtml(t("confidenceLow"))}</span>
            <button class="parsed-row__swap" type="button" data-swap-index="${index}">${escapeHtml(t("swapButton"))}</button>
          </div>
        `;
      })
      .join("")
    : "";
  updateFormatButtons();
}

function getParseConfidence(track) {
  if (!track.artist || !track.title) return "low";
  if (track.userSwapped) return "medium";
  if (track.getSongBpm?.matched || track.musicBrainz?.matched || track.lastFm?.matched) return "high";
  if (track.raw && /[-–—|/:]|\t|\s+by\s+/i.test(track.raw)) return "medium";
  return "low";
}

function getSourceTrackPool() {
  const data = getFormData();
  const profile = vibeProfiles[data.vibe];
  if (sourceTracks.length) {
    return sourceTracks.map((track, index) => {
      const displayTrack = normalizeDisplayTrack(track, index);
      const knownTempo = Number(track.tempo) || getTempoFromMeta(track.meta);
      const knownCamelotKey = normalizeCamelotKey(track.openKey || getCamelotKeyFromMeta(track.meta) || track.keyOf);
      const tempo = knownTempo || estimateBpmForTrack(data, index);
      const camelotKey = knownCamelotKey || estimateKeyForTrack(index);
      const metadataEstimated = !knownTempo || !knownCamelotKey;
      const baseMeta = track.meta || `${tempo} BPM / ${camelotKey}`;
      return {
        title: displayTrack.title,
        artist: displayTrack.artist,
        meta: metadataEstimated ? appendEstimatedMetaLabel(baseMeta) : baseMeta,
        tempo,
        camelotKey,
        genre: track.genreProfile?.genre || (Array.isArray(track.genres) ? track.genres[0] : "") || data.genre,
        durationMinutes: getTrackDurationMinutes(track),
        metadataEstimated,
        sourceIndex: index
      };
    });
  }
  return profile.tracks.map((track, index) => ({
    title: track[0],
    artist: track[1],
    meta: track[2],
    tempo: getTempoFromMeta(track[2]) || estimateBpmForTrack(data, index),
    camelotKey: getCamelotKeyFromMeta(track[2]) || estimateKeyForTrack(index),
    genre: data.genre,
    durationMinutes: 4,
    metadataEstimated: false,
    sourceIndex: index
  }));
}

function appendEstimatedMetaLabel(meta = "") {
  const label = t("estimatedMetaLabel");
  const text = String(meta || "").trim();
  return text.includes(label) ? text : `${text} · ${label}`;
}

function normalizeDisplayTrack(track, index) {
  const title = String(track.title || "").trim();
  const artist = String(track.artist || "").trim();
  if (artist) return { title: title || `Track ${index + 1}`, artist };

  const split = splitTitleArtist(title);
  if (split) return split;

  return {
    title: title || `Track ${index + 1}`,
    artist: currentLang === "zh" ? "未知艺人" : "Unknown artist"
  };
}

function splitTitleArtist(value = "") {
  const match = String(value).trim().match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!match) return null;
  const left = match[1].trim();
  const right = match[2].trim();
  if (!left || !right) return null;

  const leftArtistScore = getDisplayArtistScore(left);
  const rightArtistScore = getDisplayArtistScore(right);
  if (leftArtistScore > rightArtistScore) return { title: right, artist: left };
  if (rightArtistScore > leftArtistScore) return { title: left, artist: right };

  const rightLooksArtist = /^[\p{L}\p{N} .,'&]+$/u.test(right) && right.split(/\s+/).length <= 5;
  return rightLooksArtist ? { title: left, artist: right } : { title: right, artist: left };
}

function getDisplayArtistScore(value = "") {
  const text = normalizeNameForScore(value);
  const knownArtists = [
    "illyus barrientos",
    "illy's barrientos",
    "illys barrientos",
    "elderbrook",
    "chris lake",
    "gorgon city",
    "josh butler",
    "peter brown",
    "kink gong",
    "kink",
    "vozmediano",
    "dennis ferrer",
    "lane 8",
    "jo paciello",
    "nujabes",
    "shing02",
    "j dilla",
    "emapea",
    "sushi music",
    "jazz liberatorz",
    "slum village",
    "ras g",
    "spaze windu",
    "thes one",
    "the globetroddas",
    "midan",
    "potatohead people",
    "redman",
    "kapok",
    "common",
    "sultan + shepard",
    "sultan + shepherd",
    "sultan & shepard",
    "sultan & shepherd",
    "sultan shepard",
    "sultan shepherd",
    "jerro",
    "le youth",
    "marsh",
    "embrz",
    "kx5",
    "rufus du sol",
    "rüfüs du sol",
    "tinlicker",
    "nora en pure",
    "jan blomqvist",
    "bob moses",
    "ben bohmer",
    "ben böhmer",
    "yotto",
    "luttrell",
    "eli & fur"
  ];
  let score = 0;
  if (knownArtists.some((artist) => text === artist || text.includes(artist))) score += 5;
  if (text.includes("&") || text.includes(" x ") || text.includes(" vs ")) score += 1;
  if (/\b(dj|mc)\b/i.test(text)) score += 1;
  if (/^\d{4}$/.test(text)) score -= 3;
  if (!/[()[\]]/.test(text) && text.split(/\s+/).length <= 4) score += 1;
  if (/\b(remix|edit|mix|version|extended|radio|original|dub|live|control|over)\b/i.test(text)) score -= 2;
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

function getTrackDurationMinutes(track) {
  const durationMs = Number(track.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) return Math.max(2, durationMs / 60000);
  return 4;
}

function getTrackTempo(track, data = getFormData(), index = 0) {
  const tempo = Number(track.tempo);
  if (Number.isFinite(tempo) && tempo > 0) return Math.round(tempo);
  return getTempoFromMeta(track.meta) || estimateBpmForTrack(data, index);
}

function getTempoFromMeta(meta = "") {
  const match = String(meta).match(/(\d{2,3}(?:\.\d+)?)\s*BPM/i);
  const tempo = Number(match?.[1]);
  return Number.isFinite(tempo) ? Math.round(tempo) : null;
}

function getTrackCamelotKey(track, index = 0) {
  return normalizeCamelotKey(track.openKey || getCamelotKeyFromMeta(track.meta) || track.keyOf || estimateKeyForTrack(index));
}

function getCamelotKeyFromMeta(meta = "") {
  return String(meta).match(/\b([1-9]|1[0-2])\s*[ABd]\b/i)?.[0] ?? "";
}

function normalizeCamelotKey(value = "") {
  const match = String(value).trim().match(/\b([1-9]|1[0-2])\s*([ABd])\b/i);
  if (!match) return "";
  const side = match[2].toUpperCase() === "D" ? "B" : match[2].toUpperCase();
  return `${Number(match[1])}${side}`;
}

function getDesiredTrackCount(length) {
  return Math.max(6, Math.round(length / 4));
}

function getAvailableSetMinutes() {
  if (!sourceTracks.length) return null;
  return Math.round(getSourceTrackPool().reduce((sum, track) => sum + track.durationMinutes, 0));
}

function updateSetLengthWarning(data = getFormData()) {
  if (!setLengthWarning) return;
  const availableMinutes = getAvailableSetMinutes();
  if (!availableMinutes || availableMinutes >= data.length) {
    setLengthWarning.hidden = true;
    setLengthWarning.textContent = "";
    return;
  }

  const trackGoal = getDesiredTrackCount(data.length);
  const sourceCount = sourceTracks.length;
  setLengthWarning.hidden = false;
  setLengthWarning.textContent =
    currentLang === "zh"
      ? `这组歌估算约 ${availableMinutes} 分钟，少于你选择的 ${data.length} 分钟。Mixory 会优先避免重复歌曲，因此当前 flow 可能会短一些；下一步可以增加“智能补歌”功能来填满时长。`
      : `This source list is about ${availableMinutes} minutes, below your ${data.length}-minute target. Mixory will avoid repeating tracks, so the generated flow may be shorter; smart fill-in recommendations can be added next.`;
  if (sourceCount < trackGoal) {
    setLengthWarning.textContent +=
      currentLang === "zh"
        ? ` 目标大约需要 ${trackGoal} 首，你目前有 ${sourceCount} 首。`
        : ` The target needs about ${trackGoal} tracks; you currently have ${sourceCount}.`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeTrackRows(data) {
  const profile = vibeProfiles[data.vibe];
  const genreNotes = genreModifiers[data.genre] ?? genreModifiers.House;
  const sourcePool = getSourceTrackPool();
  const desiredTracks = sourceTracks.length
    ? Math.min(getDesiredTrackCount(data.length), sourcePool.length)
    : getDesiredTrackCount(data.length);
  const energyValues = makeVersionEnergyValues(data.vibe, desiredTracks, setVersionMode, data);
  const candidatePool = selectCandidateSourcePool(sourcePool, data, desiredTracks);
  const sequence = makeTransitionFriendlySequence(candidatePool, data, energyValues, desiredTracks, setVersionMode);

  return Array.from({ length: desiredTracks }, (_, index) => {
    const source = sequence[index % sequence.length];
    const transition = index % 3 === 0 ? genreNotes[index % genreNotes.length] : profile.transitions[index % profile.transitions.length];
    const djHint = data.dj ? (currentLang === "zh" ? `，参考 ${data.dj} 的情绪` : `, shaped toward ${data.dj}`) : "";
    return {
      id: `${source.title}-${source.artist}-${index}`,
      title: source.title,
      artist: source.artist,
      meta: source.meta,
      transitionKey: transition,
      transition: `${getTransitionLabel(transition)}${djHint}`,
      energy: energyValues[index] ?? 50,
      tempo: source.tempo,
      camelotKey: source.camelotKey,
      genre: source.genre,
      metadataEstimated: source.metadataEstimated,
      risk: null
    };
  });
}

function selectCandidateSourcePool(sourcePool, data, desiredTracks) {
  if (!sourcePool.length || sourcePool.length <= desiredTracks) return sourcePool;
  const mustHaveTracks = parseMustHaveTracks(data.mustHave);
  if (!mustHaveTracks.length) return sourcePool.slice(0, desiredTracks);

  const selected = [];
  const selectedIndexes = new Set();
  sourcePool.forEach((track, index) => {
    if (getMustHaveAffinity(track, mustHaveTracks) < 0.58) return;
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

function parseMustHaveTracks(value = "") {
  return String(value)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = splitTitleArtist(line);
      return {
        label: line,
        raw: normalizeNameForScore(line),
        title: normalizeNameForScore(parsed?.title || line),
        artist: normalizeNameForScore(parsed?.artist || "")
      };
    })
    .filter((item) => item.raw.length >= 3);
}

function getMustHaveAffinity(track, mustHaveTracks = parseMustHaveTracks(currentData.mustHave)) {
  if (!mustHaveTracks.length) return 0;
  const title = normalizeNameForScore(track.title || "");
  const artist = normalizeNameForScore(track.artist || "");
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

function makeTransitionFriendlySequence(sourcePool, data, energyValues, desiredTracks, mode = "smoothest") {
  const pool = sourcePool.slice(0, desiredTracks);
  if (pool.length <= 2) return pool;

  const remaining = [...pool].sort((a, b) => {
    const energySort = estimateTrackMixEnergy(a, data) - estimateTrackMixEnergy(b, data);
    return energySort;
  });
  const sequence = [];
  const startIndex = findBestStartTrackIndex(remaining, data);
  sequence.push(remaining.splice(startIndex, 1)[0]);

  while (remaining.length) {
    const index = findBestNextTrackIndex(sequence.at(-1), remaining, data, energyValues[sequence.length] ?? 50, mode, sequence, pool);
    sequence.push(remaining.splice(index, 1)[0]);
  }

  return sequence;
}

function findBestStartTrackIndex(tracks, data) {
  const preference = getPreferenceProfile(data);
  const referencePriority = getReferenceSmoothPriority();
  let bestIndex = 0;
  let bestScore = Infinity;
  tracks.forEach((track, index) => {
    const djAffinity = getDjReferenceAffinity(track, data);
    const mustHaveAffinity = getMustHaveAffinity(track, parseMustHaveTracks(data.mustHave));
    const referenceFit = getReferenceStartFit(track, data);
    const score = Math.abs(estimateTrackMixEnergy(track, data) - preference.startTarget)
      + Math.abs((track.tempo || estimateBpmForTrack(data, index)) - getTargetTempoForPosition(data, 0, tracks.length)) * preference.startTempoWeight
      - referenceFit * referencePriority.referencePattern * 6
      - djAffinity * preference.djReferenceWeight * 1.6
      - mustHaveAffinity * preference.mustHaveWeight;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function findBestNextTrackIndex(previous, candidates, data, targetEnergy, mode = "smoothest", sequence = [], poolContext = []) {
  const preference = getPreferenceProfile(data);
  const referencePriority = getReferenceSmoothPriority();
  let bestIndex = 0;
  let bestScore = Infinity;
  candidates.forEach((candidate, index) => {
    const tempoGap = Math.abs((candidate.tempo || 0) - (previous.tempo || candidate.tempo || 0));
    const keyGap = getCamelotDistance(previous.camelotKey, candidate.camelotKey);
    const keyConfidence = previous.metadataEstimated || candidate.metadataEstimated ? 0.48 : 1;
    const energyGap = Math.abs(estimateTrackMixEnergy(candidate, data) - targetEnergy);
    const genrePenalty = getGenreCompatibilityPenalty(previous.genre, candidate.genre);
    const djAffinity = getDjReferenceAffinity(candidate, data);
    const mustHaveAffinity = getMustHaveAffinity(candidate, parseMustHaveTracks(data.mustHave));
    const artistRepeatPenalty = getArtistRepeatPenalty(sequence, candidate, data, poolContext);
    const referencePatternPenalty = getReferencePatternPenalty(previous, candidate, data, targetEnergy);
    const weights = {
      tempo: 2.35 + referencePriority.tempo * 1.6,
      key: 1.05 + referencePriority.camelotKey * 2,
      energy: 1.05 + referencePriority.energyCurve * 1.4,
      genre: 1.25 + referencePriority.genreTexture * 1.9
    };
    const score = tempoGap * weights.tempo * preference.tempoWeight
      + keyGap * weights.key * preference.keyWeight * keyConfidence
      + energyGap * weights.energy * preference.energyWeight
      + genrePenalty * weights.genre * preference.genreWeight
      + referencePatternPenalty * referencePriority.referencePattern
      + artistRepeatPenalty * preference.artistRepeatWeight
      - djAffinity * preference.djReferenceWeight
      - mustHaveAffinity * preference.mustHaveWeight;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getDjReferenceAffinity(track, data = {}) {
  const reference = normalizeNameForScore(`${data.dj || ""} ${data.notes || ""}`);
  if (!reference) return 0;

  const artist = normalizeNameForScore(track.artist || "");
  const title = normalizeNameForScore(track.title || "");
  const genre = normalizeNameForScore(track.genre || data.genre || "");
  const trackText = `${artist} ${title} ${genre}`;
  let score = 0;

  const referenceTokens = reference
    .split(/[,;/]+|\band\b|\+|&/i)
    .map((token) => normalizeNameForScore(token))
    .filter((token) => token.length >= 3);
  if (referenceTokens.some((token) => artist.includes(token) || token.includes(artist))) score += 0.75;

  const profiles = [
    {
      refs: ["lane 8", "sultan", "shepard", "shepherd", "ben bohmer", "ben böhmer", "yotto", "marsh", "jerro", "le youth", "anjunadeep"],
      genres: ["melodic house", "progressive house", "deep house"],
      artists: ["lane 8", "sultan", "shepard", "ben bohmer", "ben böhmer", "yotto", "marsh", "jerro", "le youth", "tinlicker", "nora en pure", "luttrell", "eli & fur"]
    },
    {
      refs: ["keinemusik", "black coffee", "rampa", "adam port", "mochakk"],
      genres: ["afro house", "deep house", "organic house"],
      artists: ["keinemusik", "black coffee", "rampa", "adam port", "mochakk"]
    },
    {
      refs: ["fred again", "peggy gou", "four tet", "bicep", "bonobo"],
      genres: ["indie dance", "house", "deep house", "uk garage"],
      artists: ["fred again", "peggy gou", "four tet", "bicep", "bonobo", "caribou", "jungle"]
    }
  ];

  profiles.forEach((profile) => {
    const referenceMatches = profile.refs.some((ref) => reference.includes(ref));
    if (!referenceMatches) return;
    if (profile.artists.some((name) => trackText.includes(name))) score += 0.55;
    if (profile.genres.some((name) => genre.includes(name))) score += 0.25;
  });

  return Math.max(0, Math.min(1, score));
}

function getReferenceSmoothPriority() {
  const priority = getReferencePattern()?.smoothPriority ?? {};
  return {
    tempo: Number(priority.tempo) || 0.34,
    genreTexture: Number(priority.genreTexture) || 0.23,
    energyCurve: Number(priority.energyCurve) || 0.22,
    camelotKey: Number(priority.camelotKey) || 0.16,
    referencePattern: Number(priority.referencePattern) || 0.05
  };
}

function getReferenceStartFit(track = {}, data = {}) {
  const pattern = getReferencePattern();
  if (!pattern) return 0;
  const flow = normalizeNameForScore(pattern.flow || "");
  const genre = normalizeNameForScore(track.genre || data.genre || "");
  const energy = estimateTrackMixEnergy(track, data);
  let score = 0;

  if (/slow-rise|low-pressure/.test(flow) && energy <= 38) score += 1;
  if (/deep-layered|club-groove|uk-garage/.test(flow) && energy >= 30 && energy <= 56) score += 0.75;
  if (/festival-burst/.test(flow) && energy >= 48) score += 0.65;
  if (/melodic|progressive|deep|organic|afro|garage|house|lo.?fi|jazz|soul/.test(`${flow} ${genre}`)) score += 0.35;

  return Math.min(1, score);
}

function getReferencePatternPenalty(previous = {}, candidate = {}, data = {}, targetEnergy = 50) {
  const pattern = getReferencePattern();
  if (!pattern) return 0;
  const flow = normalizeNameForScore(pattern.flow || "");
  const transitionStyle = normalizeNameForScore(pattern.transitionStyle || "");
  const candidateEnergy = estimateTrackMixEnergy(candidate, data);
  const previousEnergy = estimateTrackMixEnergy(previous, data);
  const energyMovement = candidateEnergy - previousEnergy;
  let penalty = 0;

  if (/slow-rise|melodic/.test(flow)) {
    if (Math.abs((candidate.tempo || 0) - (previous.tempo || candidate.tempo || 0)) > 8) penalty += 7;
    if (energyMovement < -14) penalty += 6;
  }

  if (/low-pressure/.test(flow)) {
    if (candidateEnergy > 62) penalty += 8;
    if (Math.abs(energyMovement) > 18) penalty += 5;
  }

  if (/deep-layered|club-groove/.test(flow)) {
    if (getGenreCompatibilityPenalty(previous.genre, candidate.genre) >= 12) penalty += 6;
    if (Math.abs(energyMovement) > 24) penalty += 4;
  }

  if (/uk-garage/.test(flow) && !/garage|house|groove|dance|pop/.test(normalizeNameForScore(candidate.genre || ""))) {
    penalty += 4;
  }

  if (/festival-burst/.test(flow) && candidateEnergy < targetEnergy - 24) penalty += 5;
  if (/long blends|harmonic/.test(transitionStyle) && getCamelotDistance(previous.camelotKey, candidate.camelotKey) > 3) penalty += 3;

  return penalty;
}

function getArtistRepeatPenalty(sequence = [], candidate = {}, data = {}, poolContext = []) {
  const candidateArtist = getPrimaryArtistName(candidate.artist);
  if (!candidateArtist) return 0;

  const recentTracks = sequence.slice(-3);
  const samePrevious = isSamePrimaryArtist(sequence.at(-1)?.artist, candidate.artist);
  const recentSameCount = recentTracks.filter((track) => isSamePrimaryArtist(track.artist, candidate.artist)).length;
  if (!samePrevious && !recentSameCount) return 0;

  let penalty = samePrevious ? 8 : 3;
  if (recentSameCount >= 2) penalty += 6;

  const artistShare = getArtistShare(candidateArtist, poolContext);
  const isPreferred = isArtistPreferred(candidate.artist, data);
  if (artistShare >= 0.25) penalty *= 0.45;
  if (isPreferred) penalty *= 0.38;

  return penalty;
}

function isSamePrimaryArtist(left = "", right = "") {
  const a = getPrimaryArtistName(left);
  const b = getPrimaryArtistName(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b));
}

function getPrimaryArtistName(value = "") {
  return normalizeNameForScore(value)
    .split(/\s*(?:,|&|\+|\bx\b|\bfeat\.?\b|\bfeaturing\b|\bwith\b)\s*/i)
    .find(Boolean) || "";
}

function getArtistShare(primaryArtist = "", poolContext = []) {
  if (!primaryArtist || !poolContext.length) return 0;
  const count = poolContext.filter((track) => isSamePrimaryArtist(track.artist, primaryArtist)).length;
  return count / poolContext.length;
}

function isArtistPreferred(artist = "", data = {}) {
  const preferredText = normalizeNameForScore(`${data.dj || ""} ${data.mustHave || ""} ${data.notes || ""}`);
  const primaryArtist = getPrimaryArtistName(artist);
  return Boolean(primaryArtist && preferredText.includes(primaryArtist));
}

function estimateTrackMixEnergy(track, data) {
  const tempo = Number(track.tempo) || estimateBpmForTrack(data, 0);
  const genre = normalizeNameForScore(track.genre || data.genre);
  const tempoScore = Math.max(0, Math.min(100, ((tempo - 76) / 64) * 100));
  const genreBoost =
    /mainstage|big room|bass|dubstep|techno|trance/.test(genre) ? 12 :
    /house|garage|disco|funk|groove/.test(genre) ? 6 :
    /lo.?fi|nu soul|jazzy|chill|ambient/.test(genre) ? -10 :
    0;
  return Math.max(8, Math.min(98, tempoScore + genreBoost));
}

function getTargetTempoForPosition(data, index, count) {
  const range = getInsightProfile(data.vibe).bpmRange.match(/\d+/g)?.map(Number) ?? [96, 124];
  const low = range[0] ?? 96;
  const high = range[1] ?? low + 18;
  const progress = count <= 1 ? 0 : index / (count - 1);
  return low + (high - low) * progress;
}

function getCamelotDistance(left = "", right = "") {
  const a = parseCamelotKey(left);
  const b = parseCamelotKey(right);
  if (!a || !b) return 0.75;
  const wheelDistance = Math.min(Math.abs(a.number - b.number), 12 - Math.abs(a.number - b.number));
  const modeDistance = a.mode === b.mode ? 0 : 0.5;
  return wheelDistance + modeDistance;
}

function parseCamelotKey(value = "") {
  const match = normalizeCamelotKey(value).match(/^([1-9]|1[0-2])([AB])$/);
  return match ? { number: Number(match[1]), mode: match[2] } : null;
}

function getGenreCompatibilityPenalty(left = "", right = "") {
  const a = normalizeNameForScore(left);
  const b = normalizeNameForScore(right);
  if (!a || !b || a === b) return 0;
  const leftFamily = getGenreFamily(a);
  const rightFamily = getGenreFamily(b);
  if (!leftFamily || !rightFamily) return 9;
  if (leftFamily === rightFamily) return 2;

  const pair = [leftFamily, rightFamily].sort().join("|");
  const softPairs = new Set([
    "deep-melodic|house-groove",
    "chill-soul|house-groove",
    "house-groove|pop-dance",
    "club-rave|deep-melodic",
    "club-rave|house-groove"
  ]);
  const mediumPairs = new Set([
    "chill-soul|deep-melodic",
    "bass|club-rave",
    "bass|house-groove",
    "deep-melodic|pop-dance"
  ]);
  if (softPairs.has(pair)) return 5;
  if (mediumPairs.has(pair)) return 9;
  return 16;
}

function getGenreFamily(value = "") {
  const text = normalizeNameForScore(value).replace(/-/g, " ");
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

function getTransitionRisk(previous, track) {
  if (!previous) return { key: "smooth", score: 0 };
  const tempoGap = Math.abs((track.tempo || 0) - (previous.tempo || track.tempo || 0));
  const keyGap = getCamelotDistance(previous.camelotKey, track.camelotKey);
  const keyConfidence = previous.metadataEstimated || track.metadataEstimated ? 0.5 : 1;
  const genrePenalty = getGenreCompatibilityPenalty(previous.genre, track.genre);
  const energyGap = Math.abs(Number(track.energy || 0) - Number(previous.energy || 0));
  const score = tempoGap * 1.8 + keyGap * 1.8 * keyConfidence + genrePenalty * 1.25 + energyGap * 0.56;
  if (score >= 34) return { key: "risky", score };
  if (score >= 20) return { key: "check", score };
  return { key: "smooth", score };
}

function getRiskLabel(riskKey = "smooth") {
  if (riskKey === "risky") return t("riskRisky");
  if (riskKey === "check") return t("riskCheck");
  return t("riskSmooth");
}

function updateTrackRisks() {
  currentRows = currentRows.map((track, index, rows) => ({
    ...track,
    risk: getTransitionRisk(rows[index - 1], track).key
  }));
}

function renderMustHaveFeedback() {
  if (!mustHaveFeedback) return;
  const mustHaveTracks = parseMustHaveTracks(currentData.mustHave);
  if (!mustHaveTracks.length || !currentRows.length) {
    mustHaveFeedback.hidden = true;
    mustHaveFeedback.textContent = "";
    return;
  }

  const found = mustHaveTracks.filter((item) => currentRows.some((track) => getMustHaveAffinity(track, [item]) >= 0.58));
  const missing = mustHaveTracks.filter((item) => !found.includes(item));
  const foundText = t("mustHaveFound")
    .replace("{found}", found.length)
    .replace("{total}", mustHaveTracks.length);
  const missingText = missing.length
    ? ` · ${t("mustHaveMissing").replace("{tracks}", missing.map((item) => item.label || item.raw).join(", "))}`
    : "";

  mustHaveFeedback.hidden = false;
  mustHaveFeedback.textContent = `${foundText}${missingText}`;
}

function getTrackTransitionText(track, data = currentData) {
  const base = track.transitionKey ? getTransitionLabel(track.transitionKey) : track.transition;
  const djHint = data?.dj ? (currentLang === "zh" ? `，参考 ${data.dj} 的情绪` : `, shaped toward ${data.dj}`) : "";
  return `${base}${track.transitionKey ? djHint : ""}`;
}

function estimateBpmForTrack(data, index) {
  const range = getInsightProfile(data.vibe).bpmRange.match(/\d+/g)?.map(Number) ?? [96, 124];
  const low = range[0] ?? 96;
  const high = range[1] ?? low + 18;
  const arc = index < 2 ? low + index * 3 : index < 8 ? low + Math.min(high - low, index * 4) : high - (index % 4) * 2;
  return Math.max(70, Math.min(150, Math.round(arc)));
}

function estimateKeyForTrack(index) {
  const keys = ["8A", "9A", "9B", "10B", "11B", "10A", "7A", "6B"];
  return keys[index % keys.length];
}

function resetEnergyCurve() {
  energyCurveLine.setAttribute("d", "");
  energyCurveArea.setAttribute("d", "");
  energyCurvePoints.innerHTML = "";
  energyCurvePeak.textContent = t("energyCurvePeak");
}

function makeEnergyValues(vibe, count) {
  const referencePattern = getReferencePattern();
  const anchors = Array.isArray(referencePattern?.energyCurve) && referencePattern.energyCurve.length >= 3
    ? referencePattern.energyCurve
    : {
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

function makeVersionEnergyValues(vibe, count, mode = "smoothest", data = currentData) {
  const values = makeEnergyValues(vibe, count);
  const preference = getPreferenceProfile(data);
  const shapedValues = values.map((value, index) => {
    const position = values.length === 1 ? 0 : index / (values.length - 1);
    const softIntro = index === 0 ? preference.introBias : 0;
    const softOutro = index === values.length - 1 ? preference.outroBias : 0;
    const middleLift = Math.sin(position * Math.PI) * preference.midLift;
    return Math.round(Math.max(8, Math.min(98, value + preference.energyBias + softIntro + softOutro + middleLift)));
  });
  return shapedValues;
}

function getPreferenceProfile(data = {}) {
  const text = normalizeNameForScore(`${data.dj || ""} ${data.notes || ""}`);
  const isSmooth = /smooth|soft|gentle|dreamy|warm|melodic|chill|coffee|focus|lo.?fi|nujabes|bonobo|ben bohmer|lane 8|four tet|black coffee|keinemusik|deep/.test(text);
  const isHighEnergyContext = /peak|club|rave|festival|workout|hard|high energy|punchy|fred again|peggy gou|chris lake|fisher|skrillex|knock2|mau p|charlotte/.test(text);
  const wantsSoftIntro = /soft intro|gentle intro|slow intro|warm intro|柔和|慢慢|开场/.test(text);
  const wantsPeak = /mid.?set peak|peak|高潮|推高|爆点/.test(text);
  const wantsDreamyOutro = /dreamy outro|soft outro|gentle ending|closing|outro|结尾|收尾/.test(text);

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
    movementWeight: isSmooth ? 0.8 : 1,
    djReferenceWeight: 2.65,
    mustHaveWeight: 3.8,
    artistRepeatWeight: 1
  };
}

function getCurrentEnergyValues(data, count) {
  const rowValues = currentRows
    .map((track) => Number(track.energy))
    .filter(Number.isFinite);
  return rowValues.length >= 2 ? rowValues : makeEnergyValues(data.vibe, Math.max(2, count));
}

function renderEnergyCurve(data, count) {
  const values = getCurrentEnergyValues(data, count);
  const width = 280;
  const height = 86;
  const left = 20;
  const top = 18;
  const bottom = top + height;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => {
    const x = left + index * step;
    const y = bottom - (value / 100) * height;
    return { x, y, value };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1).x.toFixed(1)} ${bottom} L ${points[0].x.toFixed(1)} ${bottom} Z`;
  const peak = Math.max(...values);

  energyCurveLine.setAttribute("d", linePath);
  energyCurveArea.setAttribute("d", areaPath);
  energyCurvePoints.innerHTML = points
    .map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index === values.indexOf(peak) ? 4.2 : 3}" />`)
    .join("");
  energyCurvePeak.textContent = currentLang === "zh" ? `峰值 ${peak}%` : `Peak ${peak}%`;
}

function makeSetTitle(data = currentData) {
  const vibe = getVibeLabel(data.vibe);
  const genre = getGenreLabel(data.genre);
  const length = formatLength(data.length);
  return currentLang === "zh"
    ? `${vibe} ${genre} - ${length}${t("setSuffix")}`
    : `${vibe} ${genre} - ${length} ${t("setSuffix")}`;
}

function makeSetRationale(data = currentData) {
  const profile = getInsightProfile(data.vibe);
  const referencePattern = getReferencePattern();
  const topGenres = Array.isArray(profile.genres)
    ? profile.genres
        .slice(0, 2)
        .map(([genre, value]) => `${getGenreLabel(genre)} ${value}%`)
        .join(currentLang === "zh" ? "、" : " and ")
    : "";
  const bpm = formatBpmRange(referencePattern?.bpmRange ?? profile.bpmRange);

  if (currentLang === "zh") {
    return `Mixory 基于 ${topGenres || getGenreLabel(profile.recommendedGenre)}、${bpm}，优先让相邻歌曲的 BPM、能量和曲风更连贯；Camelot 调性和相近 reference set 作为辅助，让 Apple Music AutoMix / Spotify Mix 播放起来更自然。`;
  }

  return `Mixory builds this flow around ${topGenres || getGenreLabel(profile.recommendedGenre)} and a ${bpm} arc, prioritizing BPM, energy, and genre continuity. Camelot key and similar reference-set patterns are used as soft guides for smoother Apple Music AutoMix / Spotify Mix playback.`;
}

function makeReferenceArtistText() {
  const match = backendInsightProfile?.referenceMatch;
  const primary = match?.primary?.dj;
  const alternatives = Array.isArray(match?.alternatives)
    ? match.alternatives.map((item) => item.dj).filter(Boolean).slice(0, 2)
    : [];
  const names = [primary, ...alternatives].filter(Boolean);
  if (!names.length) return "";
  return `${t("referenceArtistPrefix")}: ${Array.from(new Set(names)).join(" / ")}`;
}

function updateSetSummary(data = currentData) {
  const profile = vibeProfiles[data.vibe];
  const insightProfile = getInsightProfile(data.vibe);
  const referencePattern = getReferencePattern();
  currentData = data;
  updateSetLengthWarning(data);

  resultTitle.textContent = makeSetTitle(data);
  const availableMinutes = getAvailableSetMinutes();
  timeBadge.textContent =
    availableMinutes && availableMinutes < data.length
      ? `≈${availableMinutes} / ${data.length} ${t("min")}`
      : `${data.length} ${t("min")}`;
  bpmArc.textContent = formatBpmRange(referencePattern?.bpmRange ?? insightProfile.bpmRange ?? profile.bpm);
  energyArc.textContent = getEnergyLabel(referencePattern?.flow ?? profile.energy);
  trackCount.textContent = currentRows.length;
  if (setRationaleCopy) setRationaleCopy.textContent = makeSetRationale(data);
  if (referenceArtistCopy) {
    const referenceText = makeReferenceArtistText();
    referenceArtistCopy.textContent = referenceText;
    referenceArtistCopy.hidden = !referenceText;
  }
  renderEnergyCurve(data, currentRows.length);
}

function renderTracklist() {
  updateTrackRisks();
  tracklist.innerHTML = currentRows
    .map(
      (track, index) => `
        <li class="track" data-row-index="${index}">
          <button class="track__drag" type="button" draggable="true" aria-label="${escapeHtml(currentLang === "zh" ? "拖动排序" : "Drag to reorder")}" title="${escapeHtml(currentLang === "zh" ? "拖动排序" : "Drag to reorder")}">⋮⋮</button>
          <div class="track__name">
            <strong>${escapeHtml(track.title)}</strong>
            <span>${escapeHtml(track.artist)}</span>
          </div>
          <div class="track__order">
            <button type="button" data-move-index="${index}" data-move-direction="-1" aria-label="${escapeHtml(t("moveUpLabel"))}" title="${escapeHtml(t("moveUpLabel"))}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-move-index="${index}" data-move-direction="1" aria-label="${escapeHtml(t("moveDownLabel"))}" title="${escapeHtml(t("moveDownLabel"))}" ${index === currentRows.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div class="track__meta">${escapeHtml(track.meta || `${track.energy}%`)}</div>
          <div class="track__risk track__risk--${escapeHtml(track.risk || "smooth")}">${escapeHtml(getRiskLabel(track.risk))}</div>
          <div class="track__transition">${escapeHtml(t("transitionPrefix"))}: ${escapeHtml(getTrackTransitionText(track))}</div>
        </li>
      `
    )
    .join("");
  if (betaNote) betaNote.hidden = !currentRows.length;
  if (setRationale) setRationale.hidden = !currentRows.length;
  if (playbackTip) playbackTip.hidden = !currentRows.length;
  if (setlistTools) setlistTools.hidden = currentRows.length < 2;
  renderMustHaveFeedback();
  if (setVersion) setVersion.hidden = !currentRows.length;
  if (exportSteps) exportSteps.hidden = !currentRows.length;
  setExportEnabled(Boolean(currentRows.length));
}

function renderCurrentSet(data = currentData) {
  setResultStage("generated");
  updateVisualTheme(data.genre, true);
  updateSetSummary(data);
  renderTracklist();
}

function renderSet(data = getFormData()) {
  currentRows = makeTrackRows(data);
  currentData = data;
  renderCurrentSet(data);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasMusicInput()) {
    updateInputGate();
    musicInput.focus();
    return;
  }
  setStatus("optimized");
  showOutputLoading();
  renderInsight();
  await sleep(700);
  renderSet();
  showOutputSuccess();
});

resetButton.addEventListener("click", () => {
  form.reset();
  hasPlaylistAnalysis = false;
  backendInsightProfile = null;
  sourceTracks = [];
  analyzedSourceTracks = [];
  parseFormat = "auto";
  uploadedPlaylistRawText = "";
  renderParsedPreview();
  updateInputGate();
  const defaultData = {
    length: 45,
    genre: "House",
    vibe: "Sunset",
    dj: "",
    mustHave: "",
    notes: ""
  };
  renderInsight(defaultData);
  updateSetLengthWarning(defaultData);
  updateVisualTheme("", false);
  showEmptyOutput();
});

document.querySelectorAll("input, select, textarea").forEach((control) => {
  control.addEventListener("change", () => {
    if (control.id === "genre") updateVisualTheme(control.value, Boolean(currentRows.length));
    updateInputGate();
    if (!hasMusicInput() && control !== musicInput) return;
    setStatus("draft");
    renderInsight();
    updateSetLengthWarning();
    if (control === musicInput) showEmptyOutput();
  });
});

musicInput.addEventListener("input", () => {
  backendInsightProfile = null;
  sourceTracks = [];
  analyzedSourceTracks = [];
  parseFormat = "auto";
  uploadedPlaylistRawText = "";
  hasPlaylistAnalysis = false;
  renderParsedPreview();
  updateInputGate();
  updateSetLengthWarning();
  showEmptyOutput();
});

analyzeButton.addEventListener("click", async () => {
  if (!hasMusicInput()) return;
  try {
    setStatus("analyzed");
    showOutputLoading("outputAnalyzeTitle", "outputAnalyzeCopy");
    const usedRealTrackData = await analyzePlaylistWithBackend();
    hasPlaylistAnalysis = usedRealTrackData;
    updateInputGate();
    renderInsight();
    renderParsedPreview();
    updateSetLengthWarning();
    if (!usedRealTrackData) {
      if (!shouldUseBackend()) {
        showOutputError("outputServerRequiredTitle", "outputServerRequiredCopy");
      } else {
        showOutputError();
      }
      return;
    }
    await sleep(450);
    showOutputSuccess("outputAnalyzeSuccessTitle", "outputAnalyzeSuccessCopy");
  } catch (error) {
    backendInsightProfile = null;
    sourceTracks = [];
    analyzedSourceTracks = [];
    parseFormat = "auto";
    hasPlaylistAnalysis = false;
    renderParsedPreview();
    updateInputGate();
    renderInsight();
    updateSetLengthWarning();
    if (error?.name === "AbortError") {
      showOutputError("outputAnalyzeTimeoutTitle", "outputAnalyzeTimeoutCopy");
    } else {
      showOutputError();
    }
    console.warn(error);
  }
});

surpriseButton.addEventListener("click", async () => {
  if (!hasMusicInput()) return;
  const vibe = pickSurpriseVibe();
  const profile = getInsightProfile(vibe);
  applySetControls({
    length: 45,
    genre: profile.recommendedGenre,
    vibe
  });
  setStatus("surprised");
  showOutputLoading();
  renderInsight(getFormData());
  updateSetLengthWarning();
  await sleep(700);
  renderSet(getFormData());
  showOutputSuccess();
});

useRecommendationButton.addEventListener("click", () => {
  if (!hasMusicInput()) return;
  const data = getFormData();
  applySetControls(getRecommendedSettings(data));
  setStatus("recommended");
  renderInsight(getFormData());
  updateSetLengthWarning();
  showEmptyOutput();
});

formatButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!analyzedSourceTracks.length) return;
    applyParseFormat(button.dataset.format);
  });
});

parsedTrackList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-swap-index]");
  if (!button) return;
  swapParsedTrack(Number(button.dataset.swapIndex));
});

tracklist.addEventListener("dragstart", (event) => {
  if (!event.target.closest(".track__drag")) {
    event.preventDefault();
    return;
  }
  const row = event.target.closest(".track");
  if (!row) return;
  draggedTrackIndex = Number(row.dataset.rowIndex);
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedTrackIndex));
});

tracklist.addEventListener("dragend", (event) => {
  event.target.closest(".track")?.classList.remove("is-dragging");
  draggedTrackIndex = null;
});

tracklist.addEventListener("dragover", (event) => {
  if (draggedTrackIndex === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

tracklist.addEventListener("drop", (event) => {
  const target = event.target.closest(".track");
  if (!target || draggedTrackIndex === null) return;
  event.preventDefault();
  moveCurrentTrack(draggedTrackIndex, Number(target.dataset.rowIndex));
});

tracklist.addEventListener("click", (event) => {
  const button = event.target.closest("[data-move-index]");
  if (!button) return;
  const fromIndex = Number(button.dataset.moveIndex);
  const direction = Number(button.dataset.moveDirection);
  moveCurrentTrack(fromIndex, fromIndex + direction);
});

function moveCurrentTrack(fromIndex, toIndex) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentRows.length || toIndex >= currentRows.length) return;
  const [moved] = currentRows.splice(fromIndex, 1);
  currentRows.splice(toIndex, 0, moved);
  renderCurrentSet(currentData);
}

function getDetailedTracklistText() {
  const lines = currentRows
    .map((track, index) => `${String(index + 1).padStart(2, "0")}. ${track.title} - ${track.artist}${track.meta ? ` (${track.meta})` : ""} | ${track.energy}% | ${getRiskLabel(track.risk)} | ${getTrackTransitionText(track)}`)
    .join("\n");
  return `${makeSetTitle(currentData)}\n${"-".repeat(Math.min(48, makeSetTitle(currentData).length))}\n${lines}`;
}

function getSimpleTracklistText() {
  return currentRows
    .map((track, index) => `${String(index + 1).padStart(2, "0")}. ${track.title} - ${track.artist}`)
    .join("\n");
}

function downloadTextFile(filename, content) {
  const file = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("connectSpotify");
}

exportSimpleButton.addEventListener("click", () => {
  downloadTextFile("mixory-simple-setlist.txt", getSimpleTracklistText());
});

exportDetailedButton.addEventListener("click", () => {
  downloadTextFile("mixory-detailed-setlist.txt", getDetailedTracklistText());
});

trackFile.addEventListener("change", async () => {
  const [file] = trackFile.files ?? [];
  if (!file) return;
  const fileText = await readPlaylistFileText(file);
  uploadedPlaylistRawText = fileText;
  musicInput.value = convertStructuredPlaylistTextToTrackText(fileText) || normalizePlaylistText(fileText);
  backendInsightProfile = null;
  sourceTracks = [];
  analyzedSourceTracks = [];
  parseFormat = "auto";
  hasPlaylistAnalysis = false;
  renderParsedPreview();
  updateSetLengthWarning();
  updateInputGate();
  showEmptyOutput();
});

async function readPlaylistFileText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  const sampleLength = Math.min(bytes.length, 2000);
  let oddNulls = 0;
  let evenNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  if (oddNulls > sampleLength * 0.2) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (evenNulls > sampleLength * 0.2) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  return new TextDecoder("utf-8").decode(buffer);
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLang = button.dataset.lang;
    try {
      window.localStorage.setItem("mixoryLang", currentLang);
    } catch {
      // Language switching should still work when storage is unavailable.
    }
    updateStaticCopy();
    renderInsight(getFormData());
    if (currentRows.length) {
      renderCurrentSet(currentData);
      showOutputSuccess();
    } else {
      showEmptyOutput();
    }
  });
});

updateStaticCopy();
updateVisualTheme("", false);
updateInputGate();
renderInsight({
  length: 45,
  genre: "House",
  vibe: "Sunset",
  dj: "",
  notes: ""
});
showEmptyOutput();
