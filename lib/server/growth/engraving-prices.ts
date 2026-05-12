import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const ENGRAVING_CATEGORY_CODE = 40000;

type EngravingPriceItem = {
  name: string;
  grade: string;
  itemName: string;
  currentMinPrice: number;
  recentPrice: number;
  yDayAvgPrice: number;
};

const memoryCache = new Map<string, { expiresAt: number; value: EngravingPriceItem | null }>();

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
      // Local env files are optional.
    }
  }
  return "";
}

function authHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: /^bearer\s+/i.test(apiKey) ? apiKey : `bearer ${apiKey}`,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lostarkFetch(apiKey: string, apiPath: string, init?: RequestInit) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${LOSTARK_API_BASE}${apiPath}`, {
      ...init,
      headers: {
        ...authHeaders(apiKey),
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (response.ok) return response.json();

    const detail = await response.text().catch(() => "");
    lastError = new Error(`LOSTARK_API_${response.status}${detail ? `:${detail.slice(0, 180)}` : ""}`);
    if (response.status !== 429 || attempt === 2) break;
    await delay(1400 + attempt * 1800);
  }
  throw lastError ?? new Error("LOSTARK_API_FAILED");
}

function parseNames(input: unknown) {
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((name) => name.replace(/\s*Lv\.?\s*\d+/gi, "").trim())
        .filter(Boolean)
    )
  );
}

function readPrice(row: any) {
  const currentMinPrice = Number(row?.CurrentMinPrice ?? row?.currentMinPrice ?? 0) || 0;
  const recentPrice = Number(row?.RecentPrice ?? row?.recentPrice ?? 0) || 0;
  const yDayAvgPrice = Number(row?.YDayAvgPrice ?? row?.yDayAvgPrice ?? 0) || 0;
  return {
    currentMinPrice,
    recentPrice,
    yDayAvgPrice,
  };
}

function readItems(data: any) {
  return Array.isArray(data?.Items) ? data.Items : Array.isArray(data?.items) ? data.items : [];
}

function makeCacheKey(grade: string, name: string) {
  return `${grade}:${name}`;
}

async function searchMarketItems(apiKey: string, itemName: string) {
  const data = await lostarkFetch(apiKey, "/markets/items", {
    method: "POST",
    body: JSON.stringify({
      CategoryCode: ENGRAVING_CATEGORY_CODE,
      ItemName: itemName,
      PageNo: 1,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "ASC",
    }),
  });
  return readItems(data);
}

async function fetchEngravingBook(apiKey: string, grade: string, name: string): Promise<EngravingPriceItem | null> {
  const cacheKey = makeCacheKey(grade, name);
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const expectedName = `${grade} ${name} 각인서`;
  const rows = await searchMarketItems(apiKey, expectedName);
  const fallbackRows = rows.length ? [] : await searchMarketItems(apiKey, `${name} 각인서`);
  const candidates = [...rows, ...fallbackRows];
  const found =
    candidates.find((row: any) => String(row?.Name ?? row?.name ?? "") === expectedName) ??
    candidates.find((row: any) => {
      const rowName = String(row?.Name ?? row?.name ?? "");
      const rowGrade = String(row?.Grade ?? row?.grade ?? "");
      return rowName.includes(name) && rowName.includes("각인서") && (rowGrade === grade || rowName.includes(grade));
    });

  if (!found) {
    memoryCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value: null });
    return null;
  }

  const item: EngravingPriceItem = {
    name,
    grade,
    itemName: String(found?.Name ?? found?.name ?? expectedName),
    ...readPrice(found),
  };
  memoryCache.set(cacheKey, { expiresAt: Date.now() + 120_000, value: item });
  return item;
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
        detail: "공식 거래소 각인서 시세를 불러오려면 서버 환경변수 LOSTARK_API_KEY가 필요해.",
      });
    }

    const names = parseNames(req.query.names);
    if (!names.length) {
      return res.status(400).json({
        ok: false,
        error: "ENGRAVING_NAMES_REQUIRED",
        detail: "각인 이름이 필요해.",
      });
    }

    const grade = String(req.query.grade || "유물").trim() || "유물";
    const pricesByName: Record<string, number> = {};
    const itemsByName: Record<string, EngravingPriceItem> = {};
    const warnings: string[] = [];

    for (const name of names) {
      try {
        const item = await fetchEngravingBook(apiKey, grade, name);
        if (item) {
          const pickedPrice = item.currentMinPrice || item.recentPrice || item.yDayAvgPrice || 0;
          if (pickedPrice > 0) pricesByName[name] = pickedPrice;
          itemsByName[name] = item;
        }
      } catch (error: any) {
        const message = String(error?.message || error);
        warnings.push(`${name}: ${message}`);
        if (message.includes("LOSTARK_API_429")) break;
      }
      await delay(350);
    }

    const missingNames = names.filter((name) => !itemsByName[name]);
    const rateLimited = warnings.some((message) => message.includes("LOSTARK_API_429"));
    if (rateLimited && !Object.keys(itemsByName).length) {
      return res.status(429).json({
        ok: false,
        error: "LOSTARK_API_RATE_LIMITED",
        detail: "공식 로스트아크 API 호출 제한에 걸렸어. 1분 정도 뒤에 다시 눌러줘.",
        warnings,
      });
    }

    return res.status(200).json({
      ok: true,
      source: "lostark-openapi-markets",
      sourceUrl: `${LOSTARK_API_BASE}/markets/items`,
      fetchedAt: new Date().toISOString(),
      grade,
      pricesByName,
      itemsByName,
      missingNames,
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "ENGRAVING_MARKET_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
