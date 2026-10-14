// Génère les icônes PNG de la PWA (boule + cochonnet sur fond vert), sans dépendance.
// Usage : npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 3; // sur-échantillonnage pour l'anticrénelage
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const a = acc[3] / (SS * SS);
      raw[o] = acc[3] ? acc[0] / acc[3] : 0;
      raw[o + 1] = acc[3] ? acc[1] / acc[3] : 0;
      raw[o + 2] = acc[3] ? acc[2] / acc[3] : 0;
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA 8 bits
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const GREEN = [31, 95, 74];

/** Dessin dans un repère [0,1]² ; `scale` réduit le motif pour la zone sûre des icônes « maskable ». */
function scene(scale, rounded) {
  return (u, v) => {
    // Fond : carré arrondi (ou plein cadre pour maskable).
    if (rounded) {
      const r = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
    // Cochonnet (bois).
    const cx = x - 0.76, cy = y - 0.74;
    if (cx * cx + cy * cy < 0.085 ** 2) {
      const l = 1 - Math.hypot(cx + 0.03, cy + 0.03) / 0.12;
      return [205 + 40 * l, 120 + 50 * l, 40 + 30 * l, 1];
    }
    // Boule en acier, éclairée en haut à gauche, avec deux stries.
    const bx = x - 0.45, by = y - 0.45, R = 0.3;
    const d = Math.hypot(bx, by);
    if (d < R) {
      const light = Math.max(0, 1 - Math.hypot(bx + 0.11, by + 0.11) / (R * 1.25));
      let c = 105 + 140 * light ** 1.6;
      const groove = (k) => Math.abs(by - k * Math.sqrt(Math.max(0, R * R - bx * bx)) * 0.35);
      if (groove(1) < 0.012 || groove(-1) < 0.012) c *= 0.6;
      return [c * 0.95, c * 0.98, c, 1];
    }
    // Ombre portée légère.
    const sx = x - 0.49, sy = (y - 0.78) * 3.2;
    if (Math.hypot(sx, sy) < 0.3) return [GREEN[0] * 0.75, GREEN[1] * 0.75, GREEN[2] * 0.75, 1];
    return [...GREEN, 1];
  };
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, scene(1, true)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, scene(0.75, false)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, scene(0.85, false)));
console.log('Icônes générées dans public/icons/');
