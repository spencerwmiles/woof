import express from "express";
import cors from "cors";
import {
  PORT,
  API_BASE_PATH,
  WG_INTERFACE,
  API_BIND_ADDR,
} from "./config/index.js";
import { db } from "./db/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import wireguardService from "./services/wireguard.js";
import promptSync from "prompt-sync";

// Import API routes
import apiRoutes from "./api/index.js";

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

  console.log("Initializing server...");
  console.log(`API base path: ${API_BASE_PATH}`);
  console.log(`WireGuard interface: ${WG_INTERFACE}`);

  try {
    // Interactive config review and update
    const prompt = promptSync({ sigint: true });
    const { configDb } = await import("./db/index.js");
    type ConfigRow = { value: string };
    let domainRow = configDb.get.get("domain") as ConfigRow | undefined;
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
          configDb.set.run("domain", newDomain);
          console.log(`Domain updated to: ${newDomain}`);
        }
      }
    } else {
      const newDomain = prompt(
        "No domain configured. Enter domain (e.g., ghost.style): "
      ).trim();
      if (newDomain) {
        configDb.set.run("domain", newDomain);
        console.log(`Domain set to: ${newDomain}`);
      } else {
        throw new Error("No domain provided. Exiting.");
      }
    }
    console.log("--- End Configuration Review ---\n");
    // Initialize WireGuard
    await wireguardService.initializeServer();

    // Start the server
    const server = app.listen(Number(PORT), API_BIND_ADDR, () => {
      console.log(`Server running on ${API_BIND_ADDR}:${PORT}`);
      console.log(
        `API available at http://${API_BIND_ADDR}:${PORT}${API_BASE_PATH}`
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
