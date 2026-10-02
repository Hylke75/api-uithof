-- Initieel schema voor de SEM -> CASH synchronisatie.
-- Alle bedragen in centen (bigint) om afrondingsverschillen te voorkomen.
-- RLS staat aan zonder policies: alleen de service role (server-side) heeft toegang.

-- Logboek: één rij per sync-run.
create table public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'success', 'partial', 'failed')),
  dry_run         boolean not null,
  trigger         text not null default 'cron' check (trigger in ('cron', 'handmatig')),
  window_from     date not null,
  window_to       date not null,
  n_opgehaald     integer not null default 0,
  n_geboekt       integer not null default 0,
  n_proef         integer not null default 0,
  n_overgeslagen  integer not null default 0,
  n_fout          integer not null default 0,
  error           text
);

create index sync_runs_started_at_idx on public.sync_runs (started_at desc);

-- Mapping: SEM-omzetsoort -> grootboekrekening + btw-code in CASH.
create table public.map_omzetsoort (
  sem_omzetsoort     text primary key,
  omschrijving       text,
  grootboekrekening  text not null,
  btw_code           text not null,
  kostenplaats       text,
  actief             boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- Mapping: SEM-klant -> debiteurnummer in CASH.
create table public.map_debiteur (
  sem_debiteur_id      text primary key,
  cash_debiteurnummer  text not null,
  naam                 text,
  updated_at           timestamptz not null default now()
);

-- Facturenhistorie: één rij per SEM-factuur, met de status van de boeking.
create table public.sem_facturen (
  id                  uuid primary key default gen_random_uuid(),
  sem_factuur_id      text not null unique,
  factuurnummer       text not null,
  factuurdatum        date not null,
  soort               text not null default 'factuur'
                      check (soort in ('factuur', 'creditnota')),
  sem_debiteur_id     text not null,
  totaal_excl_cents   bigint not null,
  totaal_btw_cents    bigint not null,
  totaal_incl_cents   bigint not null,
  sem_payload         jsonb not null,
  content_hash        text not null,
  status              text not null default 'nieuw'
                      check (status in ('nieuw', 'proef', 'geboekt', 'fout', 'gewijzigd_na_boeking')),
  cash_boeking_id     text,
  cash_payload        jsonb,
  foutmelding         text,
  laatste_run_id      uuid references public.sync_runs (id),
  geboekt_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index sem_facturen_status_idx on public.sem_facturen (status);
create index sem_facturen_factuurdatum_idx on public.sem_facturen (factuurdatum);

alter table public.sync_runs      enable row level security;
alter table public.map_omzetsoort enable row level security;
alter table public.map_debiteur   enable row level security;
alter table public.sem_facturen   enable row level security;
