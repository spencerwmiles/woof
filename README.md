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

This project is now a single-app, flat structure:

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

- **Server**: Linux-based system
- **Client**: macOS, Windows, or Linux machine
- **Networking**: UDP port 51820 must be open on the server
- **Permissions**: Root/sudo access on both server and client
- **Node.js**: v16 or higher
- **pnpm**: v8 or higher

## Getting Started

### pnpm Setup

Before installing dependencies, make sure pnpm is properly set up:

1. Install pnpm if you haven't already:
   ```bash
   npm install -g pnpm
   ```

2. Run pnpm setup to configure the global bin directory:
   ```bash
   pnpm setup
   ```

3. Add pnpm to your PATH (follow the instructions from the setup command)

4. Restart your terminal or source your shell configuration file:
   ```bash
   # For bash
   source ~/.bashrc
   # For zsh
   source ~/.zshrc
   ```

### Installation

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

### Server Setup

1. Start the server using the CLI:
   ```bash
   pnpm start -- server start
   ```
   Or, if globally linked:
   ```bash
   woof server start
   ```

   The CLI will prompt for configuration and start the API server.

### Client Usage

1. Build and link the CLI:
   ```bash
   pnpm build

   # Option 1: Run directly from the repo
   pnpm start -- up 3000

   # Option 2: Create a symlink to use globally (if pnpm global bin is set up)
   pnpm link --global
   ```

2. Create a tunnel to expose a local port:
   ```bash
   woof up 3000
   ```

3. Use a custom subdomain:
   ```bash
   woof up 3000 --subdomain myapp
   ```

## Development

1. Start the development server:
   ```bash
   pnpm dev
   ```

2. Run tests:
   ```bash
   pnpm test
   ```

## License

MIT