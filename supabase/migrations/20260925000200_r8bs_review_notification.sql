-- 20260925000200_r8bs_review_notification.sql — R8b-s: the review
-- notification stops leaking the blind window.
--
-- R8a (20260925000100) made the reviews TABLE double-blind (D1): a review is
-- hidden from its reviewee until the counterpart review exists or 7 days
-- pass. The baseline's notify_on_review() predates that and still handed the
-- reviewee the star rating at INSERT time — "… left you 5★." — before the
-- reveal condition was met. The operator saw the leak on the phone during
-- the 2026-08-31 Gate 1 device walk (docs/BACKLOG.md §R8b, item 1).
--
-- The fix branches on the same reveal predicate R8a defined, evaluated for
-- the row being inserted. At insert time its 7-day arm is always false, so
-- it is true exactly when the counterpart review already exists — the one
-- moment the rating is already legitimately visible, because this insert
-- reveals both. Nothing else moves: recipient, actor, category, type,
-- title, data and dedupe key stay the baseline's, and the reviews_notify
-- trigger is untouched. create or replace preserves the existing ACL — the
-- phase69 revoke posture — so notify_on_review stays out of both 040_authz
-- §17 SECURITY DEFINER allow-lists.

create or replace function public.notify_on_review() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if public.review_is_revealed(new.job_id, new.reviewer_id, new.reviewee_id, new.created_at) then
    -- REVEALED at insert: the baseline copy, exactly. Nothing is hidden, so
    -- nothing is withheld.
    perform public.enqueue_notification(
      new.reviewee_id,
      new.reviewer_id,
      'job_updates',
      'review_received',
      'You got a review',
      public.notify_display_name(new.reviewer_id) || ' left you '
        || new.rating::text || '★.',
      jsonb_build_object('screen', 'ProfileMain'),
      'review:' || new.id::text
    );
  else
    -- BLIND at insert: a review exists — say so — but no rating, no star,
    -- no digit ("seven" is spelled out so the proof can assert the body
    -- carries no digit at all). Both halves of D1 are stated because both
    -- are true.
    perform public.enqueue_notification(
      new.reviewee_id,
      new.reviewer_id,
      'job_updates',
      'review_received',
      'You got a review',
      public.notify_display_name(new.reviewer_id)
        || ' left you a review. It stays hidden until you review them back or seven days pass.',
      jsonb_build_object('screen', 'ProfileMain'),
      'review:' || new.id::text
    );
  end if;
  return new;
end;
$$;

comment on function public.notify_on_review() is
  'R8b-s: enqueues review_received for the reviewee, branching on public.review_is_revealed(new.job_id, new.reviewer_id, new.reviewee_id, new.created_at). Revealed at insert (the counterpart already existed, so this insert reveals both): the baseline body with the star rating. Blind at insert: no rating, no digit — the body states both D1 reveal arms. Recipient, actor, category, type, title, data, dedupe key and the reviews_notify trigger are the baseline''s, unchanged.';
