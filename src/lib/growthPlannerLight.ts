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
  expectedMaterials: Partial<MaterialNeedBreakdown>;
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

export function makeEmptyGrowthEstimate(): GrowthEstimate {
  const requiredMaterials: MaterialNeedBreakdown = {
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
  return {
    levelGap: 0,
    routeLabel: "계산 대기",
    directGoldCost: 0,
    materialPurchaseCost: 0,
    boundMaterialOffset: 0,
    totalSpendGold: 0,
    requiredMaterials,
    routeSteps: [],
    additionalWeeklyGold: 0,
    paybackWeeks: null,
    boundGoldUsableNow: 0,
    tradableGoldNeededNow: 0,
    boundGoldAffordableWeeks: null,
    recommendedWaitWeeks: 0,
    recommendedBoundGoldUse: 0,
    recommendedTradableGoldUse: 0,
    tailoringBreakEvenPrice: 0,
    metallurgyBreakEvenPrice: 0,
    tailoringWorthUsing: null,
    metallurgyWorthUsing: null,
    summary: ["성장 계산 엔진을 불러온 뒤 추천 결과가 표시돼."],
  };
}
