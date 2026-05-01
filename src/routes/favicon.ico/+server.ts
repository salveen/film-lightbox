import type { RequestHandler } from '@sveltejs/kit';

// Reuse the same tiny PNG as a fallback for /favicon.ico requests
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';

export const GET: RequestHandler = () => {
  const bytes = Buffer.from(PNG_BASE64, 'base64');
  return new Response(bytes, {
    headers: {
      // Some clients expect x-icon, serve png but mark as image/png which works in modern browsers
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
};
