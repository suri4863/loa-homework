import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const me = await getMe(req);
    const backup = await sql<{ updated_at: string }>`
      select updated_at
      from state_backups
      where user_id=${me.id}
    `;

    return sendJson(res, {
      ok: true,
      friendCode: me.friend_code,
      nickname: me.nickname,
      shareMode: me.share_mode,
      legacyLoginAllowed: me.legacy_login_allowed !== false,
      loginId: me.login_id ?? "",
      hasBackup: (backup.rowCount ?? 0) > 0,
      backupUpdatedAt: backup.rows[0]?.updated_at ?? null,
    });
  } catch (e) {
    return sendError(res, e);
  }
}
