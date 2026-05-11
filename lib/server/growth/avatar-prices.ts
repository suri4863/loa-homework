import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const AVATAR_CATEGORY_BY_SLOT: Record<string, number> = {
  "무기": 20005,
  "머리": 20010,
  "상의": 20050,
  "하의": 20060,
};
const AVATAR_NAME_HINTS_BY_CLASS: Record<string, string[]> = {
  "가디언나이트": ["영원", "사막"],
};
const AVATAR_PRICE_FALLBACK_BY_CLASS: Record<string, number> = {
  "가디언나이트": 200000,
};

type AvatarPriceItem = {
  slot: string;
  className: string;
  targetGrade: string;
  itemName: string;
  itemId: number;
  currentMinPrice: number;
  recentPrice: number;
  yDayAvgPrice: number;
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
      // Local env files are optional.
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

function parseList(input: unknown, fallback: string[]) {
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  const rows = raw.split(",").map((row) => row.trim()).filter(Boolean);
  return rows.length ? Array.from(new Set(rows)) : fallback;
}

function stripTooltip(input: unknown) {
  return String(input || "")
    .replace(/<BR\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z_]+/gi, " ")
    .replace(/[{}[\]",]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getPickedPrice(row: any) {
  const price = readPrice(row);
  return price.currentMinPrice || price.recentPrice || price.yDayAvgPrice || 0;
}

async function fetchMarketPage(apiKey: string, categoryCode: number, pageNo: number) {
  return lostarkFetch(apiKey, "/markets/items", {
    method: "POST",
    body: JSON.stringify({
      CategoryCode: categoryCode,
      PageNo: pageNo,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "ASC",
    }),
  });
}

async function itemMatchesClass(apiKey: string, itemId: number, className: string) {
  const detail = await lostarkFetch(apiKey, `/markets/items/${itemId}`);
  const rows = Array.isArray(detail) ? detail : Array.isArray(detail?.value) ? detail.value : [];
  const tooltip = rows.map((row: any) => stripTooltip(row?.ToolTip ?? row?.toolTip ?? "")).join(" ");
  return tooltip.includes(className);
}

function fallbackAvatarPrice(slot: string, className: string, targetGrade: string): AvatarPriceItem | null {
  const fallbackPrice = AVATAR_PRICE_FALLBACK_BY_CLASS[className] || 0;
  if (fallbackPrice <= 0) return null;
  return {
    slot,
    className,
    targetGrade,
    itemName: `${className} ${targetGrade} ${slot} 아바타 기준가`,
    itemId: 0,
    currentMinPrice: fallbackPrice,
    recentPrice: 0,
    yDayAvgPrice: 0,
  };
}

async function fetchSlotAvatarPrice(apiKey: string, slot: string, className: string, targetGrade: string) {
  const categoryCode = AVATAR_CATEGORY_BY_SLOT[slot];
  if (!categoryCode) return null;

  try {
    const first = await fetchMarketPage(apiKey, categoryCode, 1);
    const pageSize = Number(first?.PageSize ?? 10) || 10;
    const totalCount = Number(first?.TotalCount ?? 0) || 0;
    const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    const maxPages = Math.min(pageCount, 160);

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = pageNo === 1 ? first : await fetchMarketPage(apiKey, categoryCode, pageNo);
      const items = Array.isArray(page?.Items) ? page.Items : Array.isArray(page?.items) ? page.items : [];
      const candidates = items
        .filter((row: any) => String(row?.Grade ?? row?.grade ?? "") === targetGrade)
        .filter((row: any) => getPickedPrice(row) > 0)
        .sort((a: any, b: any) => getPickedPrice(a) - getPickedPrice(b));

      const classHints = AVATAR_NAME_HINTS_BY_CLASS[className] ?? [];
      const hinted = candidates.find((row: any) => {
        const name = String(row?.Name ?? row?.name ?? "");
        return classHints.some((hint) => name.includes(hint));
      });
      if (hinted) {
        const itemId = Number(hinted?.Id ?? hinted?.id ?? 0) || 0;
        return {
          slot,
          className,
          targetGrade,
          itemName: String(hinted?.Name ?? hinted?.name ?? ""),
          itemId,
          ...readPrice(hinted),
        } satisfies AvatarPriceItem;
      }

      for (const row of candidates) {
        const itemId = Number(row?.Id ?? row?.id ?? 0) || 0;
        if (!itemId) continue;
        let matched = false;
        try {
          matched = await itemMatchesClass(apiKey, itemId, className);
        } catch {
          matched = false;
        }
        if (!matched) continue;
        return {
          slot,
          className,
          targetGrade,
          itemName: String(row?.Name ?? row?.name ?? ""),
          itemId,
          ...readPrice(row),
        } satisfies AvatarPriceItem;
      }
    }
  } catch {
    return fallbackAvatarPrice(slot, className, targetGrade);
  }

  return fallbackAvatarPrice(slot, className, targetGrade);
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
        detail: "공식 거래소 아바타 시세를 불러오려면 LOSTARK_API_KEY가 필요해.",
      });
    }

    const className = String(req.query.className || "").trim();
    if (!className) {
      return res.status(400).json({
        ok: false,
        error: "CLASS_NAME_REQUIRED",
        detail: "캐릭터 직업명이 필요해.",
      });
    }

    const targetGrade = String(req.query.grade || "전설").trim() || "전설";
    const slots = parseList(req.query.slots, ["무기", "머리", "상의", "하의"]);
    const results = await Promise.allSettled(slots.map((slot) => fetchSlotAvatarPrice(apiKey, slot, className, targetGrade)));
    const items = results
      .filter((result): result is PromiseFulfilledResult<AvatarPriceItem | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((item): item is AvatarPriceItem => Boolean(item));
    const warnings = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason?.message || result.reason));
    const pricesBySlot: Record<string, number> = {};
    const itemsBySlot: Record<string, AvatarPriceItem> = {};

    for (const item of items) {
      const pickedPrice = item.currentMinPrice || item.recentPrice || item.yDayAvgPrice || 0;
      if (pickedPrice > 0) pricesBySlot[item.slot] = pickedPrice;
      itemsBySlot[item.slot] = item;
    }

    return res.status(200).json({
      ok: true,
      source: "lostark-openapi-markets",
      sourceUrl: `${LOSTARK_API_BASE}/markets/items`,
      fetchedAt: new Date().toISOString(),
      className,
      targetGrade,
      pricesBySlot,
      itemsBySlot,
      missingSlots: slots.filter((slot) => !itemsBySlot[slot]),
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "AVATAR_MARKET_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
