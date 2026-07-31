// Local development uses the SDK-specific @env fallback in lib/supabase.web.ts.
// Production hosting replaces this response at runtime without committing values.
globalThis.__BRAZOS_CONFIG__ = globalThis.__BRAZOS_CONFIG__ || {};
