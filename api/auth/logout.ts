import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logoutWithSession, sendError, sendJson } from "../../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    await logoutWithSession(req);
    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
