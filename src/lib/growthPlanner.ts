import { getAdvancedRefineTable, type AdvancedRefineTable, type AdvancedRefineTarget } from "./icepengAdvanced/data";
import { getReport } from "./icepengAdvanced/logic";
import { getRefineTable, type RefineTable } from "./icepengRefining/data";
import { optimize as optimizeNormalRefine, type Path as NormalRefinePath } from "./icepengRefining/refine";
import { OCR_SCREEN_TEMPLATES, type OcrFieldBox } from "./refiningData";

export type EquipmentSlot = "weapon" | "helmet" | "shoulder" | "chest" | "pants" | "gloves";

export type RefiningMode = "normal" | "advanced" | "hybrid";

export type MaterialFamily = "legacy" | "successor";

export type EquipmentPieceState = {
  slot: EquipmentSlot;
  itemLevel: number;
  honingLevel: number;
  advancedRefiningLevel: number;
  tierLabel: string;
  artisanEnergy: number;
  currentRefiningExp: number;
  supportBonusPercent: number;
};

export type CharacterGrowthState = {
  tableId: string;
  tableName: string;
  charId: string;
  characterName: string;
  currentItemLevel: number;
  targetItemLevel: number;
  currentWeeklyGold: number;
  currentWeeklyBoundGold: number;
  targetWeeklyGold: number;
  preferredMode: RefiningMode;
  pieces: EquipmentPieceState[];
  confirmedUpgrades?: ConfirmedUpgrade[];
};

export type ConfirmedUpgrade = {
  id: string;
  slot: EquipmentSlot;
  action: "normal" | "advanced";
  targetLevel: number;
};

export type MaterialInventory = {
  boundShards: number;
  tradableShards: number;
  boundLeapstones: number;
  tradableLeapstones: number;
  boundProtectionStones: number;
  tradableProtectionStones: number;
  boundDestructionStones: number;
  tradableDestructionStones: number;
  boundFusion: number;
  tradableFusion: number;
  boundSuccessorLeapstones: number;
  tradableSuccessorLeapstones: number;
  boundSuccessorProtectionStones: number;
  tradableSuccessorProtectionStones: number;
  boundSuccessorDestructionStones: number;
  tradableSuccessorDestructionStones: number;
  boundSuperiorFusion: number;
  tradableSuperiorFusion: number;
  boundIceBreaths: number;
  tradableIceBreaths: number;
  boundLavaBreaths: number;
  tradableLavaBreaths: number;
  tailoringBooks: number;
  metallurgyBooks: number;
  artisanTailoringBook1: number;
  artisanTailoringBook2: number;
  artisanTailoringBook3: number;
  artisanTailoringBook4: number;
  artisanMetallurgyBook1: number;
  artisanMetallurgyBook2: number;
  artisanMetallurgyBook3: number;
  artisanMetallurgyBook4: number;
  upheavalTailoringBook15: number;
  upheavalMetallurgyBook15: number;
  upheavalTailoringBook19: number;
  upheavalMetallurgyBook19: number;
  enhancedUpheavalTailoringBook19: number;
  enhancedUpheavalMetallurgyBook19: number;
  graceFragments: number;
  gold: number;
  boundGold: number;
  silver: number;
};

export type MarketPriceSnapshot = {
  shardPricePer1000: number;
  shardSmallPouchPrice: number;
  shardMediumPouchPrice: number;
  shardLargePouchPrice: number;
  leapstonePrice: number;
  protectionStonePricePer10: number;
  destructionStonePricePer10: number;
  fusionPrice: number;
  successorLeapstonePrice: number;
  successorProtectionStonePricePer10: number;
  successorDestructionStonePricePer10: number;
  superiorFusionPrice: number;
  iceBreathPrice: number;
  lavaBreathPrice: number;
  tailoringBookPrice: number;
  metallurgyBookPrice: number;
  enhancedTailoringBookPrice: number;
  enhancedMetallurgyBookPrice: number;
  artisanTailoringBook1Price: number;
  artisanTailoringBook2Price: number;
  artisanTailoringBook3Price: number;
  artisanTailoringBook4Price: number;
  artisanMetallurgyBook1Price: number;
  artisanMetallurgyBook2Price: number;
  artisanMetallurgyBook3Price: number;
  artisanMetallurgyBook4Price: number;
  upheavalTailoringBook15Price: number;
  upheavalMetallurgyBook15Price: number;
  upheavalTailoringBook19Price: number;
  upheavalMetallurgyBook19Price: number;
};

export type OcrDraftField =
  | "currentItemLevel"
  | "targetItemLevel"
  | "currentWeeklyGold"
  | "targetWeeklyGold"
  | "materials"
  | "equipment"
  | "artisanEnergy"
  | "currentRefiningExp";

export type OcrDraft = {
  status: "idle" | "uploaded" | "review";
  screenshotName: string;
  screenshotDataUrl: string;
  extractedAt: number | null;
  recognizedFields: OcrDraftField[];
  notes: string;
  screenTemplateKey: string;
  selectedFieldId: string;
  fields: OcrFieldBox[];
};

export type GrowthPlannerState = {
  character: CharacterGrowthState;
  materials: MaterialInventory;
  market: MarketPriceSnapshot;
  ocr: OcrDraft;
};

export type MaterialNeedBreakdown = {
  shards: number;
  leapstones: number;
  protectionStones: number;
  destructionStones: number;
  fusion: number;
  successorLeapstones: number;
  successorProtectionStones: number;
  successorDestructionStones: number;
  superiorFusion: number;
  iceBreaths: number;
  lavaBreaths: number;
  tailoringBooks: number;
  metallurgyBooks: number;
  artisanTailoringBook1: number;
  artisanTailoringBook2: number;
  artisanTailoringBook3: number;
  artisanTailoringBook4: number;
  artisanMetallurgyBook1: number;
  artisanMetallurgyBook2: number;
  artisanMetallurgyBook3: number;
  artisanMetallurgyBook4: number;
  upheavalTailoringBook15: number;
  upheavalMetallurgyBook15: number;
  upheavalTailoringBook19: number;
  upheavalMetallurgyBook19: number;
  enhancedUpheavalTailoringBook19: number;
  enhancedUpheavalMetallurgyBook19: number;
};

export type RefiningRouteStep = {
  slot: EquipmentSlot;
  slotLabel: string;
  itemName: string;
  action: "normal" | "advanced";
  fromLevel: number;
  toLevel: number;
  materialFamily: MaterialFamily;
  averageCost: number;
  directGold: number;
  expectedMaterials: MaterialNeedPatch;
  levelGain: number;
  efficiency: number;
  supportName: string;
  supportWorthUsing: boolean | null;
  supportSavedGold: number;
  notes: string[];
  confirmed?: boolean;
};

export type GrowthEstimate = {
  levelGap: number;
  routeLabel: string;
  directGoldCost: number;
  materialPurchaseCost: number;
  boundMaterialOffset: number;
  totalSpendGold: number;
  requiredMaterials: MaterialNeedBreakdown;
  routeSteps: RefiningRouteStep[];
  additionalWeeklyGold: number;
  paybackWeeks: number | null;
  boundGoldUsableNow: number;
  tradableGoldNeededNow: number;
  boundGoldAffordableWeeks: number | null;
  recommendedWaitWeeks: number;
  recommendedBoundGoldUse: number;
  recommendedTradableGoldUse: number;
  tailoringBreakEvenPrice: number;
  metallurgyBreakEvenPrice: number;
  tailoringWorthUsing: boolean | null;
  metallurgyWorthUsing: boolean | null;
  summary: string[];
};

const PIECE_SLOTS: EquipmentSlot[] = ["helmet", "shoulder", "chest", "pants", "gloves", "weapon"];

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: "무기",
  helmet: "투구",
  shoulder: "견갑",
  chest: "상의",
  pants: "하의",
  gloves: "장갑",
};

const ARMOR_SLOTS = new Set<EquipmentSlot>(["helmet", "shoulder", "chest", "pants", "gloves"]);

type MaterialNeedPatch = Partial<MaterialNeedBreakdown>;

type NormalRefineCostRow = {
  directGold: number;
  shards: number;
  leapstones: number;
  protectionStones: number;
  destructionStones: number;
  fusion: number;
  breath: number;
  baseRate: number;
};

type AdvancedRefineCostRow = {
  directGold: number;
  shards: number;
  leapstones: number;
  protectionStones: number;
  destructionStones: number;
  fusion: number;
  breath: number;
  baseRate: number;
};

type RefiningActionCandidate = {
  piece: EquipmentPieceState;
  action: "normal" | "advanced";
  fromLevel: number;
  toLevel: number;
  materialFamily: MaterialFamily;
  levelGain: number;
  directGold: number;
  expectedMaterials: MaterialNeedPatch;
  averageCost: number;
  efficiency: number;
  supportName: string;
  supportWorthUsing: boolean | null;
  supportSavedGold: number;
  notes: string[];
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyNeeds(): MaterialNeedBreakdown {
  return {
    shards: 0,
    leapstones: 0,
    protectionStones: 0,
    destructionStones: 0,
    fusion: 0,
    successorLeapstones: 0,
    successorProtectionStones: 0,
    successorDestructionStones: 0,
    superiorFusion: 0,
    iceBreaths: 0,
    lavaBreaths: 0,
    tailoringBooks: 0,
    metallurgyBooks: 0,
    artisanTailoringBook1: 0,
    artisanTailoringBook2: 0,
    artisanTailoringBook3: 0,
    artisanTailoringBook4: 0,
    artisanMetallurgyBook1: 0,
    artisanMetallurgyBook2: 0,
    artisanMetallurgyBook3: 0,
    artisanMetallurgyBook4: 0,
    upheavalTailoringBook15: 0,
    upheavalMetallurgyBook15: 0,
    upheavalTailoringBook19: 0,
    upheavalMetallurgyBook19: 0,
    enhancedUpheavalTailoringBook19: 0,
    enhancedUpheavalMetallurgyBook19: 0,
  };
}

function addNeeds(target: MaterialNeedBreakdown, patch: MaterialNeedPatch, multiplier = 1) {
  for (const key of Object.keys(patch) as Array<keyof MaterialNeedBreakdown>) {
    target[key] += Number(patch[key] || 0) * multiplier;
  }
}

function hasMaterialNeeds(patch: MaterialNeedPatch) {
  return Object.values(patch).some((value) => Number(value || 0) > 0);
}

function scaleMaterialNeeds(patch: MaterialNeedPatch, multiplier: number): MaterialNeedPatch {
  const scaled: MaterialNeedPatch = {};
  for (const key of Object.keys(patch) as Array<keyof MaterialNeedBreakdown>) {
    const value = Number(patch[key] || 0) * multiplier;
    if (value > 0) scaled[key] = value;
  }
  return scaled;
}

function materialFamilyForPiece(piece: EquipmentPieceState): MaterialFamily {
  const label = piece.tierLabel || "";
  if (label.includes("전율")) return "successor";
  return "legacy";
}

function itemName(piece: EquipmentPieceState) {
  return piece.tierLabel?.trim() || "장비 이름 미입력";
}

function isWeapon(piece: EquipmentPieceState) {
  return piece.slot === "weapon";
}

function deriveEquipmentItemLevel(piece: EquipmentPieceState) {
  const explicit = Number(piece.itemLevel || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const honingLevel = Number(piece.honingLevel || 0);
  if (!Number.isFinite(honingLevel) || honingLevel <= 0) return 0;

  const advancedLevel = Math.max(0, Number(piece.advancedRefiningLevel || 0));
  const inferred = 1590 + honingLevel * 5 + advancedLevel;
  return Number.isFinite(inferred) && inferred >= 1500 && inferred <= 1900 ? inferred : 0;
}

function getNormalSuccessRate(honingLevel: number) {
  if (honingLevel <= 18) return 0.05;
  if (honingLevel === 19) return 0.04;
  if (honingLevel === 20) return 0.035;
  if (honingLevel === 21) return 0.03;
  if (honingLevel === 22) return 0.02;
  return 0.015;
}

function getAdvancedSuccessRate(advancedLevel: number) {
  if (advancedLevel < 10) return 0.1;
  if (advancedLevel < 20) return 0.07;
  if (advancedLevel < 30) return 0.04;
  if (advancedLevel < 40) return 0.025;
  return 0.018;
}

function expectedAttempts(baseRate: number, artisanEnergy: number, currentExp: number, supportBonusRate = 0) {
  const artisanBonus = Math.min(0.4, Math.max(0, artisanEnergy) / 1000);
  const expBonus = Math.min(0.25, Math.max(0, currentExp) / 250000);
  const rate = Math.max(0.01, Math.min(0.9, baseRate + supportBonusRate + artisanBonus + expBonus));
  return Math.min(120, 1 / rate);
}

function normalRefineTableCost(piece: EquipmentPieceState, family: MaterialFamily): NormalRefineCostRow | null {
  const level = piece.honingLevel;
  const weapon = isWeapon(piece);

  if (family !== "legacy") return null;

  if (!weapon && level === 19) {
    return {
      directGold: 2300,
      shards: 9600,
      leapstones: 27,
      protectionStones: 1770,
      destructionStones: 0,
      fusion: 21,
      breath: 25,
      baseRate: 0.015,
    };
  }

  return null;
}

function advancedRefineTableCost(piece: EquipmentPieceState, family: MaterialFamily): AdvancedRefineCostRow | null {
  const level = piece.advancedRefiningLevel;
  const weapon = isWeapon(piece);

  if (family !== "legacy") return null;

  const band = level < 10 ? 0 : level < 20 ? 1 : level < 30 ? 2 : 3;
  const armorRows: AdvancedRefineCostRow[] = [
    { directGold: 475, shards: 300, leapstones: 4, protectionStones: 150, destructionStones: 0, fusion: 5, breath: 4, baseRate: 0.1 },
    { directGold: 900, shards: 600, leapstones: 5, protectionStones: 270, destructionStones: 0, fusion: 5, breath: 6, baseRate: 0.1 },
    { directGold: 2000, shards: 7000, leapstones: 18, protectionStones: 1000, destructionStones: 0, fusion: 17, breath: 20, baseRate: 0.1 },
    { directGold: 2400, shards: 8000, leapstones: 23, protectionStones: 1200, destructionStones: 0, fusion: 19, breath: 24, baseRate: 0.1 },
  ];
  const weaponRows: AdvancedRefineCostRow[] = [
    { directGold: 563, shards: 500, leapstones: 5, protectionStones: 0, destructionStones: 180, fusion: 8, breath: 4, baseRate: 0.1 },
    { directGold: 1250, shards: 1000, leapstones: 7, protectionStones: 0, destructionStones: 330, fusion: 9, breath: 6, baseRate: 0.1 },
    { directGold: 3000, shards: 11500, leapstones: 25, protectionStones: 0, destructionStones: 1200, fusion: 28, breath: 20, baseRate: 0.1 },
    { directGold: 4000, shards: 13000, leapstones: 32, protectionStones: 0, destructionStones: 1400, fusion: 30, breath: 24, baseRate: 0.1 },
  ];
  const row = weapon ? weaponRows[band] : armorRows[band];

  if (row) {
    return row;
  }

  return null;
}

function supportBookFor(piece: EquipmentPieceState, action: "normal", family: MaterialFamily) {
  if (action !== "normal") return null;
  if (piece.honingLevel !== 19) return null;
  const isArmor = ARMOR_SLOTS.has(piece.slot);
  const isLegacy = family === "legacy";
  if (!isLegacy) return null;
  const familyLabel = isLegacy ? "업화" : "전율";
  const rangeLabel = "[19-20]";
  const bonusRate = 0.03;

  return {
    materialKey: isArmor ? ("tailoringBooks" as const) : ("metallurgyBooks" as const),
    marketKey: isArmor ? ("tailoringBookPrice" as const) : ("metallurgyBookPrice" as const),
    name: `${isArmor ? "강화 재봉술" : "강화 야금술"} : ${familyLabel} ${rangeLabel}`,
    bonusRate,
  };
}

function normalTapCost(piece: EquipmentPieceState, family: MaterialFamily) {
  const tableCost = normalRefineTableCost(piece, family);
  if (tableCost) {
    const weapon = isWeapon(piece);
    return {
      directGold: tableCost.directGold,
      baseRate: tableCost.baseRate,
      materials: {
        shards: tableCost.shards,
        leapstones: tableCost.leapstones,
        protectionStones: tableCost.protectionStones,
        destructionStones: tableCost.destructionStones,
        fusion: tableCost.fusion,
      } satisfies MaterialNeedPatch,
    };
  }

  const level = Math.max(18, piece.honingLevel || 18);
  const weapon = isWeapon(piece);
  const levelFactor = Math.max(0, level - 18);
  const familyFactor = family === "successor" ? 1.22 : 1;
  const weaponFactor = weapon ? 1.65 : 1;
  const baseGold = (family === "successor" ? 1700 : 1250) + levelFactor * (family === "successor" ? 260 : 190);
  const common = {
    shards: Math.round((weapon ? 1600 : 1050) * familyFactor + levelFactor * 95),
  };

  if (family === "successor") {
    return {
      directGold: Math.round(baseGold * weaponFactor),
      baseRate: getNormalSuccessRate(piece.honingLevel),
      materials: {
        ...common,
        successorLeapstones: Math.round((weapon ? 5 : 3) + levelFactor * 0.7),
        successorProtectionStones: weapon ? 0 : Math.round(145 + levelFactor * 16),
        successorDestructionStones: weapon ? Math.round(220 + levelFactor * 24) : 0,
        superiorFusion: Math.round((weapon ? 8 : 5) + levelFactor * 0.75),
      } satisfies MaterialNeedPatch,
    };
  }

  return {
    directGold: Math.round(baseGold * weaponFactor),
    baseRate: getNormalSuccessRate(piece.honingLevel),
    materials: {
      ...common,
      leapstones: Math.round((weapon ? 6 : 4) + levelFactor * 0.8),
      protectionStones: weapon ? 0 : Math.round(190 + levelFactor * 20),
      destructionStones: weapon ? Math.round(280 + levelFactor * 30) : 0,
      fusion: Math.round((weapon ? 11 : 7) + levelFactor),
    } satisfies MaterialNeedPatch,
  };
}

function advancedTapCost(piece: EquipmentPieceState, family: MaterialFamily) {
  const tableCost = advancedRefineTableCost(piece, family);
  if (tableCost) {
    const weapon = isWeapon(piece);
    return {
      directGold: tableCost.directGold,
      baseRate: tableCost.baseRate,
      materials: {
        shards: tableCost.shards,
        leapstones: tableCost.leapstones,
        protectionStones: tableCost.protectionStones,
        destructionStones: tableCost.destructionStones,
        fusion: tableCost.fusion,
        iceBreaths: weapon ? 0 : tableCost.breath,
        lavaBreaths: weapon ? tableCost.breath : 0,
      } satisfies MaterialNeedPatch,
    };
  }

  const level = Math.max(0, piece.advancedRefiningLevel || 0);
  const weapon = isWeapon(piece);
  const band = Math.floor(level / 10);
  const familyFactor = family === "successor" ? 1.2 : 1;
  const weaponFactor = weapon ? 1.55 : 1;
  const bandCostFactor = level < 10 ? 0.78 : level < 20 ? 0.9 : level < 30 ? 0.62 : 1.08;
  const baseGold = ((family === "successor" ? 1350 : 980) + band * (family === "successor" ? 360 : 270)) * bandCostFactor;
  const common = {
    shards: Math.round(((weapon ? 1250 : 820) + band * 160) * familyFactor * bandCostFactor),
  };

  if (family === "successor") {
    return {
      directGold: Math.round(baseGold * weaponFactor),
      materials: {
        ...common,
        successorLeapstones: Math.round(((weapon ? 4 : 3) + band) * bandCostFactor),
        successorProtectionStones: weapon ? 0 : Math.round((105 + band * 30) * bandCostFactor),
        successorDestructionStones: weapon ? Math.round((160 + band * 45) * bandCostFactor) : 0,
        superiorFusion: Math.round(((weapon ? 7 : 4) + band) * bandCostFactor),
      } satisfies MaterialNeedPatch,
    };
  }

  return {
    directGold: Math.round(baseGold * weaponFactor),
    materials: {
      ...common,
      leapstones: Math.round(((weapon ? 5 : 3) + band) * bandCostFactor),
      protectionStones: weapon ? 0 : Math.round((135 + band * 35) * bandCostFactor),
      destructionStones: weapon ? Math.round((210 + band * 55) * bandCostFactor) : 0,
      fusion: Math.round(((weapon ? 9 : 6) + band) * bandCostFactor),
    } satisfies MaterialNeedPatch,
  };
}

function materialPatchCost(patch: MaterialNeedPatch, market: MarketPriceSnapshot) {
  const shardPrice = resolveShardPricePer1000(market);
  return (
    ((patch.shards || 0) / 1000) * shardPrice +
    (patch.leapstones || 0) * market.leapstonePrice +
    ((patch.protectionStones || 0) / 10) * market.protectionStonePricePer10 +
    ((patch.destructionStones || 0) / 10) * market.destructionStonePricePer10 +
    (patch.fusion || 0) * market.fusionPrice +
    (patch.successorLeapstones || 0) * market.successorLeapstonePrice +
    ((patch.successorProtectionStones || 0) / 10) * market.successorProtectionStonePricePer10 +
    ((patch.successorDestructionStones || 0) / 10) * market.successorDestructionStonePricePer10 +
    (patch.superiorFusion || 0) * market.superiorFusionPrice +
    (patch.iceBreaths || 0) * market.iceBreathPrice +
    (patch.lavaBreaths || 0) * market.lavaBreathPrice +
    supportBookCost(patch, market)
  );
}

function resolveShardPricePer1000(market: MarketPriceSnapshot) {
  const pouchCandidates = [
    market.shardSmallPouchPrice,
    market.shardMediumPouchPrice ? market.shardMediumPouchPrice / 2 : 0,
    market.shardLargePouchPrice ? market.shardLargePouchPrice / 3 : 0,
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (pouchCandidates.length) return Math.min(...pouchCandidates);
  return Number.isFinite(market.shardPricePer1000) && market.shardPricePer1000 > 0 ? market.shardPricePer1000 : 0;
}

function advancedTargetForLevel(level: number): AdvancedRefineTarget {
  if (level < 10) return "t4_0";
  if (level < 20) return "t4_1";
  if (level < 30) return "t4_2";
  return "t4_3";
}

function buildAdvancedPriceTableLegacy(market: MarketPriceSnapshot) {
  const shardUnit = resolveShardPricePer1000(market) / 1000;
  return {
    운명의수호석: market.protectionStonePricePer10 / 10,
    운명의파괴석: market.destructionStonePricePer10 / 10,
    운돌: market.leapstonePrice,
    아비도스: market.fusionPrice,
    운명의파편: shardUnit,
    골드: 1,
    빙하: market.iceBreathPrice,
    용암: market.lavaBreathPrice,
    장인의재봉술1단계: market.tailoringBookPrice || Number.POSITIVE_INFINITY,
    장인의재봉술2단계: market.tailoringBookPrice || Number.POSITIVE_INFINITY,
    장인의재봉술3단계: market.tailoringBookPrice || Number.POSITIVE_INFINITY,
    장인의재봉술4단계: market.tailoringBookPrice || Number.POSITIVE_INFINITY,
    장인의야금술1단계: market.metallurgyBookPrice || Number.POSITIVE_INFINITY,
    장인의야금술2단계: market.metallurgyBookPrice || Number.POSITIVE_INFINITY,
    장인의야금술3단계: market.metallurgyBookPrice || Number.POSITIVE_INFINITY,
    장인의야금술4단계: market.metallurgyBookPrice || Number.POSITIVE_INFINITY,
  } satisfies Record<string, number>;
}

function finitePrice(value: number, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function supportMaterialPrice(marketPrice: number, ownedAmount: number) {
  if (Number.isFinite(marketPrice) && marketPrice > 0) return marketPrice;
  return ownedAmount > 0 ? 0 : Number.POSITIVE_INFINITY;
}

function normalizeSupportMaterialName(name: string) {
  return String(name || "").replace(/\s+/g, "").replace(/[：]/g, ":").trim();
}

type SupportMaterialMapping = {
  materialKey: keyof MaterialNeedBreakdown;
  inventoryKey: keyof MaterialInventory;
  marketKey: keyof MarketPriceSnapshot;
  label: string;
};

function supportBookMappingByName(name: string, piece: EquipmentPieceState): SupportMaterialMapping | null {
  const normalized = normalizeSupportMaterialName(name);
  const weapon = isWeapon(piece);

  if (normalized.includes("장인의재봉술1단계")) {
    return { materialKey: "artisanTailoringBook1", inventoryKey: "artisanTailoringBook1", marketKey: "artisanTailoringBook1Price", label: "장인의 재봉술 : 1단계" };
  }
  if (normalized.includes("장인의재봉술2단계")) {
    return { materialKey: "artisanTailoringBook2", inventoryKey: "artisanTailoringBook2", marketKey: "artisanTailoringBook2Price", label: "장인의 재봉술 : 2단계" };
  }
  if (normalized.includes("장인의재봉술3단계")) {
    return { materialKey: "artisanTailoringBook3", inventoryKey: "artisanTailoringBook3", marketKey: "artisanTailoringBook3Price", label: "장인의 재봉술 : 3단계" };
  }
  if (normalized.includes("장인의재봉술4단계")) {
    return { materialKey: "artisanTailoringBook4", inventoryKey: "artisanTailoringBook4", marketKey: "artisanTailoringBook4Price", label: "장인의 재봉술 : 4단계" };
  }
  if (normalized.includes("장인의야금술1단계")) {
    return { materialKey: "artisanMetallurgyBook1", inventoryKey: "artisanMetallurgyBook1", marketKey: "artisanMetallurgyBook1Price", label: "장인의 야금술 : 1단계" };
  }
  if (normalized.includes("장인의야금술2단계")) {
    return { materialKey: "artisanMetallurgyBook2", inventoryKey: "artisanMetallurgyBook2", marketKey: "artisanMetallurgyBook2Price", label: "장인의 야금술 : 2단계" };
  }
  if (normalized.includes("장인의야금술3단계")) {
    return { materialKey: "artisanMetallurgyBook3", inventoryKey: "artisanMetallurgyBook3", marketKey: "artisanMetallurgyBook3Price", label: "장인의 야금술 : 3단계" };
  }
  if (normalized.includes("장인의야금술4단계")) {
    return { materialKey: "artisanMetallurgyBook4", inventoryKey: "artisanMetallurgyBook4", marketKey: "artisanMetallurgyBook4Price", label: "장인의 야금술 : 4단계" };
  }

  if (normalized.includes("강화재봉술") && normalized.includes("업화[19-20]")) {
    return { materialKey: "enhancedUpheavalTailoringBook19", inventoryKey: "enhancedUpheavalTailoringBook19", marketKey: "enhancedTailoringBookPrice", label: "강화 재봉술 : 업화 [19-20]" };
  }
  if (normalized.includes("강화야금술") && normalized.includes("업화[19-20]")) {
    return { materialKey: "enhancedUpheavalMetallurgyBook19", inventoryKey: "enhancedUpheavalMetallurgyBook19", marketKey: "enhancedMetallurgyBookPrice", label: "강화 야금술 : 업화 [19-20]" };
  }
  if (normalized.includes("재봉술업화B") || (normalized.includes("재봉술") && normalized.includes("업화[15-18]"))) {
    return { materialKey: "upheavalTailoringBook15", inventoryKey: "upheavalTailoringBook15", marketKey: "upheavalTailoringBook15Price", label: "재봉술 : 업화 [15-18]" };
  }
  if (normalized.includes("야금술업화B") || (normalized.includes("야금술") && normalized.includes("업화[15-18]"))) {
    return { materialKey: "upheavalMetallurgyBook15", inventoryKey: "upheavalMetallurgyBook15", marketKey: "upheavalMetallurgyBook15Price", label: "야금술 : 업화 [15-18]" };
  }
  if (normalized.includes("재봉술업화C") || (normalized.includes("재봉술") && normalized.includes("업화[19-20]"))) {
    return { materialKey: "upheavalTailoringBook19", inventoryKey: "upheavalTailoringBook19", marketKey: "upheavalTailoringBook19Price", label: "재봉술 : 업화 [19-20]" };
  }
  if (normalized.includes("야금술업화C") || (normalized.includes("야금술") && normalized.includes("업화[19-20]"))) {
    return { materialKey: "upheavalMetallurgyBook19", inventoryKey: "upheavalMetallurgyBook19", marketKey: "upheavalMetallurgyBook19Price", label: "야금술 : 업화 [19-20]" };
  }

  if (normalized.includes("재봉술") && !weapon) {
    return { materialKey: "tailoringBooks", inventoryKey: "tailoringBooks", marketKey: "tailoringBookPrice", label: "재봉술" };
  }
  if (normalized.includes("야금술") && weapon) {
    return { materialKey: "metallurgyBooks", inventoryKey: "metallurgyBooks", marketKey: "metallurgyBookPrice", label: "야금술" };
  }

  return null;
}

function supportBookCost(patch: MaterialNeedPatch, market: MarketPriceSnapshot) {
  return (
    (patch.tailoringBooks || 0) * market.tailoringBookPrice +
    (patch.metallurgyBooks || 0) * market.metallurgyBookPrice +
    (patch.artisanTailoringBook1 || 0) * market.artisanTailoringBook1Price +
    (patch.artisanTailoringBook2 || 0) * market.artisanTailoringBook2Price +
    (patch.artisanTailoringBook3 || 0) * market.artisanTailoringBook3Price +
    (patch.artisanTailoringBook4 || 0) * market.artisanTailoringBook4Price +
    (patch.artisanMetallurgyBook1 || 0) * market.artisanMetallurgyBook1Price +
    (patch.artisanMetallurgyBook2 || 0) * market.artisanMetallurgyBook2Price +
    (patch.artisanMetallurgyBook3 || 0) * market.artisanMetallurgyBook3Price +
    (patch.artisanMetallurgyBook4 || 0) * market.artisanMetallurgyBook4Price +
    (patch.upheavalTailoringBook15 || 0) * market.upheavalTailoringBook15Price +
    (patch.upheavalMetallurgyBook15 || 0) * market.upheavalMetallurgyBook15Price +
    (patch.upheavalTailoringBook19 || 0) * market.upheavalTailoringBook19Price +
    (patch.upheavalMetallurgyBook19 || 0) * market.upheavalMetallurgyBook19Price +
    (patch.enhancedUpheavalTailoringBook19 || 0) * market.enhancedTailoringBookPrice +
    (patch.enhancedUpheavalMetallurgyBook19 || 0) * market.enhancedMetallurgyBookPrice
  );
}

function buildAdvancedPriceTable(
  table: AdvancedRefineTable,
  piece: EquipmentPieceState,
  market: MarketPriceSnapshot,
  materials?: MaterialInventory
) {
  const shardUnit = resolveShardPricePer1000(market) / 1000;
  const priceTable: Record<string, number> = {};
  const amountKeys = Object.keys(table.amount);

  amountKeys.forEach((key, index) => {
    if (index === amountKeys.length - 1) {
      priceTable[key] = 1;
    } else if (index === 0) {
      priceTable[key] = isWeapon(piece)
        ? finitePrice(market.destructionStonePricePer10) / 10
        : finitePrice(market.protectionStonePricePer10) / 10;
    } else if (index === 1) {
      priceTable[key] = finitePrice(market.leapstonePrice);
    } else if (index === 2) {
      priceTable[key] = finitePrice(market.fusionPrice);
    } else if (index === 3) {
      priceTable[key] = shardUnit;
    }
  });

  Object.keys(table.breath).forEach((key, index) => {
    if (index === 0) {
      const ownedBreaths = isWeapon(piece)
        ? (materials?.boundLavaBreaths || 0) + (materials?.tradableLavaBreaths || 0)
        : (materials?.boundIceBreaths || 0) + (materials?.tradableIceBreaths || 0);
      priceTable[key] = isWeapon(piece)
        ? supportMaterialPrice(market.lavaBreathPrice, ownedBreaths)
        : supportMaterialPrice(market.iceBreathPrice, ownedBreaths);
    } else {
      priceTable[key] = 0;
    }
  });

  if (table.book) {
    const mapping = supportBookMappingByName(table.book, piece);
    if (mapping) {
      priceTable[table.book] = supportMaterialPrice(Number(market[mapping.marketKey] || 0), Number(materials?.[mapping.inventoryKey] || 0));
    }
  }

  return priceTable;
}

function mapAdvancedExpectedMaterials(
  materials: Array<{ name: string; amount: number } | undefined | null> = [],
  piece: EquipmentPieceState
): MaterialNeedPatch {
  const patch: MaterialNeedPatch = {};
  materials.forEach((material, index) => {
    const amount = Number(material?.amount || 0);
    if (!amount) return;

    if (index === 0) {
      const key = isWeapon(piece) ? "destructionStones" : "protectionStones";
      patch[key] = (patch[key] || 0) + amount;
      return;
    }
    if (index === 1) {
      patch.leapstones = (patch.leapstones || 0) + amount;
      return;
    }
    if (index === 2) {
      patch.fusion = (patch.fusion || 0) + amount;
      return;
    }
    if (index === 3) {
      patch.shards = (patch.shards || 0) + amount;
      return;
    }
    if (index === 4) return;
    const mapping = supportBookMappingByName(material?.name || "", piece);
    const key =
      mapping?.materialKey ??
      (index === 5
        ? isWeapon(piece)
          ? "lavaBreaths"
          : "iceBreaths"
        : isWeapon(piece)
          ? "metallurgyBooks"
          : "tailoringBooks");
    patch[key] = (patch[key] || 0) + amount;
  });

  return patch;
}

function normalRefineGradeForFamily(family: MaterialFamily) {
  return family === "successor" ? "t4_1730" : "t4_1590";
}

function getIcepengNormalRefineTable(piece: EquipmentPieceState, family: MaterialFamily) {
  const targetLevel = piece.honingLevel + 1;
  return getRefineTable(isWeapon(piece) ? "weapon" : "armor", normalRefineGradeForFamily(family), targetLevel, false, false);
}

function buildNormalPriceTable(
  table: RefineTable,
  piece: EquipmentPieceState,
  family: MaterialFamily,
  market: MarketPriceSnapshot,
  materials?: MaterialInventory
) {
  const shardUnit = resolveShardPricePer1000(market) / 1000;
  const priceTable: Record<string, number> = {};
  const amountKeys = Object.keys(table.amount);
  amountKeys.forEach((key, index) => {
    if (index === amountKeys.length - 1) priceTable[key] = 1;
    else if (index === 0) {
      priceTable[key] = family === "successor"
        ? (isWeapon(piece) ? market.successorDestructionStonePricePer10 : market.successorProtectionStonePricePer10) / 10
        : (isWeapon(piece) ? market.destructionStonePricePer10 : market.protectionStonePricePer10) / 10;
    } else if (index === 1) {
      priceTable[key] = family === "successor" ? market.successorLeapstonePrice : market.leapstonePrice;
    } else if (index === 2) {
      priceTable[key] = family === "successor" ? market.superiorFusionPrice : market.fusionPrice;
    } else if (index === 3) {
      priceTable[key] = shardUnit;
    }
  });

  Object.keys(table.breath).forEach((key, index) => {
    const isArmor = ARMOR_SLOTS.has(piece.slot);
    const isBook = index > 0;
    const mapping = supportBookMappingByName(key, piece);
    priceTable[key] = mapping
      ? supportMaterialPrice(Number(market[mapping.marketKey] || 0), Number(materials?.[mapping.inventoryKey] || 0))
      : isArmor
        ? (isBook ? market.tailoringBookPrice : market.iceBreathPrice)
        : (isBook ? market.metallurgyBookPrice : market.lavaBreathPrice);
  });

  return priceTable;
}

function mapNormalExpectedMaterials(table: RefineTable, piece: EquipmentPieceState, family: MaterialFamily, path: NormalRefinePath) {
  const patch: MaterialNeedPatch = {};
  let directGold = 0;
  let reachProbability = 1;
  const amountEntries = Object.entries(table.amount);
  const breathEntries = Object.entries(table.breath);

  for (const step of path) {
    amountEntries.forEach(([, amount], index) => {
      const expectedAmount = amount * reachProbability;
      if (index === amountEntries.length - 1) directGold += expectedAmount;
      else if (index === 0) {
        const key = family === "successor"
          ? isWeapon(piece) ? "successorDestructionStones" : "successorProtectionStones"
          : isWeapon(piece) ? "destructionStones" : "protectionStones";
        patch[key] = (patch[key] || 0) + expectedAmount;
      } else if (index === 1) {
        const key = family === "successor" ? "successorLeapstones" : "leapstones";
        patch[key] = (patch[key] || 0) + expectedAmount;
      } else if (index === 2) {
        const key = family === "successor" ? "superiorFusion" : "fusion";
        patch[key] = (patch[key] || 0) + expectedAmount;
      } else if (index === 3) {
        patch.shards = (patch.shards || 0) + expectedAmount;
      }
    });

    breathEntries.forEach(([name], index) => {
      const amount = step.breathes?.[name] || 0;
      if (!amount) return;
      const mapping = supportBookMappingByName(name, piece);
      const key =
        mapping?.materialKey ??
        (index === 0
          ? ARMOR_SLOTS.has(piece.slot)
            ? "iceBreaths"
            : "lavaBreaths"
          : ARMOR_SLOTS.has(piece.slot)
            ? "tailoringBooks"
            : "metallurgyBooks");
      patch[key] = (patch[key] || 0) + amount * reachProbability;
    });

    reachProbability *= Math.max(0, 1 - step.totalProb);
  }

  return { patch, directGold };
}

function normalBreathNames(table: RefineTable, path: NormalRefinePath, piece: EquipmentPieceState) {
  const names = new Set<string>();
  const breathKeys = Object.keys(table.breath);
  path.forEach((step) => {
    Object.entries(step.breathes || {}).forEach(([name, amount]) => {
      if (!amount) return;
      const index = breathKeys.indexOf(name);
      if (index === 0) names.add(isWeapon(piece) ? "용암의 숨결" : "빙하의 숨결");
      else names.add(isWeapon(piece) ? "야금술" : "재봉술");
    });
  });
  return Array.from(names);
}

function materialPatchPurchaseCost(patch: MaterialNeedPatch, materials: MaterialInventory, market: MarketPriceSnapshot) {
  const shardPrice = resolveShardPricePer1000(market);
  const buyShards = Math.max(0, (patch.shards || 0) - materials.boundShards - materials.tradableShards);
  const buyLeapstones = Math.max(0, (patch.leapstones || 0) - materials.boundLeapstones - materials.tradableLeapstones);
  const buyProtection = Math.max(0, (patch.protectionStones || 0) - materials.boundProtectionStones - materials.tradableProtectionStones);
  const buyDestruction = Math.max(0, (patch.destructionStones || 0) - materials.boundDestructionStones - materials.tradableDestructionStones);
  const buyFusion = Math.max(0, (patch.fusion || 0) - materials.boundFusion - materials.tradableFusion);
  const buySuccessorLeapstones = Math.max(0, (patch.successorLeapstones || 0) - materials.boundSuccessorLeapstones - materials.tradableSuccessorLeapstones);
  const buySuccessorProtection = Math.max(
    0,
    (patch.successorProtectionStones || 0) - materials.boundSuccessorProtectionStones - materials.tradableSuccessorProtectionStones
  );
  const buySuccessorDestruction = Math.max(
    0,
    (patch.successorDestructionStones || 0) - materials.boundSuccessorDestructionStones - materials.tradableSuccessorDestructionStones
  );
  const buySuperiorFusion = Math.max(0, (patch.superiorFusion || 0) - materials.boundSuperiorFusion - materials.tradableSuperiorFusion);
  const buyIceBreaths = Math.max(0, (patch.iceBreaths || 0) - materials.boundIceBreaths - materials.tradableIceBreaths);
  const buyLavaBreaths = Math.max(0, (patch.lavaBreaths || 0) - materials.boundLavaBreaths - materials.tradableLavaBreaths);
  const buyTailoring = Math.max(0, (patch.tailoringBooks || 0) - materials.tailoringBooks);
  const buyMetallurgy = Math.max(0, (patch.metallurgyBooks || 0) - materials.metallurgyBooks);
  const buyArtisanTailoring1 = Math.max(0, (patch.artisanTailoringBook1 || 0) - materials.artisanTailoringBook1);
  const buyArtisanTailoring2 = Math.max(0, (patch.artisanTailoringBook2 || 0) - materials.artisanTailoringBook2);
  const buyArtisanTailoring3 = Math.max(0, (patch.artisanTailoringBook3 || 0) - materials.artisanTailoringBook3);
  const buyArtisanTailoring4 = Math.max(0, (patch.artisanTailoringBook4 || 0) - materials.artisanTailoringBook4);
  const buyArtisanMetallurgy1 = Math.max(0, (patch.artisanMetallurgyBook1 || 0) - materials.artisanMetallurgyBook1);
  const buyArtisanMetallurgy2 = Math.max(0, (patch.artisanMetallurgyBook2 || 0) - materials.artisanMetallurgyBook2);
  const buyArtisanMetallurgy3 = Math.max(0, (patch.artisanMetallurgyBook3 || 0) - materials.artisanMetallurgyBook3);
  const buyArtisanMetallurgy4 = Math.max(0, (patch.artisanMetallurgyBook4 || 0) - materials.artisanMetallurgyBook4);
  const buyUpheavalTailoring15 = Math.max(0, (patch.upheavalTailoringBook15 || 0) - materials.upheavalTailoringBook15);
  const buyUpheavalMetallurgy15 = Math.max(0, (patch.upheavalMetallurgyBook15 || 0) - materials.upheavalMetallurgyBook15);
  const buyUpheavalTailoring19 = Math.max(0, (patch.upheavalTailoringBook19 || 0) - materials.upheavalTailoringBook19);
  const buyUpheavalMetallurgy19 = Math.max(0, (patch.upheavalMetallurgyBook19 || 0) - materials.upheavalMetallurgyBook19);
  const buyEnhancedTailoring19 = Math.max(0, (patch.enhancedUpheavalTailoringBook19 || 0) - materials.enhancedUpheavalTailoringBook19);
  const buyEnhancedMetallurgy19 = Math.max(0, (patch.enhancedUpheavalMetallurgyBook19 || 0) - materials.enhancedUpheavalMetallurgyBook19);

  return (
    (buyShards / 1000) * shardPrice +
    buyLeapstones * market.leapstonePrice +
    (buyProtection / 10) * market.protectionStonePricePer10 +
    (buyDestruction / 10) * market.destructionStonePricePer10 +
    buyFusion * market.fusionPrice +
    buySuccessorLeapstones * market.successorLeapstonePrice +
    (buySuccessorProtection / 10) * market.successorProtectionStonePricePer10 +
    (buySuccessorDestruction / 10) * market.successorDestructionStonePricePer10 +
    buySuperiorFusion * market.superiorFusionPrice +
    buyIceBreaths * market.iceBreathPrice +
    buyLavaBreaths * market.lavaBreathPrice +
    buyTailoring * market.tailoringBookPrice +
    buyMetallurgy * market.metallurgyBookPrice +
    buyArtisanTailoring1 * market.artisanTailoringBook1Price +
    buyArtisanTailoring2 * market.artisanTailoringBook2Price +
    buyArtisanTailoring3 * market.artisanTailoringBook3Price +
    buyArtisanTailoring4 * market.artisanTailoringBook4Price +
    buyArtisanMetallurgy1 * market.artisanMetallurgyBook1Price +
    buyArtisanMetallurgy2 * market.artisanMetallurgyBook2Price +
    buyArtisanMetallurgy3 * market.artisanMetallurgyBook3Price +
    buyArtisanMetallurgy4 * market.artisanMetallurgyBook4Price +
    buyUpheavalTailoring15 * market.upheavalTailoringBook15Price +
    buyUpheavalMetallurgy15 * market.upheavalMetallurgyBook15Price +
    buyUpheavalTailoring19 * market.upheavalTailoringBook19Price +
    buyUpheavalMetallurgy19 * market.upheavalMetallurgyBook19Price +
    buyEnhancedTailoring19 * market.enhancedTailoringBookPrice +
    buyEnhancedMetallurgy19 * market.enhancedMetallurgyBookPrice
  );
}

function consumeMaterialPair(
  materials: MaterialInventory,
  boundKey: keyof MaterialInventory,
  tradableKey: keyof MaterialInventory,
  required: number
) {
  let remaining = Math.max(0, required || 0);
  const boundUsed = Math.min(Number(materials[boundKey] || 0), remaining);
  materials[boundKey] = Math.max(0, Number(materials[boundKey] || 0) - boundUsed) as never;
  remaining -= boundUsed;
  const tradableUsed = Math.min(Number(materials[tradableKey] || 0), remaining);
  materials[tradableKey] = Math.max(0, Number(materials[tradableKey] || 0) - tradableUsed) as never;
}

function consumeSingleMaterial(materials: MaterialInventory, key: keyof MaterialInventory, required: number) {
  materials[key] = Math.max(0, Number(materials[key] || 0) - Math.max(0, required || 0)) as never;
}

function consumeMaterials(materials: MaterialInventory, patch: MaterialNeedPatch) {
  consumeMaterialPair(materials, "boundShards", "tradableShards", patch.shards || 0);
  consumeMaterialPair(materials, "boundLeapstones", "tradableLeapstones", patch.leapstones || 0);
  consumeMaterialPair(materials, "boundProtectionStones", "tradableProtectionStones", patch.protectionStones || 0);
  consumeMaterialPair(materials, "boundDestructionStones", "tradableDestructionStones", patch.destructionStones || 0);
  consumeMaterialPair(materials, "boundFusion", "tradableFusion", patch.fusion || 0);
  consumeMaterialPair(materials, "boundSuccessorLeapstones", "tradableSuccessorLeapstones", patch.successorLeapstones || 0);
  consumeMaterialPair(materials, "boundSuccessorProtectionStones", "tradableSuccessorProtectionStones", patch.successorProtectionStones || 0);
  consumeMaterialPair(materials, "boundSuccessorDestructionStones", "tradableSuccessorDestructionStones", patch.successorDestructionStones || 0);
  consumeMaterialPair(materials, "boundSuperiorFusion", "tradableSuperiorFusion", patch.superiorFusion || 0);
  consumeMaterialPair(materials, "boundIceBreaths", "tradableIceBreaths", patch.iceBreaths || 0);
  consumeMaterialPair(materials, "boundLavaBreaths", "tradableLavaBreaths", patch.lavaBreaths || 0);
  consumeSingleMaterial(materials, "tailoringBooks", patch.tailoringBooks || 0);
  consumeSingleMaterial(materials, "metallurgyBooks", patch.metallurgyBooks || 0);
  consumeSingleMaterial(materials, "artisanTailoringBook1", patch.artisanTailoringBook1 || 0);
  consumeSingleMaterial(materials, "artisanTailoringBook2", patch.artisanTailoringBook2 || 0);
  consumeSingleMaterial(materials, "artisanTailoringBook3", patch.artisanTailoringBook3 || 0);
  consumeSingleMaterial(materials, "artisanTailoringBook4", patch.artisanTailoringBook4 || 0);
  consumeSingleMaterial(materials, "artisanMetallurgyBook1", patch.artisanMetallurgyBook1 || 0);
  consumeSingleMaterial(materials, "artisanMetallurgyBook2", patch.artisanMetallurgyBook2 || 0);
  consumeSingleMaterial(materials, "artisanMetallurgyBook3", patch.artisanMetallurgyBook3 || 0);
  consumeSingleMaterial(materials, "artisanMetallurgyBook4", patch.artisanMetallurgyBook4 || 0);
  consumeSingleMaterial(materials, "upheavalTailoringBook15", patch.upheavalTailoringBook15 || 0);
  consumeSingleMaterial(materials, "upheavalMetallurgyBook15", patch.upheavalMetallurgyBook15 || 0);
  consumeSingleMaterial(materials, "upheavalTailoringBook19", patch.upheavalTailoringBook19 || 0);
  consumeSingleMaterial(materials, "upheavalMetallurgyBook19", patch.upheavalMetallurgyBook19 || 0);
  consumeSingleMaterial(materials, "enhancedUpheavalTailoringBook19", patch.enhancedUpheavalTailoringBook19 || 0);
  consumeSingleMaterial(materials, "enhancedUpheavalMetallurgyBook19", patch.enhancedUpheavalMetallurgyBook19 || 0);
}

function createCandidate(
  piece: EquipmentPieceState,
  action: "normal" | "advanced",
  market: MarketPriceSnapshot,
  materials?: MaterialInventory
): RefiningActionCandidate | null {
  const family = materialFamilyForPiece(piece);
  const actionAllowed =
    action === "normal"
      ? piece.honingLevel < 25
      : family === "legacy"
        ? piece.advancedRefiningLevel < 40
        : piece.advancedRefiningLevel < 60;
  if (!actionAllowed) return null;

  if (action === "normal") {
    const table = getIcepengNormalRefineTable(piece, family);
    if (table) {
      const priceTable = buildNormalPriceTable(table, piece, family, market, materials);
      const optimized = optimizeNormalRefine(table, priceTable, {}, Math.max(0, piece.currentRefiningExp || 0) / 100, Math.max(0, piece.artisanEnergy || 0) / 100);
      if (Number.isFinite(optimized.price)) {
        const { patch: expectedMaterials, directGold } = mapNormalExpectedMaterials(table, piece, family, optimized.path);
        const levelGain = 5 / 6;
        const usedNames = normalBreathNames(table, optimized.path, piece);
        const notes = [
          "아이스펭 일반 재련 최적화 로직 적용",
          family === "successor" ? "전율 계승 재료 사용" : "업화 계승 전 재료 사용",
          usedNames.length ? `추가 재료 추천: ${usedNames.join(", ")}` : "추가 재료 없음",
        ];

        return {
          piece,
          action,
          fromLevel: piece.honingLevel,
          toLevel: piece.honingLevel + 1,
          materialFamily: family,
          levelGain,
          directGold,
          expectedMaterials,
          averageCost: directGold + (materials ? materialPatchPurchaseCost(expectedMaterials, materials, market) : materialPatchCost(expectedMaterials, market)),
          efficiency: (directGold + (materials ? materialPatchPurchaseCost(expectedMaterials, materials, market) : materialPatchCost(expectedMaterials, market))) / levelGain,
          supportName: usedNames.join(", "),
          supportWorthUsing: usedNames.length ? true : null,
          supportSavedGold: 0,
          notes,
        };
      }
    }
  }

  if (action === "advanced" && family === "legacy") {
    const target = advancedTargetForLevel(piece.advancedRefiningLevel);
    const table = getAdvancedRefineTable(isWeapon(piece) ? "weapon" : "armor", target);
    if (!table) return null;

    const priceTable = buildAdvancedPriceTable(table, piece, market, materials);
    const fallbackTap = advancedTapCost(piece, family);
    const stepRatio = 1 / 10;
    const scoredReports = getReport(table, priceTable)
      .filter((report) => Number.isFinite(report.expectedPrice))
      .map((report) => {
        const mappedMaterials = mapAdvancedExpectedMaterials(report.expectedMaterials, piece);
        const fullExpectedMaterials = hasMaterialNeeds(mappedMaterials) ? mappedMaterials : fallbackTap.materials;
        const expectedMaterials = scaleMaterialNeeds(fullExpectedMaterials, stepRatio);
        const fullMaterialCost = materialPatchCost(fullExpectedMaterials, market);
        const averageCost = report.expectedPrice * stepRatio;
        const directGold = Math.max(0, (report.expectedPrice - fullMaterialCost) * stepRatio);
        const purchaseCost = materials ? materialPatchPurchaseCost(expectedMaterials, materials, market) : materialPatchCost(expectedMaterials, market);
        return { report, expectedMaterials, averageCost, directGold, score: directGold + purchaseCost };
      })
      .sort((a, b) => a.score - b.score);
    const best = scoredReports[0];

    if (best) {
      const bestReport = best.report;
      const expectedMaterials = best.expectedMaterials;
      const averageCost = best.score;
      const directGold = best.directGold;
      const levelGain = 1 / 6;
      const notes = [
        "아이스펭 상급재련 최적화 로직 적용",
        bestReport.normalBreathNames.length ? `일반턴 ${bestReport.normalBreathNames.join(", ")}` : "일반턴 노숨",
        bestReport.bonusBreathNames.length ? `선조턴 ${bestReport.bonusBreathNames.join(", ")}` : "선조턴 노숨",
        bestReport.hasEnhancedBonus
          ? bestReport.enhancedBonusBreathNames.length
            ? `강화선조턴 ${bestReport.enhancedBonusBreathNames.join(", ")}`
            : "강화선조턴 노숨"
          : "",
      ].filter(Boolean);

      return {
        piece,
        action,
        fromLevel: piece.advancedRefiningLevel,
        toLevel: piece.advancedRefiningLevel + 1,
        materialFamily: family,
        levelGain,
        directGold,
        expectedMaterials,
        averageCost,
        efficiency: averageCost / levelGain,
        supportName: "",
        supportWorthUsing: null,
        supportSavedGold: 0,
        notes,
      };
    }
  }

  const tap = action === "normal" ? normalTapCost(piece, family) : advancedTapCost(piece, family);
  const baseRate = Number(
    "baseRate" in tap ? tap.baseRate : action === "normal" ? getNormalSuccessRate(piece.honingLevel) : getAdvancedSuccessRate(piece.advancedRefiningLevel)
  );
  const attemptsWithoutSupport = expectedAttempts(baseRate, piece.artisanEnergy, piece.currentRefiningExp);
  const materialsWithoutSupport: MaterialNeedPatch = {};
  addNeeds(materialsWithoutSupport as MaterialNeedBreakdown, tap.materials, attemptsWithoutSupport);
  const directGoldWithoutSupport = tap.directGold * attemptsWithoutSupport;
  const averageCostWithoutSupport = directGoldWithoutSupport + materialPatchCost(materialsWithoutSupport, market);

  let expectedMaterials = materialsWithoutSupport;
  let directGold = directGoldWithoutSupport;
  let averageCost = averageCostWithoutSupport;
  let supportName = "";
  let supportWorthUsing: boolean | null = null;
  let supportSavedGold = 0;

  if (action === "normal") {
    const support = supportBookFor(piece, action, family);
    const supportPrice = support ? Number(market[support.marketKey] || 0) : 0;
    if (support && supportPrice > 0) {
      const supportAttempts = expectedAttempts(baseRate, piece.artisanEnergy, piece.currentRefiningExp, support.bonusRate);
      const supportMaterials: MaterialNeedPatch = {};
      addNeeds(supportMaterials as MaterialNeedBreakdown, tap.materials, supportAttempts);
      supportMaterials[support.materialKey] = (supportMaterials[support.materialKey] || 0) + supportAttempts;
      const supportDirectGold = tap.directGold * supportAttempts;
      const supportAverageCost = supportDirectGold + materialPatchCost(supportMaterials, market);
      supportName = support.name;
      supportSavedGold = Math.max(0, averageCostWithoutSupport - supportAverageCost);
      supportWorthUsing = supportAverageCost < averageCostWithoutSupport;

      if (supportWorthUsing) {
        expectedMaterials = supportMaterials;
        directGold = supportDirectGold;
        averageCost = supportAverageCost;
      }
    } else if (support) {
      supportName = support.name;
      supportWorthUsing = null;
    }
  }
  const levelGain = action === "normal" ? 5 / 6 : 1 / 6;
  const notes = [
    family === "successor" ? "전율 계열 재료 사용" : "업화/계승 전 계열 재료 사용",
    action === "advanced" ? "상급 재련 후보" : "일반 재련 후보",
    supportName
      ? supportWorthUsing == null
        ? `${supportName} 시세 필요`
        : supportWorthUsing
          ? `${supportName} 사용 추천`
          : `${supportName} 미사용 추천`
      : "",
  ].filter(Boolean);

  return {
    piece,
    action,
    fromLevel: action === "normal" ? piece.honingLevel : piece.advancedRefiningLevel,
    toLevel: action === "normal" ? piece.honingLevel + 1 : piece.advancedRefiningLevel + 1,
    materialFamily: family,
    levelGain,
    directGold,
    expectedMaterials,
    averageCost: directGold + (materials ? materialPatchPurchaseCost(expectedMaterials, materials, market) : materialPatchCost(expectedMaterials, market)),
    efficiency: (directGold + (materials ? materialPatchPurchaseCost(expectedMaterials, materials, market) : materialPatchCost(expectedMaterials, market))) / levelGain,
    supportName,
    supportWorthUsing,
    supportSavedGold,
    notes,
  };
}

function clonePiece(piece: EquipmentPieceState): EquipmentPieceState {
  return { ...piece, itemLevel: deriveEquipmentItemLevel(piece) };
}

function applyCandidate(piece: EquipmentPieceState, candidate: RefiningActionCandidate) {
  piece.itemLevel = deriveEquipmentItemLevel(piece);
  if (candidate.action === "normal") {
    piece.honingLevel += 1;
    piece.itemLevel = Math.max(0, Number(piece.itemLevel || 0)) + 5;
  } else {
    piece.advancedRefiningLevel += 1;
    piece.itemLevel = Math.max(0, Number(piece.itemLevel || 0)) + 1;
  }
  piece.artisanEnergy = 0;
  piece.currentRefiningExp = 0;
}

function averagePieceItemLevel(pieces: EquipmentPieceState[]) {
  const levels = pieces.map(deriveEquipmentItemLevel).filter((value) => Number.isFinite(value) && value > 0);
  return levels.length === 6 ? levels.reduce((sum, value) => sum + value, 0) / 6 : null;
}

function sumPieceItemLevel(pieces: EquipmentPieceState[]) {
  const levels = pieces.map(deriveEquipmentItemLevel).filter((value) => Number.isFinite(value) && value > 0);
  return levels.length === 6 ? levels.reduce((sum, value) => sum + value, 0) : null;
}

function candidateItemLevelGain(candidate: RefiningActionCandidate) {
  return candidate.action === "normal" ? 5 : 1;
}

function advancedGroupEnd(fromLevel: number) {
  const remainder = fromLevel % 5;
  return fromLevel + (remainder === 0 ? 5 : 5 - remainder);
}

function routeStepFromCandidate(candidate: RefiningActionCandidate, confirmed = false): RefiningRouteStep {
  return {
    slot: candidate.piece.slot,
    slotLabel: SLOT_LABELS[candidate.piece.slot],
    itemName: itemName(candidate.piece),
    action: candidate.action,
    fromLevel: candidate.fromLevel,
    toLevel: candidate.toLevel,
    materialFamily: candidate.materialFamily,
    averageCost: round(candidate.averageCost),
    directGold: round(candidate.directGold),
    expectedMaterials: candidate.expectedMaterials,
    levelGain: candidate.levelGain,
    efficiency: round(candidate.efficiency),
    supportName: candidate.supportName,
    supportWorthUsing: candidate.supportWorthUsing,
    supportSavedGold: round(candidate.supportSavedGold),
    notes: confirmed ? ["확정 스펙업", ...candidate.notes] : candidate.notes,
    confirmed,
  };
}

function planCheapestRoute(input: GrowthPlannerState) {
  const pieces = input.character.pieces.map(clonePiece);
  const remainingMaterials: MaterialInventory = { ...input.materials };
  const currentPieceSum = sumPieceItemLevel(pieces);
  const targetLevel = Number(input.character.targetItemLevel || 0);
  const currentLevel = currentPieceSum != null ? currentPieceSum / 6 : Number(input.character.currentItemLevel || 0);
  const targetGapItemLevel = currentPieceSum != null ? Math.max(0, targetLevel * 6 - currentPieceSum) : Math.max(0, (targetLevel - currentLevel) * 6);
  const steps: RefiningRouteStep[] = [];
  const requiredMaterials = emptyNeeds();
  let gainedLevel = 0;
  let gainedItemLevel = 0;
  let directGoldCost = 0;
  let materialPurchaseCost = 0;
  const maxSteps = 160;
  const targetEpsilon = 0.000001;

  for (const upgrade of input.character.confirmedUpgrades ?? []) {
    const targetPiece = pieces.find((piece) => piece.slot === upgrade.slot);
    if (!targetPiece) continue;

    const getCurrentLevel = () => (upgrade.action === "normal" ? targetPiece.honingLevel : targetPiece.advancedRefiningLevel);
    let guard = 0;

    while (getCurrentLevel() < upgrade.targetLevel && guard < maxSteps) {
      guard += 1;
      const candidate = createCandidate(targetPiece, upgrade.action, input.market, remainingMaterials);
      if (!candidate) break;

      addNeeds(requiredMaterials, candidate.expectedMaterials);
      directGoldCost += candidate.directGold;
      materialPurchaseCost += materialPatchPurchaseCost(candidate.expectedMaterials, remainingMaterials, input.market);
      gainedLevel += candidate.levelGain;
      gainedItemLevel += candidateItemLevelGain(candidate);
      steps.push(routeStepFromCandidate(candidate, true));
      consumeMaterials(remainingMaterials, candidate.expectedMaterials);
      applyCandidate(targetPiece, candidate);
    }
  }

  for (let i = 0; i < maxSteps && gainedItemLevel + targetEpsilon < targetGapItemLevel; i += 1) {
    const candidates = pieces
      .flatMap((piece) => {
        const normal = input.character.preferredMode !== "advanced" ? createCandidate(piece, "normal", input.market, remainingMaterials) : null;
        const advanced = input.character.preferredMode !== "normal" ? createCandidate(piece, "advanced", input.market, remainingMaterials) : null;
        return [normal, advanced].filter(Boolean) as RefiningActionCandidate[];
      })
      .map((candidate) => {
        const itemLevelGain = candidateItemLevelGain(candidate);
        const remaining = Math.max(0, targetGapItemLevel - gainedItemLevel);
        const overshoot = Math.max(0, itemLevelGain - remaining);
        const overshootPenalty = overshoot > 0 ? candidate.averageCost * (overshoot / itemLevelGain) * 0.35 : 0;
        return {
          candidate,
          score: candidate.efficiency + overshootPenalty,
        };
      })
      .sort((a, b) => a.score - b.score)
      .map((row) => row.candidate);

    const best = candidates[0];
    if (!best) break;

    const targetPiece = pieces.find((piece) => piece.slot === best.piece.slot);
    if (!targetPiece) break;

    let forcedAdvancedEnd: number | null = null;

    while (true) {
      const candidate =
        forcedAdvancedEnd == null
          ? best
          : targetPiece.advancedRefiningLevel < forcedAdvancedEnd
            ? createCandidate(targetPiece, "advanced", input.market, remainingMaterials)
            : null;
      if (!candidate) break;

      addNeeds(requiredMaterials, candidate.expectedMaterials);
      directGoldCost += candidate.directGold;
      materialPurchaseCost += materialPatchPurchaseCost(candidate.expectedMaterials, remainingMaterials, input.market);
      gainedLevel += candidate.levelGain;
      gainedItemLevel += candidateItemLevelGain(candidate);
      steps.push(routeStepFromCandidate(candidate));
      consumeMaterials(remainingMaterials, candidate.expectedMaterials);
      applyCandidate(targetPiece, candidate);

      if (forcedAdvancedEnd == null) {
        if (candidate.action !== "advanced") break;
        forcedAdvancedEnd = advancedGroupEnd(candidate.fromLevel);
      }
      if (forcedAdvancedEnd == null || targetPiece.advancedRefiningLevel >= forcedAdvancedEnd) break;
      i += 1;
      if (i >= maxSteps) break;
    }
  }

  return {
    steps,
    requiredMaterials,
    directGoldCost,
    materialPurchaseCost,
    gainedLevel,
  };
}

function calculateBoundOffset(needs: MaterialNeedBreakdown, input: GrowthPlannerState) {
  const shardPrice = resolveShardPricePer1000(input.market);
  return (
    (Math.min(needs.shards, input.materials.boundShards) / 1000) * shardPrice +
    Math.min(needs.leapstones, input.materials.boundLeapstones) * input.market.leapstonePrice +
    (Math.min(needs.protectionStones, input.materials.boundProtectionStones) / 10) * input.market.protectionStonePricePer10 +
    (Math.min(needs.destructionStones, input.materials.boundDestructionStones) / 10) * input.market.destructionStonePricePer10 +
    Math.min(needs.fusion, input.materials.boundFusion) * input.market.fusionPrice +
    Math.min(needs.successorLeapstones, input.materials.boundSuccessorLeapstones) * input.market.successorLeapstonePrice +
    (Math.min(needs.successorProtectionStones, input.materials.boundSuccessorProtectionStones) / 10) * input.market.successorProtectionStonePricePer10 +
    (Math.min(needs.successorDestructionStones, input.materials.boundSuccessorDestructionStones) / 10) * input.market.successorDestructionStonePricePer10 +
    Math.min(needs.superiorFusion, input.materials.boundSuperiorFusion) * input.market.superiorFusionPrice +
    Math.min(needs.iceBreaths, input.materials.boundIceBreaths) * input.market.iceBreathPrice +
    Math.min(needs.lavaBreaths, input.materials.boundLavaBreaths) * input.market.lavaBreathPrice +
    Math.min(needs.tailoringBooks, input.materials.tailoringBooks) * input.market.tailoringBookPrice +
    Math.min(needs.metallurgyBooks, input.materials.metallurgyBooks) * input.market.metallurgyBookPrice +
    Math.min(needs.artisanTailoringBook1, input.materials.artisanTailoringBook1) * input.market.artisanTailoringBook1Price +
    Math.min(needs.artisanTailoringBook2, input.materials.artisanTailoringBook2) * input.market.artisanTailoringBook2Price +
    Math.min(needs.artisanTailoringBook3, input.materials.artisanTailoringBook3) * input.market.artisanTailoringBook3Price +
    Math.min(needs.artisanTailoringBook4, input.materials.artisanTailoringBook4) * input.market.artisanTailoringBook4Price +
    Math.min(needs.artisanMetallurgyBook1, input.materials.artisanMetallurgyBook1) * input.market.artisanMetallurgyBook1Price +
    Math.min(needs.artisanMetallurgyBook2, input.materials.artisanMetallurgyBook2) * input.market.artisanMetallurgyBook2Price +
    Math.min(needs.artisanMetallurgyBook3, input.materials.artisanMetallurgyBook3) * input.market.artisanMetallurgyBook3Price +
    Math.min(needs.artisanMetallurgyBook4, input.materials.artisanMetallurgyBook4) * input.market.artisanMetallurgyBook4Price +
    Math.min(needs.upheavalTailoringBook15, input.materials.upheavalTailoringBook15) * input.market.upheavalTailoringBook15Price +
    Math.min(needs.upheavalMetallurgyBook15, input.materials.upheavalMetallurgyBook15) * input.market.upheavalMetallurgyBook15Price +
    Math.min(needs.upheavalTailoringBook19, input.materials.upheavalTailoringBook19) * input.market.upheavalTailoringBook19Price +
    Math.min(needs.upheavalMetallurgyBook19, input.materials.upheavalMetallurgyBook19) * input.market.upheavalMetallurgyBook19Price +
    Math.min(needs.enhancedUpheavalTailoringBook19, input.materials.enhancedUpheavalTailoringBook19) * input.market.enhancedTailoringBookPrice +
    Math.min(needs.enhancedUpheavalMetallurgyBook19, input.materials.enhancedUpheavalMetallurgyBook19) * input.market.enhancedMetallurgyBookPrice
  );
}

function calculateMaterialPurchase(needs: MaterialNeedBreakdown, input: GrowthPlannerState) {
  const shardPrice = resolveShardPricePer1000(input.market);
  const buyShards = Math.max(0, needs.shards - input.materials.boundShards - input.materials.tradableShards);
  const buyLeapstones = Math.max(0, needs.leapstones - input.materials.boundLeapstones - input.materials.tradableLeapstones);
  const buyProtection = Math.max(0, needs.protectionStones - input.materials.boundProtectionStones - input.materials.tradableProtectionStones);
  const buyDestruction = Math.max(0, needs.destructionStones - input.materials.boundDestructionStones - input.materials.tradableDestructionStones);
  const buyFusion = Math.max(0, needs.fusion - input.materials.boundFusion - input.materials.tradableFusion);
  const buySuccessorLeapstones = Math.max(0, needs.successorLeapstones - input.materials.boundSuccessorLeapstones - input.materials.tradableSuccessorLeapstones);
  const buySuccessorProtection = Math.max(
    0,
    needs.successorProtectionStones - input.materials.boundSuccessorProtectionStones - input.materials.tradableSuccessorProtectionStones
  );
  const buySuccessorDestruction = Math.max(
    0,
    needs.successorDestructionStones - input.materials.boundSuccessorDestructionStones - input.materials.tradableSuccessorDestructionStones
  );
  const buySuperiorFusion = Math.max(0, needs.superiorFusion - input.materials.boundSuperiorFusion - input.materials.tradableSuperiorFusion);
  const buyIceBreaths = Math.max(0, needs.iceBreaths - input.materials.boundIceBreaths - input.materials.tradableIceBreaths);
  const buyLavaBreaths = Math.max(0, needs.lavaBreaths - input.materials.boundLavaBreaths - input.materials.tradableLavaBreaths);
  const buyTailoring = Math.max(0, needs.tailoringBooks - input.materials.tailoringBooks);
  const buyMetallurgy = Math.max(0, needs.metallurgyBooks - input.materials.metallurgyBooks);
  const buyArtisanTailoring1 = Math.max(0, needs.artisanTailoringBook1 - input.materials.artisanTailoringBook1);
  const buyArtisanTailoring2 = Math.max(0, needs.artisanTailoringBook2 - input.materials.artisanTailoringBook2);
  const buyArtisanTailoring3 = Math.max(0, needs.artisanTailoringBook3 - input.materials.artisanTailoringBook3);
  const buyArtisanTailoring4 = Math.max(0, needs.artisanTailoringBook4 - input.materials.artisanTailoringBook4);
  const buyArtisanMetallurgy1 = Math.max(0, needs.artisanMetallurgyBook1 - input.materials.artisanMetallurgyBook1);
  const buyArtisanMetallurgy2 = Math.max(0, needs.artisanMetallurgyBook2 - input.materials.artisanMetallurgyBook2);
  const buyArtisanMetallurgy3 = Math.max(0, needs.artisanMetallurgyBook3 - input.materials.artisanMetallurgyBook3);
  const buyArtisanMetallurgy4 = Math.max(0, needs.artisanMetallurgyBook4 - input.materials.artisanMetallurgyBook4);
  const buyUpheavalTailoring15 = Math.max(0, needs.upheavalTailoringBook15 - input.materials.upheavalTailoringBook15);
  const buyUpheavalMetallurgy15 = Math.max(0, needs.upheavalMetallurgyBook15 - input.materials.upheavalMetallurgyBook15);
  const buyUpheavalTailoring19 = Math.max(0, needs.upheavalTailoringBook19 - input.materials.upheavalTailoringBook19);
  const buyUpheavalMetallurgy19 = Math.max(0, needs.upheavalMetallurgyBook19 - input.materials.upheavalMetallurgyBook19);
  const buyEnhancedTailoring19 = Math.max(0, needs.enhancedUpheavalTailoringBook19 - input.materials.enhancedUpheavalTailoringBook19);
  const buyEnhancedMetallurgy19 = Math.max(0, needs.enhancedUpheavalMetallurgyBook19 - input.materials.enhancedUpheavalMetallurgyBook19);

  return (
    (buyShards / 1000) * shardPrice +
    buyLeapstones * input.market.leapstonePrice +
    (buyProtection / 10) * input.market.protectionStonePricePer10 +
    (buyDestruction / 10) * input.market.destructionStonePricePer10 +
    buyFusion * input.market.fusionPrice +
    buySuccessorLeapstones * input.market.successorLeapstonePrice +
    (buySuccessorProtection / 10) * input.market.successorProtectionStonePricePer10 +
    (buySuccessorDestruction / 10) * input.market.successorDestructionStonePricePer10 +
    buySuperiorFusion * input.market.superiorFusionPrice +
    buyIceBreaths * input.market.iceBreathPrice +
    buyLavaBreaths * input.market.lavaBreathPrice +
    buyTailoring * input.market.tailoringBookPrice +
    buyMetallurgy * input.market.metallurgyBookPrice +
    buyArtisanTailoring1 * input.market.artisanTailoringBook1Price +
    buyArtisanTailoring2 * input.market.artisanTailoringBook2Price +
    buyArtisanTailoring3 * input.market.artisanTailoringBook3Price +
    buyArtisanTailoring4 * input.market.artisanTailoringBook4Price +
    buyArtisanMetallurgy1 * input.market.artisanMetallurgyBook1Price +
    buyArtisanMetallurgy2 * input.market.artisanMetallurgyBook2Price +
    buyArtisanMetallurgy3 * input.market.artisanMetallurgyBook3Price +
    buyArtisanMetallurgy4 * input.market.artisanMetallurgyBook4Price +
    buyUpheavalTailoring15 * input.market.upheavalTailoringBook15Price +
    buyUpheavalMetallurgy15 * input.market.upheavalMetallurgyBook15Price +
    buyUpheavalTailoring19 * input.market.upheavalTailoringBook19Price +
    buyUpheavalMetallurgy19 * input.market.upheavalMetallurgyBook19Price +
    buyEnhancedTailoring19 * input.market.enhancedTailoringBookPrice +
    buyEnhancedMetallurgy19 * input.market.enhancedMetallurgyBookPrice
  );
}

function pieceGenerationSummary(input: GrowthPlannerState) {
  const legacy = input.character.pieces.filter((piece) => materialFamilyForPiece(piece) === "legacy").length;
  const successor = input.character.pieces.length - legacy;
  return `재료 계열: 업화/계승 전 ${legacy}부위, 전율 ${successor}부위`;
}

export function makeEmptyPlannerState(): GrowthPlannerState {
  return {
    character: {
      tableId: "",
      tableName: "",
      charId: "",
      characterName: "",
      currentItemLevel: 0,
      targetItemLevel: 1720,
      currentWeeklyGold: 0,
      currentWeeklyBoundGold: 0,
      targetWeeklyGold: 0,
      preferredMode: "hybrid",
      confirmedUpgrades: [],
      pieces: PIECE_SLOTS.map((slot) => ({
        slot,
        itemLevel: 0,
        honingLevel: 0,
        advancedRefiningLevel: 0,
        tierLabel: "장비 정보",
        artisanEnergy: 0,
        currentRefiningExp: 0,
        supportBonusPercent: 0,
      })),
    },
    materials: {
      boundShards: 0,
      tradableShards: 0,
      boundLeapstones: 0,
      tradableLeapstones: 0,
      boundProtectionStones: 0,
      tradableProtectionStones: 0,
      boundDestructionStones: 0,
      tradableDestructionStones: 0,
      boundFusion: 0,
      tradableFusion: 0,
      boundSuccessorLeapstones: 0,
      tradableSuccessorLeapstones: 0,
      boundSuccessorProtectionStones: 0,
      tradableSuccessorProtectionStones: 0,
      boundSuccessorDestructionStones: 0,
      tradableSuccessorDestructionStones: 0,
      boundSuperiorFusion: 0,
      tradableSuperiorFusion: 0,
      boundIceBreaths: 0,
      tradableIceBreaths: 0,
      boundLavaBreaths: 0,
      tradableLavaBreaths: 0,
      tailoringBooks: 0,
      metallurgyBooks: 0,
      artisanTailoringBook1: 0,
      artisanTailoringBook2: 0,
      artisanTailoringBook3: 0,
      artisanTailoringBook4: 0,
      artisanMetallurgyBook1: 0,
      artisanMetallurgyBook2: 0,
      artisanMetallurgyBook3: 0,
      artisanMetallurgyBook4: 0,
      upheavalTailoringBook15: 0,
      upheavalMetallurgyBook15: 0,
      upheavalTailoringBook19: 0,
      upheavalMetallurgyBook19: 0,
      enhancedUpheavalTailoringBook19: 0,
      enhancedUpheavalMetallurgyBook19: 0,
      graceFragments: 0,
      gold: 0,
      boundGold: 0,
      silver: 0,
    },
    market: {
      shardPricePer1000: 0,
      shardSmallPouchPrice: 0,
      shardMediumPouchPrice: 0,
      shardLargePouchPrice: 0,
      leapstonePrice: 0,
      protectionStonePricePer10: 0,
      destructionStonePricePer10: 0,
      fusionPrice: 0,
      successorLeapstonePrice: 0,
      successorProtectionStonePricePer10: 0,
      successorDestructionStonePricePer10: 0,
      superiorFusionPrice: 0,
      iceBreathPrice: 0,
      lavaBreathPrice: 0,
      tailoringBookPrice: 0,
      metallurgyBookPrice: 0,
      enhancedTailoringBookPrice: 0,
      enhancedMetallurgyBookPrice: 0,
      artisanTailoringBook1Price: 0,
      artisanTailoringBook2Price: 0,
      artisanTailoringBook3Price: 0,
      artisanTailoringBook4Price: 0,
      artisanMetallurgyBook1Price: 0,
      artisanMetallurgyBook2Price: 0,
      artisanMetallurgyBook3Price: 0,
      artisanMetallurgyBook4Price: 0,
      upheavalTailoringBook15Price: 0,
      upheavalMetallurgyBook15Price: 0,
      upheavalTailoringBook19Price: 0,
      upheavalMetallurgyBook19Price: 0,
    },
    ocr: {
      status: "idle",
      screenshotName: "",
      screenshotDataUrl: "",
      extractedAt: null,
      recognizedFields: [],
      notes: "",
      screenTemplateKey: OCR_SCREEN_TEMPLATES[0]?.key ?? "ingame_combined",
      selectedFieldId: OCR_SCREEN_TEMPLATES[0]?.fields[0]?.id ?? "",
      fields: OCR_SCREEN_TEMPLATES[0]?.fields.map((field) => ({ ...field })) ?? [],
    },
  };
}

export function slotLabel(slot: EquipmentSlot) {
  return SLOT_LABELS[slot];
}

export function estimateGrowthPlan(input: GrowthPlannerState): GrowthEstimate {
  const currentLevel = Number(input.character.currentItemLevel || 0);
  const targetLevel = Number(input.character.targetItemLevel || 0);
  const levelGap = Math.max(0, targetLevel - currentLevel);
  const route = planCheapestRoute(input);
  const requiredMaterials = route.requiredMaterials;
  const directGoldCost = route.directGoldCost;
  const materialPurchaseCost = calculateMaterialPurchase(requiredMaterials, input);
  const boundMaterialOffset = calculateBoundOffset(requiredMaterials, input);
  const totalSpendGold = Math.max(0, directGoldCost + materialPurchaseCost);
  const additionalWeeklyGold = Math.max(0, input.character.targetWeeklyGold - input.character.currentWeeklyGold);
  const paybackWeeks = additionalWeeklyGold > 0 ? round(totalSpendGold / additionalWeeklyGold) : null;
  const currentBoundGold = Math.max(0, input.materials.boundGold || 0);
  const weeklyBoundGold = Math.max(0, input.character.currentWeeklyBoundGold || 0);
  const boundGoldUsableNow = Math.min(directGoldCost, currentBoundGold);
  const tradableGoldNeededNow = Math.max(0, materialPurchaseCost + Math.max(0, directGoldCost - currentBoundGold));
  const boundGoldAffordableWeeks =
    directGoldCost <= currentBoundGold ? 0 : weeklyBoundGold > 0 ? Math.ceil((directGoldCost - currentBoundGold) / weeklyBoundGold) : null;

  let recommendedWaitWeeks = 0;
  let recommendedBoundGoldUse = boundGoldUsableNow;
  let recommendedTradableGoldUse = tradableGoldNeededNow;

  for (let weeks = 0; weeks <= 12; weeks += 1) {
    const accumulatedBoundGold = currentBoundGold + weeklyBoundGold * weeks;
    const boundGoldUse = Math.min(directGoldCost, accumulatedBoundGold);
    const tradableGoldUse = Math.max(0, materialPurchaseCost + Math.max(0, directGoldCost - accumulatedBoundGold));
    if (tradableGoldUse < recommendedTradableGoldUse) {
      recommendedWaitWeeks = weeks;
      recommendedBoundGoldUse = boundGoldUse;
      recommendedTradableGoldUse = tradableGoldUse;
    }
    if (tradableGoldUse <= materialPurchaseCost) break;
  }

  const shardPrice = resolveShardPricePer1000(input.market);
  const tailoringBreakEvenPrice = round((shardPrice * 0.025 + input.market.protectionStonePricePer10 * 2 + input.market.fusionPrice * 0.6) || 0);
  const metallurgyBreakEvenPrice = round((shardPrice * 0.025 + input.market.destructionStonePricePer10 * 2.4 + input.market.fusionPrice * 0.7) || 0);
  const tailoringWorthUsing = input.market.iceBreathPrice > 0 ? input.market.iceBreathPrice <= tailoringBreakEvenPrice : null;
  const metallurgyWorthUsing = input.market.lavaBreathPrice > 0 ? input.market.lavaBreathPrice <= metallurgyBreakEvenPrice : null;

  const routeLabel =
    input.character.preferredMode === "normal" ? "일반 재련 우선" : input.character.preferredMode === "advanced" ? "상급 재련 우선" : "최소 비용 혼합";

  const firstSteps = route.steps.slice(0, 5).map((step) => {
    const actionLabel = step.action === "normal" ? "강화" : "상급재련";
    return `${step.slotLabel} ${actionLabel} ${step.fromLevel} -> ${step.toLevel}`;
  });

  const summary = [
    `${input.character.characterName || "선택 캐릭터"}를 ${currentLevel} -> ${targetLevel}로 올리는 장비별 최소비용 추정이야.`,
    pieceGenerationSummary(input),
    route.steps.length
      ? `추천 시작 순서: ${firstSteps.join(" / ")}${route.steps.length > firstSteps.length ? " ..." : ""}`
      : "목표까지 필요한 강화 후보가 없거나 목표 레벨에 이미 도달했어.",
    `평균 비용 기준 직접 골드는 약 ${Math.round(directGoldCost).toLocaleString()}G, 추가 구매 재료는 약 ${Math.round(materialPurchaseCost).toLocaleString()}G로 잡았어.`,
    `운명의 파편과 숨결은 공통으로 보고, 수호석/파괴석/돌파석/융화재료는 장비 이름 기준으로 업화/전율 계열을 나눠 계산했어.`,
    `지금 바로 올리면 귀속골드 ${Math.round(boundGoldUsableNow).toLocaleString()}G, 유통골드 ${Math.round(tradableGoldNeededNow).toLocaleString()}G 정도가 필요해.`,
    boundGoldAffordableWeeks == null
      ? "현재 주간 귀속골드만으로 직접 골드를 충당하는 시점은 아직 계산할 수 없어."
      : `${boundGoldAffordableWeeks}주 뒤면 캐릭터 귀속골드만으로 직접 골드 ${Math.round(directGoldCost).toLocaleString()}G를 충당할 수 있어.`,
    recommendedWaitWeeks > 0
      ? `${recommendedWaitWeeks}주 뒤에 올리면 귀속골드 ${Math.round(recommendedBoundGoldUse).toLocaleString()}G, 유통골드 ${Math.round(
          recommendedTradableGoldUse
        ).toLocaleString()}G 정도로 달성 가능해.`
      : "지금 올리는 쪽이 대기 대비 가장 빠른 선택이야.",
    tailoringWorthUsing == null
      ? "빙하의 숨결 시세가 없어서 사용 효율 판단은 보류했어."
      : tailoringWorthUsing
        ? `빙하의 숨결은 개당 ${Math.round(tailoringBreakEvenPrice).toLocaleString()}G 이하면 이득권이야. 지금 시세 기준 사용 가치가 있어.`
        : `빙하의 숨결은 개당 ${Math.round(tailoringBreakEvenPrice).toLocaleString()}G 이하일 때 효율이 맞는데, 지금은 비싼 편이야.`,
    metallurgyWorthUsing == null
      ? "용암의 숨결 시세가 없어서 사용 효율 판단은 보류했어."
      : metallurgyWorthUsing
        ? `용암의 숨결은 개당 ${Math.round(metallurgyBreakEvenPrice).toLocaleString()}G 이하면 이득권이야. 지금 시세 기준 사용 가치가 있어.`
        : `용암의 숨결은 개당 ${Math.round(metallurgyBreakEvenPrice).toLocaleString()}G 이하일 때 효율이 맞는데, 지금은 비싼 편이야.`,
    additionalWeeklyGold > 0
      ? `주간 골드 증가분 ${additionalWeeklyGold.toLocaleString()}G 기준 회수는 약 ${paybackWeeks?.toLocaleString()}주로 볼 수 있어.`
      : "목표 달성 후 주간 골드 증가분이 없어서 회수 주차는 아직 계산할 수 없어.",
  ];

  return {
    levelGap,
    routeLabel,
    directGoldCost: round(directGoldCost),
    materialPurchaseCost: round(materialPurchaseCost),
    boundMaterialOffset: round(boundMaterialOffset),
    totalSpendGold: round(totalSpendGold),
    requiredMaterials: {
      shards: Math.round(requiredMaterials.shards),
      leapstones: Math.round(requiredMaterials.leapstones),
      protectionStones: Math.round(requiredMaterials.protectionStones),
      destructionStones: Math.round(requiredMaterials.destructionStones),
      fusion: Math.round(requiredMaterials.fusion),
      successorLeapstones: Math.round(requiredMaterials.successorLeapstones),
      successorProtectionStones: Math.round(requiredMaterials.successorProtectionStones),
      successorDestructionStones: Math.round(requiredMaterials.successorDestructionStones),
      superiorFusion: Math.round(requiredMaterials.superiorFusion),
      iceBreaths: round(requiredMaterials.iceBreaths),
      lavaBreaths: round(requiredMaterials.lavaBreaths),
      tailoringBooks: round(requiredMaterials.tailoringBooks),
      metallurgyBooks: round(requiredMaterials.metallurgyBooks),
      artisanTailoringBook1: round(requiredMaterials.artisanTailoringBook1),
      artisanTailoringBook2: round(requiredMaterials.artisanTailoringBook2),
      artisanTailoringBook3: round(requiredMaterials.artisanTailoringBook3),
      artisanTailoringBook4: round(requiredMaterials.artisanTailoringBook4),
      artisanMetallurgyBook1: round(requiredMaterials.artisanMetallurgyBook1),
      artisanMetallurgyBook2: round(requiredMaterials.artisanMetallurgyBook2),
      artisanMetallurgyBook3: round(requiredMaterials.artisanMetallurgyBook3),
      artisanMetallurgyBook4: round(requiredMaterials.artisanMetallurgyBook4),
      upheavalTailoringBook15: round(requiredMaterials.upheavalTailoringBook15),
      upheavalMetallurgyBook15: round(requiredMaterials.upheavalMetallurgyBook15),
      upheavalTailoringBook19: round(requiredMaterials.upheavalTailoringBook19),
      upheavalMetallurgyBook19: round(requiredMaterials.upheavalMetallurgyBook19),
      enhancedUpheavalTailoringBook19: round(requiredMaterials.enhancedUpheavalTailoringBook19),
      enhancedUpheavalMetallurgyBook19: round(requiredMaterials.enhancedUpheavalMetallurgyBook19),
    },
    routeSteps: route.steps,
    additionalWeeklyGold,
    paybackWeeks,
    boundGoldUsableNow: round(boundGoldUsableNow),
    tradableGoldNeededNow: round(tradableGoldNeededNow),
    boundGoldAffordableWeeks,
    recommendedWaitWeeks,
    recommendedBoundGoldUse: round(recommendedBoundGoldUse),
    recommendedTradableGoldUse: round(recommendedTradableGoldUse),
    tailoringBreakEvenPrice,
    metallurgyBreakEvenPrice,
    tailoringWorthUsing,
    metallurgyWorthUsing,
    summary,
  };
}
