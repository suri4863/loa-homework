import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ✅ CORS (로컬/다른 도메인에서 호출 시 preflight 통과)
  res.setHeader("Access-Control-Allow-Origin", (req.headers as any).origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-friend-code,x-nickname");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method !== "GET" && req.method !== "DELETE") {
      return res.status(405).send("Method Not Allowed");
    }

    const me = await getMe(req);

    // =========================
    // ✅ DELETE: 친구 삭제
    // - /api/friends?friendCode=FC_...
    // =========================
    if (req.method === "DELETE") {
      const friendCode = String((req.query as any)?.friendCode ?? "").trim();
      if (!friendCode) return res.status(400).send("Missing friendCode");

      const fr = await sql<{ id: number }>`select id from users where friend_code=${friendCode}`;
      if (!fr.rowCount) return res.status(404).send("Friend not found");

      const friendId = Number(fr.rows[0].id);
      const a = Math.min(Number(me.id), friendId);
      const b = Math.max(Number(me.id), friendId);

      await sql`delete from friendships where user_a=${a} and user_b=${b}`;

      return sendJson(res, { ok: true });
    }

    // ✅ GET: 친구 목록
    const rows = await sql<{ friendCode: string; nickname: string | null }>`
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
