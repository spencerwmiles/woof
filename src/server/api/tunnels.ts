import express from "express";
import tunnelService from "../services/tunnel.js";

const router: express.Router = express.Router();

// Create a new tunnel
router.post("/", async (req, res) => {
  try {
    const { clientId, localPort, subdomain } = req.body;

    // Validate request
    if (!clientId) {
      return res.status(400).json({ error: "clientId is required" });
    }

    if (!localPort || typeof localPort !== "number") {
      return res.status(400).json({ error: "localPort must be a number" });
    }

    // Create the tunnel
    const tunnel = await tunnelService.createTunnel({
      clientId,
      localPort,
      subdomain,
    });

    // Return the tunnel information
    res.status(201).json({
      tunnel: {
        id: tunnel.id,
        clientId: tunnel.clientId,
        localPort: tunnel.localPort,
        publicSubdomain: tunnel.publicSubdomain,
        publicUrl: tunnelService.getTunnelUrl(tunnel),
        startTime: tunnel.startTime,
        status: tunnel.status,
      },
    });
  } catch (error: any) {
    console.error("Error creating tunnel:", error);
    res.status(500).json({ error: error.message || "Failed to create tunnel" });
  }
});

// Get a tunnel by ID
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Get the tunnel
    const tunnel = tunnelService.getTunnel(id);

    if (!tunnel) {
      return res.status(404).json({ error: `Tunnel not found: ${id}` });
    }

    // Return the tunnel information
    res.json({
      id: tunnel.id,
      clientId: tunnel.clientId,
      localPort: tunnel.localPort,
      publicSubdomain: tunnel.publicSubdomain,
      publicUrl: tunnelService.getTunnelUrl(tunnel),
      startTime: tunnel.startTime,
      endTime: tunnel.endTime,
      status: tunnel.status,
      bytesSent: tunnel.bytesSent,
      bytesReceived: tunnel.bytesReceived,
      requestCount: tunnel.requestCount,
    });
  } catch (error: any) {
    console.error("Error getting tunnel:", error);
    res.status(500).json({ error: error.message || "Failed to get tunnel" });
  }
});

// List active tunnels
router.get("/", (req, res) => {
  try {
    // Get all active tunnels
    const tunnels = tunnelService.listActiveTunnels();

    // Return the tunnel information
    res.json(
      tunnels.map((tunnel) => ({
        id: tunnel.id,
        clientId: tunnel.clientId,
        localPort: tunnel.localPort,
        publicSubdomain: tunnel.publicSubdomain,
        publicUrl: tunnelService.getTunnelUrl(tunnel),
        startTime: tunnel.startTime,
        status: tunnel.status,
        bytesSent: tunnel.bytesSent,
        bytesReceived: tunnel.bytesReceived,
        requestCount: tunnel.requestCount,
      }))
    );
  } catch (error: any) {
    console.error("Error listing tunnels:", error);
    res.status(500).json({ error: error.message || "Failed to list tunnels" });
  }
});

// Close a tunnel
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get the tunnel
    const tunnel = tunnelService.getTunnel(id);

    if (!tunnel) {
      return res.status(404).json({ error: `Tunnel not found: ${id}` });
    }

    // Close the tunnel
    await tunnelService.closeTunnel(id);

    res.json({ message: `Tunnel ${id} closed` });
  } catch (error: any) {
    console.error("Error closing tunnel:", error);
    res.status(500).json({ error: error.message || "Failed to close tunnel" });
  }
});

export default router;
