import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "./_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const me = await getMe(req);
    const friendCode = String(req.query.friendCode ?? "").trim();
    if (!friendCode) return res.status(400).send("Missing friendCode");

    const target = await sql<{ id: number; share_mode: string }>`
      select id, share_mode from users where friend_code=${friendCode}
    `;
    if (!target.rowCount) return res.status(404).send("User not found");

    const targetId = Number(target.rows[0].id);
    const shareMode = String(target.rows[0].share_mode);

    if (shareMode === "PRIVATE") {
      const a = Math.min(Number(me.id), targetId);
      const b = Math.max(Number(me.id), targetId);
      const rel = await sql`select id from friendships where user_a=${a} and user_b=${b}`;
      if (!rel.rowCount) return res.status(403).send("Forbidden");
    }

    const snap = await sql<{ snapshot_json: string }>`
      select snapshot_json from raid_left_snapshots where user_id=${targetId}
    `;
    if (!snap.rowCount) return res.status(404).send("No snapshot");

    return sendJson(res, { snapshotJson: snap.rows[0].snapshot_json });
  } catch (e) {
    return sendError(res, e);
  }
}
