-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRATION v2 — esquema escalable para cualquier mercado futuro
--  Ejecutar en Supabase → SQL Editor → New query → pegar y Run.
--
--  El código de sync escribe aquí automáticamente en cuanto las tablas
--  existan (y sigue escribiendo en price_predictions para compatibilidad).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── forecasts: formato largo genérico ────────────────────────────────────────
--  Un row por (market, variable, ts). Añadir un mercado nuevo = nuevas
--  filas, cero DDL. Ejemplos de variable:
--    RRTT2:  up_price, up_prob, down_price, down_prob
--    aFRR:   up_price, down_price
--    IDA1:   price
create table if not exists forecasts (
  id           bigserial primary key,
  market       text        not null,
  variable     text        not null,
  target_date  date        not null,
  ts           timestamptz not null,
  pred         numeric,
  real         numeric,
  generated_at timestamptz,
  unique (market, variable, ts)
);

create index if not exists forecasts_market_date_idx
  on forecasts (market, target_date);
create index if not exists forecasts_ts_idx
  on forecasts (ts);

alter table forecasts enable row level security;

create policy "forecasts anon read"
  on forecasts for select to anon using (true);

create policy "forecasts service write"
  on forecasts for all to service_role using (true) with check (true);

-- ── model_metrics: histórico diario de rendimiento por modelo ────────────────
--  Alimentada por automation/validate_models.py. Permite ver degradación
--  de cualquier modelo con una query y descargarse el histórico en CSV.
create table if not exists model_metrics (
  id           bigserial primary key,
  market       text        not null,   -- 'RRTT2', 'aFRR', 'IDA1'
  variable     text        not null,   -- 'up_price', 'down_price', 'price'
  target_date  date        not null,
  n            integer,                -- horas/periodos comparados
  mae          numeric,
  rmse         numeric,
  bias         numeric,                -- mean(pred - real): + = sobrepredice
  peak_mae     numeric,                -- MAE en top 15% de precios reales
  peak_recall  numeric,                -- % de picos reales predichos como pico
  extra        jsonb,                  -- métricas específicas del mercado
  created_at   timestamptz default now(),
  unique (market, variable, target_date)
);

create index if not exists model_metrics_market_idx
  on model_metrics (market, target_date);

alter table model_metrics enable row level security;

create policy "model_metrics anon read"
  on model_metrics for select to anon using (true);

create policy "model_metrics service write"
  on model_metrics for all to service_role using (true) with check (true);
