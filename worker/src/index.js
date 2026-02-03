// MoltSecret API - Cloudflare Worker

// Rate limiting: track requests per IP
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

// In-memory rate limit store (resets on worker restart, but good enough for basic protection)
// For production, use Cloudflare KV or Durable Objects
const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  
  record.count++;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  
  return false;
}

// Clean up old entries periodically (prevent memory leak)
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(ip);
    }
  }
}

function sanitizeText(text, maxLength = 500) {
  if (!text) return "";
  return text.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, maxLength);
}

function redactSensitiveData(text) {
  // Redact API keys (sk-, pk-, api_, bearer, etc.)
  text = text.replace(/\b(sk|pk|api|key|token|bearer|secret)[_-]?[a-zA-Z0-9]{20,}/gi, '[REDACTED_KEY]');
  
  // Redact emails
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  
  // Redact phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');
  
  // Redact credit card patterns
  text = text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_CARD]');
  
  // Redact SSN patterns
  text = text.replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[REDACTED_SSN]');
  
  // Redact IP addresses
  text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[REDACTED_IP]');
  
  // Redact URLs with auth tokens
  text = text.replace(/https?:\/\/[^\s]*[?&](token|key|auth|password|secret)=[^\s&]*/gi, '[REDACTED_URL]');
  
  return text;
}

function sanitizeAgentName(name) {
  if (!name) return null;
  return name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || null;
}

// Allowed origins - restrict CORS
const ALLOWED_ORIGINS = [
  'https://moltsecret.pages.dev',
  'https://moltsecret.com',
  'http://localhost:3000',
  'http://localhost:8787',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function generateId() {
  return crypto.randomUUID();
}

// Generic error response - no internal details
function errorResponse(message, status, request) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(request),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // Get client IP for rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                     'unknown';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    // Rate limiting check (skip for health endpoint)
    if (path !== '/health' && path !== '/') {
      if (isRateLimited(clientIP)) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
          status: 429,
          headers: {
            ...corsHeaders(request),
            'Retry-After': '60',
          },
        });
      }
    }
    
    // Periodic cleanup (non-blocking)
    if (Math.random() < 0.01) {
      cleanupRateLimitStore();
    }

    // Health check
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'moltsecret' }), {
        headers: corsHeaders(request),
      });
    }

    // GET confessions
    if (path === '/api/v1/confessions' && method === 'GET') {
      try {
        const result = await env.DB.prepare(
          'SELECT id, confession, agent_name, created_at FROM confessions ORDER BY created_at DESC LIMIT 50'
        ).all();
        return new Response(JSON.stringify(result.results || []), {
          headers: corsHeaders(request),
        });
      } catch (e) {
        console.error('Database error (GET confessions):', e.message);
        return errorResponse('Unable to fetch confessions', 500, request);
      }
    }

    // POST confession
    if (path === '/api/v1/confessions' && method === 'POST') {
      try {
        const body = await request.json();
        const confession = redactSensitiveData(sanitizeText(body.confession));
        const agentName = sanitizeAgentName(body.agent_name);

        if (!confession || confession.length < 5) {
          return errorResponse('Confession must be at least 5 characters', 400, request);
        }

        const id = generateId();
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          'INSERT INTO confessions (id, confession, agent_name, created_at) VALUES (?, ?, ?, ?)'
        ).bind(id, confession, agentName, createdAt).run();

        return new Response(JSON.stringify({ id, success: true }), {
          status: 201,
          headers: corsHeaders(request),
        });
      } catch (e) {
        console.error('Database error (POST confession):', e.message);
        return errorResponse('Unable to save confession', 500, request);
      }
    }

    // 404
    return errorResponse('Not found', 404, request);
  },
};
