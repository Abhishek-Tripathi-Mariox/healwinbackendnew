import { Router, Request, Response } from "express";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import { searchPlaces, resolvePlace } from "../services/geocode.service";

/**
 * Admin geocoding helpers — address autocomplete + resolve to coordinates —
 * for forms that need a location (e.g. adding a centre/hospital/pharmacy in the
 * Centre Locator). Uses the SERVER Google key. Mounted at /admin/geocode.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/search", auth.verifyAdminToken, async (req: Request, res: Response) => {
  const q = String(req.query.q || "");
  res.json({ code: 1, message: "ok", data: await searchPlaces(q) });
});

router.get("/resolve", auth.verifyAdminToken, async (req: Request, res: Response) => {
  const placeId = req.query.placeId ? String(req.query.placeId) : undefined;
  const description = req.query.description ? String(req.query.description) : undefined;
  res.json({ code: 1, message: "ok", data: await resolvePlace({ placeId, description }) });
});

export default router;
