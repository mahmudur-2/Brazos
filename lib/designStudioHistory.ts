import { useSyncExternalStore } from 'react';
import {
  getDesignOverrides,
  setDesignOverrides,
  setDesignOverridesChangeListener,
  type DesignOverrides,
} from './designOverrides';

/**
 * RUN S2 (C4) — UNDO/REDO OVER EVERY OVERRIDE CHANGE.
 *
 * The store tells this module the PREVIOUS override set on every real change
 * (lib/designOverrides.ts's one change listener), so the stack covers all of
 * them by construction: dials, per-token and per-section resets, reset
 * everything, preset loads and JSON imports — each one is one undoable step.
 * Undo and redo re-apply snapshots through the same `setDesignOverrides`
 * every other writer uses, with an `applying` latch so their own writes are
 * not re-recorded.
 *
 * Bounded and in-memory: the stack keeps the most recent HISTORY_LIMIT
 * steps (the dispatch floor is 50) and dies with the process, exactly like
 * the LIVE tier it tracks.
 */

export const HISTORY_LIMIT = 100;

let past: DesignOverrides[] = [];
let future: DesignOverrides[] = [];
let applying = false;

const listeners = new Set<() => void>();
let counts = { undo: 0, redo: 0 };

function emit(): void {
  if (counts.undo !== past.length || counts.redo !== future.length) {
    counts = { undo: past.length, redo: future.length };
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

setDesignOverridesChangeListener((previous) => {
  if (applying) return;
  past.push(previous);
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
  emit();
});

export function canUndoDesignChange(): boolean {
  return past.length > 0;
}

export function canRedoDesignChange(): boolean {
  return future.length > 0;
}

export function undoDesignChange(): void {
  const previous = past.pop();
  if (previous === undefined) return;
  future.push(getDesignOverrides());
  applying = true;
  setDesignOverrides(previous);
  applying = false;
  emit();
}

export function redoDesignChange(): void {
  const next = future.pop();
  if (next === undefined) return;
  past.push(getDesignOverrides());
  applying = true;
  setDesignOverrides(next);
  applying = false;
  emit();
}

/** Empty both stacks — a fresh session's baseline. */
export function resetDesignHistory(): void {
  past = [];
  future = [];
  emit();
}

const readCounts = () => counts;

/** Live stack depths, for the panel's undo/redo affordances. */
export function useDesignHistoryCounts(): { undo: number; redo: number } {
  return useSyncExternalStore(subscribe, readCounts, readCounts);
}
