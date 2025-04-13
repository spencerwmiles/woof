import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { NGINX_SITES_PATH, BASE_DOMAIN } from "../config/index.js";

// Promisify exec and fs functions
const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const accessAsync = promisify(fs.access);

// Interface for tunnel configuration
export interface TunnelConfig {
  id: string;
  clientId: string;
  subdomain: string;
  targetIp: string;
  targetPort: number;
}

/**
 * Generate an Nginx server block configuration for a tunnel
 */
export function generateNginxConfig(config: TunnelConfig): string {
  const serverName = `${config.subdomain}.${BASE_DOMAIN}`;

  return `
# Tunnel: ${config.id} (Client: ${config.clientId})
server {
  listen 80;
  server_name ${serverName};

  # Redirect HTTP to HTTPS
  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl;
  server_name ${serverName};

  # SSL configuration
  ssl_certificate /etc/letsencrypt/live/${BASE_DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${BASE_DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;
  ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;

  # Proxy configuration
  location / {
    proxy_pass http://${config.targetIp}:${config.targetPort};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
  }

  # Custom access log for this tunnel
  access_log /var/log/nginx/tunnel_${config.id}.access.log;
  error_log /var/log/nginx/tunnel_${config.id}.error.log;
}
`.trim();
}

/**
 * Check if Nginx is installed and accessible
 */
export async function checkNginxAccess(): Promise<boolean> {
  try {
    // Check if Nginx is installed
    await execAsync("which nginx");

    // Check if we have access to the sites directory
    await accessAsync(NGINX_SITES_PATH, fs.constants.W_OK);

    return true;
  } catch (error) {
    console.error("Nginx access check failed:", error);
    return false;
  }
}

/**
 * Add an Nginx configuration for a tunnel
 */
export async function addTunnelConfig(config: TunnelConfig): Promise<void> {
  try {
    // Diagnostic logging
    console.log("[DEBUG] NGINX_SITES_PATH:", NGINX_SITES_PATH);

    // Check if the directory exists
    try {
      await accessAsync(NGINX_SITES_PATH, fs.constants.F_OK);
      console.log("[DEBUG] Directory exists:", NGINX_SITES_PATH);
    } catch (dirErr) {
      console.error(
        "[ERROR] NGINX_SITES_PATH does not exist:",
        NGINX_SITES_PATH,
        dirErr
      );
      throw new Error(
        `[DIAGNOSE] NGINX_SITES_PATH does not exist: ${NGINX_SITES_PATH}`
      );
    }

    // Check if the directory is writable
    try {
      await accessAsync(NGINX_SITES_PATH, fs.constants.W_OK);
      console.log("[DEBUG] Directory is writable:", NGINX_SITES_PATH);
    } catch (permErr) {
      console.error(
        "[ERROR] No write permission for NGINX_SITES_PATH:",
        NGINX_SITES_PATH,
        permErr
      );
      throw new Error(
        `[DIAGNOSE] No write permission for NGINX_SITES_PATH: ${NGINX_SITES_PATH}`
      );
    }

    // Generate the configuration
    const nginxConfig = generateNginxConfig(config);

    // Write the configuration to a file
    const configPath = path.join(NGINX_SITES_PATH, `tunnel-${config.id}.conf`);
    console.log("[DEBUG] Writing config to:", configPath);
    await writeFileAsync(configPath, nginxConfig);

    // Reload Nginx
    await reloadNginx();

    console.log(
      `Added Nginx configuration for tunnel: ${config.id} (${config.subdomain}.${BASE_DOMAIN})`
    );
  } catch (error) {
    console.error("Error adding Nginx configuration:", error);
    throw new Error("Failed to add Nginx configuration");
  }
}

/**
 * Remove an Nginx configuration for a tunnel
 */
export async function removeTunnelConfig(tunnelId: string): Promise<void> {
  try {
    // Remove the configuration file
    const configPath = path.join(NGINX_SITES_PATH, `tunnel-${tunnelId}.conf`);

    // Check if the file exists
    try {
      await accessAsync(configPath, fs.constants.F_OK);
    } catch (error) {
      // File doesn't exist, nothing to do
      console.log(`Nginx configuration not found for tunnel: ${tunnelId}`);
      return;
    }

    // Remove the file
    await unlinkAsync(configPath);

    // Reload Nginx
    await reloadNginx();

    console.log(`Removed Nginx configuration for tunnel: ${tunnelId}`);
  } catch (error) {
    console.error("Error removing Nginx configuration:", error);
    throw new Error("Failed to remove Nginx configuration");
  }
}

/**
 * Reload Nginx
 */
export async function reloadNginx(): Promise<void> {
  try {
    // Test the configuration first
    await execAsync("sudo nginx -t");

    // Reload Nginx
    await execAsync("sudo nginx -s reload");

    console.log("Nginx reloaded successfully");
  } catch (error) {
    console.error("Error reloading Nginx:", error);
    throw new Error("Failed to reload Nginx");
  }
}

export default {
  generateNginxConfig,
  checkNginxAccess,
  addTunnelConfig,
  removeTunnelConfig,
  reloadNginx,
};
