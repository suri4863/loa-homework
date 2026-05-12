import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const ACCESSORY_PRICE_QUERY_VERSION = "buy-price-high-options-v2";

type AccessoryPart = "목걸이" | "귀걸이" | "반지";

type AccessoryAuctionItem = {
  part: AccessoryPart;
  target: string;
  itemName: string;
  grade: string;
  quality: number;
  buyPrice: number;
  options: string[];
};

type AccessoryTargetSearch = {
  label: string;
  options: Array<{ secondOption: number; minValue: number }>;
};

const ACCESSORY_CATEGORIES: Record<AccessoryPart, number> = {
  목걸이: 200010,
  귀걸이: 200020,
  반지: 200030,
};

const PREFERRED_OPTION_SEARCHES: Record<AccessoryPart, AccessoryTargetSearch[]> = {
  목걸이: [
    {
      label: "추가 피해 상 + 적에게 주는 피해 상",
      options: [
        { secondOption: 41, minValue: 260 },
        { secondOption: 42, minValue: 200 },
      ],
    },
    {
      label: "적에게 주는 피해 상 + 추가 피해 중",
      options: [
        { secondOption: 42, minValue: 200 },
        { secondOption: 41, minValue: 160 },
      ],
    },
    {
      label: "추가 피해 상 + 적에게 주는 피해 중",
      options: [
        { secondOption: 41, minValue: 260 },
        { secondOption: 42, minValue: 120 },
      ],
    },
    {
      label: "적에게 주는 피해 중 + 추가 피해 중",
      options: [
        { secondOption: 42, minValue: 120 },
        { secondOption: 41, minValue: 160 },
      ],
    },
    { label: "적에게 주는 피해 상", options: [{ secondOption: 42, minValue: 200 }] },
    { label: "추가 피해 상", options: [{ secondOption: 41, minValue: 260 }] },
  ],
  귀걸이: [
    {
      label: "공격력 상 + 무기 공격력 상",
      options: [
        { secondOption: 45, minValue: 155 },
        { secondOption: 46, minValue: 300 },
      ],
    },
    {
      label: "공격력 상 + 무기 공격력 중",
      options: [
        { secondOption: 45, minValue: 155 },
        { secondOption: 46, minValue: 180 },
      ],
    },
    {
      label: "무기 공격력 상 + 공격력 중",
      options: [
        { secondOption: 46, minValue: 300 },
        { secondOption: 45, minValue: 95 },
      ],
    },
    {
      label: "공격력 중 + 무기 공격력 중",
      options: [
        { secondOption: 45, minValue: 95 },
        { secondOption: 46, minValue: 180 },
      ],
    },
    { label: "공격력 상", options: [{ secondOption: 45, minValue: 155 }] },
    { label: "무기 공격력 상", options: [{ secondOption: 46, minValue: 300 }] },
  ],
  반지: [
    {
      label: "치명타 피해 상 + 치명타 적중률 상",
      options: [
        { secondOption: 50, minValue: 400 },
        { secondOption: 49, minValue: 155 },
      ],
    },
    {
      label: "치명타 피해 상 + 치명타 적중률 중",
      options: [
        { secondOption: 50, minValue: 400 },
        { secondOption: 49, minValue: 95 },
      ],
    },
    {
      label: "치명타 적중률 상 + 치명타 피해 중",
      options: [
        { secondOption: 49, minValue: 155 },
        { secondOption: 50, minValue: 240 },
      ],
    },
    {
      label: "치명타 피해 중 + 치명타 적중률 중",
      options: [
        { secondOption: 50, minValue: 240 },
        { secondOption: 49, minValue: 95 },
      ],
    },
    { label: "치명타 피해 상", options: [{ secondOption: 50, minValue: 400 }] },
    { label: "치명타 적중률 상", options: [{ secondOption: 49, minValue: 155 }] },
  ],
};

function getApiKey() {
  const fromProcess = String(process.env.LOSTARK_API_KEY || process.env.LOA_API_KEY || process.env.VITE_LOSTARK_API_KEY || "").trim();
  if (fromProcess) return fromProcess;
  for (const fileName of [".env.local", ".env"]) {
    try {
      const file = fs.readFileSync(path.join(process.cwd(), fileName), "utf8");
      const line = file.split(/\r?\n/).find((row) => /^(LOSTARK_API_KEY|LOA_API_KEY|VITE_LOSTARK_API_KEY)=/.test(row.trim()));
      const value = line?.replace(/^[^=]+=/, "").trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    } catch {
      // Local env files are optional in production.
    }
  }
  return "";
}

function authHeaders(apiKey: string) {
  const normalized = /^bearer\s+/i.test(apiKey) ? apiKey : `bearer ${apiKey}`;
  return {
    accept: "application/json",
    authorization: normalized,
  };
}

async function lostarkFetch(apiKey: string, apiPath: string, init?: RequestInit) {
  const response = await fetch(`${LOSTARK_API_BASE}${apiPath}`, {
    ...init,
    headers: {
      ...authHeaders(apiKey),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LOSTARK_API_${response.status}${detail ? `:${detail.slice(0, 180)}` : ""}`);
  }

  return response.json();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBuyPrice(item: any) {
  const auctionInfo = item?.AuctionInfo ?? item?.auctionInfo ?? {};
  const price = Number(
    auctionInfo?.BuyPrice ??
      auctionInfo?.buyPrice ??
      item?.BuyPrice ??
      item?.buyPrice ??
      0
  );
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function readOptions(item: any) {
  const options = Array.isArray(item?.Options) ? item.Options : Array.isArray(item?.options) ? item.options : [];
  return options
    .filter((option: any) => String(option?.Type ?? option?.type ?? "") === "ACCESSORY_UPGRADE")
    .map((option: any) => {
      const name = String(option?.OptionName ?? option?.optionName ?? "");
      const value = Number(option?.Value ?? option?.value ?? 0);
      const isPercent = Boolean(option?.IsValuePercentage ?? option?.isValuePercentage);
      if (!name) return "";
      if (!Number.isFinite(value) || value === 0) return name;
      return `${name} +${isPercent ? `${value.toFixed(2)}%` : value.toLocaleString()}`;
    })
    .filter(Boolean);
}

function isSaneAccessoryPrice(part: AccessoryPart, price: number) {
  const minimum = part === "목걸이" ? 1000 : 500;
  return Number.isFinite(price) && price >= minimum;
}

async function fetchAccessoryTargetPrice(
  apiKey: string,
  part: AccessoryPart,
  target: AccessoryTargetSearch,
  minQuality: number,
  itemGrade: string
): Promise<AccessoryAuctionItem | null> {
  const basePayload = {
    CategoryCode: ACCESSORY_CATEGORIES[part],
    ItemTier: 4,
    ItemGrade: itemGrade,
    Sort: "BUY_PRICE",
    SortCondition: "ASC",
    SkillOptions: [],
    EtcOptions: target.options.map((option) => ({
      FirstOption: 7,
      SecondOption: option.secondOption,
      MinValue: option.minValue,
      MaxValue: 99999,
    })),
  };

  const rows: Array<{ item: any; price: number; options: string[] }> = [];
  for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
    const data = await lostarkFetch(apiKey, "/auctions/items", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, PageNo: pageNo }),
    });
    const items = Array.isArray(data?.Items) ? data.Items : Array.isArray(data?.items) ? data.items : [];
    rows.push(...items.map((item: any) => ({ item, price: readBuyPrice(item), options: readOptions(item) })));
    const totalCount = Number(data?.TotalCount ?? data?.totalCount ?? 0);
    const pageSize = Math.max(1, Number(data?.PageSize ?? data?.pageSize ?? items.length) || 10);
    if (!items.length || pageNo * pageSize >= totalCount) break;
    await delay(150);
  }

  const best = rows
    .filter((row) => Number(row.item?.GradeQuality ?? row.item?.gradeQuality ?? 0) >= minQuality)
    .filter((row) => row.price > 0 && row.options.length > 0)
    .filter((row) => isSaneAccessoryPrice(part, row.price))
    .sort((a, b) => a.price - b.price)[0];

  if (!best) return null;

  return {
    part,
    target: target.label,
    itemName: String(best.item?.Name ?? best.item?.name ?? part),
    grade: String(best.item?.Grade ?? best.item?.grade ?? itemGrade),
    quality: Number(best.item?.GradeQuality ?? best.item?.gradeQuality ?? 0) || 0,
    buyPrice: best.price,
    options: best.options,
  };
}

function parseMinQuality(input: unknown) {
  const value = Number(Array.isArray(input) ? input[0] : input);
  return Number.isFinite(value) && value > 0 ? Math.max(10, Math.min(100, Math.floor(value))) : 67;
}

function parseGrades(input: unknown) {
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  const grades = raw
    .split(",")
    .map((grade) => grade.trim())
    .filter((grade) => grade === "고대" || grade === "유물");
  return grades.length ? Array.from(new Set(grades)) : ["고대", "유물"];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: "LOSTARK_API_KEY_REQUIRED",
        detail: "공식 경매장 악세 시세를 불러오려면 LOSTARK_API_KEY가 필요해.",
      });
    }

    const minQuality = parseMinQuality(req.query.minQuality);
    const grades = parseGrades(req.query.grade || req.query.grades);
    const requested = String(req.query.parts || "")
      .split(",")
      .map((part) => part.trim())
      .filter((part): part is AccessoryPart => part === "목걸이" || part === "귀걸이" || part === "반지");
    const parts = requested.length ? Array.from(new Set(requested)) : (["목걸이", "귀걸이", "반지"] as AccessoryPart[]);

    const items: AccessoryAuctionItem[] = [];
    const warnings: string[] = [];
    for (const part of parts) {
      for (const target of PREFERRED_OPTION_SEARCHES[part]) {
        let foundForTarget = false;
        for (const grade of grades) {
          if (foundForTarget) break;
          try {
            const item = await fetchAccessoryTargetPrice(apiKey, part, target, minQuality, grade);
            if (item) {
              items.push(item);
              foundForTarget = true;
              break;
            }
          } catch (error: any) {
            warnings.push(`${part}/${grade}/${target.label}: ${String(error?.message || error)}`);
            if (String(error?.message || "").includes("LOSTARK_API_429")) break;
          }
          await delay(250);
        }
      }
    }

    const pricesByPart: Record<string, number> = {};
    const targetsByPart: Record<string, AccessoryAuctionItem> = {};
    const candidatesByPart: Record<string, AccessoryAuctionItem[]> = {};
    for (const item of items) {
      candidatesByPart[item.part] = [...(candidatesByPart[item.part] ?? []), item].sort((a, b) => a.buyPrice - b.buyPrice);
      const current = targetsByPart[item.part];
      if (!current || item.buyPrice < current.buyPrice) {
        pricesByPart[item.part] = item.buyPrice;
        targetsByPart[item.part] = item;
      }
    }

    return res.status(200).json({
      ok: true,
      source: "lostark-openapi-auctions",
      sourceUrl: `${LOSTARK_API_BASE}/auctions/items`,
      fetchedAt: new Date().toISOString(),
      queryVersion: ACCESSORY_PRICE_QUERY_VERSION,
      minQuality,
      grades,
      pricesByPart,
      targetsByPart,
      candidatesByPart,
      items,
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "ACCESSORY_AUCTION_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
