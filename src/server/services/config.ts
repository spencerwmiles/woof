import { configDb } from "../db/index.js";
import inquirer from "inquirer";

export interface ServerConfig {
  domain: string;
  serverPublicKey?: string;
  serverPrivateKey?: string;
}

/**
 * Get server configuration, prompting for missing values
 */
export async function getServerConfig(): Promise<ServerConfig> {
  // Get existing config
  const domain = (configDb.get.get("domain") as any)?.value;
  const serverPublicKey = (configDb.get.get("server_public_key") as any)?.value;
  const serverPrivateKey = (configDb.get.get("server_private_key") as any)
    ?.value;

  let config: ServerConfig = {
    domain: domain || "",
    serverPublicKey,
    serverPrivateKey,
  };

  // If domain is not set, prompt for it
  if (!config.domain) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "domain",
        message:
          "Enter the domain for your tunnel service (e.g., tunnel.yourdomain.com):",
        validate: (input) => {
          if (!input) return "Domain is required";
          if (input === "localhost") return "Please enter a real domain";
          return true;
        },
      },
    ]);

    config.domain = answers.domain;
    configDb.set.run("domain", config.domain);
  }

  return config;
}

/**
 * Update server configuration
 */
export function updateServerConfig(config: Partial<ServerConfig>): void {
  if (config.domain) {
    configDb.set.run("domain", config.domain);
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
