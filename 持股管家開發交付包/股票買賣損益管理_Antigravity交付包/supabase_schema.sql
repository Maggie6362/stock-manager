-- 股票買賣與損益管理小幫手：初版 Supabase schema 範本
-- Antigravity 必須先檢查並審查，再於正確專案執行；不要直接套用到含有既有資料的資料庫。
-- 此 SQL 不會建立公開讀寫政策。所有資料表啟用 RLS。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint accounts_name_nonempty check (length(trim(name)) > 0),
  constraint accounts_user_name_unique unique (user_id, name),
  constraint accounts_id_user_unique unique (id, user_id)
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_owner_fk
    foreign key (account_id, user_id)
    references public.accounts(id, user_id)
    on delete restrict
);

create index if not exists idx_accounts_user_id on public.accounts(user_id);
create index if not exists idx_transactions_user_account_stock_date
  on public.transactions(user_id, account_id, stock_id, trade_date, created_at);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

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

-- 注意：
-- 1) 新使用者建立 profile 與預設四個帳戶可由登入後前端初始化，需避免重複建立。
-- 2) 「超額賣出」與「編輯／刪除後交易序列有效性」需在應用程式層完整驗證；
--    若未來有多端同時寫入的需求，再加資料庫 RPC／交易鎖以避免競態。
-- 3) 上線前由 Antigravity 檢查 Supabase 專案既有 schema、政策與版本相容性。
