import { Request, Response, NextFunction } from "express";
import { apiKeysDb } from "../db/index.js";
import crypto from "crypto";

/**
 * Middleware to verify API key from request headers
 */
export function verifyApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    return res.status(401).json({
      error: "Unauthorized",
      message:
        "Missing API key. Please provide an API key using the X-API-Key header.",
    });
  }

  // Hash the provided API key for comparison
  const hashedApiKey = crypto.createHash("sha256").update(apiKey).digest("hex");

  // Verify API key
  const keyData = apiKeysDb.getByHash.get(hashedApiKey) as any;

  if (!keyData) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API key.",
    });
  }

  // Update last used timestamp
  apiKeysDb.updateLastUsed.run(Date.now(), keyData.id);

  next();
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
