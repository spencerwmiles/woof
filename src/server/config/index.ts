import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config();

// Server configuration
export const PORT = process.env.PORT || 3000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Database configuration
export const DB_PATH =
  process.env.DB_PATH ||
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../data/tunnels.db"
  );

// WireGuard configuration
export const WG_INTERFACE = process.env.WG_INTERFACE || "wg0";
export const WG_SERVER_IP = process.env.WG_SERVER_IP || "10.8.0.1";
export const WG_CLIENT_IP_RANGE =
  process.env.WG_CLIENT_IP_RANGE || "10.8.0.2-10.8.0.254";

// Parse the client IP range
const [rangeStart, rangeEnd] = WG_CLIENT_IP_RANGE.split("-");
export const WG_CLIENT_IP_START = rangeStart;
export const WG_CLIENT_IP_END = rangeEnd;

// Nginx configuration
export const NGINX_SITES_PATH =
  process.env.NGINX_SITES_PATH || "/etc/nginx/sites-enabled";
export const BASE_DOMAIN = process.env.BASE_DOMAIN || "dev.yourdomain.com";

// API configuration
export const API_PREFIX = "/api";
export const API_VERSION = "v1";
export const API_BASE_PATH = `${API_PREFIX}/${API_VERSION}`;

// API bind address (restrict API to WireGuard interface by default)
export const API_BIND_ADDR = process.env.API_BIND_ADDR || WG_SERVER_IP;
