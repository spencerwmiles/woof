import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  getWgInterface,
  getWgServerIp,
  getBaseDomain,
} from "../config/index.js";
import { clientsDb, configDb } from "../db/index.js";
import os from "os";

// Promisify exec
const execAsync = promisify(exec);

// Interface for WireGuard peer
export interface WireGuardPeer {
  id: string;
  publicKey: string;
  privateKey?: string;
  assignedIp: string;
  name?: string;
}

// Interface for WireGuard peer status
export interface PeerStatus {
  publicKey: string;
  latestHandshake: number;
  transferRx: number;
  transferTx: number;
  endpoint?: string;
}

// Server configuration paths
const WG_CONFIG_DIR = path.join(os.homedir(), ".woof", "server", "wireguard");
const WG_CONFIG_FILE = path.join(WG_CONFIG_DIR, `${getWgInterface()}.conf`);

interface ConfigValue {
  value: string;
}

/**
 * Initialize WireGuard server
 */
export async function initializeServer(): Promise<void> {
  try {
    // Check if WireGuard is installed
    try {
      await execAsync("which wg");
    } catch (error) {
      throw new Error(
        "WireGuard is not installed. Please install WireGuard first."
      );
    }

    // Generate server keys if they don't exist in the database
    let serverPrivateKey = (
      configDb.get.get("server_private_key") as ConfigValue | undefined
    )?.value;
    let serverPublicKey = (
      configDb.get.get("server_public_key") as ConfigValue | undefined
    )?.value;

    if (!serverPrivateKey || !serverPublicKey) {
      const keys = await generateKeyPair();
      serverPrivateKey = keys.privateKey;
      serverPublicKey = keys.publicKey;

      // Save keys to database
      configDb.set.run("server_private_key", serverPrivateKey);
      configDb.set.run("server_public_key", serverPublicKey);
    }

    // Create WireGuard configuration directory if it doesn't exist
    if (!fs.existsSync(WG_CONFIG_DIR)) {
      await execAsync(`sudo mkdir -p ${WG_CONFIG_DIR}`);
    }

    // Generate WireGuard configuration
    const config = `[Interface]
PrivateKey = ${serverPrivateKey}
Address = ${getWgServerIp()}/24
ListenPort = 51820
SaveConfig = true

# Enable IP forwarding for localhost and WireGuard subnet
PostUp = sysctl -w net.ipv4.ip_forward=1; iptables -A FORWARD -i %i -d 127.0.0.1/32 -j ACCEPT; iptables -A FORWARD -o %i -s 127.0.0.1/32 -j ACCEPT; iptables -A FORWARD -i %i -d 10.8.0.0/24 -j ACCEPT; iptables -A FORWARD -o %i -s 10.8.0.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = sysctl -w net.ipv4.ip_forward=0; iptables -D FORWARD -i %i -d 127.0.0.1/32 -j ACCEPT; iptables -D FORWARD -o %i -s 127.0.0.1/32 -j ACCEPT; iptables -D FORWARD -i %i -d 10.8.0.0/24 -j ACCEPT; iptables -D FORWARD -o %i -s 10.8.0.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE`;

    // Write configuration to file
    await execAsync(`echo '${config}' | sudo tee ${WG_CONFIG_FILE}`);
    await execAsync(`sudo chmod 600 ${WG_CONFIG_FILE}`);

    // Enable IP forwarding
    await execAsync("echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward");

    // Bring up the interface
    try {
      await execAsync(`sudo wg-quick down ${WG_CONFIG_FILE}`);
    } catch (error) {
      // Ignore errors when bringing down non-existent interface
    }
    await execAsync(`sudo wg-quick up ${WG_CONFIG_FILE}`);

    console.log(
      `WireGuard interface ${getWgInterface()} initialized successfully`
    );
  } catch (error) {
    console.error("Error initializing WireGuard server:", error);
    throw new Error("Failed to initialize WireGuard server");
  }
}

/**
 * Generate WireGuard key pair
 */
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  try {
    // Generate private key
    const { stdout: privateKey } = await execAsync("wg genkey");
    const privateKeyTrimmed = privateKey.trim();

    // Generate public key from private key
    const { stdout: publicKey } = await execAsync(
      `echo "${privateKeyTrimmed}" | wg pubkey`
    );
    const publicKeyTrimmed = publicKey.trim();

    return {
      privateKey: privateKeyTrimmed,
      publicKey: publicKeyTrimmed,
    };
  } catch (error) {
    console.error("Error generating WireGuard key pair:", error);
    throw new Error("Failed to generate WireGuard key pair");
  }
}

/**
 * Get the next available IP address for a client
 */
export function getNextAvailableIp(): string {
  // Get the last assigned IP from the database
  const lastIpResult = configDb.get.get("last_assigned_ip") as
    | { value: string }
    | undefined;
  const lastIp = lastIpResult?.value || getWgServerIp();

  // Split the IP into parts
  const ipParts = lastIp.split(".");

  // Increment the last part
  let lastPart = parseInt(ipParts[3], 10);
  lastPart = (lastPart + 1) % 255;

  // If we've wrapped around to 0, increment the third part
  if (lastPart === 0) {
    let thirdPart = parseInt(ipParts[2], 10);
    thirdPart = (thirdPart + 1) % 255;
    ipParts[2] = thirdPart.toString();
  }

  // Set the last part
  ipParts[3] = lastPart.toString();

  // Join the parts back together
  const nextIp = ipParts.join(".");

  // Update the last assigned IP in the database
  configDb.set.run("last_assigned_ip", nextIp);

  return nextIp;
}

/**
 * Add a WireGuard peer
 */
export async function addPeer(peer: WireGuardPeer): Promise<void> {
  try {
    console.log(
      `[DEBUG] addPeer called for peer: ${peer.id}, publicKey: ${peer.publicKey}, assignedIp: ${peer.assignedIp}`
    );
    // Add the peer to WireGuard
    await execAsync(
      `sudo wg set ${getWgInterface()} peer ${peer.publicKey} allowed-ips ${
        peer.assignedIp
      }/32`
    );
    console.log(`[DEBUG] wg set command succeeded for peer: ${peer.id}`);

    // Save the peer to the database
    clientsDb.create.run(
      peer.id,
      peer.name || "",
      peer.publicKey,
      peer.privateKey || "",
      peer.assignedIp,
      Date.now()
    );
    console.log(`[DEBUG] Peer saved to database: ${peer.id}`);

    console.log(`Added WireGuard peer: ${peer.id} (${peer.assignedIp})`);
  } catch (error) {
    console.error(
      `[ERROR] Error adding WireGuard peer (publicKey: ${peer.publicKey}, assignedIp: ${peer.assignedIp}):`,
      error
    );
    throw new Error("Failed to add WireGuard peer");
  }
}

/**
 * Remove a WireGuard peer
 */
export async function removePeer(peerId: string): Promise<void> {
  try {
    // Get the peer from the database
    const peer = clientsDb.getById.get(peerId) as WireGuardPeer | undefined;

    if (!peer) {
      throw new Error(`Peer not found: ${peerId}`);
    }

    // Remove the peer from WireGuard
    await execAsync(
      `sudo wg set ${getWgInterface()} peer ${peer.publicKey} remove`
    );

    // Remove the peer from the database
    clientsDb.delete.run(peerId);

    console.log(`Removed WireGuard peer: ${peerId} (${peer.assignedIp})`);
  } catch (error) {
    console.error("Error removing WireGuard peer:", error);
    throw new Error("Failed to remove WireGuard peer");
  }
}

/**
 * Get the status of all WireGuard peers
 */
export async function getPeerStatus(): Promise<PeerStatus[]> {
  try {
    // Get the status of all peers
    const { stdout } = await execAsync(`sudo wg show ${getWgInterface()} dump`);
    console.log("[DEBUG] Raw wg show dump output:\n", stdout);

    // Parse the output
    const lines = stdout.trim().split("\n");

    // Skip the first line (header)
    const peerLines = lines.slice(1);

    // Parse each peer line
    const peerStatusArr = peerLines.map((line) => {
      const parts = line.split("\t");

      return {
        publicKey: parts[0],
        latestHandshake: parseInt(parts[4], 10),
        transferRx: parseInt(parts[5], 10),
        transferTx: parseInt(parts[6], 10),
        endpoint: parts[3] !== "(none)" ? parts[3] : undefined,
      };
    });

    console.log(
      "[DEBUG] Parsed peer status array:",
      JSON.stringify(peerStatusArr, null, 2)
    );
    return peerStatusArr;
  } catch (error) {
    console.error("Error getting WireGuard peer status:", error);
    throw new Error("Failed to get WireGuard peer status");
  }
}

/**
 * Generate a client configuration
 */
export function generateClientConfig(
  peer: WireGuardPeer,
  serverPublicKey: string,
  serverEndpoint: string
): string {
  const config = `
[Interface]
PrivateKey = ${peer.privateKey}
Address = ${peer.assignedIp}/32
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${serverEndpoint}
# Allow traffic to/from localhost and WireGuard peers
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
`;

  return config.trim();
}

/**
 * Register a new client
 */
export async function registerClient(name?: string): Promise<WireGuardPeer> {
  // Generate a unique ID
  const id = uuidv4();

  // Generate WireGuard key pair
  const { publicKey, privateKey } = await generateKeyPair();

  // Get the next available IP
  const assignedIp = getNextAvailableIp();

  // Create the peer
  const peer: WireGuardPeer = {
    id,
    publicKey,
    privateKey,
    assignedIp,
    name,
  };

  // Add the peer
  await addPeer(peer);

  return peer;
}

/**
 * Get the server's public IP or hostname
 */
export async function getServerEndpoint(): Promise<string> {
  // 1. Use BASE_DOMAIN if explicitly configured
  const baseDomain = getBaseDomain(); // Get domain from config DB
  if (baseDomain) {
    console.log(`Using configured BASE_DOMAIN for endpoint: ${baseDomain}`);
    return `${baseDomain}:51820`;
  }

  // 2. Try to get public IP using ipify.org
  try {
    console.log("Attempting to determine public IP via ipify.org...");
    const { stdout } = await execAsync("curl -s https://api.ipify.org");
    const publicIp = stdout.trim();
    if (publicIp) {
      console.log(`Determined public IP: ${publicIp}`);
      return `${publicIp}:51820`;
    }
  } catch (ipifyError) {
    console.warn("Could not determine public IP via ipify.org:", ipifyError);
  }

  // 3. Fallback: Use the WireGuard Server IP (might only work locally)
  // This is less ideal as it might not be reachable externally.
  // Fallback: Use the WireGuard Server IP (might only work locally)
  const wgServerIp = getWgServerIp();
  console.warn(
    `Could not determine public endpoint. Falling back to WG_SERVER_IP: ${wgServerIp}. This might not be reachable externally.`
  );
  if (wgServerIp) {
    return `${wgServerIp}:51820`;
  }

  // 4. If all else fails, throw an error
  throw new Error(
    "Failed to determine server endpoint. Configure BASE_DOMAIN or ensure public IP is discoverable."
  );
}

export default {
  generateKeyPair,
  getNextAvailableIp,
  addPeer,
  removePeer,
  getPeerStatus,
  generateClientConfig,
  registerClient,
  initializeServer,
  getServerEndpoint,
};
