import Pear          from 'pear';
import path          from 'path';
import fs            from 'fs';
import net           from 'net';
import os            from 'os';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const { bold, green, yellow, red, cyan } = {
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Dev mode: running from cloned repo (pear run apps/pear) ───────────────────
// Standalone: running from Pear network (pear run pear://key)
const DEV_BACKEND    = path.join(__dirname, '../../apps/backend');
const isDevMode      = fs.existsSync(path.join(DEV_BACKEND, 'dist/index.js'));

// Standalone install location (~/.config/trac-sentinel/)
const INSTALL_DIR    = path.join(os.homedir(), '.config', 'trac-sentinel');
const REPO_DIR       = path.join(INSTALL_DIR, 'repo');
const BACKEND_DIR    = isDevMode ? DEV_BACKEND : path.join(REPO_DIR, 'apps/backend');
const BACKEND_ENTRY  = path.join(BACKEND_DIR, 'dist/index.js');
const ENV_FILE       = path.join(BACKEND_DIR, '.env');

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

// ── Bootstrap: clone + build on first run (standalone only) ──────────────────
async function bootstrap() {
  if (isDevMode) return;
  if (fs.existsSync(BACKEND_ENTRY)) return; // already installed

  console.log(yellow('  First run — setting up TracSentinel…'));
  console.log(yellow('  This takes a few minutes and only happens once.\n'));

  for (const [cmd, label, url] of [
    ['git', 'git', 'https://git-scm.com'],
    ['node', 'Node.js', 'https://nodejs.org'],
    ['npm', 'npm', 'https://nodejs.org'],
  ]) {
    try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); }
    catch {
      console.error(red(`  ✗ ${label} is required. Install it from ${url}\n`));
      Pear.exit(1);
    }
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  if (fs.existsSync(path.join(REPO_DIR, '.git'))) {
    console.log(cyan('  ↻ Updating to latest version…'));
    execFileSync('git', ['pull', '--ff-only'], { cwd: REPO_DIR, stdio: 'inherit' });
  } else {
    console.log(cyan('  ↓ Downloading TracSentinel…'));
    execFileSync('git', [
      'clone', '--depth=1',
      'https://github.com/onchaindude/trac-sentinel.git',
      REPO_DIR,
    ], { stdio: 'inherit' });
  }

  console.log(cyan('\n  ⚙ Installing dependencies (this may take a moment)…'));
  execFileSync('npm', ['install'], { cwd: REPO_DIR, stdio: 'inherit' });

  console.log(cyan('\n  ⚙ Building…'));
  execFileSync('npm', ['run', 'build'], { cwd: REPO_DIR, stdio: 'inherit' });

  // Copy .env.example if no .env exists yet
  if (!fs.existsSync(ENV_FILE)) {
    const example = path.join(REPO_DIR, 'apps/backend/.env.example');
    if (fs.existsSync(example)) fs.copyFileSync(example, ENV_FILE);
  }

  // ── Ollama: install if missing, pull default model only if needed ─────────────
  let ollamaInstalled = false;
  try { execFileSync('ollama', ['--version'], { stdio: 'ignore' }); ollamaInstalled = true; }
  catch {}

  if (ollamaInstalled) {
    console.log(green('  ✓ Ollama already installed'));
  } else {
    console.log(cyan('\n  ⚙ Installing Ollama (local AI)…'));
    if (process.platform === 'win32') {
      console.log(yellow('  → Windows: download Ollama from https://ollama.ai and re-run.'));
      console.log(yellow('    AI summaries will be disabled until Ollama is installed.\n'));
    } else {
      try {
        execFileSync('sh', ['-c', 'curl -fsSL https://ollama.ai/install.sh | sh'], { stdio: 'inherit' });
        ollamaInstalled = true;
      } catch {
        console.log(yellow('  → Could not auto-install Ollama. Get it at https://ollama.ai'));
        console.log(yellow('    AI summaries disabled until installed.\n'));
      }
    }
  }

  if (ollamaInstalled) {
    // Read the model from .env — respect whatever the user has configured
    let configuredModel = 'qwen2.5:7b'; // default
    if (fs.existsSync(ENV_FILE)) {
      const envText = fs.readFileSync(ENV_FILE, 'utf8');
      const match   = envText.match(/^OLLAMA_MODEL=(.+)$/m);
      if (match && match[1].trim()) configuredModel = match[1].trim();
    }

    try {
      const installedModels = execFileSync('ollama', ['list'], { encoding: 'utf8' });
      if (installedModels.includes(configuredModel.split(':')[0])) {
        console.log(green(`  ✓ Ollama model ready: ${configuredModel}`));
      } else {
        console.log(cyan(`\n  ⚙ Downloading AI model (${configuredModel})…`));
        console.log(cyan('    This is a one-time download — change OLLAMA_MODEL in .env to use a different model.\n'));
        execFileSync('ollama', ['pull', configuredModel], { stdio: 'inherit' });
      }
    } catch {
      console.log(yellow(`  → Could not pull model "${configuredModel}". AI summaries may be limited.\n`));
    }
  }

  console.log(green('\n  ✓ Setup complete!\n'));

  // ── API key prompt ────────────────────────────────────────────────────────────
  console.log(bold('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(bold('  │  OPTIONAL: Add API keys to enable live token scanning           │'));
  console.log(bold('  │  Without keys, you run in Peer Mode (P2P results only).         │'));
  console.log(bold('  │                                                                 │'));
  console.log(bold('  │  Edit this file with your API keys:                             │'));
  console.log(bold(`  │  ${ENV_FILE.slice(0, 65).padEnd(65)}│`));
  console.log(bold('  │                                                                 │'));
  console.log(bold('  │  Required for live scanning:                                    │'));
  console.log(bold('  │    ETHERSCAN_API_KEY  → etherscan.io/apis (free)                │'));
  console.log(bold('  │    GOPLUS_APP_KEY     → gopluslabs.io (free)                   │'));
  console.log(bold('  │    HELIUS_API_KEY     → helius.dev (free, Solana)               │'));
  console.log(bold('  └─────────────────────────────────────────────────────────────────┘\n'));
}

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

// ── Wait until backend accepts connections ────────────────────────────────────
async function waitForBackend(port, timeout = 60_000) {
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
  const cmd  = process.platform === 'darwin' ? 'open'
             : process.platform === 'win32'  ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// ── Main ──────────────────────────────────────────────────────────────────────
await bootstrap();

// Show .env path hint on first run
if (!isDevMode && !fs.existsSync(ENV_FILE.replace('.env', '.env.seen'))) {
  fs.writeFileSync(ENV_FILE.replace('.env', '.env.seen'), '1');
  console.log(yellow('  ┌─────────────────────────────────────────────────────────────┐'));
  console.log(yellow('  │  Running in Peer Mode (no API keys configured).             │'));
  console.log(yellow('  │  To enable live scanning, add your API keys to:             │'));
  console.log(yellow(`  │  ${ENV_FILE.slice(0, 61).padEnd(61)}│`));
  console.log(yellow('  └─────────────────────────────────────────────────────────────┘'));
  console.log('');
}

// Detect mode
let mode = 'peer';
if (fs.existsSync(ENV_FILE)) {
  const env = fs.readFileSync(ENV_FILE, 'utf8');
  if (/^ETHERSCAN_API_KEY=.+/m.test(env)) mode = 'full_node';
}

console.log(`  Mode: ${mode === 'full_node'
  ? bold(green('Full Node')) + ' (live scans + P2P publish)'
  : bold(yellow('Peer')) + ' (P2P receive only)'}`);
console.log('');

const port = await findFreePort();
if (port !== 4000) {
  console.log(yellow(`  Port 4000 in use — using port ${port} instead`));
}

console.log(`  Starting backend on port ${bold(String(port))}…`);

let stopping = false;
let currentBackend = null;

function startBackend() {
  const proc = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd:   BACKEND_DIR,
    env:   { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  currentBackend = proc;

  proc.stdout.on('data', chunk => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
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
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      if (!line.includes('DeprecationWarning')) console.log(red(`  [backend] ${line}`));
    }
  });

  proc.on('exit', code => {
    if (stopping) return;
    console.log(yellow(`\n  Backend exited (code ${code}) — restarting in 3s…\n`));
    setTimeout(() => startBackend(), 3_000);
  });
}

startBackend();

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

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log(yellow('\n  Shutting down…'));
  currentBackend?.kill('SIGTERM');
  setTimeout(() => Pear.exit(0), 2_000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
