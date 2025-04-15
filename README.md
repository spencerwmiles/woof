# woof

```
     .........                                     
   ..:==-..-=...                .........          
...-==-...::.-...............:...-=====-:...       
.-==-:...::..---===*#+=-====::.-:...-====-:..      
..---...::.-=====**#*+==========:::..-====-..      
..:-...::.=======*##+============::..--==-:..      
 .....:..=+***+=-+#*=====+*#*=====-..---=-..       
    :...-*+..:++=+#*===+#*+++*+=-==-..:--..        
      ..=-..==.+++#**++#=..:-.=*=-===-:...         
      ..=:.....-*####***...:...=*=----:..          
      ..-*:.. :*########-.....:+###*+::.-          
       ..=*==*##########*-...+####+-.-=.:          
        ..-*#+:....:+########*#####*+-....:        
         .:*=..::....+#####*#***##*=:.:::.....     
         .:#*:......-*##*###+**#*=-..:-:::::.. ... 
         :.***+:.:=*##***-+*+#*+-...====-:..:::.. .
          ...:....:-===-:-=+*=....-====:...::..... 
             ..:=++=:.:-==-:..:-=====:....:::......
             ..-=================:-:....:::....... 
            ..-*+++++*+***+*==-:.....::::::.::. .. 
            ..:=#***#######*=--:::::::--:::::......
            ..:+#########*+======---=--==--::......
            ...:-*#*#****+++==============-:.....  
            ...:.:*#*##*+*+==============:.::......
             ...:..=*+###*+==========-:::-:..  ..  
              :..:...-=+**+=-==========-:.. . .....                                                                                                                      
```

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

**Note on API Accessibility:** By default, the API server listens on `0.0.0.0` (all network interfaces), making it publicly accessible. To restrict access, set the `API_BIND_ADDR` environment variable before starting the server:

- **Restrict to localhost:** `export API_BIND_ADDR=127.0.0.1`
- **Restrict to WireGuard interface:** `export API_BIND_ADDR=10.8.0.1` (or your server's WireGuard IP)

Then run `woof server start`.

### Client Usage

Create a tunnel to expose a local port:

```bash
woof up 3000
```

Use a custom subdomain:

```bash
woof up 3000 --subdomain myapp
```

## API Security

The Woof API is secured using API key authentication.

### Authentication

All API requests must include a valid API key in the `X-API-Key` header. Requests without a valid API key will be rejected with a 401 Unauthorized response.

Example:
```bash
curl -X GET http://localhost:3000/api/v1/clients \
  -H "X-API-Key: your-api-key-here"
```

### API Key Management

#### Initial Setup

When the server is first started, an initial API key is automatically generated and displayed in the console. **This key will only be shown once**, so make sure to save it securely.

Example console output:
```
=================================================
IMPORTANT: API Key Generated
=================================================
API Key: 3a7c4be1f8d9e2b5a0c6...
This key will not be shown again. Store it securely.
=================================================
```

#### Managing API Keys via CLI

Woof provides CLI commands to manage API keys:

**Create a New API Key** (replaces any existing API key):

```bash
woof api-key create
```

You can optionally provide a name for the key:

```bash
woof api-key create --name "My Custom Key"
```

**Revoke All API Keys**:

```bash
woof api-key revoke
```

Note: After revoking all keys, API access will be unavailable until a new key is created.

#### Configuring API Key for Clients

Before using any client commands that communicate with the server (like `woof up`), you need to configure your client with the API key:

```bash
woof config --api-key YOUR_API_KEY_HERE
```

You can verify your configuration (the key will be shown as masked):

```bash
woof config
```

#### Security Model

Woof uses a simple security model:

- Only one API key can be active at a time
- Creating a new key automatically revokes all previous keys
- All API endpoints require authentication
- There are no permission levels - if you have the key, you have full access

---

## Data Storage & Resetting State

### Where is state stored?

- **Client:** All client configuration, WireGuard config, and tunnel state are stored in `~/.woof` in your home directory.
- **Server:** All server configuration, database, and WireGuard config are stored in `~/.woof/server` in the server's home directory. The server manages its own WireGuard config in `~/.woof/server/wireguard` (not `/etc/wireguard`).

### Resetting/Clearing State

- **Client:**
  To fully clear all client state and bring down any running WireGuard interface, run:
  ```bash
  woof reset
  ```
  This will bring down the WireGuard interface (if running) and delete all files in `~/.woof`.

- **Server:**
  To fully clear all server state, remove all server config, database, and WireGuard config, and clean up any Nginx configs created by Woof, run:
  ```bash
  woof server reset
  ```
  or
  ```bash
  woof server clear
  ```
  This will delete `~/.woof/server`, remove any Nginx configs created by Woof from `/etc/nginx/sites-enabled`, and reload Nginx.

---

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
