import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const me = await getMe(req);

    const toFriendCode = String(req.body?.toFriendCode ?? "").trim();
    if (!toFriendCode) return res.status(400).send("Missing toFriendCode");
    if (toFriendCode === me.friend_code) return res.status(400).send("Cannot friend yourself");

    const toUser = await sql<{ id: number }>`select id from users where friend_code=${toFriendCode}`;
    if (!toUser.rowCount) return res.status(404).send("User not found");

    const toUserId = Number(toUser.rows[0].id);

    // 이미 친구인지 체크
    const a = Math.min(Number(me.id), toUserId);
    const b = Math.max(Number(me.id), toUserId);
    const already = await sql`select id from friendships where user_a=${a} and user_b=${b}`;
    if (already.rowCount) return res.status(409).send("Already friends");

    // pending 중복은 유니크 인덱스로 방지
    try {
      await sql`
        insert into friend_requests(from_user_id, to_user_id, status)
        values(${me.id}, ${toUserId}, 'PENDING')
      `;
    } catch (e: any) {
      return res.status(409).send("Request already exists");
    }

    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
