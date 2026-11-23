export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Bitte melden Sie sich an.") => new ApiError(401, msg, "unauthorized");
export const forbidden = (msg = "Dafür fehlen Ihnen die Rechte.") => new ApiError(403, msg, "forbidden");
export const notFound = (msg = "Datensatz nicht gefunden.") => new ApiError(404, msg, "not_found");
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, "bad_request", details);
export const tooManyRequests = (msg: string) => new ApiError(429, msg, "rate_limited");

/** Optimistische Sperre: Datensatz wurde zwischenzeitlich geändert */
export const conflict = (msg = "Der Datensatz wurde inzwischen von jemand anderem geändert. Bitte neu laden und erneut versuchen.", details?: unknown) =>
  new ApiError(409, msg, "conflict", details);
