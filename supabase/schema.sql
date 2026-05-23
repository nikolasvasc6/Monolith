-- ============================================================================
-- PositionPips — Schema completo
-- Cole TUDO no SQL Editor do Supabase (Project > SQL Editor > New query)
-- e execute (botão "Run"). Idempotente: pode ser reexecutado sem perda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela: user_preferences
--    Guarda preferências por usuário (tema atual e bloco ativo do diário)
-- ----------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  active_block_index integer not null default 1 check (active_block_index >= 1),
  theme              text    not null default 'dark' check (theme in ('dark','light')),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Tabela: trades
--    Cada operação registrada no diário
--    block_index = nº do bloco; position = posição dentro do bloco (0..34)
-- ----------------------------------------------------------------------------
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  block_index integer not null default 1 check (block_index >= 1),
  position    integer not null default 0 check (position >= 0 and position < 35),
  asset       text not null,
  type        text not null check (type in ('take','stop')),
  pnl         numeric(18,2) not null,
  trade_date  date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trades_user_block_pos_idx
  on public.trades (user_id, block_index, position);

create index if not exists trades_user_created_idx
  on public.trades (user_id, created_at);

-- ----------------------------------------------------------------------------
-- 3. Trigger: atualizar updated_at automaticamente
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

drop trigger if exists prefs_set_updated_at on public.user_preferences;
create trigger prefs_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Trigger: cria automaticamente a linha em user_preferences ao registrar
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Row Level Security: cada usuário só vê os próprios dados
-- ----------------------------------------------------------------------------
alter table public.user_preferences enable row level security;
alter table public.trades            enable row level security;

-- ---- user_preferences ----
drop policy if exists "prefs_select_own"  on public.user_preferences;
drop policy if exists "prefs_insert_own"  on public.user_preferences;
drop policy if exists "prefs_update_own"  on public.user_preferences;
drop policy if exists "prefs_delete_own"  on public.user_preferences;

create policy "prefs_select_own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "prefs_insert_own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "prefs_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "prefs_delete_own"
  on public.user_preferences for delete
  using (auth.uid() = user_id);

-- ---- trades ----
drop policy if exists "trades_select_own" on public.trades;
drop policy if exists "trades_insert_own" on public.trades;
drop policy if exists "trades_update_own" on public.trades;
drop policy if exists "trades_delete_own" on public.trades;

create policy "trades_select_own"
  on public.trades for select
  using (auth.uid() = user_id);

create policy "trades_insert_own"
  on public.trades for insert
  with check (auth.uid() = user_id);

create policy "trades_update_own"
  on public.trades for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "trades_delete_own"
  on public.trades for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Realtime: habilita publicações para sincronização entre dispositivos
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.user_preferences;
