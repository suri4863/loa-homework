import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe } from "../../lib/_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await getMe(req);

    if (req.method === "PUT") {
      const { nickname, planJson } = req.body ?? {};
      const friendCode = me.friend_code;

      console.log("raid-plan PUT", {
        friendCode,
        nicknameLength: String(nickname ?? "").length,
        planJsonLength: String(planJson ?? "").length,
      });

      await sql`
        insert into friend_raid_plans (friend_code, nickname, plan_json, updated_at)
        values (${friendCode}, ${nickname ?? ""}, ${planJson}, now())
        on conflict (friend_code)
        do update set
          nickname = excluded.nickname,
          plan_json = excluded.plan_json,
          updated_at = now()
      `;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (error) {
    console.error("raid-plan ERROR:", error);
    return res.status(500).json({
      ok: false,
      error: String(error),
    });
  }
}