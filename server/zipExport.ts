import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.data',
  '.gmp_cache',
  '.git',
  '.aistudio',
]);

const EXCLUDED_REL_PREFIXES = ['public/assets/aistudio'];

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.DS_Store',
]);

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function collectProjectFiles(rootDir: string): { relPath: string; absPath: string; mtime: Date }[] {
  const results: { relPath: string; absPath: string; mtime: Date }[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      const absPath = path.resolve(currentDir, entry.name);
      if (!absPath.startsWith(rootDir + path.sep)) continue;

      const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');
      if (EXCLUDED_REL_PREFIXES.some((prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(absPath);
      } else if (entry.isFile()) {
        if (
          EXCLUDED_FILES.has(entry.name) ||
          entry.name.endsWith('.zip') ||
          entry.name.endsWith('.tar.gz')
        ) {
          continue;
        }
        const stat = fs.statSync(absPath);
        results.push({ relPath, absPath, mtime: stat.mtime });
      }
    }
  }

  walk(rootDir);
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return results;
}

export function buildProjectZipBuffer(rootDir = process.cwd()): Buffer {
  const resolvedRoot = path.resolve(rootDir);
  const files = collectProjectFiles(resolvedRoot);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.absPath);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = zlib.crc32(raw) >>> 0;
    const nameBuf = Buffer.from(`rent-a-house/${file.relPath}`, 'utf8');
    const { dosTime, dosDate } = toDosTimeDate(file.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirBuffer.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuffer, endRecord]);
}
