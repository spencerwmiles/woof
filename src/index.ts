#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import json from "../package.json" with { type: "json" };
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import inquirer from "inquirer";
import { startServer } from "./server/index.js";

const execAsync = promisify(exec);

// Default configuration
const CONFIG_DIR = path.join(os.homedir(), ".woof");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const WG_CONFIG_FILE = path.join(CONFIG_DIR, "wg.conf");

// Default server settings (should be overridable via CLI options)
const DEFAULT_SERVER_URL = "http://localhost:3000";
const DEFAULT_API_BASE_PATH = "/api/v1";

interface Config {
  clientId?: string;
  serverUrl: string;
  apiBasePath: string;
  tunnels: Record<string, any>;
}

// Initialize the config directory and file if they don't exist
function initConfig(): Config {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig: Config = {
      serverUrl: DEFAULT_SERVER_URL,
      apiBasePath: DEFAULT_API_BASE_PATH,
      tunnels: {},
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (error) {
    console.error("Failed to parse config file:", error);
    process.exit(1);
  }
}

// Save config to file
function saveConfig(config: Config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Register with the server if not already registered
async function ensureRegistered(config: Config): Promise<Config> {
  if (config.clientId) {
    return config;
  }

  console.log(chalk.blue("Registering with server..."));

  try {
    // Allow user to input server URL if not registered yet
    const { serverUrl } = await inquirer.prompt({
      type: "input",
      name: "serverUrl",
      message: "Enter server URL (including port):",
      default: config.serverUrl,
    });

    config.serverUrl = serverUrl;

    const response = await axios.post(
      `${config.serverUrl}${config.apiBasePath}/register`,
      {
        name: os.hostname(),
      }
    );

    const { client, config: wgConfig } = response.data;

    config.clientId = client.id;

    // Save WireGuard config to file with proper permissions
    fs.writeFileSync(WG_CONFIG_FILE, wgConfig, { mode: 0o600 });
    console.log(chalk.green("Registration successful!"));
    console.log(`Client ID: ${client.id}`);
    console.log(`Assigned IP: ${client.assignedIp}`);

    saveConfig(config);

    return config;
  } catch (error) {
    console.error(chalk.red("Failed to register with server:"), error);
    process.exit(1);
  }
}

// Start the WireGuard interface
async function startWireGuard() {
  try {
    const platform = os.platform();

    if (platform === "darwin" || platform === "linux") {
      await execAsync(`sudo wg-quick up ${WG_CONFIG_FILE}`);
    } else if (platform === "win32") {
      // Windows implementation would use wireguard.exe
      console.error(chalk.yellow("Windows support is coming soon."));
      process.exit(1);
    } else {
      console.error(chalk.red(`Unsupported platform: ${platform}`));
      process.exit(1);
    }

    console.log(chalk.green("WireGuard interface is up"));
  } catch (error) {
    console.error(chalk.red("Failed to start WireGuard:"), error);
    process.exit(1);
  }
}

// Stop the WireGuard interface
async function stopWireGuard() {
  try {
    const platform = os.platform();

    if (platform === "darwin" || platform === "linux") {
      try {
        await execAsync(`sudo wg-quick down ${WG_CONFIG_FILE}`);
        console.log(chalk.green("WireGuard interface is down"));
      } catch (error: any) {
        // Suppress error if interface is already down
        if (
          error.stderr &&
          error.stderr.includes("is not a WireGuard interface")
        ) {
          console.log(chalk.yellow("WireGuard interface was already down."));
        } else {
          throw error;
        }
      }
    } else if (platform === "win32") {
      // Windows implementation would use wireguard.exe
      console.error(chalk.yellow("Windows support is coming soon."));
    } else {
      console.error(chalk.red(`Unsupported platform: ${platform}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("Failed to stop WireGuard:"), error);
  }
}

// Create a tunnel
async function createTunnel(
  config: Config,
  localPort: number,
  subdomain?: string
) {
  try {
    const response = await axios.post(
      `${config.serverUrl}${config.apiBasePath}/tunnels`,
      {
        clientId: config.clientId,
        localPort,
        subdomain,
      }
    );

    const { tunnel } = response.data;

    // Save tunnel info to config
    config.tunnels[tunnel.id] = tunnel;
    saveConfig(config);

    // In development mode, the tunnel URL is just the WireGuard IP and port
    const tunnelUrl =
      tunnel.publicUrl || `http://${tunnel.assignedIp}:${tunnel.localPort}`;

    return { ...tunnel, publicUrl: tunnelUrl };
  } catch (error) {
    console.error(chalk.red("Failed to create tunnel:"), error);
    process.exit(1);
  }
}

// Delete a tunnel
async function deleteTunnel(config: Config, tunnelId: string) {
  try {
    await axios.delete(
      `${config.serverUrl}${config.apiBasePath}/tunnels/${tunnelId}`
    );

    // Remove tunnel from config
    delete config.tunnels[tunnelId];
    saveConfig(config);
  } catch (error) {
    console.error(chalk.red("Failed to delete tunnel:"), error);
  }
}

const program = new Command();

program
  .name("woof")
  .description(
    "A simple CLI which provides both a server and a client for exposing services to the public internet."
  )
  .version(json.version);

program
  .command("up")
  .description("Create a tunnel to expose a local port")
  .argument("<port>", "Local port to expose", parseInt)
  .option("-s, --subdomain <subdomain>", "Custom subdomain (optional)")
  .option("--server <url>", "Server URL")
  .action(async (port, options) => {
    console.log(chalk.blue("Creating tunnel..."));
    console.log(`Exposing local port: ${port}`);

    if (options.subdomain) {
      console.log(`Using custom subdomain: ${options.subdomain}`);
    }

    // Initialize config
    let config = initConfig();

    // Update server URL if provided
    if (options.server) {
      config.serverUrl = options.server;
      saveConfig(config);
    }

    // Register with server if not already registered
    config = await ensureRegistered(config);

    // Start WireGuard interface
    await startWireGuard();

    // Create tunnel
    const tunnel = await createTunnel(config, port, options.subdomain);

    console.log(chalk.green("Tunnel created successfully!"));
    console.log(`Public URL: ${tunnel.publicUrl}`);
    console.log(chalk.yellow("Press Ctrl+C to close the tunnel"));

    // Keep the process running until Ctrl+C
    let shuttingDown = false;
    process.on("SIGINT", async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      console.log(chalk.blue("\nClosing tunnel..."));

      // Delete tunnel
      await deleteTunnel(config, tunnel.id);

      // Stop WireGuard
      await stopWireGuard();

      console.log(chalk.green("Tunnel closed successfully!"));
      process.exit(0);
    });

    // This ensures the process stays alive until Ctrl+C is pressed
    return new Promise(() => {
      setInterval(() => {
        // Optional heartbeat to keep connection alive
      }, 10000);
    });
  });

program
  .command("down")
  .description("Close all active tunnels")
  .action(async () => {
    console.log(chalk.blue("Closing all tunnels..."));

    // Initialize config
    const config = initConfig();

    // If not registered, nothing to do
    if (!config.clientId) {
      console.log(chalk.yellow("No active registration found."));
      return;
    }

    // Delete all tunnels
    const tunnelIds = Object.keys(config.tunnels);
    for (const tunnelId of tunnelIds) {
      await deleteTunnel(config, tunnelId);
    }

    // Stop WireGuard
    await stopWireGuard();

    console.log(chalk.green("All tunnels closed successfully!"));
  });

program
  .command("config")
  .description("Manage configuration")
  .option("--server <url>", "Set server URL")
  .action(async (options) => {
    // Initialize config
    let config = initConfig();

    if (options.server) {
      config.serverUrl = options.server;
      saveConfig(config);
      console.log(chalk.green(`Server URL set to: ${options.server}`));
    } else {
      // Display current config
      console.log(chalk.blue("Current configuration:"));
      console.log(`Server URL: ${config.serverUrl}`);
      console.log(`Client ID: ${config.clientId || "Not registered"}`);
      console.log(`Active tunnels: ${Object.keys(config.tunnels).length}`);
    }
  });

program
  .command("server")
  .description("Server management commands")
  .command("start")
  .description("Start the Dev Tunnel server")
  .action(async () => {
    try {
      await startServer();
    } catch (error) {
      console.error("Server failed to start:", error);
      process.exit(1);
    }
  });

program.parse();
