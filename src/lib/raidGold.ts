export type RaidDiffName = "노말" | "하드" | "나이트메어" | "1단계" | "2단계" | "3단계";

export type GoldSplit = {
  tradable: number;
  bound: number;
};

type RaidRewardInfo = {
  medal?: number;
  normal?: GoldSplit;
  hard?: GoldSplit;
  nightmare?: GoldSplit;
  stage1?: GoldSplit;
  stage2?: GoldSplit;
  stage3?: GoldSplit;
};

type RaidDifficulty = {
  name: RaidDiffName;
  minIlvl: number;
  gold: number;
};

type RaidDef = {
  key: string;
  name: string;
  diffs: RaidDifficulty[];
};

export type WeeklyRaidPick = {
  raids: string[];
  goldRaids?: string[];
  diffs?: Record<string, RaidDiffName>;
};

export type PlannerRaidSelection = {
  raidName: string;
  diff: RaidDiffName;
  goldEnabled: boolean;
  tradableGold: number;
  boundGold: number;
  totalGold: number;
  availableDiffs: RaidDiffName[];
};

export type PlannerGoldBasis = "total" | "tradable";

function splitGold(tradable: number, bound: number): GoldSplit {
  return { tradable, bound };
}

function halfGold(total: number): GoldSplit {
  const tradable = Math.floor(total / 2);
  return { tradable, bound: total - tradable };
}

function tradableOnlyGold(total: number): GoldSplit {
  return { tradable: total, bound: 0 };
}

function boundOnlyGold(total: number): GoldSplit {
  return { tradable: 0, bound: total };
}

function getSplitTotal(split?: GoldSplit) {
  if (!split) return 0;
  return split.tradable + split.bound;
}

const EMPTY_GOLD_SPLIT: GoldSplit = { tradable: 0, bound: 0 };

export const RAID_REWARD_INFO: Record<string, RaidRewardInfo> = {
  발탄: { medal: 120, normal: halfGold(1200), hard: halfGold(1800) },
  비아키스: { medal: 160, normal: halfGold(1600), hard: halfGold(2400) },
  쿠크세이튼: { medal: 300, normal: halfGold(3000) },
  아브렐슈드: { medal: 700, normal: halfGold(4600), hard: halfGold(5600) },
  카양겔: { medal: 450, normal: halfGold(3600), hard: halfGold(4800) },
  일리아칸: { medal: 750, normal: halfGold(5400), hard: halfGold(7500) },
  상아탑: { medal: 900, normal: halfGold(6500), hard: halfGold(9000) },
  카멘: { medal: 1050, normal: halfGold(8000), hard: boundOnlyGold(8000) },
  에키드나: { medal: 950, normal: halfGold(9500), hard: halfGold(11000) },
  베히모스: { medal: 1400, normal: splitGold(3600, 3600) },
  서막: { medal: 1500, normal: halfGold(6100), hard: splitGold(3600, 3600) },
  "1막": { medal: 1900, normal: splitGold(5750, 5750), hard: splitGold(9000, 9000) },
  "2막": { medal: 2300, normal: splitGold(8250, 8250), hard: splitGold(11500, 11500) },
  "3막": { medal: 2700, normal: splitGold(10500, 10500), hard: splitGold(13500, 13500) },
  "4막": { normal: splitGold(16500, 16500), hard: tradableOnlyGold(42000) },
  종막: { normal: splitGold(20000, 20000), hard: tradableOnlyGold(52000) },
  세르카: { normal: splitGold(17500, 17500), hard: tradableOnlyGold(44000), nightmare: tradableOnlyGold(54000) },
  "지평의 성당": { stage1: boundOnlyGold(30000), stage2: boundOnlyGold(40000), stage3: boundOnlyGold(50000) },
  "1막 익스트림": { normal: tradableOnlyGold(20000), hard: tradableOnlyGold(45000), nightmare: tradableOnlyGold(45000) },
  "2막 익스트림": { normal: tradableOnlyGold(20000), hard: tradableOnlyGold(45000), nightmare: tradableOnlyGold(45000) },
};

const DEFAULT_EXTREME_WEEKLY_RAID_TITLES = new Set(["1막 익스트림", "2막 익스트림"]);

export const RAID_CATALOG: RaidDef[] = [
  { key: "VALTAN", name: "발탄", diffs: [{ name: "노말", minIlvl: 1415, gold: getSplitTotal(RAID_REWARD_INFO["발탄"].normal) }, { name: "하드", minIlvl: 1445, gold: getSplitTotal(RAID_REWARD_INFO["발탄"].hard) }] },
  { key: "VYKAS", name: "비아키스", diffs: [{ name: "노말", minIlvl: 1430, gold: getSplitTotal(RAID_REWARD_INFO["비아키스"].normal) }, { name: "하드", minIlvl: 1460, gold: getSplitTotal(RAID_REWARD_INFO["비아키스"].hard) }] },
  { key: "KOUKOU", name: "쿠크세이튼", diffs: [{ name: "노말", minIlvl: 1475, gold: getSplitTotal(RAID_REWARD_INFO["쿠크세이튼"].normal) }] },
  { key: "ABREL", name: "아브렐슈드", diffs: [{ name: "노말", minIlvl: 1490, gold: getSplitTotal(RAID_REWARD_INFO["아브렐슈드"].normal) }, { name: "하드", minIlvl: 1540, gold: getSplitTotal(RAID_REWARD_INFO["아브렐슈드"].hard) }] },
  { key: "KAYANGEL", name: "카양겔", diffs: [{ name: "노말", minIlvl: 1540, gold: getSplitTotal(RAID_REWARD_INFO["카양겔"].normal) }, { name: "하드", minIlvl: 1580, gold: getSplitTotal(RAID_REWARD_INFO["카양겔"].hard) }] },
  { key: "ILLIAKAN", name: "일리아칸", diffs: [{ name: "노말", minIlvl: 1580, gold: getSplitTotal(RAID_REWARD_INFO["일리아칸"].normal) }, { name: "하드", minIlvl: 1600, gold: getSplitTotal(RAID_REWARD_INFO["일리아칸"].hard) }] },
  { key: "IVORY", name: "상아탑", diffs: [{ name: "노말", minIlvl: 1600, gold: getSplitTotal(RAID_REWARD_INFO["상아탑"].normal) }, { name: "하드", minIlvl: 1620, gold: getSplitTotal(RAID_REWARD_INFO["상아탑"].hard) }] },
  { key: "KAMEN", name: "카멘", diffs: [{ name: "노말", minIlvl: 1610, gold: getSplitTotal(RAID_REWARD_INFO["카멘"].normal) }, { name: "하드", minIlvl: 1630, gold: getSplitTotal(RAID_REWARD_INFO["카멘"].hard) }] },
  { key: "ACT0", name: "서막", diffs: [{ name: "노말", minIlvl: 1620, gold: getSplitTotal(RAID_REWARD_INFO["서막"].normal) }, { name: "하드", minIlvl: 1640, gold: getSplitTotal(RAID_REWARD_INFO["서막"].hard) }] },
  { key: "EPIC", name: "베히모스", diffs: [{ name: "노말", minIlvl: 1640, gold: getSplitTotal(RAID_REWARD_INFO["베히모스"].normal) }] },
  { key: "ACT1", name: "1막", diffs: [{ name: "노말", minIlvl: 1660, gold: getSplitTotal(RAID_REWARD_INFO["1막"].normal) }, { name: "하드", minIlvl: 1680, gold: getSplitTotal(RAID_REWARD_INFO["1막"].hard) }] },
  { key: "ACT2", name: "2막", diffs: [{ name: "노말", minIlvl: 1670, gold: getSplitTotal(RAID_REWARD_INFO["2막"].normal) }, { name: "하드", minIlvl: 1690, gold: getSplitTotal(RAID_REWARD_INFO["2막"].hard) }] },
  { key: "ACT3", name: "3막", diffs: [{ name: "노말", minIlvl: 1680, gold: getSplitTotal(RAID_REWARD_INFO["3막"].normal) }, { name: "하드", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["3막"].hard) }] },
  { key: "ACT4", name: "4막", diffs: [{ name: "노말", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["4막"].normal) }, { name: "하드", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["4막"].hard) }] },
  { key: "FINAL", name: "종막", diffs: [{ name: "노말", minIlvl: 1710, gold: getSplitTotal(RAID_REWARD_INFO["종막"].normal) }, { name: "하드", minIlvl: 1730, gold: getSplitTotal(RAID_REWARD_INFO["종막"].hard) }] },
  { key: "SERKA", name: "세르카", diffs: [{ name: "노말", minIlvl: 1710, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].normal) }, { name: "하드", minIlvl: 1730, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].hard) }, { name: "나이트메어", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].nightmare) }] },
  { key: "ABYSS1", name: "지평의 성당", diffs: [{ name: "1단계", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage1) }, { name: "2단계", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage2) }, { name: "3단계", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage3) }] },
  { key: "EXT_ACT1", name: "1막 익스트림", diffs: [{ name: "노말", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].normal) }, { name: "하드", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].hard) }, { name: "나이트메어", minIlvl: 1770, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].nightmare) }] },
  { key: "EXT_ACT2", name: "2막 익스트림", diffs: [{ name: "노말", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].normal) }, { name: "하드", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].hard) }, { name: "나이트메어", minIlvl: 1770, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].nightmare) }] },
];

export function normalizeRaidName(name: string) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

export function canonicalRaidName(name: string) {
  const normalized = normalizeRaidName(name);
  const found = RAID_CATALOG.find((raid) => normalizeRaidName(raid.name) === normalized);
  return found?.name ?? normalized;
}

function uniqueCanonicalRaidNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const canonical = canonicalRaidName(name);
    const normalized = normalizeRaidName(canonical);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(canonical);
  }
  return result;
}

function pickBestDiff(ilvl: number, raid: RaidDef, basis: PlannerGoldBasis = "total") {
  const avail = raid.diffs.filter((diff) => ilvl >= diff.minIlvl);
  if (!avail.length) return null;
  return avail.slice().sort((a, b) => {
    if (basis === "tradable") {
      const aSplit = getGoldSplitByDiffName(raid.name, a.name);
      const bSplit = getGoldSplitByDiffName(raid.name, b.name);
      return bSplit.tradable - aSplit.tradable || b.gold - a.gold;
    }
    return b.gold - a.gold;
  })[0];
}

export function availableDiffNames(ilvl: number, raidName: string): RaidDiffName[] {
  const def = RAID_CATALOG.find((raid) => normalizeRaidName(raid.name) === normalizeRaidName(raidName));
  if (!def) return [];
  return def.diffs.filter((diff) => ilvl >= diff.minIlvl).map((diff) => diff.name);
}

function getGoldSplitByDiffName(raidName: string, diff: RaidDiffName): GoldSplit {
  const reward = RAID_REWARD_INFO[raidName];
  if (!reward) return EMPTY_GOLD_SPLIT;
  if (diff === "노말") return reward.normal ?? EMPTY_GOLD_SPLIT;
  if (diff === "하드") return reward.hard ?? EMPTY_GOLD_SPLIT;
  if (diff === "나이트메어") return reward.nightmare ?? EMPTY_GOLD_SPLIT;
  if (diff === "1단계") return reward.stage1 ?? EMPTY_GOLD_SPLIT;
  if (diff === "2단계") return reward.stage2 ?? EMPTY_GOLD_SPLIT;
  if (diff === "3단계") return reward.stage3 ?? EMPTY_GOLD_SPLIT;
  return EMPTY_GOLD_SPLIT;
}

export function calcWeeklyTop3Gold(ilvl: number, basis: PlannerGoldBasis = "total") {
  const candidates = RAID_CATALOG
    .filter((raid) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(raid.name))
    .map((raid) => {
      const best = pickBestDiff(ilvl, raid, basis);
      if (!best) return null;
      const split = getGoldSplitByDiffName(raid.name, best.name);
      return best ? { raid: raid.name, diff: best.name, gold: best.gold, tradableGold: split.tradable } : null;
    })
    .filter(Boolean) as { raid: string; diff: RaidDiffName; gold: number; tradableGold: number }[];

  candidates.sort((a, b) => (basis === "tradable" ? b.tradableGold - a.tradableGold || b.gold - a.gold : b.gold - a.gold));
  const top3 = candidates.slice(0, 3);
  const sum = top3.reduce((acc, cur) => acc + cur.gold, 0);
  return { sum, top3, all: candidates };
}

export function sanitizeWeeklyRaidPick(ilvl: number, source?: Partial<WeeklyRaidPick> | null): WeeklyRaidPick {
  const auto = calcWeeklyTop3Gold(ilvl);
  const autoRaids = uniqueCanonicalRaidNames(auto.top3.map((row) => row.raid));
  const hasExplicitRaids = Array.isArray(source?.raids);
  const hasExplicitGoldRaids = Array.isArray(source?.goldRaids);

  const raids = uniqueCanonicalRaidNames(hasExplicitRaids ? source!.raids! : autoRaids).filter((raidName) => availableDiffNames(ilvl, raidName).length > 0);
  const finalRaids = hasExplicitRaids ? raids : raids.length > 0 ? raids : autoRaids;

  const rawGoldRaids = uniqueCanonicalRaidNames(hasExplicitGoldRaids ? source!.goldRaids! : autoRaids)
    .filter((raidName) => finalRaids.some((name) => normalizeRaidName(name) === normalizeRaidName(raidName)))
    .filter((raidName) => availableDiffNames(ilvl, raidName).length > 0);

  const normalGoldRaids = rawGoldRaids.filter((raidName) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName)));
  const extremeGoldRaids = rawGoldRaids.filter((raidName) => DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName)));
  const goldRaids = [...normalGoldRaids.slice(0, 3), ...extremeGoldRaids];

  const diffsSource = source?.diffs && typeof source.diffs === "object" ? source.diffs : {};
  const diffs = Object.fromEntries(
    Object.entries(diffsSource).flatMap(([raidName, diff]) => {
      const canonical = canonicalRaidName(raidName);
      const avail = availableDiffNames(ilvl, canonical);
      if (!finalRaids.some((name) => normalizeRaidName(name) === normalizeRaidName(canonical))) return [];
      if (!avail.includes(diff as RaidDiffName)) return [];
      return [[canonical, diff as RaidDiffName]];
    })
  ) as Record<string, RaidDiffName>;

  const fallbackNormalGoldRaids = finalRaids.filter((raidName) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName))).slice(0, 3);
  const fallbackExtremeGoldRaids = finalRaids.filter((raidName) => DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName)));

  return {
    raids: finalRaids,
    goldRaids: hasExplicitGoldRaids ? goldRaids : goldRaids.length > 0 ? goldRaids : [...fallbackNormalGoldRaids, ...fallbackExtremeGoldRaids],
    diffs,
  };
}

export function getDefaultWeeklyRaidPick(ilvl: number, basis: PlannerGoldBasis = "total"): WeeklyRaidPick {
  const auto = calcWeeklyTop3Gold(ilvl, basis);
  return sanitizeWeeklyRaidPick(ilvl, {
    raids: auto.top3.map((row) => row.raid),
    goldRaids: auto.top3.map((row) => row.raid),
    diffs: Object.fromEntries(auto.top3.map((row) => [row.raid, row.diff])) as Record<string, RaidDiffName>,
  });
}

export function getDefaultPlannerRaidPick(ilvl: number, basis: PlannerGoldBasis = "total"): WeeklyRaidPick {
  const auto = calcWeeklyTop3Gold(ilvl, basis);
  const availableRaids = RAID_CATALOG.filter((raid) => availableDiffNames(ilvl, raid.name).length > 0).map((raid) => raid.name);
  const diffs = Object.fromEntries(
    RAID_CATALOG.flatMap((raid) => {
      const best = pickBestDiff(ilvl, raid, basis);
      return best ? [[raid.name, best.name]] : [];
    })
  ) as Record<string, RaidDiffName>;

  return sanitizeWeeklyRaidPick(ilvl, {
    raids: availableRaids,
    goldRaids: auto.top3.map((row) => row.raid),
    diffs,
  });
}

export function loadWeeklyRaidPickFromStorage(tableId: string, charId: string, ilvl: number) {
  try {
    const raw = localStorage.getItem(`loa-weekly-raid-pick:v1:${tableId}:${charId}`);
    if (!raw) return getDefaultWeeklyRaidPick(ilvl);
    const parsed = JSON.parse(raw) as WeeklyRaidPick;
    if (!parsed || typeof parsed !== "object") return getDefaultWeeklyRaidPick(ilvl);
    return sanitizeWeeklyRaidPick(ilvl, parsed);
  } catch {
    return getDefaultWeeklyRaidPick(ilvl);
  }
}

export function buildPlannerRaidSelections(ilvl: number, pick?: Partial<WeeklyRaidPick> | null): PlannerRaidSelection[] {
  const sanitized = sanitizeWeeklyRaidPick(ilvl, pick);
  const allGoldRaids = sanitized.goldRaids ?? [];
  const normalGoldRaids = allGoldRaids.filter((name) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(name)));
  const extremeGoldRaids = allGoldRaids.filter((name) => DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(name)));
  const goldSet = new Set([...normalGoldRaids.slice(0, 3), ...extremeGoldRaids].map((name) => normalizeRaidName(name)));

  return sanitized.raids
    .filter((raidName) => availableDiffNames(ilvl, raidName).length > 0)
    .map((raidName) => {
      const canonical = canonicalRaidName(raidName);
      const avail = availableDiffNames(ilvl, canonical);
      const def = RAID_CATALOG.find((raid) => normalizeRaidName(raid.name) === normalizeRaidName(canonical));
      const autoBest = def ? pickBestDiff(ilvl, def) : null;
      const preferred = sanitized.diffs?.[canonical] ?? sanitized.diffs?.[raidName];
      const diff = preferred && avail.includes(preferred) ? preferred : (autoBest?.name ?? avail[avail.length - 1]) as RaidDiffName;
      const split = getGoldSplitByDiffName(canonical, diff);
      return {
        raidName: canonical,
        diff,
        goldEnabled: goldSet.has(normalizeRaidName(canonical)),
        tradableGold: split.tradable,
        boundGold: split.bound,
        totalGold: getSplitTotal(split),
        availableDiffs: avail,
      };
    });
}

export function calcPlannerRaidGold(selections: PlannerRaidSelection[]) {
  return selections.reduce(
    (acc, row) => {
      if (!row.goldEnabled) return acc;
      acc.tradableGold += row.tradableGold;
      acc.boundGold += row.boundGold;
      acc.totalGold += row.totalGold;
      return acc;
    },
    { tradableGold: 0, boundGold: 0, totalGold: 0 }
  );
}

export function syncPlannerRaidSelections(ilvl: number, existing: PlannerRaidSelection[]) {
  if (!Number.isFinite(ilvl) || ilvl <= 0) return [];
  const fallback = buildPlannerRaidSelections(ilvl, getDefaultWeeklyRaidPick(ilvl));
  if (!existing.length) return fallback;

  const validNames = new Set(RAID_CATALOG.filter((raid) => availableDiffNames(ilvl, raid.name).length > 0).map((raid) => normalizeRaidName(raid.name)));
  const keptNames = existing.map((row) => canonicalRaidName(row.raidName)).filter((name) => validNames.has(normalizeRaidName(name)));
  const pick: WeeklyRaidPick = {
    raids: keptNames.length ? keptNames : fallback.map((row) => row.raidName),
    goldRaids: existing.filter((row) => row.goldEnabled).map((row) => canonicalRaidName(row.raidName)),
    diffs: Object.fromEntries(existing.map((row) => [canonicalRaidName(row.raidName), row.diff])) as Record<string, RaidDiffName>,
  };
  return buildPlannerRaidSelections(ilvl, pick);
}
