import type { RequestHandler } from '@sveltejs/kit';

// 1x1 transparent PNG (base64)
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';

export const GET: RequestHandler = () => {
  const bytes = Buffer.from(PNG_BASE64, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
};
