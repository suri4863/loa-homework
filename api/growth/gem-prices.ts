import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const DEFAULT_GEM_LEVELS = [5, 6, 7, 8, 9, 10];
const GEM_TYPES = ["겁화", "작열"];
const FALLBACK_GEM_CATEGORY_CODE = 210000;

type AuctionGemItem = {
  level: number;
  type: string;
  itemName: string;
  buyPrice: number;
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
      // Ignore missing local env files in production.
    }
  }
  return "";
}

function parseLevels(input: unknown) {
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  const levels = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 10);
  return levels.length ? Array.from(new Set(levels)).sort((a, b) => a - b) : DEFAULT_GEM_LEVELS;
}

function authHeaders(apiKey: string) {
  const normalized = /^bearer\s+/i.test(apiKey) ? apiKey : `bearer ${apiKey}`;
  return {
    accept: "application/json",
    authorization: normalized,
  };
}

async function lostarkFetch(apiKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`${LOSTARK_API_BASE}${path}`, {
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

function readCode(value: any) {
  const raw = value?.Code ?? value?.code ?? value?.Value ?? value?.value ?? value?.CategoryCode ?? value?.categoryCode;
  const code = Number(raw);
  return Number.isFinite(code) && code > 0 ? code : null;
}

function readName(value: any) {
  return String(value?.CodeName ?? value?.codeName ?? value?.Name ?? value?.name ?? value?.CategoryName ?? value?.categoryName ?? "");
}

function findGemCategoryCode(input: any): number | null {
  if (!input || typeof input !== "object") return null;
  const name = readName(input);
  const code = readCode(input);
  if (code && /보석|gem/i.test(name)) return code;

  for (const value of Object.values(input)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findGemCategoryCode(child);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findGemCategoryCode(value);
      if (found) return found;
    }
  }

  return null;
}

function readBuyPrice(item: any) {
  const price = Number(
    item?.AuctionInfo?.BuyPrice ??
      item?.auctionInfo?.buyPrice ??
      item?.BuyPrice ??
      item?.buyPrice ??
      item?.CurrentMinPrice ??
      item?.currentMinPrice ??
      0
  );
  return Number.isFinite(price) && price > 0 ? price : 0;
}

async function fetchGemCategoryCode(apiKey: string) {
  try {
    const options = await lostarkFetch(apiKey, "/auctions/options");
    return findGemCategoryCode(options) ?? FALLBACK_GEM_CATEGORY_CODE;
  } catch {
    return FALLBACK_GEM_CATEGORY_CODE;
  }
}

async function fetchGemPrice(apiKey: string, categoryCode: number, level: number, type: string): Promise<AuctionGemItem | null> {
  const itemName = `${level}레벨 ${type}의 보석`;
  const payload = {
    CategoryCode: categoryCode,
    ItemTier: 4,
    ItemName: itemName,
    PageNo: 1,
    Sort: "BUY_PRICE",
    SortCondition: "ASC",
    SkillOptions: [],
    EtcOptions: [],
  };

  const data = await lostarkFetch(apiKey, "/auctions/items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const items = Array.isArray(data?.Items) ? data.Items : Array.isArray(data?.items) ? data.items : [];
  const bestPrice = items
    .map(readBuyPrice)
    .filter((price: number) => price > 0)
    .sort((a: number, b: number) => a - b)[0];

  return bestPrice
    ? {
        level,
        type,
        itemName,
        buyPrice: bestPrice,
      }
    : null;
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
        detail: "공식 경매장 시세를 불러오려면 서버 환경변수 LOSTARK_API_KEY가 필요해.",
      });
    }

    const levels = parseLevels(req.query.levels);
    const categoryCode = await fetchGemCategoryCode(apiKey);
    const results = await Promise.allSettled(
      levels.flatMap((level) => GEM_TYPES.map((type) => fetchGemPrice(apiKey, categoryCode, level, type)))
    );
    const items = results
      .filter((result): result is PromiseFulfilledResult<AuctionGemItem | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((item): item is AuctionGemItem => Boolean(item));
    const warnings = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason?.message || result.reason));
    const typePricesByLevel: Record<string, Record<string, number>> = {};
    const pricesByLevel: Record<string, number> = {};

    for (const item of items) {
      const levelKey = String(item.level);
      typePricesByLevel[levelKey] = {
        ...(typePricesByLevel[levelKey] ?? {}),
        [item.type]: item.buyPrice,
      };
      const prev = pricesByLevel[levelKey] || 0;
      pricesByLevel[levelKey] = prev > 0 ? Math.min(prev, item.buyPrice) : item.buyPrice;
    }

    return res.status(200).json({
      ok: true,
      source: "lostark-openapi-auctions",
      sourceUrl: `${LOSTARK_API_BASE}/auctions/items`,
      fetchedAt: new Date().toISOString(),
      categoryCode,
      pricesByLevel,
      typePricesByLevel,
      items,
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "GEM_AUCTION_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
