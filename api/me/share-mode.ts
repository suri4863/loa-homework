import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");

    const me = await getMe(req);
    const shareMode = req.body?.shareMode;

    if (shareMode !== "PUBLIC" && shareMode !== "PRIVATE") {
      return res.status(400).send("Invalid shareMode");
    }

    await sql`update users set share_mode=${shareMode} where id=${me.id}`;
    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
