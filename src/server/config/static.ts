import path from "path";
import { fileURLToPath } from "url";

// --- Bootstrap Configuration (Needed before DB access) ---
export const DEFAULT_PORT = 3000;
export const DEFAULT_API_BIND_ADDR = "0.0.0.0"; // Default bind address

import os from "os";
// Database configuration: store in ~/.woof/server/tunnels.db for consistency
export const DB_PATH = path.join(os.homedir(), ".woof", "server", "tunnels.db");

// API configuration (can remain static)
export const API_PREFIX = "/api";
export const API_VERSION = "v1";
export const API_BASE_PATH = `${API_PREFIX}/${API_VERSION}`;
