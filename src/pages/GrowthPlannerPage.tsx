import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import "./GrowthPlannerPage.css";
import { DEFAULT_TODO_STATE, type Character, type TodoTable } from "../store/todoStore";
import {
  estimateGrowthPlan,
  makeEmptyPlannerState,
  type EquipmentSlot,
  type GrowthPlannerState,
  type MaterialInventory,
  type MarketPriceSnapshot,
  type RefiningRouteStep,
  type RefiningMode,
} from "../lib/growthPlanner";
import { OCR_SCREEN_TEMPLATES, type OcrFieldBox } from "../lib/refiningData";
import {
  buildPlannerRaidSelections,
  calcPlannerRaidGold,
  canonicalRaidName,
  getDefaultPlannerRaidPick,
  loadWeeklyRaidPickFromStorage,
  type PlannerGoldBasis,
  type PlannerRaidSelection,
  type RaidDiffName,
} from "../lib/raidGold";

const STORAGE_KEY = "loa-growth-planner:v1";

const SLOT_ORDER: EquipmentSlot[] = ["helmet", "shoulder", "chest", "pants", "gloves", "weapon"];

const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: "무기",
  helmet: "투구",
  shoulder: "견갑",
  chest: "상의",
  pants: "하의",
  gloves: "장갑",
};

const TEMPLATE_LABELS: Record<string, string> = {
  ingame_combined: "인게임 한 장(장비 + 재료 + 재화)",
  character_profile: "캐릭터 장비창",
  material_inventory: "인벤토리 귀속 재료",
  currency_bar: "재화 표시",
  market_price: "거래소 시세 화면",
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  ingame_combined: "장비창, 인벤토리, 상단 재화가 한 번에 보이는 기본 템플릿이야.",
  character_profile: "장비창만 크게 찍은 화면용이야.",
  material_inventory: "귀속 재료만 따로 확인할 때 써.",
  currency_bar: "실링, 골드, 운명의 파편만 따로 볼 때 써.",
  market_price: "거래소 최저가 스캔용이야.",
};

const OCR_FIELD_LABELS: Record<string, string> = {
  silver: "실링",
  gold: "골드",
  boundShards: "운명의 파편",
  currentItemLevel: "현재 아이템레벨",
  equipmentColumn: "장비 목록",
  weaponLevel: "강화 단계",
  advancedRefining: "상급 재련 단계",
  artisanEnergy: "장인의 기운",
  currentRefiningExp: "현재 단계 재련 경험치",
  boundProtectionStones: "운명의 수호석(귀속)",
  boundDestructionStones: "운명의 파괴석(귀속)",
  boundIceBreaths: "빙하의 숨결(귀속)",
  boundLavaBreaths: "용암의 숨결(귀속)",
  boundLeapstones: "운명의 돌파석(귀속)",
  boundFusion: "아비도스 융화 재료(귀속)",
  shardPricePer1000: "파편 시세",
  leapstonePrice: "돌파석 시세",
  protectionStonePricePer10: "수호석 시세",
  destructionStonePricePer10: "파괴석 시세",
  fusionPrice: "융화 재료 시세",
};

const MATERIAL_LABELS: Array<[keyof MaterialInventory, string]> = [
  ["boundShards", "운명의 파편(귀속)"],
  ["tradableShards", "운명의 파편(거래 가능)"],
  ["boundLeapstones", "운명의 돌파석(귀속)"],
  ["tradableLeapstones", "운명의 돌파석(거래 가능)"],
  ["boundProtectionStones", "운명의 수호석(귀속)"],
  ["tradableProtectionStones", "운명의 수호석(거래 가능)"],
  ["boundDestructionStones", "운명의 파괴석(귀속)"],
  ["tradableDestructionStones", "운명의 파괴석(거래 가능)"],
  ["boundFusion", "아비도스 융화 재료(귀속)"],
  ["tradableFusion", "아비도스 융화 재료(거래 가능)"],
  ["boundSuccessorLeapstones", "위대한 운명의 돌파석(귀속)"],
  ["tradableSuccessorLeapstones", "위대한 운명의 돌파석(거래 가능)"],
  ["boundSuccessorProtectionStones", "운명의 수호석 결정(귀속)"],
  ["tradableSuccessorProtectionStones", "운명의 수호석 결정(거래 가능)"],
  ["boundSuccessorDestructionStones", "운명의 파괴석 결정(귀속)"],
  ["tradableSuccessorDestructionStones", "운명의 파괴석 결정(거래 가능)"],
  ["boundSuperiorFusion", "상급 아비도스 융화 재료(귀속)"],
  ["tradableSuperiorFusion", "상급 아비도스 융화 재료(거래 가능)"],
  ["boundIceBreaths", "빙하의 숨결(귀속)"],
  ["tradableIceBreaths", "빙하의 숨결(거래 가능)"],
  ["boundLavaBreaths", "용암의 숨결(귀속)"],
  ["tradableLavaBreaths", "용암의 숨결(거래 가능)"],
  ["tailoringBooks", "재봉술"],
  ["metallurgyBooks", "야금술"],
  ["gold", "현재 골드"],
  ["boundGold", "현재 캐릭터 귀속골드"],
  ["silver", "현재 실링"],
];

const MATERIAL_FIELD_GROUPS: Array<Array<[keyof MaterialInventory, string]>> = [
  [
    ["boundShards", "운명의 파편(귀속)"],
    ["tradableShards", "운명의 파편(거래 가능)"],
  ],
  [
    ["boundLeapstones", "운명의 돌파석(귀속)"],
    ["tradableLeapstones", "운명의 돌파석(거래 가능)"],
  ],
  [
    ["boundProtectionStones", "운명의 수호석(귀속)"],
    ["tradableProtectionStones", "운명의 수호석(거래 가능)"],
  ],
  [
    ["boundDestructionStones", "운명의 파괴석(귀속)"],
    ["tradableDestructionStones", "운명의 파괴석(거래 가능)"],
  ],
  [
    ["boundFusion", "아비도스 융화 재료(귀속)"],
    ["tradableFusion", "아비도스 융화 재료(거래 가능)"],
  ],
  [
    ["boundSuccessorLeapstones", "위대한 운명의 돌파석(귀속)"],
    ["tradableSuccessorLeapstones", "위대한 운명의 돌파석(거래 가능)"],
  ],
  [
    ["boundSuccessorProtectionStones", "운명의 수호석 결정(귀속)"],
    ["tradableSuccessorProtectionStones", "운명의 수호석 결정(거래 가능)"],
  ],
  [
    ["boundSuccessorDestructionStones", "운명의 파괴석 결정(귀속)"],
    ["tradableSuccessorDestructionStones", "운명의 파괴석 결정(거래 가능)"],
  ],
  [
    ["boundSuperiorFusion", "상급 아비도스 융화 재료(귀속)"],
    ["tradableSuperiorFusion", "상급 아비도스 융화 재료(거래 가능)"],
  ],
  [
    ["boundIceBreaths", "빙하의 숨결(귀속)"],
    ["tradableIceBreaths", "빙하의 숨결(거래 가능)"],
  ],
  [
    ["boundLavaBreaths", "용암의 숨결(귀속)"],
    ["tradableLavaBreaths", "용암의 숨결(거래 가능)"],
  ],
  [
    ["tailoringBooks", "재봉술"],
    ["metallurgyBooks", "야금술"],
  ],
  [
    ["artisanTailoringBook1", "장인의 재봉술 1단계"],
    ["artisanMetallurgyBook1", "장인의 야금술 1단계"],
  ],
  [
    ["artisanTailoringBook2", "장인의 재봉술 2단계"],
    ["artisanMetallurgyBook2", "장인의 야금술 2단계"],
  ],
  [
    ["artisanTailoringBook3", "장인의 재봉술 3단계"],
    ["artisanMetallurgyBook3", "장인의 야금술 3단계"],
  ],
  [
    ["artisanTailoringBook4", "장인의 재봉술 4단계"],
    ["artisanMetallurgyBook4", "장인의 야금술 4단계"],
  ],
  [
    ["upheavalTailoringBook15", "재봉술: 업화 [15-18]"],
    ["upheavalMetallurgyBook15", "야금술: 업화 [15-18]"],
  ],
  [
    ["upheavalTailoringBook19", "재봉술: 업화 [19-20]"],
    ["upheavalMetallurgyBook19", "야금술: 업화 [19-20]"],
  ],
  [
    ["enhancedUpheavalTailoringBook19", "강화 재봉술: 업화 [19-20]"],
    ["enhancedUpheavalMetallurgyBook19", "강화 야금술: 업화 [19-20]"],
  ],
  [["graceFragments", "은총의 파편"]],
  [
    ["gold", "현재 골드"],
    ["boundGold", "현재 캐릭터 귀속골드"],
  ],
];

const TRADABLE_AS_BOUND_PAIRS: Partial<Record<keyof MaterialInventory, keyof MaterialInventory>> = {
  tradableShards: "boundShards",
  tradableLeapstones: "boundLeapstones",
  tradableProtectionStones: "boundProtectionStones",
  tradableDestructionStones: "boundDestructionStones",
  tradableFusion: "boundFusion",
  tradableSuccessorLeapstones: "boundSuccessorLeapstones",
  tradableSuccessorProtectionStones: "boundSuccessorProtectionStones",
  tradableSuccessorDestructionStones: "boundSuccessorDestructionStones",
  tradableSuperiorFusion: "boundSuperiorFusion",
  tradableIceBreaths: "boundIceBreaths",
  tradableLavaBreaths: "boundLavaBreaths",
};

function makeDefaultTradableAsBoundFlags(): Partial<Record<keyof MaterialInventory, boolean>> {
  return Object.fromEntries(
    Object.keys(TRADABLE_AS_BOUND_PAIRS).map((key) => [key, key !== "tradableIceBreaths" && key !== "tradableLavaBreaths"])
  ) as Partial<Record<keyof MaterialInventory, boolean>>;
}

const MARKET_LABELS: Array<[keyof MarketPriceSnapshot, string]> = [
  ["shardPricePer1000", "운명의 파편 주머니 최저 환산(1000개)"],
  ["leapstonePrice", "운명의 돌파석 시세"],
  ["protectionStonePricePer10", "운명의 수호석 시세(10개)"],
  ["destructionStonePricePer10", "운명의 파괴석 시세(10개)"],
  ["fusionPrice", "아비도스 융화 재료 시세"],
  ["successorLeapstonePrice", "위대한 운명의 돌파석 시세"],
  ["successorProtectionStonePricePer10", "운명의 수호석 결정 시세(10개)"],
  ["successorDestructionStonePricePer10", "운명의 파괴석 결정 시세(10개)"],
  ["superiorFusionPrice", "상급 아비도스 융화 재료 시세"],
  ["iceBreathPrice", "빙하의 숨결 시세"],
  ["lavaBreathPrice", "용암의 숨결 시세"],
  ["tailoringBookPrice", "재봉술 시세"],
  ["metallurgyBookPrice", "야금술 시세"],
  ["upheavalTailoringBook15Price", "재봉술: 업화 [15-18] 시세"],
  ["upheavalMetallurgyBook15Price", "야금술: 업화 [15-18] 시세"],
  ["upheavalTailoringBook19Price", "재봉술: 업화 [19-20] 시세"],
  ["upheavalMetallurgyBook19Price", "야금술: 업화 [19-20] 시세"],
  ["enhancedTailoringBookPrice", "강화 재봉술: 업화 [19-20] 시세"],
  ["enhancedMetallurgyBookPrice", "강화 야금술: 업화 [19-20] 시세"],
  ["artisanTailoringBook1Price", "장인의 재봉술 1단계 시세"],
  ["artisanMetallurgyBook1Price", "장인의 야금술 1단계 시세"],
  ["artisanTailoringBook2Price", "장인의 재봉술 2단계 시세"],
  ["artisanMetallurgyBook2Price", "장인의 야금술 2단계 시세"],
  ["artisanTailoringBook3Price", "장인의 재봉술 3단계 시세"],
  ["artisanMetallurgyBook3Price", "장인의 야금술 3단계 시세"],
  ["artisanTailoringBook4Price", "장인의 재봉술 4단계 시세"],
  ["artisanMetallurgyBook4Price", "장인의 야금술 4단계 시세"],
];
type CharacterImportPiece = {
  slot: EquipmentSlot;
  itemName: string;
  itemLevel: number | null;
  honingLevel: number;
  advancedRefiningLevel: number;
};

type CharacterImportResponse = {
  ok: boolean;
  source: "official" | "kloa";
  sourceUrl: string;
  nickname: string;
  fetchedAt: string;
  currentItemLevel: number | null;
  pieces: CharacterImportPiece[];
  warnings: string[];
  debug?: {
    officialLevelFound: boolean;
    officialPieceCount: number;
    fallbackLevelFound: boolean;
    fallbackPieceCount: number;
    officialLevelSnippet: string;
    officialFirstPieceSnippet: string;
    fallbackLevelSnippet: string;
  };
};

type MarketAutoFillResponse = {
  ok: boolean;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  lastUpdatedAt: string | null;
  market: Partial<MarketPriceSnapshot>;
  items: Array<{
    name: string;
    bundleSize: number;
    totalPrice: number;
    unitPrice: number;
    shardCount?: number;
  }>;
  notes: string[];
  debug?: {
    parsedItemCount: number;
  };
  error?: string;
  detail?: string;
};

function parseNumber(input: string | number | undefined | null) {
  const cleaned = String(input ?? "").replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function cloneState(state: GrowthPlannerState): GrowthPlannerState {
  return JSON.parse(JSON.stringify(state));
}

function applyTradableAsBound(materials: MaterialInventory, flags: Partial<Record<keyof MaterialInventory, boolean>>) {
  const next = { ...materials };
  Object.entries(TRADABLE_AS_BOUND_PAIRS).forEach(([tradableKey, boundKey]) => {
    const typedTradableKey = tradableKey as keyof MaterialInventory;
    if (!flags[typedTradableKey] || !boundKey) return;
    next[boundKey] = 1_000_000_000 as never;
    next[typedTradableKey] = 0 as never;
  });
  return next;
}

function toPersistedPlannerState(state: GrowthPlannerState) {
  return {
    ...state,
    ocr: {
      ...state.ocr,
      screenshotDataUrl: "",
      screenshotName: "",
      extractedAt: null,
      status: state.ocr.status === "review" ? "review" : "idle",
    },
  };
}

function restorePlannerState(raw: string): GrowthPlannerState {
  const base = makeEmptyPlannerState();
  const parsed = JSON.parse(raw) as Partial<GrowthPlannerState>;

  return {
    ...base,
    ...parsed,
    character: {
      ...base.character,
      ...parsed.character,
      pieces: base.character.pieces.map((piece, index) => ({
        ...piece,
        ...(parsed.character?.pieces?.[index] ?? {}),
      })),
    },
    materials: {
      ...base.materials,
      ...(parsed.materials ?? {}),
    },
  market: {
    ...base.market,
    ...(parsed.market ?? {}),
    shardSmallPouchPrice: parsed.market?.shardSmallPouchPrice ?? base.market.shardSmallPouchPrice,
    shardMediumPouchPrice: parsed.market?.shardMediumPouchPrice ?? base.market.shardMediumPouchPrice,
    shardLargePouchPrice: parsed.market?.shardLargePouchPrice ?? base.market.shardLargePouchPrice,
  },
    ocr: {
      ...base.ocr,
      ...(parsed.ocr ?? {}),
      fields: parsed.ocr?.fields?.length ? parsed.ocr.fields : base.ocr.fields,
    },
  };
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatStatus(status: GrowthPlannerState["ocr"]["status"]) {
  if (status === "uploaded") return "스크린샷 업로드됨";
  if (status === "review") return "OCR 검토 준비 완료";
  return "대기 중";
}

function formatMode(mode: RefiningMode) {
  if (mode === "normal") return "일반 재련 우선";
  if (mode === "advanced") return "상급 재련 우선";
  return "일반/상급 혼합";
}

function templateLabel(key: string) {
  return TEMPLATE_LABELS[key] ?? key;
}

function templateDescription(key: string) {
  return TEMPLATE_DESCRIPTIONS[key] ?? "";
}

function ocrFieldLabel(fieldId: string) {
  return OCR_FIELD_LABELS[fieldId] ?? fieldId;
}

type DetectedInventoryIcon = {
  fieldId: string;
  confidence: number;
  x: number;
  y: number;
};

const MATERIAL_OCR_FIELD_MAP: Partial<Record<string, keyof MaterialInventory>> = {
  silver: "silver",
  gold: "gold",
  boundShards: "boundShards",
  boundProtectionStones: "boundProtectionStones",
  boundDestructionStones: "boundDestructionStones",
  boundIceBreaths: "boundIceBreaths",
  boundLavaBreaths: "boundLavaBreaths",
  boundLeapstones: "boundLeapstones",
  boundFusion: "boundFusion",
};

const TOOLTIP_MATERIAL_RULES: Array<{
  fieldId: string;
  key: keyof MaterialInventory;
  names: string[];
}> = [
  { fieldId: "boundProtectionStones", key: "boundProtectionStones", names: ["운명의 수호석", "수호석"] },
  { fieldId: "boundDestructionStones", key: "boundDestructionStones", names: ["운명의 파괴석", "파괴석"] },
  { fieldId: "boundLeapstones", key: "boundLeapstones", names: ["운명의 돌파석", "돌파석"] },
  { fieldId: "boundFusion", key: "boundFusion", names: ["아비도스 융화 재료", "융화 재료"] },
  { fieldId: "boundSuccessorProtectionStones", key: "boundSuccessorProtectionStones", names: ["운명의 수호석 결정", "수호석 결정"] },
  { fieldId: "boundSuccessorDestructionStones", key: "boundSuccessorDestructionStones", names: ["운명의 파괴석 결정", "파괴석 결정"] },
  { fieldId: "boundSuccessorLeapstones", key: "boundSuccessorLeapstones", names: ["위대한 운명의 돌파석", "위대한 돌파석"] },
  { fieldId: "boundSuperiorFusion", key: "boundSuperiorFusion", names: ["상급 아비도스 융화 재료", "상급 융화 재료"] },
  { fieldId: "boundIceBreaths", key: "boundIceBreaths", names: ["빙하의 숨결", "빙하"] },
  { fieldId: "boundLavaBreaths", key: "boundLavaBreaths", names: ["용암의 숨결", "용암"] },
];

function detectInventoryMaterialIcons(_dataUrl: string): DetectedInventoryIcon[] {
  // 다음 단계에서 아이콘/색상 매칭을 붙일 자리.
  // 지금은 기본 템플릿 OCR을 먼저 쓰고, 실패한 값만 사용자가 검토 폼에서 보정한다.
  return [];
}

function compactKoreanText(text: string) {
  return text.replace(/\s+/g, "").replace(/[(){}\[\]]/g, "");
}

function parseTooltipMaterialResults(text: string) {
  const normalized = text.replace(/,/g, "");
  const compact = compactKoreanText(normalized);
  const results: Array<{ fieldId: string; key: keyof MaterialInventory; label: string; value: number; raw: string }> = [];

  for (const rule of TOOLTIP_MATERIAL_RULES) {
    const matchedName = rule.names.find((name) => compact.includes(compactKoreanText(name)));
    if (!matchedName) continue;

    const xMatch = normalized.match(/[Xx×]\s*([0-9]{2,})/);
    const stockMatch = normalized.match(/(?:보유|수량|전체|전 체|겹침)[^0-9]{0,16}([0-9]{2,})/);
    const allNumbers = Array.from(normalized.matchAll(/[0-9]{2,}/g))
      .map((match) => Number(match[0]))
      .filter((value) => Number.isFinite(value));
    const value = Number(xMatch?.[1] ?? stockMatch?.[1] ?? Math.max(0, ...allNumbers));
    if (!Number.isFinite(value) || value <= 0) continue;

    results.push({
      fieldId: rule.fieldId,
      key: rule.key,
      label: ocrFieldLabel(rule.fieldId),
      value,
      raw: matchedName,
    });
  }

  return results;
}

const MARKET_OCR_FIELD_MAP: Partial<Record<string, keyof MarketPriceSnapshot>> = {
  shardPricePer1000: "shardPricePer1000",
  leapstonePrice: "leapstonePrice",
  protectionStonePricePer10: "protectionStonePricePer10",
  destructionStonePricePer10: "destructionStonePricePer10",
  fusionPrice: "fusionPrice",
  successorLeapstonePrice: "successorLeapstonePrice",
  successorProtectionStonePricePer10: "successorProtectionStonePricePer10",
  successorDestructionStonePricePer10: "successorDestructionStonePricePer10",
  superiorFusionPrice: "superiorFusionPrice",
  iceBreathPrice: "iceBreathPrice",
  lavaBreathPrice: "lavaBreathPrice",
  tailoringBookPrice: "tailoringBookPrice",
  metallurgyBookPrice: "metallurgyBookPrice",
  enhancedTailoringBookPrice: "enhancedTailoringBookPrice",
  enhancedMetallurgyBookPrice: "enhancedMetallurgyBookPrice",
};

function parseOcrNumber(text: string) {
  const hasCap = /9999\s*\+/.test(text);
  const match = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  return hasCap ? 9999 : value;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽지 못했어."));
    image.src = src;
  });
}

async function cropOcrField(dataUrl: string, field: OcrFieldBox) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const padding = 4;
  const x = Math.max(0, Math.floor(image.naturalWidth * field.x) - padding);
  const y = Math.max(0, Math.floor(image.naturalHeight * field.y) - padding);
  const width = Math.min(image.naturalWidth - x, Math.ceil(image.naturalWidth * field.width) + padding * 2);
  const height = Math.min(image.naturalHeight - y, Math.ceil(image.naturalHeight * field.height) + padding * 2);
  canvas.width = Math.max(1, width * 2);
  canvas.height = Math.max(1, height * 2);
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  context.filter = "contrast(1.45) brightness(1.15)";
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function formatDateTime(input?: string | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString("ko-KR");
}

function formatGold(value: number) {
  return `${Math.round(value).toLocaleString()} G`;
}

type DisplayRouteStep = RefiningRouteStep & {
  originalIndexes: number[];
};

function getAdvancedGroupEnd(fromLevel: number) {
  const remainder = fromLevel % 5;
  return fromLevel + (remainder === 0 ? 5 : 5 - remainder);
}

function addRouteMaterials(target: NonNullable<RefiningRouteStep["expectedMaterials"]>, source: NonNullable<RefiningRouteStep["expectedMaterials"]>) {
  for (const key of Object.keys(source) as Array<keyof NonNullable<RefiningRouteStep["expectedMaterials"]>>) {
    target[key] = Number(target[key] || 0) + Number(source[key] || 0);
  }
}

function hasRouteMaterials(materials: NonNullable<RefiningRouteStep["expectedMaterials"]>) {
  return Object.values(materials).some((value) => Number(value || 0) > 0);
}

function groupRouteStepsForDisplay(steps: RefiningRouteStep[]): DisplayRouteStep[] {
  const result: DisplayRouteStep[] = [];

  steps.forEach((step, index) => {
    const prev = result[result.length - 1];
    const canGroup =
      prev &&
      prev.action === "advanced" &&
      step.action === "advanced" &&
      prev.slot === step.slot &&
      prev.itemName === step.itemName &&
      prev.materialFamily === step.materialFamily &&
      prev.toLevel === step.fromLevel &&
      step.toLevel <= getAdvancedGroupEnd(prev.fromLevel);

    if (canGroup) {
      prev.toLevel = step.toLevel;
      prev.averageCost = Math.round((prev.averageCost + step.averageCost) * 100) / 100;
      prev.directGold = Math.round((prev.directGold + step.directGold) * 100) / 100;
      prev.levelGain += step.levelGain;
      prev.efficiency = prev.averageCost / Math.max(prev.levelGain, 0.0001);
      prev.originalIndexes.push(index);
      addRouteMaterials(prev.expectedMaterials, step.expectedMaterials);
      prev.notes = Array.from(new Set([...prev.notes, ...step.notes]));
      return;
    }

    result.push({
      ...step,
      expectedMaterials: { ...step.expectedMaterials },
      originalIndexes: [index],
    });
  });

  return result;
}

function formatRouteAction(step: DisplayRouteStep) {
  return step.action === "normal" ? `강화 ${step.fromLevel} → ${step.toLevel}` : `상급재련 ${step.fromLevel} → ${step.toLevel}`;
}

function getRouteMaterialLines(step: DisplayRouteStep) {
  const materials = step.expectedMaterials;
  const rows: Array<[string, number]> = [
    ["파편", materials.shards || 0],
    ["돌파석", materials.leapstones || 0],
    ["수호석", materials.protectionStones || 0],
    ["파괴석", materials.destructionStones || 0],
    ["융화재료", materials.fusion || 0],
    ["위대한 돌파석", materials.successorLeapstones || 0],
    ["수호석 결정", materials.successorProtectionStones || 0],
    ["파괴석 결정", materials.successorDestructionStones || 0],
    ["상급 융화재료", materials.superiorFusion || 0],
    ["빙하의 숨결", materials.iceBreaths || 0],
    ["용암의 숨결", materials.lavaBreaths || 0],
    ["재봉술", materials.tailoringBooks || 0],
    ["야금술", materials.metallurgyBooks || 0],
  ];
  return rows.filter(([, value]) => Math.round(value) > 0);
}

type RouteMaterialUsageRow = {
  key: keyof RefiningRouteStep["expectedMaterials"];
  label: string;
  required: number;
  boundUsed: number;
  tradableUsed: number;
  purchaseNeeded: number;
  singleInventoryLabel?: string;
};

type BonusRewardItem = {
  name: string;
  quantity: number;
  unit: string;
  valueGold: number;
  sellable: boolean;
  marketKey?: keyof MarketPriceSnapshot;
  expectedNote?: string;
  alternatives?: Array<{ name: string; price: number; marketKey?: keyof MarketPriceSnapshot }>;
};

type BonusRewardRaidRow = {
  raidName: string;
  diff: RaidDiffName;
  clearGold: number;
  tradableRewardGold: number;
  totalGoldValue: number;
  rewards: BonusRewardItem[];
};

type CathedralStage = "none" | "1" | "2" | "3";

const CATHEDRAL_FRAGMENT_REWARDS: Record<CathedralStage, number> = { none: 0, "1": 10, "2": 30, "3": 60 };
const CATHEDRAL_EXCHANGE_OPTIONS: Array<{
  key: keyof MaterialInventory;
  marketKey: keyof MarketPriceSnapshot;
  label: string;
  amountPerExchange: number;
}> = [
  { key: "upheavalTailoringBook19", marketKey: "upheavalTailoringBook19Price", label: "재봉술 : 업화 [19-20]", amountPerExchange: 3 },
  { key: "artisanTailoringBook3", marketKey: "artisanTailoringBook3Price", label: "장인의 재봉술 : 3단계", amountPerExchange: 6 },
  { key: "artisanTailoringBook4", marketKey: "artisanTailoringBook4Price", label: "장인의 재봉술 : 4단계", amountPerExchange: 3 },
  { key: "upheavalMetallurgyBook19", marketKey: "upheavalMetallurgyBook19Price", label: "야금술 : 업화 [19-20]", amountPerExchange: 1 },
  { key: "artisanMetallurgyBook3", marketKey: "artisanMetallurgyBook3Price", label: "장인의 야금술 : 3단계", amountPerExchange: 2 },
  { key: "artisanMetallurgyBook4", marketKey: "artisanMetallurgyBook4Price", label: "장인의 야금술 : 4단계", amountPerExchange: 1 },
];

type CathedralExchangePlan = {
  weeklyFragments: number;
  totalFragments: number;
  exchangeCount: number;
  entries: Array<{ key: keyof MaterialInventory; label: string; amount: number }>;
};

const ROUTE_MATERIAL_USAGE_FIELDS: Array<{
  key: keyof RefiningRouteStep["expectedMaterials"];
  label: string;
  boundKey?: keyof MaterialInventory;
  tradableKey?: keyof MaterialInventory;
  singleInventoryKey?: keyof MaterialInventory;
  singleInventoryLabel?: string;
}> = [
  { key: "shards", label: "운명의 파편", boundKey: "boundShards", tradableKey: "tradableShards" },
  { key: "leapstones", label: "운명의 돌파석", boundKey: "boundLeapstones", tradableKey: "tradableLeapstones" },
  { key: "protectionStones", label: "운명의 수호석", boundKey: "boundProtectionStones", tradableKey: "tradableProtectionStones" },
  { key: "destructionStones", label: "운명의 파괴석", boundKey: "boundDestructionStones", tradableKey: "tradableDestructionStones" },
  { key: "fusion", label: "아비도스 융화 재료", boundKey: "boundFusion", tradableKey: "tradableFusion" },
  { key: "successorLeapstones", label: "위대한 운명의 돌파석", boundKey: "boundSuccessorLeapstones", tradableKey: "tradableSuccessorLeapstones" },
  { key: "successorProtectionStones", label: "운명의 수호석 결정", boundKey: "boundSuccessorProtectionStones", tradableKey: "tradableSuccessorProtectionStones" },
  { key: "successorDestructionStones", label: "운명의 파괴석 결정", boundKey: "boundSuccessorDestructionStones", tradableKey: "tradableSuccessorDestructionStones" },
  { key: "superiorFusion", label: "상급 아비도스 융화 재료", boundKey: "boundSuperiorFusion", tradableKey: "tradableSuperiorFusion" },
  { key: "iceBreaths", label: "빙하의 숨결", boundKey: "boundIceBreaths", tradableKey: "tradableIceBreaths" },
  { key: "lavaBreaths", label: "용암의 숨결", boundKey: "boundLavaBreaths", tradableKey: "tradableLavaBreaths" },
  { key: "tailoringBooks", label: "재봉술", singleInventoryKey: "tailoringBooks", singleInventoryLabel: "보유" },
  { key: "metallurgyBooks", label: "야금술", singleInventoryKey: "metallurgyBooks", singleInventoryLabel: "보유" },
  { key: "artisanTailoringBook1", label: "장인의 재봉술 : 1단계", singleInventoryKey: "artisanTailoringBook1", singleInventoryLabel: "보유" },
  { key: "artisanMetallurgyBook1", label: "장인의 야금술 : 1단계", singleInventoryKey: "artisanMetallurgyBook1", singleInventoryLabel: "보유" },
  { key: "artisanTailoringBook2", label: "장인의 재봉술 : 2단계", singleInventoryKey: "artisanTailoringBook2", singleInventoryLabel: "보유" },
  { key: "artisanMetallurgyBook2", label: "장인의 야금술 : 2단계", singleInventoryKey: "artisanMetallurgyBook2", singleInventoryLabel: "보유" },
  { key: "artisanTailoringBook3", label: "장인의 재봉술 : 3단계", singleInventoryKey: "artisanTailoringBook3", singleInventoryLabel: "보유" },
  { key: "artisanMetallurgyBook3", label: "장인의 야금술 : 3단계", singleInventoryKey: "artisanMetallurgyBook3", singleInventoryLabel: "보유" },
  { key: "artisanTailoringBook4", label: "장인의 재봉술 : 4단계", singleInventoryKey: "artisanTailoringBook4", singleInventoryLabel: "보유" },
  { key: "artisanMetallurgyBook4", label: "장인의 야금술 : 4단계", singleInventoryKey: "artisanMetallurgyBook4", singleInventoryLabel: "보유" },
  { key: "upheavalTailoringBook15", label: "재봉술 : 업화 [15-18]", singleInventoryKey: "upheavalTailoringBook15", singleInventoryLabel: "보유" },
  { key: "upheavalMetallurgyBook15", label: "야금술 : 업화 [15-18]", singleInventoryKey: "upheavalMetallurgyBook15", singleInventoryLabel: "보유" },
  { key: "upheavalTailoringBook19", label: "재봉술 : 업화 [19-20]", singleInventoryKey: "upheavalTailoringBook19", singleInventoryLabel: "보유" },
  { key: "upheavalMetallurgyBook19", label: "야금술 : 업화 [19-20]", singleInventoryKey: "upheavalMetallurgyBook19", singleInventoryLabel: "보유" },
  { key: "enhancedUpheavalTailoringBook19", label: "강화 재봉술 : 업화 [19-20]", singleInventoryKey: "enhancedUpheavalTailoringBook19", singleInventoryLabel: "보유" },
  { key: "enhancedUpheavalMetallurgyBook19", label: "강화 야금술 : 업화 [19-20]", singleInventoryKey: "enhancedUpheavalMetallurgyBook19", singleInventoryLabel: "보유" },
];

function formatCount(value: number) {
  return Math.ceil(Math.max(0, value)).toLocaleString();
}

function getRequiredMaterialCards(materials: RefiningRouteStep["expectedMaterials"], inventory: MaterialInventory, market: MarketPriceSnapshot) {
  return ROUTE_MATERIAL_USAGE_FIELDS.map((field) => {
    const required = Math.ceil(Math.max(0, Number(materials[field.key] || 0)));
    if (!required) return null;

    if (field.singleInventoryKey) {
      const owned = Math.max(0, Number(inventory[field.singleInventoryKey] || 0));
      const ownedUsed = Math.min(required, owned);
      const purchaseNeeded = Math.max(0, required - ownedUsed);
      const purchaseGold = purchaseNeeded * marketUnitPriceForRouteKey(field.key, market);
      const parts = [
        ownedUsed > 0 ? `${formatCount(ownedUsed)}개(보유)` : "",
        purchaseNeeded > 0 ? `${formatCount(purchaseNeeded)}개(구매 ${formatGold(purchaseGold)})` : "",
      ].filter(Boolean);
      return { label: field.label, value: required, detail: parts.join(" + ") };
    }

    const boundOwned = field.boundKey ? Math.max(0, Number(inventory[field.boundKey] || 0)) : 0;
    const tradableOwned = field.tradableKey ? Math.max(0, Number(inventory[field.tradableKey] || 0)) : 0;
    const boundUsed = Math.min(required, boundOwned);
    const tradableUsed = Math.min(Math.max(0, required - boundUsed), tradableOwned);
    const purchaseNeeded = Math.max(0, required - boundUsed - tradableUsed);
    const purchaseGold = purchaseNeeded * marketUnitPriceForRouteKey(field.key, market);
    const parts = [
      boundUsed > 0 ? `${formatCount(boundUsed)}개(귀속)` : "",
      tradableUsed > 0 ? `${formatCount(tradableUsed)}개(거래가능)` : "",
      purchaseNeeded > 0 ? `${formatCount(purchaseNeeded)}개(구매 ${formatGold(purchaseGold)})` : "",
    ].filter(Boolean);

    return { label: field.label, value: required, detail: parts.join(" + ") };
  }).filter((row): row is { label: string; value: number; detail: string } => Boolean(row));
}

function inferRouteMaterials(step: DisplayRouteStep): RefiningRouteStep["expectedMaterials"] {
  return step.expectedMaterials;

  if (hasRouteMaterials(step.expectedMaterials)) return step.expectedMaterials;
  if (step.action !== "advanced") return step.expectedMaterials;

  const count = Math.max(1, Math.ceil(Math.max(0, step.toLevel - step.fromLevel)));
  const isWeapon = step.slot === "weapon";
  const band = step.fromLevel < 10 ? 0 : step.fromLevel < 20 ? 1 : step.fromLevel < 30 ? 2 : 3;
  const legacyArmorRows = [
    { shards: 300, leapstones: 4, protectionStones: 150, destructionStones: 0, fusion: 5, breath: 4 },
    { shards: 600, leapstones: 5, protectionStones: 270, destructionStones: 0, fusion: 5, breath: 6 },
    { shards: 7000, leapstones: 18, protectionStones: 1000, destructionStones: 0, fusion: 17, breath: 20 },
    { shards: 8000, leapstones: 23, protectionStones: 1200, destructionStones: 0, fusion: 19, breath: 24 },
  ];
  const legacyWeaponRows = [
    { shards: 500, leapstones: 5, protectionStones: 0, destructionStones: 180, fusion: 8, breath: 4 },
    { shards: 1000, leapstones: 7, protectionStones: 0, destructionStones: 330, fusion: 9, breath: 6 },
    { shards: 11500, leapstones: 25, protectionStones: 0, destructionStones: 1200, fusion: 28, breath: 20 },
    { shards: 13000, leapstones: 32, protectionStones: 0, destructionStones: 1400, fusion: 30, breath: 24 },
  ];
  const successorArmorRows = [
    { shards: 360, leapstones: 3, protectionStones: 105, destructionStones: 0, fusion: 4, breath: 4 },
    { shards: 720, leapstones: 4, protectionStones: 135, destructionStones: 0, fusion: 5, breath: 6 },
    { shards: 8400, leapstones: 6, protectionStones: 165, destructionStones: 0, fusion: 7, breath: 20 },
    { shards: 9600, leapstones: 7, protectionStones: 195, destructionStones: 0, fusion: 8, breath: 24 },
  ];
  const successorWeaponRows = [
    { shards: 600, leapstones: 4, protectionStones: 0, destructionStones: 160, fusion: 7, breath: 4 },
    { shards: 1200, leapstones: 5, protectionStones: 0, destructionStones: 205, fusion: 8, breath: 6 },
    { shards: 13800, leapstones: 7, protectionStones: 0, destructionStones: 250, fusion: 10, breath: 20 },
    { shards: 15600, leapstones: 8, protectionStones: 0, destructionStones: 295, fusion: 11, breath: 24 },
  ];
  const row =
    step.materialFamily === "successor"
      ? isWeapon
        ? successorWeaponRows[band]
        : successorArmorRows[band]
      : isWeapon
        ? legacyWeaponRows[band]
        : legacyArmorRows[band];

  if (step.materialFamily === "successor") {
    return {
      shards: row.shards * count,
      successorLeapstones: row.leapstones * count,
      successorProtectionStones: row.protectionStones * count,
      successorDestructionStones: row.destructionStones * count,
      superiorFusion: row.fusion * count,
      iceBreaths: isWeapon ? 0 : row.breath * count,
      lavaBreaths: isWeapon ? row.breath * count : 0,
    };
  }

  return {
    shards: row.shards * count,
    leapstones: row.leapstones * count,
    protectionStones: row.protectionStones * count,
    destructionStones: row.destructionStones * count,
    fusion: row.fusion * count,
    iceBreaths: isWeapon ? 0 : row.breath * count,
    lavaBreaths: isWeapon ? row.breath * count : 0,
  };
}

function getRouteMaterialUsageRows(step: DisplayRouteStep, inventory: MaterialInventory): RouteMaterialUsageRow[] {
  const rows: RouteMaterialUsageRow[] = [];
  const materials = inferRouteMaterials(step);

  ROUTE_MATERIAL_USAGE_FIELDS.forEach((field) => {
    const required = Math.ceil(Math.max(0, Number(materials[field.key] || 0)));
    if (!required) return;

    if (field.singleInventoryKey) {
      const owned = Math.max(0, Number(inventory[field.singleInventoryKey] || 0));
      const boundUsed = Math.min(required, owned);
      rows.push({
        key: field.key,
        label: field.label,
        required,
        boundUsed,
        tradableUsed: 0,
        purchaseNeeded: Math.max(0, required - boundUsed),
        singleInventoryLabel: field.singleInventoryLabel,
      });
      return;
    }

    const boundOwned = field.boundKey ? Math.max(0, Number(inventory[field.boundKey] || 0)) : 0;
    const tradableOwned = field.tradableKey ? Math.max(0, Number(inventory[field.tradableKey] || 0)) : 0;
    const boundUsed = Math.min(required, boundOwned);
    const tradableUsed = Math.min(Math.max(0, required - boundUsed), tradableOwned);

    rows.push({
      key: field.key,
      label: field.label,
      required,
      boundUsed,
      tradableUsed,
      purchaseNeeded: Math.max(0, required - boundUsed - tradableUsed),
    });
  });

  return rows;
}

function readInventoryValue(inventory: MaterialInventory, key: keyof MaterialInventory) {
  return Math.max(0, Number(inventory[key] || 0));
}

function writeInventoryValue(inventory: MaterialInventory, key: keyof MaterialInventory, value: number) {
  (inventory as Record<keyof MaterialInventory, number>)[key] = Math.max(0, value);
}

function consumeRouteMaterialsForPreview(inventory: MaterialInventory, materials: RefiningRouteStep["expectedMaterials"]) {
  ROUTE_MATERIAL_USAGE_FIELDS.forEach((field) => {
    let remaining = Math.ceil(Math.max(0, Number(materials[field.key] || 0)));
    if (!remaining) return;

    if (field.singleInventoryKey) {
      const owned = readInventoryValue(inventory, field.singleInventoryKey);
      writeInventoryValue(inventory, field.singleInventoryKey, owned - Math.min(owned, remaining));
      return;
    }

    if (field.boundKey) {
      const owned = readInventoryValue(inventory, field.boundKey);
      const used = Math.min(owned, remaining);
      writeInventoryValue(inventory, field.boundKey, owned - used);
      remaining -= used;
    }

    if (field.tradableKey && remaining > 0) {
      const owned = readInventoryValue(inventory, field.tradableKey);
      const used = Math.min(owned, remaining);
      writeInventoryValue(inventory, field.tradableKey, owned - used);
    }
  });
}

function getSequentialRouteMaterialUsageRows(steps: DisplayRouteStep[], selectedIndex: number, inventory: MaterialInventory) {
  const selectedStep = steps[selectedIndex];
  if (!selectedStep) return [];

  const remainingInventory: MaterialInventory = { ...inventory };
  for (let index = 0; index < selectedIndex; index += 1) {
    const step = steps[index];
    if (step) consumeRouteMaterialsForPreview(remainingInventory, inferRouteMaterials(step));
  }

  return getRouteMaterialUsageRows(selectedStep, remainingInventory);
}

function supportBookNameForStep(step: DisplayRouteStep) {
  const bookType = step.slot === "weapon" ? "야금술" : "재봉술";
  if (step.action === "advanced") {
    const stage = step.fromLevel < 10 ? 1 : step.fromLevel < 20 ? 2 : step.fromLevel < 30 ? 3 : 4;
    return `장인의 ${bookType}: ${stage}단계`;
  }

  const familyName = step.materialFamily === "successor" ? "전율" : "업화";
  return `${bookType} : ${familyName} [${step.fromLevel}-${step.toLevel}]`;
}

function maxBreathPerTryForStep(step: DisplayRouteStep) {
  if (step.action === "normal") return 25;
  if (step.fromLevel < 10) return 4;
  if (step.fromLevel < 20) return 6;
  if (step.fromLevel < 30) return 20;
  return 24;
}

function marketUnitPriceForRouteKey(key: keyof RefiningRouteStep["expectedMaterials"], market: MarketPriceSnapshot) {
  switch (key) {
    case "shards":
      return market.shardPricePer1000 / 1000;
    case "leapstones":
      return market.leapstonePrice;
    case "protectionStones":
      return market.protectionStonePricePer10 / 10;
    case "destructionStones":
      return market.destructionStonePricePer10 / 10;
    case "fusion":
      return market.fusionPrice;
    case "successorLeapstones":
      return market.successorLeapstonePrice;
    case "successorProtectionStones":
      return market.successorProtectionStonePricePer10 / 10;
    case "successorDestructionStones":
      return market.successorDestructionStonePricePer10 / 10;
    case "superiorFusion":
      return market.superiorFusionPrice;
    case "iceBreaths":
      return market.iceBreathPrice;
    case "lavaBreaths":
      return market.lavaBreathPrice;
    case "tailoringBooks":
      return market.tailoringBookPrice;
    case "metallurgyBooks":
      return market.metallurgyBookPrice;
    case "artisanTailoringBook1":
      return market.artisanTailoringBook1Price;
    case "artisanTailoringBook2":
      return market.artisanTailoringBook2Price;
    case "artisanTailoringBook3":
      return market.artisanTailoringBook3Price;
    case "artisanTailoringBook4":
      return market.artisanTailoringBook4Price;
    case "artisanMetallurgyBook1":
      return market.artisanMetallurgyBook1Price;
    case "artisanMetallurgyBook2":
      return market.artisanMetallurgyBook2Price;
    case "artisanMetallurgyBook3":
      return market.artisanMetallurgyBook3Price;
    case "artisanMetallurgyBook4":
      return market.artisanMetallurgyBook4Price;
    case "upheavalTailoringBook15":
      return market.upheavalTailoringBook15Price;
    case "upheavalMetallurgyBook15":
      return market.upheavalMetallurgyBook15Price;
    case "upheavalTailoringBook19":
      return market.upheavalTailoringBook19Price;
    case "upheavalMetallurgyBook19":
      return market.upheavalMetallurgyBook19Price;
    case "enhancedUpheavalTailoringBook19":
      return market.enhancedTailoringBookPrice;
    case "enhancedUpheavalMetallurgyBook19":
      return market.enhancedMetallurgyBookPrice;
    default:
      return 0;
  }
}

function getDisplayMaterialPurchaseCost(rows: RouteMaterialUsageRow[], market: MarketPriceSnapshot) {
  return rows.reduce((sum, row) => sum + row.purchaseNeeded * marketUnitPriceForRouteKey(row.key, market), 0);
}

function getRequiredMaterialPurchaseCost(
  requiredMaterials: RefiningRouteStep["expectedMaterials"],
  inventory: MaterialInventory,
  market: MarketPriceSnapshot
) {
  return ROUTE_MATERIAL_USAGE_FIELDS.reduce((sum, field) => {
    const required = Math.ceil(Math.max(0, Number(requiredMaterials[field.key] || 0)));
    if (!required) return sum;

    if (field.singleInventoryKey) {
      const owned = Math.max(0, Number(inventory[field.singleInventoryKey] || 0));
      return sum + Math.max(0, required - owned) * marketUnitPriceForRouteKey(field.key, market);
    }

    const boundOwned = field.boundKey ? Math.max(0, Number(inventory[field.boundKey] || 0)) : 0;
    const tradableOwned = field.tradableKey ? Math.max(0, Number(inventory[field.tradableKey] || 0)) : 0;
    return sum + Math.max(0, required - boundOwned - tradableOwned) * marketUnitPriceForRouteKey(field.key, market);
  }, 0);
}

function buildCathedralExchangePlan(
  requiredMaterials: RefiningRouteStep["expectedMaterials"],
  inventory: MaterialInventory,
  market: MarketPriceSnapshot,
  stage: CathedralStage,
  includeExtraReward: boolean
): CathedralExchangePlan {
  const weeklyFragments = CATHEDRAL_FRAGMENT_REWARDS[stage] * (includeExtraReward ? 2 : 1);
  const totalFragments = Math.max(0, Math.floor(Number(inventory.graceFragments || 0) + weeklyFragments));
  const exchangeCount = Math.floor(totalFragments / 10);
  const entries: CathedralExchangePlan["entries"] = [];
  let remaining = exchangeCount;

  while (remaining > 0) {
    const best = CATHEDRAL_EXCHANGE_OPTIONS.map((option) => {
      const required = Math.ceil(Math.max(0, Number(requiredMaterials[option.key as keyof RefiningRouteStep["expectedMaterials"]] || 0)));
      const owned = Math.max(0, Number(inventory[option.key] || 0)) + entries.filter((entry) => entry.key === option.key).reduce((sum, entry) => sum + entry.amount, 0);
      const usable = Math.min(option.amountPerExchange, Math.max(0, required - owned));
      return { ...option, usable, value: usable * Number(market[option.marketKey] || 0) };
    }).sort((a, b) => b.value - a.value)[0];

    if (!best || best.usable <= 0) break;
    const existing = entries.find((entry) => entry.key === best.key);
    if (existing) existing.amount += best.usable;
    else entries.push({ key: best.key, label: best.label, amount: best.usable });
    remaining -= 1;
  }

  return { weeklyFragments, totalFragments, exchangeCount, entries };
}

function applyCathedralExchangePlan(materials: MaterialInventory, plan: CathedralExchangePlan): MaterialInventory {
  if (!plan.entries.length) return materials;
  const next = { ...materials };
  plan.entries.forEach((entry) => {
    next[entry.key] = (Number(next[entry.key] || 0) + entry.amount) as never;
  });
  return next;
}

function getRouteSupportTimingGuides(step: DisplayRouteStep, rows: RouteMaterialUsageRow[], market: MarketPriceSnapshot) {
  const breathKey = step.slot === "weapon" ? "lavaBreaths" : "iceBreaths";
  const bookKey = step.slot === "weapon" ? "metallurgyBooks" : "tailoringBooks";
  const breathLabel = step.slot === "weapon" ? "용암의 숨결" : "빙하의 숨결";
  const bookLabel = supportBookNameForStep(step);
  const breathRow = rows.find((row) => row.key === breathKey);
  const bookRow = rows.find((row) => row.key === bookKey);
  const usesBreath = Boolean(breathRow && breathRow.required > 0);
  const usesBook = Boolean(bookRow && bookRow.required > 0);
  const maxBreath = maxBreathPerTryForStep(step);

  if (!usesBreath && !usesBook) {
    return ["현재 시세와 보유 재료 기준으로는 보조 재료를 넣지 않는 쪽이 최저 비용으로 잡혔어."];
  }

  const guides: string[] = [];
  if (step.action === "advanced") {
    if (usesBook && usesBreath) {
      guides.push(`선조/강화선조 선택 턴마다 ${bookLabel} 1개와 ${breathLabel} ${maxBreath}개를 같이 넣는 기준이야.`);
    } else if (usesBook) {
      guides.push(`선조/강화선조 선택 턴마다 ${bookLabel} 1개를 넣는 기준이야.`);
    } else if (usesBreath) {
      guides.push(`선조/강화선조 선택 턴마다 ${breathLabel} ${maxBreath}개를 넣는 기준이야.`);
    }
  } else if (usesBook && usesBreath) {
    guides.push(`강화 시작부터 성공 전까지 ${bookLabel} 1개와 ${breathLabel} 최대치(${maxBreath}개)를 함께 넣는 기준이야.`);
  } else if (usesBook) {
    guides.push(`강화 시작부터 성공 전까지 ${bookLabel} 1개를 넣는 기준이야.`);
  } else if (usesBreath) {
    guides.push(`강화 시작부터 성공 전까지 ${breathLabel} 최대치(${maxBreath}개)를 넣는 기준이야.`);
  }

  const breathPrice = marketUnitPriceForRouteKey(breathKey, market);
  if (usesBreath && breathPrice > 0) {
    guides.push(`${breathLabel}은 현재 입력가 기준 ${formatGold(breathPrice)} 이하일 때 구매해서 넣는 경로가 효율로 선택됩니다.`);
  } else if (usesBreath) {
    guides.push(`${breathLabel} 시세를 거래소 시세 탭에 입력하면 구매 효율 기준을 같이 보여줘.`);
  }

  guides.push("표시된 필요 개수는 평균 소모량이라 실제 성공 타이밍에 따라 조금 달라질 수 있어.");
  return guides;
}

function valueByBundle(quantity: number, price: number, bundleSize = 1) {
  if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0) return 0;
  return (quantity / bundleSize) * price;
}

type SupportRewardSource = {
  raidName: string;
  diffs: RaidDiffName[];
  rewardNames: string[];
  quantity: number;
  quantityLabel: string;
};

const SUPPORT_REWARD_SOURCES: SupportRewardSource[] = [
  {
    raidName: "3막",
    diffs: ["하드"],
    rewardNames: ["장인의 재봉술: 2단계", "장인의 야금술: 2단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "4막",
    diffs: ["노말"],
    rewardNames: ["장인의 재봉술: 2단계", "장인의 야금술: 2단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "4막",
    diffs: ["하드"],
    rewardNames: ["재봉술 : 업화 [15-18]", "야금술 : 업화 [15-18]"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "종막",
    diffs: ["노말"],
    rewardNames: ["재봉술 : 업화 [15-18]", "야금술 : 업화 [15-18]"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "지평의 성당",
    diffs: ["1단계"],
    rewardNames: ["재봉술 : 업화 [15-18]", "야금술 : 업화 [15-18]"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "종막",
    diffs: ["하드"],
    rewardNames: ["재봉술 : 업화 [19-20]", "야금술 : 업화 [19-20]"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "세르카",
    diffs: ["노말"],
    rewardNames: ["장인의 재봉술: 3단계", "장인의 야금술: 3단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "지평의 성당",
    diffs: ["2단계"],
    rewardNames: ["장인의 재봉술: 3단계", "장인의 야금술: 3단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "세르카",
    diffs: ["하드", "나이트메어"],
    rewardNames: ["장인의 재봉술: 4단계", "장인의 야금술: 4단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
  {
    raidName: "지평의 성당",
    diffs: ["3단계"],
    rewardNames: ["장인의 재봉술: 4단계", "장인의 야금술: 4단계"],
    quantity: 1,
    quantityLabel: "0~1개",
  },
];

function findSupportRewardSource(row: PlannerRaidSelection) {
  return SUPPORT_REWARD_SOURCES.find(
    (source) => source.raidName === row.raidName && source.diffs.includes(row.diff)
  );
}

function fallbackSupportRewardPrice(name: string, market: MarketPriceSnapshot) {
  const key = supportRewardMarketKey(name);
  if (key) return market[key] || 0;
  return 0;
}

function normalizeSupportRewardName(name: string) {
  return name.replace(/\s+/g, "").replace(/[：]/g, ":").trim();
}

function supportRewardMarketKey(name: string): keyof MarketPriceSnapshot | null {
  const normalized = normalizeSupportRewardName(name);
  const isTailoring = normalized.includes("재봉술");
  const isMetallurgy = normalized.includes("야금술");
  if (normalized.includes("강화재봉술") && normalized.includes("업화[19-20]")) return "enhancedTailoringBookPrice";
  if (normalized.includes("강화야금술") && normalized.includes("업화[19-20]")) return "enhancedMetallurgyBookPrice";
  if (isTailoring && normalized.includes("업화[15-18]")) return "upheavalTailoringBook15Price";
  if (isMetallurgy && normalized.includes("업화[15-18]")) return "upheavalMetallurgyBook15Price";
  if (isTailoring && normalized.includes("업화[19-20]")) return "upheavalTailoringBook19Price";
  if (isMetallurgy && normalized.includes("업화[19-20]")) return "upheavalMetallurgyBook19Price";
  if (isTailoring && normalized.includes("1단계")) return "artisanTailoringBook1Price";
  if (isMetallurgy && normalized.includes("1단계")) return "artisanMetallurgyBook1Price";
  if (isTailoring && normalized.includes("2단계")) return "artisanTailoringBook2Price";
  if (isMetallurgy && normalized.includes("2단계")) return "artisanMetallurgyBook2Price";
  if (isTailoring && normalized.includes("3단계")) return "artisanTailoringBook3Price";
  if (isMetallurgy && normalized.includes("3단계")) return "artisanMetallurgyBook3Price";
  if (isTailoring && normalized.includes("4단계")) return "artisanTailoringBook4Price";
  if (isMetallurgy && normalized.includes("4단계")) return "artisanMetallurgyBook4Price";
  return null;
}

function isExclusiveSupportReward(names: string[]) {
  const hasTailoring = names.some((name) => normalizeSupportRewardName(name).includes("재봉술"));
  const hasMetallurgy = names.some((name) => normalizeSupportRewardName(name).includes("야금술"));
  return names.length > 1 && hasTailoring && hasMetallurgy;
}

function supportRewardUnitPrice(name: string, market: MarketPriceSnapshot, supportPriceByName: Record<string, number>) {
  return fallbackSupportRewardPrice(name, market) || supportPriceByName[normalizeSupportRewardName(name)] || 0;
}

function makeBonusRewardRows(
  selections: PlannerRaidSelection[],
  market: MarketPriceSnapshot,
  supportPriceByName: Record<string, number> = {}
): BonusRewardRaidRow[] {
  return selections
    .filter((row) => row.goldEnabled)
    .map((row) => {
      const supportSource = findSupportRewardSource(row);
      let rewards: BonusRewardItem[] = [];
      if (supportSource) {
        if (isExclusiveSupportReward(supportSource.rewardNames)) {
          const prices = supportSource.rewardNames.map((rewardName) => supportRewardUnitPrice(rewardName, market, supportPriceByName));
          const validPrices = prices.filter((price) => Number.isFinite(price) && price > 0);
          const averagePrice = validPrices.length ? validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length : 0;
          rewards = [
            {
              name: `${supportSource.rewardNames.join(" / ")} (${supportSource.quantityLabel})`,
              quantity: supportSource.quantity,
              unit: "개",
              valueGold: valueByBundle(supportSource.quantity, averagePrice),
              sellable: true,
              expectedNote: "둘 중 하나 드랍 기준 평균값",
              alternatives: supportSource.rewardNames.map((rewardName, index) => ({
                name: rewardName,
                price: prices[index] || 0,
                marketKey: supportRewardMarketKey(rewardName) || undefined,
              })),
            },
          ];
        } else {
          rewards = supportSource.rewardNames.map((rewardName) => {
            const unitPrice = supportRewardUnitPrice(rewardName, market, supportPriceByName);
            return {
              name: `${rewardName} (${supportSource.quantityLabel})`,
              quantity: supportSource.quantity,
              unit: "개",
              valueGold: valueByBundle(supportSource.quantity, unitPrice),
              sellable: true,
              marketKey: supportRewardMarketKey(rewardName) || undefined,
            };
          });
        }
      }
      const tradableRewardGold = rewards.reduce((sum, reward) => sum + reward.valueGold, 0);
      return {
        raidName: row.raidName,
        diff: row.diff,
        clearGold: row.totalGold,
        tradableRewardGold,
        totalGoldValue: row.totalGold + tradableRewardGold,
        rewards,
      };
    });
}

function sumBonusRows(rows: BonusRewardRaidRow[]) {
  return rows.reduce(
    (sum, row) => ({
      clearGold: sum.clearGold + row.clearGold,
      tradableRewardGold: sum.tradableRewardGold + row.tradableRewardGold,
      totalGoldValue: sum.totalGoldValue + row.totalGoldValue,
    }),
    { clearGold: 0, tradableRewardGold: 0, totalGoldValue: 0 }
  );
}

function shouldShowMarketField(key: keyof MarketPriceSnapshot, required: ReturnType<typeof estimateGrowthPlan>["requiredMaterials"]) {
  if (key === "shardPricePer1000") return required.shards > 0;
  if (key === "leapstonePrice") return required.leapstones > 0;
  if (key === "protectionStonePricePer10") return required.protectionStones > 0;
  if (key === "destructionStonePricePer10") return required.destructionStones > 0;
  if (key === "fusionPrice") return required.fusion > 0;
  if (key === "successorLeapstonePrice") return required.successorLeapstones > 0;
  if (key === "successorProtectionStonePricePer10") return required.successorProtectionStones > 0;
  if (key === "successorDestructionStonePricePer10") return required.successorDestructionStones > 0;
  if (key === "superiorFusionPrice") return required.superiorFusion > 0;
  if (key === "iceBreathPrice") return required.iceBreaths > 0;
  if (key === "lavaBreathPrice") return required.lavaBreaths > 0;
  if (key === "tailoringBookPrice") return required.tailoringBooks > 0;
  if (key === "metallurgyBookPrice") return required.metallurgyBooks > 0;
  if (key === "enhancedTailoringBookPrice") return required.tailoringBooks > 0;
  if (key === "enhancedMetallurgyBookPrice") return required.metallurgyBooks > 0;
  return false;
}

function shouldShowSupportBookMarketField(key: keyof MarketPriceSnapshot, planner: GrowthPlannerState) {
  if (
    key === "artisanTailoringBook1Price" ||
    key === "artisanTailoringBook2Price" ||
    key === "artisanTailoringBook3Price" ||
    key === "artisanTailoringBook4Price" ||
    key === "artisanMetallurgyBook1Price" ||
    key === "artisanMetallurgyBook2Price" ||
    key === "artisanMetallurgyBook3Price" ||
    key === "artisanMetallurgyBook4Price" ||
    key === "upheavalTailoringBook15Price" ||
    key === "upheavalMetallurgyBook15Price" ||
    key === "upheavalTailoringBook19Price" ||
    key === "upheavalMetallurgyBook19Price"
  ) {
    return true;
  }
  if (planner.character.preferredMode === "advanced") return false;
  if (key === "tailoringBookPrice" || key === "enhancedTailoringBookPrice") {
    return planner.character.pieces.some((piece) => piece.slot !== "weapon" && piece.honingLevel === 19);
  }
  if (key === "metallurgyBookPrice" || key === "enhancedMetallurgyBookPrice") {
    return planner.character.pieces.some((piece) => piece.slot === "weapon" && piece.honingLevel === 19);
  }
  return false;
}

function buildPieceSummary(piece: GrowthPlannerState["character"]["pieces"][number]) {
  const raw = piece.tierLabel?.trim() || "";
  const tierMatch = raw.match(/(?:티어|T)\s*([1-9])/i);
  const tier = tierMatch ? `T${tierMatch[1]}` : "";
  const cleanedName = raw.replace(/\((?:티어|T)\s*[1-9]\)/gi, "").replace(/(?:티어|T)\s*[1-9]/gi, "").trim();
  return {
    name: cleanedName || "장비 이름 미입력",
    tier,
  };
}

function deriveEquipmentItemLevel(piece: { itemLevel?: number | null; honingLevel?: number; advancedRefiningLevel?: number }) {
  const explicit = Number(piece.itemLevel || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const honingLevel = Number(piece.honingLevel || 0);
  if (!Number.isFinite(honingLevel) || honingLevel <= 0) return 0;

  const advancedLevel = Math.max(0, Number(piece.advancedRefiningLevel || 0));
  const inferred = 1590 + honingLevel * 5 + advancedLevel;
  return Number.isFinite(inferred) && inferred >= 1500 && inferred <= 1900 ? inferred : 0;
}

function resolveTemplateFields(templateKey: string) {
  return OCR_SCREEN_TEMPLATES.find((template) => template.key === templateKey)?.fields.map((field) => ({ ...field })) ?? [];
}

function getInitialTableId(tables: TodoTable[], state: GrowthPlannerState) {
  if (state.character.tableId && tables.some((table) => table.id === state.character.tableId)) return state.character.tableId;
  return "";
}

function buildCharacterName(selectedCharacter?: Character, plannerName?: string) {
  return selectedCharacter?.name || plannerName || "";
}

function averageImportedPieceLevel(pieces: CharacterImportPiece[]) {
  const levels = pieces.map(deriveEquipmentItemLevel).filter((value) => Number.isFinite(value) && value > 0);
  return levels.length === 6 ? levels.reduce((sum, value) => sum + value, 0) / 6 : null;
}

export default function GrowthPlannerPage() {
  const todoState = useMemo(() => DEFAULT_TODO_STATE.load() ?? DEFAULT_TODO_STATE.make(), []);
  const [planner, setPlanner] = useState<GrowthPlannerState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? restorePlannerState(raw) : makeEmptyPlannerState();
    } catch {
      return makeEmptyPlannerState();
    }
  });
  const [profileNickname, setProfileNickname] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSummary, setProfileSummary] = useState<CharacterImportResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketSummary, setMarketSummary] = useState<MarketAutoFillResponse | null>(null);
  const [marketError, setMarketError] = useState("");
  const [resourceTab, setResourceTab] = useState<"materials" | "market">("materials");
  const [weeklyRewardTab, setWeeklyRewardTab] = useState<"gold" | "bonus">("gold");
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [scanError, setScanError] = useState("");
  const [screenSharing, setScreenSharing] = useState(false);
  const [liveMaterialScan, setLiveMaterialScan] = useState(false);
  const [materialScanRunning, setMaterialScanRunning] = useState(false);
  const [materialScanStatus, setMaterialScanStatus] = useState("");
  const [lastMaterialScan, setLastMaterialScan] = useState<Array<{ fieldId: string; label: string; value: number; raw: string }>>([]);
  const [currentRaidSelections, setCurrentRaidSelections] = useState<PlannerRaidSelection[]>([]);
  const [targetRaidSelections, setTargetRaidSelections] = useState<PlannerRaidSelection[]>([]);
  const [raidGoldBasis, setRaidGoldBasis] = useState<PlannerGoldBasis>("tradable");
  const [tradableOnlyEstimate, setTradableOnlyEstimate] = useState(true);
  const [cathedralStage, setCathedralStage] = useState<CathedralStage>("3");
  const [cathedralExtraReward, setCathedralExtraReward] = useState(true);
  const [selectedWaitWeeks, setSelectedWaitWeeks] = useState(0);
  const [tradableAsBound, setTradableAsBound] = useState<Partial<Record<keyof MaterialInventory, boolean>>>(() => makeDefaultTradableAsBoundFlags());
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const shareVideoRef = useRef<HTMLVideoElement | null>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const liveScanTimerRef = useRef<number | null>(null);
  const ocrBusyRef = useRef(false);
  const ocrFieldsRef = useRef<OcrFieldBox[]>([]);
  const dragRef = useRef<{
    fieldId: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);

  const selectedTable = todoState.tables.find((table) => table.id === getInitialTableId(todoState.tables, planner));
  const selectedCharacter = selectedTable?.characters.find((character) => character.id === planner.character.charId);
  const isLinkedToTable = Boolean(selectedTable && selectedCharacter);
  const currentRaidGold = useMemo(() => calcPlannerRaidGold(currentRaidSelections), [currentRaidSelections]);
  const targetRaidGold = useMemo(() => calcPlannerRaidGold(targetRaidSelections), [targetRaidSelections]);
  const supportPriceByName = useMemo(() => {
    const prices: Record<string, number> = {};
    marketSummary?.items.forEach((item) => {
      if (!item.name.includes("재봉술") && !item.name.includes("야금술")) return;
      const price = item.totalPrice || item.unitPrice || 0;
      if (price > 0) {
        prices[normalizeSupportRewardName(item.name)] = price;
      }
    });
    return prices;
  }, [marketSummary?.items]);
  const currentBonusRows = useMemo(
    () => makeBonusRewardRows(currentRaidSelections, planner.market, supportPriceByName),
    [currentRaidSelections, planner.market, supportPriceByName]
  );
  const targetBonusRows = useMemo(
    () => makeBonusRewardRows(targetRaidSelections, planner.market, supportPriceByName),
    [targetRaidSelections, planner.market, supportPriceByName]
  );
  const currentBonusTotal = useMemo(() => sumBonusRows(currentBonusRows), [currentBonusRows]);
  const targetBonusTotal = useMemo(() => sumBonusRows(targetBonusRows), [targetBonusRows]);
  const effectiveMaterials = useMemo(() => applyTradableAsBound(planner.materials, tradableAsBound), [planner.materials, tradableAsBound]);
  const estimateInput = useMemo(() => {
    if (!tradableOnlyEstimate) return { ...planner, materials: effectiveMaterials };
    return {
      ...planner,
      character: {
        ...planner.character,
        currentWeeklyGold: currentRaidGold.tradableGold,
        targetWeeklyGold: targetRaidGold.tradableGold,
        currentWeeklyBoundGold: 0,
      },
      materials: {
        ...effectiveMaterials,
        boundGold: 0,
      },
    };
  }, [currentRaidGold.tradableGold, effectiveMaterials, planner, targetRaidGold.tradableGold, tradableOnlyEstimate]);
  const preliminaryEstimate = useMemo(() => estimateGrowthPlan(estimateInput), [estimateInput]);
  const cathedralExchangePlan = useMemo(
    () => buildCathedralExchangePlan(preliminaryEstimate.requiredMaterials, estimateInput.materials, estimateInput.market, cathedralStage, cathedralExtraReward),
    [cathedralExtraReward, cathedralStage, estimateInput.market, estimateInput.materials, preliminaryEstimate.requiredMaterials]
  );
  const finalEstimateInput = useMemo(
    () => ({ ...estimateInput, materials: applyCathedralExchangePlan(estimateInput.materials, cathedralExchangePlan) }),
    [cathedralExchangePlan, estimateInput]
  );
  const estimate = useMemo(() => estimateGrowthPlan(finalEstimateInput), [finalEstimateInput]);
  const displayRouteSteps = useMemo(() => groupRouteStepsForDisplay(estimate.routeSteps), [estimate.routeSteps]);
  const selectedRouteStep = displayRouteSteps[Math.min(selectedRouteIndex, Math.max(0, displayRouteSteps.length - 1))] ?? null;
  const selectedRouteUsageRows = useMemo(
    () => getSequentialRouteMaterialUsageRows(displayRouteSteps, Math.min(selectedRouteIndex, Math.max(0, displayRouteSteps.length - 1)), finalEstimateInput.materials),
    [displayRouteSteps, finalEstimateInput.materials, selectedRouteIndex]
  );
  const selectedRouteSupportGuides = useMemo(
    () => (selectedRouteStep ? getRouteSupportTimingGuides(selectedRouteStep, selectedRouteUsageRows, planner.market) : []),
    [planner.market, selectedRouteStep, selectedRouteUsageRows]
  );
  const displayMaterialPurchaseCost = useMemo(
    () => getRequiredMaterialPurchaseCost(estimate.requiredMaterials, finalEstimateInput.materials, finalEstimateInput.market),
    [estimate.requiredMaterials, finalEstimateInput.market, finalEstimateInput.materials]
  );
  const displayedTotalSpendGold = Math.max(0, estimate.directGoldCost + displayMaterialPurchaseCost);
  const selectedWaitBoundGold = Math.max(
    0,
    Number(finalEstimateInput.materials.boundGold || 0) + Math.max(0, selectedWaitWeeks) * Number(finalEstimateInput.character.currentWeeklyBoundGold || 0)
  );
  const selectedWaitTradableGoldSaved = Math.max(0, selectedWaitWeeks) * Number(finalEstimateInput.character.currentWeeklyGold || 0);
  const selectedWaitBoundGoldUse = Math.min(estimate.directGoldCost, selectedWaitBoundGold);
  const selectedWaitTradableGoldUse = Math.max(
    0,
    displayMaterialPurchaseCost + Math.max(0, estimate.directGoldCost - selectedWaitBoundGoldUse) - selectedWaitTradableGoldSaved
  );
  const selectedWaitPaybackWeeks =
    estimate.additionalWeeklyGold > 0 ? Math.round((selectedWaitTradableGoldUse / estimate.additionalWeeklyGold) * 100) / 100 : null;
  const requiredMaterialCards = useMemo(
    () => getRequiredMaterialCards(estimate.requiredMaterials, finalEstimateInput.materials, finalEstimateInput.market),
    [estimate.requiredMaterials, finalEstimateInput.market, finalEstimateInput.materials]
  );
  const visibleMarketLabels = useMemo(
    () => MARKET_LABELS.filter(([key]) => shouldShowMarketField(key, estimate.requiredMaterials) || shouldShowSupportBookMarketField(key, planner)),
    [estimate.requiredMaterials, planner]
  );
  const selectedOcrField = planner.ocr.fields.find((field) => field.id === planner.ocr.selectedFieldId) ?? planner.ocr.fields[0] ?? null;

  useEffect(() => {
    if (selectedRouteIndex >= displayRouteSteps.length) {
      setSelectedRouteIndex(Math.max(0, displayRouteSteps.length - 1));
    }
  }, [displayRouteSteps.length, selectedRouteIndex]);

  useEffect(() => {
    ocrFieldsRef.current = planner.ocr.fields;
  }, [planner.ocr.fields]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedPlannerState(planner)));
    } catch {
      // Ignore quota failures so screen captures do not crash the page.
    }
  }, [planner]);

  useEffect(() => {
    if (!profileNickname.trim() && selectedCharacter?.name) {
      setProfileNickname(selectedCharacter.name);
    }
  }, [profileNickname, selectedCharacter?.name]);

  useEffect(() => {
    const currentIlvl = Number(planner.character.currentItemLevel || 0);
    if (!Number.isFinite(currentIlvl) || currentIlvl <= 0) {
      setCurrentRaidSelections([]);
      return;
    }

    if (selectedTable && selectedCharacter) {
      const next = buildPlannerRaidSelections(
        currentIlvl,
        loadWeeklyRaidPickFromStorage(selectedTable.id, selectedCharacter.id, currentIlvl)
      );
      setCurrentRaidSelections(next);
      return;
    }

    setCurrentRaidSelections((prev) => {
      const next = buildPlannerRaidSelections(currentIlvl, getDefaultPlannerRaidPick(currentIlvl, raidGoldBasis));
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [planner.character.currentItemLevel, selectedCharacter?.id, selectedTable?.id, raidGoldBasis]);

  useEffect(() => {
    setPlanner((prev) => {
      if (prev.character.currentWeeklyGold === currentRaidGold.totalGold) return prev;
      return {
        ...prev,
        character: {
          ...prev.character,
          currentWeeklyGold: currentRaidGold.totalGold,
        },
      };
    });
  }, [currentRaidGold.totalGold]);

  useEffect(() => {
    const targetIlvl = Number(planner.character.targetItemLevel || 0);
    setTargetRaidSelections((prev) => {
      const next = buildPlannerRaidSelections(targetIlvl, getDefaultPlannerRaidPick(targetIlvl, raidGoldBasis));
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [planner.character.targetItemLevel, raidGoldBasis]);

  useEffect(() => {
    setPlanner((prev) => {
      if (prev.character.targetWeeklyGold === targetRaidGold.totalGold) return prev;
      return {
        ...prev,
        character: {
          ...prev.character,
          targetWeeklyGold: targetRaidGold.totalGold,
        },
      };
    });
  }, [targetRaidGold.totalGold]);

  useEffect(() => {
    return () => {
      shareStreamRef.current?.getTracks().forEach((track) => track.stop());
      shareStreamRef.current = null;
      if (liveScanTimerRef.current != null) window.clearInterval(liveScanTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (liveScanTimerRef.current != null) {
      window.clearInterval(liveScanTimerRef.current);
      liveScanTimerRef.current = null;
    }

    if (!screenSharing || !liveMaterialScan) return;

    const tick = () => {
      if (!ocrBusyRef.current) {
        void captureSharedFrame(true);
      }
    };

    tick();
    liveScanTimerRef.current = window.setInterval(tick, 5500);

    return () => {
      if (liveScanTimerRef.current != null) {
        window.clearInterval(liveScanTimerRef.current);
        liveScanTimerRef.current = null;
      }
    };
  }, [screenSharing, liveMaterialScan]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current || !previewFrameRef.current) return;
      const rect = previewFrameRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextX = (event.clientX - rect.left - dragRef.current.offsetX) / rect.width;
      const nextY = (event.clientY - rect.top - dragRef.current.offsetY) / rect.height;
      const maxX = Math.max(0, 1 - dragRef.current.width);
      const maxY = Math.max(0, 1 - dragRef.current.height);
      patchOcrField(dragRef.current.fieldId, {
        x: Math.max(0, Math.min(maxX, Number(nextX.toFixed(4)))),
        y: Math.max(0, Math.min(maxY, Number(nextY.toFixed(4)))),
      });
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (!screenSharing || !shareStreamRef.current || !shareVideoRef.current) return;

    let cancelled = false;
    const video = shareVideoRef.current;
    video.srcObject = shareStreamRef.current;

    const captureWhenReady = async () => {
      try {
        if (video.readyState < 1) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener("loadedmetadata", onReady);
              resolve();
            };
            video.addEventListener("loadedmetadata", onReady);
          });
        }

        await video.play().catch(() => undefined);

        for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
          if ((video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0) {
            const ok = await captureSharedFrame();
            if (ok) return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }

        if (!cancelled) {
          setScanError("공유 화면에서 아직 프레임을 가져오지 못했어.");
        }
      } catch {
        if (!cancelled) {
          setScanError("공유 화면 프레임을 준비하는 중에 문제가 생겼어.");
        }
      }
    };

    void captureWhenReady();

    return () => {
      cancelled = true;
      if (video.srcObject) video.srcObject = null;
    };
  }, [screenSharing]);

  function patchPlanner(mutator: (draft: GrowthPlannerState) => void) {
    setPlanner((prev) => {
      const draft = cloneState(prev);
      mutator(draft);
      return draft;
    });
  }

  function patchCharacter(patch: Partial<GrowthPlannerState["character"]>) {
    setPlanner((prev) => ({
      ...prev,
      character: {
        ...prev.character,
        ...patch,
      },
    }));
  }

  function patchMaterials<K extends keyof MaterialInventory>(key: K, value: number) {
    setPlanner((prev) => ({
      ...prev,
      materials: {
        ...prev.materials,
        [key]: value,
      },
    }));
  }

  function patchMarket<K extends keyof MarketPriceSnapshot>(key: K, value: number) {
    setPlanner((prev) => ({
      ...prev,
      market: {
        ...prev.market,
        [key]: value,
      },
    }));
  }

  function marketKeyForItemName(name: string): keyof MarketPriceSnapshot | null {
    const supportKey = supportRewardMarketKey(name);
    if (supportKey) return supportKey;
    if (name.includes("상급 아비도스")) return "superiorFusionPrice";
    if (name.includes("아비도스 융화")) return "fusionPrice";
    if (name.includes("위대한 운명의 돌파석")) return "successorLeapstonePrice";
    if (name.includes("운명의 돌파석")) return "leapstonePrice";
    if (name.includes("운명의 수호석 결정")) return "successorProtectionStonePricePer10";
    if (name.includes("운명의 파괴석 결정")) return "successorDestructionStonePricePer10";
    if (name.includes("운명의 수호석")) return "protectionStonePricePer10";
    if (name.includes("운명의 파괴석")) return "destructionStonePricePer10";
    if (name.includes("파편 주머니")) return "shardPricePer1000";
    if (name.includes("빙하의 숨결")) return "iceBreathPrice";
    if (name.includes("용암의 숨결")) return "lavaBreathPrice";
    if (name.includes("재봉술")) return "tailoringBookPrice";
    if (name.includes("야금술")) return "metallurgyBookPrice";
    return null;
  }

  function marketKeyForItem(item: MarketAutoFillResponse["items"][number]): keyof MarketPriceSnapshot | null {
    if (item.shardCount === 1000) return "shardSmallPouchPrice";
    if (item.shardCount === 2000) return "shardMediumPouchPrice";
    if (item.shardCount === 3000) return "shardLargePouchPrice";
    return marketKeyForItemName(item.name);
  }

  function resolveMarketItemPrice(item: MarketAutoFillResponse["items"][number]) {
    const key = marketKeyForItem(item);
    return key ? planner.market[key] || item.totalPrice || item.unitPrice : item.totalPrice || item.unitPrice;
  }

  function patchMarketItemPrice(item: MarketAutoFillResponse["items"][number], value: number) {
    const key = marketKeyForItem(item);
    if (key) patchMarket(key, value);
  }

  function patchPiece(slot: EquipmentSlot, patch: Partial<GrowthPlannerState["character"]["pieces"][number]>) {
    setPlanner((prev) => ({
      ...prev,
      character: {
        ...prev.character,
        pieces: prev.character.pieces.map((piece) => (piece.slot === slot ? { ...piece, ...patch } : piece)),
      },
    }));
  }

  function patchOcrField(fieldId: string, patch: Partial<OcrFieldBox>) {
    patchPlanner((draft) => {
      draft.ocr.fields = draft.ocr.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field));
    });
  }

  function startDraggingField(event: ReactPointerEvent<HTMLButtonElement>, field: OcrFieldBox) {
    if (!previewFrameRef.current) return;
    const rect = previewFrameRef.current.getBoundingClientRect();
    dragRef.current = {
      fieldId: field.id,
      offsetX: event.clientX - rect.left - rect.width * field.x,
      offsetY: event.clientY - rect.top - rect.height * field.y,
      width: field.width,
      height: field.height,
    };
    patchPlanner((draft) => void (draft.ocr.selectedFieldId = field.id));
  }

  async function applyCharacterFromTable() {
    if (!selectedTable || !selectedCharacter) return;
    const tableItemLevel = parseNumber(selectedCharacter.itemLevel);
    const nickname = selectedCharacter.name.trim();

    patchPlanner((draft) => {
      draft.character.tableId = selectedTable.id;
      draft.character.tableName = selectedTable.name;
      draft.character.charId = selectedCharacter.id;
      draft.character.characterName = selectedCharacter.name;
      draft.character.currentItemLevel = tableItemLevel;
      if (!draft.character.targetItemLevel) {
        draft.character.targetItemLevel = Math.max(1720, draft.character.currentItemLevel || 0);
      }
    });

    if (!nickname) return;

    setProfileLoading(true);
    setScanError("");
    try {
      const response = await fetch(`/api/growth/kloa-character?nickname=${encodeURIComponent(nickname)}`);
      const data = (await response.json()) as CharacterImportResponse & { error?: string; detail?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "공식 전투정보실 정보를 읽지 못했어.");
      }

      setProfileSummary(data);
      const importedAverageLevel = averageImportedPieceLevel(data.pieces);
      const importedCurrentLevel = importedAverageLevel ?? data.currentItemLevel;
      patchPlanner((draft) => {
        if (importedCurrentLevel != null && Math.abs(importedCurrentLevel - tableItemLevel) > 0.01) {
          draft.character.currentItemLevel = importedCurrentLevel;
          if (!draft.character.targetItemLevel || draft.character.targetItemLevel < draft.character.currentItemLevel) {
            draft.character.targetItemLevel = Math.ceil(draft.character.currentItemLevel);
          }
        }
        for (const importedPiece of data.pieces) {
          const targetPiece = draft.character.pieces.find((piece) => piece.slot === importedPiece.slot);
          if (!targetPiece) continue;
          targetPiece.honingLevel = importedPiece.honingLevel;
          targetPiece.advancedRefiningLevel = importedPiece.advancedRefiningLevel;
          targetPiece.tierLabel = importedPiece.itemName;
          targetPiece.itemLevel = importedPiece.itemLevel ?? targetPiece.itemLevel;
        }
      });
    } catch (error: any) {
      setScanError(error?.message || "공식 전투정보실 정보를 읽지 못했어. 표 아이템레벨로 불러왔어.");
    } finally {
      setProfileLoading(false);
    }
  }

  function clearTableBinding() {
    patchPlanner((draft) => {
      draft.character.tableId = "";
      draft.character.tableName = "";
      draft.character.charId = "";
    });
  }

  async function importFromProfile() {
    const nickname = profileNickname.trim();
    if (!nickname) return;

    setProfileLoading(true);
    setScanError("");
    try {
      const response = await fetch(`/api/growth/kloa-character?nickname=${encodeURIComponent(nickname)}`);
      const data = (await response.json()) as CharacterImportResponse & { error?: string; detail?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "공식 전투정보실 정보를 읽지 못했어.");
      }

      setProfileSummary(data);

      patchPlanner((draft) => {
        draft.character.characterName = buildCharacterName(selectedCharacter, nickname);
        const importedAverageLevel = averageImportedPieceLevel(data.pieces);
        const importedCurrentLevel = importedAverageLevel ?? data.currentItemLevel;
        if (importedCurrentLevel != null) {
          draft.character.currentItemLevel = importedCurrentLevel;
          if (draft.character.targetItemLevel < importedCurrentLevel) {
            draft.character.targetItemLevel = Math.ceil(importedCurrentLevel);
          }
        }
        for (const importedPiece of data.pieces) {
          const targetPiece = draft.character.pieces.find((piece) => piece.slot === importedPiece.slot);
          if (!targetPiece) continue;
          targetPiece.itemLevel = importedPiece.itemLevel ?? targetPiece.itemLevel;
          targetPiece.honingLevel = importedPiece.honingLevel;
          targetPiece.advancedRefiningLevel = importedPiece.advancedRefiningLevel;
          targetPiece.tierLabel = importedPiece.itemName;
        }
      });
    } catch (error: any) {
      setProfileSummary(null);
      setScanError(error?.message || "공식 전투정보실 정보를 읽지 못했어.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function onScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    patchPlanner((draft) => {
      draft.ocr.status = "uploaded";
      draft.ocr.screenshotName = file.name;
      draft.ocr.screenshotDataUrl = dataUrl;
      draft.ocr.extractedAt = Date.now();
      draft.ocr.notes = "스크린샷이 들어왔어. 검토안 만들기를 누르면 아래 폼 기준으로 정리해둘게.";
    });
    setScanError("");
    void runMaterialOcr(dataUrl);
    event.target.value = "";
  }

  async function fetchMarketPrices() {
    setMarketLoading(true);
    setMarketError("");
    try {
      const response = await fetch("/api/growth/market-prices");
      const data = (await response.json()) as MarketAutoFillResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "실시간 시세를 불러오지 못했어.");
      }
      setMarketSummary(data);
      setPlanner((prev) => ({
        ...prev,
        market: {
          ...prev.market,
          ...data.market,
        },
      }));
    } catch (error: any) {
      setMarketError(error?.message || "실시간 시세를 불러오지 못했어.");
    } finally {
      setMarketLoading(false);
    }
  }

  function applyOcrTemplate(templateKey: string) {
    patchPlanner((draft) => {
      draft.ocr.screenTemplateKey = templateKey;
      draft.ocr.fields = resolveTemplateFields(templateKey);
      draft.ocr.selectedFieldId = draft.ocr.fields[0]?.id ?? "";
    });
  }

  function markOcrReviewReady() {
    patchPlanner((draft) => {
      draft.ocr.status = "review";
      draft.ocr.notes = "장인의 기운과 현재 단계 재련 경험치는 기본값 0으로 두고, 마우스 오버로 확인한 값만 직접 입력해.";
    });
  }

  function stopScreenShare() {
    shareStreamRef.current?.getTracks().forEach((track) => track.stop());
    shareStreamRef.current = null;
    setScreenSharing(false);
    setLiveMaterialScan(false);
  }

  async function runMaterialOcr(dataUrl: string) {
    if (ocrBusyRef.current) return;
    const detectedIcons = detectInventoryMaterialIcons(dataUrl);
    const fields = ocrFieldsRef.current.filter((field) => MATERIAL_OCR_FIELD_MAP[field.id] || MARKET_OCR_FIELD_MAP[field.id]);
    if (!fields.length) {
      setMaterialScanStatus("읽을 재료 OCR 박스가 없어. 템플릿을 인게임 한 장으로 맞춰줘.");
      return;
    }

    ocrBusyRef.current = true;
    setMaterialScanRunning(true);
    setMaterialScanStatus("재료 숫자와 툴팁 보유 수량을 읽는 중이야.");

    try {
      const Tesseract = await import("tesseract.js");
      const results: Array<{ fieldId: string; label: string; value: number; raw: string }> = [];
      const tooltipResults: Array<{ fieldId: string; label: string; value: number; raw: string }> = [];

      try {
        const tooltipRecognized = await Tesseract.recognize(dataUrl, "kor+eng");
        const parsedTooltip = parseTooltipMaterialResults(tooltipRecognized.data.text);
        for (const item of parsedTooltip) {
          tooltipResults.push({
            fieldId: item.fieldId,
            label: item.label,
            value: item.value,
            raw: item.raw,
          });
        }
      } catch {
        // Korean tooltip OCR can fail if the language data is not cached; field OCR below still runs.
      }

      for (const field of fields) {
        const crop = await cropOcrField(dataUrl, field);
        if (!crop) continue;
        const recognized = await Tesseract.recognize(crop, "eng", {
          tessedit_char_whitelist: "0123456789,+.",
        } as any);
        const raw = recognized.data.text.trim();
        const value = parseOcrNumber(raw);
        if (value == null) continue;
        results.push({
          fieldId: field.id,
          label: ocrFieldLabel(field.id),
          value,
          raw,
        });
      }

      const mergedResults = [...results];
      for (const tooltipResult of tooltipResults) {
        const index = mergedResults.findIndex((item) => item.fieldId === tooltipResult.fieldId);
        if (index >= 0) mergedResults[index] = tooltipResult;
        else mergedResults.push(tooltipResult);
      }

      if (mergedResults.length) {
        setPlanner((prev) => {
          const next = cloneState(prev);
          for (const result of mergedResults) {
            const materialKey = MATERIAL_OCR_FIELD_MAP[result.fieldId];
            const tooltipKey = TOOLTIP_MATERIAL_RULES.find((rule) => rule.fieldId === result.fieldId)?.key;
            const marketKey = MARKET_OCR_FIELD_MAP[result.fieldId];
            if (materialKey) next.materials[materialKey] = result.value;
            if (tooltipKey) next.materials[tooltipKey] = result.value;
            if (marketKey) next.market[marketKey] = result.value;
          }
          next.ocr.status = "review";
          next.ocr.notes = "자동 스캔으로 값을 채웠어. 틀린 값은 아래 보유 재료에서 바로 수정하면 돼.";
          return next;
        });
        setLastMaterialScan(mergedResults);
        setMaterialScanStatus(`${mergedResults.length}개 값을 자동 입력했어. 툴팁 보유 수량도 같이 확인했어.${detectedIcons.length ? " 아이콘 후보도 감지했어." : ""}`);
      } else {
        setMaterialScanStatus("숫자를 못 읽었어. 툴팁이 크게 보이게 마우스를 올린 상태로 다시 캡처해줘. 그래도 안 되면 아래 검토 폼에서 직접 보정해줘.");
      }
    } catch (error: any) {
      setMaterialScanStatus(error?.message || "OCR 인식 중 문제가 생겼어.");
    } finally {
      ocrBusyRef.current = false;
      setMaterialScanRunning(false);
    }
  }
  async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 2500) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return true;

    await video.play().catch(() => undefined);
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      if (video.videoWidth > 0 && video.videoHeight > 0) return true;
      if ("requestVideoFrameCallback" in video) {
        await new Promise<void>((resolve) => {
          (video as HTMLVideoElement & { requestVideoFrameCallback: (callback: () => void) => number }).requestVideoFrameCallback(() => resolve());
        });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    }

    return video.videoWidth > 0 && video.videoHeight > 0;
  }
  async function captureSharedFrame(autoOcr = false) {
    const video = shareVideoRef.current;
    const canvas = shareCanvasRef.current;
    if (!video || !canvas) return false;
    if (!video.srcObject && shareStreamRef.current) {
      video.srcObject = shareStreamRef.current;
    }

    const ready = await waitForVideoFrame(video);
    if (!ready || !video.videoWidth || !video.videoHeight) {
      setScanError("공유 화면에서 아직 프레임을 가져오지 못했어. 게임 창을 선택한 뒤 1초 후 다시 눌러줘.");
      return false;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setScanError("캡처용 캔버스를 준비하지 못했어.");
      return false;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    patchPlanner((draft) => {
      draft.ocr.status = "uploaded";
      draft.ocr.screenshotName = "screen-share-frame";
      draft.ocr.screenshotDataUrl = dataUrl;
      draft.ocr.extractedAt = Date.now();
    });
    setScanError("");
    if (autoOcr) void runMaterialOcr(dataUrl);
    return true;
  }

  async function startScreenShare() {
    try {
      stopScreenShare();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 12, max: 24 },
        },
        audio: false,
      });
      shareStreamRef.current = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => stopScreenShare();
      });
      setScreenSharing(true);
      setLiveMaterialScan(true);
      setScanError("");
    } catch (error: any) {
      setScanError(error?.message || "화면 공유를 시작하지 못했어.");
    }
  }

  function setTableId(tableId: string) {
    const table = todoState.tables.find((item) => item.id === tableId);
    patchPlanner((draft) => {
      draft.character.tableId = table?.id ?? "";
      draft.character.tableName = table?.name ?? "";
      draft.character.charId = "";
      draft.character.characterName = "";
    });
  }

  function setCharacterId(charId: string) {
    patchPlanner((draft) => {
      draft.character.charId = charId;
      const table = todoState.tables.find((item) => item.id === draft.character.tableId);
      const character = table?.characters.find((item) => item.id === charId);
      if (character) {
        draft.character.characterName = character.name;
        if (!profileNickname.trim()) setProfileNickname(character.name);
      }
    });
  }

  function applyRaidGoldBasis(nextBasis: PlannerGoldBasis) {
    setRaidGoldBasis(nextBasis);
    if (isLinkedToTable) return;

    const currentIlvl = Number(planner.character.currentItemLevel || 0);
    const targetIlvl = Number(planner.character.targetItemLevel || 0);
    if (Number.isFinite(currentIlvl) && currentIlvl > 0) {
      setCurrentRaidSelections(buildPlannerRaidSelections(currentIlvl, getDefaultPlannerRaidPick(currentIlvl, nextBasis)));
    }
    if (Number.isFinite(targetIlvl) && targetIlvl > 0) {
      setTargetRaidSelections(buildPlannerRaidSelections(targetIlvl, getDefaultPlannerRaidPick(targetIlvl, nextBasis)));
    }
  }

  function toggleCurrentRaid(raidName: string) {
    setCurrentRaidSelections((prev) =>
      prev.map((row) => (row.raidName === raidName ? { ...row, goldEnabled: !row.goldEnabled } : row))
    );
  }

  function toggleCurrentRaidGold(raidName: string) {
    toggleCurrentRaid(raidName);
  }

  function setCurrentRaidDiff(raidName: string, diff: RaidDiffName) {
    setCurrentRaidSelections((prev) =>
      buildPlannerRaidSelections(planner.character.currentItemLevel, {
        raids: prev.map((item) => item.raidName),
        goldRaids: prev.filter((item) => item.goldEnabled).map((item) => item.raidName),
        diffs: Object.fromEntries(prev.map((item) => [item.raidName, item.raidName === raidName ? diff : item.diff])) as Record<
          string,
          RaidDiffName
        >,
      })
    );
  }

  function toggleTargetRaid(raidName: string) {
    setTargetRaidSelections((prev) =>
      prev.map((row) => (row.raidName === raidName ? { ...row, goldEnabled: !row.goldEnabled } : row))
    );
  }

  function toggleTargetRaidGold(raidName: string) {
    toggleTargetRaid(raidName);
  }

  function setTargetRaidDiff(raidName: string, diff: RaidDiffName) {
    setTargetRaidSelections((prev) => {
      const rebuilt = buildPlannerRaidSelections(planner.character.targetItemLevel, {
        raids: prev.map((item) => item.raidName),
        goldRaids: prev.filter((item) => item.goldEnabled).map((item) => item.raidName),
        diffs: Object.fromEntries(prev.map((item) => [item.raidName, item.raidName === raidName ? diff : item.diff])) as Record<
          string,
          RaidDiffName
        >,
      });
      return rebuilt;
    });
  }

  function renderRaidSelectionCard(
    title: string,
    hint: string,
    selections: PlannerRaidSelection[],
    totals: { tradableGold: number; boundGold: number; totalGold: number },
    editable: boolean,
    onToggle: (raidName: string) => void,
    onToggleGold: (raidName: string) => void,
    onSetDiff: (raidName: string, diff: RaidDiffName) => void
  ) {
    const selectedRows = selections.filter((row) => row.goldEnabled);
    const displayRows = selectedRows.length ? selectedRows : selections.slice(0, 3);

    return (
      <section className="growthCard raidPlanCard">
        <div>
          <h3 className="growthCardTitle small">{title}</h3>
          <p className="growthHint">{hint}</p>
        </div>
        <div className="raidCardControls">
          {title === "현재 주간 골드 기준" ? (
            <button
              type="button"
              className={`growthChip growthChipButton ${tradableOnlyEstimate ? "active" : ""}`}
              onClick={() => setTradableOnlyEstimate((value) => !value)}
            >
              유통 골드로만 계산
            </button>
          ) : null}
          {!isLinkedToTable ? (
            <>
              <button
                type="button"
                className={`growthChip growthChipButton ${raidGoldBasis === "total" ? "active" : ""}`}
                onClick={() => applyRaidGoldBasis("total")}
              >
                귀속골드 포함
              </button>
              <button
                type="button"
                className={`growthChip growthChipButton ${raidGoldBasis === "tradable" ? "active" : ""}`}
                onClick={() => applyRaidGoldBasis("tradable")}
              >
                귀속골드 포함 X
              </button>
            </>
          ) : null}
        </div>
        <div className="growthSummaryBox compactSummary">
          <div className="resultLabel">
            합계: 유통 {totals.tradableGold.toLocaleString()} / 귀속 {totals.boundGold.toLocaleString()} / 총{" "}
            {totals.totalGold.toLocaleString()}G
          </div>
        </div>
        {selections.length ? (
          <div className="raidSelectionCompact">
            <div className="raidChoiceChips" aria-label={`${title} 레이드 선택`}>
              {selections.map((row) => (
                <button
                  key={canonicalRaidName(row.raidName)}
                  type="button"
                  className={`growthChip growthChipButton ${row.goldEnabled ? "active" : ""}`}
                  onClick={() => onToggleGold(row.raidName)}
                  disabled={!editable}
                >
                  {row.raidName}
                </button>
              ))}
            </div>
            <div className="raidSelectionList compact">
              {displayRows.map((row) => (
                <div
                  key={canonicalRaidName(row.raidName)}
                  className={`raidSelectionRow compact ${row.goldEnabled ? "selected" : ""}`}
                >
                  <div className="raidSelectionMain">
                    <div className="raidSelectionHeader">
                      <div className="raidSelectionTitle">
                        <span>{row.raidName}</span>
                      </div>
                      <strong className="raidSelectionGold">{row.totalGold.toLocaleString()} G</strong>
                    </div>
                    <div className="raidSelectionMeta">
                      <div className="raidSelectionDiffs">
                        {row.availableDiffs.map((diff) => (
                          <button
                            key={`${row.raidName}-${diff}`}
                            type="button"
                            className={`growthChip growthChipButton ${row.diff === diff ? "active" : ""}`}
                            onClick={() => onSetDiff(row.raidName, diff)}
                            disabled={!editable}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                      <div className="raidSelectionStats">
                        유통 {row.tradableGold.toLocaleString()} / 귀속 {row.boundGold.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="growthEmpty">아이템레벨을 먼저 채우면 자동 추천 레이드가 보일 거야.</div>
        )}
      </section>
    );
  }

  function renderBonusRevenueCard(title: string, rows: BonusRewardRaidRow[], totals: ReturnType<typeof sumBonusRows>) {
    const renderRewardPriceInput = (key: keyof MarketPriceSnapshot, label: string) => (
      <label className="bonusRewardPriceInput">
        <span>{label}</span>
        <input
          type="number"
          min="0"
          value={planner.market[key] || 0}
          onChange={(event) => patchMarket(key, Number(event.target.value) || 0)}
        />
      </label>
    );

    return (
      <section className="growthCard raidBonusCard">
        <div>
          <h3 className="growthCardTitle small">{title}</h3>
          <p className="growthHint">선택된 골드 획득 레이드 기준으로 클리어 골드와 거래 가능 보조 재료 기대값을 같이 보여줘.</p>
        </div>
        <div className="bonusSummaryGrid">
          <div>
            <span>클리어 골드</span>
            <strong>{formatGold(totals.clearGold)}</strong>
          </div>
          <div>
            <span>거래가능 보조 재료</span>
            <strong>{formatGold(totals.tradableRewardGold)}</strong>
          </div>
          <div>
            <span>총 주간 가치</span>
            <strong>{formatGold(totals.totalGoldValue)}</strong>
          </div>
        </div>
        {rows.length ? (
          <div className="bonusRaidList">
            {rows.map((row) => (
              <details key={`${row.raidName}-${row.diff}`} className="bonusRaidRow">
                <summary>
                  <span>
                    <strong>{row.raidName}</strong>
                    <em>{row.diff}</em>
                  </span>
                  <b>{formatGold(row.totalGoldValue)}</b>
                </summary>
                <div className="bonusRewardList">
                  <div className="bonusRewardItem">
                    <span>클리어 골드</span>
                    <strong>{formatGold(row.clearGold)}</strong>
                  </div>
                  {row.rewards.map((reward) => (
                    <div key={reward.name} className="bonusRewardItem">
                      <span>
                        {reward.name} {reward.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {reward.unit}
                        {reward.expectedNote ? ` · ${reward.expectedNote}` : ""}
                        {reward.alternatives?.length ? (
                          <span className="bonusRewardBreakdown">
                            {reward.alternatives.map((alternative) => (
                              <span key={alternative.name} className="bonusRewardPriceChip">
                                <b>{alternative.name}</b>
                                {alternative.marketKey ? (
                                  renderRewardPriceInput(alternative.marketKey, "시세")
                                ) : (
                                  <em>{formatGold(alternative.price)}</em>
                                )}
                              </span>
                            ))}
                            <span>평균값: {formatGold(reward.valueGold)}</span>
                          </span>
                        ) : null}
                        {!reward.alternatives?.length && reward.marketKey ? (
                          <span className="bonusRewardBreakdown">{renderRewardPriceInput(reward.marketKey, "시세")}</span>
                        ) : null}
                      </span>
                      <strong>{formatGold(reward.valueGold)}</strong>
                    </div>
                  ))}
                  {!row.rewards.length ? (
                    <div className="bonusRewardItem">
                      <span>거래가능 보조 재료 추정 없음</span>
                      <strong>{formatGold(0)}</strong>
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="growthEmpty">골드 획득 레이드가 선택되면 부가 수익이 여기에 표시돼.</div>
        )}
        <div className="growthHint">
          수호석, 파괴석, 돌파석, 파편은 레이드 보상에서 캐릭터 귀속으로 보고 판매 가치에서 제외했어. 보조 재료 기대값은 아이템 사전/보상표 기준으로 계속 보정할 수 있어.
        </div>
      </section>
    );
  }
  const profileWarnings = profileSummary?.warnings ?? [];

  return (
    <div className="growthPage">
      <section className="growthHero">
        <div>
          <h2>성장 플래너</h2>
          <p>표 정보, 공식 전투정보실, 인게임 스캔을 섞어서 목표 레벨 비용과 회수 시점을 계산하는 화면이야.</p>
        </div>
        <div className="growthHeroMeta">
          <div>현재 캐릭터: {planner.character.characterName || "-"}</div>
          <div>OCR 상태: {formatStatus(planner.ocr.status)}</div>
          <div>추천 경로: {formatMode(planner.character.preferredMode)}</div>
        </div>
      </section>

      <div className="growthTopGrid">
        <section className="growthCard setupCard">
          <h3 className="growthCardTitle">대상 캐릭터</h3>
          <div className="growthFieldGrid">
            <label>
              <span>표 선택</span>
              <select value={planner.character.tableId} onChange={(event) => setTableId(event.target.value)}>
                <option value="">표 연동 안 함</option>
                {todoState.tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>캐릭터 선택</span>
              <select
                value={planner.character.charId}
                onChange={(event) => setCharacterId(event.target.value)}
                disabled={!planner.character.tableId}
              >
                <option value="">캐릭터 선택</option>
                {(selectedTable?.characters ?? []).map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="growthInlineActions">
            <button type="button" className="growthAction" onClick={() => void applyCharacterFromTable()} disabled={!isLinkedToTable || profileLoading}>
              {profileLoading ? "공식 정보 확인 중..." : "현재 표 정보 불러오기"}
            </button>
            <button type="button" className="growthAction secondary" onClick={clearTableBinding}>
              표 연동 해제
            </button>
          </div>
          <label>
            <span>직접 입력 캐릭터 이름</span>
            <input
              value={planner.character.characterName}
              onChange={(event) => patchCharacter({ characterName: event.target.value })}
              placeholder="표에 없는 캐릭터 이름도 입력 가능"
            />
          </label>
          <div className="goalQuickGrid">
            <label>
              <span>현재 아이템레벨</span>
              <input
                type="number"
                step="0.01"
                value={planner.character.currentItemLevel || ""}
                onChange={(event) => patchCharacter({ currentItemLevel: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              <span>목표 아이템레벨</span>
              <input
                type="number"
                step="0.01"
                value={planner.character.targetItemLevel || ""}
                onChange={(event) => patchCharacter({ targetItemLevel: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              <span>현재 주간 골드</span>
              <input type="number" value={planner.character.currentWeeklyGold || 0} readOnly />
            </label>
            <label>
              <span>목표 달성 후 주간 골드</span>
              <input type="number" value={planner.character.targetWeeklyGold || 0} readOnly />
            </label>
            <label>
              <span>현재 주간 귀속골드</span>
              <input
                type="number"
                value={planner.character.currentWeeklyBoundGold || ""}
                onChange={(event) => patchCharacter({ currentWeeklyBoundGold: Number(event.target.value) || 0 })}
                placeholder="예: 54000"
              />
            </label>
            <label>
              <span>추천 경로</span>
              <select
                value={planner.character.preferredMode}
                onChange={(event) => patchCharacter({ preferredMode: event.target.value as RefiningMode })}
              >
                <option value="hybrid">일반/상급 혼합</option>
                <option value="normal">일반 재련 우선</option>
                <option value="advanced">상급 재련 우선</option>
              </select>
            </label>
            <button
              type="button"
              className="growthAction goalCalculateButton"
              onClick={() => document.querySelector(".routePanel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              계산 결과 보기
            </button>
          </div>
          <div className="kloaBox">
            <h3 className="growthCardTitle small">공식 전투정보실로 불러오기</h3>
            <p className="growthHint">아이템레벨과 장비 강화 정보를 우선 채우고, 부족한 값은 아래에서 보정하면 돼.</p>
            <div className="growthInlineActions">
              <input
                value={profileNickname}
                onChange={(event) => setProfileNickname(event.target.value)}
                placeholder="캐릭터 닉네임"
              />
              <button type="button" className="growthAction" onClick={importFromProfile} disabled={profileLoading}>
                {profileLoading ? "불러오는 중..." : "공식 페이지로 불러오기"}
              </button>
            </div>
            {profileSummary ? (
              <div className="growthSummaryBox">
                <div>마지막 불러오기: {profileSummary.nickname} / {formatDateTime(profileSummary.fetchedAt)}</div>
                <div>사용 소스: {profileSummary.source === "official" ? "공식 전투정보실" : "KLOA 보조"}</div>
                <div>아이템레벨: {profileSummary.currentItemLevel?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-"}</div>
                <div className="growthChipRow">
                  {profileSummary.pieces.map((piece) => (
                    <span key={piece.slot} className="growthChip">
                      {SLOT_NAMES[piece.slot]} {piece.itemLevel ? `Lv.${piece.itemLevel} ` : ""}+{piece.honingLevel} x{piece.advancedRefiningLevel}
                    </span>
                  ))}
                </div>
                {profileWarnings.length ? (
                  <div className="growthWarningList">
                    {profileWarnings.map((warning) => (
                      <span key={warning} className="growthChip">
                        {warning}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <details className="growthDetails scanDetails" open>
          <summary className="growthDetailsSummary">스캔</summary>
          <section className="growthCard compact scanCard">
          <p className="growthHint">스캔 시작을 누르면 화면공유 창이 뜨고, 현재 프레임을 바로 캡처해 아래 검토 폼으로 넘길 수 있어.</p>
          <div className="growthCompactBar">
            <label className="growthTemplateField">
              <span>OCR 템플릿</span>
              <select value={planner.ocr.screenTemplateKey} onChange={(event) => applyOcrTemplate(event.target.value)}>
                {OCR_SCREEN_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {templateLabel(template.key)}
                  </option>
                ))}
              </select>
            </label>
            <div className="growthInlineActions">
              <button type="button" className="growthAction" onClick={startScreenShare}>
                스캔 시작
              </button>
              <button type="button" className="growthAction secondary" onClick={() => void captureSharedFrame(true)} disabled={!screenSharing}>
                현재 화면 가져오기
              </button>
              <button type="button" className="growthAction secondary" onClick={stopScreenShare} disabled={!screenSharing}>
                스캔 종료
              </button>
                            <button
                type="button"
                className={`growthAction secondary ${liveMaterialScan ? "active" : ""}`}
                onClick={() => setLiveMaterialScan((value) => !value)}
                disabled={!screenSharing}
              >
                {liveMaterialScan ? "실시간 재료 스캔 중" : "실시간 재료 스캔"}
              </button><label className="growthAction secondary growthUploadButton">
                스크린샷 올리기
                <input type="file" accept="image/*" onChange={(event) => void onScreenshotChange(event)} />
              </label>
            </div>
          </div>
          <div className="scanWorkspace">
            <div className="scanPreviewPanel">
              <video
                ref={shareVideoRef}
                className="growthPreview live"
                autoPlay
                muted
                playsInline
                style={{ display: screenSharing && !planner.ocr.screenshotDataUrl ? "block" : "none" }}
              />
                {planner.ocr.screenshotDataUrl ? (
                <div ref={previewFrameRef} className="growthPreviewFrame compact">
                  <img src={planner.ocr.screenshotDataUrl} alt="OCR preview" className="growthPreview" />
                </div>
              ) : !screenSharing ? (
                <div className="scanEmpty">공유 화면 프레임이나 스크린샷이 들어오면 여기에 보여줄게.</div>
              ) : null}
              <canvas ref={shareCanvasRef} className="screenCaptureCanvas" />
            </div>
            <div className="scanInfoPanel">
              <div>
                <h3 className="growthCardTitle small">빠른 안내</h3>
                <p className="growthHint">1. 게임 창을 선택해 공유</p>
                <p className="growthHint">2. 자동 캡처된 화면을 확인</p>
                <p className="growthHint">3. 아래 OCR 검토 폼에서 값만 빠르게 정리</p>
              </div>
              {scanError ? <div className="growthError">{scanError}</div> : null}
                            {materialScanStatus ? (
                <div className={`scanStatus ${materialScanRunning ? "running" : ""}`}>
                  {materialScanRunning ? "OCR 실행 중 · " : ""}
                  {materialScanStatus}
                </div>
              ) : null}
              {lastMaterialScan.length ? (
                <div className="scanResultList">
                  {lastMaterialScan.map((item) => (
                    <div key={item.fieldId} className="scanResultItem">
                      <span>{item.label}</span>
                      <strong>{item.value.toLocaleString()}</strong>
                      <small>{item.raw || "-"}</small>
                    </div>
                  ))}
                </div>
              ) : null}<div className="growthHint">{templateDescription(planner.ocr.screenTemplateKey)}</div>
              <button type="button" className="growthAction" onClick={markOcrReviewReady}>
                OCR 검토안 만들기
              </button>
            </div>
          </div>
          <div className="growthHint">
            {profileSummary
              ? "공식 전투정보실 기준으로 아이템레벨과 장비 강화 정보를 채웠어. 장인의 기운과 현재 단계 재련 경험치는 직접 보정하면 돼."
              : "거래소 시세 화면을 제외하면 보통 인게임 한 장만 올리면 돼."}
          </div>
          </section>
        </details>

        <details className="growthDetails topOcrDetails">
          <summary className="growthDetailsSummary">고급 OCR 좌표 편집</summary>
          <div className="growthCard compact">
            <div className="ocrDesignerGrid">
              <div className="ocrFieldList">
                {planner.ocr.fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className={`ocrFieldItem ${planner.ocr.selectedFieldId === field.id ? "active" : ""}`}
                    onClick={() => patchPlanner((draft) => void (draft.ocr.selectedFieldId = field.id))}
                  >
                    <strong>{ocrFieldLabel(field.id)}</strong>
                    <span>{field.description}</span>
                  </button>
                ))}
              </div>
              <div className="ocrFieldEditor">
                {selectedOcrField ? (
                  <>
                    <div className="growthCardTitle small">{ocrFieldLabel(selectedOcrField.id)}</div>
                    <div className="growthFieldGrid">
                      <label>
                        <span>X</span>
                        <input
                          type="number"
                          step="0.001"
                          value={selectedOcrField.x}
                          onChange={(event) => patchOcrField(selectedOcrField.id, { x: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <input
                          type="number"
                          step="0.001"
                          value={selectedOcrField.y}
                          onChange={(event) => patchOcrField(selectedOcrField.id, { y: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>너비</span>
                        <input
                          type="number"
                          step="0.001"
                          value={selectedOcrField.width}
                          onChange={(event) => patchOcrField(selectedOcrField.id, { width: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>높이</span>
                        <input
                          type="number"
                          step="0.001"
                          value={selectedOcrField.height}
                          onChange={(event) => patchOcrField(selectedOcrField.id, { height: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="growthHint">{selectedOcrField.description}</div>
                  </>
                ) : (
                  <div className="growthEmpty">필드를 선택하면 좌표를 편집할 수 있어.</div>
                )}
              </div>
            </div>
          </div>
        </details>

      </div>

      <div className="plannerWorkLayout">
        <aside className="plannerSideColumn">
        <section className="growthCard resourceTabsCard">
        <div className="resourceTabsHeader">
          <h3 className="growthCardTitle">보유 재료</h3>
          <div className="resourceTabs">
            <button type="button" className={resourceTab === "materials" ? "active" : ""} onClick={() => setResourceTab("materials")}>
              보유 재료
            </button>
            <button type="button" className={resourceTab === "market" ? "active" : ""} onClick={() => setResourceTab("market")}>
              거래소 시세
            </button>
          </div>
        </div>

        {resourceTab === "materials" ? (
          <div className="materialPairList">
            {MATERIAL_FIELD_GROUPS.map((group) => (
              <div key={group.map(([key]) => key).join("-")} className="materialPairRow">
                {group.map(([key, label]) => {
                  const canTreatAsBound = Boolean(TRADABLE_AS_BOUND_PAIRS[key]);
                  return (
                  <label key={key} className={canTreatAsBound ? "materialTreatAsBoundField" : ""}>
                    <span className="materialInputHeader">
                      <span>{label}</span>
                      {canTreatAsBound ? (
                        <span className="materialBoundCheck" title="체크하면 이 재료는 충분히 있다고 보고 구매 비용을 0으로 계산해.">
                          <input
                            type="checkbox"
                            checked={Boolean(tradableAsBound[key])}
                            onChange={(event) => setTradableAsBound((prev) => ({ ...prev, [key]: event.target.checked }))}
                          />
                          귀속
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      value={planner.materials[key] || 0}
                      onChange={(event) => patchMaterials(key, Number(event.target.value) || 0)}
                    />
                  </label>
                  );
                })}
              </div>
            ))}
            <div className="cathedralExchangeBox">
              <div className="cathedralExchangeHeader">
                <strong>성당 교환</strong>
                <span>은총 10개 기준으로 현재 목표 경로에서 가장 비싼 부족 보조재료부터 교환해 계산에 반영해.</span>
              </div>
              <div className="cathedralExchangeControls">
                <label>
                  <span>성당 단계</span>
                  <select value={cathedralStage} onChange={(event) => setCathedralStage(event.target.value as CathedralStage)}>
                    <option value="none">안 감</option>
                    <option value="1">1단계</option>
                    <option value="2">2단계</option>
                    <option value="3">3단계</option>
                  </select>
                </label>
                <label className="cathedralCheck">
                  <input type="checkbox" checked={cathedralExtraReward} onChange={(event) => setCathedralExtraReward(event.target.checked)} />
                  <span>더보기 포함</span>
                </label>
              </div>
              <div className="cathedralExchangeSummary">
                <span>이번 주 수급 {formatCount(cathedralExchangePlan.weeklyFragments)}개</span>
                <span>계산 파편 {formatCount(cathedralExchangePlan.totalFragments)}개</span>
                <span>교환 가능 {formatCount(cathedralExchangePlan.exchangeCount)}회</span>
              </div>
              {cathedralExchangePlan.entries.length ? (
                <div className="cathedralExchangeResult">
                  <strong>추천 교환</strong>
                  {cathedralExchangePlan.entries.map((entry) => (
                    <div key={entry.key}>
                      <span>{entry.label}</span>
                      <b>{formatCount(entry.amount)}개</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="growthHint">현재 목표 경로에서 은총 교환으로 대체할 부족 보조재료가 없어.</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="growthInlineActions">
              <button type="button" className="growthAction" onClick={fetchMarketPrices} disabled={marketLoading}>
                {marketLoading ? "불러오는 중..." : "실시간 시세 불러오기"}
              </button>
              <span className="growthHint">아이스펭 시세를 우선 사용하고, 실패하면 LOAGAP으로 대체해.</span>
            </div>
            {marketError ? <div className="growthError">{marketError}</div> : null}
            <div className="growthFieldGrid compactInputs">
              {visibleMarketLabels.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={planner.market[key] || 0}
                    onChange={(event) => patchMarket(key, Number(event.target.value) || 0)}
                  />
                </label>
              ))}
            </div>
            {marketSummary ? (
              <div className="growthSummaryBox">
                <div>마지막 시세 불러오기: {formatDateTime(marketSummary.fetchedAt)}</div>
                <div>소스: {marketSummary.source}</div>
                {marketSummary.lastUpdatedAt ? <div>원본 갱신 시각: {marketSummary.lastUpdatedAt}</div> : null}
                {marketSummary.debug ? <div>읽은 아이템 수: {marketSummary.debug.parsedItemCount}</div> : null}
                {marketSummary.items.length ? (
                  <div className="marketItemGrid">
                    {marketSummary.items.map((item) => (
                      <label key={item.name} className="marketItemEditor">
                        <span>{item.name}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={resolveMarketItemPrice(item)}
                          onChange={(event) => patchMarketItemPrice(item, Number(event.target.value) || 0)}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {marketSummary.notes.length ? (
                  <div className="growthHint">
                    {marketSummary.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

    

        </aside>
        <main className="plannerMainColumn">

      <div className="plannerCoreGrid">
        <section className="growthCard equipmentStateCard">
          <h3 className="growthCardTitle">장비 상태</h3>
          <div className="pieceAccordionList">
            {SLOT_ORDER.map((slot) => {
              const piece = planner.character.pieces.find((entry) => entry.slot === slot);
              if (!piece) return null;
              const summary = buildPieceSummary(piece);
              const displayItemLevel = deriveEquipmentItemLevel(piece);
              return (
                <details key={piece.slot} className="pieceAccordion">
                  <summary className="pieceAccordionSummary">
                    <div className="pieceAccordionHeading">
                      <strong>{SLOT_NAMES[piece.slot]}</strong>
                      <span className="pieceDivider">-</span>
                      <span className="pieceName">{summary.name}</span>
                      {summary.tier ? <span className="pieceTier">{summary.tier}</span> : null}
                    </div>
                    <div className="pieceAccordionMeta">
                      {displayItemLevel ? <span>Lv.{displayItemLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> : null}
                      <span>+{piece.honingLevel || 0}</span>
                      <span>x{piece.advancedRefiningLevel || 0}</span>
                    </div>
                  </summary>

                  <div className="pieceCard compact">
                    <div className="pieceCompactFields">
                      <label>
                        <span>장비 이름 / 티어</span>
                        <input value={piece.tierLabel} onChange={(event) => patchPiece(piece.slot, { tierLabel: event.target.value })} />
                      </label>
                      <label>
                        <span>장비 아이템레벨</span>
                        <input
                          type="number"
                          step="0.01"
                          value={piece.itemLevel || displayItemLevel || 0}
                          onChange={(event) => patchPiece(piece.slot, { itemLevel: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label>
                        <span>강화 단계</span>
                        <input
                          type="number"
                          value={piece.honingLevel || 0}
                          onChange={(event) => patchPiece(piece.slot, { honingLevel: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label>
                        <span>상급 재련</span>
                        <input
                          type="number"
                          value={piece.advancedRefiningLevel || 0}
                          onChange={(event) => patchPiece(piece.slot, { advancedRefiningLevel: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label>
                        <span>장인의 기운</span>
                        <input
                          type="number"
                          step="0.01"
                          value={piece.artisanEnergy || 0}
                          onChange={(event) => patchPiece(piece.slot, { artisanEnergy: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label>
                        <span>현재 재련 경험치</span>
                        <input
                          type="number"
                          value={piece.currentRefiningExp || 0}
                          onChange={(event) => patchPiece(piece.slot, { currentRefiningExp: Number(event.target.value) || 0 })}
                        />
                      </label>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <details className="growthDetails routePanel" open>
          <summary className="growthDetailsSummary">추천 강화순서</summary>
          <section className="growthCard compact routePanelInner">
          {displayRouteSteps.length ? (
            <>
              <div className="compactRouteList">
                {displayRouteSteps.map((step, index) => (
                  <button
                    key={`${step.slot}-${step.action}-${step.fromLevel}-${step.toLevel}-${index}`}
                    type="button"
                    className={`compactRouteItem ${selectedRouteStep === step ? "active" : ""}`}
                    onClick={() => setSelectedRouteIndex(index)}
                  >
                    <span>
                      {index + 1}. {step.slotLabel} - {step.itemName}
                    </span>
                    <strong>{formatRouteAction(step)}</strong>
                    <em>{formatGold(step.averageCost)}</em>
                  </button>
                ))}
              </div>
              {selectedRouteStep ? (
                <div className="routeMaterialPreview">
                  <div className="routeMaterialHeader">
                    <strong>
                      {selectedRouteIndex + 1}. {selectedRouteStep.slotLabel}
                    </strong>
                    <span>{formatRouteAction(selectedRouteStep)}</span>
                  </div>
                  <div className="routeUsageList">
                    <div className="routeUsageRow routeUsageGold">
                      <span>누르는 골드</span>
                      <strong>{formatGold(selectedRouteStep.directGold)}</strong>
                    </div>
                    {selectedRouteUsageRows.map((row) => (
                      <div className="routeUsageRow" key={row.key}>
                        <div className="routeUsageTitle">
                          <strong>{row.label}</strong>
                          <span>필요 {formatCount(row.required)}개</span>
                        </div>
                        <div className="routeUsageParts">
                          {row.boundUsed > 0 ? (
                            <span>
                              {row.singleInventoryLabel || "귀속"} {formatCount(row.boundUsed)}개
                            </span>
                          ) : null}
                          {row.tradableUsed > 0 ? <span>거래 가능 {formatCount(row.tradableUsed)}개</span> : null}
                          {row.purchaseNeeded > 0 ? <span>추가 구매 {formatCount(row.purchaseNeeded)}개</span> : null}
                        </div>
                      </div>
                    ))}
                    {selectedRouteSupportGuides.length ? (
                      <div className="routeSupportGuide">
                        <strong>보조 재료 투입 타이밍</strong>
                        {selectedRouteSupportGuides.map((guide, index) => (
                          <p key={`${guide}-${index}`}>{guide}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="growthEmpty">목표 레벨을 올리면 추천 순서가 여기에 표시돼.</div>
          )}
          </section>
        </details>
      </div>

      <div className="plannerBottomGrid">
      <section className="growthCard estimateResultCard">
        <h3 className="growthCardTitle">추정 결과</h3>
        <div className="resultHero">
          <div className="resultCard">
            <span className="resultLabel">총 추정 지출</span>
            <div className="resultValue">{formatGold(displayedTotalSpendGold)}</div>
          </div>
          <div className="resultCard">
            <span className="resultLabel">회수 예상</span>
            <div className="resultValue">{selectedWaitPaybackWeeks == null ? "-" : `${selectedWaitPaybackWeeks.toLocaleString()}주`}</div>
          </div>
        </div>
        <div className="resultGrid">
          <div className="resultCard">
            <span className="resultLabel">총 누르는 골드</span>
            <strong>{formatGold(estimate.directGoldCost)}</strong>
          </div>
          <div className="resultCard">
            <span className="resultLabel">추가 재료 구매</span>
            <strong>{formatGold(displayMaterialPurchaseCost)}</strong>
          </div>
          <div className="resultCard">
            <span className="resultLabel">귀속 절감 추정</span>
            <strong>{formatGold(estimate.boundMaterialOffset)}</strong>
          </div>
          <div className="resultCard">
            <span className="resultLabel">주간 추가 골드</span>
            <strong>{formatGold(estimate.additionalWeeklyGold)}</strong>
          </div>
        </div>
        <div className="recommendGrid">
          <div className="recommendBox">
            <div className="resultLabel">지금 바로 올릴 때</div>
            <div className="resultList">
              <div>귀속골드 사용: {formatGold(estimate.boundGoldUsableNow)}</div>
              <div>유통골드 필요: {formatGold(estimate.tradableGoldNeededNow)}</div>
              <div>귀속골드만으로 직접골드 충당: {estimate.boundGoldAffordableWeeks == null ? "-" : `${estimate.boundGoldAffordableWeeks}주`}</div>
            </div>
          </div>
          <div className="recommendBox">
            <div className="resultLabel">추천 대기 시점</div>
            <div className="resultList">
              <label className="waitWeekControl">
                <span>대기 주차</span>
                <input
                  type="number"
                  min="0"
                  value={selectedWaitWeeks}
                  onChange={(event) => setSelectedWaitWeeks(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>
              <div>추천 대기 주차: {estimate.recommendedWaitWeeks}주</div>
              <div>귀속골드 사용: {formatGold(selectedWaitBoundGoldUse)}</div>
              <div>대기 중 모은 유통골드: {formatGold(selectedWaitTradableGoldSaved)}</div>
              <div>유통골드 사용: {formatGold(selectedWaitTradableGoldUse)}</div>
            </div>
          </div>
        </div>
        {requiredMaterialCards.length ? (
          <div className="resultMaterialTable">
            {requiredMaterialCards.map((row) => (
              <div className="resultCard" key={row.label}>
                <span className="resultLabel">{row.label}</span>
                <strong>{formatCount(row.value)}개</strong>
                {row.detail ? <small className="resultMaterialDetail">{row.detail}</small> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="growthEmpty">목표 경로에서 소모되는 재료가 없으면 여기는 비워져.</div>
        )}
      </section>
      <section className="growthCard weeklyRewardTabsCard">
        <div className="resourceTabsHeader">
          <h3 className="growthCardTitle">주간 보상</h3>
          <div className="resourceTabs">
            <button type="button" className={weeklyRewardTab === "gold" ? "active" : ""} onClick={() => setWeeklyRewardTab("gold")}>
              골드 기준
            </button>
            <button type="button" className={weeklyRewardTab === "bonus" ? "active" : ""} onClick={() => setWeeklyRewardTab("bonus")}>
              부가 수익
            </button>
          </div>
        </div>
        {weeklyRewardTab === "gold" ? (
          <div className="raidPlanGrid">
            {renderRaidSelectionCard(
              "현재 주간 골드 기준",
              isLinkedToTable
                ? "표에 저장된 현재 캐릭터의 레이드 선택 기준으로 자동 계산돼."
                : "표에 없는 캐릭터라 현재 레벨 기준 상위 골드 3개를 기본값으로 넣어뒀어. 여기서 직접 수정하면 돼.",
              currentRaidSelections,
              currentRaidGold,
              true,
              toggleCurrentRaid,
              toggleCurrentRaidGold,
              setCurrentRaidDiff
            )}

            {renderRaidSelectionCard(
              "목표 달성 후 주간 골드 기준",
              "목표 아이템레벨 기준으로 가장 골드가 높은 레이드 3개를 자동으로 잡아두고, 난이도/포함 여부를 바로 수정할 수 있어.",
              targetRaidSelections,
              targetRaidGold,
              true,
              toggleTargetRaid,
              toggleTargetRaidGold,
              setTargetRaidDiff
            )}
          </div>
        ) : (
          <div className="raidPlanGrid">
            {renderBonusRevenueCard("현재 레이드 부가 수익", currentBonusRows, currentBonusTotal)}
            {renderBonusRevenueCard("목표 달성 후 부가 수익", targetBonusRows, targetBonusTotal)}
          </div>
        )}
      </section>
      </div>
        </main>
      </div>
    </div>
  );
}



