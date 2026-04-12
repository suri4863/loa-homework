import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  const friendCode = String(req.query.friendCode ?? "").trim();
  if (!friendCode) return res.status(400).send("friendCode required");

  const { rows } = await sql`
    select friend_code, nickname, plan_json, updated_at
    from friend_raid_plans
    where friend_code = ${friendCode}
    limit 1
  `;

  if (!rows.length) return res.status(404).send("Not found");

  return res.status(200).json(rows[0]);
}