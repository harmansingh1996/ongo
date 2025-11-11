// Basic Cloudflare Worker Template for Youware Backend
// Copy this file to: backend/src/index.ts

export interface Env {
  DB: D1Database;  // D1 database binding
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Extract user information from headers (automatically injected)
    const userId = request.headers.get('X-Encrypted-Yw-ID');
    const isLogin = request.headers.get('X-Is-Login') === '1';

    // Route requests
    try {
      if (url.pathname === '/api/hello') {
        return handleHello(userId, isLogin);
      }

      if (url.pathname === '/api/data') {
        return handleGetData(env, userId);
      }

      if (url.pathname === '/api/data' && request.method === 'POST') {
        return handleCreateData(request, env, userId);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('API Error:', error);
      return Response.json({
        error: 'Internal server error',
        details: error.message
      }, { status: 500 });
    }
  }
};

// CORS handler
function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Example: Simple endpoint
function handleHello(userId: string | null, isLogin: boolean): Response {
  return Response.json({
    message: 'Hello from Youware Backend!',
    userId: userId,
    isAuthenticated: isLogin
  });
}

// Example: Get data from database
async function handleGetData(env: Env, userId: string | null): Promise<Response> {
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stmt = env.DB.prepare('SELECT * FROM user_data WHERE user_id = ?');
  const { results } = await stmt.bind(userId).all();

  return Response.json({
    success: true,
    data: results
  });
}

// Example: Create data in database
async function handleCreateData(
  request: Request,
  env: Env,
  userId: string | null
): Promise<Response> {
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Validate input
  if (!body.content) {
    return Response.json({ error: 'Content is required' }, { status: 400 });
  }

  // Insert data
  const stmt = env.DB.prepare(
    'INSERT INTO user_data (user_id, content, created_at) VALUES (?, ?, datetime("now"))'
  );
  await stmt.bind(userId, body.content).run();

  return Response.json({
    success: true,
    message: 'Data created successfully'
  }, { status: 201 });
}
