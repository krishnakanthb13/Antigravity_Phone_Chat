#!/usr/bin/env node
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORTS = [9000, 9001, 9002, 9003];
const POLL_INTERVAL = 3000; // 3 seconds

// Shared CDP connection
let cdpConnection = null;
let lastSnapshot = null;
let lastSnapshotHash = null;

// Helper: HTTP GET JSON
function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// Find VS Code CDP endpoint
async function discoverCDP() {
    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);
            const found = list.find(t => t.url.includes('workbench.html') || (t.title && t.title.includes('workbench')));
            if (found && found.webSocketDebuggerUrl) {
                return { port, url: found.webSocketDebuggerUrl };
            }
        } catch (e) { }
    }
    throw new Error('CDP not found. Is VS Code started with --remote-debugging-port=9000?');
}

// Connect to CDP
async function connectCDP(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    let idCounter = 1;
    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;
        const handler = (msg) => {
            const data = JSON.parse(msg);
            if (data.id === id) {
                ws.off('message', handler);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const contexts = [];
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.method === 'Runtime.executionContextCreated') {
                contexts.push(data.params.context);
            }
        } catch (e) { }
    });

    await call("Runtime.enable", {});
    await new Promise(r => setTimeout(r, 1000));

    return { ws, call, contexts };
}

// Capture chat snapshot
async function captureSnapshot(cdp) {
    const CAPTURE_SCRIPT = `(() => {
        const cascade = document.getElementById('cascade');
        if (!cascade) return { error: 'cascade not found' };
        
        const cascadeStyles = window.getComputedStyle(cascade);
        const html = cascade.outerHTML;
        
        let allCSS = '';
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    allCSS += rule.cssText + '\\n';
                }
            } catch (e) { }
        }
        
        return {
            html: html,
            css: allCSS,
            backgroundColor: cascadeStyles.backgroundColor,
            color: cascadeStyles.color,
            fontFamily: cascadeStyles.fontFamily
        };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: CAPTURE_SCRIPT,
                returnByValue: true,
                contextId: ctx.id
            });

            if (result.result && result.result.value) {
                return result.result.value;
            }
        } catch (e) { }
    }

    return null;
}

// Inject message into Antigravity
async function injectMessage(cdp, text) {
    const EXPRESSION = `(async () => {
        const cancel = document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (cancel && cancel.offsetParent !== null) return { ok:false, reason:"busy" };

        const editors = [...document.querySelectorAll('#cascade [data-lexical-editor="true"][contenteditable="true"][role="textbox"]')]
            .filter(el => el.offsetParent !== null);
        const editor = editors.at(-1);
        if (!editor) return { ok:false, error:"editor_not_found" };

        editor.focus();
        document.execCommand?.("selectAll", false, null);
        document.execCommand?.("delete", false, null);

        let inserted = false;
        try { inserted = !!document.execCommand?.("insertText", false, "${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"); } catch {}
        if (!inserted) {
            editor.textContent = "${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}";
            editor.dispatchEvent(new InputEvent("beforeinput", { bubbles:true, inputType:"insertText", data:"${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }));
            editor.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data:"${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }));
        }

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const submit = document.querySelector("svg.lucide-arrow-right")?.closest("button");
        if (submit && !submit.disabled) {
            submit.click();
            return { ok:true, method:"click_submit" };
        }

        return { ok:false, reason:"submit_not_found" };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: EXPRESSION,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });

            if (result.result && result.result.value) {
                return result.result.value;
            }
        } catch (e) { }
    }

    return { ok: false, reason: "no_context" };
}

// Simple hash function
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

// Initialize CDP connection
async function initCDP() {
    console.log('🔍 Discovering VS Code CDP endpoint...');
    const cdpInfo = await discoverCDP();
    console.log(`✅ Found VS Code on port ${cdpInfo.port}`);

    console.log('🔌 Connecting to CDP...');
    cdpConnection = await connectCDP(cdpInfo.url);
    console.log(`✅ Connected! Found ${cdpConnection.contexts.length} execution contexts\n`);
}

// Background polling
async function startPolling(wss) {
    setInterval(async () => {
        if (!cdpConnection) return;

        try {
            const snapshot = await captureSnapshot(cdpConnection);
            if (snapshot && !snapshot.error) {
                const hash = hashString(snapshot.html);

                // Only update if content changed
                if (hash !== lastSnapshotHash) {
                    lastSnapshot = snapshot;
                    lastSnapshotHash = hash;

                    // Broadcast to all connected clients
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'snapshot_update',
                                timestamp: new Date().toISOString()
                            }));
                        }
                    });

                    console.log(`📸 Snapshot updated (hash: ${hash})`);
                }
            }
        } catch (err) {
            console.error('Poll error:', err.message);
        }
    }, POLL_INTERVAL);
}

// Create Express app
async function createServer() {
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    app.use(express.json());
    app.use(express.static(join(__dirname, 'public')));

    // Get current snapshot
    app.get('/snapshot', (req, res) => {
        if (!lastSnapshot) {
            return res.status(503).json({ error: 'No snapshot available yet' });
        }
        res.json(lastSnapshot);
    });

    // Send message
    app.post('/send', async (req, res) => {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        if (!cdpConnection) {
            return res.status(503).json({ error: 'CDP not connected' });
        }

        const result = await injectMessage(cdpConnection, message);

        if (result.ok) {
            res.json({ success: true, method: result.method });
        } else {
            res.status(500).json({ success: false, reason: result.reason });
        }
    });

    // WebSocket connection
    wss.on('connection', (ws) => {
        console.log('📱 Client connected');

        ws.on('close', () => {
            console.log('📱 Client disconnected');
        });
    });

    return { server, wss };
}

// Main
async function main() {
    try {
        await initCDP();

        const { server, wss } = await createServer();

        // Start background polling
        startPolling(wss);

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`📱 Access from mobile: http://<your-ip>:${PORT}`);
        });
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

main();
