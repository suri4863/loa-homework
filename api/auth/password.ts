import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuthUser, sendError, sendJson, updateLoginPassword } from "../../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");

    const user = await requireAuthUser(req);
    const password = String(req.body?.password ?? "");
    await updateLoginPassword(user.id, password);

    return sendJson(res, { ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
