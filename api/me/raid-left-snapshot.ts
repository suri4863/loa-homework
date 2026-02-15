import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");

    const me = await getMe(req);
    const snapshotJson = String(req.body?.snapshotJson ?? "");

    if (!snapshotJson) return res.status(400).send("Missing snapshotJson");

    await sql`
      insert into raid_left_snapshots(user_id, snapshot_json)
      values(${me.id}, ${snapshotJson})
      on conflict (user_id)
      do update set snapshot_json = excluded.snapshot_json, updated_at = now()
    `;

    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
