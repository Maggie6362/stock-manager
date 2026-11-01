/**
 * 股票買賣與損益管理小幫手 — 全自動驗收腳本 (verify_t01_t12.js)
 * 依據 SPEC.md T01–T12 與 ANTIGRAVITY_TASK.md 安全性與功能要求執行完整驗證。
 */
const fs = require('fs');
const path = require('path');
const engine = require('./core_engine.js');

function runFullVerification() {
  console.log('==============================================================');
  console.log(' 股票買賣與損益管理小幫手 — T01–T12 與安全規範自動驗收');
  console.log('==============================================================\n');

  const engineReport = engine.runAcceptanceTests();
  for (const r of engineReport.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id} ${r.name}`);
    console.log(`       -> ${r.detail}`);
  }

  // 額外安全與靜態檢查 (ANTIGRAVITY_TASK 第 6 點)
  const sqlContentRaw = fs.readFileSync(path.join(__dirname, 'supabase_migration.sql'), 'utf8');
  const sqlWithoutComments = sqlContentRaw.replace(/--.*$/gm, '');
  const appContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  const hasPublicPolicy = /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(sqlWithoutComments);
  const allTablesRls =
    /alter table public\.profiles enable row level security/i.test(sqlWithoutComments) &&
    /alter table public\.accounts enable row level security/i.test(sqlWithoutComments) &&
    /alter table public\.transactions enable row level security/i.test(sqlWithoutComments) &&
    /alter table public\.prices enable row level security/i.test(sqlWithoutComments);
  const combinedFrontend = appContent + htmlContent;
  const jwts = combinedFrontend.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g) || [];
  const hasServiceRoleJwt = jwts.some((token) => {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      return payload.role === 'service_role';
    } catch (_) {
      return false;
    }
  });
  const noHardcodedSecret =
    !/sb_secret_[a-zA-Z0-9_-]{10,}/i.test(combinedFrontend) && !hasServiceRoleJwt;

  console.log('\n--------------------------------------------------------------');
  console.log(`[${!hasPublicPolicy ? 'PASS' : 'FAIL'}] SQL 無公開讀寫政策 (No USING(true)/WITH CHECK(true))`);
  console.log(`[${allTablesRls ? 'PASS' : 'FAIL'}] SQL 所有資料表 (profiles/accounts/transactions/prices) 均啟用 RLS`);
  console.log(`[${noHardcodedSecret ? 'PASS' : 'FAIL'}] 前端無暴露任何 service_role key 或資料庫密鑰`);
  console.log('--------------------------------------------------------------\n');

  if (!engineReport.allPassed || hasPublicPolicy || !allTablesRls || !noHardcodedSecret) {
    console.error('❌ 驗收未完全通過！');
    process.exit(1);
  }
  console.log(`✅ 全部 ${engineReport.passedCount}/${engineReport.totalCount} 項規格測試與安全檢查 100% 通過！`);
}

runFullVerification();
