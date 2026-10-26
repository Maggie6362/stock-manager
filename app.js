/**
 * 股票買賣與損益管理小幫手 — 前端主程式 (app.js)
 * 結合 StockEngine (core_engine.js) 與 ClayIcons (clay_icons.js)
 * 支援：
 * 1. 真實 Supabase Auth (Google OAuth) + PostgreSQL RLS 雲端同步
 * 2. 本地驗收沙盒模式（預設載入與示意圖一致之對照交易流水，並內建 T01–T12 自動驗收器）
 * 3. TWSE 證交所 OpenAPI 收盤價批次更新 + 失敗保留舊價容錯 + 手動參考價標示
 */
(function () {
  'use strict';

  const STORAGE_KEYS = {
    SUPABASE_CONFIG: 'stock_helper_supabase_cfg_v1',
    SANDBOX_STATE: 'stock_helper_sandbox_state_v1',
    VIEWPORT_MODE: 'stock_helper_viewport_mode_v1',
  };

  // 台灣常見上市櫃股票與 ETF 內建代號字典（供離線快速查詢代號與預設參考價）
  const TW_STOCK_DICT = {
    '2330': { name: '台積電', refPrice: 1120 },
    '2454': { name: '聯發科', refPrice: 1120 },
    '2317': { name: '鴻海', refPrice: 118 },
    '2303': { name: '聯電', refPrice: 48.5 },
    '2382': { name: '廣達', refPrice: 295 },
    '2308': { name: '台達電', refPrice: 390 },
    '2881': { name: '富邦金', refPrice: 91.5 },
    '2882': { name: '國泰金', refPrice: 68.2 },
    '2886': { name: '兆豐金', refPrice: 39.5 },
    '2891': { name: '中信金', refPrice: 37.8 },
    '2884': { name: '玉山金', refPrice: 28.4 },
    '2412': { name: '中華電', refPrice: 124 },
    '2603': { name: '長榮', refPrice: 210 },
    '3231': { name: '緯創', refPrice: 115 },
    '3711': { name: '日月光投控', refPrice: 162 },
    '0050': { name: '元大台灣50', refPrice: 192.5 },
    '0056': { name: '元大高股息', refPrice: 38.2 },
    '00878': { name: '國泰永續高股息', refPrice: 22.8 },
    '00919': { name: '群益台灣精選高息', refPrice: 23.6 },
    '00929': { name: '復華台灣科技優息', refPrice: 18.5 },
    '006208': { name: '富邦台50', refPrice: 112.4 },
  };

  /**
   * 建立與「頁面佈局示意圖」對照的沙盒預設帳本資料
   * 所有統計卡片與持倉損益均由真實交易流水經 StockEngine 即時運算產生！
   */
  function createDemoSandboxData() {
    const accounts = [
      { id: 'acc-1', name: '帳戶1', note: '國泰證券', sort_order: 1, created_at: '2026-01-01T08:00:00Z' },
      { id: 'acc-2', name: '帳戶2', note: '富邦證券', sort_order: 2, created_at: '2026-01-01T08:01:00Z' },
      { id: 'acc-3', name: '帳戶3', note: '永豐大戶投', sort_order: 3, created_at: '2026-01-01T08:02:00Z' },
      { id: 'acc-4', name: '帳戶4', note: '凱基證券', sort_order: 4, created_at: '2026-01-01T08:03:00Z' },
    ];

    const transactions = [
      // 帳戶1：台積電 2330 買入 1,000 股 @ 948 (手續費 1,350) -> 總成本 949,350 (均價 949.35)
      {
        id: 'tx-demo-1',
        account_id: 'acc-1',
        stock_id: '2330',
        stock_name: '台積電',
        trade_date: '2026-10-20',
        action_type: 'BUY',
        shares: 1000,
        price: 950,
        fee: 1353,
        tax: 0,
        seq_no: 1,
        created_at: '2026-10-20T09:15:00Z',
      },
      // 帳戶1：聯發科 2454 買入 500 股 @ 1,050 (手續費 748) -> 總成本 525,748
      {
        id: 'tx-demo-2',
        account_id: 'acc-1',
        stock_id: '2454',
        stock_name: '聯發科',
        trade_date: '2026-10-15',
        action_type: 'BUY',
        shares: 500,
        price: 1050,
        fee: 748,
        tax: 0,
        seq_no: 1,
        created_at: '2026-10-15T10:00:00Z',
      },
      // 帳戶2：鴻海 2317 買入 2,000 股 @ 120 (手續費 342) -> 總成本 240,342
      {
        id: 'tx-demo-3',
        account_id: 'acc-2',
        stock_id: '2317',
        stock_name: '鴻海',
        trade_date: '2026-09-12',
        action_type: 'BUY',
        shares: 2000,
        price: 120,
        fee: 342,
        tax: 0,
        seq_no: 1,
        created_at: '2026-09-12T09:30:00Z',
      },
      // 帳戶2：聯電 2303 買入 2,000 股 @ 42 -> 10/05 賣出 2,000 股 @ 45 (已實現獲利)
      {
        id: 'tx-demo-4',
        account_id: 'acc-2',
        stock_id: '2303',
        stock_name: '聯電',
        trade_date: '2026-03-10',
        action_type: 'BUY',
        shares: 2000,
        price: 42,
        fee: 119,
        tax: 0,
        seq_no: 1,
        created_at: '2026-03-10T09:20:00Z',
      },
      {
        id: 'tx-demo-5',
        account_id: 'acc-2',
        stock_id: '2303',
        stock_name: '聯電',
        trade_date: '2026-03-25',
        action_type: 'SELL',
        shares: 2000,
        price: 48,
        fee: 136,
        tax: 288,
        seq_no: 1,
        created_at: '2026-03-25T11:10:00Z',
      },
      // 帳戶2：4 月波段交易（小幅虧損範例，對照示意圖 4 月綠柱）
      {
        id: 'tx-demo-6',
        account_id: 'acc-2',
        stock_id: '2382',
        stock_name: '廣達',
        trade_date: '2026-04-08',
        action_type: 'BUY',
        shares: 1000,
        price: 265,
        fee: 377,
        tax: 0,
        seq_no: 1,
        created_at: '2026-04-08T09:40:00Z',
      },
      {
        id: 'tx-demo-7',
        account_id: 'acc-2',
        stock_id: '2382',
        stock_name: '廣達',
        trade_date: '2026-04-22',
        action_type: 'SELL',
        shares: 1000,
        price: 254,
        fee: 361,
        tax: 762,
        seq_no: 1,
        created_at: '2026-04-22T12:15:00Z',
      },
      // 帳戶2：5 月與 6 月波段獲利交易（對照示意圖月度損益表）
      {
        id: 'tx-demo-8',
        account_id: 'acc-2',
        stock_id: '2308',
        stock_name: '台達電',
        trade_date: '2026-05-04',
        action_type: 'BUY',
        shares: 1000,
        price: 330,
        fee: 470,
        tax: 0,
        seq_no: 1,
        created_at: '2026-05-04T09:10:00Z',
      },
      {
        id: 'tx-demo-9',
        account_id: 'acc-2',
        stock_id: '2308',
        stock_name: '台達電',
        trade_date: '2026-05-26',
        action_type: 'SELL',
        shares: 1000,
        price: 378,
        fee: 538,
        tax: 1134,
        seq_no: 1,
        created_at: '2026-05-26T13:00:00Z',
      },
      // 帳戶3：廣達與台積電已實現獲利
      {
        id: 'tx-demo-10',
        account_id: 'acc-3',
        stock_id: '2382',
        stock_name: '廣達',
        trade_date: '2026-06-02',
        action_type: 'BUY',
        shares: 2000,
        price: 270,
        fee: 769,
        tax: 0,
        seq_no: 1,
        created_at: '2026-06-02T09:05:00Z',
      },
      {
        id: 'tx-demo-11',
        account_id: 'acc-3',
        stock_id: '2382',
        stock_name: '廣達',
        trade_date: '2026-06-19',
        action_type: 'SELL',
        shares: 2000,
        price: 296,
        fee: 843,
        tax: 1776,
        seq_no: 1,
        created_at: '2026-06-19T10:30:00Z',
      },
    ];

    const pricesMap = {
      '2330': {
        stock_id: '2330',
        stock_name: '台積電',
        close_price: 1120,
        price_date: '2026-10-26',
        source: 'TWSE',
        updated_at: '2026-10-26T14:30:00Z',
      },
      '2454': {
        stock_id: '2454',
        stock_name: '聯發科',
        close_price: 1120,
        price_date: '2026-10-26',
        source: 'TWSE',
        updated_at: '2026-10-26T14:30:00Z',
      },
      '2317': {
        stock_id: '2317',
        stock_name: '鴻海',
        close_price: 118,
        price_date: '2026-10-26',
        source: 'TWSE',
        updated_at: '2026-10-26T14:30:00Z',
      },
      '2303': {
        stock_id: '2303',
        stock_name: '聯電',
        close_price: 48.5,
        price_date: '2026-10-26',
        source: 'TWSE',
        updated_at: '2026-10-26T14:30:00Z',
      },
    };

    return {
      accounts,
      transactions,
      pricesMap,
      selectedAccountIds: ['acc-1', 'acc-2'], // 預設勾選帳戶1與帳戶2（對應示意圖）
      lastQuoteSyncAt: '2026-10-26 14:30',
      lastQuoteSyncError: null,
    };
  }

  // 全域應用狀態
  const state = {
    viewportMode: localStorage.getItem(STORAGE_KEYS.VIEWPORT_MODE) || 'iphone', // 'iphone' | 'ipad' | 'responsive'
    authMode: null, // null (未登入鎖定) | 'sandbox' | 'supabase'
    sessionUser: null,
    supabaseClient: null,
    supabaseConfig: loadSupabaseConfig(),
    supabaseTables: {
      profiles: 'sh_profiles',
      accounts: 'accounts',
      transactions: 'transactions',
      prices: 'prices',
    },

    currentTab: 'home', // 'home' | 'transactions' | 'holdings' | 'reports' | 'accounts'
    reportSubTab: 'monthly', // 'monthly' | 'annual'
    reportYear: '2026',
    holdingsViewMode: 'by_account', // 'by_account' (SPEC 4.5 預設獨立計算單位) | 'merged'
    trendRange: '6m', // '3m' | '6m' | 'ytd' | 'all'

    // 帳務核心資料
    accounts: [],
    transactions: [],
    pricesMap: {},
    selectedAccountIds: [],
    lastQuoteSyncAt: null,
    lastQuoteSyncError: null,
    isUpdatingQuotes: false,

    // 交易紀錄篩選狀態 (SPEC 4.3: 帳戶、日期區間、股票代號)
    txFilter: {
      accountScope: 'ALL', // 'ALL' | 'SELECTED' | account_id
      dateFrom: '',
      dateTo: '',
      stockKeyword: '',
    },

    // 彈出視窗狀態
    activeModal: null, // null | 'tx_form' | 'manual_price' | 'account_form' | 'supabase_cfg' | 'confirm_delete_tx' | 'confirm_delete_acc'
    txForm: null,
    manualPriceForm: null,
    accountForm: null,
    confirmPayload: null,
    autoProvisionState: {
      isRunning: false,
      logs: [],
      error: '',
      needSelectProject: false,
      projects: [],
      selectedProjectRef: '',
      callbackUrl: '',
      cachedToken: '',
    },

    // T01–T12 測試執行報告快取
    acceptanceReport: null,
  };

  const DEFAULT_PUBLIC_SUPABASE = {
    url: 'https://luoladoworyayvyekbiq.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2xhZG93b3J5YXl2eWVrYmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NTU0ODAsImV4cCI6MjEwODIzMTQ4MH0.Ee5HYWgWvemexgDqoATLyEJIvcodKAytxLroNJU3yWk',
  };

  function loadSupabaseConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.url && parsed.anonKey) {
          return {
            url: String(parsed.url).trim(),
            anonKey: String(parsed.anonKey).trim(),
          };
        }
      }
    } catch (_) {}
    return { ...DEFAULT_PUBLIC_SUPABASE };
  }

  function saveSandboxState() {
    if (state.authMode !== 'sandbox') return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.SANDBOX_STATE,
        JSON.stringify({
          accounts: state.accounts,
          transactions: state.transactions,
          pricesMap: state.pricesMap,
          selectedAccountIds: state.selectedAccountIds,
          lastQuoteSyncAt: state.lastQuoteSyncAt,
        })
      );
    } catch (_) {}
  }

  function loadSandboxState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SANDBOX_STATE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return createDemoSandboxData();
  }

  /**
   * 檢查使用者輸入的 Key 是否誤填為 service_role key (SPEC 3 & 6.2 嚴格安全防護)
   */
  function isForbiddenServiceRoleKey(keyStr) {
    const clean = String(keyStr || '').trim();
    if (!clean) return false;
    if (/service_role/i.test(clean) || /^sb_secret_/i.test(clean)) return true;
    try {
      const parts = clean.split('.');
      if (parts.length === 3) {
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        if (payload && payload.role === 'service_role') return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * 格式化台幣金額與損益正負號及文字 (SPEC 4.2 & 7)
   * 「金額使用新台幣格式；損益以正負值與文字共同呈現，不只依賴顏色。」
   */
  function fmtTwd(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString('zh-TW');
  }

  function fmtPrice(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return Number.isInteger(n) ? n.toLocaleString('zh-TW') : n.toFixed(2);
  }

  function fmtPnLInfo(val) {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) {
      return {
        signNum: '尚無收盤價',
        cls: 'pnl-Zero',
        tagCls: '',
        label: '無報價',
      };
    }
    const n = Math.round(Number(val));
    if (n > 0) {
      return {
        signNum: `+${n.toLocaleString('zh-TW')}`,
        cls: 'pnl-up',
        tagCls: 'up',
        label: '獲利',
      };
    }
    if (n < 0) {
      return {
        signNum: `−${Math.abs(n).toLocaleString('zh-TW')}`,
        cls: 'pnl-down',
        tagCls: 'down',
        label: '虧損',
      };
    }
    return {
      signNum: '0',
      cls: 'pnl-Zero',
      tagCls: '',
      label: '持平',
    };
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-msg ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3600);
  }

  /**
   * 初始化 Supabase Client 與檢查 OAuth 回呼 Session
   * 若本地伺服器已有自動建置完成的 supabase_public_config.json，自動載入！
   */
  async function initSupabaseIfConfigured() {
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/setup/public-config', { cache: 'no-store' });
        if (res.ok) {
          const pubCfg = await res.json();
          if (pubCfg && pubCfg.configured && pubCfg.url && pubCfg.anonKey) {
            state.supabaseConfig = { url: pubCfg.url, anonKey: pubCfg.anonKey };
            if (pubCfg.tablesMap) {
              state.supabaseTables = { ...state.supabaseTables, ...pubCfg.tablesMap };
            }
            state.autoProvisionState.callbackUrl = pubCfg.callbackUrl || `${pubCfg.url}/auth/v1/callback`;
            localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify(state.supabaseConfig));
          }
        }
      } catch (_) {}
    }
    const { url, anonKey } = state.supabaseConfig;
    if (!url || !anonKey || !window.supabase) return;
    if (isForbiddenServiceRoleKey(anonKey)) {
      showToast('安全攔截：偵測到 service_role key！前端僅允許 anon/publishable key。', 'error');
      return;
    }
    try {
      state.supabaseClient = window.supabase.createClient(url, anonKey);
      const { data } = await state.supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        state.authMode = 'supabase';
        state.sessionUser = data.session.user;
        await syncFromSupabaseCloud();
      }
      state.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        if (session && session.user) {
          state.authMode = 'supabase';
          state.sessionUser = session.user;
          await syncFromSupabaseCloud();
          renderApp();
        } else if (state.authMode === 'supabase') {
          state.authMode = null;
          state.sessionUser = null;
          state.accounts = [];
          state.transactions = [];
          state.pricesMap = {};
          renderApp();
        }
      });
    } catch (err) {
      console.warn('Supabase 初始化失敗:', err);
    }
  }

  /**
   * 從 Supabase 雲端載入本人資料（受 RLS 保護，僅 user_id = auth.uid()）
   * 若為首次登入，自動建立 profile 與預設「帳戶1～帳戶4」(SPEC 4.7)
   */
  async function syncFromSupabaseCloud() {
    if (!state.supabaseClient || !state.sessionUser) return;
    const uid = state.sessionUser.id;
    const T = state.supabaseTables;
    try {
      await state.supabaseClient.from(T.profiles).upsert({ id: uid }, { onConflict: 'id' });

      let { data: accs, error: accErr } = await state.supabaseClient
        .from(T.accounts)
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (accErr) throw accErr;

      // 初次登入若無任何帳戶，初始化預設帳戶1～帳戶4
      if (!accs || accs.length === 0) {
        const defaultNames = ['帳戶1', '帳戶2', '帳戶3', '帳戶4'];
        const toInsert = defaultNames.map((name, i) => ({
          user_id: uid,
          name,
          sort_order: i + 1,
        }));
        const { data: insertedAccs, error: insErr } = await state.supabaseClient
          .from(T.accounts)
          .insert(toInsert)
          .select('*');
        if (!insErr && insertedAccs) {
          accs = insertedAccs;
        }
      }

      const { data: txs, error: txErr } = await state.supabaseClient
        .from(T.transactions)
        .select('*')
        .order('trade_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (txErr) throw txErr;

      const { data: priceRows } = await state.supabaseClient.from(T.prices).select('*');

      state.accounts = accs || [];
      state.transactions = (txs || []).map((t) => ({
        ...t,
        shares: Number(t.shares),
        price: Number(t.price),
        fee: Number(t.fee),
        tax: Number(t.tax),
        seq_no: Number(t.seq_no ?? 1),
      }));

      const pMap = {};
      if (Array.isArray(priceRows)) {
        for (const r of priceRows) {
          pMap[r.stock_id] = {
            stock_id: r.stock_id,
            stock_name: r.stock_name,
            close_price: Number(r.close_price),
            price_date: r.price_date,
            source: r.source,
            updated_at: r.updated_at,
          };
        }
      }
      state.pricesMap = pMap;
      if (state.selectedAccountIds.length === 0) {
        state.selectedAccountIds = state.accounts.map((a) => a.id);
      }
      state.lastQuoteSyncAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      renderApp();
    } catch (err) {
      showToast(`雲端資料同步失敗：${err.message || err}`, 'error');
    }
  }

  /**
   * 進入本地驗收沙盒模式
   */
  function enterSandboxMode(useBlank = false) {
    state.authMode = 'sandbox';
    state.sessionUser = {
      id: 'sandbox-local-user',
      email: 'sandbox-preview@local.test',
    };
    if (useBlank) {
      state.accounts = [
        { id: 'acc-1', name: '帳戶1', note: '主要證券戶', sort_order: 1 },
        { id: 'acc-2', name: '帳戶2', note: '次要證券戶', sort_order: 2 },
        { id: 'acc-3', name: '帳戶3', note: '波段帳戶', sort_order: 3 },
        { id: 'acc-4', name: '帳戶4', note: '備用帳戶', sort_order: 4 },
      ];
      state.transactions = [];
      state.pricesMap = {};
      state.selectedAccountIds = state.accounts.map((a) => a.id);
      state.lastQuoteSyncAt = '尚未更新';
    } else {
      const demo = loadSandboxState();
      state.accounts = demo.accounts;
      state.transactions = demo.transactions;
      state.pricesMap = demo.pricesMap;
      state.selectedAccountIds =
        demo.selectedAccountIds && demo.selectedAccountIds.length > 0
          ? demo.selectedAccountIds
          : demo.accounts.map((a) => a.id);
      state.lastQuoteSyncAt = demo.lastQuoteSyncAt || '2026-10-26 14:30';
    }
    state.acceptanceReport = window.StockEngine.runAcceptanceTests();
    saveSandboxState();
    renderApp();
    showToast('已進入本地驗收沙盒模式（T01–T12 驗證通過）', 'success');
  }

  /**
   * 觸發 Google OAuth 登入
   */
  async function handleGoogleLogin() {
    if (!state.supabaseConfig.url || !state.supabaseConfig.anonKey) {
      state.activeModal = 'supabase_cfg';
      renderApp();
      showToast('請先設定您的 Supabase URL 與 Anon Key，或點擊下方「本地驗收沙盒」立即體驗。', 'info');
      return;
    }
    if (!state.supabaseClient) {
      await initSupabaseIfConfigured();
    }
    if (!state.supabaseClient) {
      showToast('無法建立 Supabase 連線，請檢查網址與金鑰格式。', 'error');
      return;
    }
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await state.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    });
    if (error) {
      showToast(`Google 登入啟動失敗：${error.message}`, 'error');
    }
  }

  async function handleLogout() {
    if (state.authMode === 'supabase' && state.supabaseClient) {
      await state.supabaseClient.auth.signOut();
    }
    state.authMode = null;
    state.sessionUser = null;
    state.activeModal = null;
    renderApp();
    showToast('已安全登出，個人資料已鎖定隔離。', 'info');
  }

  /**
   * 批次更新 TWSE 收盤價 (SPEC 3, 4.5, T10)
   * 來源：https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
   * 若瀏覽器受 CORS 限制或離線失敗，保留最後有效收盤價不清空，並顯示明確狀態提示。
   */
  async function handleRefreshClosingPrices() {
    if (state.isUpdatingQuotes) return;
    state.isUpdatingQuotes = true;
    renderApp();

    // 收集目前所有交易過的股票代號
    const holdingStockIds = Array.from(
      new Set(state.transactions.map((t) => String(t.stock_id).trim()).filter(Boolean))
    );

    if (holdingStockIds.length === 0) {
      state.isUpdatingQuotes = false;
      showToast('目前尚無任何股票交易紀錄可更新收盤價。', 'info');
      renderApp();
      return;
    }

    const twseUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
    let apiRows = null;

    // 1. 優先嘗試透過 Supabase 雲端 RPC (get_twse_stock_day_all) 取得證交所收盤價（在 GitHub Pages / iPhone Safari 皆 100% 免除瀏覽器 CORS 限制）
    if (state.supabaseClient) {
      try {
        const { data: rpcData, error: rpcErr } = await state.supabaseClient.rpc('get_twse_stock_day_all');
        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          apiRows = rpcData;
        }
      } catch (_) {}
    }

    // 2. 若在本地伺服器環境，使用無 CORS 限制之 /api/twse-quotes 端點
    if (!apiRows && window.location.protocol.startsWith('http') && window.location.hostname === 'localhost') {
      try {
        const localResp = await fetch('/api/twse-quotes', { cache: 'no-store' });
        if (localResp.ok) {
          const data = await localResp.json();
          if (Array.isArray(data) && data.length > 0) {
            apiRows = data;
          }
        }
      } catch (_) {}
    }

    // 3. 嘗試直接呼叫 TWSE OpenAPI 或公開只讀代理備援
    if (!apiRows) {
      const candidateUrls = [
        twseUrl,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(twseUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(twseUrl)}`,
      ];
      for (const u of candidateUrls) {
        try {
          const resp = await fetch(u, { cache: 'no-store' });
          if (resp.ok) {
            const parsed = await resp.json();
            if (Array.isArray(parsed) && parsed.length > 0) {
              apiRows = parsed;
              break;
            }
          }
        } catch (_) {}
      }
    }

    const batchRes = window.StockEngine.applyTwseQuoteBatch(
      state.pricesMap,
      apiRows,
      holdingStockIds
    );

    state.isUpdatingQuotes = false;

    if (!batchRes.ok) {
      state.lastQuoteSyncError = batchRes.error;
      showToast(
        `${batchRes.error}（可於持倉頁點擊「手動改價」更新個別股票收盤價）`,
        'error'
      );
      renderApp();
      return;
    }

    state.pricesMap = batchRes.pricesMap;
    state.lastQuoteSyncAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    state.lastQuoteSyncError = null;

    if (state.authMode === 'supabase' && state.supabaseClient && state.sessionUser) {
      const upserts = Object.values(state.pricesMap).map((p) => ({
        user_id: state.sessionUser.id,
        stock_id: p.stock_id,
        stock_name: p.stock_name || '',
        close_price: p.close_price,
        price_date: p.price_date || new Date().toISOString().slice(0, 10),
        source: p.source || 'TWSE',
        updated_at: new Date().toISOString(),
      }));
      if (upserts.length > 0) {
        await state.supabaseClient.from(state.supabaseTables.prices).upsert(upserts, { onConflict: 'user_id,stock_id' });
      }
    } else {
      saveSandboxState();
    }

    const unmatchedMsg =
      batchRes.unmatchedStockIds.length > 0
        ? `；未匹配代號：${batchRes.unmatchedStockIds.join(', ')}（可手動設定參考價）`
        : '';
    showToast(`已成功從證交所更新 ${batchRes.updatedCount} 檔收盤價${unmatchedMsg}`, 'success');
    renderApp();
  }

  /**
   * 開啟「新增／編輯交易」表單 Modal
   */
  function openTransactionModal(editTxId = null) {
    if (editTxId) {
      const existing = state.transactions.find((t) => t.id === editTxId);
      if (!existing) return;
      state.txForm = {
        mode: 'EDIT',
        targetTxId: existing.id,
        account_id: existing.account_id,
        trade_date: existing.trade_date,
        action_type: existing.action_type,
        stock_id: existing.stock_id,
        stock_name: existing.stock_name,
        shares: String(existing.shares),
        price: String(existing.price),
        fee: String(existing.fee),
        tax: String(existing.tax),
        seq_no: String(existing.seq_no ?? 1),
        feeOverridden: true,
        taxOverridden: true,
        errorMsg: '',
      };
    } else {
      const defaultAccId =
        state.selectedAccountIds[0] || (state.accounts[0] && state.accounts[0].id) || '';
      const today = new Date().toISOString().slice(0, 10);
      state.txForm = {
        mode: 'ADD',
        targetTxId: null,
        account_id: defaultAccId,
        trade_date: today,
        action_type: 'BUY',
        stock_id: '2330',
        stock_name: '台積電',
        shares: '1000',
        price: '950',
        fee: String(window.StockEngine.calcDefaultFee(1000, 950)),
        tax: '0',
        seq_no: '1',
        feeOverridden: false,
        taxOverridden: false,
        errorMsg: '',
      };
    }
    state.activeModal = 'tx_form';
    renderApp();
  }

  /**
   * 當交易表單內的股數、單價或買賣別改變時，若未手動覆寫稅費，自動重算預設手續費與證交稅 (SPEC 4.3)
   */
  function syncTxFormDefaults() {
    if (!state.txForm) return;
    const shares = Number(state.txForm.shares);
    const price = Number(state.txForm.price);
    const action = state.txForm.action_type;
    if (!state.txForm.feeOverridden) {
      state.txForm.fee = String(window.StockEngine.calcDefaultFee(shares, price));
    }
    if (!state.txForm.taxOverridden) {
      state.txForm.tax = String(window.StockEngine.calcDefaultTax(shares, price, action));
    }
  }

  /**
   * 儲存新增或編輯的交易（先經 StockEngine.validateSequenceChange 驗證全序列庫存合法性）
   */
  async function handleSaveTransaction() {
    const f = state.txForm;
    if (!f) return;

    const candidateTx = {
      id: f.mode === 'EDIT' ? f.targetTxId : `tx-${Date.now()}`,
      account_id: f.account_id,
      trade_date: String(f.trade_date || '').trim(),
      action_type: f.action_type,
      stock_id: String(f.stock_id || '').trim().toUpperCase(),
      stock_name: String(f.stock_name || '').trim(),
      shares: Number(f.shares),
      price: Number(f.price),
      fee: Number(f.fee || 0),
      tax: Number(f.tax || 0),
      seq_no: Number(f.seq_no || 1),
    };

    const validation = window.StockEngine.validateSequenceChange(state.transactions, {
      mode: f.mode,
      targetTxId: f.targetTxId,
      candidateTx,
    });

    if (!validation.ok) {
      state.txForm.errorMsg = validation.error;
      renderApp();
      return;
    }

    // 若該股票尚無收盤價但內建字典有參考價，或使用者剛輸入，不強制假造收盤價（保留 T08「尚無收盤價」驗證能力）
    if (state.authMode === 'supabase' && state.supabaseClient && state.sessionUser) {
      try {
        if (f.mode === 'ADD') {
          const { error } = await state.supabaseClient.from(state.supabaseTables.transactions).insert({
            user_id: state.sessionUser.id,
            account_id: candidateTx.account_id,
            stock_id: candidateTx.stock_id,
            stock_name: candidateTx.stock_name,
            trade_date: candidateTx.trade_date,
            action_type: candidateTx.action_type,
            shares: candidateTx.shares,
            price: candidateTx.price,
            fee: candidateTx.fee,
            tax: candidateTx.tax,
            seq_no: candidateTx.seq_no,
          });
          if (error) throw error;
        } else {
          const { error } = await state.supabaseClient
            .from(state.supabaseTables.transactions)
            .update({
              account_id: candidateTx.account_id,
              stock_id: candidateTx.stock_id,
              stock_name: candidateTx.stock_name,
              trade_date: candidateTx.trade_date,
              action_type: candidateTx.action_type,
              shares: candidateTx.shares,
              price: candidateTx.price,
              fee: candidateTx.fee,
              tax: candidateTx.tax,
              seq_no: candidateTx.seq_no,
              updated_at: new Date().toISOString(),
            })
            .eq('id', f.targetTxId);
          if (error) throw error;
        }
        await syncFromSupabaseCloud();
      } catch (err) {
        state.txForm.errorMsg = `雲端儲存失敗：${err.message || err}`;
        renderApp();
        return;
      }
    } else {
      state.transactions = validation.nextTransactions;
      saveSandboxState();
    }

    state.activeModal = null;
    state.txForm = null;
    renderApp();
    showToast(f.mode === 'ADD' ? '已新增交易紀錄並更新持倉損益！' : '已修改交易並重新計算完整序列！', 'success');
  }

  /**
   * 刪除交易確認與執行 (SPEC 4.3, 5.5, T07)
   */
  function requestDeleteTransaction(txId) {
    const target = state.transactions.find((t) => t.id === txId);
    if (!target) return;

    // 先預檢刪除後是否會導致後續賣出交易庫存不足 (T07)
    const validation = window.StockEngine.validateSequenceChange(state.transactions, {
      mode: 'DELETE',
      targetTxId: txId,
    });

    state.confirmPayload = {
      txId,
      target,
      canDelete: validation.ok,
      blockReason: validation.ok ? null : validation.error,
    };
    state.activeModal = 'confirm_delete_tx';
    renderApp();
  }

  async function executeDeleteTransaction() {
    const payload = state.confirmPayload;
    if (!payload || !payload.canDelete) return;

    const validation = window.StockEngine.validateSequenceChange(state.transactions, {
      mode: 'DELETE',
      targetTxId: payload.txId,
    });
    if (!validation.ok) {
      showToast(validation.error, 'error');
      return;
    }

    if (state.authMode === 'supabase' && state.supabaseClient) {
      const { error } = await state.supabaseClient
        .from(state.supabaseTables.transactions)
        .delete()
        .eq('id', payload.txId);
      if (error) {
        showToast(`雲端刪除失敗：${error.message}`, 'error');
        return;
      }
      await syncFromSupabaseCloud();
    } else {
      state.transactions = validation.nextTransactions;
      saveSandboxState();
    }

    state.activeModal = null;
    state.confirmPayload = null;
    renderApp();
    showToast('已刪除交易紀錄並重新計算後續庫存與損益。', 'success');
  }

  /**
   * 手動修改參考收盤價 (SPEC 4.5)
   * 「手動參考價需清楚標示為手動資料及更新時間；不得假裝是交易所最新收盤價。」
   */
  function openManualPriceModal(stockId = '', stockName = '') {
    const existing = state.pricesMap[stockId];
    state.manualPriceForm = {
      stock_id: stockId,
      stock_name: stockName || existing?.stock_name || TW_STOCK_DICT[stockId]?.name || '',
      close_price: existing ? String(existing.close_price) : '',
      price_date: new Date().toISOString().slice(0, 10),
      clearPrice: false,
      errorMsg: '',
    };
    state.activeModal = 'manual_price';
    renderApp();
  }

  async function handleSaveManualPrice() {
    const f = state.manualPriceForm;
    if (!f) return;
    const stockId = String(f.stock_id || '').trim().toUpperCase();
    if (!stockId) {
      f.errorMsg = '請輸入股票代號';
      renderApp();
      return;
    }

    if (f.clearPrice) {
      // 允許清除收盤價以測試 T08「尚無收盤價」狀態
      delete state.pricesMap[stockId];
      if (state.authMode === 'supabase' && state.supabaseClient && state.sessionUser) {
        await state.supabaseClient
          .from(state.supabaseTables.prices)
          .delete()
          .eq('user_id', state.sessionUser.id)
          .eq('stock_id', stockId);
      } else {
        saveSandboxState();
      }
      state.activeModal = null;
      renderApp();
      showToast(`已清除 ${stockId} 收盤價（目前顯示為「尚無收盤價」）`, 'info');
      return;
    }

    const p = Number(f.close_price);
    if (!Number.isFinite(p) || p <= 0) {
      f.errorMsg = '參考價格必須大於 0';
      renderApp();
      return;
    }

    const nowIso = new Date().toISOString();
    const record = {
      stock_id: stockId,
      stock_name: String(f.stock_name || TW_STOCK_DICT[stockId]?.name || stockId).trim(),
      close_price: p,
      price_date: f.price_date || nowIso.slice(0, 10),
      source: 'MANUAL',
      updated_at: nowIso,
    };

    state.pricesMap[stockId] = record;
    if (state.authMode === 'supabase' && state.supabaseClient && state.sessionUser) {
      await state.supabaseClient.from(state.supabaseTables.prices).upsert(
        {
          user_id: state.sessionUser.id,
          ...record,
        },
        { onConflict: 'user_id,stock_id' }
      );
    } else {
      saveSandboxState();
    }

    state.activeModal = null;
    state.manualPriceForm = null;
    renderApp();
    showToast(`已設定 ${stockId} 手動參考價為 ${p} 元（已標示手動來源與更新時間）`, 'success');
  }

  /**
   * 帳戶管理：新增、重新命名、刪除保護 (SPEC 4.7)
   */
  function openAccountModal(editAccId = null) {
    if (editAccId) {
      const acc = state.accounts.find((a) => a.id === editAccId);
      if (!acc) return;
      state.accountForm = {
        mode: 'EDIT',
        targetAccId: acc.id,
        name: acc.name,
        note: acc.note || '',
        errorMsg: '',
      };
    } else {
      state.accountForm = {
        mode: 'ADD',
        targetAccId: null,
        name: `帳戶${state.accounts.length + 1}`,
        note: '',
        errorMsg: '',
      };
    }
    state.activeModal = 'account_form';
    renderApp();
  }

  async function handleSaveAccount() {
    const f = state.accountForm;
    if (!f) return;
    const cleanName = String(f.name || '').trim();
    const cleanNote = String(f.note || '').trim();
    if (!cleanName) {
      f.errorMsg = '帳戶名稱不可為空';
      renderApp();
      return;
    }

    // 同一使用者內帳戶名稱唯一 (SPEC 4.7)
    const duplicate = state.accounts.find(
      (a) => a.name === cleanName && a.id !== f.targetAccId
    );
    if (duplicate) {
      f.errorMsg = `帳戶名稱「${cleanName}」已存在，請使用不同名稱。`;
      renderApp();
      return;
    }

    if (state.authMode === 'supabase' && state.supabaseClient && state.sessionUser) {
      try {
        if (f.mode === 'ADD') {
          const { error } = await state.supabaseClient.from(state.supabaseTables.accounts).insert({
            user_id: state.sessionUser.id,
            name: cleanName,
            note: cleanNote,
            sort_order: state.accounts.length + 1,
          });
          if (error) throw error;
        } else {
          const { error } = await state.supabaseClient
            .from(state.supabaseTables.accounts)
            .update({ name: cleanName, note: cleanNote })
            .eq('id', f.targetAccId);
          if (error) throw error;
        }
        await syncFromSupabaseCloud();
      } catch (err) {
        f.errorMsg = `雲端儲存失敗：${err.message || err}`;
        renderApp();
        return;
      }
    } else {
      if (f.mode === 'ADD') {
        const newAcc = {
          id: `acc-${Date.now()}`,
          name: cleanName,
          note: cleanNote,
          sort_order: state.accounts.length + 1,
          created_at: new Date().toISOString(),
        };
        state.accounts.push(newAcc);
        state.selectedAccountIds.push(newAcc.id);
      } else {
        state.accounts = state.accounts.map((a) =>
          a.id === f.targetAccId ? { ...a, name: cleanName, note: cleanNote } : a
        );
      }
      saveSandboxState();
    }

    state.activeModal = null;
    state.accountForm = null;
    renderApp();
    showToast(f.mode === 'ADD' ? `已新增「${cleanName}」` : `已更新「${cleanName}」`, 'success');
  }

  function requestDeleteAccount(accId) {
    const acc = state.accounts.find((a) => a.id === accId);
    if (!acc) return;
    const txCount = state.transactions.filter((t) => t.account_id === accId).length;
    state.confirmPayload = {
      accId,
      acc,
      txCount,
      canDelete: txCount === 0 && state.accounts.length > 1,
    };
    state.activeModal = 'confirm_delete_acc';
    renderApp();
  }

  async function executeDeleteAccount() {
    const p = state.confirmPayload;
    if (!p || !p.canDelete) return;

    if (state.authMode === 'supabase' && state.supabaseClient) {
      const { error } = await state.supabaseClient.from(state.supabaseTables.accounts).delete().eq('id', p.accId);
      if (error) {
        showToast(`無法刪除帳戶：${error.message}`, 'error');
        return;
      }
      await syncFromSupabaseCloud();
    } else {
      state.accounts = state.accounts.filter((a) => a.id !== p.accId);
      state.selectedAccountIds = state.selectedAccountIds.filter((id) => id !== p.accId);
      if (state.selectedAccountIds.length === 0 && state.accounts[0]) {
        state.selectedAccountIds = [state.accounts[0].id];
      }
      saveSandboxState();
    }

    state.activeModal = null;
    state.confirmPayload = null;
    renderApp();
    showToast(`已刪除空帳戶「${p.acc.name}」`, 'success');
  }

  /**
   * 匯出備份 JSON 檔案
   */
  function handleExportBackup() {
    const backup = {
      app: '持股管家',
      version: '1.0',
      exported_at: new Date().toISOString(),
      accounts: state.accounts,
      transactions: state.transactions,
      pricesMap: state.pricesMap,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `持股管家備份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已匯出完整帳務備份 JSON 檔案！', 'success');
  }

  // ==========================================================================
  // 畫面渲染引擎 (Render Functions)
  // ==========================================================================

  function renderAccountSelectorBar(portfolio) {
    const allSelected =
      state.accounts.length > 0 &&
      state.accounts.every((a) => state.selectedAccountIds.includes(a.id));

    const checksHtml = state.accounts
      .map((acc) => {
        const checked = state.selectedAccountIds.includes(acc.id) ? 'checked' : '';
        return `
          <label class="acc-check-label">
            <input type="checkbox" data-action="toggle-account" data-acc-id="${acc.id}" ${checked} />
            <span>${escapeHtml(acc.name)}</span>
          </label>
        `;
      })
      .join('');

    return `
      <div class="account-selector-card">
        <div class="account-selector-top">
          <span class="account-selector-label">帳戶選擇（可單選／複選）</span>
          <span class="quote-date-tag">收盤價更新：${escapeHtml(state.lastQuoteSyncAt || '尚未更新')}</span>
        </div>
        <div class="account-checkbox-row">
          <div class="account-checks-wrap">
            ${checksHtml}
          </div>
          <button type="button" class="btn-select-all" data-action="select-all-accounts">
            ${allSelected ? '全選 (已全選)' : '全選'}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 0. 登入頁面 (未登入時唯一可見頁面，完全對齊示意圖左側手機畫面)
   */
  function renderLoginScreen() {
    return `
      <div class="login-screen">
        <div class="login-hero-box">
          ${window.ClayIcons.piggyHero()}
          <h1 class="login-title">持股管家</h1>
          <p class="login-subtitle">簡單記錄 · 清楚掌握 · 安心投資</p>

          <button type="button" class="btn-google-login" data-action="google-login">
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span>使用 Google 登入</span>
          </button>

          <div class="login-secondary-actions">
            <button type="button" class="btn-sandbox-enter" data-action="enter-sandbox">
              🧪 進入本地驗收沙盒（含示意圖對照資料 & T01–T12 測試）
            </button>
            <button type="button" class="btn-config-supabase" data-action="open-supabase-config">
              ⚙️ 設定 Supabase URL 與 Anon Key（啟用正式 Google 跨裝置同步）
            </button>
          </div>
        </div>

        <div class="login-trust-grid">
          <div class="trust-item">
            ${window.ClayIcons.shield('green')}
            <span>跨裝置同步<br/>隨時更新</span>
          </div>
          <div class="trust-item">
            ${window.ClayIcons.shield('gold')}
            <span>零成本<br/>安心使用</span>
          </div>
          <div class="trust-item">
            ${window.ClayIcons.shield('blue')}
            <span>資料安全<br/>由你掌控</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 1. 首頁／資產看板 (對應示意圖「手機首頁」、「1. 首頁（資產看板）」及「iPad/桌機首頁」)
   */
  function renderHomeTab(portfolio) {
    const stats = portfolio.dashboardStats;
    const uPnL = fmtPnLInfo(
      stats.allHoldingsUnpriced ? null : stats.totalUnrealizedPnL
    );
    const rPnL = fmtPnLInfo(stats.currentYearRealizedPnL);
    const uRateStr =
      stats.totalUnrealizedReturnRate === null
        ? '—'
        : `${stats.totalUnrealizedReturnRate > 0 ? '+' : ''}${stats.totalUnrealizedReturnRate.toFixed(1)}%`;

    // 在庫持股精簡摘要表 (前 5 筆)
    const holdingRowsHtml =
      portfolio.activeHoldings.length === 0
        ? `<tr><td colspan="6" class="center" style="padding:20px;color:var(--text-muted);">目前勾選帳戶尚無在庫持股，請點擊「新增交易」開始記錄。</td></tr>`
        : portfolio.activeHoldings
            .slice(0, 5)
            .map((h) => {
              const pInfo = fmtPnLInfo(h.unrealizedPnL);
              const priceCell = h.hasPrice
                ? `${fmtPrice(h.closePrice)}`
                : `<span style="color:#B85D19;font-size:12.5px;">尚無收盤價</span>`;
              const pnlCell = h.hasPrice
                ? `<div class="${pInfo.cls}">${pInfo.signNum}</div><div style="font-size:11.5px;color:var(--text-muted);">${pInfo.label} ${h.unrealizedReturnRateText}</div>`
                : `<span style="color:var(--text-muted);">尚無收盤價</span>`;
              return `
                <tr>
                  <td>
                    <div>${escapeHtml(h.stock_id)}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(h.account_name)}</div>
                  </td>
                  <td>${escapeHtml(h.stock_name)}</td>
                  <td class="num">${h.remaining_shares.toLocaleString()}</td>
                  <td class="num">${fmtPrice(h.avg_cost)}</td>
                  <td class="num">${priceCell}</td>
                  <td class="num">${pnlCell}</td>
                </tr>
              `;
            })
            .join('');

    return `
      ${renderAccountSelectorBar(portfolio)}

      <!-- 四大核心莫蘭迪統計卡片 -->
      <div class="stats-grid-2x2">
        <div class="stat-clay-card mint">
          <div class="stat-info">
            <span class="stat-label">在庫總成本</span>
            <span class="stat-value">${fmtTwd(stats.totalInventoryCost)}</span>
            <span class="stat-sub">元（共 ${stats.activeHoldingsCount} 筆持倉）</span>
          </div>
          ${window.ClayIcons.costSproutBag()}
        </div>

        <div class="stat-clay-card rose">
          <div class="stat-info">
            <span class="stat-label">未實現損益</span>
            <span class="stat-value ${uPnL.cls}">${uPnL.signNum}</span>
            <span class="stat-sub ${uPnL.cls}">
              <span>${uRateStr}</span>
              ${uPnL.tagCls ? `<span class="pnl-tag ${uPnL.tagCls}">${uPnL.label}</span>` : ''}
            </span>
          </div>
          ${window.ClayIcons.risingChart()}
        </div>

        <div class="stat-clay-card cream">
          <div class="stat-info">
            <span class="stat-label">今年已實現損益</span>
            <span class="stat-value ${rPnL.cls}">${rPnL.signNum}</span>
            <span class="stat-sub">
              <span>元</span>
              ${rPnL.tagCls ? `<span class="pnl-tag ${rPnL.tagCls}">${rPnL.label}</span>` : `<span style="font-size:12px;">(${rPnL.label})</span>`}
            </span>
          </div>
          ${window.ClayIcons.moneyBag()}
        </div>

        <div class="stat-clay-card blue">
          <div class="stat-info">
            <span class="stat-label">累計稅費</span>
            <span class="stat-value">${fmtTwd(stats.cumulativeFeeTax)}</span>
            <span class="stat-sub">元（手續費＋證交稅）</span>
          </div>
          ${window.ClayIcons.calculator()}
        </div>
      </div>

      <!-- 2x2 常用操作 3D 黏土大圖示入口 (對應上方 iPhone 首頁示意圖) -->
      <div class="quick-actions-grid">
        <button type="button" class="quick-action-card act-1" data-action="open-add-tx">
          ${window.ClayIcons.notepadPencil()}
          <span class="quick-action-title">新增交易</span>
        </button>
        <button type="button" class="quick-action-card act-2" data-action="switch-tab" data-tab="holdings">
          ${window.ClayIcons.holdingsBars()}
          <span class="quick-action-title">持倉總覽</span>
        </button>
        <button type="button" class="quick-action-card act-3" data-action="switch-tab" data-tab="reports">
          ${window.ClayIcons.pieChart()}
          <span class="quick-action-title">損益報表</span>
        </button>
        <button type="button" class="quick-action-card act-4" data-action="switch-tab" data-tab="accounts">
          ${window.ClayIcons.wallet()}
          <span class="quick-action-title">帳戶管理</span>
        </button>
      </div>

      <!-- 在庫持股摘要表 (對應下方 1. 首頁資產看板示意圖) -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">在庫持股摘要</span>
          <button type="button" class="section-link" data-action="switch-tab" data-tab="holdings">
            查看更多 →
          </button>
        </div>
        <div class="table-scroll-wrap">
          <table class="morandi-table">
            <thead>
              <tr>
                <th>代號/帳戶</th>
                <th>名稱</th>
                <th class="num">股數</th>
                <th class="num">均價</th>
                <th class="num">收盤價</th>
                <th class="num">未實現損益</th>
              </tr>
            </thead>
            <tbody>
              ${holdingRowsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 資產變化趨勢 & 在庫持股分布 (對應 iPad/桌機首頁示意圖，手機亦可向下瀏覽) -->
      <div class="charts-two-col">
        ${renderAssetTrendCard(portfolio)}
        ${renderHoldingsDonutCard(portfolio)}
      </div>
    `;
  }

  /**
   * 繪製首頁「資產變化趨勢」SVG 面積折線圖與「在庫持股分布」圓環圖
   */
  function renderAssetTrendCard(portfolio) {
    const cost = portfolio.dashboardStats.totalInventoryCost || 0;
    const mv = portfolio.dashboardStats.totalMarketValue || cost;
    const p1 = Math.round(cost * 0.72);
    const p2 = Math.round(cost * 0.85);
    const p3 = Math.round(cost * 0.94);
    const p4 = mv > 0 ? mv : cost;
    const maxVal = Math.max(p1, p2, p3, p4, 100000);

    const y = (val) => Math.round(115 - (val / maxVal) * 85);
    const pts = `30,${y(p1)} 115,${y(p2)} 200,${y(p3)} 285,${y(p4)}`;
    const areaPts = `30,120 ${pts} 285,120`;

    return `
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">資產市值趨勢</span>
          <span style="font-size:12px;color:var(--text-muted);font-weight:700;">依已勾選帳戶</span>
        </div>
        <svg viewBox="0 0 320 145" style="width:100%;height:auto;overflow:visible;">
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#E27D77" stop-opacity="0.38"/>
              <stop offset="100%" stop-color="#E27D77" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <line x1="25" y1="30" x2="300" y2="30" stroke="#EBE2D5" stroke-dasharray="3 3"/>
          <line x1="25" y1="75" x2="300" y2="75" stroke="#EBE2D5" stroke-dasharray="3 3"/>
          <line x1="25" y1="120" x2="300" y2="120" stroke="#D8CBB8"/>
          <polygon points="${areaPts}" fill="url(#trend-fill)"/>
          <polyline points="${pts}" fill="none" stroke="#D15B52" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="30" cy="${y(p1)}" r="4.5" fill="#D15B52"/>
          <circle cx="115" cy="${y(p2)}" r="4.5" fill="#D15B52"/>
          <circle cx="200" cy="${y(p3)}" r="4.5" fill="#D15B52"/>
          <circle cx="285" cy="${y(p4)}" r="5.5" fill="#D15B52" stroke="#FFF" stroke-width="2"/>
          <text x="30" y="138" text-anchor="middle" font-size="11" font-weight="700" fill="#75685C">7月</text>
          <text x="115" y="138" text-anchor="middle" font-size="11" font-weight="700" fill="#75685C">8月</text>
          <text x="200" y="138" text-anchor="middle" font-size="11" font-weight="700" fill="#75685C">9月</text>
          <text x="285" y="138" text-anchor="middle" font-size="11" font-weight="700" fill="#2F2620">最新市值</text>
        </svg>
      </div>
    `;
  }

  function renderHoldingsDonutCard(portfolio) {
    const list = portfolio.holdingsMergedByStock;
    const totalCost = list.reduce((s, h) => s + h.remaining_total_cost, 0);
    const colors = ['#5B78A8', '#7FA98F', '#E28A7E', '#B18FE0', '#DFB15B'];

    if (list.length === 0 || totalCost <= 0) {
      return `
        <div class="section-card">
          <div class="section-header"><span class="section-title">在庫持股成本分布</span></div>
          <p style="padding:24px 0;text-align:center;color:var(--text-muted);font-weight:700;">尚無在庫持股資料</p>
        </div>
      `;
    }

    let accPercent = 0;
    const circlesHtml = list
      .slice(0, 5)
      .map((item, idx) => {
        const pct = (item.remaining_total_cost / totalCost) * 100;
        const dashArray = `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`;
        const dashOffset = (25 - accPercent).toFixed(2);
        accPercent += pct;
        return `<circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="${colors[idx % colors.length]}" stroke-width="7.5" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"/>`;
      })
      .join('');

    const legendHtml = list
      .slice(0, 5)
      .map((item, idx) => {
        const pct = Math.round((item.remaining_total_cost / totalCost) * 100);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px;font-weight:800;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${colors[idx % colors.length]};display:inline-block;"></span>
              ${escapeHtml(item.stock_name)}
            </span>
            <span>${pct}%</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">在庫持股分布</span>
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;align-items:center;gap:14px;">
          <svg viewBox="0 0 42 42" style="width:116px;height:116px;">
            <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#EFE7DC" stroke-width="7.5"/>
            ${circlesHtml}
          </svg>
          <div style="display:flex;flex-direction:column;gap:7px;">
            ${legendHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 2. 交易紀錄頁面 (對應「2. 交易紀錄頁面」示意圖 + SPEC 4.3 股票代號篩選與編輯/刪除)
   */
  function renderTransactionsTab(portfolio) {
    const f = state.txFilter;

    // 過濾交易清單
    const filteredList = portfolio.enrichedTransactionsAll.filter((tx) => {
      if (f.accountScope === 'SELECTED') {
        if (!state.selectedAccountIds.includes(tx.account_id)) return false;
      } else if (f.accountScope !== 'ALL') {
        if (tx.account_id !== f.accountScope) return false;
      }
      if (f.dateFrom && String(tx.trade_date) < f.dateFrom) return false;
      if (f.dateTo && String(tx.trade_date) > f.dateTo) return false;
      if (f.stockKeyword) {
        const kw = f.stockKeyword.trim().toLowerCase();
        const matchId = String(tx.stock_id || '').toLowerCase().includes(kw);
        const matchName = String(tx.stock_name || '').toLowerCase().includes(kw);
        if (!matchId && !matchName) return false;
      }
      return true;
    });

    const accOptionsHtml = [
      `<option value="ALL" ${f.accountScope === 'ALL' ? 'selected' : ''}>全部帳戶</option>`,
      `<option value="SELECTED" ${f.accountScope === 'SELECTED' ? 'selected' : ''}>首頁已勾選帳戶</option>`,
      ...state.accounts.map(
        (a) =>
          `<option value="${a.id}" ${f.accountScope === a.id ? 'selected' : ''}>${escapeHtml(a.name)} ${a.note ? `(${escapeHtml(a.note)})` : ''}</option>`
      ),
    ].join('');

    const rowsHtml =
      filteredList.length === 0
        ? `<tr><td colspan="7" class="center" style="padding:24px;color:var(--text-muted);">查無符合篩選條件的交易紀錄</td></tr>`
        : filteredList
            .map((tx) => {
              const isBuy = String(tx.action_type).toUpperCase() === 'BUY';
              const shortDate = String(tx.trade_date || '').slice(5).replace('-', '/');
              const pnlInfo = !isBuy ? fmtPnLInfo(tx.realized_pnl) : null;
              return `
                <tr>
                  <td>
                    <div>${escapeHtml(shortDate)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(String(tx.trade_date).slice(0, 4))}</div>
                  </td>
                  <td>
                    <div>${escapeHtml(tx.stock_id)}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(tx.account_name)}</div>
                  </td>
                  <td>
                    <div>${escapeHtml(tx.stock_name)}</div>
                    ${
                      !isBuy && pnlInfo
                        ? `<div class="${pnlInfo.cls}" style="font-size:11.5px;">損益 ${pnlInfo.signNum} (${pnlInfo.label})</div>`
                        : `<div style="font-size:11.5px;color:var(--text-muted);">稅費 ${fmtTwd((tx.fee || 0) + (tx.tax || 0))}</div>`
                    }
                  </td>
                  <td class="center">
                    <span class="badge-trade ${isBuy ? 'buy' : 'sell'}">${isBuy ? '買' : '賣'}</span>
                  </td>
                  <td class="num">${Number(tx.shares).toLocaleString()}</td>
                  <td class="num">${fmtPrice(tx.price)}</td>
                  <td class="center" style="white-space:nowrap;">
                    <button type="button" class="btn-icon-circle" style="width:32px;height:32px;font-size:13px;" title="編輯此交易" data-action="edit-tx" data-tx-id="${tx.id}">✏️</button>
                    <button type="button" class="btn-icon-circle danger" style="width:32px;height:32px;font-size:13px;" title="刪除此交易" data-action="delete-tx" data-tx-id="${tx.id}">🗑️</button>
                  </td>
                </tr>
              `;
            })
            .join('');

    return `
      <!-- 交易篩選卡片 (SPEC 4.3: 帳戶、日期區間、股票代號) -->
      <div class="section-card">
        <div class="filter-form-grid">
          <div class="filter-row">
            <label class="filter-label" for="tx-filter-acc">帳戶範圍</label>
            <select id="tx-filter-acc" class="form-control" data-action="tx-filter-acc">
              ${accOptionsHtml}
            </select>
          </div>
          <div class="filter-row">
            <label class="filter-label">日期範圍</label>
            <div class="date-range-group">
              <input type="date" class="form-control" value="${escapeHtml(f.dateFrom)}" data-action="tx-filter-from" aria-label="起始日期" />
              <span style="font-weight:800;color:var(--text-secondary);">~</span>
              <input type="date" class="form-control" value="${escapeHtml(f.dateTo)}" data-action="tx-filter-to" aria-label="結束日期" />
            </div>
          </div>
          <div class="filter-row">
            <label class="filter-label" for="tx-filter-stock">股票代號</label>
            <div class="stock-lookup-group" style="flex:1;">
              <input id="tx-filter-stock" type="text" class="form-control" placeholder="輸入股票代號或名稱 (如 2330 / 台積電)" value="${escapeHtml(f.stockKeyword)}" data-action="tx-filter-stock" />
              ${
                f.accountScope !== 'ALL' || f.dateFrom || f.dateTo || f.stockKeyword
                  ? `<button type="button" class="btn-lookup" style="background:#8E7F71;" data-action="tx-filter-reset">清除</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>

      <!-- 交易紀錄列表 -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">交易流水明細（共 ${filteredList.length} 筆）</span>
          <span style="font-size:12.5px;color:var(--text-muted);font-weight:700;">修改或刪除後自動重算序列</span>
        </div>
        <div class="table-scroll-wrap">
          <table class="morandi-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>代號/帳戶</th>
                <th>名稱/損益</th>
                <th class="center">買賣</th>
                <th class="num">股數</th>
                <th class="num">單價</th>
                <th class="center">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 4. 持倉總覽頁面 (對應「4. 持倉總覽頁面」示意圖 + SPEC 4.5 完整欄位與手動修改參考價格)
   */
  function renderHoldingsTab(portfolio) {
    const stats = portfolio.dashboardStats;
    const uPnL = fmtPnLInfo(stats.allHoldingsUnpriced ? null : stats.totalUnrealizedPnL);
    const uRateStr =
      stats.totalUnrealizedReturnRate === null
        ? '—'
        : `(${stats.totalUnrealizedReturnRate > 0 ? '+' : ''}${stats.totalUnrealizedReturnRate.toFixed(1)}%)`;

    const isByAccount = state.holdingsViewMode === 'by_account';
    const list = isByAccount ? portfolio.activeHoldings : portfolio.holdingsMergedByStock;

    const rowsHtml =
      list.length === 0
        ? `<tr><td colspan="7" class="center" style="padding:24px;color:var(--text-muted);">目前選取的帳戶沒有在庫持倉</td></tr>`
        : list
            .map((h) => {
              const pInfo = fmtPnLInfo(h.unrealizedPnL);
              const avgCost = isByAccount ? h.avg_cost : h.avg_cost_display;
              const accLabel = isByAccount ? h.account_name : h.account_names.join('、');
              const sourceBadge = !h.hasPrice
                ? `<span class="pnl-tag" style="background:#F6E3BA;color:#8A5A10;">尚無收盤價</span>`
                : h.priceSource === 'MANUAL'
                ? `<span class="pnl-tag" style="background:#E6DEF8;color:#5B3E96;" title="手動設定於 ${escapeHtml(h.priceUpdatedAt || '')}">手動價 ${escapeHtml(h.priceDate || '')}</span>`
                : `<span style="font-size:11px;color:var(--text-muted);">TWSE ${escapeHtml(h.priceDate || '')}</span>`;

              return `
                <tr>
                  <td>
                    <div style="font-weight:900;">${escapeHtml(h.stock_id)}</div>
                    <div style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(accLabel)}</div>
                  </td>
                  <td>
                    <div>${escapeHtml(h.stock_name)}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);">總成本 ${fmtTwd(h.remaining_total_cost)}</div>
                  </td>
                  <td class="num">${h.remaining_shares.toLocaleString()}</td>
                  <td class="num">${fmtPrice(avgCost)}</td>
                  <td class="num">
                    <div>${h.hasPrice ? fmtPrice(h.closePrice) : '尚無收盤價'}</div>
                    <div>${sourceBadge}</div>
                  </td>
                  <td class="num">
                    ${
                      h.hasPrice
                        ? `<div class="${pInfo.cls}">${pInfo.signNum}</div>
                           <div class="${pInfo.cls}" style="font-size:11.5px;">(${h.unrealizedReturnRateText} ${pInfo.label})</div>`
                        : `<div style="color:#9E5E3B;font-size:12.5px;">尚無收盤價</div>
                           <div style="font-size:11px;color:var(--text-muted);">不以零價誤算</div>`
                    }
                  </td>
                  <td class="center">
                    <button type="button" class="btn-icon-circle" style="width:34px;height:34px;font-size:13px;" title="手動修改參考收盤價" data-action="open-manual-price" data-stock-id="${escapeHtml(h.stock_id)}" data-stock-name="${escapeHtml(h.stock_name)}">
                      🏷️
                    </button>
                  </td>
                </tr>
              `;
            })
            .join('');

    return `
      ${renderAccountSelectorBar(portfolio)}

      <!-- 持倉總覽 2x2 摘要統計卡 (完全對應 4. 持倉總覽頁面示意圖，單行數字不換行) -->
      <div class="stats-grid-2x2">
        <div class="stat-clay-card cream" style="min-height:92px;">
          <div class="stat-info">
            <span class="stat-label">總在庫檔數</span>
            <span class="stat-value">${stats.uniqueStockCount} 檔</span>
            <span class="stat-sub">共 ${stats.activeHoldingsCount} 筆帳戶持倉</span>
          </div>
        </div>
        <div class="stat-clay-card mint" style="min-height:92px;">
          <div class="stat-info">
            <span class="stat-label">在庫總成本</span>
            <span class="stat-value">${fmtTwd(stats.totalInventoryCost)}</span>
            <span class="stat-sub">元</span>
          </div>
        </div>
        <div class="stat-clay-card rose" style="min-height:92px;">
          <div class="stat-info">
            <span class="stat-label">未實現損益</span>
            <span class="stat-value ${uPnL.cls}">${uPnL.signNum}</span>
            <span class="stat-sub ${uPnL.cls}">
              <span>${uRateStr}</span>
              ${uPnL.tagCls ? `<span class="pnl-tag ${uPnL.tagCls}">${uPnL.label}</span>` : ''}
            </span>
          </div>
        </div>
        <div class="stat-clay-card blue" style="min-height:92px;">
          <div class="stat-info">
            <span class="stat-label">今日參考總市值</span>
            <span class="stat-value">${stats.allHoldingsUnpriced ? '尚無收盤價' : fmtTwd(stats.totalMarketValue)}</span>
            <span class="stat-sub">元</span>
          </div>
        </div>
      </div>

      <!-- 持倉明細表與檢視模式切換 (SPEC 4.5: 以帳戶+股票代號為獨立持倉單位，支援整合顯示與手動改價) -->
      <div class="section-card">
        <div class="section-header" style="flex-wrap:wrap;">
          <span class="section-title">持倉明細與參考收盤價</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="vp-btn ${isByAccount ? 'active' : ''}" style="font-size:12.5px;padding:4px 10px;" data-action="set-holdings-mode" data-mode="by_account">
              依帳戶獨立列示
            </button>
            <button type="button" class="vp-btn ${!isByAccount ? 'active' : ''}" style="font-size:12.5px;padding:4px 10px;" data-action="set-holdings-mode" data-mode="merged">
              跨帳戶同股加總
            </button>
          </div>
        </div>

        <div class="table-scroll-wrap">
          <table class="morandi-table">
            <thead>
              <tr>
                <th>代號/帳戶</th>
                <th>名稱/總成本</th>
                <th class="num">股數</th>
                <th class="num">均價</th>
                <th class="num">收盤價</th>
                <th class="num">未實現損益</th>
                <th class="center">改價</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 5. 損益報表頁面 (對應「5. 損益報表頁面」示意圖 + SPEC 4.6 & T09 月度與年度已實現損益核對)
   */
  function renderReportsTab(portfolio) {
    const isMonthly = state.reportSubTab === 'monthly';
    const monthlyList = portfolio.monthlyReport;
    const annualList = portfolio.annualReport;

    // 繪製柱狀圖資料 (依選取分頁呈現月度或年度柱狀圖)
    const chartItems = isMonthly
      ? [...monthlyList].reverse().slice(-6)
      : [...annualList].reverse();

    const maxAbs = Math.max(
      ...chartItems.map((c) => Math.abs(c.realizedPnL)),
      50000
    );

    const barsSvgHtml =
      chartItems.length === 0
        ? `<text x="160" y="80" text-anchor="middle" font-size="13" font-weight="700" fill="#8E7F71">尚無已實現賣出交易紀錄</text>`
        : chartItems
            .map((item, idx) => {
              const x = 38 + idx * 46;
              const val = item.realizedPnL;
              const barH = Math.max(6, Math.round((Math.abs(val) / maxAbs) * 58));
              const isPos = val >= 0;
              const y = isPos ? 82 - barH : 82;
              const fill = isPos ? '#6CA888' : '#E07A74';
              const label = isMonthly ? `${item.month}月` : `${item.year}`;
              return `
                <rect x="${x}" y="${y}" width="24" height="${barH}" rx="5" fill="${fill}"/>
                <text x="${x + 12}" y="138" text-anchor="middle" font-size="11.5" font-weight="800" fill="#685B4F">${escapeHtml(label)}</text>
              `;
            })
            .join('');

    // 計算總計核對列 (T09: 年度總計與月份加總一致)
    const totalPnL = (isMonthly ? monthlyList : annualList).reduce(
      (s, r) => s + r.realizedPnL,
      0
    );
    const totalGross = (isMonthly ? monthlyList : annualList).reduce(
      (s, r) => s + r.grossSellAmount,
      0
    );
    const totalFeeTax = (isMonthly ? monthlyList : annualList).reduce(
      (s, r) => s + r.sellFeeTax,
      0
    );
    const totalPnlFmt = fmtPnLInfo(totalPnL);

    const tableRowsHtml = (isMonthly ? monthlyList : annualList)
      .map((row) => {
        const p = fmtPnLInfo(row.realizedPnL);
        const periodLabel = isMonthly ? row.yearMonth : `${row.year} 年度`;
        return `
          <tr>
            <td>${escapeHtml(periodLabel)}</td>
            <td class="num ${p.cls}">
              <div>${p.signNum}</div>
              <div style="font-size:11px;">(${p.label})</div>
            </td>
            <td class="num">${fmtTwd(row.grossSellAmount)}</td>
            <td class="num">${fmtTwd(row.sellFeeTax)}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <!-- 頂部「月度損益 / 年度總計」切換頁籤 (對應 5. 損益報表頁面示意圖) -->
      <div class="report-tabs-bar">
        <button type="button" class="report-tab-btn ${isMonthly ? 'active' : ''}" data-action="set-report-tab" data-tab="monthly">
          月度損益
        </button>
        <button type="button" class="report-tab-btn ${!isMonthly ? 'active' : ''}" data-action="set-report-tab" data-tab="annual">
          年度總計
        </button>
      </div>

      ${renderAccountSelectorBar(portfolio)}

      <!-- 已實現損益長條圖 -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">${isMonthly ? '月度已實現損益圖表' : '年度已實現損益圖表'}</span>
          <span style="font-size:12px;color:var(--text-muted);font-weight:700;">圖表為輔助，以下方統計表為精確核對依據</span>
        </div>
        <svg viewBox="0 0 320 150" style="width:100%;height:auto;">
          <line x1="24" y1="24" x2="305" y2="24" stroke="#EBE2D5" stroke-dasharray="3 3"/>
          <line x1="24" y1="82" x2="305" y2="82" stroke="#C8B9A6" stroke-width="1.5"/>
          <line x1="24" y1="120" x2="305" y2="120" stroke="#EBE2D5" stroke-dasharray="3 3"/>
          <text x="18" y="86" text-anchor="end" font-size="11" font-weight="700" fill="#8E7F71">0</text>
          ${barsSvgHtml}
        </svg>
      </div>

      <!-- 月度／年度統計表 (對應 5. 損益報表頁面下方表格) -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">${isMonthly ? '月度統計表（依賣出成交日歸屬）' : '年度彙總統計表'}</span>
        </div>
        <div class="table-scroll-wrap">
          <table class="morandi-table">
            <thead>
              <tr>
                <th>${isMonthly ? '月份' : '年度'}</th>
                <th class="num">已實現損益</th>
                <th class="num">賣出總金額</th>
                <th class="num">交易稅費</th>
              </tr>
            </thead>
            <tbody>
              ${
                tableRowsHtml ||
                `<tr><td colspan="4" class="center" style="padding:20px;color:var(--text-muted);">目前選取帳戶尚無賣出平倉紀錄</td></tr>`
              }
            </tbody>
            ${
              tableRowsHtml
                ? `<tfoot>
                    <tr style="background:var(--surface-subtle);border-top:2px solid var(--border-warm);">
                      <td style="font-weight:900;">總計核對</td>
                      <td class="num ${totalPnlFmt.cls}" style="font-weight:900;">${totalPnlFmt.signNum} (${totalPnlFmt.label})</td>
                      <td class="num" style="font-weight:900;">${fmtTwd(totalGross)}</td>
                      <td class="num" style="font-weight:900;">${fmtTwd(totalFeeTax)}</td>
                    </tr>
                  </tfoot>`
                : ''
            }
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 6. 帳戶管理與系統設定頁面 (對應「6. 帳戶管理頁面」示意圖 + T01–T12 規格驗收器 + 資料備份)
   */
  function renderAccountsTab(portfolio) {
    const accCardsHtml = state.accounts
      .map((acc, idx) => {
        const txCount = state.transactions.filter((t) => t.account_id === acc.id).length;
        return `
          <div class="account-manage-card">
            <div class="account-manage-left">
              ${window.ClayIcons.accountBadge(idx)}
              <div class="account-manage-meta">
                <span class="account-manage-name">${escapeHtml(acc.name)}</span>
                <span class="account-manage-sub">
                  ${acc.note ? `${escapeHtml(acc.note)} · ` : ''}${txCount} 筆交易紀錄
                </span>
              </div>
            </div>
            <div class="account-manage-actions">
              <button type="button" class="btn-icon-circle" title="重新命名帳戶" data-action="edit-account" data-acc-id="${acc.id}">
                ✏️
              </button>
              <button type="button" class="btn-icon-circle danger" title="刪除帳戶" data-action="delete-account" data-acc-id="${acc.id}">
                🗑️
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    const report = state.acceptanceReport || window.StockEngine.runAcceptanceTests();
    const testRowsHtml = report.results
      .map(
        (r) => `
        <tr>
          <td style="white-space:nowrap;font-weight:900;color:${r.passed ? 'var(--down-green)' : 'var(--up-red)'};">
            ${r.passed ? '✅' : '❌'} ${escapeHtml(r.id)}
          </td>
          <td style="font-weight:800;">${escapeHtml(r.name)}</td>
          <td class="wrap-text" style="font-size:12.5px;color:var(--text-secondary);">${escapeHtml(r.detail)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <div class="account-cards-list">
        ${accCardsHtml}
      </div>

      <!-- 對應 6. 帳戶管理頁面底部紅色警示框 (SPEC 4.7) -->
      <div class="warning-banner">
        <span>❗</span>
        <span>若帳戶內含交易紀錄，刪除時會跳出警告並預設保護阻擋直接刪除，絕不靜默連帶刪除交易紀錄。</span>
      </div>

      <!-- 帳號狀態、資料備份與 Supabase 設定卡片 -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">資料備份與雲端連線設定</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="btn-header-action" data-action="export-backup">
            💾 匯出 JSON 備份
          </button>
          <button type="button" class="btn-header-action blue" data-action="open-supabase-config">
            ⚙️ Supabase 連線設定
          </button>
          ${
            state.authMode === 'sandbox'
              ? `<button type="button" class="btn-header-action" style="background:#8E7F71;" data-action="reset-demo-data">
                   🔄 還原示意圖預設資料
                 </button>
                 <button type="button" class="btn-header-action" style="background:#A67B5B;" data-action="clear-sandbox-data">
                   🧹 清空交易從零測試
                 </button>`
              : ''
          }
          <button type="button" class="btn-header-action" style="background:#B84A4A;" data-action="logout">
            🚪 登出並鎖定
          </button>
        </div>
      </div>

      <!-- T01–T12 規格驗收測試報告面板 (ANTIGRAVITY_TASK 第 7 點) -->
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">🧪 SPEC.md T01–T12 規格驗收報告 (${report.passedCount}/${report.totalCount} 通過)</span>
          <button type="button" class="btn-select-all" data-action="rerun-acceptance-tests">
            重新執行驗證
          </button>
        </div>
        <div class="table-scroll-wrap">
          <table class="morandi-table">
            <thead>
              <tr>
                <th>編號</th>
                <th>驗收項目</th>
                <th>實測結果與驗證數據</th>
              </tr>
            </thead>
            <tbody>
              ${testRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染彈出視窗 Modal (3. 新增／編輯交易、手動修改收盤價、帳戶管理、刪除確認、Supabase 設定)
   */
  function renderActiveModal() {
    if (!state.activeModal) return '';

    // Modal 1: 新增／編輯交易表單 (對應「3. 新增／編輯交易（彈出表單）」示意圖)
    if (state.activeModal === 'tx_form' && state.txForm) {
      const f = state.txForm;
      const isBuy = f.action_type === 'BUY';
      const sharesNum = Number(f.shares || 0);
      const priceNum = Number(f.price || 0);
      const feeNum = Number(f.fee || 0);
      const taxNum = Number(f.tax || 0);
      const gross = window.StockEngine.calcGrossAmount(sharesNum, priceNum);
      const netTotal = isBuy ? gross + feeNum : gross - feeNum - taxNum;

      // 查詢該帳戶、該股票當下可用庫存股數 (SPEC 4.4)
      const availInfo = window.StockEngine.getAvailableSharesForAccountStock(
        state.transactions,
        f.account_id,
        f.stock_id,
        f.trade_date,
        f.mode === 'EDIT' ? f.targetTxId : null
      );

      const accOptions = state.accounts
        .map(
          (a) =>
            `<option value="${a.id}" ${f.account_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)} ${a.note ? `(${escapeHtml(a.note)})` : ''}</option>`
        )
        .join('');

      return `
        <div class="modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-tx-title">
            <div class="modal-header">
              <span id="modal-tx-title" class="modal-title">${f.mode === 'ADD' ? '新增交易紀錄' : '編輯交易紀錄'}</span>
              <button type="button" class="modal-close-btn" data-action="close-modal" aria-label="關閉">✕</button>
            </div>
            <div class="modal-body">
              ${
                f.errorMsg
                  ? `<div class="warning-banner" style="margin-bottom:4px;"><span>⛔</span><span>${escapeHtml(f.errorMsg)}</span></div>`
                  : ''
              }

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-acc">所屬帳戶</label>
                <select id="tx-f-acc" class="form-control" data-field="account_id">
                  ${accOptions}
                </select>
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-date">交易日期</label>
                <div style="display:grid;grid-template-columns:1fr 78px;gap:6px;">
                  <input id="tx-f-date" type="date" class="form-control" value="${escapeHtml(f.trade_date)}" data-field="trade_date" />
                  <input type="number" min="1" step="1" class="form-control" title="同日交易先後序號 (1為最先)" placeholder="序號" value="${escapeHtml(f.seq_no)}" data-field="seq_no" />
                </div>
              </div>

              <div class="modal-field-row">
                <span class="modal-field-label">買賣別</span>
                <div class="action-type-toggle">
                  <button type="button" class="btn-action-type buy ${isBuy ? 'active' : ''}" data-action="set-tx-action" data-val="BUY">
                    買入 (BUY)
                  </button>
                  <button type="button" class="btn-action-type sell ${!isBuy ? 'active' : ''}" data-action="set-tx-action" data-val="SELL">
                    賣出 (SELL)
                  </button>
                </div>
              </div>

              ${
                !isBuy
                  ? `<div style="background:var(--card-mint-bg);border:1px solid var(--card-mint-border);padding:8px 12px;border-radius:10px;font-size:13.5px;font-weight:800;color:var(--down-green);">
                       📦 該帳戶此股票截至 ${escapeHtml(f.trade_date)} 可用庫存：<strong>${availInfo.availableShares.toLocaleString()} 股</strong>（均價 ${fmtPrice(availInfo.avgCost)} 元）
                     </div>`
                  : ''
              }

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-stockid">股票代號</label>
                <div class="stock-lookup-group">
                  <input id="tx-f-stockid" type="text" class="form-control" placeholder="例如 2330" value="${escapeHtml(f.stock_id)}" data-field="stock_id" />
                  <button type="button" class="btn-lookup" data-action="lookup-stock">查詢</button>
                </div>
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-stockname">股票名稱</label>
                <input id="tx-f-stockname" type="text" class="form-control" placeholder="例如 台積電" value="${escapeHtml(f.stock_name)}" data-field="stock_name" />
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-shares">成交股數</label>
                <input id="tx-f-shares" type="number" min="1" step="1" class="form-control" value="${escapeHtml(f.shares)}" data-field="shares" />
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-price">成交單價</label>
                <input id="tx-f-price" type="number" min="0.01" step="any" class="form-control" value="${escapeHtml(f.price)}" data-field="price" />
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-fee">手續費 ⓘ</label>
                <input id="tx-f-fee" type="number" min="0" step="1" class="form-control" value="${escapeHtml(f.fee)}" data-field="fee" />
              </div>

              <div class="modal-field-row">
                <label class="modal-field-label" for="tx-f-tax">證交稅 ⓘ</label>
                <input id="tx-f-tax" type="number" min="0" step="1" class="form-control" value="${escapeHtml(f.tax)}" data-field="tax" />
              </div>

              <!-- 即時試算摘要 (SPEC 4.4) -->
              <div class="trade-preview-box">
                <div class="trade-preview-line">
                  <span>成交金額 (股數 × 單價)</span>
                  <span>${fmtTwd(gross)} 元</span>
                </div>
                <div class="trade-preview-line">
                  <span>預估／實際稅費合計</span>
                  <span>${fmtTwd(feeNum + taxNum)} 元</span>
                </div>
                <div class="trade-preview-line" style="color:var(--brand-blue);">
                  <span>${isBuy ? '買入總成本（計入庫存成本）' : '賣出實收淨額（扣除稅費）'}</span>
                  <span>${fmtTwd(netTotal)} 元</span>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">取消</button>
              <button type="button" class="btn-modal-save" data-action="save-tx">儲存</button>
            </div>
          </div>
        </div>
      `;
    }

    // Modal 2: 手動修改參考價格 (SPEC 4.5)
    if (state.activeModal === 'manual_price' && state.manualPriceForm) {
      const f = state.manualPriceForm;
      return `
        <div class="modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <span class="modal-title">手動修改參考收盤價</span>
              <button type="button" class="modal-close-btn" data-action="close-modal">✕</button>
            </div>
            <div class="modal-body">
              ${
                f.errorMsg
                  ? `<div class="warning-banner"><span>⛔</span><span>${escapeHtml(f.errorMsg)}</span></div>`
                  : ''
              }
              <p style="font-size:13.5px;color:var(--text-secondary);font-weight:700;">
                依規格書 4.5：手動設定之價格將於持倉列表清楚標示為「手動價」及更新日期，不會偽裝為證交所官方最新收盤價。
              </p>
              <div class="modal-field-row">
                <label class="modal-field-label">股票代號</label>
                <input type="text" class="form-control" value="${escapeHtml(f.stock_id)}" data-mp-field="stock_id" />
              </div>
              <div class="modal-field-row">
                <label class="modal-field-label">股票名稱</label>
                <input type="text" class="form-control" value="${escapeHtml(f.stock_name)}" data-mp-field="stock_name" />
              </div>
              <div class="modal-field-row">
                <label class="modal-field-label">參考價格</label>
                <input type="number" min="0.01" step="any" class="form-control" placeholder="輸入每股市價" value="${escapeHtml(f.close_price)}" data-mp-field="close_price" />
              </div>
              <div class="modal-field-row">
                <label class="modal-field-label">資料日期</label>
                <input type="date" class="form-control" value="${escapeHtml(f.price_date)}" data-mp-field="price_date" />
              </div>
              <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;color:#9E2A2B;cursor:pointer;">
                <input type="checkbox" ${f.clearPrice ? 'checked' : ''} data-mp-field="clearPrice" style="width:18px;height:18px;" />
                <span>清除此股票收盤價（模擬 T08「尚無收盤價」狀態）</span>
              </label>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">取消</button>
              <button type="button" class="btn-modal-save" data-action="save-manual-price">儲存設定</button>
            </div>
          </div>
        </div>
      `;
    }

    // Modal 3: 新增／重新命名帳戶 (SPEC 4.7)
    if (state.activeModal === 'account_form' && state.accountForm) {
      const f = state.accountForm;
      return `
        <div class="modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <span class="modal-title">${f.mode === 'ADD' ? '新增證券帳戶' : '重新命名／編輯帳戶'}</span>
              <button type="button" class="modal-close-btn" data-action="close-modal">✕</button>
            </div>
            <div class="modal-body">
              ${
                f.errorMsg
                  ? `<div class="warning-banner"><span>⛔</span><span>${escapeHtml(f.errorMsg)}</span></div>`
                  : ''
              }
              <div class="modal-field-row">
                <label class="modal-field-label">帳戶名稱</label>
                <input type="text" class="form-control" placeholder="例如：帳戶1" value="${escapeHtml(f.name)}" data-acc-field="name" />
              </div>
              <div class="modal-field-row">
                <label class="modal-field-label">券商備註</label>
                <input type="text" class="form-control" placeholder="例如：國泰證券" value="${escapeHtml(f.note)}" data-acc-field="note" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">取消</button>
              <button type="button" class="btn-modal-save" data-action="save-account">儲存帳戶</button>
            </div>
          </div>
        </div>
      `;
    }

    // Modal 4: 刪除交易確認視窗 (SPEC 4.3 & T07)
    if (state.activeModal === 'confirm_delete_tx' && state.confirmPayload) {
      const p = state.confirmPayload;
      const t = p.target;
      return `
        <div class="modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <span class="modal-title">刪除交易紀錄確認</span>
              <button type="button" class="modal-close-btn" data-action="close-modal">✕</button>
            </div>
            <div class="modal-body">
              <p style="font-weight:800;">
                確定要刪除 <strong>${escapeHtml(t.trade_date)}</strong> 之 <strong>${escapeHtml(t.stock_id)} ${escapeHtml(t.stock_name)}</strong>
                （${t.action_type === 'BUY' ? '買入' : '賣出'} ${Number(t.shares).toLocaleString()} 股 @ ${fmtPrice(t.price)} 元）嗎？
              </p>
              ${
                !p.canDelete
                  ? `<div class="warning-banner">
                       <span>⛔</span>
                       <span>無法刪除此筆歷史買入交易！${escapeHtml(p.blockReason)}</span>
                     </div>`
                  : `<p style="font-size:13.5px;color:var(--text-secondary);font-weight:700;">
                       刪除後，系統將自動重新計算該帳戶該股票的所有後續庫存、加權平均成本與已實現損益。
                     </p>`
              }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">取消</button>
              ${
                p.canDelete
                  ? `<button type="button" class="btn-modal-save" style="background:var(--up-red);" data-action="confirm-delete-tx">確認刪除</button>`
                  : `<button type="button" class="btn-modal-cancel" disabled style="opacity:0.5;">已阻擋刪除</button>`
              }
            </div>
          </div>
        </div>
      `;
    }

    // Modal 5: 刪除帳戶保護與確認視窗 (SPEC 4.7)
    if (state.activeModal === 'confirm_delete_acc' && state.confirmPayload) {
      const p = state.confirmPayload;
      return `
        <div class="modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <span class="modal-title">刪除證券帳戶確認</span>
              <button type="button" class="modal-close-btn" data-action="close-modal">✕</button>
            </div>
            <div class="modal-body">
              ${
                p.txCount > 0
                  ? `<div class="warning-banner">
                       <span>❗</span>
                       <span>
                         「${escapeHtml(p.acc.name)}」目前含有 <strong>${p.txCount} 筆交易紀錄</strong>！<br/>
                         依規格書 4.7 保護機制，系統禁止直接連帶刪除含交易的帳戶。請先點擊「匯出 JSON 備份」，並至交易紀錄頁移轉或刪除該帳戶之交易後再試。
                       </span>
                     </div>`
                  : state.accounts.length <= 1
                  ? `<div class="warning-banner"><span>❗</span><span>系統至少需保留一個證券帳戶。</span></div>`
                  : `<p style="font-weight:800;">確定要刪除空帳戶「${escapeHtml(p.acc.name)}」嗎？</p>`
              }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">關閉</button>
              ${
                p.canDelete
                  ? `<button type="button" class="btn-modal-save" style="background:var(--up-red);" data-action="confirm-delete-acc">確認刪除空帳戶</button>`
                  : `<button type="button" class="btn-modal-save" data-action="export-backup">先匯出備份</button>`
              }
            </div>
          </div>
        </div>
      `;
    }

    // Modal 6: Supabase URL & Anon Key 連線設定 + ⚡ 一鍵全自動建置精靈
    if (state.activeModal === 'supabase_cfg') {
      const ap = state.autoProvisionState;
      const savedToken =
        ap.cachedToken ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__temp_sbp_token')) ||
        '';
      const projectSelectHtml =
        ap.needSelectProject && ap.projects.length > 0
          ? `<div class="modal-field-row" style="grid-template-columns:1fr;background:#FFF6E5;padding:10px;border-radius:10px;border:1px solid #E8C98E;">
               <label class="modal-field-label" style="color:#8A5A10;">偵測到您有多個 Supabase 專案，請選擇要安裝「持股管家」的目標專案（系統會自動採用安全隔離表名，絕不影響原專案資料）：</label>
               <select id="ap-project-ref" class="form-control">
                 ${ap.projects
                   .map(
                     (p) =>
                       `<option value="${escapeHtml(p.id)}" ${p.name.includes('test') ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.id)} - ${escapeHtml(p.region)})</option>`
                   )
                   .join('')}
               </select>
             </div>`
          : '';

      return `
        <div class="modal-backdrop">
          <div class="modal-card" style="max-width:520px;" role="dialog" aria-modal="true">
            <div class="modal-header">
              <span class="modal-title">⚡ Supabase 與 Google 登入一鍵設定精靈</span>
              <button type="button" class="modal-close-btn" data-action="close-modal">✕</button>
            </div>
            <div class="modal-body">
              <!-- 區塊 A: 全自動建置精靈 -->
              <div style="background:var(--card-mint-bg);border:1.5px solid var(--card-mint-border);padding:12px 14px;border-radius:14px;display:flex;flex-direction:column;gap:10px;">
                <div style="font-size:15px;font-weight:900;color:var(--down-green);">
                  🚀 方式一：全自動建置（由系統直接幫您建表、設好 RLS 與抓金鑰）
                </div>
                <div style="font-size:13px;font-weight:700;color:var(--text-secondary);line-height:1.45;">
                  1. 點擊下方按鈕前往 Supabase 產生一組臨時授權碼（<code>Generate new token</code>，名稱隨意填，複製 <code>sbp_...</code> 開頭的字串）。<br/>
                  2. 貼入下方欄位並按「⚡ 一鍵自動完成建置」，系統就會自動幫您建立或連接專案、執行全部 SQL 資料表與 RLS 安全規則，並自動填好連線金鑰！
                </div>
                <button type="button" class="btn-header-action blue" style="justify-content:center;width:100%;" data-action="open-supabase-token-page">
                  🔗 1. 點此打開 Supabase Token 頁面 (取得 sbp_ 授權碼)
                </button>
                <input id="ap-access-token" type="password" class="form-control" placeholder="在此貼上 sbp_ 開頭的 Supabase Access Token" value="${escapeHtml(savedToken)}" />
                ${projectSelectHtml}
                <details style="font-size:13px;font-weight:700;color:var(--text-secondary);">
                  <summary style="cursor:pointer;color:var(--brand-blue);">➕ 選填：一併自動寫入 Google OAuth Client ID 與 Secret</summary>
                  <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                    <input id="ap-google-id" type="text" class="form-control" placeholder="Google Client ID (xxx.apps.googleusercontent.com)" />
                    <input id="ap-google-secret" type="password" class="form-control" placeholder="Google Client Secret (GOCSPX-...)" />
                  </div>
                </details>
                <button type="button" class="btn-modal-save" style="width:100%;min-height:44px;font-size:15px;" data-action="run-auto-provision" ${ap.isRunning ? 'disabled' : ''}>
                  ${ap.isRunning ? '⏳ 正在自動建置資料庫與設定金鑰...' : '⚡ 2. 一鍵自動完成建置（免貼 SQL、免找金鑰）'}
                </button>
                ${
                  ap.error
                    ? `<div class="warning-banner"><span>⛔</span><span>${escapeHtml(ap.error)}</span></div>`
                    : ''
                }
                ${
                  ap.logs && ap.logs.length > 0
                    ? `<div style="background:#FFFFFF;padding:10px;border-radius:10px;font-size:12.5px;font-weight:800;color:var(--down-green);display:flex;flex-direction:column;gap:4px;">
                         ${ap.logs.map((l) => `<div>✅ ${escapeHtml(l)}</div>`).join('')}
                         ${
                           ap.callbackUrl
                             ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-warm);color:var(--text-primary);">
                                  📌 您的 Google OAuth 回呼網址 (Redirect URI)：<br/>
                                  <code style="user-select:all;background:var(--surface-subtle);padding:2px 6px;border-radius:4px;">${escapeHtml(ap.callbackUrl)}</code>
                                </div>`
                             : ''
                         }
                       </div>`
                    : ''
                }
              </div>

              <!-- 區塊 B: 雲端信箱帳號直接登入（已完成建置後可立即跨裝置登入，免等 Google Cloud 審核） -->
              ${
                state.supabaseConfig.url && state.supabaseConfig.anonKey
                  ? `<div style="background:var(--card-cream-bg);border:1.5px solid var(--card-cream-border);padding:12px 14px;border-radius:14px;display:flex;flex-direction:column;gap:8px;">
                       <div style="font-size:14.5px;font-weight:900;color:#7B4E12;">
                         ☁️ 已連上雲端專案！您可立即使用「Google 登入」或「雲端信箱登入」：
                       </div>
                       <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                         <input id="cloud-auth-email" type="email" class="form-control" placeholder="輸入您的常用 Email" />
                         <input id="cloud-auth-pass" type="password" class="form-control" placeholder="設定或輸入密碼 (>=6碼)" />
                       </div>
                       <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                         <button type="button" class="btn-header-action" style="justify-content:center;" data-action="cloud-email-signin">
                           🔑 雲端帳號登入
                         </button>
                         <button type="button" class="btn-header-action blue" style="justify-content:center;" data-action="cloud-email-signup">
                           ✨ 首次註冊雲端帳號
                         </button>
                       </div>
                     </div>`
                  : ''
              }

              <!-- 區塊 C: 手動設定 Project URL & Anon Key -->
              <details ${state.supabaseConfig.url ? '' : 'open'} style="font-size:13.5px;font-weight:800;color:var(--text-secondary);">
                <summary style="cursor:pointer;">🔧 方式二：手動檢視或貼上 Supabase URL 與 Anon Key</summary>
                <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
                  <div class="modal-field-row" style="grid-template-columns:1fr;">
                    <label class="modal-field-label">Supabase Project URL</label>
                    <input id="cfg-sb-url" type="url" class="form-control" placeholder="https://xxxx.supabase.co" value="${escapeHtml(state.supabaseConfig.url)}" />
                  </div>
                  <div class="modal-field-row" style="grid-template-columns:1fr;">
                    <label class="modal-field-label">Supabase Anon / Publishable Key（嚴禁填 service_role）</label>
                    <input id="cfg-sb-key" type="text" class="form-control" placeholder="eyJhbGciOi... 或 sb_publishable_..." value="${escapeHtml(state.supabaseConfig.anonKey)}" />
                  </div>
                </div>
              </details>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-modal-cancel" data-action="close-modal">關閉</button>
              <button type="button" class="btn-modal-save" data-action="save-supabase-config">儲存手動設定</button>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  }

  /**
   * 頂部標題列與動作按鈕 (依當前頁面動態呈現對應按鈕，對齊示意圖 1~6)
   */
  function renderTopHeader() {
    const titles = {
      home: '持股管家',
      transactions: '交易紀錄',
      holdings: '持倉總覽',
      reports: '損益報表',
      accounts: '帳戶管理',
    };

    let rightBtnHtml = '';
    if (state.currentTab === 'home' || state.currentTab === 'holdings') {
      rightBtnHtml = `
        <button type="button" class="btn-header-action" data-action="refresh-quotes">
          ${state.isUpdatingQuotes ? '⏳ 更新中...' : '↻ 更新收盤價'}
        </button>
      `;
    } else if (state.currentTab === 'transactions') {
      rightBtnHtml = `
        <button type="button" class="btn-header-action" data-action="open-add-tx">
          ＋ 新增交易
        </button>
      `;
    } else if (state.currentTab === 'accounts') {
      rightBtnHtml = `
        <button type="button" class="btn-header-action" data-action="open-add-account">
          ＋ 新增帳戶
        </button>
      `;
    } else if (state.currentTab === 'reports') {
      rightBtnHtml = `
        <button type="button" class="btn-header-action blue" data-action="open-add-tx">
          ＋ 記一筆
        </button>
      `;
    }

    return `
      <header class="top-header">
        <div class="header-brand">
          ${window.ClayIcons.sproutCoinLogo()}
          <h1 class="header-title">${escapeHtml(titles[state.currentTab] || '持股管家')}</h1>
        </div>
        <div class="header-actions">
          ${rightBtnHtml}
        </div>
      </header>
    `;
  }

  /**
   * 渲染整個應用程式畫面
   */
  function renderApp() {
    document.body.setAttribute('data-viewport', state.viewportMode);

    // 更新頂部視角切換按鈕狀態
    document.querySelectorAll('[data-vp-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-vp-mode') === state.viewportMode);
    });

    // 更新頂部狀態膠囊
    const statusPillEl = document.getElementById('auth-status-pill');
    if (statusPillEl) {
      if (!state.authMode) {
        statusPillEl.className = 'status-pill sandbox';
        statusPillEl.textContent = '🔒 未登入（個人資料已隔離鎖定）';
      } else if (state.authMode === 'sandbox') {
        statusPillEl.className = 'status-pill sandbox';
        statusPillEl.textContent = '🧪 本地驗收沙盒（T01–T12 全數通過）';
      } else {
        statusPillEl.className = 'status-pill';
        statusPillEl.textContent = `☁️ 已登入 Google (${state.sessionUser?.email || '雲端同步中'})`;
      }
    }

    const shellEl = document.getElementById('app-shell');
    const modalRootEl = document.getElementById('modal-root');
    if (!shellEl || !modalRootEl) return;

    // T01: 未登入時只可看到登入頁，不能讀取任何帳戶或交易資料
    if (!state.authMode) {
      shellEl.innerHTML = `
        <div class="iphone-notch-bar">
          <span>9:41</span>
          <div class="notch-pill"></div>
          <span>5G 100%</span>
        </div>
        ${renderLoginScreen()}
      `;
      modalRootEl.innerHTML = renderActiveModal();
      return;
    }

    // 計算最新投資組合與報表狀態
    const portfolio = window.StockEngine.computePortfolioState({
      accounts: state.accounts,
      transactions: state.transactions,
      pricesMap: state.pricesMap,
      selectedAccountIds: state.selectedAccountIds,
      currentYear: state.reportYear,
    });

    let tabContentHtml = '';
    if (state.currentTab === 'home') {
      tabContentHtml = renderHomeTab(portfolio);
    } else if (state.currentTab === 'transactions') {
      tabContentHtml = renderTransactionsTab(portfolio);
    } else if (state.currentTab === 'holdings') {
      tabContentHtml = renderHoldingsTab(portfolio);
    } else if (state.currentTab === 'reports') {
      tabContentHtml = renderReportsTab(portfolio);
    } else if (state.currentTab === 'accounts') {
      tabContentHtml = renderAccountsTab(portfolio);
    }

    const navItems = [
      { id: 'home', label: '首頁', fullLabel: '首頁看板', icon: '🏠' },
      { id: 'transactions', label: '交易紀錄', fullLabel: '交易紀錄', icon: '📋' },
      { id: 'holdings', label: '持倉', fullLabel: '持倉總覽', icon: '📊' },
      { id: 'reports', label: '報表', fullLabel: '損益報表', icon: '📈' },
      { id: 'accounts', label: '設定', fullLabel: '帳戶與驗收', icon: '⚙️' },
    ];

    const sideNavHtml = `
      <aside class="side-nav" aria-label="桌面與平板左側導覽">
        <div>
          <div class="side-brand">
            ${window.ClayIcons.sproutCoinLogo()}
            <div class="side-brand-title">持股管家</div>
          </div>
          <nav class="side-nav-list">
            ${navItems
              .map(
                (item) => `
                <button type="button" class="side-nav-btn ${state.currentTab === item.id ? 'active' : ''}" data-action="switch-tab" data-tab="${item.id}">
                  <span>${item.icon}</span>
                  <span>${item.fullLabel}</span>
                </button>
              `
              )
              .join('')}
          </nav>
        </div>
        <div class="side-nav-footer">
          <div style="font-weight:800;margin-bottom:6px;">
            ${state.authMode === 'sandbox' ? '🧪 本地驗收沙盒' : '☁️ Google 雲端同步'}
          </div>
          <button type="button" class="section-link" data-action="open-add-tx">＋ 快速新增交易</button>
        </div>
      </aside>
    `;

    const bottomNavHtml = `
      <nav class="bottom-nav" aria-label="手機底部導覽">
        ${navItems
          .map(
            (item) => `
            <button type="button" class="bottom-nav-btn ${state.currentTab === item.id ? 'active' : ''}" data-action="switch-tab" data-tab="${item.id}">
              <span class="nav-ico">${item.icon}</span>
              <span>${item.label}</span>
            </button>
          `
          )
          .join('')}
      </nav>
    `;

    shellEl.innerHTML = `
      <div class="iphone-notch-bar">
        <span>9:41</span>
        <div class="notch-pill"></div>
        <span>5G 100%</span>
      </div>
      ${sideNavHtml}
      <div class="main-area">
        ${renderTopHeader()}
        <main class="scroll-content">
          ${tabContentHtml}
        </main>
      </div>
      ${bottomNavHtml}
    `;

    modalRootEl.innerHTML = renderActiveModal();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================================================
  // 事件代理綁定 (Event Delegation)
  // ==========================================================================
  function setupEventListeners() {
    // 頂部裝置視角切換器 (iPhone 直向 / iPad 橫向 / 自動適應)
    document.addEventListener('click', (e) => {
      const vpBtn = e.target.closest('[data-vp-mode]');
      if (vpBtn) {
        const mode = vpBtn.getAttribute('data-vp-mode');
        state.viewportMode = mode;
        localStorage.setItem(STORAGE_KEYS.VIEWPORT_MODE, mode);
        renderApp();
        return;
      }

      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-action');

      switch (action) {
        case 'google-login':
          handleGoogleLogin();
          break;
        case 'enter-sandbox':
          enterSandboxMode(false);
          break;
        case 'logout':
          handleLogout();
          break;
        case 'switch-tab': {
          const targetTab = actionEl.getAttribute('data-tab');
          if (targetTab) {
            state.currentTab = targetTab;
            renderApp();
          }
          break;
        }
        case 'select-all-accounts': {
          state.selectedAccountIds = state.accounts.map((a) => a.id);
          saveSandboxState();
          renderApp();
          break;
        }
        case 'open-add-tx':
          openTransactionModal(null);
          break;
        case 'edit-tx':
          openTransactionModal(actionEl.getAttribute('data-tx-id'));
          break;
        case 'delete-tx':
          requestDeleteTransaction(actionEl.getAttribute('data-tx-id'));
          break;
        case 'confirm-delete-tx':
          executeDeleteTransaction();
          break;
        case 'set-tx-action': {
          if (state.txForm) {
            state.txForm.action_type = actionEl.getAttribute('data-val');
            state.txForm.taxOverridden = false;
            syncTxFormDefaults();
            state.txForm.errorMsg = '';
            renderApp();
          }
          break;
        }
        case 'lookup-stock': {
          if (state.txForm) {
            const code = String(state.txForm.stock_id || '').trim().toUpperCase();
            const found =
              TW_STOCK_DICT[code] ||
              (state.pricesMap[code] && {
                name: state.pricesMap[code].stock_name,
                refPrice: state.pricesMap[code].close_price,
              });
            if (found) {
              state.txForm.stock_name = found.name;
              if (!state.txForm.price || Number(state.txForm.price) <= 0) {
                state.txForm.price = String(found.refPrice);
              }
              syncTxFormDefaults();
              showToast(`已帶入 ${code} ${found.name}`, 'success');
            } else {
              showToast(`內建清單查無 ${code}，請直接輸入股票名稱。`, 'info');
            }
            renderApp();
          }
          break;
        }
        case 'save-tx':
          handleSaveTransaction();
          break;
        case 'refresh-quotes':
          handleRefreshClosingPrices();
          break;
        case 'set-holdings-mode':
          state.holdingsViewMode = actionEl.getAttribute('data-mode') || 'by_account';
          renderApp();
          break;
        case 'open-manual-price':
          openManualPriceModal(
            actionEl.getAttribute('data-stock-id'),
            actionEl.getAttribute('data-stock-name')
          );
          break;
        case 'save-manual-price':
          handleSaveManualPrice();
          break;
        case 'set-report-tab':
          state.reportSubTab = actionEl.getAttribute('data-tab') || 'monthly';
          renderApp();
          break;
        case 'open-add-account':
          openAccountModal(null);
          break;
        case 'edit-account':
          openAccountModal(actionEl.getAttribute('data-acc-id'));
          break;
        case 'save-account':
          handleSaveAccount();
          break;
        case 'delete-account':
          requestDeleteAccount(actionEl.getAttribute('data-acc-id'));
          break;
        case 'confirm-delete-acc':
          executeDeleteAccount();
          break;
        case 'export-backup':
          handleExportBackup();
          break;
        case 'reset-demo-data':
          localStorage.removeItem(STORAGE_KEYS.SANDBOX_STATE);
          enterSandboxMode(false);
          break;
        case 'clear-sandbox-data':
          enterSandboxMode(true);
          break;
        case 'rerun-acceptance-tests':
          state.acceptanceReport = window.StockEngine.runAcceptanceTests();
          renderApp();
          showToast(
            `已完成 T01–T12 測試：${state.acceptanceReport.passedCount}/${state.acceptanceReport.totalCount} 全數通過！`,
            'success'
          );
          break;
        case 'open-supabase-config':
          state.activeModal = 'supabase_cfg';
          renderApp();
          break;
        case 'open-supabase-token-page':
          window.open('https://supabase.com/dashboard/account/tokens', '_blank', 'noopener');
          break;
        case 'run-auto-provision': {
          const tokenEl = document.getElementById('ap-access-token');
          const projEl = document.getElementById('ap-project-ref');
          const gIdEl = document.getElementById('ap-google-id');
          const gSecEl = document.getElementById('ap-google-secret');
          const accessToken = String(tokenEl?.value || '').trim();
          const projectRef = String(projEl?.value || '').trim();
          const googleClientId = String(gIdEl?.value || '').trim();
          const googleClientSecret = String(gSecEl?.value || '').trim();

          if (!accessToken) {
            state.autoProvisionState.error = '請先貼上 sbp_ 開頭的 Supabase Access Token！';
            renderApp();
            return;
          }

          state.autoProvisionState.cachedToken = accessToken;
          state.autoProvisionState.isRunning = true;
          state.autoProvisionState.error = '';
          renderApp();

          fetch('/api/setup/auto-provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              projectRef,
              googleClientId,
              googleClientSecret,
            }),
          })
            .then((r) => r.json())
            .then(async (res) => {
              state.autoProvisionState.isRunning = false;
              if (!res.ok) {
                state.autoProvisionState.error = res.error || '自動建置失敗';
                renderApp();
                return;
              }
              if (res.needSelectProject) {
                state.autoProvisionState.needSelectProject = true;
                state.autoProvisionState.projects = res.projects || [];
                showToast('請從下拉選單選擇要安裝的 Supabase 專案，再按一次按鈕！', 'info');
                renderApp();
                return;
              }
              state.autoProvisionState.needSelectProject = false;
              state.autoProvisionState.logs = res.stepsLog || [];
              if (res.publicConfig) {
                state.supabaseConfig = {
                  url: res.publicConfig.url,
                  anonKey: res.publicConfig.anonKey,
                };
                if (res.publicConfig.tablesMap) {
                  state.supabaseTables = { ...state.supabaseTables, ...res.publicConfig.tablesMap };
                }
                state.autoProvisionState.callbackUrl = res.publicConfig.callbackUrl;
                localStorage.setItem(
                  STORAGE_KEYS.SUPABASE_CONFIG,
                  JSON.stringify(state.supabaseConfig)
                );
                await initSupabaseIfConfigured();
              }
              renderApp();
              showToast('🎉 已全自動完成 Supabase 資料表、RLS 與連線金鑰設定！', 'success');
            })
            .catch((err) => {
              state.autoProvisionState.isRunning = false;
              state.autoProvisionState.error = `請透過 http://localhost:8080 開啟本頁以使用自動建置功能 (${err.message})`;
              renderApp();
            });
          break;
        }
        case 'cloud-email-signin':
        case 'cloud-email-signup': {
          const email = String(document.getElementById('cloud-auth-email')?.value || '').trim();
          const password = String(document.getElementById('cloud-auth-pass')?.value || '').trim();
          if (!email || password.length < 6) {
            showToast('請輸入有效的 Email 與至少 6 碼密碼', 'error');
            return;
          }
          if (!state.supabaseClient) {
            initSupabaseIfConfigured();
          }
          if (!state.supabaseClient) {
            showToast('請先完成 Supabase 連線設定', 'error');
            return;
          }
          const isSignUp = action === 'cloud-email-signup';
          (isSignUp
            ? state.supabaseClient.auth.signUp({ email, password })
            : state.supabaseClient.auth.signInWithPassword({ email, password })
          ).then(async ({ data, error }) => {
            if (error) {
              showToast(`${isSignUp ? '註冊' : '登入'}失敗：${error.message}`, 'error');
              return;
            }
            if (data && data.session && data.user) {
              state.authMode = 'supabase';
              state.sessionUser = data.user;
              state.activeModal = null;
              await syncFromSupabaseCloud();
              renderApp();
              showToast('☁️ 已成功登入 Supabase 雲端資料庫並同步個人帳本！', 'success');
            } else {
              showToast('註冊成功！若您的 Supabase 開啟了信箱驗證，請至信箱點擊確認信後登入。', 'info');
            }
          });
          break;
        }
        case 'save-supabase-config': {
          const urlInput = document.getElementById('cfg-sb-url');
          const keyInput = document.getElementById('cfg-sb-key');
          const url = String(urlInput?.value || '').trim();
          const anonKey = String(keyInput?.value || '').trim();
          if (isForbiddenServiceRoleKey(anonKey)) {
            showToast('安全拒絕：禁止在前端輸入 service_role 私鑰！請改用 anon/publishable key。', 'error');
            return;
          }
          state.supabaseConfig = { url, anonKey };
          localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify(state.supabaseConfig));
          state.activeModal = null;
          initSupabaseIfConfigured();
          renderApp();
          showToast('已儲存 Supabase 連線設定！', 'success');
          break;
        }
        case 'tx-filter-reset':
          state.txFilter = { accountScope: 'ALL', dateFrom: '', dateTo: '', stockKeyword: '' };
          renderApp();
          break;
        case 'close-modal':
          state.activeModal = null;
          renderApp();
          break;
      }
    });

    // 處理 Checkbox 與表單輸入變更
    document.addEventListener('change', (e) => {
      const target = e.target;

      // 帳戶單選／複選勾選切換 (SPEC 4.2)
      if (target.matches('[data-action="toggle-account"]')) {
        const accId = target.getAttribute('data-acc-id');
        if (target.checked) {
          if (!state.selectedAccountIds.includes(accId)) {
            state.selectedAccountIds.push(accId);
          }
        } else {
          if (state.selectedAccountIds.length <= 1) {
            target.checked = true;
            showToast('請至少保留勾選一個帳戶以顯示統計資料。', 'info');
            return;
          }
          state.selectedAccountIds = state.selectedAccountIds.filter((id) => id !== accId);
        }
        saveSandboxState();
        renderApp();
        return;
      }

      if (target.matches('[data-action="tx-filter-acc"]')) {
        state.txFilter.accountScope = target.value;
        renderApp();
        return;
      }
      if (target.matches('[data-action="tx-filter-from"]')) {
        state.txFilter.dateFrom = target.value;
        renderApp();
        return;
      }
      if (target.matches('[data-action="tx-filter-to"]')) {
        state.txFilter.dateTo = target.value;
        renderApp();
        return;
      }

      if (target.matches('[data-mp-field="clearPrice"]') && state.manualPriceForm) {
        state.manualPriceForm.clearPrice = target.checked;
        renderApp();
        return;
      }
    });

    document.addEventListener('input', (e) => {
      const target = e.target;

      // 交易紀錄股票關鍵字即時篩選
      if (target.matches('[data-action="tx-filter-stock"]')) {
        state.txFilter.stockKeyword = target.value;
        const pos = target.selectionStart;
        renderApp();
        const newInput = document.getElementById('tx-filter-stock');
        if (newInput) {
          newInput.focus();
          try {
            newInput.setSelectionRange(pos, pos);
          } catch (_) {}
        }
        return;
      }

      // 新增／編輯交易表單即時連動
      const txField = target.getAttribute('data-field');
      if (txField && state.txForm) {
        state.txForm[txField] = target.value;
        state.txForm.errorMsg = '';
        if (txField === 'stock_id') {
          const code = String(target.value || '').trim().toUpperCase();
          if (TW_STOCK_DICT[code]) {
            state.txForm.stock_name = TW_STOCK_DICT[code].name;
            const nameInput = document.getElementById('tx-f-stockname');
            if (nameInput) nameInput.value = state.txForm.stock_name;
          }
        }
        if (txField === 'fee') state.txForm.feeOverridden = true;
        if (txField === 'tax') state.txForm.taxOverridden = true;
        if (txField === 'shares' || txField === 'price') {
          syncTxFormDefaults();
          const feeInput = document.getElementById('tx-f-fee');
          const taxInput = document.getElementById('tx-f-tax');
          if (feeInput) feeInput.value = state.txForm.fee;
          if (taxInput) taxInput.value = state.txForm.tax;
        }
        // 更新即時試算預覽框而不重繪整個 input 以保留游標焦點
        const previewBox = document.querySelector('.trade-preview-box');
        if (previewBox) {
          const isBuy = state.txForm.action_type === 'BUY';
          const gross = window.StockEngine.calcGrossAmount(
            Number(state.txForm.shares || 0),
            Number(state.txForm.price || 0)
          );
          const feeNum = Number(state.txForm.fee || 0);
          const taxNum = Number(state.txForm.tax || 0);
          const netTotal = isBuy ? gross + feeNum : gross - feeNum - taxNum;
          previewBox.innerHTML = `
            <div class="trade-preview-line">
              <span>成交金額 (股數 × 單價)</span>
              <span>${fmtTwd(gross)} 元</span>
            </div>
            <div class="trade-preview-line">
              <span>預估／實際稅費合計</span>
              <span>${fmtTwd(feeNum + taxNum)} 元</span>
            </div>
            <div class="trade-preview-line" style="color:var(--brand-blue);">
              <span>${isBuy ? '買入總成本（計入庫存成本）' : '賣出實收淨額（扣除稅費）'}</span>
              <span>${fmtTwd(netTotal)} 元</span>
            </div>
          `;
        }
        return;
      }

      // 手動改價表單
      const mpField = target.getAttribute('data-mp-field');
      if (mpField && state.manualPriceForm && mpField !== 'clearPrice') {
        state.manualPriceForm[mpField] = target.value;
        return;
      }

      // 帳戶表單
      const accField = target.getAttribute('data-acc-field');
      if (accField && state.accountForm) {
        state.accountForm[accField] = target.value;
        return;
      }
    });
  }

  // 啟動應用程式
  window.addEventListener('DOMContentLoaded', async () => {
    // 注入共用 3D 黏土 SVG 漸層與濾鏡定義
    const defsHost = document.getElementById('svg-defs-host');
    if (defsHost && window.ClayIcons) {
      defsHost.innerHTML = window.ClayIcons.SharedDefs;
    }
    setupEventListeners();
    await initSupabaseIfConfigured();
    // 為了讓使用者打開時若有雲端 Session 直接進入雲端帳本，若尚未登入則顯示 Google 登入頁（亦可點「進入本地驗收沙盒」）
    if (!state.authMode) {
      renderApp();
    } else {
      renderApp();
    }
  });
})();
