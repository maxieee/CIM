// Netlify Functions entry point for Hono app
// Import the compiled Hono app
import app from '../../backend/dist/index.js';

// Netlify Function handler - wraps Hono's fetch method
export default async (request, context) => {
  // Convert Netlify Request to standard Request
  const url = new URL(request.url);
  const method = request.method;
  const headers = new Headers(request.headers);
  const body = method !== 'GET' && method !== 'HEAD' ? await request.text() : null;

  const req = new Request(url.toString(), {
    method,
    headers,
    body,
  });

  // Call Hono app fetch handler
  const response = await app.fetch(req, context);

  // Return Netlify-compatible response
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};