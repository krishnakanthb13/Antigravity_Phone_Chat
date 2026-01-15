# Mobile Chat Monitor

Web server for monitoring Antigravity chat from mobile devices with visual snapshots.

## Features

✅ **Smart Refresh**
- Auto-updates every 3 seconds when chat content changes
- Preserves scroll position during refresh
- Pauses automatically when user is scrolling
- Resumes after 10 seconds of idle time

✅ **Mobile-Friendly UI**
- Responsive design optimized for phones/tablets
- Touch-friendly controls
- Visual replica of Antigravity chat with all styling

✅ **Message Injection**
- Send messages to Antigravity directly from mobile
- Auto-resize text input
- Visual feedback on send status

✅ **Controls**
- Pause/Resume auto-refresh
- Manual refresh button
- Scroll to bottom FAB
- Connection status indicator

## Quick Start

### 1. Start VS Code with CDP
```bash
code --remote-debugging-port=9000
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Server
```bash
npm run server
```

### 4. Access from Mobile
Open your browser and navigate to:
```
http://<your-computer-ip>:3000
```

**Finding your IP:**
- Linux: `ip addr show | grep inet`
- macOS: `ifconfig | grep inet`
- Windows: `ipconfig`

Use your local network IP (usually starts with `192.168.` or `10.`)

## Configuration

Edit `server.js` to change:
- `POLL_INTERVAL` - How often to check for updates (default: 3000ms)
- `PORT` - Server port (default: 3000)

## Architecture

```
Mobile Device
    ↓ HTTP/WebSocket
Server.js (Express + WS)
    ↓ Chrome DevTools Protocol
VS Code (Antigravity)
```

**How it works:**
1. Server connects to VS Code via CDP on port 9000
2. Polls chat DOM every 3 seconds
3. Captures full HTML + CSS snapshot
4. Caches snapshot and computes hash
5. If content changed, pushes update to mobile via WebSocket
6. Mobile UI preserves scroll position and refreshes content

## Troubleshooting

**"CDP not found"**
- Make sure VS Code is running with `--remote-debugging-port=9000`
- Check ports 9000-9003 are not blocked

**"No snapshot available"**
- Wait a few seconds for first poll to complete
- Try manual refresh button
- Check browser console for errors

**"Failed to send message"**
- Verify Antigravity is not busy (cancel button visible)
- Check if input field is visible in VS Code chat

**Mobile can't connect**
- Ensure phone is on same Wi-Fi network as computer
- Check firewall allows connections on port 3000
- Try `http://0.0.0.0:3000` on computer first

## Comparison to Other PoCs

| Feature | inject.js | read.js | render.js | **server.js** |
|---------|-----------|---------|-----------|---------------|
| Message injection | ✅ CLI | ❌ | ❌ | ✅ Web UI |
| Read messages | ❌ | ✅ Text only | ❌ | ✅ Visual |
| Visual fidelity | ❌ | ❌ | ✅ Snapshot | ✅ Live |
| Mobile access | ❌ | ❌ | ❌ | ✅ |
| Real-time updates | ❌ | ✅ Poll | ❌ | ✅ WebSocket |
| Scroll preservation | N/A | N/A | N/A | ✅ |

## Future Enhancements

- [ ] Authentication/PIN code for security
- [ ] Multiple device support
- [ ] Conversation history persistence
- [ ] Dark/light theme toggle
- [ ] Desktop notifications when new messages arrive
- [ ] Voice input support
- [ ] Export conversation to PDF/Markdown
