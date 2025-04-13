import express from "express";
import { v4 as uuidv4 } from "uuid";
import wireguardService from "../services/wireguard.js";
import { clientsDb, configDb } from "../db/index.js";
import { getServerEndpoint } from "../services/wireguard.js";

interface ConfigValue {
  value: string;
}

const router: express.Router = express.Router();

// Register a new client
router.post("/register", async (req, res) => {
  try {
    const { name } = req.body;

    // Register a new client
    const client = await wireguardService.registerClient(name);

    // Get the server's public key from the database
    const serverPublicKey = (
      configDb.get.get("server_public_key") as ConfigValue | undefined
    )?.value;
    if (!serverPublicKey) {
      throw new Error("Server public key not found");
    }

    // Get the server's endpoint
    const serverEndpoint = await wireguardService.getServerEndpoint();

    // Generate client configuration
    const clientConfig = wireguardService.generateClientConfig(
      client,
      serverPublicKey,
      serverEndpoint
    );

    // Return the client information and configuration
    res.status(201).json({
      client: {
        id: client.id,
        name: client.name || "",
        assignedIp: client.assignedIp,
      },
      config: clientConfig,
    });
  } catch (error: any) {
    console.error("Error registering client:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to register client" });
  }
});

// Get a client by ID
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Get the client from the database
    const client = clientsDb.getById.get(id) as any;

    if (!client) {
      return res.status(404).json({ error: `Client not found: ${id}` });
    }

    // Return the client information (excluding private key)
    res.json({
      id: client.id,
      name: client.name,
      publicKey: client.public_key,
      assignedIp: client.assigned_ip,
      createdAt: client.created_at,
      lastSeen: client.last_seen,
      isActive: Boolean(client.is_active),
    });
  } catch (error: any) {
    console.error("Error getting client:", error);
    res.status(500).json({ error: error.message || "Failed to get client" });
  }
});

// List all active clients
router.get("/", (req, res) => {
  try {
    // Get all active clients from the database
    const clients = clientsDb.listActive.all() as any[];

    // Return the client information (excluding private keys)
    res.json(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        publicKey: client.public_key,
        assignedIp: client.assigned_ip,
        createdAt: client.created_at,
        lastSeen: client.last_seen,
        isActive: Boolean(client.is_active),
      }))
    );
  } catch (error: any) {
    console.error("Error listing clients:", error);
    res.status(500).json({ error: error.message || "Failed to list clients" });
  }
});

// Update a client's active status
router.patch("/:id/status", (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }

    // Get the client from the database
    const client = clientsDb.getById.get(id) as any;

    if (!client) {
      return res.status(404).json({ error: `Client not found: ${id}` });
    }

    // Update the client's active status
    clientsDb.updateActiveStatus.run(isActive ? 1 : 0, id);

    res.json({
      message: `Client ${id} status updated to ${
        isActive ? "active" : "inactive"
      }`,
    });
  } catch (error: any) {
    console.error("Error updating client status:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to update client status" });
  }
});

// Delete a client
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get the client from the database
    const client = clientsDb.getById.get(id) as any;

    if (!client) {
      return res.status(404).json({ error: `Client not found: ${id}` });
    }

    // Remove the client's WireGuard peer
    await wireguardService.removePeer(id);

    res.json({ message: `Client ${id} deleted` });
  } catch (error: any) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: error.message || "Failed to delete client" });
  }
});

export default router;
