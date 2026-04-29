import type { VercelRequest, VercelResponse } from "@vercel/node";

type EquipmentSlot = "weapon" | "helmet" | "shoulder" | "chest" | "pants" | "gloves";

type ParsedPiece = {
  slot: EquipmentSlot;
  itemName: string;
  itemLevel: number | null;
  honingLevel: number;
  advancedRefiningLevel: number;
};

type ImportDebug = {
  officialLevelFound: boolean;
  officialPieceCount: number;
  fallbackLevelFound: boolean;
  fallbackPieceCount: number;
  officialLevelSnippet: string;
  officialFirstPieceSnippet: string;
  fallbackLevelSnippet: string;
};

const SLOT_ORDER: EquipmentSlot[] = ["helmet", "shoulder", "chest", "pants", "gloves", "weapon"];
const SLOT_KEYWORDS: Array<[EquipmentSlot, RegExp]> = [
  ["helmet", /(투구|머리|머리장식|머리 방어구|헤드)/],
  ["shoulder", /(견갑|어깨|어깨장식)/],
  ["chest", /(상의|갑옷|로브|재킷|자켓)/],
  ["pants", /(하의|바지|팬츠)/],
  ["gloves", /(장갑|글러브)/],
  ["weapon", /(무기|검|대검|도끼|창|활|총|건틀릿|해머|스태프|투르마리|랜스|캐넌|리볼버|서클릿)/],
];

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0027/gi, "'");
}

function stripHtml(input: string) {
  return decodeHtmlEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|section|article|h\d|span|small|font)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function normalizeSourceText(input: string) {
  return decodeHtmlEntities(input).replace(/\u00a0/g, " ");
}

function clipSnippet(input: string, max = 220) {
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseNumber(input: string | undefined) {
  if (!input) return null;
  const value = Number(input.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function collectLevelCandidates(input: string) {
  return Array.from(input.matchAll(/([0-9]{1,3}(?:,[0-9]{3})?\.[0-9]{2})/g))
    .map((match) => parseNumber(match[1]))
    .filter((value): value is number => value != null && value >= 1500 && value <= 1800);
}

function extractCurrentItemLevel(input: string) {
  const patterns = [
    /장착\s*아이템\s*레벨[\s\S]{0,160}?Lv\.\s*([0-9][0-9,]*)\s*\.?\s*([0-9]{2})/i,
    /장착\s*아이템\s*레벨[\s\S]{0,160}?([0-9][0-9,]*\.[0-9]{2})/i,
    /Item(?:Avg|Max)Level["':=\s]+["']?([0-9][0-9,]*\.[0-9]{2})/i,
    /Lv\.\s*([0-9][0-9,]*\.[0-9]{2})/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;
    const raw = match[2] ? `${match[1]}.${match[2]}` : match[1];
    const value = parseNumber(raw);
    if (value != null && value >= 1500 && value <= 1800) return value;
  }

  return collectLevelCandidates(input)[0] ?? null;
}

function extractCombatPower(input: string) {
  const patterns = [
    /전투력[\s\S]{0,140}?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /combat[^0-9]{0,80}([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    const value = parseNumber(match?.[1]);
    if (value != null && value >= 100 && value <= 100000) return value;
  }

  return null;
}

function inferSlot(block: string, itemName: string, fallbackIndex: number) {
  for (const [slot, pattern] of SLOT_KEYWORDS) {
    if (pattern.test(itemName)) return slot;
  }
  for (const [slot, pattern] of SLOT_KEYWORDS) {
    if (pattern.test(block)) return slot;
  }
  return SLOT_ORDER[fallbackIndex] ?? "weapon";
}

function extractPieceItemLevel(block: string) {
  const patterns = [
    /아이템\s*레벨\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /아이템[\s\S]{0,24}레벨[\s\S]{0,32}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /item\s*level\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    const value = parseNumber(match?.[1]);
    if (value != null && value >= 1500 && value <= 1800) return value;
  }

  return null;
}

function extractAllPieceItemLevels(input: string) {
  const levels: number[] = [];
  for (const match of input.matchAll(/아이템\s*레벨\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)) {
    const value = parseNumber(match[1]);
    if (value != null && value >= 1500 && value <= 1800) levels.push(value);
    if (levels.length >= 6) break;
  }
  return levels;
}

function estimatePieceItemLevel(piece: ParsedPiece) {
  if (!Number.isFinite(piece.honingLevel) || piece.honingLevel <= 0) return null;
  const value = 1590 + piece.honingLevel * 5 + Math.max(0, piece.advancedRefiningLevel || 0);
  return value >= 1500 && value <= 1800 ? value : null;
}

function fillMissingPieceItemLevels(pieces: ParsedPiece[], input: string) {
  const levels = extractAllPieceItemLevels(input);
  return pieces.map((piece, index) => ({
    ...piece,
    itemLevel: piece.itemLevel ?? levels[index] ?? estimatePieceItemLevel(piece),
  }));
}

function dedupePieces(pieces: ParsedPiece[]) {
  const bySlot = new Map<EquipmentSlot, ParsedPiece>();
  for (const piece of pieces) {
    if (!bySlot.has(piece.slot)) bySlot.set(piece.slot, piece);
  }
  return SLOT_ORDER.map((slot) => bySlot.get(slot)).filter(Boolean) as ParsedPiece[];
}

function parsePieceBlock(block: string, fallbackIndex: number): ParsedPiece | null {
  const cleaned = stripHtml(block);
  const titleMatch =
    block.match(/\+(\d{1,2})\s*([^<\n'"]{2,80})/) ??
    cleaned.match(/\+(\d{1,2})\s*([^\n]{2,80})/);
  const honingLevel = Number(titleMatch?.[1] ?? 0);
  const itemName = (titleMatch?.[2] ?? "").replace(/\s+/g, " ").trim();
  if (!itemName || !Number.isFinite(honingLevel) || honingLevel <= 0) return null;

  const advancedMatch = cleaned.match(/\[?\s*상급\s*재련\s*\]?[\s\S]{0,120}?(\d{1,2})\s*단계/);
  const advancedRefiningLevel = Number(advancedMatch?.[1] ?? 0);

  return {
    slot: inferSlot(cleaned, itemName, fallbackIndex),
    itemName,
    itemLevel: extractPieceItemLevel(cleaned),
    honingLevel,
    advancedRefiningLevel,
  };
}

function extractOfficialPieces(input: string) {
  const normalized = normalizeSourceText(input);
  const candidates: string[] = [];

  for (const match of normalized.matchAll(/NameTagBox[\s\S]{0,2600}?(?:현재 단계 재련 경험치|분해불가|내구도\s*\d+\s*\/\s*\d+)/gi)) {
    candidates.push(match[0]);
  }

  if (candidates.length < 6) {
    for (const match of normalized.matchAll(/\+\d{1,2}\s*[^<\n'"]{2,80}[\s\S]{0,1200}?(?:아이템\s*레벨\s*1[67][0-9]{2}|상급\s*재련)/gi)) {
      candidates.push(match[0]);
    }
  }

  const parsed = candidates
    .map((block, index) => parsePieceBlock(block, index))
    .filter((piece): piece is ParsedPiece => Boolean(piece));

  return fillMissingPieceItemLevels(dedupePieces(parsed), normalized);
}

function extractKloaPieces(input: string) {
  const normalized = normalizeSourceText(input);
  const pieces: ParsedPiece[] = [];
  const lineMatches = normalized.matchAll(/\+(\d{1,2})\s*x\s*(\d{1,2})\s*([^<\n]{2,80})/gi);

  for (const match of lineMatches) {
    const slot = SLOT_ORDER[pieces.length];
    if (!slot) break;
    pieces.push({
      slot,
      itemLevel: null,
      honingLevel: Number(match[1]),
      advancedRefiningLevel: Number(match[2]),
      itemName: match[3].trim(),
    });
  }

  return pieces;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko,en-US;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) throw new Error(`FETCH_FAILED:${response.status}`);
  return response.text();
}

async function fetchOfficialProfile(nickname: string) {
  const url = `https://lostark.game.onstove.com/Profile/Character/${encodeURIComponent(nickname)}`;
  const html = await fetchHtml(url);
  const combined = `${normalizeSourceText(html)}\n${stripHtml(html)}`;
  const currentItemLevel = extractCurrentItemLevel(combined);
  const combatPower = extractCombatPower(combined);
  const pieces = extractOfficialPieces(combined);
  const levelSnippetMatch =
    combined.match(/장착\s*아이템\s*레벨[\s\S]{0,160}?<\/span>/i) ??
    combined.match(/Lv\.?\s*[0-9][0-9,]*\.[0-9]{2}/i);
  const firstPieceSnippet = (combined.match(/\+\d{1,2}\s*[^<\n'"]{2,80}[\s\S]{0,300}?아이템\s*레벨\s*1[67][0-9]{2}/i) ?? [])[0] ?? "";

  return {
    source: "official" as const,
    sourceUrl: url,
    currentItemLevel,
    combatPower,
    pieces,
    debug: {
      officialLevelFound: currentItemLevel != null,
      officialPieceCount: pieces.length,
      officialLevelSnippet: clipSnippet(levelSnippetMatch?.[0] ?? ""),
      officialFirstPieceSnippet: clipSnippet(firstPieceSnippet),
    },
  };
}

async function fetchKloaFallback(nickname: string) {
  const url = `https://kloa.gg/characters/${encodeURIComponent(nickname)}`;
  const html = await fetchHtml(url);
  const combined = `${normalizeSourceText(html)}\n${stripHtml(html)}`;
  const currentItemLevel = extractCurrentItemLevel(combined);
  const combatPower = extractCombatPower(combined);
  const pieces = extractKloaPieces(combined);
  const levelSnippetMatch = combined.match(/Lv\.?\s*[0-9][0-9,]*\.[0-9]{2}/i);

  return {
    source: "kloa" as const,
    sourceUrl: url,
    currentItemLevel,
    combatPower,
    pieces,
    debug: {
      fallbackLevelFound: currentItemLevel != null,
      fallbackPieceCount: pieces.length,
      fallbackLevelSnippet: clipSnippet(levelSnippetMatch?.[0] ?? ""),
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const nickname = String(req.query.nickname ?? "").trim();
    if (!nickname) return res.status(400).json({ ok: false, error: "NICKNAME_REQUIRED" });

    let currentItemLevel: number | null = null;
    let combatPower: number | null = null;
    let pieces: ParsedPiece[] = [];
    let source: "official" | "kloa" = "official";
    let sourceUrl = "";
    const warnings: string[] = [];
    const debug: ImportDebug = {
      officialLevelFound: false,
      officialPieceCount: 0,
      fallbackLevelFound: false,
      fallbackPieceCount: 0,
      officialLevelSnippet: "",
      officialFirstPieceSnippet: "",
      fallbackLevelSnippet: "",
    };

    try {
      const official = await fetchOfficialProfile(nickname);
      currentItemLevel = official.currentItemLevel;
      combatPower = official.combatPower;
      pieces = official.pieces;
      source = official.source;
      sourceUrl = official.sourceUrl;
      debug.officialLevelFound = official.debug.officialLevelFound;
      debug.officialPieceCount = official.debug.officialPieceCount;
      debug.officialLevelSnippet = official.debug.officialLevelSnippet;
      debug.officialFirstPieceSnippet = official.debug.officialFirstPieceSnippet;
    } catch (error: any) {
      warnings.push(`공식 전투정보실 불러오기에 실패했어: ${error?.message || String(error)}`);
    }

    if (currentItemLevel == null || pieces.length === 0) {
      try {
        const fallback = await fetchKloaFallback(nickname);
        currentItemLevel = currentItemLevel ?? fallback.currentItemLevel;
        combatPower = combatPower ?? fallback.combatPower;
        pieces = pieces.length > 0 ? pieces : fallback.pieces;
        if (!sourceUrl || source !== "official") {
          source = fallback.source;
          sourceUrl = fallback.sourceUrl;
        }
        debug.fallbackLevelFound = fallback.debug.fallbackLevelFound;
        debug.fallbackPieceCount = fallback.debug.fallbackPieceCount;
        debug.fallbackLevelSnippet = fallback.debug.fallbackLevelSnippet;
        warnings.push("공식 전투정보실에서 부족한 값은 KLOA 공개 페이지로 보완했어.");
      } catch (error: any) {
        warnings.push(`KLOA 보조 불러오기도 실패했어: ${error?.message || String(error)}`);
      }
    }

    if (currentItemLevel == null) warnings.push("현재 아이템레벨을 자동으로 찾지 못했어. 아래 검토 폼에서 확인해줘.");
    if (pieces.length === 0) warnings.push("장비 강화 정보는 아직 자동으로 못 읽었어. 공식 페이지 툴팁/OCR/직접 입력으로 보정해줘.");
    if (pieces.length > 0 && pieces.length < 6) warnings.push(`장비 ${pieces.length}부위만 읽었어. 부족한 부위는 직접 보정해줘.`);
    warnings.push("장인의 기운과 현재 단계 재련 경험치는 툴팁 값이라 계속 직접 입력 기준으로 둘게.");

    return res.status(200).json({
      ok: true,
      source,
      sourceUrl,
      nickname,
      fetchedAt: new Date().toISOString(),
      currentItemLevel,
      combatPower,
      pieces,
      warnings,
      debug,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "PROFILE_IMPORT_FAILED",
      detail: error?.message || String(error),
    });
  }
}
