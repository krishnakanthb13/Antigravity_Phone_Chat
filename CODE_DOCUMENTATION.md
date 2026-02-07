# CODE DOCUMENTATION - Antigravity Phone Connect

## Project Structure
```text
antigravity_phone_chat/
├── server.js                       # Main Node.js server (Express + WebSocket + CDP + HTTPS)
├── generate_ssl.js                 # SSL certificate generator (pure Node.js, no OpenSSL needed)
├── ui_inspector.js                 # Utility for inspecting Antigravity UI via CDP
├── public/
│   ├── index.html                  # Mobile-optimized web frontend
│   ├── css/
│   │   └── style.css               # Main stylesheet (App aesthetics & layout)
│   └── js/
│       └── app.js                  # Client-side logic (WebSocket, API calls, UI interactions)
├── certs/                          # SSL certificates directory (auto-generated, gitignored)
│   ├── server.key                  # Private key
│   └── server.cert                 # Self-signed certificate
├── start_ag_phone_connect.bat      # Standard Windows launcher (LAN)
├── start_ag_phone_connect_web.bat  # Web Windows launcher (Starts server + Global Tunnel)
├── start_ag_phone_connect.sh       # Standard Mac/Linux launcher (LAN)
├── start_ag_phone_connect_web.sh   # Web Mac/Linux launcher (Starts server + Global Tunnel)
├── start_ag_phone_connect_web.sh   # Web Mac/Linux launcher (Starts server + Global Tunnel)
├── launcher.py                     # Unified Python launcher (Manages Server, Tunnel, QR Codes)
├── .env                            # Local configuration (Passwords & API Tokens - gitignored)
├── .env.example                    # Template for environment variables
├── package.json                    # Dependencies and metadata
├── LICENSE                         # GPL v3 License
└── README.md                       # Quick-start guide
```

## High-Level Architecture
The system acts as a "Headless Mirror" of the Antigravity session running on a Desktop machine. It utilizes the **Chrome DevTools Protocol (CDP)** to bridge the gap between a local Antigravity instance and a remote mobile browser.

### Data Flow
```mermaid
graph TD
    AG[Antigravity] -- CDP Snapshots --> S[Node.js Server]
    S -- WebSocket Status --> P[Phone Frontend]
    P -- GET /snapshot --> S
    P -- POST /login --> S
    S -- Cookie Auth --> P
    T[ngrok Tunnel] -- Proxy --> S
    P[Phone Frontend] -- Mobile Data --> T
    S -- CDP Commands --> AG
    PY[launcher.py Manager] -- Spawns/Kills --> S
    PY -- Monitors --> T
```

## Core Modules & Methods (server.js)

| Module/Function | Description |
| :--- | :--- |
| `killPortProcess()` | Automatically kills any existing process on the server port (prevents EADDRINUSE errors). Works on Windows/Linux/macOS. |
| `getLocalIP()` | Detects local network IP address for mobile access display. |
| `discoverCDP()` | Scans ports (9000-9003) to find the Antigravity instance. |
| `connectCDP()` | Establishes CDP WebSocket with centralized message handling (prevents memory leaks). Uses `pendingCalls` Map with 30s timeout. |
| `captureSnapshot()` | Injects JS into Antigravity to clone the chat DOM, extract CSS, and return it. |
| `loadSnapshot()` (Client) | Renders the HTML snapshot and injects CSS overrides for dark mode. |
| `injectMessage()` | Locates the Antigravity input field and simulates typing/submission. Uses `JSON.stringify` for safe escaping. |
| `setMode()` / `setModel()` | Robust text-based selectors to change AI settings remotely. |
| `clickElement()` | Relays a physical click from the phone to a specific element index on Desktop. |
| `remoteScroll()` | Syncs phone scroll position to Desktop Antigravity chat. |
| `getAppState()` | Syncs Mode/Model status and detects history visibility. |
| `gracefulShutdown()` | Handles SIGINT/SIGTERM for clean server shutdown. |
| `createServer()` | Creates Express app with automatic HTTP/HTTPS detection based on SSL cert availability. |

## API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/login` | POST | Authenticates user and sets session cookie. |
| `/logout` | POST | Clears session cookie. |
| `/health` | GET | Returns server status, CDP connection state, and uptime. |
| `/snapshot` | GET | Returns latest captured HTML/CSS snapshot. |
| `/app-state` | GET | Returns current Mode (Fast/Planning) and Model. |
| `/ssl-status` | GET | Returns HTTPS status and certificate info. |
| `/send` | POST | Sends a message to the Antigravity chat. Always returns 200 (optimistic). |
| `/stop` | POST | Stops the current AI generation. |
| `/set-mode` | POST | Changes mode to Fast or Planning. |
| `/set-model` | POST | Changes the AI model. |
| `/remote-click` | POST | Triggers a click event on Desktop (for Thought expansion). |
| `/remote-scroll` | POST | Syncs phone scroll position to Desktop Antigravity. |
| `/generate-ssl` | POST | Generates SSL certificates (for HTTPS setup via UI). |
| `/debug-ui` | GET | Returns serialized UI tree for debugging. |

## Security & Authentication

### 1. Global Web Access (Tunneling)
When using the `_web` launcher, the system utilizes `ngrok` to create a secure tunnel. 
- **Unified Manager**: `launcher.py` acts as a supervisor, spawning the Node.js server as a child process. This ensures that when the tunnel is closed (Ctrl+C), the server is also reliably terminated.
- **Magic Links**: In Web Mode, the launcher generates a "Magic QR Code" that includes the `?key=PASSWORD` parameter, allowing for instant, zero-typing auto-login on mobile.
- **Auto-Protocol Detection**: `launcher.py` detects if the local server is running HTTPS and configures the tunnel accordingly.
- **Passcode Generation**: If no `APP_PASSWORD` is set in `.env`, a temporary 6-digit numeric passcode is generated for the session.
- **Setup Assistant**: Launchers check for `.env`; if missing, they automatically create it using `.env.example` as a template and instruct the user to update it.

### 2. Password Protection
- **Session Management**: Uses signed, `httpOnly` cookies for maximum browser security.
- **Conditional Auth**: Requests from local network IPs (LAN) are automatically exempted from password checks for convenience.
- **WebSocket Auth**: Secure WebSockets verify credentials during the handshake.

### Setup (First Time)
1. **Get an ngrok Token**: Sign up for free at [ngrok.com](https://ngrok.com) and get your "Authtoken".
2. **Automatic Configuration**: Simply run any launcher script. They will detect if `.env` is missing and create it from `.env.example`.
3. **Manual Setup**: Alternatively, create a `.env` file manually or copy the example:
   ```bash
   cp .env.example .env
   ```
   Then update `NGROK_AUTHTOKEN`, `APP_PASSWORD`, and any AI provider keys (e.g., `GROQ_API_KEY`).

### 3. HTTPS/SSL Support
The server automatically detects SSL certificates and enables HTTPS:

1. **Certificate Generation**: Run `node generate_ssl.js`
   - **Hybrid approach**: Tries OpenSSL first (better SAN support), falls back to Node.js crypto
   - Automatically detects local IP addresses for certificate SANs
2. **Auto-Detection**: Server checks for `certs/server.key` and `certs/server.cert`
3. **Protocol Selection**: Uses HTTPS if certs exist, HTTP otherwise
4. **WebSocket**: Automatically uses `wss://` for secure WebSocket when HTTPS is enabled
5. **Web UI**: Users can generate certificates via the "Enable HTTPS" button when running HTTP

## Dependencies

- **Express**: HTTP/HTTPS server for UI and API endpoints.
- **ws**: WebSocket implementation for real-time update notifications.
- **os**: Node.js built-in for local IP detection.
- **fs**: Node.js built-in for SSL certificate file reading.
- **https**: Node.js built-in for secure server (when SSL enabled).
- **Chrome DevTools Protocol (CDP)**: The underlying bridge to Antigravity's browser-based UI.

## Execution Flow

> ⚠️ **The order of these steps matters!** Always start Antigravity with an active chat BEFORE running the server.

### Required Startup Sequence:

1. **Start Antigravity in Debug Mode**
   - Launch Antigravity with: `antigravity . --remote-debugging-port=9000`
   - Or use the context menu: Right-click folder → "Open with Antigravity (Debug)"

2. **Open or Start a Chat**
   - Open an existing chat from the bottom-right panel, OR
   - Start a new chat by typing a message
      - ⚠️ The server requires an active chat (the `#conversation` or `#cascade` element) to capture snapshots

3. **Run the Server** (`start_ag_phone_connect.bat` or `.sh`)
   - **Port Cleanup**: Server automatically kills any existing process on port 3000
   - **CDP Discovery**: Scans ports 9000-9003 to find the running Antigravity instance
   - **SSL Check**: Checks for certificates in `./certs/` and enables HTTPS if found
   - **Polling Starts**: Once connected, polls the UI every 1 second for changes

4. **Connect Your Phone**
   - Open the URL shown in terminal (e.g., `https://192.168.1.5:3000`)
   - Accept SSL certificate warning on first visit
   - Phone receives snapshots via WebSocket notifications

### Runtime Behavior:

- **Snapshot Updates**: If content hash changes, clients are notified via WebSocket
- **Rendering**: Mobile client fetches latest HTML/CSS and renders in a sandboxed div
- **History Management**: 
    - A dedicated **History Icon** in the mobile header allows toggling a full-screen drawer.
    - The drawer displays recently opened chats captured from the desktop's history panel.
    - Tapping a history item triggers a remote click on the desktop to switch conversations.
- **Scroll Sync**: Phone scroll position syncs to Desktop with user scroll lock protection
- **Shutdown**: On SIGINT/SIGTERM, server gracefully closes all connections before exit

## Security Considerations

- **Self-Signed Certificates**: The generated certificates are self-signed and browser will show a warning on first visit.
- **Local Network Only**: By default, only accessible on LAN. Not exposed to internet.
- **No Authentication**: Currently no auth layer - anyone on the same network can access.
- **Input Sanitization**: User input is escaped using `JSON.stringify` before CDP injection.

> 📚 For detailed security information, browser warning bypass instructions, and recommendations, see [SECURITY.md](SECURITY.md).

## Technical Implementation Details (Advanced)

### Synchronization Philosophy: "Phone-as-Master"
The system utilizes a unidirectional master-slave architecture for state management when active:
- **Interaction Priority**: The mobile device is treated as the **Master Controller**. Any manual interaction (scrolling, clicking, typing) on the phone triggers an immediate CDP command to the Desktop.
- **Scroll Synchronization**: Synchronization is strictly **Phone → Desktop**. This design choice prevents "sync-fighting" conflicts and allows the mobile user to maintain a stable viewport regardless of background window movement on the Desktop.
- **Master-Slave Rebalancing**:
    - **Lock Duration**: A `3000ms` lock is applied when the user touches the phone screen, protecting the mobile viewport from auto-scroll triggers caused by incoming message events.
    - **Idle State**: After `5000ms` of inactivity, the phone enters an "Observation Mode" where it allows auto-scrolling to follow new incoming chat content.

### Performance & Processing Efficiency
- **Snapshot Polling**: The server polls the Antigravity CDP endpoint every `1000ms` to check for UI changes.
- **Delta Detection**: To minimize processing pressure, the system calculates a 36-char hash of the captured HTML. A full broadcast (Snapshot Update) ONLY occurs if the hash changes.
- **Interaction Overhead**: Typical POST interactions (sending a message or changing a model) have a latency overhead of `<100ms`, making the remote interaction feel near-instant.
