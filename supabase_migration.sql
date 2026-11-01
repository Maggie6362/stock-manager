-- ============================================================================
-- 股票買賣與損益管理小幫手 — Supabase 資料庫 Schema 與 RLS 安全遷移腳本
-- 依據：SPEC.md v1.0 & supabase_schema.sql
-- 注意：
-- 1. 請先於 Supabase SQL Editor 審查本腳本，確認為正確專案後再執行。
-- 2. 本腳本絕不建立公開讀寫政策 (No USING(true))，所有資料表均強制啟用 RLS。
-- 3. 前端僅可使用 Supabase URL 與 anon/publishable key，嚴禁放入 service_role key。
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. 使用者 Profile 表
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. 證券帳戶表 (同一使用者內帳戶名稱唯一)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint accounts_name_nonempty check (length(trim(name)) > 0),
  constraint accounts_user_name_unique unique (user_id, name),
  constraint accounts_id_user_unique unique (id, user_id)
);

-- 3. 交易紀錄表 (含同日交易穩定排序序號 seq_no，外鍵預設 on delete restrict 防止誤刪含交易帳戶)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  stock_id text not null,
  stock_name text not null,
  trade_date date not null,
  action_type text not null check (action_type in ('BUY', 'SELL')),
  shares integer not null check (shares > 0),
  price numeric(12, 4) not null check (price > 0),
  fee numeric(12, 2) not null default 0 check (fee >= 0),
  tax numeric(12, 2) not null default 0 check (tax >= 0),
  seq_no integer not null default 1,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_stock_id_nonempty check (length(trim(stock_id)) > 0),
  constraint transactions_stock_name_nonempty check (length(trim(stock_name)) > 0),
  constraint transactions_account_owner_fk
    foreign key (account_id, user_id)
    references public.accounts(id, user_id)
    on delete restrict
);

-- 4. 收盤價與參考價格表 (依 user_id + stock_id 隔離儲存，支援 TWSE 官方收盤價與 MANUAL 手動價格跨裝置同步)
create table if not exists public.prices (
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id text not null,
  stock_name text not null default '',
  close_price numeric(12, 4) not null check (close_price > 0),
  price_date date not null default current_date,
  source text not null default 'TWSE' check (source in ('TWSE', 'MANUAL')),
  updated_at timestamptz not null default now(),
  primary key (user_id, stock_id)
);

-- 索引最佳化
create index if not exists idx_accounts_user_id on public.accounts(user_id, sort_order, created_at);
create index if not exists idx_transactions_user_account_stock_date
  on public.transactions(user_id, account_id, stock_id, trade_date, seq_no, created_at);
create index if not exists idx_prices_user_stock on public.prices(user_id, stock_id);

-- 啟用 Row Level Security (RLS) 與授權 authenticated 角色存取資料表（實際資料列仍受下方 RLS Policy 嚴格限制）
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.accounts to authenticated, service_role;
grant select, insert, update, delete on table public.transactions to authenticated, service_role;
grant select, insert, update, delete on table public.prices to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.prices enable row level security;

-- Profiles RLS Policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Accounts RLS Policies
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

-- Transactions RLS Policies (含跨使用者 account_id 引用防護)
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Prices RLS Policies
drop policy if exists "prices_select_own" on public.prices;
create policy "prices_select_own" on public.prices
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "prices_insert_own" on public.prices;
create policy "prices_insert_own" on public.prices
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "prices_update_own" on public.prices;
create policy "prices_update_own" on public.prices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "prices_delete_own" on public.prices;
create policy "prices_delete_own" on public.prices
  for delete to authenticated using (user_id = (select auth.uid()));
