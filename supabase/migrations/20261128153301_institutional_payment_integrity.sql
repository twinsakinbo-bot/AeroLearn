-- Financial-integrity follow-up to reviewed PR #5. No remote application or payment service.
begin;
-- Locale-independent canonical key: remove ASCII whitespace and uppercase ASCII letters.
-- Unicode/confusable characters and unsupported punctuation are rejected, not guessed.
create function institutional_private.canonical_payment_reference(p_reference text)
returns text language plpgsql immutable strict parallel safe set search_path='' as $$
declare canonical text;
begin
 canonical:=translate(regexp_replace(p_reference collate pg_catalog."C",'[[:space:]]','','g'),
  'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ');
 if length(p_reference)>80 or canonical !~ '^[A-Z0-9][A-Z0-9._:/-]{2,79}$' then
  raise exception 'Payment reference must canonicalize to 3-80 ASCII reference characters' using errcode='22023';
 end if;
 return canonical;
end $$;
revoke all on function institutional_private.canonical_payment_reference(text) from public,anon,authenticated;
grant execute on function institutional_private.canonical_payment_reference(text) to authenticated,service_role;
-- Existing approval_ref values are retained verbatim. Invalid legacy references or
-- canonical collisions abort this whole migration for manual reconciliation.
-- No state/school/cohort predicate: cancellation never frees an approved payment.
alter table public.institutional_terms add column approval_ref_key text
 generated always as (institutional_private.canonical_payment_reference(approval_ref)) stored;
alter table public.institutional_terms add constraint institutional_payment_reference_unique unique(approval_ref_key);

-- Clients cannot write terms; also protect retained reconciliation against future
-- server writers deleting an approval or replacing its reference to release a key.
create function institutional_private.preserve_payment_reconciliation()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.approval_ref is not null then
  if tg_op='DELETE' then raise exception 'Approved payment reconciliation must be retained' using errcode='42501'; end if;
  if (new.institution_id,new.id,new.approval_ref,new.approved_by,new.approved_at,new.quoted_minor,new.currency)
   is distinct from (old.institution_id,old.id,old.approval_ref,old.approved_by,old.approved_at,old.quoted_minor,old.currency) then
   raise exception 'Approved payment reconciliation is immutable' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function institutional_private.preserve_payment_reconciliation() from public,anon,authenticated;
create trigger institutional_payment_reconciliation before update or delete on public.institutional_terms
 for each row execute function institutional_private.preserve_payment_reconciliation();
-- Keep the reviewed private command/authorization/lock order intact. New approvals
-- store canonical references; the generated key covers every writer, including
-- direct SQL/RPC paths. Unique-index conflict detection serializes cross-school races.
create or replace function public.institutional_licensing_command(p_action text,p_institution_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_action='approve_term' then
  if jsonb_typeof(p_payload->'approval_ref') is distinct from 'string' then raise exception 'Payment reference required' using errcode='22023'; end if;
  p_payload:=jsonb_set(p_payload,'{approval_ref}',to_jsonb(institutional_private.canonical_payment_reference(p_payload->>'approval_ref')));
 end if;
 return institutional_private.licensing_command(p_action,p_institution_id,p_payload);
end $$;
revoke all on function public.institutional_licensing_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.institutional_licensing_command(text,uuid,jsonb) to authenticated;
commit;
