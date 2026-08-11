import { supabase } from './supabase';

/**
 * Screens 64/25 — a worker's advertised services with optional pricing
 * (phase53's worker_services). The portfolio_items treatment: the owner
 * manages rows with direct RLS DML; published rows are public marketplace
 * info; drafts (published=false) are owner-only, enforced by RLS.
 *
 * price_cents NULL means "ask for a quote" — a real answer, rendered as
 * such, never as $0.
 */

export type ServicePriceUnit = 'flat' | 'hourly';

export type WorkerService = {
  id: string;
  worker_id: string;
  title: string;
  description: string | null;
  category: string;
  price_cents: number | null;
  price_unit: ServicePriceUnit;
  published: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

const SERVICE_COLUMNS =
  'id, worker_id, title, description, category, price_cents, price_unit, published, position, created_at, updated_at';

/**
 * A worker's services. RLS already hides other people's drafts, so one query
 * serves both the public profile (published only arrive) and the owner's
 * manager (their drafts arrive too).
 */
export async function fetchWorkerServices(workerId: string) {
  const { data, error } = await supabase
    .from('worker_services')
    .select(SERVICE_COLUMNS)
    .eq('worker_id', workerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  return { data: (data ?? []) as WorkerService[], error };
}

export type ServiceInput = {
  title: string;
  description?: string | null;
  category: string;
  priceCents?: number | null;
  priceUnit?: ServicePriceUnit;
  published?: boolean;
  position?: number;
};

export async function addWorkerService(workerId: string, input: ServiceInput) {
  const { data, error } = await supabase
    .from('worker_services')
    .insert({
      worker_id: workerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category,
      price_cents: input.priceCents ?? null,
      price_unit: input.priceUnit ?? 'flat',
      published: input.published ?? true,
      position: input.position ?? 0,
    })
    .select(SERVICE_COLUMNS)
    .single();

  return { data: (data ?? null) as WorkerService | null, error };
}

export async function updateWorkerService(serviceId: string, input: Partial<ServiceInput>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.category !== undefined) patch.category = input.category;
  if (input.priceCents !== undefined) patch.price_cents = input.priceCents;
  if (input.priceUnit !== undefined) patch.price_unit = input.priceUnit;
  if (input.published !== undefined) patch.published = input.published;
  if (input.position !== undefined) patch.position = input.position;

  const { data, error } = await supabase
    .from('worker_services')
    .update(patch)
    .eq('id', serviceId)
    .select(SERVICE_COLUMNS)
    .single();

  return { data: (data ?? null) as WorkerService | null, error };
}

export async function removeWorkerService(serviceId: string) {
  const { error } = await supabase.from('worker_services').delete().eq('id', serviceId);
  return { error };
}

/** "$60 flat" / "$45/hr" / "Ask for a quote" — the one price line. */
export function servicePriceLabel(service: Pick<WorkerService, 'price_cents' | 'price_unit'>): string {
  if (service.price_cents == null) return 'Ask for a quote';
  const dollars = service.price_cents / 100;
  const amount = `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  return service.price_unit === 'hourly' ? `${amount}/hr` : `${amount} flat`;
}
