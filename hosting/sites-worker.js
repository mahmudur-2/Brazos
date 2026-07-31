const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(self)',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function runtimeConfigResponse(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return new Response('Hosted configuration is unavailable.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const config = JSON.stringify({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_KEY: env.SUPABASE_KEY,
  }).replace(/</g, '\\u003c');

  return new Response(`globalThis.__BRAZOS_CONFIG__ = ${config};\n`, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config.js') {
      return withSecurityHeaders(runtimeConfigResponse(env));
    }

    let response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get('Accept')?.includes('text/html');

    if (response.status === 404 && request.method === 'GET' && acceptsHtml) {
      const shellUrl = new URL('/index.html', request.url);
      response = await env.ASSETS.fetch(new Request(shellUrl, request));
    }

    return withSecurityHeaders(response);
  },
};
