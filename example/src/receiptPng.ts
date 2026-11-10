import { ECR_PRINTER_WIDTH } from 'react-native-amwal-ecr';

const CHAR_WIDTH = 6;
const LINE_HEIGHT = 12;
const PAD = 8;

/** 5×7 glyphs, five low bits per row. Unknown characters become a block. */
const GLYPHS: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
};

const BLOCK = [0b11111, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11111];

/**
 * A 384 px grayscale PNG of [lines], built by the till for the payment app's
 * printer. Latin text only: the printer needs the operation's own fields, not
 * a reprint of the payment app's last stored receipt.
 */
export function receiptPng(lines: string[]): Uint8Array {
  const wrapped = lines.flatMap((line) => wrap(line.toUpperCase()));
  const height = PAD * 2 + Math.max(wrapped.length, 1) * LINE_HEIGHT;
  const pixels = new Uint8Array(ECR_PRINTER_WIDTH * height).fill(0xff);
  wrapped.forEach((line, row) =>
    drawLine(pixels, line, PAD, PAD + row * LINE_HEIGHT)
  );
  return encodePng(pixels, ECR_PRINTER_WIDTH, height);
}

function wrap(line: string): string[] {
  const width = Math.floor((ECR_PRINTER_WIDTH - PAD * 2) / CHAR_WIDTH);
  if (line.length <= width) return [line];
  const rows: string[] = [];
  for (let index = 0; index < line.length; index += width) {
    rows.push(line.slice(index, index + width));
  }
  return rows;
}

function drawLine(
  pixels: Uint8Array,
  line: string,
  x: number,
  y: number
): void {
  for (let index = 0; index < line.length; index += 1) {
    const glyph = GLYPHS[line[index] ?? ' '] ?? BLOCK;
    drawGlyph(pixels, glyph, x + index * CHAR_WIDTH, y);
  }
}

function drawGlyph(
  pixels: Uint8Array,
  glyph: number[],
  x: number,
  y: number
): void {
  glyph.forEach((bits, row) => {
    for (let col = 0; col < 5; col += 1) {
      if ((bits & (1 << (4 - col))) === 0) continue;
      const px = x + col;
      const py = y + row;
      if (px < 0 || py < 0 || px >= ECR_PRINTER_WIDTH) continue;
      pixels[py * ECR_PRINTER_WIDTH + px] = 0x00;
    }
  });
}

function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    const start = y * (width + 1);
    raw[start] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), start + 1);
  }
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const bytes = [
    ...pngSignature(),
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStore(raw)),
    ...chunk('IEND', new Uint8Array(0)),
  ];
  return Uint8Array.from(bytes);
}

function pngSignature(): number[] {
  return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
}

function chunk(type: string, data: Uint8Array): number[] {
  const typeBytes = [...type].map((char) => char.charCodeAt(0));
  const length = new Uint8Array(4);
  writeUint32(length, 0, data.length);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = new Uint8Array(4);
  writeUint32(crc, 0, crc32(crcInput));
  return [...length, ...typeBytes, ...data, ...crc];
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  let offset = 0;
  while (offset < data.length || blocks.length === 2) {
    const size = Math.min(0xffff, data.length - offset);
    const last = offset + size >= data.length;
    blocks.push(last ? 0x01 : 0x00);
    blocks.push(size & 0xff, (size >> 8) & 0xff);
    const nlen = size ^ 0xffff;
    blocks.push(nlen & 0xff, (nlen >> 8) & 0xff);
    for (let index = 0; index < size; index += 1) {
      blocks.push(data[offset + index] ?? 0);
    }
    offset += size;
    if (data.length === 0) break;
  }
  const sum = adler32(data);
  blocks.push(
    (sum >>> 24) & 0xff,
    (sum >>> 16) & 0xff,
    (sum >>> 8) & 0xff,
    sum & 0xff
  );
  return Uint8Array.from(blocks);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
