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
import { createApiKey, revokeAllApiKeys } from "./server/api/keys.js";
import { asciiArt } from "./ascii.js";

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
  baseDomain: string; // The public server domain (matches server BASE_DOMAIN)
  apiBasePath: string; // API path (usually "/api/v1")
  tunnels: Record<string, any>;
  apiKey?: string; // API key for authentication
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
    baseDomain:
      configData.baseDomain ||
      (configData as any).publicServerUrl
        ?.replace(/^https?:\/\//, "")
        .split(":")[0] ||
      "", // Migrate from old config if present
    apiBasePath: configData.apiBasePath || DEFAULT_API_BASE_PATH, // Use default base path
    clientId: configData.clientId,
    tunnels: configData.tunnels || {},
    apiKey: configData.apiKey || "",
  };

  // Write back the potentially updated config (e.g., if file was missing/corrupt)
  // This ensures the file always reflects the structure we expect
  if (!fs.existsSync(CONFIG_FILE) || Object.keys(configData).length === 0) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(finalConfig, null, 2));
  }

  return finalConfig;
}

// Save config to file
function saveConfig(config: Config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Function to update API key in the client config
function updateApiKey(apiKey: string): Config {
  // Load current config
  const config = initConfig();
  // Update the API key
  config.apiKey = apiKey;
  // Save the updated config
  console.log(
    "Saving API key to config:",
    config.apiKey ? "API key set" : "No key set"
  );
  saveConfig(config);
  return config;
}

// Register with the server if not already registered
async function ensureRegistered(config: Config): Promise<Config> {
  if (config.clientId) {
    return config;
  }

  console.log(chalk.blue("Registering with server..."));

  try {
    // Check if API key is set
    if (!config.apiKey) {
      console.error(
        chalk.red("API key not configured. Please set your API key first:")
      );
      console.error(chalk.yellow("woof config --api-key YOUR_API_KEY"));
      process.exit(1);
    }

    // Prompt for the base domain (public server domain)
    const { baseDomainInput } = await inquirer.prompt({
      type: "input",
      name: "baseDomainInput",
      message:
        "Enter the base domain for your tunnel service (e.g., ghost.style):",
      default: config.baseDomain,
    });

    // Store only the domain (strip protocol and port)
    config.baseDomain = baseDomainInput
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/:\d+$/, "")
      .split("/")[0];

    // For API calls, use the protocol and host as entered
    let apiUrl;
    // Always use http://{domain}:3000 for API calls
    apiUrl = `http://${config.baseDomain}:3000${config.apiBasePath}`;

    // For public URLs, always use https and strip protocol/port
    let publicUrlHost;
    // Always use https://{domain} for public tunnel URLs
    const publicUrl = `https://${config.baseDomain}`;

    console.log(chalk.dim(`Using Public URL: ${publicUrl}`));
    console.log(chalk.dim(`Using Tunnel API URL: ${apiUrl}`));

    // Register using the API URL (honor protocol)
    const response = await axios.post(
      `${apiUrl}/register`,
      {
        name: os.hostname(),
      },
      {
        headers: {
          "X-API-Key": config.apiKey,
        },
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
    // Check if API key is set
    if (!config.apiKey) {
      console.error(
        chalk.red("API key not configured. Please set your API key first:")
      );
      console.error(chalk.yellow("woof config --api-key YOUR_API_KEY"));
      process.exit(1);
    }

    // Use tunnelServerUrl for API calls after tunnel is up
    const response = await axios.post(
      // Use protocol and host as entered for API calls
      `http://${config.baseDomain}:3000${config.apiBasePath}/tunnels`,
      {
        clientId: config.clientId,
        localPort,
        subdomain,
      },
      {
        headers: {
          "X-API-Key": config.apiKey,
        },
      }
    );

    const { tunnel } = response.data;

    // Save tunnel info to config
    config.tunnels[tunnel.id] = tunnel;
    saveConfig(config);

    // For public tunnel URLs, always use https://subdomain.baseDomain
    const tunnelUrl =
      tunnel.publicUrl ||
      (tunnel.publicSubdomain
        ? `https://${tunnel.publicSubdomain}.${config.baseDomain}`
        : `http://${tunnel.assignedIp}:${tunnel.localPort}`);

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
      // Use protocol and host as entered for API calls
      `http://${config.baseDomain}:3000${config.apiBasePath}/tunnels/${tunnelId}`,
      {
        headers: {
          "X-API-Key": config.apiKey,
        },
      }
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
  .action(async (port, options) => {
    console.clear();
    console.log(chalk.redBright(asciiArt));
    console.log(chalk.blue("Creating tunnel..."));
    console.log(`Exposing local port: ${port}`);

    if (options.subdomain) {
      console.log(`Using custom subdomain: ${options.subdomain}`);
    }

    // Initialize config
    let config = initConfig();

    // Register with server if not already registered
    config = await ensureRegistered(config);

    // Start WireGuard interface
    await startWireGuard();

    // Create tunnel
    const tunnel = await createTunnel(config, port, options.subdomain);

    console.log(chalk.green("Tunnel created successfully!"));
    console.log(`Public URL: ${tunnel.publicUrl}`);
    console.log(chalk.yellow("Press Ctrl+C to close the tunnel"));

    // Wait a moment for the user to see the initial success message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Clear console and start showing status
    console.clear();

    // Function to get WireGuard status
    async function getWireGuardStatus() {
      try {
        const platform = os.platform();
        if (platform === "darwin" || platform === "linux") {
          // Get WireGuard status
          const { stdout } = await execAsync("sudo wg show");

          // Parse the output to find the server peer
          const lines = stdout.split("\n");
          let handshakeTime = "No recent handshake";
          let transferRx = "0 B";
          let transferTx = "0 B";

          for (const line of lines) {
            if (line.includes("latest handshake:")) {
              handshakeTime = line.split("latest handshake:")[1].trim();
            } else if (line.includes("transfer:")) {
              const transferParts = line
                .split("transfer:")[1]
                .trim()
                .split("received,");
              transferRx = transferParts[0].trim();
              transferTx = transferParts[1].trim();
            }
          }

          return {
            handshakeTime,
            transferRx,
            transferTx,
            connected: handshakeTime !== "No recent handshake",
          };
        }
        return {
          handshakeTime: "Unknown",
          transferRx: "Unknown",
          transferTx: "Unknown",
          connected: false,
        };
      } catch (err) {
        return {
          handshakeTime: "Error",
          transferRx: "Error",
          transferTx: "Error",
          connected: false,
        };
      }
    }

    // Format bytes to human-readable format
    function formatBytes(bytes: string) {
      if (bytes === "Error" || bytes === "Unknown") return bytes;
      return bytes;
    }

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
      // Display ASCII art and initial status header
      console.clear();
      console.log(chalk.redBright(asciiArt));
      console.log("");
      console.log(chalk.bold(`Public URL: ${tunnel.publicUrl}`));
      console.log(chalk.bold(`Local Port: ${port}`));
      console.log("");
      console.log(chalk.yellow("Press Ctrl+C to close the tunnel"));
      console.log("");

      let lastStatus = { connected: false };

      // Update status every 10 seconds
      setInterval(async () => {
        try {
          // Get current status
          const status = await getWireGuardStatus();

          // Only clear and redraw if status changed
          if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
            console.clear();
            if (status.connected) {
              console.log(chalk.green(asciiArt));
            } else {
              console.log(chalk.blue(asciiArt));
            }
            console.log("");
            console.log(chalk.bold(`Public URL: ${tunnel.publicUrl}`));
            console.log(chalk.bold(`Local Port: ${port}`));
            console.log("");
            console.log(
              chalk.bold("Connection Status:"),
              status.connected
                ? chalk.green("Connected")
                : chalk.yellow("Waiting for connection...")
            );
            console.log(chalk.bold("Last Handshake:"), status.handshakeTime);
            console.log(
              chalk.bold("Data Received:"),
              formatBytes(status.transferRx)
            );
            console.log(
              chalk.bold("Data Sent:"),
              formatBytes(status.transferTx)
            );
            console.log("");
            console.log(chalk.yellow("Press Ctrl+C to close the tunnel"));

            lastStatus = status;
          }
        } catch (err) {
          // Silently handle errors to avoid crashing the status display
        }
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
  .description("Manage configuration (base domain, API base path, and API key)")
  .option(
    "--base-domain <domain>",
    "Set the base domain (for public URLs and API)"
  )
  .option("--api-base-path <path>", "Set the API base path (default: /api/v1)")
  .option("--api-key <key>", "Set the API key for server authentication")
  .action(async (options) => {
    // Initialize config
    let config = initConfig();
    let updated = false;

    if (options.baseDomain) {
      config.baseDomain = options.baseDomain
        .replace(/^https?:\/\//, "")
        .replace(/:\d+$/, "")
        .split("/")[0];
      console.log(chalk.green(`Base Domain set to: ${config.baseDomain}`));
      updated = true;
    }

    if (options.apiBasePath) {
      config.apiBasePath = options.apiBasePath;
      console.log(chalk.green(`API Base Path set to: ${config.apiBasePath}`));
      updated = true;
    }

    if (options.apiKey) {
      // Use the dedicated function for updating API key
      config = updateApiKey(options.apiKey);
      console.log(chalk.green(`API Key set successfully`));
      updated = true;
    }

    if (updated) {
      saveConfig(config);
    } else {
      // Display current config
      console.log(chalk.blue("Current configuration:"));
      console.log(`Base Domain: ${config.baseDomain}`);
      console.log(`API Base Path: ${config.apiBasePath}`);
      console.log(`API Key: ${config.apiKey ? "********" : "Not set"}`);
      console.log(`Client ID: ${config.clientId || "Not registered"}`);
      console.log(`Active tunnels: ${Object.keys(config.tunnels).length}`);
    }
  });

program
  .command("reset")
  .description(
    "Clear all client state and configuration (brings down WireGuard interface and wipes ~/.woof)"
  )
  .action(async () => {
    console.log(chalk.blue("[woof] Resetting client state..."));

    // 1. Load config and check for active tunnels
    let config: Config;
    try {
      config = initConfig();
    } catch (err) {
      console.log(
        chalk.yellow(
          "[woof] Could not load config, proceeding with reset anyway."
        )
      );
      config = {
        baseDomain: "",
        apiBasePath: DEFAULT_API_BASE_PATH,
        tunnels: {},
      };
    }

    // 2. Delete all active tunnels if client is registered
    if (config.clientId) {
      console.log(chalk.blue("[woof] Closing all active tunnels..."));
      const tunnelIds = Object.keys(config.tunnels);

      if (tunnelIds.length > 0) {
        for (const tunnelId of tunnelIds) {
          try {
            await deleteTunnel(config, tunnelId);
            console.log(chalk.green(`[woof] Closed tunnel: ${tunnelId}`));
          } catch (err) {
            console.log(
              chalk.yellow(
                `[woof] Failed to close tunnel ${tunnelId}, continuing with reset.`
              )
            );
          }
        }
      } else {
        console.log(chalk.blue("[woof] No active tunnels found."));
      }
    }

    // 3. Attempt to bring down the WireGuard interface if config exists
    if (fs.existsSync(WG_CONFIG_FILE)) {
      try {
        const platform = os.platform();
        if (platform === "darwin" || platform === "linux") {
          // Try to get interface status first
          try {
            const { stdout } = await execAsync("sudo wg show");
            if (stdout.trim()) {
              console.log(
                chalk.blue(
                  "[woof] Active WireGuard interfaces found, bringing down..."
                )
              );
            }
          } catch (err) {
            // Ignore errors from wg show
          }

          await execAsync(`sudo wg-quick down ${WG_CONFIG_FILE}`);
          console.log(chalk.green("[woof] WireGuard interface brought down"));
        }
        // No Windows support yet
      } catch (err) {
        console.log(
          chalk.yellow(
            "[woof] WireGuard interface may not have been up or could not be brought down."
          )
        );
      }
    }

    // 4. Remove the config directory
    if (fs.existsSync(CONFIG_DIR)) {
      fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      console.log(
        chalk.green(`[woof] Cleared all client state at: ${CONFIG_DIR}`)
      );
    } else {
      console.log(
        chalk.yellow(`[woof] No client state found at: ${CONFIG_DIR}`)
      );
    }

    console.log(chalk.green("[woof] Client reset complete."));
  });

const server = program
  .command("server")
  .description("Server management commands");

server
  .command("reset")
  .alias("clear")
  .description(
    "Clear all server state and configuration (wipes ~/.woof/server, removes nginx configs, reloads nginx)"
  )
  .action(async () => {
    const { resetServerState } = await import("./server/index.js");
    await resetServerState();
    process.exit(0);
  });

server
  .command("start")
  .description("Start the Woof server")
  .option("-p, --port <port>", "Port to run the API server on")
  .option(
    "-b, --bind <address>",
    "IP address to bind the API server to (e.g., 0.0.0.0, 127.0.0.1)"
  )
  .option(
    "-d, --base-domain <domain>",
    "Base domain for public tunnel URLs (e.g., tunnel.yourdomain.com)"
  )
  .action(async (options) => {
    try {
      // Override config from options if provided by setting env vars
      // Note: This is a simple way; a more robust approach might involve
      // passing config directly to startServer if it were refactored.
      if (options.port) process.env.PORT = options.port;
      if (options.bind) process.env.API_BIND_ADDR = options.bind;
      if (options.baseDomain) process.env.BASE_DOMAIN = options.baseDomain;

      // Reload config potentially influenced by env vars set above
      // This assumes startServer internally imports the config again.
      await startServer();
    } catch (error) {
      console.error(chalk.red("Server failed to start:"), error);
      process.exit(1);
    }
  });

// Add API key management commands
program
  .command("api-key")
  .description("API key management")
  .addCommand(
    new Command("create")
      .description("Create a new API key (replaces any existing keys)")
      .option("-n, --name <name>", "Name for the API key", "CLI Generated Key")
      .action(async (options) => {
        try {
          const apiKey = await createApiKey(options.name);

          console.log(chalk.green("API key created successfully!"));
          console.log("\n=================================================");
          console.log("IMPORTANT: New API Key");
          console.log("=================================================");
          console.log("API Key: " + apiKey);
          console.log("This key will not be shown again. Store it securely.");
          console.log("=================================================\n");
        } catch (error) {
          console.error(chalk.red("Failed to create API key:"), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command("revoke")
      .description("Revoke all API keys")
      .action(async () => {
        try {
          await revokeAllApiKeys();
          console.log(chalk.green("All API keys have been revoked."));
        } catch (error) {
          console.error(chalk.red("Failed to revoke API keys:"), error);
          process.exit(1);
        }
      })
  );

// Add a debug command after the config command
program
  .command("debug")
  .description("Debug information for troubleshooting (shows raw config)")
  .action(() => {
    // Show config file path
    console.log(chalk.blue("Config file location:"));
    console.log(CONFIG_FILE);

    // Check if config file exists
    if (!fs.existsSync(CONFIG_FILE)) {
      console.log(chalk.red("Config file does not exist!"));
      return;
    }

    // Show raw config file contents
    console.log(chalk.blue("Raw config file contents:"));
    try {
      const rawConfig = fs.readFileSync(CONFIG_FILE, "utf-8");
      console.log(rawConfig);

      // Parse and validate config
      try {
        const parsedConfig = JSON.parse(rawConfig);
        console.log(chalk.blue("Parsed config keys:"));
        console.log(Object.keys(parsedConfig));

        // Check for key presence
        console.log(chalk.blue("Config validation:"));
        console.log(`API Key present: ${Boolean(parsedConfig.apiKey)}`);
        console.log(`Base Domain: ${parsedConfig.baseDomain || "Not set"}`);
        console.log(`API Base Path: ${parsedConfig.apiBasePath || "Not set"}`);
      } catch (err) {
        console.log(chalk.red("Failed to parse config as JSON:"), err);
      }
    } catch (err) {
      console.log(chalk.red("Failed to read config file:"), err);
    }
  });

program.parse();
