/**
 * Points the assembled site at STAGING. Run only through EAS's environment,
 * which supplies the preview build's own public client values — this script
 * never reads .env and never prints a value (refs only):
 *
 *   npx eas env:exec preview "node scripts/demo-link/write-config.mjs"
 *
 * assertStagingConfig refuses the production project, any other project, and
 * any key that is not a publishable client key, before a byte is written.
 */
import { assembleSite, assertStagingConfig } from './lib.mjs';
import { refFromRestUrl } from '../supabase-ref.mjs';

const config = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
};
assertStagingConfig(config);
assembleSite(config);
console.log(`[demo-link] site assembled against project ${refFromRestUrl(config.SUPABASE_URL)} (staging)`);
