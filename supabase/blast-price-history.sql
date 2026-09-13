-- Additive canonical chart history. Run after the existing worker setup.sql.
-- Stores exactly the reward engine's published price. Does not change eligibility.
begin;
create table if not exists public.blast_price_history (
 project_id text not null references public.burned_worker_status(project_id) on delete cascade,
 observed_at timestamptz not null,
 slot bigint not null check (slot >= 0),
 price_raw numeric(78,0) not null check (price_raw > 0),
 primary key (project_id, observed_at)
);
alter table public.blast_price_history enable row level security;
drop policy if exists blast_price_public_read on public.blast_price_history;
create policy blast_price_public_read on public.blast_price_history for select to anon, authenticated using (true);
revoke all on public.blast_price_history from anon, authenticated;
grant select on public.blast_price_history to anon, authenticated;
grant all on public.blast_price_history to service_role;
create or replace function public.record_blast_canonical_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.project_id like 'blast-stonk-%' and new.current_price_raw > 0 and new.current_price_time is not null then
  insert into public.blast_price_history(project_id, observed_at, slot, price_raw)
  values(new.project_id,new.current_price_time,new.indexed_through_slot,new.current_price_raw)
  on conflict(project_id, observed_at) do update set price_raw=excluded.price_raw,slot=excluded.slot
   where excluded.slot >= public.blast_price_history.slot;
 end if;
 return new;
end;
$$;
revoke all on function public.record_blast_canonical_price() from public, anon, authenticated;
drop trigger if exists blast_canonical_history on public.burned_worker_status;
create trigger blast_canonical_history after insert or update of current_price_raw,current_price_time on public.burned_worker_status
for each row execute function public.record_blast_canonical_price();
commit;
