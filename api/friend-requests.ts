import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-friend-code,x-nickname");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const me = await getMe(req);

    // =========================
    // GET: 받은 친구 요청 목록
    // /api/friend-requests?type=incoming
    // =========================
    if (req.method === "GET") {
      const type = String(req.query.type ?? "").trim();

      if (type !== "incoming") {
        return res.status(400).send("Invalid type");
      }

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
    }

    // =========================
    // POST
    // 1) 요청 보내기   /api/friend-requests?action=create
    // 2) 요청 수락     /api/friend-requests?action=accept&id=1
    // 3) 요청 거절     /api/friend-requests?action=reject&id=1
    // =========================
    if (req.method === "POST") {
      const action = String(req.query.action ?? "").trim();

      // 요청 보내기
      if (action === "create") {
        const toFriendCode = String(req.body?.toFriendCode ?? "").trim();
        if (!toFriendCode) return res.status(400).send("Missing toFriendCode");
        if (toFriendCode === me.friend_code) return res.status(400).send("Cannot friend yourself");

        const toUser = await sql<{ id: number }>`
          select id from users where friend_code=${toFriendCode}
        `;
        if (!toUser.rowCount) return res.status(404).send("User not found");

        const toUserId = Number(toUser.rows[0].id);

        const a = Math.min(Number(me.id), toUserId);
        const b = Math.max(Number(me.id), toUserId);
        const already = await sql`
          select id from friendships where user_a=${a} and user_b=${b}
        `;
        if (already.rowCount) return res.status(409).send("Already friends");

        try {
          await sql`
            insert into friend_requests(from_user_id, to_user_id, status)
            values(${me.id}, ${toUserId}, 'PENDING')
          `;
        } catch {
          return res.status(409).send("Request already exists");
        }

        return sendJson(res, { ok: true });
      }

      // 수락 / 거절
      if (action === "accept" || action === "reject") {
        const id = Number(req.query.id);
        if (!id) return res.status(400).send("Invalid id");

        const fr = await sql<{
          id: number;
          from_user_id: number;
          to_user_id: number;
          status: string;
        }>`
          select id, from_user_id, to_user_id, status
          from friend_requests
          where id=${id}
        `;
        if (!fr.rowCount) return res.status(404).send("Not found");

        const row = fr.rows[0];
        if (Number(row.to_user_id) !== Number(me.id)) return res.status(403).send("Forbidden");
        if (row.status !== "PENDING") return res.status(409).send("Not pending");

        if (action === "accept") {
          const a = Math.min(Number(row.from_user_id), Number(row.to_user_id));
          const b = Math.max(Number(row.from_user_id), Number(row.to_user_id));

          await sql`
            insert into friendships(user_a, user_b)
            values(${a}, ${b})
            on conflict do nothing
          `;

          await sql`
            update friend_requests
            set status='ACCEPTED', responded_at=now()
            where id=${id}
          `;

          return sendJson(res, { ok: true });
        }

        if (action === "reject") {
          await sql`
            update friend_requests
            set status='REJECTED', responded_at=now()
            where id=${id}
          `;

          return sendJson(res, { ok: true });
        }
      }

      return res.status(400).send("Invalid action");
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return sendError(res, e);
  }
}