import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson, ensureBackupPassword } from "../_db.js";

/**
 * PUT  : 업로드 { password, stateJson }
 * POST : 다운로드 { password } -> { stateJson, updatedAt }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await getMe(req);

    if (req.method === "PUT") {
      const password = String(req.body?.password ?? "");
      const stateJson = String(req.body?.stateJson ?? "");
      if (!password) return res.status(400).send("Missing password");
      if (!stateJson) return res.status(400).send("Missing stateJson");

      await ensureBackupPassword(me.id, password);

      await sql`
        insert into state_backups(user_id, state_json)
        values(${me.id}, ${stateJson})
        on conflict (user_id)
        do update set state_json = excluded.state_json, updated_at = now()
      `;

      return sendJson(res, { ok: true });
    }

    if (req.method === "POST") {
      const password = String(req.body?.password ?? "");
      if (!password) return res.status(400).send("Missing password");

      await ensureBackupPassword(me.id, password);

      const row = await sql<{ state_json: string; updated_at: string }>`
        select state_json, updated_at
        from state_backups
        where user_id=${me.id}
      `;
      if (!row.rowCount) return res.status(404).send("No backup found");

      return sendJson(res, {
        ok: true,
        stateJson: row.rows[0].state_json,
        updatedAt: row.rows[0].updated_at,
      });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return sendError(res, e);
  }
}