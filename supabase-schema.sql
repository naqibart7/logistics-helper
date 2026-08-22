-- Site Materials Readiness System - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Canonical items — THE fix for duplicate/messy data.
-- Every material line resolves to one of these; free text becomes an alias, not a new row.
create table item_catalog (
    id              uuid primary key default gen_random_uuid(),
    canonical_name  text not null unique,
    category        text,
    default_unit    text,
    aliases         text[] default '{}',      -- known variant spellings, merged in
    created_at      timestamptz default now()
);

create index idx_item_catalog_canonical_name on item_catalog(canonical_name);

-- Per supplier+item lead time. Captured once, reused everywhere.
create table suppliers (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    location    text,
    contact     text,
    whatsapp    text,
    created_at  timestamptz default now()
);

create table supplier_item_lead_times (
    id              uuid primary key default gen_random_uuid(),
    supplier_id     uuid references suppliers(id) on delete cascade,
    item_id         uuid references item_catalog(id) on delete cascade,
    lead_time_days  int not null,
    updated_at      timestamptz default now(),
    unique (supplier_id, item_id)
);

create index idx_supplier_item_lead_times_supplier on supplier_item_lead_times(supplier_id);
create index idx_supplier_item_lead_times_item on supplier_item_lead_times(item_id);

create table projects (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    client            text,
    location          text,
    install_date      date,                 -- the anchor date everything works backward from
    status            text default 'draft',
    raw_quote_text    text,
    ocr_method        text,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now()
);

create index idx_projects_status on projects(status);
create index idx_projects_install_date on projects(install_date);

-- The core object. A BOM line is a tracked commitment, not a shopping list row.
create table materials (
    id                  uuid primary key default gen_random_uuid(),
    project_id          uuid references projects(id) on delete cascade,
    item_id             uuid references item_catalog(id),   -- resolved, not free text
    quantity_required   numeric not null,
    quantity_delivered  numeric default 0,                   -- updated by checklist
    unit                text,
    price_per_unit      numeric,
    supplier_id         uuid references suppliers(id),
    need_by_date        date,                -- when it must be on site (defaults from project.install_date, editable per line)
    lead_time_days      int,                 -- resolved from supplier_item_lead_times, editable override
    order_by_date       date generated always as (need_by_date - (lead_time_days + 2)) stored, -- +2 = default safety buffer
    status              text default 'planned',  -- planned | ordered | at_risk | late | on_site | complete
    source              text default 'parsed',   -- parsed | manual | suggested
    confidence          numeric,             -- from the parser
    do_photo_url        text,               -- supplier delivery-order photo, no OCR on this in v1
    checklist_note      text,
    created_at          timestamptz default now(),
    updated_at          timestamptz default now()
);

create index idx_materials_project on materials(project_id);
create index idx_materials_item on materials(item_id);
create index idx_materials_supplier on materials(supplier_id);
create index idx_materials_status on materials(status);
create index idx_materials_need_by_date on materials(need_by_date);
create index idx_materials_order_by_date on materials(order_by_date);

-- Every accept/reject of a suggested item — this is what makes the suggestion engine learn.
create table suggestion_feedback (
    id           uuid primary key default gen_random_uuid(),
    project_id   uuid references projects(id) on delete cascade,
    item_id      uuid references item_catalog(id) on delete cascade,
    accepted     boolean not null,
    created_at   timestamptz default now()
);

create index idx_suggestion_feedback_project on suggestion_feedback(project_id);
create index idx_suggestion_feedback_item on suggestion_feedback(item_id);

-- kept from v1, unchanged shape
create table quotes_tracker (
    id             uuid primary key default gen_random_uuid(),
    project_id     uuid references projects(id) on delete cascade,
    supplier_id    uuid references suppliers(id),
    status         text default 'requested',  -- requested | received | accepted | rejected
    price          numeric,
    notes          text,
    requested_at   timestamptz default now()
);

create index idx_quotes_tracker_project on quotes_tracker(project_id);
create index idx_quotes_tracker_supplier on quotes_tracker(supplier_id);

-- RLS Policies (single user, but good practice)
alter table item_catalog enable row level security;
alter table suppliers enable row level security;
alter table supplier_item_lead_times enable row level security;
alter table projects enable row level security;
alter table materials enable row level security;
alter table suggestion_feedback enable row level security;
alter table quotes_tracker enable row level security;

-- Allow all operations for authenticated users (or anon in single-user case)
create policy "Allow all operations on item_catalog" on item_catalog for all using (true) with check (true);
create policy "Allow all operations on suppliers" on suppliers for all using (true) with check (true);
create policy "Allow all operations on supplier_item_lead_times" on supplier_item_lead_times for all using (true) with check (true);
create policy "Allow all operations on projects" on projects for all using (true) with check (true);
create policy "Allow all operations on materials" on materials for all using (true) with check (true);
create policy "Allow all operations on suggestion_feedback" on suggestion_feedback for all using (true) with check (true);
create policy "Allow all operations on quotes_tracker" on quotes_tracker for all using (true) with check (true);

-- View for materials readiness status (computed on read)
create or replace view materials_readiness as
select
    m.*,
    p.install_date as project_install_date,
    p.name as project_name,
    ic.canonical_name as item_name,
    ic.category as item_category,
    s.name as supplier_name,
    case
        when m.quantity_delivered >= m.quantity_required then 'complete'
        when current_date > m.need_by_date then 'late'
        when current_date > m.order_by_date and m.status not in ('ordered', 'on_site', 'complete') then 'at_risk'
        else m.status
    end as computed_status,
    case
        when current_date > m.order_by_date and m.status not in ('ordered', 'on_site', 'complete') then true
        else false
    end as should_have_ordered
from materials m
left join projects p on m.project_id = p.id
left join item_catalog ic on m.item_id = ic.id
left join suppliers s on m.supplier_id = s.id;

-- Helper function to get co-occurrence suggestions
create or replace function get_item_suggestions(for_item_id uuid, min_confidence numeric default 0.5, min_projects int default 5)
returns table (
    item_id uuid,
    canonical_name text,
    category text,
    confidence numeric,
    appeared_together_count int
) language plpgsql stable as $$
begin
    return query
    with target_projects as (
        select distinct project_id
        from materials
        where item_id = for_item_id
    ),
    co_occurring_items as (
        select
            m.item_id as other_item_id,
            count(distinct m.project_id) as together_count
        from materials m
        inner join target_projects tp on m.project_id = tp.project_id
        where m.item_id != for_item_id
        group by m.item_id
        having count(distinct m.project_id) >= min_projects
    ),
    total_projects_with_target as (
        select count(distinct project_id) as total_count
        from target_projects
    )
    select
        ic.id as item_id,
        ic.canonical_name,
        ic.category,
        (coi.together_count::numeric / nullif(tp.total_count, 0)) as confidence,
        coi.together_count as appeared_together_count
    from co_occurring_items coi
    cross join total_projects_with_target tp
    inner join item_catalog ic on ic.id = coi.other_item_id
    where (coi.together_count::numeric / nullif(tp.total_count, 0)) >= min_confidence
    order by confidence desc;
end;
$$;

