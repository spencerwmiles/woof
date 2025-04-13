# Woof

A simple CLI which provides both a server and a client for exposing services to the public internet.

## Features

- **Secure VPN Connection**: Standard WireGuard VPN setup for secure access to remote resources
- **Standard Port Forwarding**: Access services running on the VPN server from local clients
- **Reverse Port Forwarding**: Expose local development services through a server to the public internet
- **Simple Setup**: Easy-to-follow installation and configuration process for both server and client
- **Cross-platform Support**: Works on Linux (for production/server) and macOS/Windows (for development/testing)

## Architecture

```
┌────────────────┐            ┌───────────────┐            ┌──────────────────┐
│                │            │               │            │                  │
│  Public Users  │───────────▶│     Server    │◀───────────│  Local Developer │
│                │            │  (WireGuard)  │            │   (WireGuard)    │
└────────────────┘            └───────────────┘            └──────────────────┘
        │                             ▲                             ▲
        │                             │                             │
        │                             │                             │
        └─────────────────────────────┘                             │
        HTTP/HTTPS traffic             ◀─────────────────────────────┘
        (Reverse Forwarded)                     VPN tunnel
```

## Project Structure

```
.
├── src/                # All source code (CLI and server)
│   └── ...             # (subfolders for server, api, config, etc.)
├── dist/               # Compiled output (after build)
├── package.json        # Project manifest and scripts
├── tsconfig.json       # TypeScript configuration
├── README.md           # This file
└── ...                 # Other config files
```

## Requirements

- **WireGuard**: You must have [WireGuard](https://www.wireguard.com/install/) installed on both the server and client machines.  
  - On Linux: `sudo apt install wireguard` (Debian/Ubuntu) or `sudo yum install wireguard-tools` (CentOS/Fedora)
  - On macOS: `brew install wireguard-tools`
  - On Windows: [Download from wireguard.com](https://www.wireguard.com/install/)
- **Server**: Linux-based system
- **Client**: macOS, Windows, or Linux machine
- **Networking**: UDP port 51820 must be open on the server
- **Permissions**: Root/sudo access on both server and client
- **Node.js**: v16 or higher
- **pnpm**: v8 or higher

## Setup & Installation

### 1. Install the CLI

You can install the CLI globally from npm:

```bash
pnpm add -g @spencerwmiles/woof
# or
npm install -g @spencerwmiles/woof
```

This will make the `woof` command available globally.

### 2. Ensure WireGuard is Installed

WireGuard is required for all VPN and tunnel operations.  
Check if it's installed:

```bash
wg --version
```

If you see a version number, you're good! If not, install it using the instructions above.

### 3. (Optional) Install pnpm

If you want to develop or run from source, install pnpm:

```bash
npm install -g pnpm
```

## Usage

### Server Setup

Start the server using the CLI:

```bash
woof server start
```

The CLI will prompt for configuration and start the API server.

### Client Usage

Create a tunnel to expose a local port:

```bash
woof up 3000
```

Use a custom subdomain:

```bash
woof up 3000 --subdomain myapp
```

## Development

1. Clone the repository:
   ```bash
   git clone https://github.com/spencerwmiles/woof.git
   cd woof
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the project:
   ```bash
   pnpm build
   ```

4. Run the CLI from source:
   ```bash
   pnpm start -- up 3000
   ```

## License

MIT