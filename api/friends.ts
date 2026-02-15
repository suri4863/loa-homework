import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "./_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    const me = await getMe(req);

    const rows = await sql<{
      friendCode: string;
      nickname: string | null;
    }>`
      select
        case when f.user_a = ${me.id} then u2.friend_code else u1.friend_code end as "friendCode",
        case when f.user_a = ${me.id} then u2.nickname else u1.nickname end as "nickname"
      from friendships f
      join users u1 on u1.id = f.user_a
      join users u2 on u2.id = f.user_b
      where f.user_a = ${me.id} or f.user_b = ${me.id}
      order by f.created_at desc
    `;

    return sendJson(res, rows.rows);
  } catch (e) {
    return sendError(res, e);
  }
}
