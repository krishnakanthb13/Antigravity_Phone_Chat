import WebSocket from 'ws';
import http from 'http';

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

async function main() {
    const port = 9000;
    try {
        const list = await getJson(`http://127.0.0.1:${port}/json/list`);
        const workbench = list.find(t => t.url?.includes('workbench.html') || (t.title && t.title.includes('workbench')));
        if (!workbench) return;

        const ws = new WebSocket(workbench.webSocketDebuggerUrl);
        ws.on('open', async () => {
            let id = 1;
            const call = (method, params) => {
                return new Promise((resolve) => {
                    const currentId = id++;
                    const handler = (msg) => {
                        const data = JSON.parse(msg);
                        if (data.id === currentId) {
                            ws.off('message', handler);
                            resolve(data);
                        }
                    };
                    ws.on('message', handler);
                    ws.send(JSON.stringify({ id: currentId, method, params }));
                });
            };

            const contexts = [];
            ws.on('message', (msg) => {
                const data = JSON.parse(msg);
                if (data.method === 'Runtime.executionContextCreated') {
                    contexts.push(data.params.context);
                }
            });

            await call('Runtime.enable', {});
            await new Promise(r => setTimeout(r, 1000));

            for (const ctx of contexts) {
                const urlRes = await call('Runtime.evaluate', { expression: 'window.location.href', contextId: ctx.id });
                if (urlRes.result?.result?.value?.includes('cascade-panel.html')) {
                    const res = await call('Runtime.evaluate', {
                        expression: `(() => {
                            const targets = Array.from(document.querySelectorAll('*')).filter(el => {
                                const t = el.innerText || '';
                                return t.includes('Review Changes') || t.includes('Files With Changes');
                            });
                            
                            return targets.map(el => {
                                let path = [];
                                let curr = el;
                                for(let i=0; i<5; i++) {
                                    if(!curr) break;
                                    path.push({
                                        tag: curr.tagName,
                                        classes: curr.className,
                                        id: curr.id
                                    });
                                    curr = curr.parentElement;
                                }
                                return {
                                    text: el.innerText.substring(0, 30),
                                    path: path
                                };
                            });
                        })()`,
                        returnByValue: true,
                        contextId: ctx.id
                    });
                    console.log(JSON.stringify(res.result?.result?.value, null, 2));
                }
            }
            ws.close();
        });
    } catch (e) { }
}
main();
