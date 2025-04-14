import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { apiKeysDb } from "../db/index.js";

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a new API key, replacing any existing ones
 * @returns The newly created API key (plaintext)
 */
export async function createApiKey(name: string = "API Key"): Promise<string> {
  try {
    // Delete all existing API keys
    apiKeysDb.deleteAll.run();

    // Generate a new API key
    const apiKey = generateApiKey();

    // Hash the API key for storage
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    const id = uuidv4();
    const now = Date.now();

    // Store the hashed key
    apiKeysDb.create.run(id, name, keyHash, now);

    return apiKey;
  } catch (error) {
    console.error("Error creating API key:", error);
    throw new Error("Failed to create API key");
  }
}

/**
 * Revokes all API keys
 */
export async function revokeAllApiKeys(): Promise<void> {
  try {
    apiKeysDb.deleteAll.run();
  } catch (error) {
    console.error("Error revoking API keys:", error);
    throw new Error("Failed to revoke API keys");
  }
}

/**
 * Checks if any API key exists
 * @returns True if at least one API key exists
 */
export function hasApiKey(): boolean {
  try {
    const result = apiKeysDb.count.get() as { count: number };
    return result.count > 0;
  } catch (error) {
    console.error("Error checking API keys:", error);
    return false;
  }
}

/**
 * Create initial API key if none exists
 * @returns The newly created API key (plaintext) if one was created, null otherwise
 */
export async function ensureApiKeyExists(): Promise<string | null> {
  try {
    // Check if any API keys exist
    if (!hasApiKey()) {
      // Generate a new API key
      const apiKey = await createApiKey("Default API Key");

      // Log the key for first-time setup
      console.log("\n=================================================");
      console.log("IMPORTANT: API Key Generated");
      console.log("=================================================");
      console.log("API Key: " + apiKey);
      console.log("This key will not be shown again. Store it securely.");
      console.log("=================================================\n");

      return apiKey;
    }

    return null;
  } catch (error) {
    console.error("Error ensuring API key exists:", error);
    return null;
  }
}
