-- Run this in the Supabase SQL Editor (once, to create the tables)

create table if not exists price_predictions (
  id          bigserial primary key,
  market      text        not null,    -- 'aFRR' or 'IDA1'
  target_date date        not null,
  ts          timestamptz not null,    -- 15-min timestamp (Europe/Madrid)
  generated_at timestamptz,
  -- aFRR columns
  up_pred     real,
  down_pred   real,
  up_real     real,
  down_real   real,
  -- IDA1 columns
  ida1_pred   real,
  ida1_real   real,
  unique (market, target_date, ts)
);

create index if not exists idx_pp_market_date on price_predictions (market, target_date);
create index if not exists idx_pp_real_afrr   on price_predictions (market, target_date) where up_real is not null;
create index if not exists idx_pp_real_ida1   on price_predictions (market, target_date) where ida1_real is not null;

create table if not exists price_meta (
  market       text        not null,
  target_date  date        not null,
  generated_at timestamptz,
  stats_json   jsonb,
  hourly_pred  jsonb,       -- IDA1 hourly predictions {"00:00": 449.98, ...}
  ai_report    text,
  primary key (market, target_date)
);

-- Allow public (anon) read access
alter table price_predictions enable row level security;
alter table price_meta        enable row level security;

create policy "public read predictions" on price_predictions for select using (true);
create policy "public read meta"        on price_meta        for select using (true);

-- Allow service_role to write (used by cron jobs via SUPABASE_SERVICE_KEY)
create policy "service write predictions" on price_predictions for all using (auth.role() = 'service_role');
create policy "service write meta"        on price_meta        for all using (auth.role() = 'service_role');
