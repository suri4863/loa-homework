import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import "./GrowthPlannerPage.css";
import { useDeferredValue } from "react";
import { DEFAULT_TODO_STATE, type Character, type TodoTable } from "../store/todoStore";
import {
  estimateGrowthPlan,
  estimateRefiningStep,
  makeEmptyPlannerState,
  type EquipmentSlot,
  type ConfirmedUpgrade,
  type GrowthPlannerState,
  type MaterialFamily,
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
const CHARACTER_MATERIALS_STORAGE_PREFIX = "loa-growth-planner:character-materials:v1";
const COMBAT_STORAGE_KEY = "loa-growth-combat-target:v1";
const GOLD_CASH_RATE_STORAGE_KEY = "loa-growth-gold-cash-rate:v1";
const ACCESSORY_PRICE_QUERY_VERSION = "buy-price-high-options-v2";

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
  combatPower: number | null;
  className?: string | null;
  combatDetails?: {
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
  };
  combatSystems?: {
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
  } | null;
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

type GemAuctionPriceResponse = {
  ok: boolean;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  pricesByLevel: Record<string, number>;
  typePricesByLevel?: Record<string, Record<string, number>>;
  items?: Array<{
    level: number;
    type: string;
    itemName: string;
    buyPrice: number;
  }>;
  warnings?: string[];
  error?: string;
  detail?: string;
};

type AccessoryAuctionPriceResponse = {
  ok: boolean;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  queryVersion?: string;
  minQuality: number;
  pricesByPart: Record<string, number>;
  targetsByPart?: Record<
    string,
    {
      part: string;
      target: string;
      itemName: string;
      grade?: string;
      quality: number;
      buyPrice: number;
      options: string[];
    }
  >;
  candidatesByPart?: Record<
    string,
    Array<{
      part: string;
      target: string;
      itemName: string;
      grade?: string;
      quality: number;
      buyPrice: number;
      options: string[];
    }>
  >;
  items?: Array<{
    part: string;
    target: string;
    itemName: string;
    grade?: string;
    quality: number;
    buyPrice: number;
    options: string[];
  }>;
  warnings?: string[];
  error?: string;
  detail?: string;
};

type EngravingMarketPriceResponse = {
  ok: boolean;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  grade: string;
  pricesByName: Record<string, number>;
  itemsByName?: Record<
    string,
    {
      name: string;
      grade: string;
      itemName: string;
      currentMinPrice: number;
      recentPrice: number;
      yDayAvgPrice: number;
    }
  >;
  missingNames?: string[];
  error?: string;
  detail?: string;
};

type AvatarMarketPriceResponse = {
  ok: boolean;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  className: string;
  targetGrade: string;
  pricesBySlot: Record<string, number>;
  itemsBySlot?: Record<
    string,
    {
      slot: string;
      className: string;
      targetGrade: string;
      itemName: string;
      itemId: number;
      currentMinPrice: number;
      recentPrice: number;
      yDayAvgPrice: number;
    }
  >;
  missingSlots?: string[];
  warnings?: string[];
  error?: string;
  detail?: string;
};

type PlannerModeTab = "level" | "combat";

type CombatCategory = "장비" | "아바타" | "악세" | "팔찌" | "보석" | "각인" | "아크그리드" | "아크패시브";

type CombatUpgradeOption = {
  id: string;
  name: string;
  category: string;
  detail: string;
  fromTo: string;
  availableSteps: number;
  costPerStep: number;
  combatGainPercentPerStep: number;
};

type CombatEquipmentInput = {
  slot: EquipmentSlot;
  enabled: boolean;
  baseHoning?: number;
  currentHoning: number;
  targetHoning: number;
  baseAdvanced?: number;
  currentAdvanced: number;
  targetAdvanced: number;
  normalCostPerStep: number;
  advancedCostPerStep: number;
  normalGainPercent: number;
  advancedGainPercent: number;
};

type CombatGemInput = {
  id: string;
  skillName: string;
  gemType: string;
  bound: boolean;
  baseLevel?: number;
  currentLevel: number;
  targetLevel: number;
  costPerLevel: number;
  gainPercentPerLevel: number;
};

type CombatToggleInput = {
  enabled: boolean;
  currentLabel: string;
  targetLabel: string;
  cost: number;
  gainPercent: number;
};

type CombatEngravingInput = {
  name: string;
  grade: string;
  level: number;
  targetGrade: string;
  targetLevel: number;
  enabled: boolean;
  pricePerBook: number;
  missingBooks: number;
  gainPercent: number;
};

type CombatAvatarInput = {
  id: string;
  slot: string;
  name: string;
  grade: string;
  targetGrade: string;
  enabled: boolean;
  cost: number;
  gainPercent: number;
};

type CombatProfileInputs = {
  equipment: CombatEquipmentInput[];
  gems: CombatGemInput[];
  gemPricesByLevel: Record<string, number>;
  gemPriceFetchedAt: string;
  accessoryPricesByPart: Record<string, number>;
  accessoryPriceFetchedAt: string;
  accessoryPriceQueryVersion?: string;
  accessoryTargetsByPart?: AccessoryAuctionPriceResponse["targetsByPart"];
  accessoryCandidatesByPart?: AccessoryAuctionPriceResponse["candidatesByPart"];
  engravingItems: CombatEngravingInput[];
  engravingPricesByName: Record<string, number>;
  engravingPriceFetchedAt: string;
  avatarPriceFetchedAt: string;
  avatarPriceItemsBySlot?: AvatarMarketPriceResponse["itemsBySlot"];
  accessoryItems?: Array<{ name: string; quality?: number; effects: string[] }>;
  braceletItems?: Array<{ name: string; quality?: number; effects: string[] }>;
  avatarItems: CombatAvatarInput[];
  avatar: CombatToggleInput;
  accessory: CombatToggleInput;
  bracelet: CombatToggleInput;
  engraving: CombatToggleInput;
  arkGrid: CombatToggleInput;
  arkPassive: CombatToggleInput;
};

type CombatPlannerState = {
  currentCombatPower: number;
  targetCombatPower: number;
  levelGrowthCombatPercent: number;
  enabledCategories: Record<CombatCategory, boolean>;
  profile: CombatProfileInputs;
  options: CombatUpgradeOption[];
};

type CombatPlanPick = {
  option: CombatUpgradeOption;
  count: number;
  totalCost: number;
  totalGainPercent: number;
};

const COMBAT_CATEGORIES: CombatCategory[] = ["장비", "아바타", "악세", "팔찌", "보석", "각인", "아크그리드", "아크패시브"];
const GEM_PRICE_LEVELS = [5, 6, 7, 8, 9, 10];
const GEM_TYPE_OPTIONS = ["겁화", "작열", "멸화", "홍염", "보석"];
const GEM_LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const AVATAR_TARGET_SLOTS = ["무기", "머리", "상의", "하의"];
const AVATAR_GRADE_OPTIONS = ["영웅", "전설", "스페셜", "현재 유지"];
const AVATAR_GRADE_RANK: Record<string, number> = {
  미착용: 0,
  미확인: 0,
  영웅: 1,
  전설: 2,
  스페셜: 3,
};
const T4_GEM_COMBAT_GAIN_BY_LEVEL: Record<number, number> = {
  1: 0.64,
  2: 1.28,
  3: 1.92,
  4: 2.56,
  5: 3.2,
  6: 3.84,
  7: 4.48,
  8: 5.12,
  9: 5.76,
  10: 6.4,
};

function makeDefaultCombatCategoryFlags(): Record<CombatCategory, boolean> {
  return Object.fromEntries(COMBAT_CATEGORIES.map((category) => [category, !["팔찌", "아크그리드", "아크패시브"].includes(category)])) as Record<CombatCategory, boolean>;
}

const DEFAULT_COMBAT_OPTIONS: CombatUpgradeOption[] = [
  {
    id: "helmet-adv-38-40",
    name: "투구 상급재련 38 -> 40",
    category: "장비",
    detail: "일반 - 장인의 재봉술 : 4단계 | 선조턴 - 장인의 재봉술 : 4단계 | 강화선조턴 - 장인의 재봉술 : 4단계",
    fromTo: "상급재련 38 -> 40",
    availableSteps: 1,
    costPerStep: 47000,
    combatGainPercentPerStep: 0.95,
  },
  {
    id: "gem-guardian-6-7-bound",
    name: "가디언 피어 겁화 보석 (귀속) 6 -> 7",
    category: "보석",
    detail: "6Lv -> 7Lv",
    fromTo: "6Lv -> 7Lv",
    availableSteps: 1,
    costPerStep: 121000,
    combatGainPercentPerStep: 0.56,
  },
  {
    id: "gem-frenzy-6-7-bound",
    name: "프렌지 스윕 겁화 보석 (귀속) 6 -> 7",
    category: "보석",
    detail: "6Lv -> 7Lv",
    fromTo: "6Lv -> 7Lv",
    availableSteps: 1,
    costPerStep: 121000,
    combatGainPercentPerStep: 0.56,
  },
  {
    id: "gem-guillotine-6-7-bound",
    name: "길로틴 스핀 겁화 보석 (귀속) 6 -> 7",
    category: "보석",
    detail: "6Lv -> 7Lv",
    fromTo: "6Lv -> 7Lv",
    availableSteps: 1,
    costPerStep: 121000,
    combatGainPercentPerStep: 0.56,
  },
  {
    id: "gem-guardian-7-8",
    name: "가디언 피어 겁화 보석 7 -> 8",
    category: "보석",
    detail: "7Lv -> 8Lv",
    fromTo: "7Lv -> 8Lv",
    availableSteps: 1,
    costPerStep: 120000,
    combatGainPercentPerStep: 0.66,
  },
  {
    id: "gem-guillotine-7-8",
    name: "길로틴 스핀 겁화 보석 7 -> 8",
    category: "보석",
    detail: "7Lv -> 8Lv",
    fromTo: "7Lv -> 8Lv",
    availableSteps: 1,
    costPerStep: 120000,
    combatGainPercentPerStep: 0.66,
  },
  {
    id: "gem-frenzy-7-8",
    name: "프렌지 스윕 겁화 보석 7 -> 8",
    category: "보석",
    detail: "7Lv -> 8Lv",
    fromTo: "7Lv -> 8Lv",
    availableSteps: 1,
    costPerStep: 120000,
    combatGainPercentPerStep: 0.66,
  },
  {
    id: "shoulder-adv-30-40",
    name: "어깨 상급재련 30 -> 40",
    category: "장비",
    detail: "일반 - 장인의 재봉술 : 4단계 | 선조턴 - 장인의 재봉술 : 4단계 | 강화선조턴 - 장인의 재봉술 : 4단계",
    fromTo: "상급재련 30 -> 40",
    availableSteps: 1,
    costPerStep: 235000,
    combatGainPercentPerStep: 2.55,
  },
  {
    id: "weapon-20-21",
    name: "무기 +20 -> +21",
    category: "장비",
    detail: "노숨: 평균 528,201G, 장기백 1,280,077G | 풀숨: 평균 500,737G, 장기백 1,250,403G",
    fromTo: "+20 -> +21",
    availableSteps: 1,
    costPerStep: 501000,
    combatGainPercentPerStep: 3.1,
  },
  {
    id: "pants-adv-30-40",
    name: "하의 상급재련 30 -> 40",
    category: "장비",
    detail: "일반 - 장인의 재봉술 : 4단계 | 선조턴 - 장인의 재봉술 : 4단계 | 강화선조턴 - 장인의 재봉술 : 4단계",
    fromTo: "상급재련 30 -> 40",
    availableSteps: 1,
    costPerStep: 235000,
    combatGainPercentPerStep: 2.55,
  },
  {
    id: "avatar-quality",
    name: "아바타 공격력 계열 보정",
    category: "아바타",
    detail: "전투력 효율표 기준 착용/등급/부위 보정",
    fromTo: "미적용 -> 적용",
    availableSteps: 1,
    costPerStep: 80000,
    combatGainPercentPerStep: 0.35,
  },
  {
    id: "bracelet-fixed-attack",
    name: "팔찌 고정 공격력/추가 피해 보정",
    category: "팔찌",
    detail: "무기 공격력 / 공격력 / 추가 피해 유효 옵션 기준",
    fromTo: "현재 옵션 -> 유효 옵션",
    availableSteps: 1,
    costPerStep: 130000,
    combatGainPercentPerStep: 0.85,
  },
  {
    id: "engraving-efficiency",
    name: "각인 효율 상향",
    category: "각인",
    detail: "원한/아드/돌대/질증 등 전투력 효율표 기준",
    fromTo: "현재 각인 -> 효율 각인",
    availableSteps: 1,
    costPerStep: 95000,
    combatGainPercentPerStep: 0.58,
  },
];

function isExcludedCombatRecommendation(option: Pick<CombatUpgradeOption, "id" | "name" | "category">) {
  const text = `${option.id} ${option.name} ${option.category}`;
  return (
    option.category === "팔찌" ||
    option.category === "아크그리드" ||
    option.category === "아크패시브" ||
    /bracelet|chaos-core|arkGrid|arkPassive|팔찌|혼돈 코어|아크그리드|아크패시브|카르마/.test(text)
  );
}

function makeDefaultCombatProfile(): CombatProfileInputs {
  const equipmentDefaults: Record<EquipmentSlot, Pick<CombatEquipmentInput, "normalCostPerStep" | "advancedCostPerStep" | "normalGainPercent" | "advancedGainPercent">> = {
    weapon: { normalCostPerStep: 300000, advancedCostPerStep: 50000, normalGainPercent: 2.8, advancedGainPercent: 0.22 },
    helmet: { normalCostPerStep: 60000, advancedCostPerStep: 23500, normalGainPercent: 0.6, advancedGainPercent: 0.12 },
    shoulder: { normalCostPerStep: 60000, advancedCostPerStep: 23500, normalGainPercent: 0.6, advancedGainPercent: 0.12 },
    chest: { normalCostPerStep: 60000, advancedCostPerStep: 23500, normalGainPercent: 0.45, advancedGainPercent: 0.09 },
    pants: { normalCostPerStep: 60000, advancedCostPerStep: 23500, normalGainPercent: 0.55, advancedGainPercent: 0.11 },
    gloves: { normalCostPerStep: 60000, advancedCostPerStep: 23500, normalGainPercent: 0.65, advancedGainPercent: 0.13 },
  };

  return {
    equipment: SLOT_ORDER.map((slot) => ({
      slot,
      enabled: true,
      baseHoning: 0,
      currentHoning: 0,
      targetHoning: 0,
      baseAdvanced: 0,
      currentAdvanced: 0,
      targetAdvanced: 0,
      ...equipmentDefaults[slot],
    })),
    gems: [
      { id: "guardian-pier", skillName: "가디언 피어", gemType: "겁화", bound: true, baseLevel: 6, currentLevel: 6, targetLevel: 8, costPerLevel: 120000, gainPercentPerLevel: 0.6 },
      { id: "frenzy-sweep", skillName: "프렌지 스윕", gemType: "겁화", bound: true, baseLevel: 6, currentLevel: 6, targetLevel: 8, costPerLevel: 120000, gainPercentPerLevel: 0.6 },
      { id: "guillotine-spin", skillName: "길로틴 스핀", gemType: "겁화", bound: true, baseLevel: 6, currentLevel: 6, targetLevel: 8, costPerLevel: 120000, gainPercentPerLevel: 0.6 },
    ],
    gemPricesByLevel: Object.fromEntries(GEM_PRICE_LEVELS.map((level) => [String(level), 0])),
    gemPriceFetchedAt: "",
    accessoryPricesByPart: {},
    accessoryPriceFetchedAt: "",
    accessoryTargetsByPart: {},
    engravingItems: [],
    engravingPricesByName: {},
    engravingPriceFetchedAt: "",
    avatarPriceFetchedAt: "",
    avatarPriceItemsBySlot: {},
    avatarItems: [],
    avatar: { enabled: true, currentLabel: "현재", targetLabel: "공격력 계열 보정", cost: 800000, gainPercent: 0.35 },
    accessory: { enabled: true, currentLabel: "현재 악세 옵션", targetLabel: "유효 옵션 1단계 보정", cost: 180000, gainPercent: 0.72 },
    bracelet: { enabled: false, currentLabel: "현재 옵션", targetLabel: "추천 제외", cost: 0, gainPercent: 0 },
    engraving: { enabled: false, currentLabel: "현재 각인", targetLabel: "각인서 직접 입력", cost: 95000, gainPercent: 0.58 },
    arkGrid: { enabled: false, currentLabel: "달/별 현재", targetLabel: "추천 제외", cost: 0, gainPercent: 0 },
    arkPassive: { enabled: false, currentLabel: "현재 코어", targetLabel: "추천 제외", cost: 0, gainPercent: 0 },
  };
}

function parseNumber(input: string | number | undefined | null) {
  const cleaned = String(input ?? "").replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function makeDefaultCombatPlanner(): CombatPlannerState {
  return {
    currentCombatPower: 0,
    targetCombatPower: 0,
    levelGrowthCombatPercent: 0,
    enabledCategories: makeDefaultCombatCategoryFlags(),
    profile: makeDefaultCombatProfile(),
    options: DEFAULT_COMBAT_OPTIONS.map((option) => ({ ...option })),
  };
}

function makeKarmaUpgradeLabel(details?: CharacterImportResponse["combatDetails"] | null) {
  if (!details) return "카르마 깨달음 레벨 조정";
  const candidates = [
    { name: "깨달음", level: Number(details.enlightenmentKarmaRanks || 0) },
    { name: "진화", level: Number(details.evolutionKarmaRanks || 0) },
    { name: "도약", level: Number(details.leapKarmaRanks || 0) },
  ].filter((row) => Number.isFinite(row.level) && row.level > 0);
  const target = candidates[0] ?? { name: "깨달음", level: 0 };
  return target.level > 0 ? `카르마 ${target.name} 레벨 ${target.level} -> ${target.level + 1}` : `카르마 ${target.name} 레벨 조정`;
}

function normalizeCombatPlanner(raw: unknown): CombatPlannerState {
  const base = makeDefaultCombatPlanner();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Partial<CombatPlannerState>;
  const optionMap = new Map((source.options ?? []).map((option) => [option.id, option]));
  const rawProfile = source.profile as Partial<CombatProfileInputs> | undefined;
  const rawEquipment = new Map((rawProfile?.equipment ?? []).map((row) => [row.slot, row]));
  const rawGems = Array.isArray(rawProfile?.gems) ? rawProfile.gems : [];
  const normalizedGems = rawGems.length
    ? rawGems.map((row, index) => ({
        id: String(row.id || `gem-${index + 1}`),
        skillName: normalizeGemSkillName(String(row.skillName || ""), index),
        gemType: normalizeGemTypeLabel(String(row.gemType || "보석")),
        bound: Boolean(row.bound),
        baseLevel: Math.max(1, Math.min(10, Number(row.baseLevel || row.currentLevel || 1))),
        currentLevel: Math.max(1, Math.min(10, Number(row.currentLevel || 1))),
        targetLevel: Math.max(1, Math.min(10, Number(row.targetLevel || row.currentLevel || 1))),
        costPerLevel: Math.max(0, Number(row.costPerLevel || 0)),
        gainPercentPerLevel: Math.max(0, Number(row.gainPercentPerLevel || 0)),
      }))
    : base.profile.gems;
  const engravingProfile = { ...base.profile.engraving, ...(rawProfile?.engraving ?? {}) };
  const isLegacyAutoEngraving =
    !rawProfile?.engraving ||
    /효율\s*각인|각인\s*효율\s*보정/.test(`${engravingProfile.targetLabel || ""} ${engravingProfile.currentLabel || ""}`);
  const savedAvatarProfile: CombatProfileInputs = {
    ...base.profile,
    avatarItems: Array.isArray(rawProfile?.avatarItems) ? rawProfile.avatarItems : [],
    avatar: { ...base.profile.avatar, ...(rawProfile?.avatar ?? {}) },
  };
  const normalizedAvatarItems = makeAvatarSlotRows(savedAvatarProfile.avatarItems, savedAvatarProfile);
  return {
    currentCombatPower: Number(source.currentCombatPower || 0),
    targetCombatPower: Number(source.targetCombatPower || 0),
    levelGrowthCombatPercent: Number(source.levelGrowthCombatPercent || 0),
    enabledCategories: {
      ...base.enabledCategories,
      ...(source.enabledCategories ?? {}),
      팔찌: false,
      아크그리드: false,
      아크패시브: false,
    },
    profile: {
      equipment: base.profile.equipment.map((row) => ({ ...row, ...(rawEquipment.get(row.slot) ?? {}) })),
      gems: normalizedGems,
      gemPricesByLevel: {
        ...base.profile.gemPricesByLevel,
        ...(rawProfile?.gemPricesByLevel ?? {}),
      },
      gemPriceFetchedAt: String(rawProfile?.gemPriceFetchedAt ?? ""),
      accessoryPricesByPart:
        rawProfile?.accessoryPriceQueryVersion === ACCESSORY_PRICE_QUERY_VERSION
          ? {
              ...base.profile.accessoryPricesByPart,
              ...(rawProfile?.accessoryPricesByPart ?? {}),
            }
          : {},
      accessoryPriceFetchedAt: rawProfile?.accessoryPriceQueryVersion === ACCESSORY_PRICE_QUERY_VERSION ? String(rawProfile?.accessoryPriceFetchedAt ?? "") : "",
      accessoryPriceQueryVersion: rawProfile?.accessoryPriceQueryVersion === ACCESSORY_PRICE_QUERY_VERSION ? ACCESSORY_PRICE_QUERY_VERSION : "",
      accessoryTargetsByPart: rawProfile?.accessoryPriceQueryVersion === ACCESSORY_PRICE_QUERY_VERSION ? rawProfile?.accessoryTargetsByPart ?? {} : {},
      accessoryCandidatesByPart: rawProfile?.accessoryPriceQueryVersion === ACCESSORY_PRICE_QUERY_VERSION ? rawProfile?.accessoryCandidatesByPart ?? {} : {},
      engravingItems: Array.isArray(rawProfile?.engravingItems) ? rawProfile.engravingItems : [],
      engravingPricesByName: {
        ...base.profile.engravingPricesByName,
        ...(rawProfile?.engravingPricesByName ?? {}),
      },
      engravingPriceFetchedAt: String(rawProfile?.engravingPriceFetchedAt ?? ""),
      avatarPriceFetchedAt: String(rawProfile?.avatarPriceFetchedAt ?? ""),
      avatarPriceItemsBySlot: rawProfile?.avatarPriceItemsBySlot ?? {},
      accessoryItems: rawProfile?.accessoryItems ?? [],
      braceletItems: rawProfile?.braceletItems ?? [],
      avatarItems: normalizedAvatarItems,
      avatar: { ...base.profile.avatar, ...(rawProfile?.avatar ?? {}) },
      accessory: { ...base.profile.accessory, ...(rawProfile?.accessory ?? {}) },
      bracelet: { ...base.profile.bracelet, ...(rawProfile?.bracelet ?? {}), enabled: false, cost: 0, gainPercent: 0, targetLabel: "추천 제외" },
      engraving: { ...engravingProfile, enabled: isLegacyAutoEngraving ? false : Boolean(engravingProfile.enabled) },
      arkGrid: { ...base.profile.arkGrid, ...(rawProfile?.arkGrid ?? {}), enabled: false, cost: 0, gainPercent: 0, targetLabel: "추천 제외" },
      arkPassive: { ...base.profile.arkPassive, ...(rawProfile?.arkPassive ?? {}), enabled: false, cost: 0, gainPercent: 0, targetLabel: "추천 제외" },
    },
    options: base.options
      .map((option) => {
        const saved = optionMap.get(option.id);
        return {
          ...option,
          ...saved,
          availableSteps: Math.max(0, Math.floor(Number(saved?.availableSteps ?? option.availableSteps) || 0)),
          costPerStep: Math.max(0, Number(saved?.costPerStep ?? option.costPerStep) || 0),
          combatGainPercentPerStep: Math.max(0, Number(saved?.combatGainPercentPerStep ?? option.combatGainPercentPerStep) || 0),
        };
      })
      .filter((option) => !isExcludedCombatRecommendation(option)),
  };
}

function loadCombatPlanner(): CombatPlannerState {
  try {
    const raw = localStorage.getItem(COMBAT_STORAGE_KEY);
    return raw ? normalizeCombatPlanner(JSON.parse(raw)) : makeDefaultCombatPlanner();
  } catch {
    return makeDefaultCombatPlanner();
  }
}

function makeCombatOption(input: Omit<CombatUpgradeOption, "availableSteps">): CombatUpgradeOption {
  return {
    ...input,
    availableSteps: 1,
  };
}

function getGemMarketPrice(profile: CombatProfileInputs, level: number) {
  const value = Number(profile.gemPricesByLevel?.[String(level)] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getGemStepCost(profile: CombatProfileInputs, row: CombatGemInput, level: number) {
  const nextPrice = getGemMarketPrice(profile, level + 1);
  const currentPrice = getGemMarketPrice(profile, level);
  if (nextPrice > 0) {
    if (row.bound) return nextPrice;
    if (currentPrice > 0) return Math.max(0, nextPrice - currentPrice);
    return nextPrice;
  }
  return Math.max(0, Number(row.costPerLevel || 0));
}

function getGemCostDetail(profile: CombatProfileInputs, row: CombatGemInput, level: number) {
  const nextPrice = getGemMarketPrice(profile, level + 1);
  const currentPrice = getGemMarketPrice(profile, level);
  if (nextPrice <= 0) return `${level}Lv -> ${level + 1}Lv · 수동 비용`;
  if (row.bound) {
    return `${level}Lv -> ${level + 1}Lv · 귀속 기준 ${level + 1}레벨 경매장 최저가`;
  }
  if (currentPrice > 0) return `${level}Lv -> ${level + 1}Lv · 경매장 시세 차액`;
  return `${level}Lv -> ${level + 1}Lv · ${level + 1}레벨 경매장 최저가`;
}

function getGemCombatGainPercent(row: CombatGemInput, level: number) {
  const next = T4_GEM_COMBAT_GAIN_BY_LEVEL[level + 1];
  const current = T4_GEM_COMBAT_GAIN_BY_LEVEL[level];
  if (Number.isFinite(next) && Number.isFinite(current)) return Math.max(0, next - current);
  return Math.max(0, Number(row.gainPercentPerLevel || 0));
}

function getGemLevelCombatPercent(level: number) {
  const value = T4_GEM_COMBAT_GAIN_BY_LEVEL[Math.max(1, Math.min(10, Math.round(Number(level || 0))))];
  return Number.isFinite(value) ? value : 0;
}

function estimateManualGemCombatGainPercent(gems: CombatGemInput[]) {
  return gems.reduce((sum, gem) => {
    const baseLevel = Number(gem.baseLevel || gem.currentLevel || 0);
    const currentLevel = Number(gem.currentLevel || 0);
    return sum + (getGemLevelCombatPercent(currentLevel) - getGemLevelCombatPercent(baseLevel));
  }, 0);
}

function estimateManualEquipmentCombatGainPercent(equipment: CombatEquipmentInput[]) {
  return equipment.reduce((sum, row) => {
    if (!row.enabled) return sum;
    const baseHoning = Number(row.baseHoning ?? row.currentHoning ?? 0);
    const currentHoning = Number(row.currentHoning || 0);
    const baseAdvanced = Number(row.baseAdvanced ?? row.currentAdvanced ?? 0);
    const currentAdvanced = Number(row.currentAdvanced || 0);
    const honingGain = (currentHoning - baseHoning) * Math.max(0, Number(row.normalGainPercent || 0));
    const advancedGain = getAdvancedRefiningCombatGainPercent(row, baseAdvanced, currentAdvanced);
    return sum + honingGain + advancedGain;
  }, 0);
}

function makeCombatSlug(input: string, fallback: string) {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeGemTypeLabel(input: string) {
  const text = String(input || "").trim();
  if (/작열/.test(text)) return "작열";
  if (/겁화/.test(text)) return "겁화";
  if (/멸화/.test(text)) return "멸화";
  if (/홍염/.test(text)) return "홍염";
  return text.replace(/보석/g, "").replace(/\s+/g, " ").trim() || "보석";
}

function normalizeGemSkillName(input: string, index: number) {
  const text = String(input || "")
    .replace(/\d+\s*레벨/g, "")
    .replace(/Lv\.?\s*\d+/gi, "")
    .replace(/겁화|작열|멸화|홍염|보석|의/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /^보석\s*\d*$/i.test(String(input || "").trim())) return `스킬 미확인 ${index + 1}`;
  return text;
}

function formatGemUpgradeName(row: CombatGemInput, fromLevel: number, index: number) {
  const type = normalizeGemTypeLabel(row.gemType);
  const skillName = normalizeGemSkillName(row.skillName, index);
  const boundText = row.bound ? " (귀속)" : "";
  return `${fromLevel}레벨 ${type} [${skillName}]${boundText} ${fromLevel} -> ${fromLevel + 1}`;
}

function getGemBoardScore(gems: CombatGemInput[]) {
  return gems.reduce((sum, gem) => sum + Math.max(0, Number(gem.currentLevel || 0)), 0);
}

function getAdvancedRefiningBasicEffectGainPercent(fromLevel: number, toLevel: number) {
  void fromLevel;
  void toLevel;
  return 0;
}

function getAdvancedRefiningCombatGainPercent(row: CombatEquipmentInput, fromLevel: number, toLevel: number) {
  const from = Math.max(0, Number(fromLevel || 0));
  const to = Math.max(from, Number(toLevel || from));
  const stepCount = Math.max(0, to - from);
  const baseGain = stepCount * Math.max(0, Number(row.advancedGainPercent || 0));
  return baseGain + getAdvancedRefiningBasicEffectGainPercent(from, to);
}

function getNextAdvancedRefiningBreak(currentLevel: number, targetLevel: number) {
  const nextFiveStep = Math.ceil((currentLevel + 1) / 5) * 5;
  return Math.min(targetLevel, Math.max(currentLevel + 1, nextFiveStep));
}

function isBraceletSystemItem(item: { name?: string; effects?: string[] }) {
  const name = String(item.name || "");
  return /팔찌|bracelet|armlet/i.test(name);
}

function cleanAccessoryEffect(input: string) {
  let text = String(input || "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/["']?Element_\d+["']?\s*:\s*/g, "")
    .replace(/\b(type|value|content|topStr|bPoint|point|slotData)\b\s*:\s*/gi, "")
    .replace(/[{}[\]"]/g, " ")
    .replace(/\s*:\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/\s*}\s*$/g, "").trim();
  if (/^Element_\d+/i.test(text)) return "";
  return text;
}

function getAccessoryPartName(item: { name?: string }) {
  const name = String(item.name || "");
  if (name.includes("목걸이")) return "목걸이";
  if (name.includes("귀걸이")) return "귀걸이";
  if (name.includes("반지")) return "반지";
  return name || "악세";
}

function getAccessoryDisplayName(items: Array<{ name?: string }>, index: number, fallbackItem?: { name?: string }) {
  const row = items[index] ?? fallbackItem ?? {};
  const part = getAccessoryPartName(row);
  const source = items.length ? items : getFallbackAccessoryRows();
  const sameCount = source.filter((item) => getAccessoryPartName(item) === part).length;
  if (sameCount <= 1) return part;
  const order = source.slice(0, index + 1).filter((item) => getAccessoryPartName(item) === part).length;
  return `${part} ${order}`;
}

function getAccessoryEffectSummary(item: { effects?: string[] }, maxCount = 3) {
  const effects = (item.effects ?? []).map(cleanAccessoryEffect).filter(Boolean);
  return effects.slice(0, maxCount).join(" / ") || "옵션 미확인";
}

const ACCESSORY_TARGET_KEYWORDS: Record<string, string[]> = {
  목걸이: ["적에게 주는 피해", "추가 피해"],
  귀걸이: ["무기 공격력", "공격력 %"],
  반지: ["치명타 피해", "치명타 적중률"],
};

const ACCESSORY_OPTION_TIER_RULES: Record<string, Array<{ min: number; tier: number; label: string }>> = {
  "적에게 주는 피해": [
    { min: 2, tier: 3, label: "상" },
    { min: 1.2, tier: 2, label: "중" },
  ],
  "추가 피해": [
    { min: 2.6, tier: 3, label: "상" },
    { min: 1.6, tier: 2, label: "중" },
  ],
  "공격력 %": [
    { min: 1.55, tier: 3, label: "상" },
    { min: 0.95, tier: 2, label: "중" },
  ],
  "무기 공격력": [
    { min: 3, tier: 3, label: "상" },
    { min: 1.8, tier: 2, label: "중" },
  ],
  "치명타 피해": [
    { min: 4, tier: 3, label: "상" },
    { min: 2.4, tier: 2, label: "중" },
  ],
  "치명타 적중률": [
    { min: 1.55, tier: 3, label: "상" },
    { min: 0.95, tier: 2, label: "중" },
  ],
};

function accessoryEffectMatchesKeyword(effect: string, keyword: string) {
  const text = cleanAccessoryEffect(effect);
  if (keyword === "공격력 %") return /공격력\s*\+\s*\d+(?:\.\d+)?%/.test(text) && !text.includes("무기 공격력");
  return text.includes(keyword);
}

function readAccessoryEffectValue(effect: string) {
  const match = cleanAccessoryEffect(effect).match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

function getAccessoryEffectTier(effect: string, keyword: string) {
  if (!accessoryEffectMatchesKeyword(effect, keyword)) return { tier: 0, label: "없음" };
  const value = readAccessoryEffectValue(effect);
  const rule = (ACCESSORY_OPTION_TIER_RULES[keyword] ?? []).find((row) => value >= row.min);
  return rule ?? { tier: value > 0 ? 1 : 0, label: value > 0 ? "하" : "없음" };
}

function getAccessoryBestTier(item: { effects?: string[] }, keyword: string) {
  return (item.effects ?? []).reduce(
    (best, effect) => {
      const tier = getAccessoryEffectTier(effect, keyword);
      return tier.tier > best.tier ? tier : best;
    },
    { tier: 0, label: "없음" }
  );
}

function getAccessoryOptionScore(item: { effects?: string[] }, part: string) {
  return (ACCESSORY_TARGET_KEYWORDS[part] ?? []).reduce((sum, keyword) => sum + getAccessoryBestTier(item, keyword).tier, 0);
}

function getTargetAccessoryTier(target: { target?: string; options?: string[] }, keyword: string) {
  const text = `${target.target ?? ""} ${(target.options ?? []).join(" ")}`;
  if (!text.includes(keyword === "공격력 %" ? "공격력" : keyword)) return { tier: 0, label: "없음" };
  if (new RegExp(`${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*상|상\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) {
    return { tier: 3, label: "상" };
  }
  if (new RegExp(`${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*중|중\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) {
    return { tier: 2, label: "중" };
  }
  const fromOptions = (target.options ?? []).reduce(
    (best, option) => {
      const tier = getAccessoryEffectTier(option, keyword);
      return tier.tier > best.tier ? tier : best;
    },
    { tier: 0, label: "없음" }
  );
  return fromOptions;
}

function getAccessoryTargetScore(target: { target?: string; options?: string[] }, part: string) {
  return (ACCESSORY_TARGET_KEYWORDS[part] ?? []).reduce((sum, keyword) => sum + getTargetAccessoryTier(target, keyword).tier, 0);
}

function pickBetterAccessoryCandidate(profile: CombatProfileInputs, item: { effects?: string[] }, part: string) {
  const currentScore = getAccessoryOptionScore(item, part);
  const candidates = profile.accessoryCandidatesByPart?.[part] ?? Object.values(profile.accessoryTargetsByPart?.[part] ? { target: profile.accessoryTargetsByPart[part] } : {});
  return candidates
    .map((candidate) => ({
      candidate,
      targetScore: getAccessoryTargetScore(candidate, part),
      scoreGain: getAccessoryTargetScore(candidate, part) - currentScore,
      efficiency: Number(candidate.buyPrice || 0) / Math.max(0.1, getAccessoryTargetScore(candidate, part) - currentScore),
    }))
    .filter((row) => row.scoreGain > 0 && Number(row.candidate.buyPrice || 0) > 0)
    .sort((a, b) => a.efficiency - b.efficiency || a.candidate.buyPrice - b.candidate.buyPrice)[0]?.candidate;
}

function getMissingAccessoryTargetEffects(item: { effects?: string[] }, part: string, target?: { target?: string; options?: string[] }) {
  return (ACCESSORY_TARGET_KEYWORDS[part] ?? []).filter((keyword) => {
    const current = getAccessoryBestTier(item, keyword);
    const required = target ? getTargetAccessoryTier(target, keyword) : { tier: 1, label: "보유" };
    return current.tier < Math.max(1, required.tier);
  });
}

function isAccessoryAlreadyTargetLike(item: { quality?: number; effects?: string[] }, part: string, target?: { quality?: number; target?: string; options?: string[] }) {
  const missingEffects = getMissingAccessoryTargetEffects(item, part, target);
  const quality = Number(item.quality || 0);
  const targetQuality = Math.max(67, Number(target?.quality || 0));
  return missingEffects.length === 0 && quality >= targetQuality;
}

function getAccessoryUpgradeReason(item: { quality?: number; effects?: string[] }, part: string, target?: { quality?: number; target?: string; options?: string[] }) {
  const missingEffects = getMissingAccessoryTargetEffects(item, part, target).map((keyword) => {
    const current = getAccessoryBestTier(item, keyword);
    const required = target ? getTargetAccessoryTier(target, keyword) : { tier: 1, label: "보유" };
    return `${keyword} ${current.label} -> ${required.label}`;
  });
  const quality = Number(item.quality || 0);
  const targetQuality = Math.max(67, Number(target?.quality || 0));
  const reasons: string[] = [];
  if (missingEffects.length) reasons.push(`옵션 상승: ${missingEffects.join(", ")}`);
  if (!quality) reasons.push(`현재 품질 미확인, 목표 품질 ${targetQuality}+ 확인 필요`);
  else if (quality < targetQuality) reasons.push(`품질 ${quality} -> ${targetQuality}+`);
  return reasons.join(" · ") || "현재보다 높은 품질/상옵 후보";
}

function getAccessoryAuctionPrice(profile: CombatProfileInputs, part: string) {
  const targetPrice = Number(profile.accessoryTargetsByPart?.[part]?.buyPrice || 0);
  const saneMinimum = part === "목걸이" ? 10000 : 5000;
  if (Number.isFinite(targetPrice) && targetPrice >= saneMinimum) return targetPrice;
  return Number(profile.accessory.cost || 0);
}

function isAccessoryAuctionPriceLoaded(profile: CombatProfileInputs, part: string) {
  const targetPrice = Number(profile.accessoryTargetsByPart?.[part]?.buyPrice || 0);
  const saneMinimum = part === "목걸이" ? 10000 : 5000;
  return Number.isFinite(targetPrice) && targetPrice >= saneMinimum;
}

function getAccessoryAuctionTargetDetail(profile: CombatProfileInputs, part: string) {
  const target = profile.accessoryTargetsByPart?.[part];
  if (!target) return "";
  const options = (target.options ?? []).slice(0, 3).join(" / ");
  return `${target.target} · ${target.grade ? `${target.grade} ` : ""}${target.itemName}${target.quality ? ` 품질 ${target.quality}` : ""}${options ? ` · ${options}` : ""}`;
}

function formatAccessoryCandidateGuide(part: string, target: { target: string; itemName: string; grade?: string; quality?: number; options?: string[] }) {
  const options = (target.options ?? []).slice(0, 3).join(" / ");
  return `${part} 교체: ${target.grade ? `${target.grade} ` : ""}${target.itemName}${target.quality ? ` 품질 ${target.quality}+` : ""} · ${target.target}${options ? ` · ${options}` : ""}`;
}

function getAccessoryPurchaseGuide(profile: CombatProfileInputs, part: string) {
  const target = profile.accessoryTargetsByPart?.[part];
  if (!target) return `${part} 유효 옵션 매물 미확인 · 악세 시세 불러오기를 먼저 눌러줘`;
  return formatAccessoryCandidateGuide(part, target);
}

function getAccessoryUpgradeRows(profile: CombatProfileInputs) {
  return getDisplayAccessoryRows(profile.accessoryItems).flatMap((item, index) => {
    const part = getAccessoryPartName(item);
    const target = pickBetterAccessoryCandidate(profile, item, part);
    if (!target || isAccessoryAlreadyTargetLike(item, part, target)) return [];
    return [
      {
        item,
        index,
        part,
        displayName: getAccessoryDisplayName(profile.accessoryItems ?? [], index, item),
        currentDetail: getAccessoryEffectSummary(item),
        target,
        reason: getAccessoryUpgradeReason(item, part, target),
      },
    ];
  });
}

function getFallbackAccessoryRows() {
  return [
    { name: "목걸이", effects: ["현재 목걸이 옵션 미확인"] },
    { name: "귀걸이", effects: ["현재 귀걸이 1 옵션 미확인"] },
    { name: "귀걸이", effects: ["현재 귀걸이 2 옵션 미확인"] },
    { name: "반지", effects: ["현재 반지 1 옵션 미확인"] },
    { name: "반지", effects: ["현재 반지 2 옵션 미확인"] },
  ];
}

function getDisplayAccessoryRows(items?: Array<{ name?: string; quality?: number; effects: string[] }>) {
  const source = items ?? [];
  const counts = {
    목걸이: source.filter((item) => getAccessoryPartName(item) === "목걸이").length,
    귀걸이: source.filter((item) => getAccessoryPartName(item) === "귀걸이").length,
    반지: source.filter((item) => getAccessoryPartName(item) === "반지").length,
  };
  const rows = [...source];
  if (counts.목걸이 < 1) rows.push({ name: "목걸이", effects: ["현재 목걸이 옵션 미확인"] });
  for (let index = counts.귀걸이; index < 2; index += 1) rows.push({ name: "귀걸이", effects: [`현재 귀걸이 ${index + 1} 옵션 미확인`] });
  for (let index = counts.반지; index < 2; index += 1) rows.push({ name: "반지", effects: [`현재 반지 ${index + 1} 옵션 미확인`] });
  const order: Record<string, number> = { 목걸이: 0, 귀걸이: 1, 반지: 2 };
  return rows.sort((a, b) => (order[getAccessoryPartName(a)] ?? 9) - (order[getAccessoryPartName(b)] ?? 9));
}

function isEngravingComplete(row: Pick<CombatEngravingInput, "grade" | "level" | "targetGrade" | "targetLevel">) {
  return row.grade === row.targetGrade && Number(row.level || 0) >= Number(row.targetLevel || 0);
}

function getEngravingMissingBooks(grade: string, level: number, targetGrade = "유물", targetLevel = 4) {
  if (grade === targetGrade) return Math.max(0, targetLevel - Number(level || 0)) * 5;
  return targetLevel * 5;
}

function getEngravingBookCost(row: CombatEngravingInput, profile: CombatProfileInputs) {
  const marketPrice = Number(profile.engravingPricesByName?.[row.name] || 0);
  const pricePerBook = marketPrice > 0 ? marketPrice : Number(row.pricePerBook || 0);
  return Math.max(0, pricePerBook) * Math.max(0, Number(row.missingBooks || 0));
}

function getEngravingDisplayPrice(row: CombatEngravingInput, profile: CombatProfileInputs) {
  const marketPrice = Number(profile.engravingPricesByName?.[row.name] || 0);
  return marketPrice > 0 ? marketPrice : Math.max(0, Number(row.pricePerBook || 0));
}

function normalizeAvatarSlot(input: string) {
  const text = String(input || "");
  if (text.includes("무기")) return "무기";
  if (text.includes("머리")) return "머리";
  if (text.includes("상의")) return "상의";
  if (text.includes("하의")) return "하의";
  return text.replace(/\s*아바타/g, "").trim() || "아바타";
}

function isAvatarGradeComplete(grade: string, targetGrade: string) {
  if (!targetGrade || targetGrade === "현재 유지") return true;
  const currentRank = AVATAR_GRADE_RANK[grade] ?? 0;
  const targetRank = AVATAR_GRADE_RANK[targetGrade] ?? 0;
  return targetRank > 0 && currentRank >= targetRank;
}

function getDefaultAvatarCost(className?: string | null) {
  return className ? 200000 : 20000;
}

function makeAvatarSlotRows(
  importedAvatars: Array<{ name?: string; grade?: string; slot?: string }>,
  prevProfile: CombatProfileInputs,
  className?: string | null
): CombatAvatarInput[] {
  const importedBySlot = new Map(
    importedAvatars
      .map((avatar) => ({ ...avatar, slot: normalizeAvatarSlot(avatar.slot || avatar.name || "") }))
      .filter((avatar) => AVATAR_TARGET_SLOTS.includes(avatar.slot))
      .map((avatar) => [avatar.slot, avatar])
  );

  return AVATAR_TARGET_SLOTS.map((slot) => {
    const avatar = importedBySlot.get(slot);
    const prev = prevProfile.avatarItems.find((item) => normalizeAvatarSlot(item.slot) === slot);
    const targetGrade = prev?.targetGrade || "전설";
    const grade = avatar?.grade || prev?.grade || "미착용";
    const complete = isAvatarGradeComplete(grade, targetGrade);
    const defaultCost = getDefaultAvatarCost(className);
    const savedCost = Number(prev?.cost || 0);
    return {
      id: `avatar-${makeCombatSlug(slot, slot)}`,
      slot,
      name: avatar?.name || prev?.name || `${slot} 아바타`,
      grade,
      targetGrade,
      enabled: complete ? false : (prev?.enabled ?? true),
      cost: savedCost > 20000 ? savedCost : defaultCost,
      gainPercent: prev?.gainPercent ?? Math.max(0.03, Number(prevProfile.avatar.gainPercent || 0) / AVATAR_TARGET_SLOTS.length),
    };
  });
}

function needsAvatarImportRefresh(profile: CombatProfileInputs) {
  if (profile.avatarItems.length < AVATAR_TARGET_SLOTS.length) return true;
  return profile.avatarItems.some((row) => !row.grade || row.grade === "미착용" || row.name === `${row.slot} 아바타`);
}

function syncAvatarSummaryFromItems(profile: CombatProfileInputs, avatarItems = profile.avatarItems): CombatProfileInputs {
  if (!avatarItems.length) return profile;
  const activeItems = avatarItems.filter((row) => row.enabled && !isAvatarGradeComplete(row.grade, row.targetGrade));
  return {
    ...profile,
    avatarItems,
    avatar: {
      ...profile.avatar,
      cost: activeItems.reduce((sum, row) => sum + Math.max(0, Number(row.cost || 0)), 0),
      gainPercent: activeItems.reduce((sum, row) => sum + Math.max(0, Number(row.gainPercent || 0)), 0),
      enabled: activeItems.length > 0,
      targetLabel: activeItems.length ? "부위별 전설 아바타 보정" : "현재 유지",
    },
  };
}

function buildCombatProfileFromImport(data: CharacterImportResponse, prevProfile: CombatProfileInputs): CombatProfileInputs {
  const importedGems = data.combatSystems?.gems ?? [];
  const importedPieceMap = new Map(data.pieces.map((piece) => [piece.slot, piece]));
  const nextGems = importedGems.length
    ? importedGems.slice(0, 11).map((gem, index) => {
        const level = Math.max(1, Math.min(10, Number(gem.level || 0)));
        const gemType = normalizeGemTypeLabel(String(gem.type || gem.name || "보석"));
        return {
          id: `imported-${makeCombatSlug(`${gem.name}-${index}`, String(index))}`,
          skillName: normalizeGemSkillName(String(gem.name || ""), index),
          gemType,
          bound: true,
          baseLevel: level,
          currentLevel: level,
          targetLevel: Math.min(10, Math.max(level + 1, level < 8 ? 8 : level + 1)),
          costPerLevel: prevProfile.gems[index]?.costPerLevel ?? 120000,
          gainPercentPerLevel: getGemCombatGainPercent(prevProfile.gems[index] ?? makeDefaultCombatProfile().gems[0], level),
        };
      })
    : prevProfile.gems;
  const systems = data.combatSystems;
  const details = data.combatDetails;
  const arkPassive = systems?.arkPassive;
  const arkPassiveLabel = arkPassive
    ? `진화 ${arkPassive.evolution || 0} / 깨달음 ${arkPassive.enlightenment || 0} / 도약 ${arkPassive.leap || 0}`
    : prevProfile.arkPassive.currentLabel;
  const arkGridLabel = systems?.arkGrid?.length
    ? systems.arkGrid.map((row) => `${row.name} ${row.points}`).slice(0, 3).join(" / ")
    : details?.evolutionKarmaRanks || details?.enlightenmentKarmaRanks || details?.leapKarmaRanks
      ? `카르마 ${details.evolutionKarmaRanks || 0}/${details.enlightenmentKarmaRanks || 0}/${details.leapKarmaRanks || 0}`
      : prevProfile.arkGrid.currentLabel;
  const arkPassiveUpgradeLabel = makeKarmaUpgradeLabel(details);
  const accessories = systems?.accessories ?? [];
  const braceletItems = accessories.filter(isBraceletSystemItem);
  const accessoryItems = accessories.filter((item) => !isBraceletSystemItem(item));
  const accessoryEffects = accessoryItems.flatMap((item) => item.effects ?? []).map(cleanAccessoryEffect).filter(Boolean);
  const accessoryLabel =
    accessoryEffects.length ? accessoryEffects.slice(0, 5).join(" / ") : accessoryItems.length ? `악세 ${accessoryItems.length}부위` : prevProfile.accessory.currentLabel;
  const braceletRow = braceletItems[0];
  const importedEngravings = systems?.engravings ?? [];
  const engravingItems = importedEngravings.map((row, index) => {
    const grade = row.grade || "미확인";
    const level = Number(row.level || 0);
    const prev = prevProfile.engravingItems.find((item) => item.name === row.name) ?? prevProfile.engravingItems[index];
    const targetGrade = prev?.targetGrade || "유물";
    const targetLevel = Number(prev?.targetLevel || 4);
    const missingBooks = getEngravingMissingBooks(grade, level, targetGrade, targetLevel);
    return {
      name: row.name,
      grade,
      level,
      targetGrade,
      targetLevel,
      enabled: missingBooks > 0,
      pricePerBook: prevProfile.engravingPricesByName?.[row.name] ?? prev?.pricePerBook ?? prevProfile.engraving.cost,
      missingBooks,
      gainPercent: prev?.gainPercent ?? Math.max(0.05, Number(prevProfile.engraving.gainPercent || 0) / Math.max(1, importedEngravings.length || 1)),
    };
  });
  const avatarItems = makeAvatarSlotRows(systems?.avatars ?? [], prevProfile, data.className);

  return syncAvatarSummaryFromItems({
    ...prevProfile,
    equipment: prevProfile.equipment.map((row) => {
      const piece = importedPieceMap.get(row.slot);
      const currentHoning = Number(piece?.honingLevel || row.currentHoning || 0);
      const currentAdvanced = Number(piece?.advancedRefiningLevel || row.currentAdvanced || 0);
      const nextAdvancedTarget =
        currentAdvanced >= 40 ? currentAdvanced : getNextAdvancedRefiningBreak(currentAdvanced, 40);
      return {
        ...row,
        baseHoning: currentHoning,
        currentHoning,
        baseAdvanced: currentAdvanced,
        currentAdvanced,
        targetHoning: Math.max(row.targetHoning || 0, currentHoning + 1),
        targetAdvanced: Math.max(row.targetAdvanced || 0, nextAdvancedTarget),
      };
    }),
    gems: nextGems,
    engravingItems,
    avatarItems,
    accessoryItems,
    braceletItems,
    avatar: {
      ...prevProfile.avatar,
      currentLabel: avatarItems.length
        ? avatarItems.map((row) => `${row.slot} ${row.grade}`).join(" / ")
        : systems?.avatarCount ? `착용 ${systems.avatarCount}개 / 등급 ${systems.avatarGradeLevel}` : prevProfile.avatar.currentLabel,
      targetLabel: avatarItems.some((row) => row.enabled) ? "부위별 전설 아바타 보정" : "현재 유지",
      enabled: avatarItems.some((row) => row.enabled),
    },
    accessory: {
      ...prevProfile.accessory,
      currentLabel: accessoryLabel,
      targetLabel: accessoryEffects.length ? "상위 유효 옵션/품질 보정" : "유효 옵션 1단계 보정",
      enabled: true,
    },
    bracelet: {
      ...prevProfile.bracelet,
      currentLabel: braceletRow?.effects?.join(" / ") || prevProfile.bracelet.currentLabel,
      targetLabel: "추천 제외",
      enabled: false,
      cost: 0,
      gainPercent: 0,
    },
    engraving: {
      ...prevProfile.engraving,
      currentLabel: engravingItems.length
        ? engravingItems.map((row) => `${row.name} ${row.grade}${row.level ? ` Lv.${row.level}` : ""}`).slice(0, 5).join(" / ")
        : systems?.engravingNames?.length ? systems.engravingNames.slice(0, 5).join(" / ") : prevProfile.engraving.currentLabel,
      targetLabel: "각인서 완료/수동 입력",
      enabled: engravingItems.some((row) => row.enabled),
    },
    arkGrid: {
      ...prevProfile.arkGrid,
      currentLabel: arkGridLabel,
      targetLabel: "추천 제외",
      enabled: false,
      cost: 0,
      gainPercent: 0,
    },
    arkPassive: {
      ...prevProfile.arkPassive,
      currentLabel: arkPassiveLabel,
      targetLabel: "추천 제외",
      enabled: false,
      cost: 0,
      gainPercent: 0,
    },
  });
}

function isEquipmentRangeAlreadyInRoute(
  routeSteps: RefiningRouteStep[],
  slot: EquipmentSlot,
  action: RefiningRouteStep["action"],
  fromLevel: number,
  toLevel: number
) {
  if (toLevel <= fromLevel) return false;
  for (let level = fromLevel; level < toLevel; level += 1) {
    const covered = routeSteps.some(
      (step) => step.slot === slot && step.action === action && step.fromLevel <= level && step.toLevel >= level + 1
    );
    if (!covered) return false;
  }
  return true;
}

function buildGeneratedCombatOptions(
  state: CombatPlannerState,
  pieces: GrowthPlannerState["character"]["pieces"],
  includedRouteSteps: RefiningRouteStep[] = [],
  market?: MarketPriceSnapshot,
  materials?: MaterialInventory
): CombatUpgradeOption[] {
  const options: CombatUpgradeOption[] = [];
  const pieceMap = new Map(pieces.map((piece) => [piece.slot, { ...piece }]));

  includedRouteSteps.forEach((step) => {
    const piece = pieceMap.get(step.slot);
    if (!piece) return;
    if (step.action === "normal") {
      piece.honingLevel = step.toLevel;
      piece.itemLevel = Math.max(Number(piece.itemLevel || 0), Number(piece.itemLevel || 0) + Math.max(0, step.toLevel - step.fromLevel) * 5);
      return;
    }
    if (step.action === "advanced") {
      piece.advancedRefiningLevel = step.toLevel;
      piece.itemLevel = Math.max(Number(piece.itemLevel || 0), Number(piece.itemLevel || 0) + Math.max(0, step.toLevel - step.fromLevel));
      return;
    }
    if (step.action === "transfer") {
      piece.honingLevel = step.toLevel;
      piece.advancedRefiningLevel = 0;
      piece.tierLabel = "전율";
      piece.itemLevel = Math.max(Number(piece.itemLevel || 0), 1675 + step.toLevel * 5);
    }
  });

  state.profile.equipment.forEach((row) => {
    if (!state.enabledCategories["장비"]) return;
    if (!row.enabled) return;
    const piece = pieceMap.get(row.slot);
    const currentHoning = Number(piece?.honingLevel || row.currentHoning || 0);
    const currentAdvanced = Number(piece?.advancedRefiningLevel || row.currentAdvanced || 0);
    const transferredInRoute = includedRouteSteps.some((step) => step.slot === row.slot && step.action === "transfer");
    const rawTargetHoning = Number(row.targetHoning || currentHoning);
    const defaultOldTarget = Number(row.baseHoning || row.currentHoning || currentHoning) + 1;
    const targetHoning = transferredInRoute && rawTargetHoning <= defaultOldTarget ? currentHoning + 1 : Math.max(currentHoning, rawTargetHoning);
    const targetAdvanced = transferredInRoute ? currentAdvanced : Math.max(currentAdvanced, Number(row.targetAdvanced || currentAdvanced));

    let advancedLevel = currentAdvanced;
    while (advancedLevel < targetAdvanced) {
      const nextAdvancedLevel = getNextAdvancedRefiningBreak(advancedLevel, targetAdvanced);
      const advancedStepCount = Math.max(1, nextAdvancedLevel - advancedLevel);
      if (isEquipmentRangeAlreadyInRoute(includedRouteSteps, row.slot, "advanced", advancedLevel, nextAdvancedLevel)) {
        advancedLevel = nextAdvancedLevel;
        continue;
      }
      options.push(
        makeCombatOption({
          id: `auto-equipment-${row.slot}-advanced-${advancedLevel}-${nextAdvancedLevel}`,
          name: `${SLOT_NAMES[row.slot]} 상급재련 ${advancedLevel} -> ${nextAdvancedLevel}`,
          category: "장비",
          detail: "상급재련 후보 · 보조 재료/선조턴은 보정값 기준",
          fromTo: `상급재련 ${advancedLevel} -> ${nextAdvancedLevel}`,
          costPerStep: row.advancedCostPerStep * advancedStepCount,
          combatGainPercentPerStep: getAdvancedRefiningCombatGainPercent(row, advancedLevel, nextAdvancedLevel),
        })
      );
      advancedLevel = nextAdvancedLevel;
    }

    for (let level = currentHoning; level < targetHoning; level += 1) {
      if (isEquipmentRangeAlreadyInRoute(includedRouteSteps, row.slot, "normal", level, level + 1)) continue;
      const weaponText = row.slot === "weapon" ? "무기" : SLOT_NAMES[row.slot];
      const isSuccessor = String(piece?.tierLabel || "").includes("전율") || String(piece?.tierLabel || "").includes("상위");
      const simulatedPiece = {
        ...(piece ?? {
          slot: row.slot,
          itemLevel: 0,
          tierLabel: "",
          honingLevel: level,
          advancedRefiningLevel: currentAdvanced,
          artisanEnergy: 0,
          currentRefiningExp: 0,
          supportBonusPercent: 0,
        }),
        honingLevel: level,
        advancedRefiningLevel: isSuccessor ? 0 : currentAdvanced,
        tierLabel: isSuccessor ? "전율" : piece?.tierLabel || "",
        itemLevel: isSuccessor ? 1675 + level * 5 : 1590 + level * 5 + currentAdvanced,
      };
      const estimatedStep =
        market && materials ? estimateRefiningStep(simulatedPiece, "normal", market, materials) : null;
      const estimatedCost = estimatedStep && estimatedStep.averageCost > 0 ? estimatedStep.averageCost : row.normalCostPerStep;
      options.push(
        makeCombatOption({
          id: `auto-equipment-${row.slot}-normal-${level}-${level + 1}`,
          name: isSuccessor ? `${weaponText} 계승 후 ${level}강 -> ${level + 1}강` : `${weaponText} +${level} -> +${level + 1}`,
          category: "장비",
          detail: estimatedStep
            ? "아이스펭 기대비용 기준 · 현재 시세/보유 재료 반영"
            : isSuccessor
              ? "계승 후 전율 장비 재련 테이블과 상위 재료 시세 기준"
            : row.slot === "weapon"
              ? "노숨/풀숨 평균 비용은 후보 비용값 기준"
              : "방어구 강화 평균 비용은 후보 비용값 기준",
          fromTo: isSuccessor ? `계승 후 ${level}강 -> ${level + 1}강` : `+${level} -> +${level + 1}`,
          costPerStep: estimatedCost,
          combatGainPercentPerStep: row.normalGainPercent,
        })
      );
    }
  });

  state.profile.gems.forEach((row, index) => {
    if (!state.enabledCategories["보석"]) return;
    const currentLevel = Math.max(0, Number(row.currentLevel || 0));
    const targetLevel = Math.max(currentLevel, 10);
    for (let level = currentLevel; level < targetLevel; level += 1) {
      options.push(
        makeCombatOption({
          id: `auto-gem-${row.id}-${level}-${level + 1}`,
          name: formatGemUpgradeName(row, level, index),
          category: "보석",
          detail: getGemCostDetail(state.profile, row, level),
          fromTo: `${level}Lv -> ${level + 1}Lv`,
          costPerStep: getGemStepCost(state.profile, row, level),
          combatGainPercentPerStep: getGemCombatGainPercent(row, level),
        })
      );
    }
  });

  if (state.enabledCategories["악세"] && state.profile.accessory.enabled) {
    const upgradeRows = getAccessoryUpgradeRows(state.profile);
    if (upgradeRows.length) {
      const gainPerItem = Math.max(0, Number(state.profile.accessory.gainPercent || 0)) / Math.max(1, upgradeRows.length);
      upgradeRows.forEach((row) => {
        const purchaseGuide = formatAccessoryCandidateGuide(row.part, row.target);
        options.push(
          makeCombatOption({
            id: `auto-accessory-${row.index}-${makeCombatSlug(row.displayName, String(row.index))}`,
            name: `${row.displayName} 더 좋은 악세로 교체`,
            category: "악세",
            detail: `${row.reason} · ${row.currentDetail} -> ${purchaseGuide}`,
            fromTo: `${row.displayName}: ${row.currentDetail} -> ${purchaseGuide}`,
            costPerStep: Number(row.target.buyPrice || 0),
            combatGainPercentPerStep: gainPerItem,
          })
        );
      });
    }
  }

  if (state.enabledCategories["아바타"] && state.profile.avatar.enabled) {
    const avatarItems = state.profile.avatarItems ?? [];
    if (avatarItems.length) {
      avatarItems.forEach((row, index) => {
        if (!row.enabled || isAvatarGradeComplete(row.grade, row.targetGrade)) return;
        options.push(
          makeCombatOption({
            id: `auto-avatar-${row.id || index}`,
            name: `${row.slot} 아바타 ${row.grade} -> ${row.targetGrade}`,
            category: "아바타",
            detail: `${row.name} · 부위별 아바타 등급 보정`,
            fromTo: `${row.slot}: ${row.grade} -> ${row.targetGrade}`,
            costPerStep: Math.max(0, Number(row.cost || 0)),
            combatGainPercentPerStep: Math.max(0, Number(row.gainPercent || 0)),
          })
        );
      });
    } else {
      options.push(
        makeCombatOption({
          id: "auto-avatar",
          name: "아바타 공격력 계열 보정",
          category: "아바타",
          detail: `${state.profile.avatar.currentLabel} -> ${state.profile.avatar.targetLabel}`,
          fromTo: `${state.profile.avatar.currentLabel} -> ${state.profile.avatar.targetLabel}`,
          costPerStep: state.profile.avatar.cost,
          combatGainPercentPerStep: state.profile.avatar.gainPercent,
        })
      );
    }
  }

  if (state.enabledCategories["각인"] && state.profile.engraving.enabled) {
    const engravingItems = state.profile.engravingItems ?? [];
    if (engravingItems.length) {
      engravingItems.forEach((row, index) => {
        if (!row.enabled || isEngravingComplete(row) || Number(row.missingBooks || 0) <= 0) return;
        const pricePerBook = Number(state.profile.engravingPricesByName?.[row.name] || row.pricePerBook || 0);
        options.push(
          makeCombatOption({
            id: `auto-engraving-${makeCombatSlug(row.name, String(index))}`,
            name: `${row.name} ${row.targetGrade} 각인서`,
            category: "각인",
            detail: `${row.grade || "미확인"}${row.level ? ` Lv.${row.level}` : ""} -> ${row.targetGrade} Lv.${row.targetLevel} · ${row.missingBooks}권`,
            fromTo: `${row.name}: ${row.grade || "미확인"}${row.level ? ` Lv.${row.level}` : ""} -> ${row.targetGrade} Lv.${row.targetLevel}`,
            costPerStep: Math.max(0, pricePerBook) * Math.max(0, Number(row.missingBooks || 0)),
            combatGainPercentPerStep: Math.max(0, Number(row.gainPercent || 0)),
          })
        );
      });
    } else {
      options.push(
        makeCombatOption({
          id: "auto-engraving",
          name: "각인 효율 상향",
          category: "각인",
          detail: `${state.profile.engraving.currentLabel} -> ${state.profile.engraving.targetLabel}`,
          fromTo: `${state.profile.engraving.currentLabel} -> ${state.profile.engraving.targetLabel}`,
          costPerStep: state.profile.engraving.cost,
          combatGainPercentPerStep: state.profile.engraving.gainPercent,
        })
      );
    }
  }

  const toggleRows: Array<[keyof Pick<CombatProfileInputs, "avatar" | "accessory" | "bracelet" | "engraving">, string, string]> = [
    ["bracelet", "팔찌 고정 공격력/추가 피해 보정", "팔찌"],
  ];

  toggleRows.forEach(([key, name, category]) => {
    const row = state.profile[key];
    if (!state.enabledCategories[category as CombatCategory]) return;
    if (!row.enabled) return;
    const optionName = name;
    const optionDetail = `${row.currentLabel} -> ${row.targetLabel}`;
    options.push(
      makeCombatOption({
        id: `auto-${key}`,
        name: optionName,
        category,
        detail: optionDetail,
        fromTo: optionDetail,
        costPerStep: row.cost,
        combatGainPercentPerStep: row.gainPercent,
      })
    );
  });

  return options.filter((option) => !isExcludedCombatRecommendation(option));
}

function estimateLevelPlanCombatGainPercent(routeSteps: RefiningRouteStep[], profile: CombatProfileInputs) {
  const equipmentBySlot = new Map(profile.equipment.map((row) => [row.slot, row]));
  return routeSteps.reduce((sum, step) => {
    const row = equipmentBySlot.get(step.slot);
    if (!row || !row.enabled) return sum;
    if (step.action === "transfer") return sum;
    const levelCount = Math.max(1, Math.abs(Number(step.toLevel || 0) - Number(step.fromLevel || 0)));
    if (step.action === "advanced") {
      return sum + getAdvancedRefiningCombatGainPercent(row, step.fromLevel, step.toLevel);
    }
    return sum + Math.max(0, Number(row.normalGainPercent || 0)) * levelCount;
  }, 0);
}

function buildCombatUpgradePlan(
  state: CombatPlannerState,
  options: CombatUpgradeOption[],
  levelPlanCost: number
): {
  projectedCombatPower: number;
  requiredGainPercent: number;
  selectedGainPercent: number;
  upgradeCost: number;
  totalCost: number;
  picks: CombatPlanPick[];
  reachable: boolean;
} {
  const currentCombatPower = Math.max(0, Number(state.currentCombatPower || 0));
  const targetCombatPower = Math.max(0, Number(state.targetCombatPower || 0));
  const projectedCombatPower = currentCombatPower * (1 + Math.max(0, Number(state.levelGrowthCombatPercent || 0)) / 100);

  if (currentCombatPower <= 0 || targetCombatPower <= 0 || projectedCombatPower >= targetCombatPower) {
    return {
      projectedCombatPower,
      requiredGainPercent: 0,
      selectedGainPercent: 0,
      upgradeCost: 0,
      totalCost: levelPlanCost,
      picks: [],
      reachable: targetCombatPower <= 0 || projectedCombatPower >= targetCombatPower,
    };
  }

  const requiredGainPercent = ((targetCombatPower / projectedCombatPower) - 1) * 100;
  const candidateOptions = options.filter((option) => !isExcludedCombatRecommendation(option));
  const scale = 100;
  const requiredUnits = Math.ceil(requiredGainPercent * scale);
  const maxUnits = Math.max(
    requiredUnits,
    Math.ceil(candidateOptions.reduce((sum, option) => sum + option.availableSteps * option.combatGainPercentPerStep, 0) * scale)
  );
  const dp: Array<{ cost: number; counts: Record<string, number>; gainUnits: number } | null> = Array.from({ length: maxUnits + 1 }, () => null);
  dp[0] = { cost: 0, counts: {}, gainUnits: 0 };

  candidateOptions.forEach((option) => {
    const stepCount = Math.max(0, Math.floor(option.availableSteps || 0));
    const gainUnits = Math.max(0, Math.round((option.combatGainPercentPerStep || 0) * scale));
    const cost = Math.max(0, option.costPerStep || 0);
    if (stepCount <= 0 || gainUnits <= 0) return;

    for (let count = 0; count < stepCount; count += 1) {
      const next = dp.map((entry) => (entry ? { cost: entry.cost, counts: { ...entry.counts }, gainUnits: entry.gainUnits } : null));
      dp.forEach((entry, units) => {
        if (!entry) return;
        const targetUnits = Math.min(maxUnits, units + gainUnits);
        const nextCost = entry.cost + cost;
        const existing = next[targetUnits];
        if (!existing || nextCost < existing.cost) {
          next[targetUnits] = {
            cost: nextCost,
            counts: { ...entry.counts, [option.id]: (entry.counts[option.id] || 0) + 1 },
            gainUnits: targetUnits,
          };
        }
      });
      next.forEach((entry, index) => {
        dp[index] = entry;
      });
    }
  });

  const makePicks = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([optionId, count]) => {
        const option = state.options.find((entry) => entry.id === optionId);
        const generatedOption = candidateOptions.find((entry) => entry.id === optionId);
        const resolvedOption = generatedOption ?? option;
        if (!resolvedOption || count <= 0) return null;
        return {
          option: resolvedOption,
          count,
          totalCost: count * resolvedOption.costPerStep,
          totalGainPercent: count * resolvedOption.combatGainPercentPerStep,
        };
      })
      .filter(Boolean) as CombatPlanPick[];

  const bestReachable = dp
    .slice(requiredUnits)
    .filter((entry): entry is { cost: number; counts: Record<string, number>; gainUnits: number } => Boolean(entry))
    .sort((a, b) => a.cost - b.cost || a.gainUnits - b.gainUnits)[0];
  const bestPartial = dp
    .filter((entry): entry is { cost: number; counts: Record<string, number>; gainUnits: number } => entry != null && entry.gainUnits > 0)
    .sort((a, b) => b.gainUnits - a.gainUnits || a.cost - b.cost)[0];
  const best = bestReachable ?? bestPartial;

  if (!best) {
    return {
      projectedCombatPower,
      requiredGainPercent,
      selectedGainPercent: 0,
      upgradeCost: 0,
      totalCost: levelPlanCost,
      picks: [],
      reachable: false,
    };
  }

  const picks = makePicks(best.counts);

  return {
    projectedCombatPower,
    requiredGainPercent,
    selectedGainPercent: best.gainUnits / scale,
    upgradeCost: best.cost,
    totalCost: levelPlanCost + best.cost,
    picks,
    reachable: Boolean(bestReachable),
  };
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

function makeEmptyMaterialInventory(): MaterialInventory {
  return { ...makeEmptyPlannerState().materials };
}

function normalizeMaterialInventory(raw: unknown): MaterialInventory {
  const base = makeEmptyMaterialInventory();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Partial<Record<keyof MaterialInventory, unknown>>;

  return Object.fromEntries(
    Object.entries(base).map(([key, defaultValue]) => {
      const value = Number(source[key as keyof MaterialInventory] ?? defaultValue);
      return [key, Number.isFinite(value) ? value : defaultValue];
    })
  ) as MaterialInventory;
}

function characterMaterialsStorageKey(tableId: string, charId: string) {
  return `${CHARACTER_MATERIALS_STORAGE_PREFIX}:${encodeURIComponent(tableId)}:${encodeURIComponent(charId)}`;
}

function loadCharacterMaterials(tableId: string, charId: string): MaterialInventory | null {
  if (!tableId || !charId) return null;

  try {
    const raw = localStorage.getItem(characterMaterialsStorageKey(tableId, charId));
    if (!raw) return null;
    return normalizeMaterialInventory(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveCharacterMaterials(tableId: string, charId: string, materials: MaterialInventory) {
  if (!tableId || !charId) return;

  try {
    localStorage.setItem(characterMaterialsStorageKey(tableId, charId), JSON.stringify(normalizeMaterialInventory(materials)));
  } catch {
    // Ignore quota failures so the planner itself can keep working.
  }
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
      ...normalizeMaterialInventory(parsed.materials),
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

function formatCompactGold(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "0G";
  if (Math.abs(rounded) >= 10000) {
    const man = Math.round((rounded / 10000) * 10) / 10;
    return `${man.toLocaleString()}만`;
  }
  return `${rounded.toLocaleString()}G`;
}

function formatCompactWon(value: number) {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded <= 0) return "";
  if (rounded >= 10000) {
    const man = Math.round((rounded / 10000) * 10) / 10;
    return `약 ${man.toLocaleString()}만 원`;
  }
  return `약 ${rounded.toLocaleString()}원`;
}

function getCombatActionGuide(option: CombatUpgradeOption) {
  if (option.category === "악세") return option.fromTo;
  if (option.category === "장비") return `${option.name} 진행 · ${option.fromTo}`;
  if (option.category === "보석") return `${option.name} 교체/합성 · ${option.fromTo}`;
  if (option.category === "각인") return `${option.name} 구매/학습 · ${option.fromTo}`;
  if (option.category === "아바타") return `${option.name} 구매/교체 · ${option.fromTo}`;
  if (option.category === "아크그리드" || option.category === "아크패시브") return `${option.name} · ${option.fromTo}`;
  if (option.category === "팔찌") return `${option.name} · ${option.fromTo}`;
  return `${option.name} · ${option.fromTo}`;
}

function goldToCash(gold: number, cashPer100Gold: number) {
  const goldValue = Math.max(0, Number(gold || 0));
  const rate = Math.max(0, Number(cashPer100Gold || 0));
  return (goldValue / 100) * rate;
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
    if (step.hidden || step.action === "transfer") return;
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
  if (step.action === "normal") {
    return step.materialFamily === "successor" ? `계승 후 ${step.fromLevel}강 → ${step.toLevel}강` : `강화 ${step.fromLevel} → ${step.toLevel}`;
  }
  if (step.action === "advanced") return `상급재련 ${step.fromLevel} → ${step.toLevel}`;
  return `계승 후 ${step.toLevel}강`;
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
  if (hasRouteMaterials(step.expectedMaterials)) return step.expectedMaterials;
  if (step.action === "transfer") return {};
  if (step.action !== "advanced") {
    const isWeapon = step.slot === "weapon";
    const level = Math.max(0, Number(step.fromLevel || 0));
    const count = Math.max(1, Math.ceil(Math.max(0, step.toLevel - step.fromLevel)));
    const successor = step.materialFamily === "successor";
    const armorRows = [
      { min: 0, shards: 18000, leapstones: 36, stones: 900, fusion: 18, breath: 0 },
      { min: 11, shards: 26000, leapstones: 48, stones: 1300, fusion: 24, breath: 20 },
      { min: 13, shards: 32000, leapstones: 58, stones: 1650, fusion: 30, breath: 25 },
      { min: 15, shards: 41000, leapstones: 72, stones: 2100, fusion: 38, breath: 25 },
      { min: 20, shards: 52000, leapstones: 90, stones: 2700, fusion: 48, breath: 25 },
    ];
    const weaponRows = [
      { min: 0, shards: 26000, leapstones: 54, stones: 900, fusion: 28, breath: 0 },
      { min: 11, shards: 42000, leapstones: 84, stones: 1400, fusion: 42, breath: 20 },
      { min: 13, shards: 52000, leapstones: 102, stones: 1800, fusion: 52, breath: 25 },
      { min: 15, shards: 68000, leapstones: 128, stones: 2350, fusion: 66, breath: 25 },
      { min: 20, shards: 84000, leapstones: 160, stones: 3000, fusion: 82, breath: 25 },
    ];
    const row = [...(isWeapon ? weaponRows : armorRows)].reverse().find((item) => level >= item.min) ?? armorRows[0];
    if (successor) {
      return {
        shards: row.shards * count,
        successorLeapstones: row.leapstones * count,
        successorProtectionStones: isWeapon ? 0 : row.stones * count,
        successorDestructionStones: isWeapon ? row.stones * count : 0,
        superiorFusion: row.fusion * count,
        iceBreaths: isWeapon ? 0 : row.breath * count,
        lavaBreaths: isWeapon ? row.breath * count : 0,
      };
    }
    return {
      shards: row.shards * count,
      leapstones: row.leapstones * count,
      protectionStones: isWeapon ? 0 : row.stones * count,
      destructionStones: isWeapon ? row.stones * count : 0,
      fusion: row.fusion * count,
      iceBreaths: isWeapon ? 0 : row.breath * count,
      lavaBreaths: isWeapon ? row.breath * count : 0,
    };
  }

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
  if (step.action === "transfer") return "계승";
  const bookType = step.slot === "weapon" ? "야금술" : "재봉술";
  if (step.action === "advanced") {
    const stage = step.fromLevel < 10 ? 1 : step.fromLevel < 20 ? 2 : step.fromLevel < 30 ? 3 : 4;
    return `장인의 ${bookType}: ${stage}단계`;
  }

  const familyName = step.materialFamily === "successor" ? "전율" : "업화";
  return `${bookType} : ${familyName} [${step.fromLevel}-${step.toLevel}]`;
}

function maxBreathPerTryForStep(step: DisplayRouteStep) {
  if (step.action === "transfer") return 0;
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

function formatRouteMaterialUsageSummary(row: RouteMaterialUsageRow | undefined) {
  if (!row || row.required <= 0) return "";
  const parts = [
    row.boundUsed > 0 ? `${row.singleInventoryLabel || "귀속"} ${formatCount(row.boundUsed)}개` : "",
    row.tradableUsed > 0 ? `거래가능 ${formatCount(row.tradableUsed)}개` : "",
    row.purchaseNeeded > 0 ? `구매 ${formatCount(row.purchaseNeeded)}개` : "",
  ].filter(Boolean);
  return `예상 소모 ${formatCount(row.required)}개${parts.length ? ` (${parts.join(" + ")})` : ""}`;
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
  if (step.action === "transfer") {
    return ["계승은 재련 재료를 소모하지 않는 전환 단계로 0G 처리하고, 다음 강화부터 전율 장비 재련 테이블과 상위 재료 시세를 사용해."];
  }
  const breathKey = step.slot === "weapon" ? "lavaBreaths" : "iceBreaths";
  const bookKey = step.slot === "weapon" ? "metallurgyBooks" : "tailoringBooks";
  const breathLabel = step.slot === "weapon" ? "용암의 숨결" : "빙하의 숨결";
  const bookLabel = supportBookNameForStep(step);
  const breathRow = rows.find((row) => row.key === breathKey);
  const bookRow = rows.find((row) => row.key === bookKey);
  const usesBreath = Boolean(breathRow && breathRow.required > 0);
  const usesBook = Boolean(bookRow && bookRow.required > 0);
  const maxBreath = maxBreathPerTryForStep(step);
  const breathUsage = formatRouteMaterialUsageSummary(breathRow);
  const bookUsage = formatRouteMaterialUsageSummary(bookRow);
  const breathPrice = marketUnitPriceForRouteKey(breathKey, market);
  const bookPrice = marketUnitPriceForRouteKey(bookKey, market);
  const breathGuidePrice = breathPrice > 0 ? breathPrice : step.action === "advanced" ? 1 : 1;
  const bookGuidePrice = bookPrice > 0 ? bookPrice : 1;

  if (!usesBreath && !usesBook) {
    return [
      `현재 시세와 보유 재료 기준으로는 ${breathLabel}은 ${formatGold(breathGuidePrice)} 이하, ${bookLabel}은 ${formatGold(bookGuidePrice)} 이하일 때 넣는 쪽을 다시 비교해보는 걸 추천해.`,
      "현재 입력값 기준으로는 보조 재료 소모량이 0개라 후보 비용에는 포함되지 않았어.",
    ];
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

  if (usesBreath && breathUsage) guides.push(`${breathLabel}: ${breathUsage}`);
  if (usesBook && bookUsage) guides.push(`${bookLabel}: ${bookUsage}`);

  if (usesBreath && breathPrice > 0) {
    guides.push(`${breathLabel}은 현재 입력가 기준 ${formatGold(breathPrice)} 이하일 때 구매해서 넣는 경로가 효율로 선택돼.`);
  } else if (usesBreath) {
    guides.push(`${breathLabel} 시세를 거래소 시세 탭에 입력하면 구매 효율 기준을 같이 보여줘.`);
  }

  if (usesBook && bookPrice > 0) {
    guides.push(`${bookLabel}은 현재 입력가 기준 ${formatGold(bookPrice)} 이하일 때 사용하는 경로가 선택된 상태야.`);
  }

  guides.push("표시된 필요 개수는 평균 소모량이라 실제 성공 타이밍에 따라 조금 달라질 수 있어.");
  return guides;
}

function getCombatEquipmentMaterialPreview(
  option: CombatUpgradeOption,
  pieces: GrowthPlannerState["character"]["pieces"],
  inventory: MaterialInventory,
  market: MarketPriceSnapshot
) {
  const match = option.id.match(/^auto-equipment-([a-z]+)-(normal|advanced)-(\d+)-(\d+)$/);
  if (!match) return null;
  const slot = match[1] as EquipmentSlot;
  const action = match[2] as RefiningRouteStep["action"];
  const fromLevel = Number(match[3] || 0);
  const toLevel = Number(match[4] || 0);
  const piece = pieces.find((row) => row.slot === slot);
  const materialFamily: MaterialFamily =
    String(piece?.tierLabel || "").includes("전율") || Number(piece?.itemLevel || 0) >= 1735 ? "successor" : "legacy";
  const step: DisplayRouteStep = {
    slot,
    slotLabel: SLOT_NAMES[slot],
    itemName: `${piece?.tierLabel || ""} ${SLOT_NAMES[slot]} 장비`.trim(),
    action,
    fromLevel,
    toLevel,
    materialFamily,
    averageCost: option.costPerStep,
    directGold: option.costPerStep,
    expectedMaterials: {},
    levelGain: action === "normal" ? 5 / 6 : Math.max(1, toLevel - fromLevel) / 6,
    efficiency: option.costPerStep,
    supportName: "",
    supportWorthUsing: null,
    supportSavedGold: 0,
    notes: [],
    originalIndexes: [],
  };
  const usageRows = getRouteMaterialUsageRows(step, inventory);
  return {
    usageRows,
    supportGuides: getRouteSupportTimingGuides(step, usageRows, market),
  };
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
  const [gemPriceLoading, setGemPriceLoading] = useState(false);
  const [gemPriceSummary, setGemPriceSummary] = useState<GemAuctionPriceResponse | null>(null);
  const [gemPriceError, setGemPriceError] = useState("");
  const [accessoryPriceLoading, setAccessoryPriceLoading] = useState(false);
  const [accessoryPriceSummary, setAccessoryPriceSummary] = useState<AccessoryAuctionPriceResponse | null>(null);
  const [accessoryPriceError, setAccessoryPriceError] = useState("");
  const [engravingPriceLoading, setEngravingPriceLoading] = useState(false);
  const [engravingPriceSummary, setEngravingPriceSummary] = useState<EngravingMarketPriceResponse | null>(null);
  const [engravingPriceError, setEngravingPriceError] = useState("");
  const [avatarPriceLoading, setAvatarPriceLoading] = useState(false);
  const [avatarPriceSummary, setAvatarPriceSummary] = useState<AvatarMarketPriceResponse | null>(null);
  const [avatarPriceError, setAvatarPriceError] = useState("");
  const [plannerModeTab, setPlannerModeTab] = useState<PlannerModeTab>("level");
  const [combatPlanner, setCombatPlanner] = useState<CombatPlannerState>(() => loadCombatPlanner());
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
  const [goldCashRate, setGoldCashRate] = useState(() => {
    try {
      return Number(localStorage.getItem(GOLD_CASH_RATE_STORAGE_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const [selectedWaitWeeks, setSelectedWaitWeeks] = useState(0);
  const [confirmedDraft, setConfirmedDraft] = useState<Pick<ConfirmedUpgrade, "slot" | "action" | "targetLevel">>({
    slot: "weapon",
    action: "advanced",
    targetLevel: 40,
  });
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
  const autoCombatImportRef = useRef("");

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
  const currentWeeklyTradableGold = currentRaidGold.tradableGold;
  const currentWeeklyBoundGold = tradableOnlyEstimate ? 0 : currentRaidGold.boundGold;
  const currentWeeklyGoldForEstimate = tradableOnlyEstimate ? currentRaidGold.tradableGold : currentRaidGold.totalGold;
  const targetWeeklyGoldForEstimate = tradableOnlyEstimate ? targetRaidGold.tradableGold : targetRaidGold.totalGold;
  const estimateInput = useMemo(() => {
    return {
      ...planner,
      character: {
        ...planner.character,
        currentWeeklyGold: currentWeeklyGoldForEstimate,
        targetWeeklyGold: targetWeeklyGoldForEstimate,
        currentWeeklyBoundGold,
      },
      materials: {
        ...effectiveMaterials,
        boundGold: tradableOnlyEstimate ? 0 : effectiveMaterials.boundGold,
      },
    };
  }, [currentWeeklyBoundGold, currentWeeklyGoldForEstimate, effectiveMaterials, planner, targetWeeklyGoldForEstimate, tradableOnlyEstimate]);
  const deferredEstimateInput = useDeferredValue(estimateInput);
  const preliminaryEstimate = useMemo(() => estimateGrowthPlan(deferredEstimateInput), [deferredEstimateInput]);
  const cathedralExchangePlan = useMemo(
    () =>
      buildCathedralExchangePlan(
        preliminaryEstimate.requiredMaterials,
        deferredEstimateInput.materials,
        deferredEstimateInput.market,
        cathedralStage,
        cathedralExtraReward
      ),
    [cathedralExtraReward, cathedralStage, deferredEstimateInput.market, deferredEstimateInput.materials, preliminaryEstimate.requiredMaterials]
  );
  const finalEstimateInput = useMemo(
    () => ({ ...deferredEstimateInput, materials: applyCathedralExchangePlan(deferredEstimateInput.materials, cathedralExchangePlan) }),
    [cathedralExchangePlan, deferredEstimateInput]
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
  const confirmedUpgrades = planner.character.confirmedUpgrades ?? [];
  const confirmedDraftBaseLevel = getConfirmedBaseLevel(confirmedDraft.slot, confirmedDraft.action);
  const displayMaterialPurchaseCost = useMemo(
    () => getRequiredMaterialPurchaseCost(estimate.requiredMaterials, finalEstimateInput.materials, finalEstimateInput.market),
    [estimate.requiredMaterials, finalEstimateInput.market, finalEstimateInput.materials]
  );
  const displayedTotalSpendGold = Math.max(0, estimate.directGoldCost + displayMaterialPurchaseCost);
  const autoLevelGrowthCombatPercent = useMemo(
    () => estimateLevelPlanCombatGainPercent(estimate.routeSteps, combatPlanner.profile),
    [combatPlanner.profile, estimate.routeSteps]
  );
  const manualGemCombatGainPercent = useMemo(
    () => estimateManualGemCombatGainPercent(combatPlanner.profile.gems),
    [combatPlanner.profile.gems]
  );
  const manualEquipmentCombatGainPercent = useMemo(
    () => estimateManualEquipmentCombatGainPercent(combatPlanner.profile.equipment),
    [combatPlanner.profile.equipment]
  );
  const effectiveCombatPlanner = useMemo(
    () => ({
      ...combatPlanner,
      levelGrowthCombatPercent:
        Number(combatPlanner.levelGrowthCombatPercent || 0) > 0
          ? Number(combatPlanner.levelGrowthCombatPercent || 0)
          : autoLevelGrowthCombatPercent + manualGemCombatGainPercent + manualEquipmentCombatGainPercent,
    }),
    [autoLevelGrowthCombatPercent, combatPlanner, manualEquipmentCombatGainPercent, manualGemCombatGainPercent]
  );
  const generatedCombatOptions = useMemo(
    () => buildGeneratedCombatOptions(effectiveCombatPlanner, planner.character.pieces, estimate.routeSteps, planner.market, finalEstimateInput.materials),
    [effectiveCombatPlanner, estimate.routeSteps, finalEstimateInput.materials, planner.character.pieces, planner.market]
  );
  const combatPlan = useMemo(
    () => buildCombatUpgradePlan(effectiveCombatPlanner, generatedCombatOptions, displayedTotalSpendGold),
    [displayedTotalSpendGold, effectiveCombatPlanner, generatedCombatOptions]
  );
  const projectedFinalCombatPower = Math.round(
    combatPlan.projectedCombatPower * (1 + Math.max(0, combatPlan.selectedGainPercent) / 100)
  );
  const combatPriorityRows = useMemo(() => {
    let cumulativeGainPercent = 0;
    let cumulativeCost = displayedTotalSpendGold;
    let previousCombatPower = Math.round(combatPlan.projectedCombatPower);
    return [...combatPlan.picks]
      .filter((pick) => !isExcludedCombatRecommendation(pick.option))
      .sort((a, b) => a.totalCost - b.totalCost || a.totalCost / Math.max(0.0001, a.totalGainPercent) - b.totalCost / Math.max(0.0001, b.totalGainPercent))
      .map((pick, index) => {
        cumulativeGainPercent += pick.totalGainPercent;
        cumulativeCost += pick.totalCost;
        const expectedCombatPower = Math.round(combatPlan.projectedCombatPower * (1 + cumulativeGainPercent / 100));
        const combatPowerDelta = Math.max(0, expectedCombatPower - previousCombatPower);
        previousCombatPower = expectedCombatPower;
        return {
          pick,
          order: index + 1,
          cumulativeGainPercent,
          expectedCombatPower,
          combatPowerDelta,
          cumulativeCost,
          costPerPercent: pick.totalCost / Math.max(0.0001, pick.totalGainPercent),
        };
      });
  }, [combatPlan.picks, combatPlan.projectedCombatPower, displayedTotalSpendGold]);
  const combatGemBoardScore = useMemo(() => getGemBoardScore(combatPlanner.profile.gems), [combatPlanner.profile.gems]);
  const displayCurrentBoundGold = Math.max(0, Number(effectiveMaterials.boundGold || 0));
  const displayWeeklyBoundGold = Math.max(0, Number(planner.character.currentWeeklyBoundGold || 0));
  const displayBoundGoldUsableNow = Math.min(estimate.directGoldCost, displayCurrentBoundGold);
  const displayTradableGoldNeededNow = Math.max(0, displayMaterialPurchaseCost + Math.max(0, estimate.directGoldCost - displayCurrentBoundGold));
  const displayBoundGoldAffordableWeeks =
    estimate.directGoldCost <= displayCurrentBoundGold
      ? 0
      : displayWeeklyBoundGold > 0
        ? Math.ceil((estimate.directGoldCost - displayCurrentBoundGold) / displayWeeklyBoundGold)
        : null;
  const displayRecommendedWaitWeeks = displayBoundGoldAffordableWeeks ?? 0;
  const selectedWaitBoundGold = Math.max(
    0,
    displayCurrentBoundGold + Math.max(0, selectedWaitWeeks) * displayWeeklyBoundGold
  );
  const selectedWaitTradableGoldSaved = Math.max(0, selectedWaitWeeks) * currentWeeklyTradableGold;
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
    const saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedPlannerState(planner)));
      } catch {
        // Ignore quota failures so screen captures do not crash the page.
      }
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [planner]);

  useEffect(() => {
    try {
      localStorage.setItem(COMBAT_STORAGE_KEY, JSON.stringify(combatPlanner));
    } catch {
      // Ignore storage failures; the current session state still works.
    }
  }, [combatPlanner]);

  useEffect(() => {
    try {
      localStorage.setItem(GOLD_CASH_RATE_STORAGE_KEY, String(Math.max(0, Number(goldCashRate || 0))));
    } catch {
      // Ignore storage failures; the current session state still works.
    }
  }, [goldCashRate]);

  useEffect(() => {
    saveCharacterMaterials(planner.character.tableId, planner.character.charId, planner.materials);
  }, [planner.character.charId, planner.character.tableId, planner.materials]);

  useEffect(() => {
    if (!profileNickname.trim() && selectedCharacter?.name) {
      setProfileNickname(selectedCharacter.name);
    }
  }, [profileNickname, selectedCharacter?.name]);

  useEffect(() => {
    const nickname = (planner.character.characterName || profileNickname || selectedCharacter?.name || "").trim();
    if (!nickname || profileLoading) return;
    const avatarNeedsRefresh = needsAvatarImportRefresh(combatPlanner.profile);
    if (!avatarNeedsRefresh && (combatPlanner.profile.gems.length > 3 || profileSummary?.nickname === nickname)) return;
    const importKey = `${nickname}:${avatarNeedsRefresh ? "avatar" : "base"}`;
    if (autoCombatImportRef.current === importKey) return;
    autoCombatImportRef.current = importKey;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/growth/kloa-character?nickname=${encodeURIComponent(nickname)}&sync=${Date.now()}`);
        const data = (await response.json()) as CharacterImportResponse & { error?: string; detail?: string };
        if (cancelled || !response.ok || !data.ok) return;
        setProfileSummary(data);
        applyImportedCombatProfile(data);
      } catch {
        // Keep the manually edited profile if background sync fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    combatPlanner.profile.gems.length,
    combatPlanner.profile.avatarItems,
    planner.character.characterName,
    profileLoading,
    profileNickname,
    profileSummary?.nickname,
    selectedCharacter?.name,
  ]);

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
      if (prev.character.currentWeeklyGold === currentRaidGold.tradableGold && prev.character.currentWeeklyBoundGold === currentRaidGold.boundGold) {
        return prev;
      }
      return {
        ...prev,
        character: {
          ...prev.character,
          currentWeeklyGold: currentRaidGold.tradableGold,
          currentWeeklyBoundGold: currentRaidGold.boundGold,
        },
      };
    });
  }, [currentRaidGold.boundGold, currentRaidGold.tradableGold]);

  useEffect(() => {
    const targetIlvl = Number(planner.character.targetItemLevel || 0);
    setTargetRaidSelections((prev) => {
      const next = buildPlannerRaidSelections(targetIlvl, getDefaultPlannerRaidPick(targetIlvl, raidGoldBasis));
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [planner.character.targetItemLevel, raidGoldBasis]);

  useEffect(() => {
    setPlanner((prev) => {
      const targetWeeklyGold = raidGoldBasis === "tradable" ? targetRaidGold.tradableGold : targetRaidGold.totalGold;
      if (prev.character.targetWeeklyGold === targetWeeklyGold) return prev;
      return {
        ...prev,
        character: {
          ...prev.character,
          targetWeeklyGold,
        },
      };
    });
  }, [raidGoldBasis, targetRaidGold.totalGold, targetRaidGold.tradableGold]);

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

  function patchCombatPlanner(patch: Partial<CombatPlannerState>) {
    setCombatPlanner((prev) => ({
      ...prev,
      ...patch,
    }));
  }

  function toggleCombatCategory(category: CombatCategory, enabled: boolean) {
    setCombatPlanner((prev) => ({
      ...prev,
      enabledCategories: {
        ...prev.enabledCategories,
        [category]: enabled,
      },
    }));
  }

  function patchCombatOption(id: string, patch: Partial<CombatUpgradeOption>) {
    setCombatPlanner((prev) => ({
      ...prev,
      options: prev.options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
    }));
  }

  function patchCombatEquipment(slot: EquipmentSlot, patch: Partial<CombatEquipmentInput>) {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        equipment: prev.profile.equipment.map((row) => (row.slot === slot ? { ...row, ...patch } : row)),
      },
    }));
  }

  function patchCombatGem(id: string, patch: Partial<CombatGemInput>) {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        gems: prev.profile.gems.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      },
    }));
  }

  function setAllCombatGemLevels(level: number) {
    const normalizedLevel = Math.max(1, Math.min(10, Math.floor(Number(level) || 0)));
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        gems: prev.profile.gems.map((row) => ({
          ...row,
          currentLevel: normalizedLevel,
          targetLevel: Math.max(normalizedLevel, Number(row.targetLevel || normalizedLevel)),
        })),
      },
    }));
  }

  function patchCombatGemPrice(level: number, value: number) {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        gemPricesByLevel: {
          ...prev.profile.gemPricesByLevel,
          [String(level)]: Math.max(0, Number(value) || 0),
        },
      },
    }));
  }

  function patchCombatEngraving(name: string, patch: Partial<CombatEngravingInput>) {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        engravingItems: prev.profile.engravingItems.map((row) => (row.name === name ? { ...row, ...patch } : row)),
      },
    }));
  }

  function patchCombatAvatar(id: string, patch: Partial<CombatAvatarInput>) {
    setCombatPlanner((prev) => {
      const avatarItems = prev.profile.avatarItems.map((row) => (row.id === id ? { ...row, ...patch } : row));
      return {
        ...prev,
        profile: syncAvatarSummaryFromItems(prev.profile, avatarItems),
      };
    });
  }

  function applyImportedCombatProfile(data: CharacterImportResponse) {
    setCombatPlanner((prev) => {
      const importedCombatPower = Number(data.combatPower || 0);
      return {
        ...prev,
        currentCombatPower: importedCombatPower > 0 ? importedCombatPower : prev.currentCombatPower,
        targetCombatPower:
          prev.targetCombatPower > importedCombatPower
            ? prev.targetCombatPower
            : importedCombatPower > 0
              ? Math.ceil(importedCombatPower * 1.05)
              : prev.targetCombatPower,
        profile: buildCombatProfileFromImport(data, prev.profile),
      };
    });
  }

  function patchCombatToggle<K extends keyof Pick<CombatProfileInputs, "avatar" | "accessory" | "bracelet" | "engraving" | "arkGrid" | "arkPassive">>(
    key: K,
    patch: Partial<CombatToggleInput>
  ) {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        [key]: {
          ...prev.profile[key],
          ...patch,
        },
      },
    }));
  }

  function resetCombatProfile() {
    setCombatPlanner((prev) => ({
      ...prev,
      profile: makeDefaultCombatProfile(),
    }));
  }

  function resetCombatOptions() {
    setCombatPlanner((prev) => ({
      ...prev,
      options: DEFAULT_COMBAT_OPTIONS.map((option) => ({ ...option })),
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

  function getConfirmedBaseLevel(slot: EquipmentSlot, action: ConfirmedUpgrade["action"]) {
    const piece = planner.character.pieces.find((entry) => entry.slot === slot);
    if (!piece) return 0;
    return action === "normal" ? Number(piece.honingLevel || 0) : Number(piece.advancedRefiningLevel || 0);
  }

  function addConfirmedUpgrade() {
    const baseLevel = getConfirmedBaseLevel(confirmedDraft.slot, confirmedDraft.action);
    const targetLevel = Math.max(baseLevel + 1, Number(confirmedDraft.targetLevel || 0));
    const nextUpgrade: ConfirmedUpgrade = {
      id: `${confirmedDraft.slot}-${confirmedDraft.action}-${Date.now()}`,
      slot: confirmedDraft.slot,
      action: confirmedDraft.action,
      targetLevel,
    };

    patchPlanner((draft) => {
      const prev = draft.character.confirmedUpgrades ?? [];
      draft.character.confirmedUpgrades = [
        ...prev.filter((item) => !(item.slot === nextUpgrade.slot && item.action === nextUpgrade.action)),
        nextUpgrade,
      ];
    });
    setConfirmedDraft((prev) => ({ ...prev, targetLevel }));
  }

  function removeConfirmedUpgrade(id: string) {
    patchPlanner((draft) => {
      draft.character.confirmedUpgrades = (draft.character.confirmedUpgrades ?? []).filter((item) => item.id !== id);
    });
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
      applyImportedCombatProfile(data);
      fetchEngravingMarketPrices(data.combatSystems?.engravings?.map((row) => row.name) ?? []).catch(() => undefined);
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
      applyImportedCombatProfile(data);
      fetchEngravingMarketPrices(data.combatSystems?.engravings?.map((row) => row.name) ?? []).catch(() => undefined);

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
    setPlanner((prev) => {
      saveCharacterMaterials(prev.character.tableId, prev.character.charId, prev.materials);
      return {
        ...prev,
        character: {
          ...prev.character,
          tableId: table?.id ?? "",
          tableName: table?.name ?? "",
          charId: "",
          characterName: "",
        },
        materials: makeEmptyMaterialInventory(),
      };
    });
  }

  async function fetchGemAuctionPrices() {
    setGemPriceLoading(true);
    setGemPriceError("");
    try {
      const response = await fetch(`/api/growth/gem-prices?levels=${GEM_PRICE_LEVELS.join(",")}`);
      const data = (await response.json()) as GemAuctionPriceResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "경매장 보석 시세를 불러오지 못했어.");
      }
      setGemPriceSummary(data);
      setCombatPlanner((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          gemPricesByLevel: {
            ...prev.profile.gemPricesByLevel,
            ...Object.fromEntries(
              Object.entries(data.pricesByLevel ?? {}).map(([level, price]) => [String(level), Math.max(0, Number(price) || 0)])
            ),
          },
          gemPriceFetchedAt: data.fetchedAt,
        },
      }));
    } catch (error: any) {
      setGemPriceError(error?.message || "경매장 보석 시세를 불러오지 못했어.");
    } finally {
      setGemPriceLoading(false);
    }
  }

  async function fetchAccessoryAuctionPrices() {
    setAccessoryPriceLoading(true);
    setAccessoryPriceError("");
    try {
      const response = await fetch("/api/growth/accessory-prices?minQuality=67&grades=%EA%B3%A0%EB%8C%80,%EC%9C%A0%EB%AC%BC");
      const data = (await response.json()) as AccessoryAuctionPriceResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "경매장 악세 시세를 불러오지 못했어.");
      }
      setAccessoryPriceSummary(data);
      setCombatPlanner((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          accessoryPricesByPart: {
            ...prev.profile.accessoryPricesByPart,
            ...Object.fromEntries(
              Object.entries(data.pricesByPart ?? {}).map(([part, price]) => [part, Math.max(0, Number(price) || 0)])
            ),
          },
          accessoryTargetsByPart: {
            ...(prev.profile.accessoryTargetsByPart ?? {}),
            ...(data.targetsByPart ?? {}),
          },
          accessoryCandidatesByPart: {
            ...(prev.profile.accessoryCandidatesByPart ?? {}),
            ...(data.candidatesByPart ?? {}),
          },
          accessoryPriceFetchedAt: data.fetchedAt,
          accessoryPriceQueryVersion: data.queryVersion || ACCESSORY_PRICE_QUERY_VERSION,
        },
      }));
      if (!Object.keys(data.pricesByPart ?? {}).length) {
        setAccessoryPriceError("현재 조건보다 좋은 악세 매물을 찾지 못했어. 품질/옵션 조건을 낮추거나 수동값을 확인해줘.");
      }
    } catch (error: any) {
      setAccessoryPriceError(error?.message || "경매장 악세 시세를 불러오지 못했어.");
    } finally {
      setAccessoryPriceLoading(false);
    }
  }

  async function fetchEngravingMarketPrices(namesInput?: string[]) {
    const names = Array.from(
      new Set((namesInput?.length ? namesInput : combatPlanner.profile.engravingItems.map((row) => row.name)).filter(Boolean))
    );
    if (!names.length) return;

    setEngravingPriceLoading(true);
    setEngravingPriceError("");
    try {
      const response = await fetch(`/api/growth/engraving-prices?grade=${encodeURIComponent("유물")}&names=${encodeURIComponent(names.join(","))}`);
      const data = (await response.json()) as EngravingMarketPriceResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "거래소 각인서 시세를 불러오지 못했어.");
      }
      setEngravingPriceSummary(data);
      setCombatPlanner((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          engravingPricesByName: {
            ...prev.profile.engravingPricesByName,
            ...Object.fromEntries(
              Object.entries(data.pricesByName ?? {}).map(([name, price]) => [name, Math.max(0, Number(price) || 0)])
            ),
          },
          engravingItems: prev.profile.engravingItems.map((row) => {
            const marketPrice = Number(data.pricesByName?.[row.name] || 0);
            return {
              ...row,
              pricePerBook: marketPrice > 0 ? marketPrice : Math.max(0, Number(row.pricePerBook || 0)),
            };
          }),
          engravingPriceFetchedAt: data.fetchedAt,
        },
      }));
    } catch (error: any) {
      setEngravingPriceError(error?.message || "거래소 각인서 시세를 불러오지 못했어.");
    } finally {
      setEngravingPriceLoading(false);
    }
  }

  async function fetchAvatarMarketPrices() {
    const className = profileSummary?.className || "";
    if (!className) {
      setAvatarPriceError("공식 전투정보실로 캐릭터를 먼저 불러와 직업명을 확인해줘.");
      return;
    }
    const slots = combatPlanner.profile.avatarItems
      .filter((row) => row.targetGrade && row.targetGrade !== "현재 유지")
      .map((row) => row.slot);
    if (!slots.length) return;

    setAvatarPriceLoading(true);
    setAvatarPriceError("");
    try {
      const response = await fetch(
        `/api/growth/avatar-prices?className=${encodeURIComponent(className)}&grade=${encodeURIComponent("전설")}&slots=${encodeURIComponent(slots.join(","))}`
      );
      const data = (await response.json()) as AvatarMarketPriceResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.detail || data.error || "거래소 아바타 시세를 불러오지 못했어.");
      }
      setAvatarPriceSummary(data);
      setCombatPlanner((prev) => {
        const avatarItems = prev.profile.avatarItems.map((row) => {
          const marketPrice = Number(data.pricesBySlot?.[row.slot] || 0);
          return marketPrice > 0 ? { ...row, cost: marketPrice } : row;
        });
        return {
          ...prev,
          profile: syncAvatarSummaryFromItems({
            ...prev.profile,
            avatarItems,
            avatarPriceFetchedAt: data.fetchedAt,
            avatarPriceItemsBySlot: {
              ...(prev.profile.avatarPriceItemsBySlot ?? {}),
              ...(data.itemsBySlot ?? {}),
            },
          }),
        };
      });
    } catch (error: any) {
      setAvatarPriceError(error?.message || "거래소 아바타 시세를 불러오지 못했어.");
    } finally {
      setAvatarPriceLoading(false);
    }
  }

  function setCharacterId(charId: string) {
    setPlanner((prev) => {
      saveCharacterMaterials(prev.character.tableId, prev.character.charId, prev.materials);

      const table = todoState.tables.find((item) => item.id === prev.character.tableId);
      const character = table?.characters.find((item) => item.id === charId);
      const loadedMaterials = character ? loadCharacterMaterials(table?.id ?? "", character.id) : null;
      if (character) {
        if (!profileNickname.trim()) setProfileNickname(character.name);
      }

      return {
        ...prev,
        character: {
          ...prev.character,
          charId,
          characterName: character?.name ?? "",
        },
        materials: loadedMaterials ?? makeEmptyMaterialInventory(),
      };
    });
  }

  function applyRaidGoldBasis(nextBasis: PlannerGoldBasis) {
    setRaidGoldBasis(nextBasis);

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
  const profileWarnings = (profileSummary?.warnings ?? []).filter(
    (warning) => !/장인의 기운|현재 단계 재련 경험치|현재 재련 경험치/.test(warning)
  );

  return (
    <div className="growthPage">
      <section className="growthHero">
        <div>
          <h2>성장 플래너</h2>
          <p>표 정보와 공식 전투정보실을 바탕으로 목표 레벨 비용, 전투력 시뮬레이션, 최저비용 스펙업 순서를 계산하는 화면이야.</p>
        </div>
        <div className="growthHeroMeta">
          <div>현재 캐릭터: {planner.character.characterName || "-"}</div>
          <div>추천 경로: {formatMode(planner.character.preferredMode)}</div>
        </div>
      </section>

      <div className="growthTopGrid">
        <section className="growthCard setupCard">
          <div className="resourceTabsHeader">
            <h3 className="growthCardTitle">대상 캐릭터</h3>
            <div className="resourceTabs">
              <button type="button" className={plannerModeTab === "level" ? "active" : ""} onClick={() => setPlannerModeTab("level")}>
                목표 레벨
              </button>
              <button type="button" className={plannerModeTab === "combat" ? "active" : ""} onClick={() => setPlannerModeTab("combat")}>
                목표 레벨 + 전투력
              </button>
            </div>
          </div>
          <div className="setupSplitGrid">
            <div className="setupPanel">
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
                  <div>전투력: {profileSummary.combatPower ? Math.round(profileSummary.combatPower).toLocaleString() : "-"}</div>
                  {profileSummary.combatSystems ? (
                    <div className="growthChipRow">
                      <span className="growthChip">보석 {profileSummary.combatSystems.gemCount}개</span>
                      <span className="growthChip">각인 {profileSummary.combatSystems.engravingCount}개</span>
                      <span className="growthChip">아바타 {profileSummary.combatSystems.avatarCount}개</span>
                      <span className="growthChip">아크패시브 {profileSummary.combatSystems.arkPassivePoints}P</span>
                    </div>
                  ) : null}
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
          </div>
          {plannerModeTab === "combat" ? (
            <div className="targetCombatPanel">
              <div className="growthFieldGrid combatTargetGrid">
                <label>
                  <span>현재 전투력</span>
                  <input
                    type="number"
                    value={combatPlanner.currentCombatPower || ""}
                    onChange={(event) => patchCombatPlanner({ currentCombatPower: Number(event.target.value) || 0 })}
                    placeholder="예: 5120"
                  />
                </label>
                <label>
                  <span>목표 전투력</span>
                  <input
                    type="number"
                    value={combatPlanner.targetCombatPower || ""}
                    onChange={(event) => patchCombatPlanner({ targetCombatPower: Number(event.target.value) || 0 })}
                    placeholder="예: 5400"
                  />
                </label>
                <label>
                  <span>목표 레벨 달성 전투력 증가율(%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      combatPlanner.levelGrowthCombatPercent ||
                      (autoLevelGrowthCombatPercent ? Number(autoLevelGrowthCombatPercent.toFixed(3)) : "")
                    }
                    onChange={(event) => patchCombatPlanner({ levelGrowthCombatPercent: Number(event.target.value) || 0 })}
                    placeholder="강화/상급재련 자동 계산"
                  />
                </label>
                <button
                  type="button"
                  className="growthAction"
                  onClick={() => document.querySelector(".combatUpgradeRecommendation")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  전투력 추천 보기
                </button>
              </div>
              <div className="combatResultPanel">
                <div>
                  <span>목표 레벨 비용</span>
                  <strong>{formatGold(displayedTotalSpendGold)}</strong>
                </div>
                <div>
                  <span>목표 레벨 후 예상 전투력</span>
                  <strong>{Math.round(combatPlan.projectedCombatPower).toLocaleString()}</strong>
                  {Number(combatPlanner.levelGrowthCombatPercent || 0) <= 0 && Math.abs(manualGemCombatGainPercent) > 0.0001 ? (
                    <small className="resultMaterialDetail">보석 수정 반영 {manualGemCombatGainPercent > 0 ? "+" : ""}{manualGemCombatGainPercent.toFixed(2)}%</small>
                  ) : null}
                  {Number(combatPlanner.levelGrowthCombatPercent || 0) <= 0 && Math.abs(manualEquipmentCombatGainPercent) > 0.0001 ? (
                    <small className="resultMaterialDetail">장비 수정 반영 {manualEquipmentCombatGainPercent > 0 ? "+" : ""}{manualEquipmentCombatGainPercent.toFixed(2)}%</small>
                  ) : null}
                </div>
                <div>
                  <span>전투력 추가 비용</span>
                  <strong>{combatPlan.picks.length ? formatGold(combatPlan.upgradeCost) : "후보 부족"}</strong>
                </div>
                <div>
                  <span>총 예상 비용</span>
                  <strong>{combatPlan.picks.length || combatPlan.reachable ? formatGold(combatPlan.totalCost) : "-"}</strong>
                </div>
              </div>
              <nav className="combatCategoryRail" aria-label="전투력 시뮬레이터 분류">
                {COMBAT_CATEGORIES.map((category) => (
                  <label key={category} className={combatPlanner.enabledCategories[category] ? "active" : ""}>
                    <input
                      type="checkbox"
                      checked={combatPlanner.enabledCategories[category]}
                      onChange={(event) => toggleCombatCategory(category, event.target.checked)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </nav>
              <details className="combatAutoBuilder" open>
                <summary>전투력 후보 자동 생성</summary>
                <div className="combatAutoGrid">
                  {combatPlanner.enabledCategories["장비"] ? (
                  <section className="combatAutoSection">
                    <div className="combatAutoHeader">
                      <strong>장비</strong>
                      <button type="button" className="growthAction secondary" onClick={resetCombatProfile}>
                        기본값
                      </button>
                    </div>
                    <div className="combatEquipmentList">
                      {combatPlanner.profile.equipment.map((row) => {
                        const piece = planner.character.pieces.find((entry) => entry.slot === row.slot);
                        const currentHoning = row.currentHoning || piece?.honingLevel || 0;
                        const currentAdvanced = row.currentAdvanced || piece?.advancedRefiningLevel || 0;
                        return (
                          <div className="combatEquipmentRow" key={row.slot}>
                            <label className="combatCheckLabel">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(event) => patchCombatEquipment(row.slot, { enabled: event.target.checked })}
                              />
                              <span>{SLOT_NAMES[row.slot]}</span>
                            </label>
                            <label>
                              <span>현재 +</span>
                              <input
                                type="number"
                                value={currentHoning}
                                onChange={(event) => patchCombatEquipment(row.slot, { currentHoning: Number(event.target.value) || 0 })}
                              />
                            </label>
                            <label>
                              <span>목표 +</span>
                              <input
                                type="number"
                                value={row.targetHoning || currentHoning}
                                onChange={(event) => patchCombatEquipment(row.slot, { targetHoning: Number(event.target.value) || 0 })}
                              />
                            </label>
                            <label>
                              <span>현재 상재</span>
                              <input
                                type="number"
                                value={currentAdvanced}
                                onChange={(event) => patchCombatEquipment(row.slot, { currentAdvanced: Number(event.target.value) || 0 })}
                              />
                            </label>
                            <label>
                              <span>목표 상재</span>
                              <input
                                type="number"
                                value={row.targetAdvanced || currentAdvanced}
                                onChange={(event) => patchCombatEquipment(row.slot, { targetAdvanced: Number(event.target.value) || 0 })}
                              />
                            </label>
                            <label>
                              <span>강화 비용</span>
                              <input
                                type="number"
                                value={row.normalCostPerStep}
                                onChange={(event) => patchCombatEquipment(row.slot, { normalCostPerStep: Number(event.target.value) || 0 })}
                              />
                            </label>
                            <label>
                              <span>상재 비용</span>
                              <input
                                type="number"
                                value={row.advancedCostPerStep}
                                onChange={(event) => patchCombatEquipment(row.slot, { advancedCostPerStep: Number(event.target.value) || 0 })}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  ) : null}

                  {combatPlanner.enabledCategories["보석"] ? (
                  <section className="combatAutoSection">
                    <div className="combatAutoHeader">
                      <div>
                        <strong>보석</strong>
                        <span>{combatPlanner.profile.gems.length.toLocaleString()}개 착용 / {combatGemBoardScore.toLocaleString()} 로어</span>
                      </div>
                      <div className="combatInlineControls">
                        <label className="combatInlineSelect">
                          <span>전체 레벨</span>
                          <select defaultValue="" onChange={(event) => event.target.value && setAllCombatGemLevels(Number(event.target.value))}>
                            <option value="">-</option>
                            {GEM_LEVEL_OPTIONS.map((level) => (
                              <option key={level} value={level}>
                                {level}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className="growthAction secondary" onClick={fetchGemAuctionPrices} disabled={gemPriceLoading}>
                          {gemPriceLoading ? "시세 불러오는 중" : "경매장 시세 불러오기"}
                        </button>
                      </div>
                    </div>
                    <div className="combatGemMarketGrid">
                      {GEM_PRICE_LEVELS.map((level) => (
                        <label key={level}>
                          <span>{level}레벨 최저가</span>
                          <input
                            type="number"
                            value={combatPlanner.profile.gemPricesByLevel[String(level)] || ""}
                            onChange={(event) => patchCombatGemPrice(level, Number(event.target.value) || 0)}
                            placeholder="0"
                          />
                        </label>
                      ))}
                    </div>
                    {gemPriceSummary ? (
                      <div className="growthHint">
                        경매장 보석 시세 반영: {formatDateTime(gemPriceSummary.fetchedAt)}
                        {gemPriceSummary.items?.length ? ` / ${gemPriceSummary.items.length.toLocaleString()}개 검색` : ""}
                      </div>
                    ) : combatPlanner.profile.gemPriceFetchedAt ? (
                      <div className="growthHint">저장된 보석 시세: {formatDateTime(combatPlanner.profile.gemPriceFetchedAt)}</div>
                    ) : null}
                    {gemPriceError ? <div className="growthError">{gemPriceError}</div> : null}
                    <div className="combatGemList">
                      {combatPlanner.profile.gems.map((row, index) => {
                        const typeLabel = normalizeGemTypeLabel(row.gemType);
                        const skillLabel = normalizeGemSkillName(row.skillName, index);
                        return (
                          <div className="combatGemSlot" key={row.id}>
                            <div className="combatGemControls">
                              <div className="combatGemTopLine">
                                <strong>{row.currentLevel}레벨 {typeLabel}</strong>
                                <label className="combatGemBound">
                                  <input type="checkbox" checked={row.bound} onChange={(event) => patchCombatGem(row.id, { bound: event.target.checked })} />
                                  <span>귀속</span>
                                </label>
                              </div>
                              <div className="combatGemEditGrid">
                                <select value={typeLabel} onChange={(event) => patchCombatGem(row.id, { gemType: event.target.value })}>
                                  {GEM_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={row.currentLevel}
                                  onChange={(event) => patchCombatGem(row.id, { currentLevel: Number(event.target.value) || 0 })}
                                >
                                  {GEM_LEVEL_OPTIONS.map((level) => (
                                    <option key={level} value={level}>
                                      {level}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <input
                                className="combatGemSkillInput"
                                value={row.skillName}
                                onChange={(event) => patchCombatGem(row.id, { skillName: event.target.value })}
                                aria-label={`${skillLabel} 스킬명`}
                              />
                              <label className="combatGemCostInput">
                                <span>수동 예비 비용</span>
                                <input
                                  type="number"
                                  value={row.costPerLevel}
                                  onChange={(event) => patchCombatGem(row.id, { costPerLevel: Number(event.target.value) || 0 })}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  ) : null}

                  <div className="growthHint">* 팔찌, 현재 아크그리드 코어 포인트, 아크패시브 카르마 정보는 불러오지만 스펙업 수단에는 넣지 않습니다.</div>
                  {([
                    ["avatar", "아바타", "아바타"],
                    ["accessory", "악세", "악세"],
                    ["engraving", "각인", "각인"],
                  ] as const).some(([, , category]) => combatPlanner.enabledCategories[category]) ? (
                  <section className="combatAutoSection combatAutoSectionWide">
                    <div className="combatAutoHeader">
                      <strong>아바타 / 악세 / 팔찌 / 각인</strong>
                      <span>체크된 항목만 후보로 생성</span>
                    </div>
                    <div className="growthHint">* 팔찌, 현재 아크그리드 코어 포인트, 젬 옵션은 추천하지 않습니다.</div>
                    <div className="combatToggleGrid">
                      {([
                        ["avatar", "아바타", "아바타"],
                        ["accessory", "악세", "악세"],
                        ["engraving", "각인", "각인"],
                      ] as const).filter(([, , category]) => combatPlanner.enabledCategories[category]).map(([key, label]) => {
                        const row = combatPlanner.profile[key];
                        const showSplitEditor = key === "engraving" && combatPlanner.profile.engravingItems.length > 0;
                        return (
                          <div className={`combatToggleRow ${showSplitEditor ? "combatToggleRowSplit" : ""}`} key={key}>
                            <label className="combatCheckLabel">
                              <input checked={row.enabled} type="checkbox" onChange={(event) => patchCombatToggle(key, { enabled: event.target.checked })} />
                              <span>{label}</span>
                            </label>
                            {!showSplitEditor ? (
                              <>
                                <label>
                                  <span>현재</span>
                                  <input value={row.currentLabel} onChange={(event) => patchCombatToggle(key, { currentLabel: event.target.value })} />
                                </label>
                                <label>
                                  <span>목표</span>
                                  <input value={row.targetLabel} onChange={(event) => patchCombatToggle(key, { targetLabel: event.target.value })} />
                                </label>
                                <label>
                                  <span>비용</span>
                                  <input type="number" value={row.cost} onChange={(event) => patchCombatToggle(key, { cost: Number(event.target.value) || 0 })} />
                                </label>
                                <label>
                                  <span>증가율(%)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={row.gainPercent}
                                    onChange={(event) => patchCombatToggle(key, { gainPercent: Number(event.target.value) || 0 })}
                                  />
                                </label>
                              </>
                            ) : null}
                            {key === "avatar" && combatPlanner.profile.avatarItems.length ? (
                              <div className="combatSystemItemList">
                                <div className="combatSystemItemToolbar">
                                  <button type="button" className="growthAction secondary" onClick={() => void fetchAvatarMarketPrices()} disabled={avatarPriceLoading}>
                                    {avatarPriceLoading ? "아바타 시세 불러오는 중" : `${profileSummary?.className || "직업"} 아바타 거래소 시세 불러오기`}
                                  </button>
                                  {avatarPriceSummary ? (
                                    <span>반영: {formatDateTime(avatarPriceSummary.fetchedAt)}</span>
                                  ) : combatPlanner.profile.avatarPriceFetchedAt ? (
                                    <span>저장: {formatDateTime(combatPlanner.profile.avatarPriceFetchedAt)}</span>
                                  ) : (
                                    <span>직업 전용 전설 아바타 최저가 기준</span>
                                  )}
                                </div>
                                {avatarPriceError ? <div className="growthError">{avatarPriceError}</div> : null}
                                {combatPlanner.profile.avatarItems.map((item) => {
                                  const complete = isAvatarGradeComplete(item.grade, item.targetGrade);
                                  const marketItem = combatPlanner.profile.avatarPriceItemsBySlot?.[item.slot];
                                  return (
                                    <div className="combatSystemItem combatSystemItemEditable" key={item.id}>
                                      <label className="combatCheckLabel">
                                        <input
                                          type="checkbox"
                                          checked={item.enabled}
                                          disabled={complete}
                                          onChange={(event) => patchCombatAvatar(item.id, { enabled: event.target.checked })}
                                        />
                                        <strong>
                                          {item.slot} · {item.name} · {item.grade}
                                          {complete ? " · 완료" : ""}
                                        </strong>
                                      </label>
                                      <div className="combatSystemItemFields">
                                        <label>
                                          <span>목표 등급</span>
                                          <select
                                            value={item.targetGrade}
                                            onChange={(event) => {
                                              const targetGrade = event.target.value;
                                              patchCombatAvatar(item.id, {
                                                targetGrade,
                                                enabled: !isAvatarGradeComplete(item.grade, targetGrade),
                                              });
                                            }}
                                          >
                                            {AVATAR_GRADE_OPTIONS.map((grade) => (
                                              <option value={grade} key={grade}>
                                                {grade}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label>
                                          <span>비용</span>
                                          <input
                                            type="number"
                                            value={item.cost}
                                            onChange={(event) => patchCombatAvatar(item.id, { cost: Number(event.target.value) || 0 })}
                                            disabled={complete}
                                          />
                                        </label>
                                        <label>
                                          <span>증가율(%)</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.gainPercent}
                                            onChange={(event) => patchCombatAvatar(item.id, { gainPercent: Number(event.target.value) || 0 })}
                                            disabled={complete}
                                          />
                                        </label>
                                      </div>
                                      <span>
                                        {complete
                                          ? "이미 목표 등급이라 추천 후보에서 제외돼."
                                          : `예상 비용 ${formatGold(item.cost)}${marketItem?.itemName ? ` · ${marketItem.itemName}` : ""}`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {key === "accessory" ? (
                              <div className="combatSystemItemList">
                                <div className="combatSystemItemToolbar">
                                  <button type="button" className="growthAction secondary" onClick={fetchAccessoryAuctionPrices} disabled={accessoryPriceLoading}>
                                    {accessoryPriceLoading ? "악세 시세 불러오는 중" : "악세 경매장 시세 불러오기"}
                                  </button>
                                  {accessoryPriceSummary ? (
                                    <span>반영: {formatDateTime(accessoryPriceSummary.fetchedAt)}</span>
                                  ) : combatPlanner.profile.accessoryPriceFetchedAt ? (
                                    <span>저장: {formatDateTime(combatPlanner.profile.accessoryPriceFetchedAt)}</span>
                                  ) : (
                                    <span>67품질 이상 상중/중상/중중 기준 최저가</span>
                                  )}
                                </div>
                                {accessoryPriceError ? <div className="growthError">{accessoryPriceError}</div> : null}
                                {getDisplayAccessoryRows(combatPlanner.profile.accessoryItems).map((item, index) => (
                                  <div className="combatSystemItem" key={`${item.name}-${index}`}>
                                    <strong>
                                      {(() => {
                                        const displayName = getAccessoryDisplayName(combatPlanner.profile.accessoryItems ?? [], index, item);
                                        return displayName === item.name ? displayName : `${displayName} · ${item.name}`;
                                      })()}
                                      {item.quality ? ` 품질 ${item.quality}` : ""}
                                    </strong>
                                    <span>{getAccessoryEffectSummary(item)}</span>
                                    <span>
                                      경매장 목표가: {formatCompactGold(getAccessoryAuctionPrice(combatPlanner.profile, getAccessoryPartName(item)))}
                                      {isAccessoryAuctionPriceLoaded(combatPlanner.profile, getAccessoryPartName(item)) && getAccessoryAuctionTargetDetail(combatPlanner.profile, getAccessoryPartName(item))
                                        ? ` · ${getAccessoryAuctionTargetDetail(combatPlanner.profile, getAccessoryPartName(item))}`
                                        : " · 수동 기본값"}
                                    </span>
                                  </div>
                                ))}
                                {combatPlanner.profile.accessoryPriceFetchedAt ? (
                                  <div className="combatSystemItemList">
                                    <strong>현재보다 좋은 악세 후보</strong>
                                    {getAccessoryUpgradeRows(combatPlanner.profile).length ? (
                                      getAccessoryUpgradeRows(combatPlanner.profile).map((row) => (
                                        <div className="combatSystemItem" key={`accessory-upgrade-${row.displayName}-${row.index}`}>
                                          <strong>{row.displayName} 교체 추천</strong>
                                          <span>{row.reason}</span>
                                          <span>
                                            {formatAccessoryCandidateGuide(row.part, row.target)} · 예상 비용 {formatGold(Number(row.target.buyPrice || 0))}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="growthEmpty">현재 착용 악세가 목표 옵션/품질을 이미 만족하거나, 더 좋은 매물이 아직 확인되지 않았어.</div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {key === "engraving" && combatPlanner.profile.engravingItems.length ? (
                              <div className="combatSystemItemList">
                                <div className="combatSystemItemToolbar">
                                  <button type="button" className="growthAction secondary" onClick={() => void fetchEngravingMarketPrices()} disabled={engravingPriceLoading}>
                                    {engravingPriceLoading ? "각인서 시세 불러오는 중" : "각인서 거래소 시세 불러오기"}
                                  </button>
                                  {engravingPriceSummary ? (
                                    <span>반영: {formatDateTime(engravingPriceSummary.fetchedAt)}</span>
                                  ) : combatPlanner.profile.engravingPriceFetchedAt ? (
                                    <span>저장: {formatDateTime(combatPlanner.profile.engravingPriceFetchedAt)}</span>
                                  ) : (
                                    <span>유물 각인서 최저가 기준</span>
                                  )}
                                </div>
                                {engravingPriceError ? <div className="growthError">{engravingPriceError}</div> : null}
                                {combatPlanner.profile.engravingItems.map((item) => {
                                  const complete = isEngravingComplete(item);
                                  const pricePerBook = getEngravingDisplayPrice(item, combatPlanner.profile);
                                  return (
                                    <div className="combatSystemItem combatSystemItemEditable" key={item.name}>
                                      <label className="combatCheckLabel">
                                        <input
                                          type="checkbox"
                                          checked={item.enabled}
                                          disabled={complete}
                                          onChange={(event) => patchCombatEngraving(item.name, { enabled: event.target.checked })}
                                        />
                                        <strong>
                                          {item.name} · {item.grade || "미확인"} Lv.{item.level || 0}
                                          {complete ? " · 완료" : ""}
                                        </strong>
                                      </label>
                                      <div className="combatSystemItemFields">
                                        <label>
                                          <span>목표</span>
                                          <input value={`${item.targetGrade} Lv.${item.targetLevel}`} readOnly />
                                        </label>
                                        <label>
                                          <span>부족 권수</span>
                                          <input
                                            type="number"
                                            value={item.missingBooks}
                                            onChange={(event) => patchCombatEngraving(item.name, { missingBooks: Number(event.target.value) || 0 })}
                                            disabled={complete}
                                          />
                                        </label>
                                        <label>
                                          <span>권당 시세</span>
                                          <input
                                            type="number"
                                            value={pricePerBook}
                                            onChange={(event) => patchCombatEngraving(item.name, { pricePerBook: Number(event.target.value) || 0 })}
                                            disabled={complete}
                                          />
                                        </label>
                                        <label>
                                          <span>증가율(%)</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.gainPercent}
                                            onChange={(event) => patchCombatEngraving(item.name, { gainPercent: Number(event.target.value) || 0 })}
                                            disabled={complete}
                                          />
                                        </label>
                                      </div>
                                      <span>
                                        {complete
                                          ? `거래소 시세 ${formatGold(pricePerBook)} · 이미 목표 각인서 상태라 추천 후보에서 제외돼.`
                                          : `예상 비용 ${formatGold(getEngravingBookCost({ ...item, pricePerBook }, combatPlanner.profile))}`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {combatPlanner.profile.braceletItems?.length ? (
                      <div className="combatSystemItemList">
                        <strong>팔찌 정보</strong>
                        {combatPlanner.profile.braceletItems.map((item, index) => (
                          <div className="combatSystemItem" key={`${item.name}-${index}`}>
                            <strong>
                              {item.name}
                              {item.quality ? ` 품질 ${item.quality}` : ""}
                            </strong>
                            <span>{item.effects.slice(0, 4).join(" / ") || "옵션 미확인"}</span>
                            <span>스펙업 추천 계산에서는 제외돼.</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                  ) : null}
                </div>
                <div className="growthHint">자동 생성 후보 {generatedCombatOptions.length.toLocaleString()}개가 아래 최저비용 추천에 사용돼.</div>
              </details>
            </div>
          ) : null}
        </section>

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
        {resourceTab === "materials" && isLinkedToTable ? (
          <p className="growthHint materialCharacterSyncHint">
            {selectedTable?.name} / {selectedCharacter?.name} 기준으로 저장돼.
          </p>
        ) : null}

        {resourceTab === "materials" ? (
          <>
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
          <div className="goldCashRateBox">
            <div className="cathedralExchangeHeader">
              <strong>골드 시세</strong>
              <span>보석 후보의 경매장 골드가를 현금 기준으로 함께 보여줘.</span>
            </div>
            <label className="goldCashRateControl">
              <span>100:</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={goldCashRate}
                onChange={(event) => setGoldCashRate(Math.max(0, Number(event.target.value) || 0))}
              />
              <em>원</em>
            </label>
            <div className="cathedralExchangeSummary">
              <span>10,000G = {formatCompactWon(goldToCash(10000, goldCashRate)) || "0원"}</span>
              <span>100,000G = {formatCompactWon(goldToCash(100000, goldCashRate)) || "0원"}</span>
            </div>
          </div>
          </>
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
          <div className="confirmedUpgradeCard">
            <div>
              <h3 className="growthCardTitle small">스펙업 확정</h3>
              <p className="growthHint">무조건 진행할 장비 성장을 먼저 넣으면, 그 비용과 레벨을 반영한 뒤 남은 목표를 다시 추천해.</p>
            </div>
            <div className="growthFieldGrid confirmedUpgradeControls">
              <label>
                <span>장비</span>
                <select
                  value={confirmedDraft.slot}
                  onChange={(event) => setConfirmedDraft((prev) => ({ ...prev, slot: event.target.value as EquipmentSlot }))}
                >
                  {SLOT_ORDER.map((slot) => (
                    <option key={slot} value={slot}>
                      {SLOT_NAMES[slot]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>종류</span>
                <select
                  value={confirmedDraft.action}
                  onChange={(event) =>
                    setConfirmedDraft((prev) => ({ ...prev, action: event.target.value as ConfirmedUpgrade["action"] }))
                  }
                >
                  <option value="normal">강화</option>
                  <option value="advanced">상급 재련</option>
                </select>
              </label>
              <label>
                <span>목표 단계</span>
                <input
                  type="number"
                  min={confirmedDraftBaseLevel + 1}
                  value={confirmedDraft.targetLevel || confirmedDraftBaseLevel + 1}
                  onChange={(event) => setConfirmedDraft((prev) => ({ ...prev, targetLevel: Number(event.target.value) || 0 }))}
                />
              </label>
              <button type="button" className="growthAction" onClick={addConfirmedUpgrade}>
                적용
              </button>
            </div>
            <div className="growthHint">
              현재 기준: {SLOT_NAMES[confirmedDraft.slot]}{" "}
              {confirmedDraft.action === "normal" ? `강화 +${confirmedDraftBaseLevel}` : `상급재련 ${confirmedDraftBaseLevel}`}
            </div>
            {confirmedUpgrades.length ? (
              <div className="confirmedUpgradeList">
                {confirmedUpgrades.map((upgrade) => (
                  <div className="confirmedUpgradeItem" key={upgrade.id}>
                    <span>
                      {SLOT_NAMES[upgrade.slot]}{" "}
                      {upgrade.action === "normal" ? `강화 +${upgrade.targetLevel}까지` : `상급재련 ${upgrade.targetLevel}까지`}
                    </span>
                    <button type="button" className="growthAction secondary" onClick={() => removeConfirmedUpgrade(upgrade.id)}>
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="growthEmpty">확정으로 먼저 진행할 스펙업이 없으면 추천 경로만으로 계산해.</div>
            )}
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
              <div>귀속골드 사용: {formatGold(displayBoundGoldUsableNow)}</div>
              <div>유통골드 필요: {formatGold(displayTradableGoldNeededNow)}</div>
              <div>귀속골드만으로 직접골드 충당: {displayBoundGoldAffordableWeeks == null ? "-" : `${displayBoundGoldAffordableWeeks}주`}</div>
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
              <div>추천 대기 주차: {displayRecommendedWaitWeeks}주</div>
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
      {plannerModeTab === "combat" ? (
        <section className="growthCard combatUpgradeRecommendation">
          <div className="resourceTabsHeader">
            <h3 className="growthCardTitle">전투력 최저비용 추천</h3>
            <span className="growthEngineStatus">자동 생성 후보 {generatedCombatOptions.length.toLocaleString()}개</span>
          </div>
          <div className="combatResultPanel">
            <div>
              <span>추가 필요 증가율</span>
              <strong>{combatPlan.requiredGainPercent.toFixed(2)}%</strong>
            </div>
            <div>
              <span>선택된 증가율</span>
              <strong>{combatPlan.selectedGainPercent.toFixed(2)}%</strong>
            </div>
            <div>
              <span>최종 예상 전투력</span>
              <strong>{projectedFinalCombatPower.toLocaleString()}</strong>
            </div>
            <div>
              <span>레벨 + 전투력 총 비용</span>
              <strong>{combatPlan.reachable ? formatGold(combatPlan.totalCost) : "-"}</strong>
            </div>
          </div>
          <div className="combatCostBreakdown">
            <div>
              <span>목표 레벨 강화비용</span>
              <strong>{formatGold(displayedTotalSpendGold)}</strong>
            </div>
            <div>
              <span>전투력 추가비용</span>
              <strong>{combatPlan.picks.length ? formatGold(combatPlan.upgradeCost) : "후보 부족"}</strong>
            </div>
            <div>
              <span>최종 합계</span>
              <strong>{combatPlan.picks.length || combatPlan.reachable ? formatGold(combatPlan.totalCost) : "-"}</strong>
            </div>
            <p>
              목표 레벨 추천 강화순서에 이미 들어간 장비 성장은 전투력 추가비용에서 제외돼.
              {!combatPlan.reachable && combatPlan.picks.length ? " 현재 후보만으로는 목표 전투력까지 부족해서 가능한 후보를 모두 선택했어." : ""}
            </p>
          </div>
          {displayRouteSteps.length ? (
            <div className="combatIncludedRouteList">
              <div className="resultSectionTitle">목표 레벨 추천 강화순서</div>
              <div className="combatIncludedRouteRows">
                {displayRouteSteps.map((step, index) => (
                  <div className="combatIncludedRouteRow" key={`combat-route-${step.slot}-${step.action}-${step.fromLevel}-${step.toLevel}-${index}`}>
                    <span>
                      {index + 1}. {step.slotLabel} {formatRouteAction(step)}
                    </span>
                    <strong>{formatGold(step.averageCost)}</strong>
                    <em>목표 레벨 비용에 포함</em>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {combatPriorityRows.length ? (
            <div className="combatPriorityPanel">
              <div className="resultSectionTitle">목표 전투력 추천 스펙업순</div>
              <div className="combatTableHeader">
                <span>스펙업 목표</span>
                <span>전투력</span>
                <span>비용</span>
                <span>1%당 비용</span>
              </div>
              <div className="combatPriorityList">
                {combatPriorityRows.map((row) => {
                  const equipmentPreview =
                    row.pick.option.category === "장비"
                      ? getCombatEquipmentMaterialPreview(row.pick.option, planner.character.pieces, finalEstimateInput.materials, planner.market)
                      : null;
                  return (
                    <details className="combatPriorityRow selected" key={row.pick.option.id}>
                      <summary>
                        <strong className="combatUpgradeIndex">{row.order}</strong>
                        <div className="combatPriorityGoal">
                          <strong>{row.pick.option.name}</strong>
                          <span>{row.pick.option.detail}</span>
                        </div>
                        <div className="combatPriorityMetric">
                          <strong>{row.pick.totalGainPercent.toFixed(3)}%</strong>
                          <span>전투력 +{row.combatPowerDelta.toLocaleString()}</span>
                        </div>
                        <div className="combatPriorityCost">
                          <strong>{formatGold(row.pick.totalCost)}</strong>
                          {row.pick.option.category === "보석" && goldCashRate > 0 ? (
                            <span>{formatCompactWon(goldToCash(row.pick.totalCost, goldCashRate))}</span>
                          ) : null}
                        </div>
                        <div className="combatPriorityCost">
                          <strong>{formatGold(row.costPerPercent)}</strong>
                        </div>
                      </summary>
                      <div className="combatUpgradeDetailList">
                        <div>해야 할 일: {getCombatActionGuide(row.pick.option)}</div>
                        <div>현재 {"->"} 목표: {row.pick.option.fromTo}</div>
                        <div>분류: {row.pick.option.category}</div>
                        <div>비용 기준: {row.pick.option.costPerStep <= 0 ? "골드 지출 없음" : `${formatGold(row.pick.option.costPerStep)} / 1회`}</div>
                        <div>전투력 상승: +{row.combatPowerDelta.toLocaleString()}</div>
                        <div>누적 예상 전투력: {row.expectedCombatPower.toLocaleString()}</div>
                        <div>목표 레벨 비용: {formatGold(displayedTotalSpendGold)}</div>
                        <div>전투력 추가 누적: {formatGold(Math.max(0, row.cumulativeCost - displayedTotalSpendGold))}</div>
                        <div>총 누적 비용: {formatGold(row.cumulativeCost)}</div>
                        {equipmentPreview ? (
                          <>
                            <div>장비 후보 비용은 현재 입력된 평균 비용값 기준이야. 아래 재료는 현재 보유량 기준 예상 소모량이야.</div>
                            {equipmentPreview.usageRows.map((materialRow) => (
                              <div key={`${row.pick.option.id}-${materialRow.key}`}>
                                {materialRow.label}: {formatRouteMaterialUsageSummary(materialRow)}
                              </div>
                            ))}
                            {equipmentPreview.supportGuides.map((guide, index) => (
                              <div key={`${row.pick.option.id}-support-${index}`}>{guide}</div>
                            ))}
                          </>
                        ) : null}
                        {row.pick.option.category === "보석" && goldCashRate > 0 ? (
                          <div>보석 현금 환산: {formatCompactWon(goldToCash(row.pick.totalCost, goldCashRate))}</div>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="growthEmpty">
              {combatPlan.reachable
                ? "목표 레벨 달성만으로 목표 전투력에 도달해."
                : generatedCombatOptions.length
                  ? "현재 후보를 모두 반영해도 목표 전투력까지 부족해. 목표 단계를 더 올리거나 후보 증가율을 보정해줘."
                  : "현재 후보만으로는 목표 전투력까지 닿지 않아. 진행 가능 횟수나 증가율을 보정해줘."}
            </div>
          )}
          <div className="growthHint">
            비용은 해당 스펙업을 한 번 진행하는 골드이고, 1%당 비용은 전투력 증가율 대비 가격을 비교하는 효율 지표야.
          </div>
        </section>
      ) : null}
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



