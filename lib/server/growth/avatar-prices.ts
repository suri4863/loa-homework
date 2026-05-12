import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const LEGENDARY_AVATAR_SLOT_FALLBACK_PRICE = 200000;

const AVATAR_CATEGORY_BY_SLOT: Record<string, number> = {
  무기: 20005,
  머리: 20010,
  상의: 20050,
  하의: 20060,
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
  fallback?: boolean;
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
    await delay(1200 + attempt * 1600);
  }
  throw lastError ?? new Error("LOSTARK_API_FAILED");
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
    .replace(/&[a-z_]+;?/gi, " ")
    .replace(/[{}[\]",]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readItems(data: any) {
  return Array.isArray(data?.Items) ? data.Items : Array.isArray(data?.items) ? data.items : [];
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

function fallbackAvatarPrice(slot: string, className: string, targetGrade: string): AvatarPriceItem {
  return {
    slot,
    className,
    targetGrade,
    itemName: `${className || "직업"} ${targetGrade} ${slot} 아바타 기준가`,
    itemId: 0,
    currentMinPrice: LEGENDARY_AVATAR_SLOT_FALLBACK_PRICE,
    recentPrice: 0,
    yDayAvgPrice: 0,
    fallback: true,
  };
}

async function searchAvatarPage(apiKey: string, categoryCode: number, itemName: string) {
  const data = await lostarkFetch(apiKey, "/markets/items", {
    method: "POST",
    body: JSON.stringify({
      CategoryCode: categoryCode,
      ItemName: itemName,
      PageNo: 1,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "ASC",
    }),
  });
  return readItems(data);
}

async function itemMatchesClass(apiKey: string, itemId: number, className: string) {
  if (!className || !itemId) return true;
  const detail = await lostarkFetch(apiKey, `/markets/items/${itemId}`);
  const rows = Array.isArray(detail) ? detail : Array.isArray(detail?.value) ? detail.value : [];
  const tooltip = rows.map((row: any) => stripTooltip(row?.ToolTip ?? row?.toolTip ?? "")).join(" ");
  return tooltip.includes(className);
}

async function fetchSlotAvatarPrice(apiKey: string, slot: string, className: string, targetGrade: string) {
  const categoryCode = AVATAR_CATEGORY_BY_SLOT[slot];
  if (!categoryCode) return fallbackAvatarPrice(slot, className, targetGrade);

  const queries = [`${targetGrade} ${slot} 아바타`, `${slot} 아바타`];
  const candidates: any[] = [];
  for (const query of queries) {
    try {
      const rows = await searchAvatarPage(apiKey, categoryCode, query);
      candidates.push(...rows);
    } catch (error: any) {
      if (String(error?.message || "").includes("LOSTARK_API_429")) throw error;
    }
    await delay(250);
  }

  const unique = new Map<string, any>();
  candidates.forEach((row) => {
    const id = String(row?.Id ?? row?.id ?? row?.Name ?? row?.name ?? "");
    if (id) unique.set(id, row);
  });

  const sorted = Array.from(unique.values())
    .filter((row: any) => String(row?.Grade ?? row?.grade ?? "") === targetGrade)
    .filter((row: any) => getPickedPrice(row) > 0)
    .sort((a: any, b: any) => getPickedPrice(a) - getPickedPrice(b))
    .slice(0, 12);

  for (const row of sorted) {
    const itemId = Number(row?.Id ?? row?.id ?? 0) || 0;
    try {
      if (!(await itemMatchesClass(apiKey, itemId, className))) continue;
    } catch {
      continue;
    }
    return {
      slot,
      className,
      targetGrade,
      itemName: String(row?.Name ?? row?.name ?? `${targetGrade} ${slot} 아바타`),
      itemId,
      ...readPrice(row),
    } satisfies AvatarPriceItem;
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
    const items: AvatarPriceItem[] = [];
    const warnings: string[] = [];

    for (const slot of slots) {
      try {
        items.push(await fetchSlotAvatarPrice(apiKey, slot, className, targetGrade));
      } catch (error: any) {
        const message = String(error?.message || error);
        warnings.push(`${slot}: ${message}`);
        items.push(fallbackAvatarPrice(slot, className, targetGrade));
        if (message.includes("LOSTARK_API_429")) break;
      }
      await delay(350);
    }

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
