import { DEFAULT_JOB_FILTERS, type JobFilterModel } from './jobFilters';

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-25) — ONE FILTER MEMORY for the worker's
 * browse surfaces: the Map and the job list (WorkerResults — Available Jobs,
 * skills, nearby, search) read and write THIS model, so "Open the full list" and
 * the search capsule arrive with the map's choices intact, and a filter set on
 * the list is still set when the worker hops back to the map. The radius keeps
 * its own persisted store (lib/discoveryFilterStorage.ts), as before.
 *
 * Session-scoped by design — the app's lifetime, never written to disk (a
 * filter that quietly returns days later hides jobs) — and owned by one user: a
 * different signed-in account starts from the defaults.
 */
let owner: string | null = null;
let model: JobFilterModel = DEFAULT_JOB_FILTERS;
const listeners = new Set<() => void>();

export function readSessionJobFilters(userId: string | null): JobFilterModel {
  return userId !== null && userId === owner ? model : DEFAULT_JOB_FILTERS;
}

export function writeSessionJobFilters(userId: string | null, next: JobFilterModel): void {
  owner = userId;
  model = next;
  listeners.forEach((listener) => listener());
}

export function subscribeSessionJobFilters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
