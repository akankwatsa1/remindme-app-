/*!
 * RemindMe icon generator — pure Node.js, no dependencies.
 * Rasterizes the app icon (rounded square + bell + check badge) into:
 *   assets/app-icon.png  (512x512, for the web / dev window)
 *   assets/icon.ico      (256x256, for the packaged Windows app)
 *
 * Run:  node scripts/make-icon.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG encoding ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- ICO encoding (PNG-compressed, multi-size) ---------------- */

function pngSize(png) {
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

function buildICO(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4); // image count

  const entries = [];
  const payloads = [];
  let offset = 6 + 16 * count;
  for (const img of images) {
    const { w, h } = pngSize(img.png);
    const entry = Buffer.alloc(16);
    entry[0] = w >= 256 ? 0 : w; // width (0 means 256)
    entry[1] = h >= 256 ? 0 : h; // height
    entry[2] = 0; // palette colors
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4);  // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(img.png);
    offset += img.png.length;
  }
  return Buffer.concat([header].concat(entries, payloads));
}

/* ---------------- Shape drawing (signed distance fields) ---------------- */

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

/* 1px soft edge for antialiasing */
function cov(d) {
  return Math.max(0, Math.min(1, 0.5 - d / 2.4));
}

function over(dst, src) {
  const oa = src.a + dst.a * (1 - src.a);
  if (oa <= 0.0001) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / oa,
    g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / oa,
    b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / oa,
    a: oa
  };
}

function render(size) {
  const u = size / 512; // work in 512-space
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / u;
      const py = (y + 0.5) / u;

      let dst = { r: 0, g: 0, b: 0, a: 0 };

      // Background: indigo rounded square with a subtle vertical gradient
      const aBg = cov(sdRoundRect(px, py, 256, 256, 250, 250, 72));
      const t = py / 512;
      dst = over(dst, {
        r: 0x4f + (0x37 - 0x4f) * t,
        g: 0x46 + (0x30 - 0x46) * t,
        b: 0xe5 + (0xa3 - 0xe5) * t,
        a: aBg
      });

      // Bell: dome + body + clapper (union)
      const dBell = Math.min(
        sdCircle(px, py, 256, 210, 92),
        sdRoundRect(px, py, 256, 268, 78, 84, 30),
        sdCircle(px, py, 256, 384, 34)
      );
      const aBell = cov(dBell);
      if (aBell > 0.001) dst = over(dst, { r: 255, g: 255, b: 255, a: aBell });

      // Green check badge (top right)
      const aBadge = cov(sdCircle(px, py, 416, 112, 54));
      if (aBadge > 0.001) dst = over(dst, { r: 0x34, g: 0xd3, b: 0x99, a: aBadge });

      // Check mark (dark strokes, clipped to the badge)
      if (aBadge > 0.001) {
        const d1 = sdSegment(px, py, 392, 116, 412, 136);
        const d2 = sdSegment(px, py, 412, 136, 443, 99);
        const aCheck = Math.max(cov(d1 - 9), cov(d2 - 9)) * aBadge;
        if (aCheck > 0.001) dst = over(dst, { r: 0x06, g: 0x4e, b: 0x3b, a: aCheck });
      }

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(dst.r);
      rgba[i + 1] = Math.round(dst.g);
      rgba[i + 2] = Math.round(dst.b);
      rgba[i + 3] = Math.round(dst.a * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

/* ---------------- Main ---------------- */

const assetsDir = path.join(__dirname, '..', 'www', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const png512 = render(512);
fs.writeFileSync(path.join(assetsDir, 'app-icon.png'), png512);

const ico256 = buildICO([{ png: render(256) }]);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico256);

const trayIco = buildICO([{ png: render(16) }, { png: render(32) }]);
fs.writeFileSync(path.join(assetsDir, 'tray.ico'), trayIco);

console.log('Generated assets/app-icon.png (' + png512.length + ' bytes)');
console.log('Generated assets/icon.ico   (' + ico256.length + ' bytes)');
console.log('Generated assets/tray.ico   (' + trayIco.length + ' bytes, 16+32px)');

/* ---------------- Android launcher icons ----------------
 * Usage: node scripts/make-icon.js android
 * Writes ic_launcher.png / ic_launcher_round.png into the mipmap density
 * folders of the Capacitor Android project. */
function writeAndroidIcons() {
  const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(res)) {
    console.log('Android project not found — skipping launcher icons (run `npx cap add android` first).');
    return;
  }
  const densities = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192]
  ];
  for (const [dir, size] of densities) {
    const outDir = path.join(res, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const png = render(size);
    fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), png);
    fs.writeFileSync(path.join(outDir, 'ic_launcher_round.png'), png);
    console.log('Wrote ' + dir + ' (' + size + 'px)');
  }
}

if (process.argv[2] === 'android') {
  writeAndroidIcons();
} else {
  console.log('Tip: run "node scripts/make-icon.js android" after `npx cap add android` to generate launcher icons.');
}
