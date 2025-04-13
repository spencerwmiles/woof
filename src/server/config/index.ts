import path from "path";
import { fileURLToPath } from "url";

// Server configuration
// Server configuration Defaults (can be overridden via CLI options for `woof server start`)
export const DEFAULT_PORT = 3000;
export const DEFAULT_WG_SERVER_IP = "10.8.0.1";
export const DEFAULT_WG_CLIENT_IP_RANGE = "10.8.0.2-10.8.0.254";
export const DEFAULT_BASE_DOMAIN = "woof.tunnels.dev"; // Example default
export const DEFAULT_API_BIND_ADDR = "0.0.0.0";
export const NODE_ENV = process.env.NODE_ENV || "development"; // Keep NODE_ENV for now
export const IS_PRODUCTION = NODE_ENV === "production";

// Database configuration
// Database configuration (relative path is usually fine)
export const DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/tunnels.db"
);

// WireGuard configuration
export const WG_INTERFACE = "wg0"; // Usually fixed
// WG_SERVER_IP and WG_CLIENT_IP_RANGE use defaults defined above
export const WG_SERVER_IP = DEFAULT_WG_SERVER_IP;
export const WG_CLIENT_IP_RANGE = DEFAULT_WG_CLIENT_IP_RANGE;

// Parse the client IP range
const [rangeStart, rangeEnd] = WG_CLIENT_IP_RANGE.split("-");
export const WG_CLIENT_IP_START = rangeStart;
export const WG_CLIENT_IP_END = rangeEnd;

// Nginx configuration
export const NGINX_SITES_PATH = "/etc/nginx/sites-enabled"; // Common default
// BASE_DOMAIN uses default defined above
export const BASE_DOMAIN = DEFAULT_BASE_DOMAIN;
// API configuration
export const API_PREFIX = "/api";
export const API_VERSION = "v1";
export const API_BASE_PATH = `${API_PREFIX}/${API_VERSION}`;

// API_BIND_ADDR uses default defined above
export const API_BIND_ADDR = DEFAULT_API_BIND_ADDR;
