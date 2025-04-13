import path from "path";
import { fileURLToPath } from "url";

// Server configuration
import { configDb } from "../db/index.js"; // Import DB access

// --- Bootstrap Configuration (Needed before DB access) ---
export const DEFAULT_PORT = 3000;
export const DEFAULT_API_BIND_ADDR = "0.0.0.0"; // Default bind address

// Database configuration
// Database configuration (relative path is usually fine)
export const DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/tunnels.db"
);

// --- Operational Configuration (Read from Database) ---

// Helper to read from DB, assumes key exists due to initialization
function getConfigValue(key: string): string {
  const row = configDb.get.get(key) as { value: string } | undefined;
  if (!row) {
    // This should ideally not happen if DB init works
    throw new Error(`Configuration key "${key}" not found in database.`);
  }
  return row.value;
}

export function getWgInterface(): string {
  // WG_INTERFACE is often static, but could be configurable
  return getConfigValue("WG_INTERFACE") || "wg0"; // Read or default
}

export function getWgServerIp(): string {
  return getConfigValue("WG_SERVER_IP");
}

export function getWgClientIpRange(): string {
  return getConfigValue("WG_CLIENT_IP_RANGE");
}

export function getWgClientIpStartEnd(): { start: string; end: string } {
  const range = getWgClientIpRange();
  const [start, end] = range.split("-");
  if (!start || !end) {
    throw new Error(`Invalid WG_CLIENT_IP_RANGE format: ${range}`);
  }
  return { start, end };
}

export function getNginxSitesPath(): string {
  // Could also be stored in DB, or keep as env/default
  return process.env.NGINX_SITES_PATH || "/etc/nginx/sites-enabled";
}

export function getBaseDomain(): string {
  return getConfigValue("BASE_DOMAIN");
}

// API configuration (can remain static)
export const API_PREFIX = "/api";
export const API_VERSION = "v1";
export const API_BASE_PATH = `${API_PREFIX}/${API_VERSION}`;

// API bind address uses bootstrap default
export const API_BIND_ADDR = DEFAULT_API_BIND_ADDR;

// Function to get all operational config needed by services
// Ensures values are read after DB is initialized
export function getOperationalConfig() {
  const { start: wgClientIpStart, end: wgClientIpEnd } =
    getWgClientIpStartEnd();
  return {
    WG_INTERFACE: getWgInterface(),
    WG_SERVER_IP: getWgServerIp(),
    WG_CLIENT_IP_RANGE: getWgClientIpRange(),
    WG_CLIENT_IP_START: wgClientIpStart,
    WG_CLIENT_IP_END: wgClientIpEnd,
    NGINX_SITES_PATH: getNginxSitesPath(),
    BASE_DOMAIN: getBaseDomain(),
  };
}

// Removed duplicate export of API_BIND_ADDR
