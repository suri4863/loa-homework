import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

type EquipmentSlot = "weapon" | "helmet" | "shoulder" | "chest" | "pants" | "gloves";

type ParsedPiece = {
  slot: EquipmentSlot;
  itemName: string;
  itemLevel: number | null;
  honingLevel: number;
  advancedRefiningLevel: number;
};

type CombatPowerDetails = {
  combatLevel?: number;
  pureBaseAttack?: number;
  maxHp?: number;
  arkEvolutionPoints?: number;
  arkEnlightenmentPoints?: number;
  arkLeapPoints?: number;
  t4GemLevelSum?: number;
  evolutionKarmaRanks?: number;
  enlightenmentKarmaRanks?: number;
  leapKarmaRanks?: number;
  engravingBonusPct?: number;
  accessoryBonusPct?: number;
};

type CombatProfileSystems = {
  engravingCount: number;
  engravingNames: string[];
  engravings: Array<{ name: string; grade?: string; level?: number; points?: number }>;
  gemLevelSum: number;
  gemCount: number;
  gems: Array<{ name: string; level: number; type: string }>;
  arkPassivePoints: number;
  arkPassive: {
    evolution: number;
    enlightenment: number;
    leap: number;
  };
  arkGridPoints: number;
  arkGrid: Array<{ name: string; points: number }>;
  accessoryCount: number;
  accessories: Array<{ name: string; quality?: number; effects: string[] }>;
  avatarCount: number;
  avatarGradeLevel: number;
  avatars: Array<{ name: string; grade: string; slot?: string; effect?: string; isInner?: boolean }>;
};

const SUPPORT_CLASS_NAMES = ["바드", "홀리나이트", "도화가"];
const KNOWN_CLASS_NAMES = [
  ...SUPPORT_CLASS_NAMES,
  "버서커",
  "디스트로이어",
  "워로드",
  "슬레이어",
  "배틀마스터",
  "인파이터",
  "기공사",
  "창술사",
  "스트라이커",
  "브레이커",
  "데빌헌터",
  "블래스터",
  "호크아이",
  "스카우터",
  "건슬링어",
  "아르카나",
  "서머너",
  "소서리스",
  "데모닉",
  "블레이드",
  "리퍼",
  "소울이터",
  "도화가",
  "기상술사",
];

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
const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const SLOT_KEYWORDS: Array<[EquipmentSlot, RegExp]> = [
  ["helmet", /(투구|머리|머리장식|머리 방어구|헤드)/],
  ["shoulder", /(견갑|어깨|어깨장식)/],
  ["chest", /(상의|갑옷|로브|재킷|자켓)/],
  ["pants", /(하의|바지|팬츠)/],
  ["gloves", /(장갑|글러브)/],
  ["weapon", /(무기|검|대검|도끼|창|활|총|건틀릿|해머|스태프|투르마리|랜스|캐넌|리볼버|서클릿)/],
];

const KNOWN_ENGRAVING_NAMES = [
  "원한",
  "예리한 둔기",
  "돌격대장",
  "아드레날린",
  "저주받은 인형",
  "질량 증가",
  "기습의 대가",
  "결투의 대가",
  "타격의 대가",
  "속전속결",
  "슈퍼 차지",
  "바리케이드",
  "안정된 상태",
  "정기 흡수",
  "전문의",
  "각성",
  "중갑 착용",
  "마나의 흐름",
  "최대 마나 증가",
  "급소 타격",
  "구슬동자",
  "위기 모면",
  "선수필승",
  "승부사",
  "달인의 저력",
  "에테르 포식자",
  "강화 방패",
  "부러진 뼈",
  "여신의 가호",
  "분쇄의 주먹",
  "약자 무시",
  "마나 효율 증가",
  "추진력",
  "번개의 분노",
  "불굴",
  "긴급구조",
  "폭발물 전문가",
  "실드 관통",
  "탈출의 명수",
  "굳은 의지",
  "시선 집중",
  "질풍노도",
  "심판자",
  "축복의 오라",
  "오의난무",
  "일격필살",
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

function extractSection(input: string, startLabels: string[], endLabels: string[]) {
  const startIndexes = startLabels
    .map((label) => input.indexOf(label))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (!startIndexes.length) return "";
  const start = startIndexes[0];
  const endIndexes = endLabels
    .map((label) => input.indexOf(label, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b);
  const end = endIndexes[0] ?? Math.min(input.length, start + 6000);
  return input.slice(start, end);
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

function extractClassName(input: string) {
  for (const className of KNOWN_CLASS_NAMES) {
    if (input.includes(className)) return className;
  }
  return null;
}

function inferClassNameFromPieces(pieces: ParsedPiece[]) {
  const weaponName = pieces.find((piece) => piece.slot === "weapon")?.itemName ?? "";
  if (/할버드|한손검|성검|집행검/.test(weaponName)) return "홀리나이트";
  if (/하프/.test(weaponName)) return "바드";
  if (/붓|요즈/.test(weaponName)) return "도화가";
  if (/랜스/.test(weaponName)) return "워로드";
  if (/대검/.test(weaponName)) return "버서커";
  if (/해머/.test(weaponName)) return "디스트로이어";
  if (/소드|도검/.test(weaponName)) return "슬레이어";
  if (/건틀릿|헤비 건틀릿/.test(weaponName)) return "브레이커";
  if (/창|스피어/.test(weaponName)) return "창술사";
  if (/권갑|너클/.test(weaponName)) return "인파이터";
  if (/기공패/.test(weaponName)) return "기공사";
  if (/건랜스/.test(weaponName)) return "워로드";
  if (/스태프/.test(weaponName)) return "소서리스";
  if (/마력덱|카드/.test(weaponName)) return "아르카나";
  if (/데모닉웨폰|웨폰/.test(weaponName)) return "데모닉";
  if (/블레이드/.test(weaponName)) return "블레이드";
  if (/단검/.test(weaponName)) return "리퍼";
  if (/소울/.test(weaponName)) return "소울이터";
  return null;
}

function extractNumberNear(input: string, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s*[:：]?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)`, "i"),
    new RegExp(`${escaped}[\\s\\S]{0,50}?([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)`, "i"),
  ];

  for (const pattern of patterns) {
    const value = parseNumber(input.match(pattern)?.[1]);
    if (value != null && value >= min && value <= max) return value;
  }

  return null;
}

function extractLargestNumberNear(input: string, label: string, min = 0, max = Number.MAX_SAFE_INTEGER, distance = 160) {
  const index = input.indexOf(label);
  if (index < 0) return null;
  const slice = input.slice(index, index + distance);
  const values = Array.from(slice.matchAll(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/g))
    .map((match) => parseNumber(match[1]))
    .filter((value): value is number => value != null && value >= min && value <= max);
  return values.length ? Math.max(...values) : null;
}

function extractCombatDetails(input: string): CombatPowerDetails {
  const arkSection = extractSection(input, ["아크 패시브", "아크패시브"], ["특수 장비", "장착 중인 보석", "보석", "카드", "아크 그리드"]);
  const arkEvolutionPoints = extractLargestNumberNear(arkSection || input, "진화", 50, 500) ?? undefined;
  const arkEnlightenmentPoints = extractLargestNumberNear(arkSection || input, "깨달음", 50, 500) ?? undefined;
  const arkLeapPoints = extractLargestNumberNear(arkSection || input, "도약", 50, 500) ?? undefined;
  const gemSection = extractSection(input, ["장착 중인 보석", "보석"], ["카드", "아크 그리드", "각인", "성향"]);
  const gemLevels = Array.from(input.matchAll(/(?:Lv\.?|레벨)\s*([5-9]|10)\b/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 5 && value <= 10);
  const structuredGemLevels = extractGems(gemSection || input).map((gem) => gem.level);
  const arkGrid = extractArkGrid(input);
  return {
    combatLevel:
      extractNumberNear(input, "전투 레벨", 1, 100) ??
      extractNumberNear(input, "Lv.", 1, 100) ??
      undefined,
    pureBaseAttack: extractNumberNear(input, "공격력", 1, 1000000) ?? undefined,
    maxHp: extractNumberNear(input, "최대 생명력", 1, 2000000) ?? undefined,
    arkEvolutionPoints,
    arkEnlightenmentPoints,
    arkLeapPoints,
    t4GemLevelSum: structuredGemLevels.reduce((sum, value) => sum + value, 0) || gemLevels.slice(0, 11).reduce((sum, value) => sum + value, 0) || undefined,
    evolutionKarmaRanks: arkGrid.find((row) => row.name.includes("공격력"))?.points ?? undefined,
    enlightenmentKarmaRanks: arkGrid.find((row) => row.name.includes("아군 피해"))?.points ?? undefined,
    leapKarmaRanks: arkGrid.find((row) => row.name.includes("낙인력"))?.points ?? undefined,
  };
}

function extractEngravings(input: string) {
  const section = extractSection(input, ["각인 효과", "각인"], ["성향", "장착 중인 보석", "보석", "카드", "아크 그리드"]);
  const source = section || input;
  const rows = new Map<string, { name: string; level?: number; points?: number }>();
  for (const name of KNOWN_ENGRAVING_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`${escaped}[\\s\\S]{0,80}?(?:Lv\\.?\\s*(\\d+))?[\\s\\S]{0,40}?(?:x\\s*(\\d+))?`, "i"));
    if (!match) continue;
    rows.set(name, {
      name,
      level: match[1] ? Number(match[1]) : undefined,
      points: match[2] ? Number(match[2]) : undefined,
    });
  }
  return Array.from(rows.values());
}

function extractGems(input: string) {
  const source = input || "";
  const gems: Array<{ name: string; level: number; type: string }> = [];
  const gemArray =
    source.match(/"gem"\s*:\s*\{"gems"\s*:\s*\[([\s\S]{0,16000}?)\]\s*\}/) ??
    source.match(/\\?"gem\\?"\s*:\s*\{\\?"gems\\?"\s*:\s*\[([\s\S]{0,16000}?)\]\s*,/);
  if (gemArray) {
    for (const match of gemArray[1].matchAll(/"?level"?\s*:\s*(\d+)[\s\S]{0,260}?"?type"?\s*:\s*"?([^",\\]+)"?[\s\S]{0,260}?"?skill"?\s*:\s*"?([^",\\]+)"?/g)) {
      const type = match[2] === "damage" ? "겁화" : match[2] === "cooldown" ? "작열" : match[2];
      gems.push({ name: match[3], level: Number(match[1]), type });
      if (gems.length >= 11) return gems;
    }
  }
  const patterns = [
    /\[보석\]\s*([가-힣A-Za-z\s]{2,32})[\s\S]{0,80}?([5-9]|10)\s*레벨\s*(겁화|작열|멸화|홍염|결화)/g,
    /([가-힣A-Za-z\s]{2,32})\s*(?:Lv\.?\s*)?([5-9]|10)\s*(겁화|작열|멸화|홍염)/g,
    /([가-힣A-Za-z\s]{2,32})\s*([5-9]|10)레벨\s*(겁화|작열|멸화|홍염)/g,
    /(겁화|작열|멸화|홍염)[\s\S]{0,40}?([가-힣A-Za-z\s]{2,32})[\s\S]{0,20}?Lv\.?\s*([5-9]|10)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const reverse = /^(겁화|작열|멸화|홍염)/.test(match[1]);
      const bracket = match[0].startsWith("[보석]");
      const type = bracket ? match[3] : reverse ? match[1] : match[3];
      const level = Number(bracket ? match[2] : reverse ? match[3] : match[2]);
      const name = (bracket ? match[1] : reverse ? match[2] : match[1]).replace(/\s+/g, " ").trim();
      if (!name || !Number.isFinite(level)) continue;
      if (gems.some((gem) => gem.name === name && gem.level === level && gem.type === type)) continue;
      gems.push({ name, level, type });
      if (gems.length >= 11) return gems;
    }
  }
  for (const match of source.matchAll(/([5-9]|10)\s*레벨\s*[가-힣\s]*(?:보석|젬)[\s\S]{0,30}?([0-9]{1,2})?\s*(뎀|쿨|겁화|작열|멸화|홍염)?/g)) {
    const level = Number(match[1]);
    const type = match[3] || "보석";
    gems.push({ name: `${type} ${gems.length + 1}`, level, type });
    if (gems.length >= 11) return gems;
  }
  const fallbackLevels = Array.from(source.matchAll(/([5-9]|10)\s*(?:레벨|Lv\.?)?\s*(겁화|작열|멸화|홍염)|(겁화|작열|멸화|홍염)\s*(?:Lv\.?|레벨)?\s*([5-9]|10)/g))
    .map((match, index) => ({
      name: `${match[2] || match[3]} ${index + 1}`,
      level: Number(match[1] || match[4]),
      type: String(match[2] || match[3]),
    }))
    .filter((gem) => Number.isFinite(gem.level) && gem.level >= 5 && gem.level <= 10);
  fallbackLevels.forEach((gem) => {
    if (gems.length < 11) gems.push(gem);
  });
  return gems;
}

function extractArkPassive(input: string, details: CombatPowerDetails) {
  const jsonMatch = input.match(
    /\\?"arkPassive\\?"[\s\S]{0,200}?\\?"evolution\\?"\s*:\s*\{[\s\S]{0,80}?\\?"points\\?"\s*:\s*(\d+)[\s\S]{0,3000}?\\?"enlightenment\\?"\s*:\s*\{[\s\S]{0,80}?\\?"points\\?"\s*:\s*(\d+)[\s\S]{0,3000}?\\?"leap\\?"\s*:\s*\{[\s\S]{0,80}?\\?"points\\?"\s*:\s*(\d+)/
  );
  if (jsonMatch) {
    return {
      evolution: Number(jsonMatch[1]),
      enlightenment: Number(jsonMatch[2]),
      leap: Number(jsonMatch[3]),
    };
  }
  const section = extractSection(input, ["아크 패시브", "아크패시브"], ["특수 장비", "장착 중인 보석", "보석", "카드", "아크 그리드"]);
  const triplet = (section || input).match(/진화[^0-9]{0,40}([0-9]{2,3})[\s\S]{0,120}?깨달음[^0-9]{0,40}([0-9]{2,3})[\s\S]{0,120}?도약[^0-9]{0,40}([0-9]{2,3})/);
  if (triplet) {
    return {
      evolution: Number(triplet[1]),
      enlightenment: Number(triplet[2]),
      leap: Number(triplet[3]),
    };
  }
  return {
    evolution: extractLargestNumberNear(section || input, "진화", 50, 500) ?? Number(details.arkEvolutionPoints || 0),
    enlightenment: extractLargestNumberNear(section || input, "깨달음", 50, 500) ?? Number(details.arkEnlightenmentPoints || 0),
    leap: extractLargestNumberNear(section || input, "도약", 50, 500) ?? Number(details.arkLeapPoints || 0),
  };
}

function extractArkGrid(input: string) {
  const jsonBlock = input.match(/\\?"arkGrid\\?"\s*:\s*\{([\s\S]{0,8000}?)\}\s*,\\?"engraving/);
  if (jsonBlock) {
    const rows: Array<{ name: string; points: number }> = [];
    for (const match of jsonBlock[1].matchAll(/\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"[\s\S]{0,160}?\\?"point\\?"\s*:\s*(\d+)|\\?"point\\?"\s*:\s*(\d+)[\s\S]{0,160}?\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"/g)) {
      rows.push({ name: match[1] || match[4], points: Number(match[2] || match[3]) });
    }
    if (rows.length) return rows;
  }
  const section = extractSection(input, ["아크 그리드", "아크그리드", "장착 중인 아크 그리드 효과"], ["각인", "성향", "카드", "보석"]);
  const source = section || input;
  const rows: Array<{ name: string; points: number }> = [];
  for (const match of source.matchAll(/([가-힣\s:·A-Za-z]+?)\s*(?:Lv\.?\s*)?(\d{1,3})\s*(?:P|포인트|Lv\.)/g)) {
    const name = match[1].replace(/\s+/g, " ").trim();
    const points = Number(match[2]);
    if (!name || !Number.isFinite(points) || points <= 0) continue;
    if (!/(코어|공격력|아군|낙인|추가 피해|질서|혼돈)/.test(name)) continue;
    rows.push({ name, points });
    if (rows.length >= 12) break;
  }
  return rows;
}

function extractAccessories(input: string) {
  const section = extractSection(input, ["악세서리", "목걸이"], ["팔찌", "어빌리티 스톤", "보석", "아바타", "카드"]);
  const source = section || input;
  const names = ["목걸이", "귀걸이", "귀걸이", "반지", "반지"];
  const effects = Array.from(source.matchAll(/(공격력|무기 공격력|치명타 피해|치명타 적중률|추가 피해|적에게 주는 피해|아군 공격력 강화 효과|상태이상 공격 지속시간)[^,\n<]{0,40}/g))
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .slice(0, 15);
  return names.map((name, index) => ({
    name,
    effects: effects.slice(index * 3, index * 3 + 3),
  }));
}

function extractAvatars(input: string) {
  const avatarBlock = input.match(/\\?"avatar\\?"\s*:\s*\{([\s\S]{0,12000}?)\}\s*,\\?"equip/);
  if (avatarBlock) {
    const rows: Array<{ name: string; grade: string; slot?: string; effect?: string }> = [];
    for (const match of avatarBlock[1].matchAll(/\\?"(hero|legend|special)\\?"\s*:\s*\{([\s\S]*?)(?=\\?"(?:hero|legend|special)\\?"\s*:|$)/g)) {
      const grade = match[1] === "legend" ? "전설" : match[1] === "special" ? "스페셜" : "영웅";
      for (const item of match[2].matchAll(/\\?"(head|face1|face2|top|bottom|weapon|instrument)\\?"\s*:\s*\{[\s\S]{0,120}?\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"/g)) {
        rows.push({ grade, slot: item[1], name: item[2] });
      }
    }
    if (rows.length) return rows;
  }
  const section = extractSection(input, ["아바타", "장비 / 아바타"], ["악세서리", "팔찌", "카드", "각인"]);
  const source = section || input;
  const rows: Array<{ name: string; grade: string; slot?: string; effect?: string }> = [];
  const grade = /스페셜/.test(source) ? "스페셜" : /전설/.test(source) ? "전설" : /영웅/.test(source) ? "영웅" : "";
  for (const slot of ["머리", "상의", "하의", "무기", "얼굴", "악기"]) {
    const match = source.match(new RegExp(`([가-힣\\s]{2,40}${slot}[가-힣\\s]{0,20})[\\s\\S]{0,80}?((?:힘|민첩|지능|공격력|무기 공격력)[^\\n<]{0,30})`, "i"));
    if (match) {
      rows.push({ name: match[1].replace(/\s+/g, " ").trim(), grade, slot, effect: match[2].replace(/\s+/g, " ").trim() });
    }
  }
  if (!rows.length && /아바타/.test(source)) rows.push({ name: "장착 아바타", grade: grade || "확인됨" });
  return rows;
}

function mergeCombatSystems(primary: CombatProfileSystems | null, fallback: CombatProfileSystems | null) {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    engravingCount: Math.max(primary.engravingCount, fallback.engravingCount),
    engravingNames: primary.engravingNames.length >= fallback.engravingNames.length ? primary.engravingNames : fallback.engravingNames,
    engravings: primary.engravings.length >= fallback.engravings.length ? primary.engravings : fallback.engravings,
    gemLevelSum: primary.gemLevelSum > 0 ? primary.gemLevelSum : fallback.gemLevelSum,
    gemCount: primary.gemCount > 0 ? primary.gemCount : fallback.gemCount,
    gems: primary.gems.length ? primary.gems : fallback.gems,
    arkPassivePoints: primary.arkPassivePoints >= 100 ? primary.arkPassivePoints : fallback.arkPassivePoints,
    arkPassive: primary.arkPassivePoints >= 100 ? primary.arkPassive : fallback.arkPassive,
    arkGridPoints: primary.arkGridPoints > 0 ? primary.arkGridPoints : fallback.arkGridPoints,
    arkGrid: primary.arkGrid.length ? primary.arkGrid : fallback.arkGrid,
    accessoryCount: Math.max(primary.accessoryCount, fallback.accessoryCount),
    accessories: primary.accessories.some((item) => item.effects.length) ? primary.accessories : fallback.accessories,
    avatarCount: Math.max(primary.avatarCount, fallback.avatarCount),
    avatarGradeLevel: Math.max(primary.avatarGradeLevel, fallback.avatarGradeLevel),
    avatars: primary.avatars.some((avatar) => avatar.grade && avatar.grade !== "확인됨") ? primary.avatars : fallback.avatars,
  };
}

function extractCombatSystems(input: string, details: CombatPowerDetails): CombatProfileSystems {
  const decoded = input.replace(/\\"/g, '"').replace(/\\u0027/g, "'").replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">");
  const engravings = extractEngravings(decoded);
  const gems = extractGems(decoded);
  const arkPassive = extractArkPassive(decoded, details);
  const arkGrid = extractArkGrid(decoded);
  const accessories = extractAccessories(decoded);
  const avatars = extractAvatars(decoded);
  const arkPassivePoints = arkPassive.evolution + arkPassive.enlightenment + arkPassive.leap;
  const arkGridPoints = arkGrid.reduce((sum, row) => sum + row.points, 0);
  const avatarGradeLevel = avatars.some((avatar) => avatar.grade === "스페셜") ? 2 : avatars.some((avatar) => avatar.grade === "전설") ? 1 : 0;

  return {
    engravingCount: engravings.length,
    engravingNames: engravings.map((engraving) => engraving.name),
    engravings,
    gemLevelSum: gems.reduce((sum, value) => sum + value.level, 0),
    gemCount: gems.length,
    gems,
    arkPassivePoints,
    arkPassive,
    arkGridPoints,
    arkGrid,
    accessoryCount: accessories.length,
    accessories,
    avatarCount: avatars.length,
    avatarGradeLevel,
    avatars,
  };
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

function getLostarkApiKey() {
  const fromProcess = String(process.env.LOSTARK_API_KEY || process.env.LOA_API_KEY || process.env.VITE_LOSTARK_API_KEY || "").trim();
  if (fromProcess) return fromProcess;
  for (const fileName of [".env.local", ".env"]) {
    try {
      const file = fs.readFileSync(path.join(process.cwd(), fileName), "utf8");
      const line = file.split(/\r?\n/).find((row) => /^(LOSTARK_API_KEY|LOA_API_KEY|VITE_LOSTARK_API_KEY)=/.test(row.trim()));
      const value = line?.replace(/^[^=]+=/, "").trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    } catch {
      // Ignore missing local env files in production.
    }
  }
  return "";
}

function lostarkAuthHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: /^bearer\s+/i.test(apiKey) ? apiKey : `bearer ${apiKey}`,
  };
}

async function fetchLostarkApi(apiKey: string, path: string) {
  const response = await fetch(`${LOSTARK_API_BASE}${path}`, {
    headers: lostarkAuthHeaders(apiKey),
  });
  if (!response.ok) throw new Error(`LOSTARK_API_${response.status}`);
  return response.json();
}

function tooltipToText(input: unknown) {
  const raw = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return stripHtml(raw)
    .replace(/\\r|\\n|\r|\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function openApiSlot(type: string): EquipmentSlot | null {
  if (/무기/.test(type)) return "weapon";
  if (/투구|머리/.test(type)) return "helmet";
  if (/어깨|견갑/.test(type)) return "shoulder";
  if (/상의/.test(type)) return "chest";
  if (/하의/.test(type)) return "pants";
  if (/장갑/.test(type)) return "gloves";
  return null;
}

function openApiAccessoryName(type: string) {
  if (/목걸이/.test(type)) return "목걸이";
  if (/귀걸이/.test(type)) return "귀걸이";
  if (/반지/.test(type)) return "반지";
  if (/팔찌/.test(type)) return "팔찌";
  return "";
}

function pickEffectLines(text: string) {
  return Array.from(
    new Set(
      text
        .split(/(?:\s{2,}|<BR>|\\n|ㆍ|,)/i)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => /(공격력|무기 공격력|추가 피해|적에게 주는 피해|치명|특화|신속|쿨타임|피해량|아군|낙인|옵션)/.test(line))
        .slice(0, 6)
    )
  );
}

function parseOpenApiPiece(row: any, fallbackIndex: number): ParsedPiece | null {
  const slot = openApiSlot(String(row?.Type || ""));
  if (!slot) return null;
  const name = String(row?.Name || "");
  const tooltip = tooltipToText(row?.Tooltip);
  const honingLevel = Number((name.match(/\+(\d{1,2})/) ?? tooltip.match(/(\d{1,2})\s*단계/))?.[1] ?? 0);
  const advancedRefiningLevel = Number((tooltip.match(/상급\s*재련[^0-9]{0,20}(\d{1,2})/) ?? tooltip.match(/엘라[^0-9]{0,20}(\d{1,2})/))?.[1] ?? 0);
  const itemLevel = parseNumber((tooltip.match(/아이템\s*레벨[^0-9]{0,20}([0-9,.]+)/) ?? [])[1]) ?? null;
  return {
    slot: slot ?? SLOT_ORDER[fallbackIndex] ?? "weapon",
    itemName: name,
    itemLevel,
    honingLevel,
    advancedRefiningLevel,
  };
}

function normalizeOpenApiAccessoryName(type: string) {
  if (/목걸이|Necklace/i.test(type)) return "목걸이";
  if (/귀걸이|Earring/i.test(type)) return "귀걸이";
  if (/반지|Ring/i.test(type)) return "반지";
  if (/팔찌|Bracelet/i.test(type)) return "팔찌";
  return openApiAccessoryName(type);
}

function pickOpenApiAccessoryEffects(text: string) {
  const normalized = text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/[{}[\]"]/g, " ")
    .replace(/\s+/g, " ");
  const matches = Array.from(
    normalized.matchAll(
      /(추가 피해\s*\+?\s*[0-9.]+%|적에게 주는 피해\s*\+?\s*[0-9.]+%|공격력\s*\+?\s*[0-9,.]+%?|무기 공격력\s*\+?\s*[0-9,.]+%?|치명타 피해\s*\+?\s*[0-9.]+%|치명타 적중률\s*\+?\s*[0-9.]+%|치명\s*\+?\s*[0-9,.]+|특화\s*\+?\s*[0-9,.]+|신속\s*\+?\s*[0-9,.]+)/g
    )
  ).map((match) => match[1].replace(/\s+/g, " ").trim());
  return Array.from(new Set(matches)).slice(0, 6);
}

function parseOpenApiAccessories(equipment: any[]) {
  return equipment
    .map((row) => {
      const name = normalizeOpenApiAccessoryName(String(row?.Type || ""));
      if (!name) return null;
      return {
        name,
        quality: Number(row?.GradeQuality ?? 0) || undefined,
        effects: pickOpenApiAccessoryEffects(tooltipToText(row?.Tooltip)),
      };
    })
    .filter(Boolean) as Array<{ name: string; quality?: number; effects: string[] }>;
}

async function fetchOfficialOpenApiProfile(nickname: string) {
  const apiKey = getLostarkApiKey();
  if (!apiKey) throw new Error("LOSTARK_API_KEY_MISSING");
  const encoded = encodeURIComponent(nickname);
  const [profiles, equipment, avatars, gems, engravings, arkPassive] = await Promise.all([
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/profiles`).catch(() => null),
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/equipment`).catch(() => []),
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/avatars`).catch(() => []),
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/gems`).catch(() => null),
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/engravings`).catch(() => null),
    fetchLostarkApi(apiKey, `/armories/characters/${encoded}/arkpassive`).catch(() => null),
  ]);
  const equipmentRows = Array.isArray(equipment) ? equipment : [];
  const pieces = dedupePieces(
    equipmentRows.map((row, index) => parseOpenApiPiece(row, index)).filter((piece): piece is ParsedPiece => Boolean(piece))
  );
  const accessories = parseOpenApiAccessories(equipmentRows);
  const gemRows = Array.isArray(gems?.Gems) ? gems.Gems : [];
  const parsedGems = gemRows
    .map((gem: any, index: number) => {
      const effect = Array.isArray(gems?.Effects) ? gems.Effects.find((row: any) => String(row?.GemSlot ?? "") === String(gem?.Slot ?? "")) : null;
      return {
        name: String(effect?.Name || gem?.Name || `보석 ${index + 1}`),
        level: Number(gem?.Level || 0),
        type: /작열|쿨|멸화|홍염/.test(`${gem?.Name || ""} ${effect?.Description || ""}`) ? "작열" : "겁화",
      };
    })
    .filter((gem: any) => gem.level > 0);
  const finalGemSkillRows = Array.isArray(gems?.Effects)
    ? gems.Effects.flatMap((effect: any) => (Array.isArray(effect?.Skills) ? effect.Skills : []))
    : [];
  const finalGems = gemRows
    .map((gem: any, index: number) => {
      const skill = finalGemSkillRows.find((row: any) => Number(row?.GemSlot) === Number(gem?.Slot));
      const tooltip = tooltipToText(gem?.Tooltip);
      const tooltipSkill = tooltip.match(/\]\s*([\u3131-\uD79DA-Za-z\s]+?)\s*(?:\uD53C\uD574|\uC7AC\uC0AC\uC6A9|\uCFE8\uD0C0\uC784)/)?.[1]?.trim();
      const effectText = `${skill?.Description?.join?.(" ") || ""} ${skill?.Option || ""} ${tooltip}`;
      return {
        name: String(skill?.Name || tooltipSkill || `Gem ${index + 1}`).replace(/\s+\uACC4\uC5F4$/, ""),
        level: Number(gem?.Level || 0),
        type: /\uC7AC\uC0AC\uC6A9|\uCFE8\uD0C0\uC784|cool/i.test(effectText) ? "\uC791\uC5F4" : "\uAC81\uD654",
      };
    })
    .filter((gem: any) => gem.level > 0);
  const gemSkillRows = Array.isArray(gems?.Effects)
    ? gems.Effects.flatMap((effect: any) => (Array.isArray(effect?.Skills) ? effect.Skills : []))
    : [];
  const resolvedGems = gemRows
    .map((gem: any, index: number) => {
      const skill = gemSkillRows.find((row: any) => Number(row?.GemSlot) === Number(gem?.Slot));
      const tooltip = tooltipToText(gem?.Tooltip);
      const tooltipSkill = tooltip.match(/\]\s*([가-힣A-Za-z\s]+?)\s*(?:피해|재사용|쿨타임)/)?.[1]?.trim();
      const effectText = `${skill?.Description?.join?.(" ") || ""} ${skill?.Option || ""} ${tooltip}`;
      return {
        name: String(skill?.Name || tooltipSkill || parsedGems[index]?.name || `보석 ${index + 1}`).replace(/\s+계열$/, ""),
        level: Number(gem?.Level || parsedGems[index]?.level || 0),
        type: /재사용|쿨타임|cool/i.test(effectText) ? "작열" : "겁화",
      };
    })
    .filter((gem: any) => gem.level > 0);
  const engravingRows = Array.isArray(engravings?.ArkPassiveEffects)
    ? engravings.ArkPassiveEffects
    : Array.isArray(engravings?.Effects)
      ? engravings.Effects
      : Array.isArray(engravings?.Engravings)
        ? engravings.Engravings
        : [];
  const parsedEngravings = engravingRows.map((row: any) => ({
    name: String(row?.Name || row?.Engraving?.Name || ""),
    grade: String(row?.Grade || row?.Engraving?.Grade || "") || undefined,
    level: Number(row?.Level || row?.Engraving?.Level || 0) || undefined,
    points: Number(row?.Point || row?.Points || 0) || undefined,
  })).filter((row: any) => row.name);
  const arkPoint = (name: string) => {
    const points = Array.isArray(arkPassive?.Points) ? arkPassive.Points : [];
    const found = points.find((row: any) => String(row?.Name || row?.Type || "").includes(name));
    return Number(found?.Value ?? found?.Point ?? found?.Points ?? 0) || 0;
  };
  const systems: CombatProfileSystems = {
    engravingCount: parsedEngravings.length,
    engravingNames: parsedEngravings.map((row: any) => row.name),
    engravings: parsedEngravings,
    gemLevelSum: finalGems.reduce((sum: number, gem: any) => sum + gem.level, 0),
    gemCount: finalGems.length,
    gems: finalGems,
    arkPassivePoints: arkPoint("진화") + arkPoint("깨달음") + arkPoint("도약"),
    arkPassive: {
      evolution: arkPoint("진화"),
      enlightenment: arkPoint("깨달음"),
      leap: arkPoint("도약"),
    },
    arkGridPoints: 0,
    arkGrid: [],
    accessoryCount: accessories.length,
    accessories,
    avatarCount: Array.isArray(avatars) ? avatars.length : 0,
    avatarGradeLevel: Array.isArray(avatars) && avatars.some((avatar: any) => /스페셜/.test(String(avatar?.Grade || avatar?.Name || ""))) ? 2 : Array.isArray(avatars) && avatars.some((avatar: any) => /전설/.test(String(avatar?.Grade || avatar?.Name || ""))) ? 1 : 0,
    avatars: Array.isArray(avatars)
      ? avatars.map((avatar: any) => ({ name: String(avatar?.Name || ""), grade: String(avatar?.Grade || ""), slot: String(avatar?.Type || ""), effect: tooltipToText(avatar?.Tooltip).slice(0, 120), isInner: Boolean(avatar?.IsInner) }))
      : [],
  };

  return {
    source: "official" as const,
    sourceUrl: `${LOSTARK_API_BASE}/armories/characters/${encoded}`,
    currentItemLevel: parseNumber(profiles?.ItemAvgLevel) ?? null,
    combatPower: parseNumber(profiles?.TotalCombatPower ?? profiles?.CombatPower) ?? null,
    className: String(profiles?.CharacterClassName || "") || null,
    combatDetails: {
      combatLevel: Number(profiles?.CharacterLevel || 0) || undefined,
      pureBaseAttack: undefined,
      maxHp: undefined,
      arkEvolutionPoints: systems.arkPassive.evolution || undefined,
      arkEnlightenmentPoints: systems.arkPassive.enlightenment || undefined,
      arkLeapPoints: systems.arkPassive.leap || undefined,
      t4GemLevelSum: systems.gemLevelSum || undefined,
    },
    combatSystems: systems,
    pieces,
    debug: {
      officialLevelFound: Boolean(profiles?.ItemAvgLevel),
      officialPieceCount: pieces.length,
      officialLevelSnippet: String(profiles?.ItemAvgLevel || ""),
      officialFirstPieceSnippet: pieces[0]?.itemName ?? "",
    },
  };
}

async function fetchOfficialProfile(nickname: string) {
  const url = `https://lostark.game.onstove.com/Profile/Character/${encodeURIComponent(nickname)}`;
  const html = await fetchHtml(url);
  const combined = `${normalizeSourceText(html)}\n${stripHtml(html)}`;
  const currentItemLevel = extractCurrentItemLevel(combined);
  const combatPower = extractCombatPower(combined);
  const className = extractClassName(combined);
  const combatDetails = extractCombatDetails(combined);
  const pieces = extractOfficialPieces(combined);
  const combatSystems = extractCombatSystems(combined, combatDetails);
  const inferredClassName = inferClassNameFromPieces(pieces);
  const levelSnippetMatch =
    combined.match(/장착\s*아이템\s*레벨[\s\S]{0,160}?<\/span>/i) ??
    combined.match(/Lv\.?\s*[0-9][0-9,]*\.[0-9]{2}/i);
  const firstPieceSnippet = (combined.match(/\+\d{1,2}\s*[^<\n'"]{2,80}[\s\S]{0,300}?아이템\s*레벨\s*1[67][0-9]{2}/i) ?? [])[0] ?? "";

  return {
    source: "official" as const,
    sourceUrl: url,
    currentItemLevel,
    combatPower,
    className: inferredClassName ?? className,
    combatDetails,
    combatSystems,
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
  const className = extractClassName(combined);
  const combatDetails = extractCombatDetails(combined);
  const pieces = extractKloaPieces(combined);
  const combatSystems = extractCombatSystems(combined, combatDetails);
  const inferredClassName = inferClassNameFromPieces(pieces);
  const levelSnippetMatch = combined.match(/Lv\.?\s*[0-9][0-9,]*\.[0-9]{2}/i);

  return {
    source: "kloa" as const,
    sourceUrl: url,
    currentItemLevel,
    combatPower,
    className: inferredClassName ?? className,
    combatDetails,
    combatSystems,
    pieces,
    debug: {
      fallbackLevelFound: currentItemLevel != null,
      fallbackPieceCount: pieces.length,
      fallbackLevelSnippet: clipSnippet(levelSnippetMatch?.[0] ?? ""),
    },
  };
}

async function fetchIloaFallback(nickname: string) {
  const url = `https://iloa.gg/character/${encodeURIComponent(nickname)}`;
  const html = await fetchHtml(url);
  const combined = `${normalizeSourceText(html)}\n${stripHtml(html)}`;
  const combatDetails = extractCombatDetails(combined);
  const combatSystems = extractCombatSystems(combined, combatDetails);

  return {
    sourceUrl: url,
    combatDetails,
    combatSystems,
  };
}

async function fetchLopecFallback(nickname: string) {
  const url = `https://lopec.kr/character/specupGuide/${encodeURIComponent(nickname)}`;
  const html = await fetchHtml(url);
  const combined = `${normalizeSourceText(html)}\n${stripHtml(html)}`;
  const combatDetails = extractCombatDetails(combined);
  const combatSystems = extractCombatSystems(combined, combatDetails);

  return {
    sourceUrl: url,
    combatDetails,
    combatSystems,
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
    let className: string | null = null;
    let combatDetails: CombatPowerDetails = {};
    let combatSystems: CombatProfileSystems | null = null;
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
      const official = await fetchOfficialOpenApiProfile(nickname).catch(() => fetchOfficialProfile(nickname));
      currentItemLevel = official.currentItemLevel;
      combatPower = official.combatPower;
      className = official.className;
      combatDetails = { ...combatDetails, ...official.combatDetails };
      combatSystems = official.combatSystems;
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
        className = className ?? fallback.className;
        combatDetails = { ...fallback.combatDetails, ...combatDetails };
        combatSystems = combatSystems ?? fallback.combatSystems;
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

    if (!combatSystems || combatSystems.gemCount === 0 || combatSystems.arkPassivePoints < 100 || combatSystems.avatarGradeLevel === 0) {
      try {
        const lopec = await fetchLopecFallback(nickname);
        combatDetails = { ...lopec.combatDetails, ...combatDetails };
        combatSystems = mergeCombatSystems(combatSystems, lopec.combatSystems);
        warnings.push("공식 전투정보실에서 비는 상세 스펙은 LOPEC 공개 페이지로 보완했어.");
      } catch (error: any) {
        warnings.push(`LOPEC 상세 스펙 보완에 실패했어: ${error?.message || String(error)}`);
      }
    }

    if (!combatSystems || combatSystems.gemCount === 0 || combatSystems.arkPassivePoints < 100 || combatSystems.avatarGradeLevel === 0) {
      try {
        const iloa = await fetchIloaFallback(nickname);
        combatDetails = { ...iloa.combatDetails, ...combatDetails };
        combatSystems = mergeCombatSystems(combatSystems, iloa.combatSystems);
        warnings.push("공식 전투정보실에서 비는 상세 스펙은 ILOA 공개 페이지로 보완했어.");
      } catch (error: any) {
        warnings.push(`ILOA 상세 스펙 보완에 실패했어: ${error?.message || String(error)}`);
      }
    }

    if (currentItemLevel == null) warnings.push("현재 아이템레벨을 자동으로 찾지 못했어. 아래 검토 폼에서 확인해줘.");
    if (pieces.length === 0) warnings.push("장비 강화 정보는 아직 자동으로 못 읽었어. 공식 페이지 툴팁/OCR/직접 입력으로 보정해줘.");
    if (pieces.length > 0 && pieces.length < 6) warnings.push(`장비 ${pieces.length}부위만 읽었어. 부족한 부위는 직접 보정해줘.`);
    return res.status(200).json({
      ok: true,
      source,
      sourceUrl,
      nickname,
      fetchedAt: new Date().toISOString(),
      currentItemLevel,
      combatPower,
      className,
      inferredRole: className && SUPPORT_CLASS_NAMES.includes(className) ? "support" : "dealer",
      combatDetails,
      combatSystems,
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
