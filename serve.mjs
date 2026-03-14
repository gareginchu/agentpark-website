import { createServer } from 'http';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;
const UPLOADS_DIR = join(__dirname, 'uploads');

// Ensure uploads directory exists
await mkdir(UPLOADS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.eps': 'application/postscript',
  '.icns': 'image/x-icns',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /upload — save base64 image to uploads/
  if (req.method === 'POST' && urlPath === '/upload') {
    try {
      const body = await readBody(req);
      const { filename, data } = JSON.parse(body);
      if (!filename || !data) return json(res, { error: 'Missing filename or data' }, 400);
      // Strip base64 header (e.g. "data:image/png;base64,")
      const base64 = data.replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      // Sanitize filename
      const safe = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      await writeFile(join(UPLOADS_DIR, safe), buf);
      json(res, { url: '/uploads/' + safe });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // GET /api/uploads — list uploaded images
  if (req.method === 'GET' && urlPath === '/api/uploads') {
    try {
      const files = await readdir(UPLOADS_DIR);
      const images = files.filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f));
      json(res, images.map(f => ({ name: f, url: '/uploads/' + f })));
    } catch {
      json(res, []);
    }
    return;
  }

  // POST /api/apply-overrides — bake localStorage overrides into index.html TRANS.am
  if (req.method === 'POST' && urlPath === '/api/apply-overrides') {
    try {
      const body = await readBody(req);
      const overrides = JSON.parse(body);
      const keys = Object.keys(overrides);
      if (!keys.length) return json(res, { error: 'No overrides provided' }, 400);

      // Read current index.html
      const htmlPath = join(__dirname, 'index.html');
      let html = await readFile(htmlPath, 'utf8');

      // Find TRANS.am block
      const startMarker = 'TRANS.am = {';
      const startIdx = html.indexOf(startMarker);
      if (startIdx === -1) return json(res, { error: 'TRANS.am not found' }, 500);

      // Find closing brace
      let braceCount = 0, endIdx = -1;
      for (let i = startIdx + startMarker.length - 1; i < html.length; i++) {
        if (html[i] === '{') braceCount++;
        if (html[i] === '}') { braceCount--; if (braceCount === 0) { endIdx = i + 1; break; } }
      }

      const oldBlock = html.substring(startIdx, endIdx);
      const lines = oldBlock.split('\n');
      const newLines = [lines[0]];
      let changed = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^(\s*)'([^']+)':\s*'(.*)'(,?)$/);
        if (m) {
          const [, indent, key, oldVal, comma] = m;
          if (overrides[key] !== undefined) {
            const newVal = overrides[key].replace(/'/g, "\\'");
            if (newVal !== oldVal) {
              newLines.push(indent + "'" + key + "': '" + newVal + "'" + comma);
              changed++;
              continue;
            }
          }
        }
        newLines.push(line);
      }

      const newBlock = newLines.join('\n');
      html = html.substring(0, startIdx) + newBlock + html.substring(endIdx);
      await writeFile(htmlPath, html, 'utf8');

      console.log(`[apply-overrides] Updated ${changed} of ${keys.length} keys`);
      json(res, { ok: true, changed, total: keys.length });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // Static file serving
  let filePath = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  filePath = join(__dirname, filePath);

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await readFile(filePath);
    cors(res);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Serving at http://localhost:${PORT}`);
});
