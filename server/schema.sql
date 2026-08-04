-- ============================================================================
-- Site Logistics Helper — Supabase schema
--
-- Run this in the Supabase SQL editor (or `supabase db push`) once.
-- The frontend string IDs are stored in `local_id` (unique); the PK stays a
-- uuid so the frontend can keep its existing generateId() scheme untouched.
--
-- RLS is enabled with policies that let a signed-in user read/write only
-- their own rows. Anonymous users simply fall back to localStorage.
-- ============================================================================

-- ─── Projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
    id                uuid primary key default gen_random_uuid(),
    local_id          text unique not null,
    user_id           uuid references auth.users (id),
    name              text not null,
    client            text,
    location          text,
    delivery_address  text,
    contact_person    text,
    contact_phone     text,
    need_by_date      date,
    quotation_number  text,
    status            text default 'Draft',
    materials         jsonb not null default '[]',
    raw_text          text,
    ocr_method        text,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now()
);

alter table public.projects enable row level security;

drop policy if exists "projects select own" on public.projects;
create policy "projects select own"
    on public.projects for select
    using (auth.uid() = user_id);

drop policy if exists "projects insert own" on public.projects;
create policy "projects insert own"
    on public.projects for insert
    with check (auth.uid() = user_id);

drop policy if exists "projects update own" on public.projects;
create policy "projects update own"
    on public.projects for update
    using (auth.uid() = user_id);

drop policy if exists "projects delete own" on public.projects;
create policy "projects delete own"
    on public.projects for delete
    using (auth.uid() = user_id);

-- ─── Suppliers ───────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
    id            uuid primary key default gen_random_uuid(),
    local_id      text unique not null,
    user_id       uuid references auth.users (id),
    name          text not null,
    categories    text[] not null default '{}',
    location      text,
    contact       text,
    whatsapp      text,
    created_at    timestamptz default now()
);

alter table public.suppliers enable row level security;

drop policy if exists "suppliers select own" on public.suppliers;
create policy "suppliers select own"
    on public.suppliers for select
    using (auth.uid() = user_id);

drop policy if exists "suppliers insert own" on public.suppliers;
create policy "suppliers insert own"
    on public.suppliers for insert
    with check (auth.uid() = user_id);

drop policy if exists "suppliers update own" on public.suppliers;
create policy "suppliers update own"
    on public.suppliers for update
    using (auth.uid() = user_id);

drop policy if exists "suppliers delete own" on public.suppliers;
create policy "suppliers delete own"
    on public.suppliers for delete
    using (auth.uid() = user_id);

-- ─── Updated-at trigger (projects) ───────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
    before update on public.projects
    for each row execute function public.set_updated_at();
