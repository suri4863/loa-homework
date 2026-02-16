import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const me = await getMe(req);

    const id = Number(req.query.id);
    if (!id) return res.status(400).send("Invalid id");

    const fr = await sql<{ id: number; to_user_id: number; status: string }>`
      select id, to_user_id, status from friend_requests where id=${id}
    `;
    if (!fr.rowCount) return res.status(404).send("Not found");

    const row = fr.rows[0];
    if (Number(row.to_user_id) !== Number(me.id)) return res.status(403).send("Forbidden");
    if (row.status !== "PENDING") return res.status(409).send("Not pending");

    await sql`update friend_requests set status='REJECTED', responded_at=now() where id=${id}`;
    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
