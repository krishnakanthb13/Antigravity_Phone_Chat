export async function inspectUI(cdp) {
    const INSPECT_SCRIPT = `(() => {
        // Find the input container (same logic as capture, but looking for what we essentially removed)
        const cascade = document.getElementById('conversation') || document.getElementById('chat') || document.getElementById('cascade');
        if (!cascade) return 'No chat container found';

        const inputContainer = document.querySelector('[contenteditable="true"]')?.closest('div[id^="conversation"], div[id^="chat"], div[id^="cascade"]')?.parentElement;
        if (!inputContainer) return 'No input container found';

        // Helper to serialize simple version of DOM
        function serialize(el) {
            if (el.nodeType === 3) { // Text
                const text = el.textContent.trim();
                return text ? { type: 'text', content: text } : null;
            }
            if (el.nodeType !== 1) return null; // Not element

            // Get useful attributes
            const attrs = {};
            ['id', 'class', 'role', 'aria-label', 'title', 'type', 'data-testid'].forEach(a => {
                const v = el.getAttribute(a);
                if (v) attrs[a] = v;
            });

            // Get bounding client rect to see if it's visible
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null; // invisible

            const children = Array.from(el.childNodes).map(serialize).filter(x => x);
            
            return {
                tagName: el.tagName.toLowerCase(),
                attributes: attrs,
                children: children.length > 0 ? children : undefined
            };
        }

        return JSON.stringify(serialize(inputContainer), null, 2);
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: INSPECT_SCRIPT,
                returnByValue: true,
                contextId: ctx.id
            });

            if (result.result && result.result.value) {
                return result.result.value;
            }
        } catch (e) { }
    }
    return 'Failed to inspect';
}
