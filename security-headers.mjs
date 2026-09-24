/**
 * Security headers for the static site. Used by `vite preview` (vite.config.ts) and mirrored
 * in render.yaml — keep the two in sync. Not applied to `vite dev` (its HMR client needs
 * inline scripts).
 *
 * connect-src lists every external API the browser may call:
 *   Open-Meteo forecast + geocoding, India Post PIN lookup, BigDataCloud reverse geocoding,
 *   and Supabase Auth (only used when configured). Add your VITE_API_BASE origin here if you
 *   switch the data adapter to REST.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // framer-motion and React set inline style attributes
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.postalpincode.in https://api.bigdatacloud.net https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // Geolocation only for this site ("Use my location"). Leaf photos use a file picker, not the camera API.
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
};
