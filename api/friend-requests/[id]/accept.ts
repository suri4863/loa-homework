import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const me = await getMe(req);

    const id = Number(req.query.id);
    if (!id) return res.status(400).send("Invalid id");

    const fr = await sql<{ id: number; from_user_id: number; to_user_id: number; status: string }>`
      select id, from_user_id, to_user_id, status from friend_requests where id=${id}
    `;
    if (!fr.rowCount) return res.status(404).send("Not found");

    const row = fr.rows[0];
    if (Number(row.to_user_id) !== Number(me.id)) return res.status(403).send("Forbidden");
    if (row.status !== "PENDING") return res.status(409).send("Not pending");

    const a = Math.min(Number(row.from_user_id), Number(row.to_user_id));
    const b = Math.max(Number(row.from_user_id), Number(row.to_user_id));

    await sql`insert into friendships(user_a, user_b) values(${a}, ${b}) on conflict do nothing`;
    await sql`update friend_requests set status='ACCEPTED', responded_at=now() where id=${id}`;

    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
