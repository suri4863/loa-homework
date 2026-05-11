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

function parseNames(input: unknown) {
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((name) => name.trim())
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

async function fetchAllEngravingBooks(apiKey: string) {
  const first = await lostarkFetch(apiKey, "/markets/items", {
    method: "POST",
    body: JSON.stringify({
      CategoryCode: ENGRAVING_CATEGORY_CODE,
      PageNo: 1,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "ASC",
    }),
  });
  const pageSize = Number(first?.PageSize ?? 10) || 10;
  const totalCount = Number(first?.TotalCount ?? 0) || 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const pages = [first];

  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    pages.push(
      await lostarkFetch(apiKey, "/markets/items", {
        method: "POST",
        body: JSON.stringify({
          CategoryCode: ENGRAVING_CATEGORY_CODE,
          PageNo: pageNo,
          Sort: "CURRENT_MIN_PRICE",
          SortCondition: "ASC",
        }),
      })
    );
  }

  return pages.flatMap((page) => (Array.isArray(page?.Items) ? page.Items : Array.isArray(page?.items) ? page.items : []));
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
        detail: "공식 거래소 각인서 시세를 불러오려면 LOSTARK_API_KEY가 필요해.",
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
    const books = await fetchAllEngravingBooks(apiKey);
    const pricesByName: Record<string, number> = {};
    const itemsByName: Record<string, EngravingPriceItem> = {};

    for (const name of names) {
      const expectedName = `${grade} ${name} 각인서`;
      const found =
        books.find((row: any) => String(row?.Name ?? row?.name ?? "") === expectedName) ??
        books.find((row: any) => String(row?.Name ?? row?.name ?? "").includes(name) && String(row?.Grade ?? row?.grade ?? "") === grade);
      if (!found) continue;
      const price = readPrice(found);
      const item: EngravingPriceItem = {
        name,
        grade,
        itemName: String(found?.Name ?? found?.name ?? expectedName),
        ...price,
      };
      const pickedPrice = price.currentMinPrice || price.recentPrice || price.yDayAvgPrice || 0;
      if (pickedPrice > 0) pricesByName[name] = pickedPrice;
      itemsByName[name] = item;
    }

    return res.status(200).json({
      ok: true,
      source: "lostark-openapi-markets",
      sourceUrl: `${LOSTARK_API_BASE}/markets/items`,
      fetchedAt: new Date().toISOString(),
      grade,
      pricesByName,
      itemsByName,
      missingNames: names.filter((name) => !itemsByName[name]),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "ENGRAVING_MARKET_PRICE_FETCH_FAILED",
      detail: error?.message || String(error),
    });
  }
}
