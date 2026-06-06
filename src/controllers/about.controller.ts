import { Request, Response } from "express";
import { AboutContent } from "../models/about-content.model";
import { Centre } from "../models/centre.model";
import { State } from "../models/state.model";

// GET - Public about page content with real stats injected
export const getAboutContent = async (_req: Request, res: Response) => {
  let content = await AboutContent.findOne().lean();
  if (!content) {
    // Create default and re-fetch
    await AboutContent.create({});
    content = await AboutContent.findOne().lean();
  }

  if (!content) {
    return res
      .status(404)
      .json({ success: false, message: "About content not found" });
  }

  // Inject real counts for stats that have useRealCount=true
  if (content.stats && content.stats.length > 0) {
    const enrichedStats = await Promise.all(
      content.stats.map(async (stat: any) => {
        if (!stat.useRealCount || !stat.countSource) return stat;

        let realValue = stat.value;
        try {
          switch (stat.countSource) {
            case "centres": {
              const count = await Centre.countDocuments({ isActive: true });
              realValue = count > 0 ? `${count}+` : stat.value;
              break;
            }
            case "states": {
              const count = await State.countDocuments({ isActive: true });
              realValue = count > 0 ? `${count}` : stat.value;
              break;
            }
            default:
              break;
          }
        } catch {
          // fallback to manual value
        }

        return { ...stat, value: realValue };
      }),
    );
    content.stats = enrichedStats;
  }

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = content;
};
