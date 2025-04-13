import express from "express";
import clientRoutes from "./clients.js";
import tunnelRoutes from "./tunnels.js";
import fs from "fs";
const packageJson = JSON.parse(
  fs.readFileSync(new URL("../../../package.json", import.meta.url), "utf-8")
);

// Create router
const router: express.Router = express.Router();

// Basic API info route
router.get("/", (req, res) => {
  res.json({
    name: "Dev Tunnel API",
    version: packageJson.version,
    endpoints: ["/clients", "/tunnels"],
  });
});

// Mount routes
router.use("/clients", clientRoutes);
router.use("/tunnels", tunnelRoutes);

// Register endpoint (shortcut to /clients/register)
router.post("/register", (req, res, next) => {
  // Just redirect to the clients register endpoint
  res.redirect(307, "./clients/register");
});

// Export router
export default router;
