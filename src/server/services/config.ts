import { configDb } from "../db/index.js";
import inquirer from "inquirer";

export interface ServerConfig {
  baseDomain: string;
  serverPublicKey?: string;
  serverPrivateKey?: string;
}

/**
 * Get server configuration, prompting for missing values
 */
export async function getServerConfig(): Promise<ServerConfig> {
  // Get existing config
  const baseDomain = (configDb.get.get("BASE_DOMAIN") as any)?.value;
  const serverPublicKey = (configDb.get.get("server_public_key") as any)?.value;
  const serverPrivateKey = (configDb.get.get("server_private_key") as any)
    ?.value;

  let config: ServerConfig = {
    baseDomain: baseDomain || "",
    serverPublicKey,
    serverPrivateKey,
  };

  // If baseDomain is not set, prompt for it
  if (!config.baseDomain) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "baseDomain",
        message:
          "Enter the base domain for your tunnel service (e.g., tunnel.yourdomain.com):",
        validate: (input) => {
          if (!input) return "Domain is required";
          if (input === "localhost") return "Please enter a real domain";
          return true;
        },
      },
    ]);

    config.baseDomain = answers.baseDomain;
    configDb.set.run("BASE_DOMAIN", config.baseDomain);
  }

  return config;
}

/**
 * Update server configuration
 */
export function updateServerConfig(config: Partial<ServerConfig>): void {
  if (config.baseDomain) {
    configDb.set.run("BASE_DOMAIN", config.baseDomain);
  }
  if (config.serverPublicKey) {
    configDb.set.run("server_public_key", config.serverPublicKey);
  }
  if (config.serverPrivateKey) {
    configDb.set.run("server_private_key", config.serverPrivateKey);
  }
}

export default {
  getServerConfig,
  updateServerConfig,
};
