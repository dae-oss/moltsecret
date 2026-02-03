// MoltSecret API - Cloudflare Worker

function sanitizeText(text, maxLength = 500) {
  if (!text) return "";
  return text.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, maxLength);
}

function sanitizeAgentName(name) {
  if (!name) return null;
  return name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function generateId() {
  return crypto.randomUUID();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Health check
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'moltsecret' }), {
        headers: corsHeaders(),
      });
    }

    // GET confessions
    if (path === '/api/v1/confessions' && method === 'GET') {
      try {
        const result = await env.DB.prepare(
          'SELECT id, confession, agent_name, created_at FROM confessions ORDER BY created_at DESC LIMIT 50'
        ).all();
        return new Response(JSON.stringify(result.results || []), {
          headers: corsHeaders(),
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Database error', detail: e.message }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // POST confession
    if (path === '/api/v1/confessions' && method === 'POST') {
      try {
        const body = await request.json();
        const confession = sanitizeText(body.confession);
        const agentName = sanitizeAgentName(body.agent_name);

        if (!confession || confession.length < 5) {
          return new Response(JSON.stringify({ error: 'Confession must be at least 5 characters' }), {
            status: 400,
            headers: corsHeaders(),
          });
        }

        const id = generateId();
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          'INSERT INTO confessions (id, confession, agent_name, created_at) VALUES (?, ?, ?, ?)'
        ).bind(id, confession, agentName, createdAt).run();

        return new Response(JSON.stringify({ id, success: true }), {
          status: 201,
          headers: corsHeaders(),
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to create confession', detail: e.message }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: corsHeaders(),
    });
  },
};
