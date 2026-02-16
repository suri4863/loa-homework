import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");

    const me = await getMe(req);
    const nickname = String(req.body?.nickname ?? "").trim();

    await sql`update users set nickname=${nickname} where id=${me.id}`;
    return sendJson(res, { ok: true, nickname });
  } catch (e) {
    return sendError(res, e);
  }
}
