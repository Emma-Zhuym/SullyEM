import { createCloudflareWorker } from '@rei-standard/amsg-instant/adapters/cloudflare';

export interface Env {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_EMAIL?: string;
  AMSG_CLIENT_TOKEN?: string;
}

const inner = createCloudflareWorker((env: Env) => ({
  vapid: {
    email: env.VAPID_EMAIL || 'mailto:noreply@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  },
  clientToken: env.AMSG_CLIENT_TOKEN,
}));

// amsg-instant 0.3.0 不带 CORS 处理；浏览器跨域 POST 会卡在 preflight。
// `*` 是合理选择：Worker 不读 cookie，弱鉴权用 X-Client-Token header（攻击者
// 即便能发 OPTIONS 也仍需要猜对 token + 自己掏 LLM apiKey 才能"用"Worker，
// 跟限制 Origin 拿到的安全等价）。如需限定，把 ALLOW_ORIGIN 改成你部署 SullyOS 的域名。
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Client-Token, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = await inner.fetch(request, env);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
