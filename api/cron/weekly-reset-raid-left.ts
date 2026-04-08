import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { ensureSchema, sendError, sendJson } from "../../lib/_db.js";

type RaidLeftSnapshotRow = {
  charName: string;
  charItemLevel?: string;
  charPower?: string;
  charRole?: "DEALER" | "SUPPORT";
  tableName?: string;
  ilvl?: number;
  allRaids: string[];
  remainingRaids: string[];
  clearedCount: number;
  totalCount: number;
};

type RaidLeftSnapshotPayload = {
  version?: number;
  friendCode?: string;
  nickname?: string;
  shareMode?: "PUBLIC" | "PRIVATE" | string;
  exportedAt?: number;
  scope?: "ALL_TABLES" | "ONE_TABLE";
  data?: RaidLeftSnapshotRow[];
};

function getLatestWeeklyResetUtc(weekdayUtc: number, hourUtc: number): number {
  const now = new Date();

  const anchor = new Date(now);
  anchor.setUTCHours(hourUtc, 0, 0, 0);

  const currentDow = anchor.getUTCDay();
  const diff = currentDow - weekdayUtc;
  anchor.setUTCDate(anchor.getUTCDate() - diff);

  if (now.getTime() < anchor.getTime()) {
    anchor.setUTCDate(anchor.getUTCDate() - 7);
  }

  return anchor.getTime();
}

function parseSnapshot(snapshotJson: string): RaidLeftSnapshotPayload {
  const parsed = JSON.parse(snapshotJson ?? "{}");
  return {
    version: Number(parsed?.version ?? 2),
    friendCode: String(parsed?.friendCode ?? "").trim(),
    nickname: parsed?.nickname ? String(parsed.nickname) : undefined,
    shareMode: parsed?.shareMode === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    exportedAt:
      typeof parsed?.exportedAt === "number" ? parsed.exportedAt : 0,
    scope:
      parsed?.scope === "ONE_TABLE" ? "ONE_TABLE" : "ALL_TABLES",
    data: Array.isArray(parsed?.data)
      ? parsed.data.map((row: any) => ({
          charName: String(row?.charName ?? ""),
          charItemLevel:
            row?.charItemLevel != null ? String(row.charItemLevel) : undefined,
          charPower:
            row?.charPower != null ? String(row.charPower) : undefined,
          charRole: row?.charRole === "SUPPORT" ? "SUPPORT" : "DEALER",
          tableName:
            row?.tableName != null ? String(row.tableName) : undefined,
          ilvl:
            typeof row?.ilvl === "number" && Number.isFinite(row.ilvl)
              ? row.ilvl
              : undefined,
          allRaids: Array.isArray(row?.allRaids) ? row.allRaids : [],
          remainingRaids: Array.isArray(row?.remainingRaids)
            ? row.remainingRaids
            : [],
          clearedCount: Number(row?.clearedCount ?? 0),
          totalCount: Number(row?.totalCount ?? 0),
        }))
      : [],
  };
}

function normalizeSnapshotAfterWeeklyReset(
  snapshot: RaidLeftSnapshotPayload,
  latestWeeklyResetAt: number
): { changed: boolean; snapshot: RaidLeftSnapshotPayload } {
  const exportedAt = snapshot.exportedAt ?? 0;

  // 이미 이번 주 리셋 이후 시점이면 그대로 둠
  if (exportedAt >= latestWeeklyResetAt) {
    return { changed: false, snapshot };
  }

  const next: RaidLeftSnapshotPayload = {
    ...snapshot,
    version: 2,
    exportedAt: Date.now(),
    data: Array.isArray(snapshot.data)
      ? snapshot.data.map((row) => {
          const allRaids = Array.isArray(row.allRaids) ? row.allRaids : [];
          const fallbackRemaining = Array.isArray(row.remainingRaids)
            ? row.remainingRaids
            : [];
          const resetRaids = allRaids.length ? allRaids : fallbackRemaining;

          return {
            ...row,
            allRaids: [...allRaids],
            remainingRaids: [...resetRaids],
            clearedCount: 0,
            totalCount: resetRaids.length,
          };
        })
      : [],
  };

  return { changed: true, snapshot: next };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
      return res.status(500).send("Missing CRON_SECRET");
    }

    const authHeader = String(req.headers.authorization ?? "");
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return res.status(401).send("Unauthorized");
    }

    await ensureSchema();

    // 수요일 06:00 KST = 화요일 21:00 UTC
    const latestWeeklyResetAt = getLatestWeeklyResetUtc(2, 21);

    const rows = await sql<{
      user_id: number;
      snapshot_json: string;
      updated_at: string;
    }>`
      select user_id, snapshot_json, updated_at
      from raid_left_snapshots
    `;

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows.rows) {
      scanned += 1;

      try {
        const parsed = parseSnapshot(row.snapshot_json);
        const normalized = normalizeSnapshotAfterWeeklyReset(
          parsed,
          latestWeeklyResetAt
        );

        if (!normalized.changed) {
          skipped += 1;
          continue;
        }

        await sql`
          update raid_left_snapshots
          set
            snapshot_json = ${JSON.stringify(normalized.snapshot)},
            updated_at = now()
          where user_id = ${row.user_id}
        `;

        updated += 1;
      } catch (e) {
        failed += 1;
        console.error("weekly-reset-raid-left failed:", {
          userId: row.user_id,
          error: e,
        });
      }
    }

    return sendJson(res, {
      ok: true,
      latestWeeklyResetAt,
      scanned,
      updated,
      skipped,
      failed,
    });
  } catch (e) {
    return sendError(res, e);
  }
}