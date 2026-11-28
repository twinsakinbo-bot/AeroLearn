begin;
-- Only server-owned mock starts can consume/reset the allowance. Keep retail
-- profile updates working, but reject direct REST and document-RPC bypasses.
create function public.guard_mock_allowance() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
    new.data->'lastMockExamDate' is distinct from old.data->'lastMockExamDate' then
  raise exception 'Mock allowance is server-managed' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_mock_allowance() from public,anon,authenticated;
create trigger mock_allowance_guard before update on public.users
 for each row execute function public.guard_mock_allowance();
commit;
