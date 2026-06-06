import { Request, Response } from "express";
import {
  LegalDocument,
  LEGAL_DOC_TYPES,
  LEGAL_AUDIENCES,
  LegalDocType,
  LegalAudience,
} from "../../models/legal-document.model";
import { invalidateCache } from "../../middlewares/cache.middleware";

const isValidType = (v: any): v is LegalDocType =>
  LEGAL_DOC_TYPES.includes(v);
const isValidAudience = (v: any): v is LegalAudience =>
  LEGAL_AUDIENCES.includes(v);

/**
 * List every (type, audience) cell so the admin page can render the
 * grid with last-edited timestamps even for slots that haven't been
 * created yet. Missing cells are returned as `null` content rather than
 * a 404 — the admin shows them as "Not set" and the editor pre-fills
 * with an empty textarea.
 */
export const listLegalDocuments = async (
  _req: Request,
  res: Response,
) => {
  const docs = await LegalDocument.find()
    .populate("updatedBy", "name email")
    .lean();

  // Index by `${type}:${audience}` for cheap lookups in the response shape.
  const byKey: Record<string, any> = {};
  for (const d of docs) {
    byKey[`${d.type}:${d.audience}`] = d;
  }

  const cells: any[] = [];
  for (const type of LEGAL_DOC_TYPES) {
    for (const audience of LEGAL_AUDIENCES) {
      const existing = byKey[`${type}:${audience}`];
      cells.push({
        type,
        audience,
        title: existing?.title ?? "",
        content: existing?.content ?? "",
        version: existing?.version ?? 0,
        updatedAt: existing?.updatedAt ?? null,
        updatedBy: existing?.updatedBy ?? null,
        exists: !!existing,
      });
    }
  }

  res.locals.data = { items: cells };
};

/**
 * Fetch a single cell. Returns the document if it exists, or a stub
 * with empty content so the editor can start filling it in.
 */
export const getLegalDocument = async (
  req: Request,
  res: Response,
) => {
  const { type, audience } = req.params;
  if (!isValidType(type) || !isValidAudience(audience)) {
    res.status(400).json({
      code: 0,
      message: "invalid_type_or_audience",
      data: {},
    });
    return;
  }
  const doc = await LegalDocument.findOne({ type, audience })
    .populate("updatedBy", "name email")
    .lean();
  res.locals.data = doc || {
    type,
    audience,
    title: "",
    content: "",
    version: 0,
    exists: false,
  };
};

/**
 * Upsert a cell. Increments `version` on every save so apps can detect
 * a new T&C without a content diff.
 */
export const upsertLegalDocument = async (
  req: Request,
  res: Response,
) => {
  const { type, audience } = req.params;
  if (!isValidType(type) || !isValidAudience(audience)) {
    res.status(400).json({
      code: 0,
      message: "invalid_type_or_audience",
      data: {},
    });
    return;
  }
  const { title, content } = req.body || {};
  if (typeof content !== "string") {
    res.status(400).json({
      code: 0,
      message: "content_required",
      data: {},
    });
    return;
  }
  const adminId = (req as any).admin?._id || (req as any).admin?.id;

  const updated = await LegalDocument.findOneAndUpdate(
    { type, audience },
    {
      $set: {
        title: typeof title === "string" ? title : "",
        content,
        updatedBy: adminId,
      },
      $inc: { version: 1 },
      $setOnInsert: { type, audience },
    },
    { returnDocument: "after", upsert: true, runValidators: true },
  ).populate("updatedBy", "name email");

  // Bust the public-cache entry for this cell so the apps see the new
  // content on the very next fetch, not after the 5-min TTL expires.
  // The cache middleware keys requests by `req.baseUrl + req.path`, so
  // for our public router mounted at /v1/api/legal the keys look like
  // `api:/v1/api/legal/ABOUT/DRIVER`. The pattern MUST include the
  // /v1/api prefix or delPattern matches nothing and the cache lingers
  // for the full 5-min TTL — exactly the symptom that surfaced as
  // "still showing Content coming soon after Save" in the driver app.
  await invalidateCache("/v1/api/legal");

  res.locals.data = updated;
};
