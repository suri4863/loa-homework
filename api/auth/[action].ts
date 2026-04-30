import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  deleteAccountWithPassword,
  loginWithCredentials,
  logoutWithSession,
  registerWithCredentials,
  requireAuthUser,
  sendError,
  sendJson,
  updateLoginPassword,
} from "../../lib/_db.js";

function getAction(req: VercelRequest) {
  const action = req.query.action;
  return Array.isArray(action) ? action[0] : String(action ?? "");
}

function authUserPayload(
  result:
    | Awaited<ReturnType<typeof loginWithCredentials>>
    | Awaited<ReturnType<typeof registerWithCredentials>>
) {
  return {
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const action = getAction(req);

    if (action === "login") {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const loginId = String(req.body?.loginId ?? "");
      const password = String(req.body?.password ?? "");
      const result = await loginWithCredentials(loginId, password);
      return sendJson(res, authUserPayload(result));
    }

    if (action === "register") {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const loginId = String(req.body?.loginId ?? "");
      const password = String(req.body?.password ?? "");
      const friendCode = String(req.body?.friendCode ?? "");
      const nickname = String(req.body?.nickname ?? "");
      const result = await registerWithCredentials({ loginId, password, friendCode, nickname });
      return sendJson(res, authUserPayload(result));
    }

    if (action === "logout") {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      await logoutWithSession(req);
      return sendJson(res, { ok: true });
    }

    if (action === "password") {
      if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");
      const user = await requireAuthUser(req);
      const password = String(req.body?.password ?? "");
      await updateLoginPassword(user.id, password);
      return sendJson(res, { ok: true });
    }

    if (action === "delete-account") {
      if (req.method !== "DELETE") return res.status(405).send("Method Not Allowed");
      const password = String(req.body?.password ?? "");
      await deleteAccountWithPassword(req, password);
      return sendJson(res, { ok: true });
    }

    return res.status(404).send("Not Found");
  } catch (e) {
    return sendError(res, e);
  }
}
