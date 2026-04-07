import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await getMe(req);

    if (req.method === "GET") {
      const rows = await sql<{
        id: number;
        title: string;
        weekStartDate: string;
        scheduleJson: string;
        ownerFriendCode: string;
        targetFriendCode: string;
        updatedAt: string;
      }>`
        select
          s.id,
          s.title,
          s.week_start_date as "weekStartDate",
          s.schedule_json as "scheduleJson",
          u1.friend_code as "ownerFriendCode",
          u2.friend_code as "targetFriendCode",
          s.updated_at as "updatedAt"
        from shared_weekly_schedules s
        join users u1 on u1.id = s.owner_user_id
        join users u2 on u2.id = s.target_user_id
        where s.owner_user_id = ${me.id} or s.target_user_id = ${me.id}
        order by s.updated_at desc
      `;

      return sendJson(res, rows.rows);
    }

    if (req.method === "POST") {
      const targetFriendCode = String(req.body?.targetFriendCode ?? "").trim();
      const title = String(req.body?.title ?? "1주일 일정표").trim();
      const weekStartDate = String(req.body?.weekStartDate ?? "").trim();
      const scheduleJson = String(req.body?.scheduleJson ?? "").trim();

      if (!targetFriendCode) return res.status(400).send("Missing targetFriendCode");
      if (!weekStartDate) return res.status(400).send("Missing weekStartDate");
      if (!scheduleJson) return res.status(400).send("Missing scheduleJson");

      const targetUser = await sql<{ id: number }>`
        select id from users where friend_code=${targetFriendCode}
      `;
      if (!targetUser.rowCount) return res.status(404).send("Target user not found");

      const targetUserId = Number(targetUser.rows[0].id);

      const inserted = await sql<{ id: number }>`
        insert into shared_weekly_schedules (
          owner_user_id, target_user_id, title, week_start_date, schedule_json
        )
        values (
          ${me.id}, ${targetUserId}, ${title}, ${weekStartDate}, ${scheduleJson}
        )
        returning id
      `;

      return sendJson(res, { ok: true, id: inserted.rows[0].id });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return sendError(res, e);
  }
}