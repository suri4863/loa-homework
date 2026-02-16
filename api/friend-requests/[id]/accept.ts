import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("METHOD=", req.method, "URL=", req.url);
  res.setHeader("x-method-debug", req.method || "none");

  // ✅ CORS (로컬/다른 도메인에서 호출 시 preflight 통과)
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-friend-code,x-nickname");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method !== "POST") {
      // ✅ 이게 보이면 "진짜 이 함수가 실행된 것" 확정
      return res.status(405).json({
        ok: false,
        error: "Method Not Allowed",
        method: req.method,
        url: req.url,
      });
    }

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
