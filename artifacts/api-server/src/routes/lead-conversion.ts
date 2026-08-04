import { Router } from "express";
import { getAuth } from "@clerk/express";
import { updateLeadConversionStage } from "../services/lead-conversion";

const router = Router();

router.patch("/leads/:id/conversion", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const body = req.body as { stage?: unknown; note?: unknown };
    const result = await updateLeadConversionStage(req.params.id, body.stage, body.note);
    if (result.status === "not_found") { res.status(404).json({ error: result.error }); return; }
    if (result.status === "invalid") { res.status(422).json({ error: result.error }); return; }
    res.json({ action: "conversion_updated", lead: result.lead });
  } catch {
    res.status(500).json({ error: "conversion_update_unavailable" });
  }
});

export default router;
