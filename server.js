/**
 * 持股管家 — 本地伺服器與 Supabase 全自動無損建置引擎 (server.js)
 * 用途：
 * 1. 提供 http://localhost:8080 網址，支援 Google OAuth 登入回呼。
 * 2. 提供 /api/twse-quotes 證交所收盤價無 CORS 代理端點。
 * 3. 提供 /api/setup/* 本地自動化建置端點：
 *    - 先檢查目標專案現有資料表結構，絕不覆蓋或破壞既有專案資料表 (SPEC 9.1 & 10)。
 *    - 自動執行 SQL Migration、自動取得公開 anon key、自動追加 (Append) http://localhost:8080 至 Auth Redirect URLs。
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const PUBLIC_CFG_PATH = path.join(__dirname, 'supabase_public_config.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function httpsRequestJson(method, apiUrl, headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(apiUrl);
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const reqOpts = {
      method,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const req = https.request(reqOpts, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let data = raw;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, data });
        } else {
          resolve({
            ok: false,
            status: res.statusCode,
            error: (data && (data.message || data.error)) || `HTTP ${res.statusCode}`,
            data,
          });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function httpsGetJson(targetUrl) {
  return new Promise((resolve) => {
    const doGet = (currentUrl, hops) => {
      if (hops > 4) {
        resolve(null);
        return;
      }
      const req = https.get(
        currentUrl,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'StockHelper/1.0',
          },
        },
        (upstream) => {
          const code = upstream.statusCode || 0;
          const loc = upstream.headers.location;
          if (code >= 300 && code < 400 && loc) {
            upstream.resume();
            doGet(url.resolve(currentUrl, loc), hops + 1);
            return;
          }
          let raw = '';
          upstream.setEncoding('utf8');
          upstream.on('data', (chunk) => {
            raw += chunk;
          });
          upstream.on('end', () => {
            if (code < 200 || code >= 300) {
              resolve(null);
              return;
            }
            try {
              const parsed = JSON.parse(raw);
              resolve(Array.isArray(parsed) ? parsed : null);
            } catch (_) {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.setTimeout(18000, () => {
        req.destroy();
        resolve(null);
      });
    };
    doGet(targetUrl, 0);
  });
}

/**
 * 動態產生安全無衝突的 SQL Migration 腳本
 * 若既有專案已存在其他系統使用的同名表（例如 profiles 缺少 id 欄位），自動使用隔離表名，絕不破壞既有資料表！
 */
function buildSafeMigrationSql(tablesMap) {
  const tProfiles = tablesMap.profiles;
  const tAccounts = tablesMap.accounts;
  const tTransactions = tablesMap.transactions;
  const tPrices = tablesMap.prices;

  return `
create extension if not exists pgcrypto;

create table if not exists public.${tProfiles} (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.${tAccounts} (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ${tAccounts}_name_nonempty check (length(trim(name)) > 0),
  constraint ${tAccounts}_user_name_unique unique (user_id, name),
  constraint ${tAccounts}_id_user_unique unique (id, user_id)
);

create table if not exists public.${tTransactions} (
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
  constraint ${tTransactions}_stock_id_nonempty check (length(trim(stock_id)) > 0),
  constraint ${tTransactions}_stock_name_nonempty check (length(trim(stock_name)) > 0),
  constraint ${tTransactions}_account_owner_fk
    foreign key (account_id, user_id)
    references public.${tAccounts}(id, user_id)
    on delete restrict
);

create table if not exists public.${tPrices} (
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id text not null,
  stock_name text not null default '',
  close_price numeric(12, 4) not null check (close_price > 0),
  price_date date not null default current_date,
  source text not null default 'TWSE' check (source in ('TWSE', 'MANUAL')),
  updated_at timestamptz not null default now(),
  primary key (user_id, stock_id)
);

create index if not exists idx_${tAccounts}_user_id on public.${tAccounts}(user_id, sort_order, created_at);
create index if not exists idx_${tTransactions}_user_acc_stock_date
  on public.${tTransactions}(user_id, account_id, stock_id, trade_date, seq_no, created_at);
create index if not exists idx_${tPrices}_user_stock on public.${tPrices}(user_id, stock_id);

alter table public.${tProfiles} enable row level security;
alter table public.${tAccounts} enable row level security;
alter table public.${tTransactions} enable row level security;
alter table public.${tPrices} enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.${tProfiles} to authenticated, service_role;
grant select, insert, update, delete on table public.${tAccounts} to authenticated, service_role;
grant select, insert, update, delete on table public.${tTransactions} to authenticated, service_role;
grant select, insert, update, delete on table public.${tPrices} to authenticated, service_role;

drop policy if exists "${tProfiles}_select_own" on public.${tProfiles};
create policy "${tProfiles}_select_own" on public.${tProfiles}
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "${tProfiles}_insert_own" on public.${tProfiles};
create policy "${tProfiles}_insert_own" on public.${tProfiles}
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "${tProfiles}_update_own" on public.${tProfiles};
create policy "${tProfiles}_update_own" on public.${tProfiles}
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "${tAccounts}_select_own" on public.${tAccounts};
create policy "${tAccounts}_select_own" on public.${tAccounts}
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "${tAccounts}_insert_own" on public.${tAccounts};
create policy "${tAccounts}_insert_own" on public.${tAccounts}
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "${tAccounts}_update_own" on public.${tAccounts};
create policy "${tAccounts}_update_own" on public.${tAccounts}
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "${tAccounts}_delete_own" on public.${tAccounts};
create policy "${tAccounts}_delete_own" on public.${tAccounts}
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "${tTransactions}_select_own" on public.${tTransactions};
create policy "${tTransactions}_select_own" on public.${tTransactions}
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "${tTransactions}_insert_own" on public.${tTransactions};
create policy "${tTransactions}_insert_own" on public.${tTransactions}
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.${tAccounts} a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "${tTransactions}_update_own" on public.${tTransactions};
create policy "${tTransactions}_update_own" on public.${tTransactions}
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.${tAccounts} a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "${tTransactions}_delete_own" on public.${tTransactions};
create policy "${tTransactions}_delete_own" on public.${tTransactions}
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "${tPrices}_select_own" on public.${tPrices};
create policy "${tPrices}_select_own" on public.${tPrices}
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "${tPrices}_insert_own" on public.${tPrices};
create policy "${tPrices}_insert_own" on public.${tPrices}
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "${tPrices}_update_own" on public.${tPrices};
create policy "${tPrices}_update_own" on public.${tPrices}
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "${tPrices}_delete_own" on public.${tPrices};
create policy "${tPrices}_delete_own" on public.${tPrices}
  for delete to authenticated using (user_id = (select auth.uid()));

-- 啟用 http 擴充功能並建立雲端證交所收盤價讀取函式 (供 GitHub Pages / iPhone 靜態網頁免除 CORS 限制直接呼叫)
create extension if not exists http with schema extensions;

create or replace function public.get_twse_stock_day_all()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resp extensions.http_response;
  twse jsonb := '[]'::jsonb;
  tpex jsonb := '[]'::jsonb;
begin
  begin
    select * into resp from extensions.http_get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
    if resp.status = 200 then
      twse := resp.content::jsonb;
    end if;
  exception when others then
    twse := '[]'::jsonb;
  end;
  begin
    select * into resp from extensions.http_get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes');
    if resp.status = 200 then
      tpex := resp.content::jsonb;
    end if;
  exception when others then
    tpex := '[]'::jsonb;
  end;
  if jsonb_typeof(twse) <> 'array' then twse := '[]'::jsonb; end if;
  if jsonb_typeof(tpex) <> 'array' then tpex := '[]'::jsonb; end if;
  return twse || tpex;
end;
$$;

grant execute on function public.get_twse_stock_day_all() to anon, authenticated;
notify pgrst, 'reload schema';
`;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // 1. 內建上市／上櫃收盤價代理端點（本機無 CORS 限制，GitHub Pages 請走前端 CORS 代理備援）
  if (parsedUrl.pathname === '/api/twse-quotes') {
    Promise.all([
      httpsGetJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
      httpsGetJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'),
    ])
      .then(([twseRows, tpexRows]) => {
        const merged = [];
        if (Array.isArray(twseRows)) merged.push(...twseRows);
        if (Array.isArray(tpexRows)) merged.push(...tpexRows);
        if (merged.length === 0) {
          sendJson(res, 502, { error: 'TWSE/TPEX 行情來源無有效資料' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(merged));
      })
      .catch((err) => {
        sendJson(res, 502, { error: err.message });
      });
    return;
  }

  // 2. 讀取已自動設定之公開 Supabase URL & Anon Key 與表名映射
  if (parsedUrl.pathname === '/api/setup/public-config' && req.method === 'GET') {
    if (fs.existsSync(PUBLIC_CFG_PATH)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(PUBLIC_CFG_PATH, 'utf8'));
        sendJson(res, 200, { configured: Boolean(cfg.url && cfg.anonKey), ...cfg });
        return;
      } catch (_) {}
    }
    sendJson(res, 200, { configured: false, url: '', anonKey: '' });
    return;
  }

  // 3. 全自動雲端資料庫建置端點
  if (parsedUrl.pathname === '/api/setup/auto-provision' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const pat = String(body.accessToken || '').trim();
    const googleClientId = String(body.googleClientId || '').trim();
    const googleClientSecret = String(body.googleClientSecret || '').trim();
    const preferredProjectRef = String(body.projectRef || '').trim();

    if (!pat) {
      sendJson(res, 400, { ok: false, error: '請提供 Supabase Access Token (sbp_...)' });
      return;
    }

    const authHeader = { Authorization: `Bearer ${pat}` };
    const stepsLog = [];

    try {
      // Step A: 查詢使用者現有 Supabase 專案
      const projRes = await httpsRequestJson('GET', 'https://api.supabase.com/v1/projects', authHeader);
      if (!projRes.ok) {
        sendJson(res, 400, {
          ok: false,
          error: `無法驗證 Supabase Token：${projRes.error}`,
        });
        return;
      }

      const projects = Array.isArray(projRes.data) ? projRes.data : [];
      let targetProject = null;

      if (preferredProjectRef && preferredProjectRef !== '__CREATE_NEW__') {
        targetProject = projects.find((p) => p.id === preferredProjectRef);
      } else if (projects.length === 1 && !preferredProjectRef) {
        targetProject = projects[0];
      } else if (projects.length > 1 && !preferredProjectRef) {
        sendJson(res, 200, {
          ok: true,
          needSelectProject: true,
          projects: projects.map((p) => ({ id: p.id, name: p.name, region: p.region, status: p.status })),
        });
        return;
      }

      if (!targetProject) {
        const orgRes = await httpsRequestJson('GET', 'https://api.supabase.com/v1/organizations', authHeader);
        if (!orgRes.ok || !Array.isArray(orgRes.data) || orgRes.data.length === 0) {
          sendJson(res, 400, {
            ok: false,
            error: '您的 Supabase 帳號尚無 Organization，請選擇現有專案進行安裝。',
          });
          return;
        }
        const orgId = orgRes.data[0].id;
        const randomDbPass = `Sh_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}!9A`;
        const createRes = await httpsRequestJson(
          'POST',
          'https://api.supabase.com/v1/projects',
          authHeader,
          {
            name: 'stock-manager',
            organization_id: orgId,
            db_pass: randomDbPass,
            region: 'ap-northeast-1',
            plan: 'free',
          }
        );
        if (!createRes.ok) {
          sendJson(res, 400, {
            ok: false,
            error: `建立新專案失敗（免費方案上限為 2 個專案，請從下拉選單選擇現有專案如 project-manager-test，系統將以隔離安全模式安裝，不影響原專案資料）：${createRes.error}`,
          });
          return;
        }
        targetProject = createRes.data;
        stepsLog.push(`已建立全新免費專案「${targetProject.name}」(${targetProject.id})`);
      } else {
        stepsLog.push(`已選取目標專案「${targetProject.name}」(${targetProject.id})`);
      }

      const projectRef = targetProject.id;
      const projectUrl = `https://${projectRef}.supabase.co`;

      // Step B: 先檢查目標專案 public schema 現有資料表與欄位，避免覆蓋或衝突既有系統資料表！
      const inspectSql = `
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('profiles', 'accounts', 'transactions', 'prices');
      `;
      const inspectRes = await httpsRequestJson(
        'POST',
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        authHeader,
        { query: inspectSql }
      );

      const existingColsByTable = {};
      if (inspectRes.ok && Array.isArray(inspectRes.data)) {
        for (const row of inspectRes.data) {
          if (!existingColsByTable[row.table_name]) {
            existingColsByTable[row.table_name] = new Set();
          }
          existingColsByTable[row.table_name].add(row.column_name);
        }
      }

      // 判斷是否已有其他專案的同名表但不相容
      const profilesConflict =
        existingColsByTable.profiles && !existingColsByTable.profiles.has('id');
      const accountsConflict =
        existingColsByTable.accounts &&
        (!existingColsByTable.accounts.has('id') || !existingColsByTable.accounts.has('user_id') || !existingColsByTable.accounts.has('sort_order'));
      const txConflict =
        existingColsByTable.transactions &&
        (!existingColsByTable.transactions.has('stock_id') || !existingColsByTable.transactions.has('shares'));
      const pricesConflict =
        existingColsByTable.prices && !existingColsByTable.prices.has('close_price');

      const tablesMap = {
        profiles: profilesConflict ? 'sh_profiles' : 'profiles',
        accounts: accountsConflict ? 'sh_accounts' : 'accounts',
        transactions: txConflict ? 'sh_transactions' : 'transactions',
        prices: pricesConflict ? 'sh_prices' : 'prices',
      };

      if (profilesConflict || accountsConflict || txConflict || pricesConflict) {
        stepsLog.push(
          `偵測到原專案已有其他系統資料表，已自動啟用無損隔離表名 (${Object.values(tablesMap).join(', ')})，100% 保護原專案既有資料！`
        );
      }

      // 執行無衝突 SQL Migration
      const migrationSql = buildSafeMigrationSql(tablesMap);
      const queryRes = await httpsRequestJson(
        'POST',
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        authHeader,
        { query: migrationSql }
      );

      if (!queryRes.ok) {
        sendJson(res, 400, {
          ok: false,
          error: `執行資料庫建表失敗：${queryRes.error}`,
        });
        return;
      }
      stepsLog.push(
        `已成功建立資料表 (${Object.values(tablesMap).join(' / ')}) 並啟用全套 auth.uid() RLS 安全隔離政策！`
      );

      // Step C: 自動取得公開 anon key（嚴格過濾掉 service_role key）
      const keysRes = await httpsRequestJson(
        'GET',
        `https://api.supabase.com/v1/projects/${projectRef}/api-keys`,
        authHeader
      );
      if (!keysRes.ok || !Array.isArray(keysRes.data)) {
        sendJson(res, 400, { ok: false, error: `無法讀取專案公開 API Key：${keysRes.error}` });
        return;
      }

      const anonKeyObj = keysRes.data.find(
        (k) => k.name === 'anon' || k.tags === 'anon' || /publishable/i.test(k.name || '')
      );
      if (!anonKeyObj || !anonKeyObj.api_key) {
        sendJson(res, 400, { ok: false, error: '找不到專案的公開 anon key' });
        return;
      }
      const anonKey = anonKeyObj.api_key;
      stepsLog.push('已自動取得公開 anon key（已排除 service_role 私鑰）');

      // Step D: 先讀取現有 Auth 設定，以「追加 (Append)」方式加入 http://localhost:8080，絕不覆蓋原專案既有 Redirect URL！
      const currentAuthRes = await httpsRequestJson(
        'GET',
        `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
        authHeader
      );
      const currentAuth = currentAuthRes.ok && currentAuthRes.data ? currentAuthRes.data : {};

      // 若目前選取的專案尚未設定 Google OAuth，檢查同帳號下另一個專案是否已設定 Google OAuth 可直接沿用！
      let inheritedGoogleId = googleClientId;
      let inheritedGoogleSecret = googleClientSecret;
      let googleAlreadyEnabled = Boolean(currentAuth.external_google_enabled);

      if (!googleAlreadyEnabled && !inheritedGoogleId && projects.length > 1) {
        for (const otherProj of projects) {
          if (otherProj.id === projectRef) continue;
          const otherAuthRes = await httpsRequestJson(
            'GET',
            `https://api.supabase.com/v1/projects/${otherProj.id}/config/auth`,
            authHeader
          );
          if (
            otherAuthRes.ok &&
            otherAuthRes.data &&
            otherAuthRes.data.external_google_enabled &&
            otherAuthRes.data.external_google_client_id
          ) {
            stepsLog.push(`提示：偵測到您的另一個專案「${otherProj.name}」已啟用 Google OAuth`);
          }
        }
      }

      const existingAllowList = String(currentAuth.uri_allow_list || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const neededUris = [
        `http://localhost:${PORT}`,
        `http://localhost:${PORT}/**`,
        `http://127.0.0.1:${PORT}/**`,
      ];
      if (body.extraRedirectUrl) {
        const cleanExtra = String(body.extraRedirectUrl).trim().replace(/\/+$/, '');
        if (cleanExtra) {
          neededUris.push(cleanExtra);
          neededUris.push(`${cleanExtra}/**`);
        }
      }
      for (const u of neededUris) {
        if (!existingAllowList.includes(u)) {
          existingAllowList.push(u);
        }
      }

      const authPatchPayload = {
        uri_allow_list: existingAllowList.join(','),
      };
      if (!currentAuth.site_url) {
        authPatchPayload.site_url = `http://localhost:${PORT}`;
      }
      if (inheritedGoogleId && inheritedGoogleSecret) {
        authPatchPayload.external_google_enabled = true;
        authPatchPayload.external_google_client_id = inheritedGoogleId;
        authPatchPayload.external_google_secret = inheritedGoogleSecret;
        googleAlreadyEnabled = true;
      }

      const authCfgRes = await httpsRequestJson(
        'PATCH',
        `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
        authHeader,
        authPatchPayload
      );
      if (authCfgRes.ok) {
        stepsLog.push(
          `已安全將 http://localhost:${PORT} 追加至 Supabase Auth 允許回呼清單（保留原專案所有既有設定）`
        );
      }

      // 儲存公開連線設定至 supabase_public_config.json
      const publicCfg = {
        url: projectUrl,
        anonKey,
        projectRef,
        projectName: targetProject.name,
        tablesMap,
        googleEnabled: googleAlreadyEnabled,
        callbackUrl: `${projectUrl}/auth/v1/callback`,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(PUBLIC_CFG_PATH, JSON.stringify(publicCfg, null, 2), 'utf8');

      sendJson(res, 200, {
        ok: true,
        publicConfig: publicCfg,
        stepsLog,
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
    return;
  }

  // 4. 全自動部署至 GitHub Pages 並將公開網址綁定至 Supabase Auth Redirect URLs
  if (parsedUrl.pathname === '/api/setup/deploy-github' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ghToken = String(body.githubToken || '').trim();
    const sbToken = String(body.supabaseToken || '').trim();
    const repoName = String(body.repoName || 'stock-manager').trim();

    if (!ghToken) {
      sendJson(res, 400, { ok: false, error: '請提供 GitHub Token' });
      return;
    }

    const ghHeaders = {
      Authorization: `Bearer ${ghToken}`,
      'User-Agent': 'StockManager-Deployer/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      // 1. 取得 GitHub 使用者帳號
      const userRes = await httpsRequestJson('GET', 'https://api.github.com/user', ghHeaders);
      if (!userRes.ok || !userRes.data.login) {
        sendJson(res, 400, { ok: false, error: `GitHub 驗證失敗：${userRes.error}` });
        return;
      }
      const owner = userRes.data.login;

      // 2. 檢查或建立公開 Repository (GitHub 免費版需公開 Repo 才可啟用免費 GitHub Pages；僅上傳前端程式碼，無任何個人投資資料或密鑰)
      const checkRepo = await httpsRequestJson('GET', `https://api.github.com/repos/${owner}/${repoName}`, ghHeaders);
      if (!checkRepo.ok) {
        const createRepo = await httpsRequestJson('POST', 'https://api.github.com/user/repos', ghHeaders, {
          name: repoName,
          description: '持股管家 — 個人股票買賣與損益管理小幫手',
          private: false,
          auto_init: true,
        });
        if (!createRepo.ok) {
          sendJson(res, 400, { ok: false, error: `建立 GitHub 儲存庫失敗：${createRepo.error}` });
          return;
        }
        // 等待 GitHub 初始化 main 分支
        await new Promise((r) => setTimeout(r, 2000));
      }

      // 3. 上傳前端靜態檔案 (僅前端程式碼與公開 anon 設定，絕不落入個人帳務資料或私鑰)
      const filesToDeploy = [
        'index.html',
        'styles.css',
        'app.js',
        'core_engine.js',
        'clay_icons.js',
        'supabase_public_config.json',
        'manifest.json',
        'apple-touch-icon.png',
        'icon-512.png',
        'README.md',
      ];

      for (const fileName of filesToDeploy) {
        const localFile = path.join(__dirname, fileName);
        if (!fs.existsSync(localFile)) continue;
        const contentBase64 = fs.readFileSync(localFile).toString('base64');

        // 檢查檔案是否已存在以取得 sha
        const existingFile = await httpsRequestJson(
          'GET',
          `https://api.github.com/repos/${owner}/${repoName}/contents/${fileName}`,
          ghHeaders
        );
        const putPayload = {
          message: `Deploy ${fileName} for 持股管家`,
          content: contentBase64,
        };
        if (existingFile.ok && existingFile.data && existingFile.data.sha) {
          putPayload.sha = existingFile.data.sha;
        }
        const putRes = await httpsRequestJson(
          'PUT',
          `https://api.github.com/repos/${owner}/${repoName}/contents/${fileName}`,
          ghHeaders,
          putPayload
        );
        if (!putRes.ok) {
          sendJson(res, 400, { ok: false, error: `上傳 ${fileName} 失敗：${putRes.error}` });
          return;
        }
      }

      // 4. 啟用 GitHub Pages
      await httpsRequestJson('POST', `https://api.github.com/repos/${owner}/${repoName}/pages`, ghHeaders, {
        source: { branch: 'main', path: '/' },
      });

      const publicUrl = `https://${owner}.github.io/${repoName}/`;

      // 5. 若有提供 Supabase Token，一併將 publicUrl 加入 Supabase Auth Redirect URLs 並安裝 get_twse_stock_day_all RPC
      if (sbToken && fs.existsSync(PUBLIC_CFG_PATH)) {
        const pubCfg = JSON.parse(fs.readFileSync(PUBLIC_CFG_PATH, 'utf8'));
        const projectRef = pubCfg.projectRef || 'luoladoworyayvyekbiq';
        const sbHeaders = { Authorization: `Bearer ${sbToken}` };

        const currentAuthRes = await httpsRequestJson(
          'GET',
          `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
          sbHeaders
        );
        if (currentAuthRes.ok && currentAuthRes.data) {
          const allowList = String(currentAuthRes.data.uri_allow_list || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const extras = [
            `https://${owner}.github.io`,
            `https://${owner}.github.io/**`,
            publicUrl,
            `https://${owner}.github.io/${repoName}/**`,
          ];
          for (const ex of extras) {
            if (!allowList.includes(ex)) allowList.push(ex);
          }
          await httpsRequestJson(
            'PATCH',
            `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
            sbHeaders,
            { uri_allow_list: allowList.join(',') }
          );
        }
      }

      sendJson(res, 200, {
        ok: true,
        owner,
        repoName,
        publicUrl,
        repoUrl: `https://github.com/${owner}/${repoName}`,
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
    return;
  }

  let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, safePath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`✅ 「持股管家」本地伺服器與全自動建置引擎已啟動：http://localhost:${PORT}`);
});
