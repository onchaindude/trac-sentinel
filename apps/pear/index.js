import Pear          from 'pear';
import path          from 'path';
import fs            from 'fs';
import net           from 'net';
import { spawn }     from 'child_process';
import { fileURLToPath } from 'url';

const { bold, green, yellow, red, cyan, reset } = {
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  reset:  s => `\x1b[0m${s}\x1b[0m`,
};

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const repoRoot   = path.join(__dirname, '../..');
const backendDir = path.join(repoRoot, 'apps/backend');
const backendEntry = path.join(backendDir, 'dist/index.js');
const envFile    = path.join(backendDir, '.env');

// ── Banner ─────────────────────────────────────────────────────────────────────
console.log('');
console.log(bold(green('  ████████╗██████╗  █████╗  ██████╗')));
console.log(bold(green('     ██╔══╝██╔══██╗██╔══██╗██╔════╝')));
console.log(bold(green('     ██║   ██████╔╝███████║██║     ')));
console.log(bold(green('     ██║   ██╔══██╗██╔══██║██║     ')));
console.log(bold(green('     ██║   ██║  ██║██║  ██║╚██████╗')));
console.log(bold(green('     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝')));
console.log('');
console.log(bold('  TracSentinel') + cyan(' — P2P Crypto Rug Pull Detector'));
console.log(cyan('  Built on Trac Network · tracsystems.io'));
console.log('');

// ── Sanity checks ─────────────────────────────────────────────────────────────
if (!fs.existsSync(backendEntry)) {
  console.error(red('  ✗ Backend not built. Run: npm run build'));
  console.error(red('    from the trac-sentinel repo root first.\n'));
  Pear.exit(1);
}

// ── Detect mode from .env ─────────────────────────────────────────────────────
let mode = 'peer';
if (fs.existsSync(envFile)) {
  const env = fs.readFileSync(envFile, 'utf8');
  if (/^ETHERSCAN_API_KEY=.+/m.test(env)) mode = 'full_node';
}

console.log(`  Mode: ${mode === 'full_node' ? bold(green('Full Node')) + ' (live scans + P2P publish)' : bold(yellow('Peer')) + ' (P2P receive only)'}`);
if (mode === 'peer') {
  console.log(yellow('  → To enable live scanning, add API keys to apps/backend/.env'));
}
console.log('');

// ── Find a free port (4000–4019) ──────────────────────────────────────────────
async function findFreePort(start = 4000) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(start, '127.0.0.1', () => probe.close(() => resolve(start)));
    probe.on('error', () =>
      start >= 4019
        ? reject(new Error('No free port found in range 4000–4019'))
        : findFreePort(start + 1).then(resolve, reject)
    );
  });
}

// ── Wait until backend is accepting connections ───────────────────────────────
async function waitForBackend(port, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 500));
    const ok = await new Promise(resolve => {
      const s = net.createConnection(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(true);  });
      s.on('error',   () => { s.destroy(); resolve(false); });
    });
    if (ok) return true;
  }
  return false;
}

// ── Open browser ──────────────────────────────────────────────────────────────
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open'
            : platform === 'win32'  ? 'cmd'
            : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// ── Main ──────────────────────────────────────────────────────────────────────
const port = await findFreePort();
if (port !== 4000) {
  console.log(yellow(`  Port 4000 in use — using port ${port} instead`));
}

console.log(`  Starting backend on port ${bold(String(port))}…`);

let stopping = false;
let currentBackend = null;

function startBackend() {
  const proc = spawn(process.execPath, [backendEntry], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  currentBackend = proc;

  proc.stdout.on('data', chunk => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const msg = obj.msg ?? line;
        if (msg.includes('error') || msg.includes('Error')) console.log(red(`  [backend] ${msg}`));
        else if (msg.includes('warn'))  console.log(yellow(`  [backend] ${msg}`));
        else console.log(cyan(`  [backend] ${msg}`));
      } catch { console.log(cyan(`  [backend] ${line}`)); }
    }
  });
  proc.stderr.on('data', chunk => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      if (!line.includes('DeprecationWarning')) console.log(red(`  [backend] ${line}`));
    }
  });

  proc.on('exit', code => {
    if (stopping) return;
    console.log(yellow(`\n  Backend exited (code ${code}) — restarting in 3s…\n`));
    setTimeout(() => startBackend(), 3_000);
  });

  return proc;
}

startBackend();

// Wait for backend to be ready then open browser
const ready = await waitForBackend(port);
if (!ready) {
  console.error(red('\n  ✗ Backend did not start in time. Check logs above.\n'));
  currentBackend?.kill();
  Pear.exit(1);
}

const url = `http://localhost:${port}`;
console.log('');
console.log(green(`  ✓ TracSentinel running → ${bold(url)}`));
console.log(green('  ✓ P2P network connecting…'));
console.log('');
console.log(cyan('  Opening browser…'));
console.log(cyan('  Press Ctrl+C to stop.\n'));

openBrowser(url);

// Graceful shutdown on SIGINT and SIGTERM
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log(yellow('\n  Shutting down…'));
  currentBackend?.kill('SIGTERM');
  setTimeout(() => Pear.exit(0), 2_000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
