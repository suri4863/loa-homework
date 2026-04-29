import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registerWithCredentials, sendError, sendJson } from "../../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const loginId = String(req.body?.loginId ?? "");
    const password = String(req.body?.password ?? "");
    const friendCode = String(req.body?.friendCode ?? "");
    const nickname = String(req.body?.nickname ?? "");

    const result = await registerWithCredentials({ loginId, password, friendCode, nickname });
    return sendJson(res, {
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: {
        friendCode: result.user.friend_code,
        nickname: result.user.nickname,
        shareMode: result.user.share_mode,
        legacyLoginAllowed: result.user.legacy_login_allowed !== false,
        loginId: result.user.login_id,
      },
    });
  } catch (e) {
    return sendError(res, e);
  }
}
