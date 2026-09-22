import { rng } from '@/three/geometry';

/**
 * Illustrated wheat-leaf samples, drawn on a canvas so the demo needs no image files.
 * They are clearly illustrations — used only to demonstrate the analysis pipeline.
 */
export type LeafArt = 'healthy' | 'yellow-rust' | 'leaf-rust' | 'powdery-mildew';

const cache = new Map<LeafArt, string>();

function leafPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(-0.46 * s, 0.02 * s);
  ctx.bezierCurveTo(-0.2 * s, -0.11 * s, 0.22 * s, -0.1 * s, 0.5 * s, -0.005 * s);
  ctx.bezierCurveTo(0.22 * s, 0.08 * s, -0.2 * s, 0.12 * s, -0.46 * s, 0.05 * s);
  ctx.closePath();
}

export function drawLeaf(kind: LeafArt, size = 480): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = rng(kind.length * 97 + 3);

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#efe9dd');
  bg.addColorStop(1, '#e2d9c8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.42);
  const s = size * 1.25;

  // soft shadow
  ctx.save();
  ctx.translate(6, 10);
  leafPath(ctx, s);
  ctx.fillStyle = 'rgba(60,45,20,0.12)';
  ctx.filter = 'blur(8px)';
  ctx.fill();
  ctx.restore();

  leafPath(ctx, s);
  const g = ctx.createLinearGradient(0, -0.1 * s, 0, 0.1 * s);
  g.addColorStop(0, kind === 'healthy' ? '#5d9a45' : '#6a9a48');
  g.addColorStop(0.5, kind === 'healthy' ? '#4c8a38' : '#5b8c3f');
  g.addColorStop(1, '#3f7a30');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();

  // parallel veins
  ctx.strokeStyle = 'rgba(210,235,190,0.35)';
  ctx.lineWidth = 1.2;
  for (let v = -4; v <= 4; v++) {
    ctx.beginPath();
    ctx.moveTo(-0.46 * s, 0.035 * s + v * 0.011 * s);
    ctx.quadraticCurveTo(0, v * 0.013 * s, 0.5 * s, -0.005 * s);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(225,245,205,0.6)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-0.46 * s, 0.035 * s);
  ctx.quadraticCurveTo(0, 0, 0.5 * s, -0.005 * s);
  ctx.stroke();

  if (kind === 'yellow-rust') {
    // pustules in stripes along veins
    for (const v of [-3, -1, 2, 3]) {
      const x0 = -0.3 * s + r() * 0.1 * s;
      const len = 0.25 * s + r() * 0.2 * s;
      for (let x = x0; x < x0 + len; x += 5 + r() * 3) {
        const t = (x + 0.46 * s) / (0.96 * s);
        const y = (0.035 - t * 0.04) * s + v * 0.012 * s * (1 - t * 0.6) + (r() - 0.5) * 2;
        ctx.fillStyle = r() > 0.3 ? '#e8c53a' : '#e0a92e';
        ctx.beginPath();
        ctx.ellipse(x, y, 2.6 + r(), 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(230,205,80,0.18)';
    ctx.fillRect(-0.3 * s, -0.06 * s, 0.55 * s, 0.12 * s);
  }

  if (kind === 'leaf-rust') {
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 0.8 * s;
      const y = (r() - 0.5) * 0.12 * s;
      const rad = 2.6 + r() * 2.8;
      ctx.fillStyle = '#7a3e16';
      ctx.beginPath();
      ctx.arc(x, y, rad + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = r() > 0.5 ? '#c8641f' : '#b0561a';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === 'powdery-mildew') {
    for (let i = 0; i < 16; i++) {
      const x = (r() - 0.5) * 0.75 * s;
      const y = (r() - 0.5) * 0.1 * s;
      const rad = 14 + r() * 22;
      const pg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      pg.addColorStop(0, 'rgba(250,250,245,0.95)');
      pg.addColorStop(0.6, 'rgba(240,240,232,0.7)');
      pg.addColorStop(1, 'rgba(240,240,232,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.restore();

  const url = c.toDataURL('image/jpeg', 0.92);
  cache.set(kind, url);
  return url;
}
