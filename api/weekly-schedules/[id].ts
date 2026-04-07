import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe, sendError, sendJson } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await getMe(req);
    const id = Number(req.query.id);

    if (!id) return res.status(400).send("Invalid id");

    const found = await sql<{
      id: number;
      owner_user_id: number;
      target_user_id: number;
      title: string;
      week_start_date: string;
      schedule_json: string;
      updated_at: string;
    }>`
      select *
      from shared_weekly_schedules
      where id = ${id}
    `;

    if (!found.rowCount) return res.status(404).send("Not found");

    const row = found.rows[0];

    if (
      Number(row.owner_user_id) !== Number(me.id) &&
      Number(row.target_user_id) !== Number(me.id)
    ) {
      return res.status(403).send("Forbidden");
    }

    if (req.method === "GET") {
      return sendJson(res, row);
    }

    if (req.method === "PUT") {
      const title = String(req.body?.title ?? row.title).trim();
      const weekStartDate = String(req.body?.weekStartDate ?? row.week_start_date).trim();
      const scheduleJson = String(req.body?.scheduleJson ?? row.schedule_json).trim();

      if (!title) return res.status(400).send("Missing title");
      if (!weekStartDate) return res.status(400).send("Missing weekStartDate");
      if (!scheduleJson) return res.status(400).send("Missing scheduleJson");

      await sql`
        update shared_weekly_schedules
        set
          title = ${title},
          week_start_date = ${weekStartDate},
          schedule_json = ${scheduleJson},
          updated_at = now()
        where id = ${id}
      `;

      return sendJson(res, { ok: true });
    }

    if (req.method === "DELETE") {
      await sql`
        delete from shared_weekly_schedules
        where id = ${id}
      `;

      return sendJson(res, { ok: true });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return sendError(res, e);
  }
}