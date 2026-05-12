import type { VercelRequest, VercelResponse } from "@vercel/node";
import accessoryPrices from "../../lib/server/growth/accessory-prices";
import avatarPrices from "../../lib/server/growth/avatar-prices";
import engravingPrices from "../../lib/server/growth/engraving-prices";
import gemPrices from "../../lib/server/growth/gem-prices";

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<unknown>> = {
  "accessory-prices": accessoryPrices,
  "avatar-prices": avatarPrices,
  "engraving-prices": engravingPrices,
  "gem-prices": gemPrices,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const kind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
  const selected = kind ? handlers[String(kind)] : null;

  if (!selected) {
    return res.status(404).json({ ok: false, error: "GROWTH_API_NOT_FOUND" });
  }

  return selected(req, res);
}
