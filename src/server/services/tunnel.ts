import { v4 as uuidv4 } from "uuid";
import { tunnelsDb, clientsDb, configDb } from "../db/index.js";
import nginxService from "./nginx.js";

// Interface for tunnel creation request
export interface CreateTunnelRequest {
  clientId: string;
  localPort: number;
  subdomain?: string;
}

// Interface for tunnel
export interface Tunnel {
  id: string;
  clientId: string;
  localPort: number;
  publicSubdomain: string;
  assignedIp: string;
  startTime: number;
  endTime?: number;
  status: "active" | "closed" | "error";
  bytesSent: number;
  bytesReceived: number;
  requestCount: number;
  publicUrl: string;
}

/**
 * Generate a random subdomain
 */
function generateRandomSubdomain(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get the public URL for a tunnel
 */
export function getTunnelUrl(tunnel: Tunnel): string {
  const domain = (configDb.get.get("domain") as any)?.value;
  if (!domain) {
    throw new Error("Domain not configured");
  }
  return `https://${tunnel.publicSubdomain}.${domain}`;
}

/**
 * Create a new tunnel
 */
export async function createTunnel(
  request: CreateTunnelRequest
): Promise<Tunnel> {
  try {
    // Get the client
    const client = clientsDb.getById.get(request.clientId) as any;

    // Close any existing active tunnels for this client
    const activeTunnels = tunnelsDb.getActiveByClientId.all(
      request.clientId
    ) as any[];
    for (const tunnel of activeTunnels) {
      try {
        await exports.closeTunnel(tunnel.id);
        console.log(
          `[DEBUG] Closed existing active tunnel for client ${request.clientId}: ${tunnel.id}`
        );
      } catch (err) {
        console.error(
          `[ERROR] Failed to close tunnel ${tunnel.id} for client ${request.clientId}:`,
          err
        );
      }
    }

    if (!client) {
      throw new Error(`Client not found: ${request.clientId}`);
    }

    // Generate a tunnel ID
    const id = uuidv4();

    // Generate a subdomain if not provided
    const subdomain = request.subdomain || generateRandomSubdomain();

    // Check if the subdomain is already in use
    const existingTunnel = tunnelsDb.getBySubdomain.get(subdomain) as any;

    if (existingTunnel) {
      throw new Error(`Subdomain already in use: ${subdomain}`);
    }

    // Create the tunnel in the database
    const now = Date.now();
    tunnelsDb.create.run(
      id,
      request.clientId,
      request.localPort,
      subdomain,
      now,
      "active"
    );

    // Configure Nginx
    await nginxService.addTunnelConfig({
      id,
      clientId: request.clientId,
      subdomain,
      targetIp: client.assigned_ip,
      targetPort: request.localPort,
    });

    // Create the tunnel object
    const tunnel: Tunnel = {
      id,
      clientId: request.clientId,
      localPort: request.localPort,
      publicSubdomain: subdomain,
      assignedIp: client.assigned_ip,
      startTime: now,
      status: "active" as const,
      bytesSent: 0,
      bytesReceived: 0,
      requestCount: 0,
      publicUrl: getTunnelUrl({
        id,
        clientId: request.clientId,
        localPort: request.localPort,
        publicSubdomain: subdomain,
        assignedIp: client.assigned_ip,
        startTime: now,
        status: "active",
        bytesSent: 0,
        bytesReceived: 0,
        requestCount: 0,
        publicUrl: "", // Temporary value, will be replaced by getTunnelUrl
      }),
    };

    return tunnel;
  } catch (error: any) {
    console.error("Error creating tunnel:", error);
    throw new Error(
      `Failed to create tunnel: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Close a tunnel
 */
export async function closeTunnel(tunnelId: string): Promise<void> {
  try {
    // Get the tunnel
    const tunnel = tunnelsDb.getById.get(tunnelId) as any;

    if (!tunnel) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    // Update the tunnel status and end time
    const now = Date.now();
    tunnelsDb.updateStatus.run("closed", tunnelId);
    tunnelsDb.updateEndTime.run(now, tunnelId);

    // Remove the Nginx configuration
    await nginxService.removeTunnelConfig(tunnelId);

    console.log(`Closed tunnel: ${tunnelId}`);
  } catch (error: any) {
    console.error("Error closing tunnel:", error);
    throw new Error(
      `Failed to close tunnel: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Get a tunnel by ID
 */
export function getTunnel(tunnelId: string): Tunnel | null {
  try {
    // Get the tunnel from the database
    const tunnel = tunnelsDb.getById.get(tunnelId) as any;

    if (!tunnel) {
      return null;
    }

    // Convert to Tunnel interface
    const tunnelObj: Tunnel = {
      id: tunnel.id,
      clientId: tunnel.client_id,
      localPort: tunnel.local_port,
      publicSubdomain: tunnel.public_subdomain,
      assignedIp: tunnel.assigned_ip,
      startTime: tunnel.start_time,
      endTime: tunnel.end_time,
      status: tunnel.status as "active" | "closed" | "error",
      bytesSent: tunnel.bytes_sent,
      bytesReceived: tunnel.bytes_received,
      requestCount: tunnel.request_count,
      publicUrl: getTunnelUrl({
        id: tunnel.id,
        clientId: tunnel.client_id,
        localPort: tunnel.local_port,
        publicSubdomain: tunnel.public_subdomain,
        assignedIp: tunnel.assigned_ip,
        startTime: tunnel.start_time,
        endTime: tunnel.end_time,
        status: tunnel.status as "active" | "closed" | "error",
        bytesSent: tunnel.bytes_sent,
        bytesReceived: tunnel.bytes_received,
        requestCount: tunnel.request_count,
        publicUrl: "", // Temporary value, will be replaced by getTunnelUrl
      }),
    };

    return tunnelObj;
  } catch (error: any) {
    console.error("Error getting tunnel:", error);
    return null;
  }
}

/**
 * List active tunnels
 */
export function listActiveTunnels(): Tunnel[] {
  try {
    // Get all active tunnels from the database
    const tunnels = tunnelsDb.listActive.all() as any[];

    // Convert to Tunnel interface
    return tunnels.map((tunnel) => {
      const tunnelObj: Tunnel = {
        id: tunnel.id,
        clientId: tunnel.client_id,
        localPort: tunnel.local_port,
        publicSubdomain: tunnel.public_subdomain,
        assignedIp: tunnel.assigned_ip,
        startTime: tunnel.start_time,
        endTime: tunnel.end_time,
        status: tunnel.status as "active" | "closed" | "error",
        bytesSent: tunnel.bytes_sent,
        bytesReceived: tunnel.bytes_received,
        requestCount: tunnel.request_count,
        publicUrl: getTunnelUrl({
          id: tunnel.id,
          clientId: tunnel.client_id,
          localPort: tunnel.local_port,
          publicSubdomain: tunnel.public_subdomain,
          assignedIp: tunnel.assigned_ip,
          startTime: tunnel.start_time,
          endTime: tunnel.end_time,
          status: tunnel.status as "active" | "closed" | "error",
          bytesSent: tunnel.bytes_sent,
          bytesReceived: tunnel.bytes_received,
          requestCount: tunnel.request_count,
          publicUrl: "", // Temporary value, will be replaced by getTunnelUrl
        }),
      };

      return tunnelObj;
    });
  } catch (error: any) {
    console.error("Error listing active tunnels:", error);
    return [];
  }
}

/**
 * Update tunnel metrics
 */
export function updateTunnelMetrics(
  tunnelId: string,
  bytesSent: number,
  bytesReceived: number,
  requestCount: number
): void {
  try {
    // Update the tunnel metrics
    tunnelsDb.updateMetrics.run(
      bytesSent,
      bytesReceived,
      requestCount,
      tunnelId
    );
  } catch (error: any) {
    console.error("Error updating tunnel metrics:", error);
  }
}

export default {
  createTunnel,
  closeTunnel,
  getTunnel,
  listActiveTunnels,
  updateTunnelMetrics,
  getTunnelUrl,
};
