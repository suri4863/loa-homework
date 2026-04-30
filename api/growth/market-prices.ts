import type { VercelRequest, VercelResponse } from "@vercel/node";

type MarketFieldKey =
  | "shardPricePer1000"
  | "shardSmallPouchPrice"
  | "shardMediumPouchPrice"
  | "shardLargePouchPrice"
  | "leapstonePrice"
  | "protectionStonePricePer10"
  | "destructionStonePricePer10"
  | "fusionPrice"
  | "successorLeapstonePrice"
  | "successorProtectionStonePricePer10"
  | "successorDestructionStonePricePer10"
  | "superiorFusionPrice"
  | "iceBreathPrice"
  | "lavaBreathPrice"
  | "tailoringBookPrice"
  | "metallurgyBookPrice"
  | "enhancedTailoringBookPrice"
  | "enhancedMetallurgyBookPrice"
  | "artisanTailoringBook1Price"
  | "artisanTailoringBook2Price"
  | "artisanTailoringBook3Price"
  | "artisanTailoringBook4Price"
  | "artisanMetallurgyBook1Price"
  | "artisanMetallurgyBook2Price"
  | "artisanMetallurgyBook3Price"
  | "artisanMetallurgyBook4Price"
  | "upheavalTailoringBook15Price"
  | "upheavalMetallurgyBook15Price"
  | "upheavalTailoringBook19Price"
  | "upheavalMetallurgyBook19Price";

type MarketSnapshot = Record<MarketFieldKey, number>;

type ParsedItem = {
  name: string;
  bundleSize: number;
  totalPrice: number;
  unitPrice: number;
  shardCount?: number;
};

const LOAGAP_URL = "https://loagap.com/price/market";
const ICEPENG_MARKET_URL = "https://market-cron.icepeng.workers.dev";

const SHARD_POUCH_COUNTS: Record<string, number> = {
  "운명의 파편 주머니(소)": 1000,
  "운명의 파편 주머니(중)": 2000,
  "운명의 파편 주머니(대)": 3000,
};

const ITEM_NAMES = {
  protection: ["운명의 수호석"],
  destruction: ["운명의 파괴석"],
  leapstone: ["운명의 돌파석"],
  fusion: ["아비도스 융화 재료"],
  successorProtection: ["운명의 수호석 결정"],
  successorDestruction: ["운명의 파괴석 결정"],
  successorLeapstone: ["위대한 운명의 돌파석"],
  superiorFusion: ["상급 아비도스 융화 재료"],
  tailoring: ["재봉술"],
  metallurgy: ["야금술"],
  pouches: Object.keys(SHARD_POUCH_COUNTS),
};

const ICEPENG_ITEM_NAMES = {
  shardSmall: "운명의 파편 주머니(소)",
  shardMedium: "운명의 파편 주머니(중)",
  shardLarge: "운명의 파편 주머니(대)",
  protection: "운명의 수호석",
  destruction: "운명의 파괴석",
  leapstone: "운명의 돌파석",
  fusion: "아비도스 융화 재료",
  successorProtection: "운명의 수호석 결정",
  successorDestruction: "운명의 파괴석 결정",
  successorLeapstone: "위대한 운명의 돌파석",
  superiorFusion: "상급 아비도스 융화 재료",
  iceBreath: "빙하의 숨결",
  lavaBreath: "용암의 숨결",
  tailoringUpheaval19: "재봉술 : 업화 [19-20]",
  metallurgyUpheaval19: "야금술 : 업화 [19-20]",
  tailoringUpheaval15: "재봉술 : 업화 [15-18]",
  metallurgyUpheaval15: "야금술 : 업화 [15-18]",
  enhancedTailoringUpheaval19: "강화 재봉술 : 업화 [19-20]",
  enhancedMetallurgyUpheaval19: "강화 야금술 : 업화 [19-20]",
  artisanTailoring1: "장인의 재봉술 : 1단계",
  artisanTailoring2: "장인의 재봉술 : 2단계",
  artisanTailoring3: "장인의 재봉술 : 3단계",
  artisanTailoring4: "장인의 재봉술 : 4단계",
  artisanMetallurgy1: "장인의 야금술 : 1단계",
  artisanMetallurgy2: "장인의 야금술 : 2단계",
  artisanMetallurgy3: "장인의 야금술 : 3단계",
  artisanMetallurgy4: "장인의 야금술 : 4단계",
};

function normalizeItemName(name: string) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/[：]/g, ":")
    .trim();
}

function pickIcepengPrice(items: any[], name: string, priceType: "RecentPrice" | "CurrentMinPrice" | "YDayAvgPrice" = "CurrentMinPrice") {
  const normalized = normalizeItemName(name);
  const item = items.find((row) => row?.Name === name) ?? items.find((row) => normalizeItemName(row?.Name) === normalized);
  const value = Number(item?.[priceType] ?? item?.RecentPrice ?? item?.YDayAvgPrice ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildIcepengSnapshot(payload: { updateTime?: string; items?: any[] }) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const getPrice = (name: string) => pickIcepengPrice(items, name);
  const getFallbackPrice = (...names: string[]) => names.map(getPrice).find((value) => value > 0) ?? 0;
  const shardSmall = getPrice(ICEPENG_ITEM_NAMES.shardSmall);
  const shardMedium = getPrice(ICEPENG_ITEM_NAMES.shardMedium);
  const shardLarge = getPrice(ICEPENG_ITEM_NAMES.shardLarge);

  const selectedItems: ParsedItem[] = [
    { name: ICEPENG_ITEM_NAMES.protection, bundleSize: 100, totalPrice: getPrice(ICEPENG_ITEM_NAMES.protection), unitPrice: getPrice(ICEPENG_ITEM_NAMES.protection) / 100 },
    { name: ICEPENG_ITEM_NAMES.destruction, bundleSize: 100, totalPrice: getPrice(ICEPENG_ITEM_NAMES.destruction), unitPrice: getPrice(ICEPENG_ITEM_NAMES.destruction) / 100 },
    { name: ICEPENG_ITEM_NAMES.leapstone, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.leapstone), unitPrice: getPrice(ICEPENG_ITEM_NAMES.leapstone) },
    { name: ICEPENG_ITEM_NAMES.fusion, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.fusion), unitPrice: getPrice(ICEPENG_ITEM_NAMES.fusion) },
    { name: ICEPENG_ITEM_NAMES.successorProtection, bundleSize: 100, totalPrice: getPrice(ICEPENG_ITEM_NAMES.successorProtection), unitPrice: getPrice(ICEPENG_ITEM_NAMES.successorProtection) / 100 },
    { name: ICEPENG_ITEM_NAMES.successorDestruction, bundleSize: 100, totalPrice: getPrice(ICEPENG_ITEM_NAMES.successorDestruction), unitPrice: getPrice(ICEPENG_ITEM_NAMES.successorDestruction) / 100 },
    { name: ICEPENG_ITEM_NAMES.successorLeapstone, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.successorLeapstone), unitPrice: getPrice(ICEPENG_ITEM_NAMES.successorLeapstone) },
    { name: ICEPENG_ITEM_NAMES.superiorFusion, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.superiorFusion), unitPrice: getPrice(ICEPENG_ITEM_NAMES.superiorFusion) },
    { name: ICEPENG_ITEM_NAMES.iceBreath, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.iceBreath), unitPrice: getPrice(ICEPENG_ITEM_NAMES.iceBreath) },
    { name: ICEPENG_ITEM_NAMES.lavaBreath, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.lavaBreath), unitPrice: getPrice(ICEPENG_ITEM_NAMES.lavaBreath) },
    { name: ICEPENG_ITEM_NAMES.tailoringUpheaval15, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval15), unitPrice: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval15) },
    { name: ICEPENG_ITEM_NAMES.metallurgyUpheaval15, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval15), unitPrice: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval15) },
    { name: ICEPENG_ITEM_NAMES.tailoringUpheaval19, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval19), unitPrice: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval19) },
    { name: ICEPENG_ITEM_NAMES.metallurgyUpheaval19, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval19), unitPrice: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval19) },
    { name: ICEPENG_ITEM_NAMES.enhancedTailoringUpheaval19, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedTailoringUpheaval19), unitPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedTailoringUpheaval19) },
    { name: ICEPENG_ITEM_NAMES.enhancedMetallurgyUpheaval19, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedMetallurgyUpheaval19), unitPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedMetallurgyUpheaval19) },
    { name: ICEPENG_ITEM_NAMES.artisanTailoring1, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring1), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring1) },
    { name: ICEPENG_ITEM_NAMES.artisanTailoring2, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring2), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring2) },
    { name: ICEPENG_ITEM_NAMES.artisanTailoring3, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring3), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring3) },
    { name: ICEPENG_ITEM_NAMES.artisanTailoring4, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring4), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring4) },
    { name: ICEPENG_ITEM_NAMES.artisanMetallurgy1, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy1), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy1) },
    { name: ICEPENG_ITEM_NAMES.artisanMetallurgy2, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy2), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy2) },
    { name: ICEPENG_ITEM_NAMES.artisanMetallurgy3, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy3), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy3) },
    { name: ICEPENG_ITEM_NAMES.artisanMetallurgy4, bundleSize: 1, totalPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy4), unitPrice: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy4) },
    { name: ICEPENG_ITEM_NAMES.shardSmall, bundleSize: 1, totalPrice: shardSmall, unitPrice: shardSmall, shardCount: 1000 },
    { name: ICEPENG_ITEM_NAMES.shardMedium, bundleSize: 1, totalPrice: shardMedium, unitPrice: shardMedium, shardCount: 2000 },
    { name: ICEPENG_ITEM_NAMES.shardLarge, bundleSize: 1, totalPrice: shardLarge, unitPrice: shardLarge, shardCount: 3000 },
  ].filter((item) => item.totalPrice > 0 || item.unitPrice > 0);

  const shardCandidates = [
    shardSmall,
    shardMedium ? shardMedium / 2 : 0,
    shardLarge ? shardLarge / 3 : 0,
  ].filter((value) => value > 0);

  const market: MarketSnapshot = {
    shardPricePer1000: shardCandidates.length ? Math.round(Math.min(...shardCandidates) * 100) / 100 : 0,
    shardSmallPouchPrice: shardSmall,
    shardMediumPouchPrice: shardMedium,
    shardLargePouchPrice: shardLarge,
    leapstonePrice: getPrice(ICEPENG_ITEM_NAMES.leapstone),
    protectionStonePricePer10: Math.round((getPrice(ICEPENG_ITEM_NAMES.protection) / 10) * 100) / 100,
    destructionStonePricePer10: Math.round((getPrice(ICEPENG_ITEM_NAMES.destruction) / 10) * 100) / 100,
    fusionPrice: getPrice(ICEPENG_ITEM_NAMES.fusion),
    successorLeapstonePrice: getPrice(ICEPENG_ITEM_NAMES.successorLeapstone),
    successorProtectionStonePricePer10: Math.round((getPrice(ICEPENG_ITEM_NAMES.successorProtection) / 10) * 100) / 100,
    successorDestructionStonePricePer10: Math.round((getPrice(ICEPENG_ITEM_NAMES.successorDestruction) / 10) * 100) / 100,
    superiorFusionPrice: getPrice(ICEPENG_ITEM_NAMES.superiorFusion),
    iceBreathPrice: getPrice(ICEPENG_ITEM_NAMES.iceBreath),
    lavaBreathPrice: getPrice(ICEPENG_ITEM_NAMES.lavaBreath),
    tailoringBookPrice: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval19),
    metallurgyBookPrice: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval19),
    enhancedTailoringBookPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedTailoringUpheaval19),
    enhancedMetallurgyBookPrice: getPrice(ICEPENG_ITEM_NAMES.enhancedMetallurgyUpheaval19),
    artisanTailoringBook1Price: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring1),
    artisanTailoringBook2Price: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring2),
    artisanTailoringBook3Price: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring3),
    artisanTailoringBook4Price: getPrice(ICEPENG_ITEM_NAMES.artisanTailoring4),
    artisanMetallurgyBook1Price: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy1),
    artisanMetallurgyBook2Price: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy2),
    artisanMetallurgyBook3Price: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy3),
    artisanMetallurgyBook4Price: getPrice(ICEPENG_ITEM_NAMES.artisanMetallurgy4),
    upheavalTailoringBook15Price: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval15),
    upheavalMetallurgyBook15Price: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval15),
    upheavalTailoringBook19Price: getPrice(ICEPENG_ITEM_NAMES.tailoringUpheaval19),
    upheavalMetallurgyBook19Price: getPrice(ICEPENG_ITEM_NAMES.metallurgyUpheaval19),
  };

  return { market, selectedItems, lastUpdatedAt: payload.updateTime ?? null, parsedItemCount: items.length };
}
function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(input: string) {
  return Number(String(input).replace(/,/g, ""));
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLastUpdated(text: string) {
  const match = text.match(/마지막\s*업데이트\s*([0-9-]+\s+[0-9:]+)/);
  return match?.[1] ?? null;
}

function extractItem(text: string, itemName: string): ParsedItem | null {
  const patterns = [
    new RegExp(`${escapeRegex(itemName)}\\s+([0-9][0-9,]*)\\s*개\\s*묶음\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+개당\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, "i"),
    new RegExp(`${escapeRegex(itemName)}[\\s\\S]{0,80}?([0-9][0-9,]*)\\s*개\\s*묶음[\\s\\S]{0,80}?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*개당\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const bundleSize = parseNumber(match[1]);
    const totalPrice = parseNumber(match[2]);
    const unitPrice = parseNumber(match[3]);
    if (!Number.isFinite(bundleSize) || !Number.isFinite(totalPrice) || !Number.isFinite(unitPrice)) continue;
    return {
      name: itemName,
      bundleSize,
      totalPrice,
      unitPrice,
    };
  }

  return null;
}

function firstItem(text: string, names: string[]) {
  for (const name of names) {
    const item = extractItem(text, name);
    if (item) return item;
  }
  return null;
}

function pricePer10(item: ParsedItem | null) {
  return item && item.bundleSize > 0 ? Math.round(((item.totalPrice / item.bundleSize) * 10) * 100) / 100 : 0;
}

function buildSnapshot(text: string) {
  const protection = firstItem(text, ITEM_NAMES.protection);
  const destruction = firstItem(text, ITEM_NAMES.destruction);
  const leapstone = firstItem(text, ITEM_NAMES.leapstone);
  const fusion = firstItem(text, ITEM_NAMES.fusion);
  const successorProtection = firstItem(text, ITEM_NAMES.successorProtection);
  const successorDestruction = firstItem(text, ITEM_NAMES.successorDestruction);
  const successorLeapstone = firstItem(text, ITEM_NAMES.successorLeapstone);
  const superiorFusion = firstItem(text, ITEM_NAMES.superiorFusion);
  const tailoring = firstItem(text, ITEM_NAMES.tailoring);
  const metallurgy = firstItem(text, ITEM_NAMES.metallurgy);
  const pouchItems = ITEM_NAMES.pouches.map((name) => extractItem(text, name)).filter((item): item is ParsedItem => Boolean(item));

  const shardCandidates = pouchItems
    .map((item) => {
      const count = SHARD_POUCH_COUNTS[item.name];
      return count ? (item.totalPrice / count) * 1000 : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  const market: MarketSnapshot = {
    shardPricePer1000: shardCandidates.length ? Math.round(Math.min(...shardCandidates) * 100) / 100 : 0,
    shardSmallPouchPrice: pouchItems.find((item) => SHARD_POUCH_COUNTS[item.name] === 1000)?.totalPrice ?? 0,
    shardMediumPouchPrice: pouchItems.find((item) => SHARD_POUCH_COUNTS[item.name] === 2000)?.totalPrice ?? 0,
    shardLargePouchPrice: pouchItems.find((item) => SHARD_POUCH_COUNTS[item.name] === 3000)?.totalPrice ?? 0,
    leapstonePrice: leapstone?.unitPrice ?? 0,
    protectionStonePricePer10: pricePer10(protection),
    destructionStonePricePer10: pricePer10(destruction),
    fusionPrice: fusion?.unitPrice ?? 0,
    successorLeapstonePrice: successorLeapstone?.unitPrice ?? 0,
    successorProtectionStonePricePer10: pricePer10(successorProtection),
    successorDestructionStonePricePer10: pricePer10(successorDestruction),
    superiorFusionPrice: superiorFusion?.unitPrice ?? 0,
    iceBreathPrice: 0,
    lavaBreathPrice: 0,
    tailoringBookPrice: tailoring?.unitPrice ?? 0,
    metallurgyBookPrice: metallurgy?.unitPrice ?? 0,
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
    upheavalTailoringBook19Price: tailoring?.unitPrice ?? 0,
    upheavalMetallurgyBook19Price: metallurgy?.unitPrice ?? 0,
  };

  return {
    market,
    selectedItems: [
      protection,
      destruction,
      leapstone,
      fusion,
      successorProtection,
      successorDestruction,
      successorLeapstone,
      superiorFusion,
      tailoring,
      metallurgy,
      ...pouchItems.map((item) => ({ ...item, shardCount: SHARD_POUCH_COUNTS[item.name] })),
    ].filter((item): item is ParsedItem => Boolean(item)),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const icepengResponse = await fetch(ICEPENG_MARKET_URL, {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
    }).catch(() => null);

    if (icepengResponse?.ok) {
      const payload = await icepengResponse.json();
      const { market, selectedItems, lastUpdatedAt, parsedItemCount } = buildIcepengSnapshot(payload);
      return res.status(200).json({
        ok: true,
        source: "icepeng",
        sourceUrl: ICEPENG_MARKET_URL,
        fetchedAt: new Date().toISOString(),
        lastUpdatedAt,
        market,
        items: selectedItems,
        notes: [
          "아이스펭 시세 Worker 기준으로 자동 입력했어.",
          "파편 주머니는 소/중/대 중 1000개당 가장 싼 값을 사용해.",
          "재봉술/야금술 칸은 현재 업화 19-20 책 값을 우선 사용하고, 없으면 숨결 값을 대체로 사용해.",
        ],
        debug: {
          parsedItemCount,
        },
      });
    }

    const response = await fetch(LOAGAP_URL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko,en-US;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: "PRICE_SOURCE_FETCH_FAILED", detail: response.status });
    }

    const html = await response.text();
    const text = stripHtml(html);
    const parsedItemCount = Array.from(text.matchAll(/개\s*묶음/g)).length;
    const { market, selectedItems } = buildSnapshot(text);

    return res.status(200).json({
      ok: true,
      source: "loagap",
      sourceUrl: LOAGAP_URL,
      fetchedAt: new Date().toISOString(),
      lastUpdatedAt: extractLastUpdated(text),
      market,
      items: selectedItems,
      notes: [
        "운명의 파편은 소/중/대 주머니를 1000개당으로 환산한 뒤 가장 싼 값을 사용해.",
        "수호석/파괴석은 100개 묶음 기준을 계산기 입력용 10개 기준으로 다시 환산해.",
        "전율 장비용 상급 재료는 이름이 일치하는 공개 시세가 있을 때만 자동 입력해.",
      ],
      debug: {
        parsedItemCount,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "MARKET_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
