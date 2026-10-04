// Serves the demo link against the LOCAL stack, for looking at it by hand:
//   node scripts/demo-link/serve-local.mjs [--export]   (http://127.0.0.1:8090)
import { assembleSite, exportWeb, localConfig, serve } from './lib.mjs';

if (process.argv.includes('--export')) exportWeb();
assembleSite(localConfig());
const server = await serve(undefined, 8090);
console.log(`[demo-link] serving http://127.0.0.1:${server.address().port} against the local stack`);
