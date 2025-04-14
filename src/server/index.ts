import express from "express";
import os from "os";
import { execSync } from "child_process";

/**
 * Reset all server state: removes ~/.woof/server, cleans up nginx configs, reloads nginx.
 */
export async function resetServerState() {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const { execSync, exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Import WireGuard service functions and DB
  const wireguard = await import("./services/wireguard.js");
  const { clientsDb } = await import("./db/index.js");
  const { getWgInterface } = await import("./config/index.js");

  // 1. Remove all peers from the running interface
  try {
    const peers = await wireguard.getPeerStatus();
    for (const peer of peers) {
      // 1. Always try to remove the peer from the interface first
      try {
        await execAsync(
          `sudo wg set ${getWgInterface()} peer ${peer.publicKey} remove`
        );
        console.log(
          `[woof] Removed WireGuard peer from interface: ${peer.publicKey}`
        );
      } catch (err) {
        console.error(
          `[woof] Failed to remove peer from interface: ${peer.publicKey}`,
          err
        );
      }

      // 2. Then try to clean up the database if a record exists
      try {
        const dbPeer = clientsDb.getByPublicKey.get(peer.publicKey) as
          | { id?: string }
          | undefined;
        if (dbPeer && dbPeer.id) {
          clientsDb.delete.run(dbPeer.id);
          console.log(`[woof] Removed peer from database: ${dbPeer.id}`);
        }
      } catch (dbErr) {
        console.error(
          `[woof] Failed to remove peer from database: ${peer.publicKey}`,
          dbErr
        );
      }
    }
  } catch (err) {
    console.warn(
      "[woof] Could not enumerate or remove WireGuard peers (interface may not be up):",
      err
    );
  }

  // 2. Bring down the WireGuard interface
  try {
    // Try to get the config file path from wireguard service
    const WG_CONFIG_FILE = path.join(
      os.homedir(),
      ".woof",
      "server",
      "wireguard",
      `${getWgInterface()}.conf`
    );
    await execAsync(`sudo wg-quick down ${WG_CONFIG_FILE}`);
    console.log(
      `[woof] Brought down WireGuard interface using config: ${WG_CONFIG_FILE}`
    );
  } catch (err) {
    try {
      // Fallback: try by interface name
      await execAsync(`sudo wg-quick down ${getWgInterface()}`);
      console.log(
        `[woof] Brought down WireGuard interface: ${getWgInterface()}`
      );
    } catch (err2) {
      console.warn(
        "[woof] Could not bring down WireGuard interface (may not be up):",
        err2
      );
    }
  }

  // 3. Remove ~/.woof/server recursively
  const woofServerDir = path.join(os.homedir(), ".woof", "server");
  if (fs.existsSync(woofServerDir)) {
    fs.rmSync(woofServerDir, { recursive: true, force: true });
    console.log(`[woof] Removed server state directory: ${woofServerDir}`);
  } else {
    console.log(`[woof] No server state directory found at: ${woofServerDir}`);
  }

  // 4. Remove any nginx configs created by woof from /etc/nginx/sites-enabled
  const nginxSitesDir = "/etc/nginx/sites-enabled";
  if (fs.existsSync(nginxSitesDir)) {
    const files = fs.readdirSync(nginxSitesDir);
    const woofFiles = files.filter(
      (f) => f.startsWith("tunnel-") && f.endsWith(".conf")
    );
    for (const file of woofFiles) {
      const fullPath = path.join(nginxSitesDir, file);
      try {
        fs.unlinkSync(fullPath);
        console.log(`[woof] Removed nginx config: ${fullPath}`);
      } catch (err) {
        console.error(`[woof] Failed to remove nginx config: ${fullPath}`, err);
      }
    }
    // Reload nginx
    try {
      execSync("sudo nginx -s reload");
      console.log("[woof] Reloaded nginx");
    } catch (err) {
      console.error("[woof] Failed to reload nginx", err);
    }
  } else {
    console.log(
      "[woof] Nginx sites-enabled directory not found, skipping nginx cleanup."
    );
  }
}
import cors from "cors";
import {
  DEFAULT_PORT,
  API_BASE_PATH,
  // WG_INTERFACE, // Removed static import
  API_BIND_ADDR,
  getWgInterface, // Import getter function
} from "./config/index.js";
import { db } from "./db/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import wireguardService from "./services/wireguard.js";
import promptSync from "prompt-sync";

// Import API routes
import apiRoutes from "./api/index.js";
import { ensureApiKeyExists } from "./api/keys.js";

/**
 * Starts the Dev Tunnel server.
 * @returns {Promise<Server>} The HTTP server instance.
 */
export async function startServer() {
  // Create Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use(API_BASE_PATH, apiRoutes);

  // Health check endpoint
  app.get("/healthz", (req, res) => {
    try {
      // Check database connection
      db.prepare("SELECT 1").get();
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Health check failed:", error);
      res
        .status(500)
        .json({ status: "error", message: "Database connection failed" });
    }
  });

  // Create data directory if it doesn't exist
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // Load and display ASCII art
  try {
    const asciiArtPath = path.join(__dirname, "../ascii.txt");
    if (fs.existsSync(asciiArtPath)) {
      const asciiArt = fs.readFileSync(asciiArtPath, "utf-8");
      console.log(asciiArt);
    }
  } catch (err) {
    // Silently ignore if ASCII art can't be loaded
  }

  console.log("Initializing server...");
  console.log(`API base path: ${API_BASE_PATH}`);
  console.log(`WireGuard interface: ${getWgInterface()}`); // Call getter function
  console.log(`WireGuard interface: ${getWgInterface()}`); // Call getter function

  try {
    // Interactive config review and update
    const prompt = promptSync({ sigint: true });
    const { configDb } = await import("./db/index.js");
    type ConfigRow = { value: string };
    let domainRow = configDb.get.get("BASE_DOMAIN") as ConfigRow | undefined;
    let currentDomain = domainRow ? domainRow.value : null;

    console.log("\n--- Server Configuration Review ---");
    if (currentDomain) {
      console.log(`Current domain in DB: ${currentDomain}`);
      const change = prompt("Would you like to change the domain? (y/N): ")
        .trim()
        .toLowerCase();
      if (change === "y" || change === "yes") {
        const newDomain = prompt(
          "Enter new domain (e.g., ghost.style): "
        ).trim();
        if (newDomain) {
          configDb.set.run("BASE_DOMAIN", newDomain);
          console.log(`Domain updated to: ${newDomain}`);
        }
      }
    } else {
      const newDomain = prompt(
        "No domain configured. Enter domain (e.g., ghost.style): "
      ).trim();
      if (newDomain) {
        configDb.set.run("BASE_DOMAIN", newDomain);
        console.log(`Domain set to: ${newDomain}`);
      } else {
        throw new Error("No domain provided. Exiting.");
      }
    }
    console.log("--- End Configuration Review ---\n");

    // Ensure API key exists
    await ensureApiKeyExists();

    // Initialize WireGuard
    await wireguardService.initializeServer();

    // Start the server
    const server = app.listen(Number(DEFAULT_PORT), API_BIND_ADDR, () => {
      console.log(`Server running on ${API_BIND_ADDR}:${DEFAULT_PORT}`);
      console.log(
        `API available at http://${API_BIND_ADDR}:${DEFAULT_PORT}${API_BASE_PATH}`
      );
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("Shutting down server...");
      db.close();
      server.close(() => {
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return server;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    throw error;
  }
}
