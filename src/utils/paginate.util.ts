import { Request } from "express";

interface PaginateOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

interface PaginateResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Extract page/limit from query params with defaults and bounds.
 */
export const getPaginationParams = (
  req: Request,
  opts: PaginateOptions = {},
) => {
  const { defaultLimit = 20, maxLimit = 100 } = opts;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(req.query.limit) || defaultLimit),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Run a paginated Mongoose query.
 * Returns { items, pagination: { page, limit, total, pages } }
 */
export const paginate = async <T>(
  model: any,
  filter: Record<string, any>,
  req: Request,
  sort: Record<string, number> = { createdAt: -1 },
  populateFields?: any[],
  opts: PaginateOptions = {},
): Promise<PaginateResult<T>> => {
  const { page, limit, skip } = getPaginationParams(req, opts);

  let query = model.find(filter).sort(sort).skip(skip).limit(limit);

  if (populateFields) {
    for (const p of populateFields) {
      query = query.populate(p);
    }
  }

  const [items, total] = await Promise.all([
    query.lean(),
    model.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};
