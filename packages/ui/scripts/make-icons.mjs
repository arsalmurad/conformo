#!/usr/bin/env node
// Generates the PWA manifest's two required icon sizes: a solid-color square
// with a simple monogram, hand-encoded as PNG via zlib (no image library —
// this is small enough not to need one, and it means the build has no binary
// image-processing dependency). Run once; output is committed like any other
// static asset, not regenerated on every build.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const ACCENT = [0x15, 0x54, 0xd9]; // matches --accent in App.css

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Draws a simple rounded "i" glyph (a dot + a stem) in white over the accent
 * background — legible at both 192px and 512px without needing a real font. */
function pixel(x, y, size) {
  const cx = size / 2;
  const stemW = size * 0.11, stemTop = size * 0.42, stemBottom = size * 0.74;
  const dotR = size * 0.075, dotY = size * 0.28;
  const dx = x - cx, dy = y - dotY;
  if (dx * dx + dy * dy <= dotR * dotR) return true;
  if (Math.abs(dx) <= stemW / 2 && y >= stemTop && y <= stemBottom) return true;
  return false;
}

function makePng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const isGlyph = pixel(x, y, size);
      const o = 1 + x * 4;
      if (isGlyph) {
        row[o] = 255; row[o + 1] = 255; row[o + 2] = 255; row[o + 3] = 255;
      } else {
        row[o] = ACCENT[0]; row[o + 1] = ACCENT[1]; row[o + 2] = ACCENT[2]; row[o + 3] = 255;
      }
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const idat = deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(new URL('../public/icon-192.png', import.meta.url), makePng(192));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), makePng(512));
console.log('wrote public/icon-192.png and public/icon-512.png');
