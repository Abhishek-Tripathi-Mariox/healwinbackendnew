import { Request, Response } from "express";
import {
  LegalDocument,
  LEGAL_DOC_TYPES,
  LEGAL_AUDIENCES,
} from "../models/legal-document.model";

/**
 * Public legal/info content endpoint consumed by the patient + driver
 * apps. No auth required — these pages are publicly shareable.
 *
 * Returns an empty-body stub instead of 404 when the admin hasn't
 * authored a given cell yet, so the apps can render "Content coming
 * soon" rather than treat it as a broken endpoint.
 */
export const getPublicLegalDocument = async (
  req: Request,
  res: Response,
) => {
  const type = String(req.params.type || "").toUpperCase();
  const audience = String(req.params.audience || "").toUpperCase();

  if (!(LEGAL_DOC_TYPES as string[]).includes(type)) {
    res.status(400).json({
      code: 0,
      message: "invalid_type",
      data: {},
    });
    return;
  }
  if (!(LEGAL_AUDIENCES as string[]).includes(audience)) {
    res.status(400).json({
      code: 0,
      message: "invalid_audience",
      data: {},
    });
    return;
  }

  const doc = await LegalDocument.findOne({ type, audience } as any)
    .select("type audience title content version updatedAt")
    .lean();

  res.locals.data = doc || {
    type,
    audience,
    title: "",
    content: "",
    version: 0,
    updatedAt: null,
  };
};
