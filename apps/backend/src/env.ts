// Load .env from the backend directory regardless of where the process is started from.
// This must be the first import in index.ts so env vars are set before other modules read them.
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });
