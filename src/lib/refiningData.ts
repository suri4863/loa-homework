export type RefiningBand = {
  from: number;
  to: number;
  normalGoldPerLevel: number;
  advancedGoldPerLevel: number;
  shardsPerLevel: number;
  leapstonesPerLevel: number;
  protectionPerLevel: number;
  destructionPerLevel: number;
  fusionPerLevel: number;
  tailoringPerLevel: number;
  metallurgyPerLevel: number;
};

export type OcrFieldBox = {
  id: string;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrScreenTemplate = {
  key: string;
  label: string;
  description: string;
  fields: OcrFieldBox[];
};

export const OCR_COUNT_CAP = 9999;

export const REFINING_LEVEL_BANDS: RefiningBand[] = [
  { from: 1580, to: 1619, normalGoldPerLevel: 3200, advancedGoldPerLevel: 2800, shardsPerLevel: 6500, leapstonesPerLevel: 14, protectionPerLevel: 120, destructionPerLevel: 55, fusionPerLevel: 10, tailoringPerLevel: 0.15, metallurgyPerLevel: 0.1 },
  { from: 1620, to: 1639, normalGoldPerLevel: 4600, advancedGoldPerLevel: 3900, shardsPerLevel: 8200, leapstonesPerLevel: 19, protectionPerLevel: 150, destructionPerLevel: 70, fusionPerLevel: 13, tailoringPerLevel: 0.2, metallurgyPerLevel: 0.12 },
  { from: 1640, to: 1659, normalGoldPerLevel: 6200, advancedGoldPerLevel: 5200, shardsPerLevel: 11000, leapstonesPerLevel: 26, protectionPerLevel: 180, destructionPerLevel: 85, fusionPerLevel: 18, tailoringPerLevel: 0.25, metallurgyPerLevel: 0.15 },
  { from: 1660, to: 1679, normalGoldPerLevel: 8200, advancedGoldPerLevel: 6900, shardsPerLevel: 14500, leapstonesPerLevel: 34, protectionPerLevel: 220, destructionPerLevel: 105, fusionPerLevel: 24, tailoringPerLevel: 0.35, metallurgyPerLevel: 0.18 },
  { from: 1680, to: 1699, normalGoldPerLevel: 10800, advancedGoldPerLevel: 9100, shardsPerLevel: 18500, leapstonesPerLevel: 42, protectionPerLevel: 270, destructionPerLevel: 125, fusionPerLevel: 30, tailoringPerLevel: 0.45, metallurgyPerLevel: 0.22 },
  { from: 1700, to: 1719, normalGoldPerLevel: 13600, advancedGoldPerLevel: 11400, shardsPerLevel: 22500, leapstonesPerLevel: 51, protectionPerLevel: 320, destructionPerLevel: 150, fusionPerLevel: 36, tailoringPerLevel: 0.55, metallurgyPerLevel: 0.28 },
  { from: 1720, to: 1750, normalGoldPerLevel: 16800, advancedGoldPerLevel: 14100, shardsPerLevel: 27200, leapstonesPerLevel: 61, protectionPerLevel: 380, destructionPerLevel: 180, fusionPerLevel: 44, tailoringPerLevel: 0.7, metallurgyPerLevel: 0.35 },
];

export const OCR_SCREEN_TEMPLATES: OcrScreenTemplate[] = [
  {
    key: "ingame_combined",
    label: "인게임 한 장(장비 + 재료 + 재화)",
    description: "장비창, 인벤토리, 상단 재화가 한 번에 보이는 기본 템플릿이야.",
    fields: [
      { id: "silver", label: "실링", description: "상단 바 왼쪽 실링", x: 0.255, y: 0.008, width: 0.095, height: 0.028 },
      { id: "gold", label: "골드", description: "상단 바 가운데 골드", x: 0.36, y: 0.008, width: 0.085, height: 0.028 },
      { id: "boundShards", label: "운명의 파편", description: "상단 바 오른쪽 운명의 파편", x: 0.455, y: 0.008, width: 0.1, height: 0.028 },
      { id: "currentItemLevel", label: "현재 아이템레벨", description: "장비창 오른쪽 장착 아이템 레벨", x: 0.34, y: 0.17, width: 0.115, height: 0.07 },
      { id: "equipmentColumn", label: "장비 목록", description: "장비 아이콘 세로 영역", x: 0.315, y: 0.175, width: 0.085, height: 0.43 },
      { id: "weaponLevel", label: "강화 단계", description: "장비 툴팁 상단의 +강화 정보", x: 0.145, y: 0.145, width: 0.18, height: 0.065 },
      { id: "advancedRefining", label: "상급 재련 단계", description: "장비 툴팁의 상급 재련 단계", x: 0.145, y: 0.405, width: 0.17, height: 0.06 },
      { id: "artisanEnergy", label: "장인의 기운", description: "장비 툴팁 하단 장인의 기운 영역", x: 0.15, y: 0.675, width: 0.18, height: 0.05 },
      { id: "currentRefiningExp", label: "현재 단계 재련 경험치", description: "장비 툴팁 하단 재련 경험치 영역", x: 0.15, y: 0.728, width: 0.2, height: 0.05 },
      { id: "boundProtectionStones", label: "운명의 수호석(귀속)", description: "인벤토리 하단 파란 수호석", x: 0.77, y: 0.71, width: 0.062, height: 0.075 },
      { id: "boundDestructionStones", label: "운명의 파괴석(귀속)", description: "인벤토리 하단 빨간 파괴석", x: 0.835, y: 0.71, width: 0.062, height: 0.075 },
      { id: "boundIceBreaths", label: "빙하의 숨결(귀속)", description: "수호석 아래 파란 숨결", x: 0.77, y: 0.82, width: 0.055, height: 0.065 },
      { id: "boundLavaBreaths", label: "용암의 숨결(귀속)", description: "파괴석 아래 빨간 숨결", x: 0.832, y: 0.82, width: 0.055, height: 0.065 },
      { id: "boundLeapstones", label: "운명의 돌파석(귀속)", description: "숨결 오른쪽 분홍 돌파석", x: 0.893, y: 0.82, width: 0.05, height: 0.065 },
      { id: "boundFusion", label: "아비도스 융화 재료(귀속)", description: "인벤토리 오른쪽 위 파란 아비도스", x: 0.953, y: 0.67, width: 0.045, height: 0.07 },
    ],
  },
  {
    key: "character_profile",
    label: "캐릭터 장비창",
    description: "장비창과 툴팁만 크게 찍은 화면용이야.",
    fields: [
      { id: "currentItemLevel", label: "현재 아이템레벨", description: "장비창 오른쪽 장착 아이템 레벨", x: 0.79, y: 0.08, width: 0.13, height: 0.08 },
      { id: "equipmentColumn", label: "장비 목록", description: "오른쪽 장비 아이콘 세로 영역", x: 0.72, y: 0.14, width: 0.17, height: 0.62 },
      { id: "weaponLevel", label: "강화 단계", description: "장비 툴팁 상단의 +강화 정보", x: 0.31, y: 0.11, width: 0.24, height: 0.09 },
      { id: "advancedRefining", label: "상급 재련 단계", description: "장비 툴팁의 상급 재련 단계", x: 0.33, y: 0.39, width: 0.22, height: 0.08 },
      { id: "artisanEnergy", label: "장인의 기운", description: "장비 툴팁 하단 장인의 기운 영역", x: 0.35, y: 0.67, width: 0.22, height: 0.06 },
      { id: "currentRefiningExp", label: "현재 단계 재련 경험치", description: "장비 툴팁 하단 재련 경험치 영역", x: 0.35, y: 0.72, width: 0.24, height: 0.06 },
    ],
  },
  {
    key: "material_inventory",
    label: "인벤토리 귀속 재료",
    description: "인벤토리 재련 재료만 크게 보이는 화면용이야.",
    fields: [
      { id: "boundProtectionStones", label: "운명의 수호석(귀속)", description: "인벤토리 하단 파란 수호석", x: 0.77, y: 0.71, width: 0.062, height: 0.075 },
      { id: "boundDestructionStones", label: "운명의 파괴석(귀속)", description: "인벤토리 하단 빨간 파괴석", x: 0.835, y: 0.71, width: 0.062, height: 0.075 },
      { id: "boundIceBreaths", label: "빙하의 숨결(귀속)", description: "수호석 아래 파란 숨결", x: 0.77, y: 0.82, width: 0.055, height: 0.065 },
      { id: "boundLavaBreaths", label: "용암의 숨결(귀속)", description: "파괴석 아래 빨간 숨결", x: 0.832, y: 0.82, width: 0.055, height: 0.065 },
      { id: "boundLeapstones", label: "운명의 돌파석(귀속)", description: "숨결 오른쪽 분홍 돌파석", x: 0.893, y: 0.82, width: 0.05, height: 0.065 },
      { id: "boundFusion", label: "아비도스 융화 재료(귀속)", description: "인벤토리 오른쪽 위 파란 아비도스", x: 0.953, y: 0.67, width: 0.045, height: 0.07 },
    ],
  },
  {
    key: "currency_bar",
    label: "재화 표시",
    description: "실링, 골드, 운명의 파편만 따로 볼 때 써.",
    fields: [
      { id: "silver", label: "실링", description: "상단 바 왼쪽 실링", x: 0.255, y: 0.008, width: 0.095, height: 0.028 },
      { id: "gold", label: "골드", description: "상단 바 가운데 골드", x: 0.36, y: 0.008, width: 0.085, height: 0.028 },
      { id: "boundShards", label: "운명의 파편", description: "상단 바 오른쪽 운명의 파편", x: 0.455, y: 0.008, width: 0.1, height: 0.028 },
    ],
  },
  {
    key: "market_price",
    label: "거래소 시세 화면",
    description: "거래소 최저가를 읽는 별도 템플릿이야.",
    fields: [
      { id: "shardPricePer1000", label: "파편 시세", description: "파편 또는 주머니 가격 영역", x: 0.58, y: 0.22, width: 0.18, height: 0.08 },
      { id: "leapstonePrice", label: "돌파석 시세", description: "돌파석 가격 영역", x: 0.58, y: 0.32, width: 0.18, height: 0.08 },
      { id: "protectionStonePricePer10", label: "수호석 시세", description: "수호석 가격 영역", x: 0.58, y: 0.42, width: 0.18, height: 0.08 },
      { id: "destructionStonePricePer10", label: "파괴석 시세", description: "파괴석 가격 영역", x: 0.58, y: 0.52, width: 0.18, height: 0.08 },
      { id: "fusionPrice", label: "융화 재료 시세", description: "융화 재료 가격 영역", x: 0.58, y: 0.62, width: 0.18, height: 0.08 },
    ],
  },
];
