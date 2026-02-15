import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    const me = await getMe(req);

    const rows = await sql<{ id: number; fromFriendCode: string; createdAt: string }>`
      select fr.id,
             u.friend_code as "fromFriendCode",
             fr.created_at as "createdAt"
      from friend_requests fr
      join users u on u.id = fr.from_user_id
      where fr.to_user_id = ${me.id}
        and fr.status = 'PENDING'
      order by fr.created_at desc
    `;

    return sendJson(res, rows.rows);
  } catch (e) {
    return sendError(res, e);
  }
}
