import Database from "better-sqlite3";
import type { Statement } from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DB_PATH } from "../config/index.js";

// Ensure the database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize the database
const db: Database.Database = new Database(DB_PATH);
export { db };

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables if they don't exist
function initializeDatabase() {
  // Clients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT,
      public_key TEXT UNIQUE NOT NULL,
      private_key TEXT,
      assigned_ip TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Tunnels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      local_port INTEGER NOT NULL,
      public_subdomain TEXT UNIQUE,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      status TEXT NOT NULL,
      bytes_sent INTEGER DEFAULT 0,
      bytes_received INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Ensure essential config values exist in the database
  const getConfig = db.prepare("SELECT value FROM config WHERE key = ?");
  const setConfig = db.prepare(
    "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)"
  );

  // Define defaults (these should match the conceptual defaults removed from config/index.ts)
  const defaults = {
    last_assigned_ip: "10.8.0.1", // Start assigning from .2
    BASE_DOMAIN: "woof.tunnels.dev", // Example public domain
    WG_SERVER_IP: "10.8.0.1",
    WG_CLIENT_IP_RANGE: "10.8.0.2-10.8.0.254",
    // server_public_key and server_private_key are handled by wireguard service init
  };

  // Set defaults if keys don't exist
  for (const [key, value] of Object.entries(defaults)) {
    setConfig.run(key, value);
  }
}

// Initialize the database
initializeDatabase();

// Client-related functions
export const clientsDb: Record<string, Statement> = {
  // Create a new client
  create: db.prepare(`
    INSERT INTO clients (id, name, public_key, private_key, assigned_ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  // Get a client by ID
  getById: db.prepare("SELECT * FROM clients WHERE id = ?"),

  // Get a client by public key
  getByPublicKey: db.prepare("SELECT * FROM clients WHERE public_key = ?"),

  // Get a client by assigned IP
  getByAssignedIp: db.prepare("SELECT * FROM clients WHERE assigned_ip = ?"),

  // Update a client's last seen timestamp
  updateLastSeen: db.prepare("UPDATE clients SET last_seen = ? WHERE id = ?"),

  // Update a client's active status
  updateActiveStatus: db.prepare(
    "UPDATE clients SET is_active = ? WHERE id = ?"
  ),

  // List all active clients
  listActive: db.prepare(
    "SELECT * FROM clients WHERE is_active = 1 ORDER BY created_at DESC"
  ),

  // Delete a client
  delete: db.prepare("DELETE FROM clients WHERE id = ?"),
};

// Tunnel-related functions
export const tunnelsDb: Record<string, Statement> = {
  // Create a new tunnel
  create: db.prepare(`
    INSERT INTO tunnels (id, client_id, local_port, public_subdomain, start_time, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  // Get a tunnel by ID
  getById: db.prepare("SELECT * FROM tunnels WHERE id = ?"),

  // Get a tunnel by subdomain
  getBySubdomain: db.prepare(
    "SELECT * FROM tunnels WHERE public_subdomain = ?"
  ),

  // Get active tunnels for a client
  getActiveByClientId: db.prepare(`
    SELECT * FROM tunnels
    WHERE client_id = ? AND status = 'active'
    ORDER BY start_time DESC
  `),

  // Update a tunnel's status
  updateStatus: db.prepare("UPDATE tunnels SET status = ? WHERE id = ?"),

  // Update a tunnel's end time
  updateEndTime: db.prepare("UPDATE tunnels SET end_time = ? WHERE id = ?"),

  // Update tunnel metrics
  updateMetrics: db.prepare(`
    UPDATE tunnels
    SET bytes_sent = bytes_sent + ?,
        bytes_received = bytes_received + ?,
        request_count = request_count + ?
    WHERE id = ?
  `),

  // List all active tunnels
  listActive: db.prepare(
    "SELECT * FROM tunnels WHERE status = 'active' ORDER BY start_time DESC"
  ),

  // Delete a tunnel
  delete: db.prepare("DELETE FROM tunnels WHERE id = ?"),
};

// Config-related functions
export const configDb: Record<string, Statement> = {
  // Get a config value
  get: db.prepare("SELECT value FROM config WHERE key = ?"),

  // Set a config value
  set: db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
};
