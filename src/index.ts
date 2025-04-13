#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
const json = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);
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
  publicServerUrl: string; // Public IP or DNS for registration
  tunnelServerUrl: string; // Internal WireGuard IP for API after tunnel is up
  apiBasePath: string;
  tunnels: Record<string, any>;
}

// Initialize the config directory and file if they don't exist
function initConfig(): Config {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  let configData: Partial<Config> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      configData = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (error) {
      console.error("Failed to parse config file, creating a new one:", error);
      // Proceed to create default below
    }
  }

  // Ensure required fields exist, providing placeholders if necessary
  const finalConfig: Config = {
    publicServerUrl: configData.publicServerUrl || "", // Placeholder
    tunnelServerUrl: configData.tunnelServerUrl || "", // Placeholder
    apiBasePath: configData.apiBasePath || DEFAULT_API_BASE_PATH, // Use default base path
    clientId: configData.clientId,
    tunnels: configData.tunnels || {},
  };

  // Write back the potentially updated config (e.g., if file was missing/corrupt)
  // This ensures the file always reflects the structure we expect
  if (!fs.existsSync(CONFIG_FILE) || Object.keys(configData).length === 0) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(finalConfig, null, 2));
  }

  return finalConfig;

  // Removed old try/catch as it's handled above now
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
    // Prompt for the public server URL (domain or IP, no port needed usually)
    const { publicUrlInput } = await inquirer.prompt({
      type: "input",
      name: "publicUrlInput",
      message: "Enter public server domain or IP (e.g., ghost.style):",
      // Use existing publicServerUrl if available, otherwise prompt without default
      default: config.publicServerUrl
        ?.replace(/^https?:\/\//, "")
        .split(":")[0],
    });

    // Construct the public URL (assume https unless http:// is specified)
    const publicUrl = publicUrlInput.startsWith("http://")
      ? publicUrlInput
      : `https://${publicUrlInput}`;
    config.publicServerUrl = publicUrl;

    // Derive the default tunnel server URL (assume same host, default API port 3000)
    const publicHost = new URL(publicUrl).hostname;
    const defaultTunnelUrl = `http://${publicHost}:3000`;

    // Prompt for the tunnel server URL, defaulting to the derived one
    const { tunnelUrlInput } = await inquirer.prompt({
      type: "input",
      name: "tunnelUrlInput",
      message: "Enter internal tunnel API URL (for API calls):",
      default: config.tunnelServerUrl || defaultTunnelUrl, // Use existing or derived default
    });
    config.tunnelServerUrl = tunnelUrlInput;

    console.log(chalk.dim(`Using Public URL: ${config.publicServerUrl}`));
    console.log(chalk.dim(`Using Tunnel API URL: ${config.tunnelServerUrl}`));

    // Register using the public URL
    const response = await axios.post(
      `${config.publicServerUrl}${config.apiBasePath}/register`,
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

    // Save the updated config (including both URLs)
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
    // Use tunnelServerUrl for API calls after tunnel is up
    const response = await axios.post(
      `${config.tunnelServerUrl}${config.apiBasePath}/tunnels`,
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
      `${config.tunnelServerUrl}${config.apiBasePath}/tunnels/${tunnelId}`
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
      config.publicServerUrl = options.server;
      saveConfig(config);
    }

    // Register with server if not already registered
    config = await ensureRegistered(config);

    // Start WireGuard interface
    await startWireGuard();
    // No need to overwrite config here; tunnelServerUrl is already set

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
  .description("Manage configuration (public and tunnel server URLs)")
  .option(
    "--public-server <url>",
    "Set the public server URL (for registration)"
  )
  .option(
    "--tunnel-server <url>",
    "Set the internal tunnel server URL (for API calls)"
  )
  .option("--server <url>", "Alias for --public-server") // Backward compatibility
  .action(async (options) => {
    // Initialize config
    let config = initConfig();
    let updated = false;

    // Handle alias
    if (options.server && !options.publicServer) {
      options.publicServer = options.server;
    }

    if (options.publicServer) {
      config.publicServerUrl = options.publicServer;
      console.log(
        chalk.green(`Public Server URL set to: ${options.publicServer}`)
      );
      updated = true;
    }

    if (options.tunnelServer) {
      config.tunnelServerUrl = options.tunnelServer;
      console.log(
        chalk.green(`Tunnel Server URL set to: ${options.tunnelServer}`)
      );
      updated = true;
    }

    if (updated) {
      saveConfig(config);
    } else {
      // Display current config
      console.log(chalk.blue("Current configuration:"));
      console.log(`Public Server URL: ${config.publicServerUrl}`);
      console.log(`Tunnel Server URL: ${config.tunnelServerUrl}`);
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
