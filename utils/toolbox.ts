const TOOLBOX_BASE_URL = 'http://localhost:3001';

export const toolbox = {
  async search(query: string, options?: { count?: number; freshness?: string }) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options })
    });
    return await res.json();
  },

  async fetch(url: string, maxChars?: number) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/fetch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxChars })
    });
    return await res.json();
  },

  async read(path: string, limit?: number) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, limit })
    });
    return await res.json();
  },

  async write(path: string, content: string) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/write`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content })
    });
    return await res.json();
  },

  async edit(path: string, oldText: string, newText: string) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, oldText, newText })
    });
    return await res.json();
  },

  async exec(command: string, timeout?: number) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout })
    });
    return await res.json();
  },

  browser: {
    async open(url: string) {
      const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/browser/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      return await res.json();
    },
    async screenshot(fullPage?: boolean) {
      const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/browser/screenshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullPage })
      });
      return await res.json();
    },
    async snapshot() {
      const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/browser/snapshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    },
    async act(kind: string, params: any) {
      const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/browser/act`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...params })
      });
      return await res.json();
    }
  },

  async sendMessage(channel: string, target: string, message: string) {
    const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/message/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, target, message })
    });
    return await res.json();
  },

  async health() {
    try {
      const res = await fetch(`${TOOLBOX_BASE_URL}/toolbox/health`);
      return await res.json();
    } catch { return { ok: false }; }
  }
};

export default toolbox;
