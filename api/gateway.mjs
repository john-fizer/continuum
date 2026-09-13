// Safe, explicit unavailable response until an authenticated hosted backend is connected.
// Never fall back to a writable temporary SQLite database on a serverless function.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(503).json({
    error:
      'The hosted brain service is not connected yet. Your local notes remain on your computer. Uploads and research will become available after persistent storage and authenticated access are configured.',
    code: 'BACKEND_NOT_CONFIGURED',
  });
}
