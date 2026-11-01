/**
 * 3D 黏土風格圖示庫 (clay_icons.js)
 * 以多層次徑向漸層 (Radial Gradients)、高光反射與柔和立體陰影濾鏡，呈現圓潤可愛的莫蘭迪 3D 黏土質感，
 * 100% 透明背景、Retina 高解析無損縮放，完美對應頁面佈局示意圖之視覺風格。
 */
(function (root) {
  'use strict';

  const SharedDefs = `
    <svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;" aria-hidden="true">
      <defs>
        <!-- 3D 黏土立體柔和投影與內高光 -->
        <filter id="clay-shadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#5c4938" flood-opacity="0.18"/>
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#5c4938" flood-opacity="0.12"/>
        </filter>
        <filter id="clay-shadow-sm" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#5c4938" flood-opacity="0.16"/>
        </filter>

        <!-- 粉嫩小豬漸層 -->
        <radialGradient id="clay-pink" cx="35%" cy="28%" r="70%">
          <stop offset="0%" stop-color="#FFE5E8"/>
          <stop offset="45%" stop-color="#F6B8C1"/>
          <stop offset="85%" stop-color="#E28F9B"/>
          <stop offset="100%" stop-color="#C97380"/>
        </radialGradient>
        <radialGradient id="clay-pink-snout" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#FFD4DA"/>
          <stop offset="65%" stop-color="#EEA0AC"/>
          <stop offset="100%" stop-color="#D47B89"/>
        </radialGradient>

        <!-- 嫩芽莫蘭迪綠漸層 -->
        <radialGradient id="clay-green" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#CBE8B8"/>
          <stop offset="50%" stop-color="#87BC6E"/>
          <stop offset="90%" stop-color="#5B9447"/>
          <stop offset="100%" stop-color="#457834"/>
        </radialGradient>
        <radialGradient id="clay-mint" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#B8E4D0"/>
          <stop offset="55%" stop-color="#6DB596"/>
          <stop offset="100%" stop-color="#488E70"/>
        </radialGradient>

        <!-- 溫暖金幣/錢袋漸層 -->
        <radialGradient id="clay-gold" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFF0BC"/>
          <stop offset="45%" stop-color="#F5CA69"/>
          <stop offset="85%" stop-color="#DF9E38"/>
          <stop offset="100%" stop-color="#B8791D"/>
        </radialGradient>
        <radialGradient id="clay-sand" cx="35%" cy="28%" r="70%">
          <stop offset="0%" stop-color="#F7EBDD"/>
          <stop offset="55%" stop-color="#E3C7A6"/>
          <stop offset="90%" stop-color="#C7A178"/>
          <stop offset="100%" stop-color="#A88057"/>
        </radialGradient>

        <!-- 莫蘭迪珊瑚紅/玫瑰漸層 -->
        <radialGradient id="clay-coral" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFCEC9"/>
          <stop offset="48%" stop-color="#EE857C"/>
          <stop offset="88%" stop-color="#D15B52"/>
          <stop offset="100%" stop-color="#AF4138"/>
        </radialGradient>

        <!-- 莫蘭迪薰衣草藍紫漸層 -->
        <radialGradient id="clay-blue" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#D7E3FF"/>
          <stop offset="50%" stop-color="#8DA8E8"/>
          <stop offset="88%" stop-color="#5E7AC4"/>
          <stop offset="100%" stop-color="#455FA3"/>
        </radialGradient>
        <radialGradient id="clay-purple" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#EAD8FF"/>
          <stop offset="50%" stop-color="#B18FE0"/>
          <stop offset="90%" stop-color="#8562B8"/>
          <stop offset="100%" stop-color="#694899"/>
        </radialGradient>

        <!-- 溫暖皮革棕漸層 -->
        <radialGradient id="clay-brown" cx="32%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#EBC2A6"/>
          <stop offset="50%" stop-color="#C88761"/>
          <stop offset="88%" stop-color="#9E5E3B"/>
          <stop offset="100%" stop-color="#7B4326"/>
        </radialGradient>

        <!-- 奶油白黏土漸層 -->
        <radialGradient id="clay-cream" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="60%" stop-color="#F5EDE2"/>
          <stop offset="100%" stop-color="#DACBB8"/>
        </radialGradient>
      </defs>
    </svg>
  `;

  const Icons = {
    /**
     * 登入頁大型 3D 黏土小豬撲滿與綠芽金幣
     */
    piggyHero() {
      return `
        <svg viewBox="0 0 220 200" class="clay-svg-hero" role="img" aria-label="3D黏土小豬撲滿">
          <!-- 底部柔和投影 -->
          <ellipse cx="110" cy="176" rx="68" ry="14" fill="#6E5A48" opacity="0.18"/>
          <g filter="url(#clay-shadow)">
            <!-- 後腳與前腳 -->
            <rect x="64" y="142" width="22" height="28" rx="11" fill="url(#clay-pink)"/>
            <rect x="132" y="142" width="22" height="28" rx="11" fill="url(#clay-pink)"/>
            <rect x="82" y="148" width="22" height="26" rx="11" fill="url(#clay-pink)"/>
            <rect x="114" y="148" width="22" height="26" rx="11" fill="url(#clay-pink)"/>
            <!-- 捲捲小尾巴 -->
            <path d="M168 112 C185 106, 188 124, 173 126 C182 132, 178 144, 165 138" fill="none" stroke="url(#clay-pink)" stroke-width="8" stroke-linecap="round"/>
            <!-- 左耳（後） -->
            <path d="M68 68 C54 44, 82 38, 92 60 Z" fill="url(#clay-pink)"/>
            <!-- 圓潤豬身體 -->
            <ellipse cx="112" cy="116" rx="62" ry="50" fill="url(#clay-pink)"/>
            <!-- 肚皮高光 -->
            <ellipse cx="96" cy="96" rx="34" ry="22" fill="#FFF5F7" opacity="0.38" transform="rotate(-12 96 96)"/>
            <!-- 右耳（前） -->
            <path d="M124 66 C130 40, 158 46, 148 74 Z" fill="url(#clay-pink)"/>
            <!-- 存錢孔與投入的金幣 -->
            <rect x="92" y="66" width="38" height="8" rx="4" fill="#7D4952"/>
            <circle cx="104" cy="56" r="16" fill="url(#clay-gold)"/>
            <circle cx="104" cy="56" r="11" fill="none" stroke="#FFF3C4" stroke-width="2" opacity="0.7"/>
            <text x="104" y="61" text-anchor="middle" font-size="13" font-weight="800" fill="#8C5811">$</text>
            <!-- 頭頂嫩綠雙葉芽 -->
            <path d="M122 66 C122 45, 126 34, 126 26" fill="none" stroke="url(#clay-green)" stroke-width="6" stroke-linecap="round"/>
            <path d="M125 32 C102 18, 94 38, 123 42 Z" fill="url(#clay-green)"/>
            <path d="M126 28 C148 12, 160 34, 127 40 Z" fill="url(#clay-green)"/>
            <!-- 圓潤豬鼻子 -->
            <ellipse cx="62" cy="116" rx="20" ry="15" fill="url(#clay-pink-snout)"/>
            <ellipse cx="56" cy="116" rx="3.8" ry="5.5" fill="#7D424C"/>
            <ellipse cx="67" cy="116" rx="3.8" ry="5.5" fill="#7D424C"/>
            <!-- 眼睛與腮紅 -->
            <circle cx="80" cy="96" r="5.5" fill="#4A3531"/>
            <circle cx="78.5" cy="94" r="2" fill="#FFFFFF"/>
            <ellipse cx="86" cy="112" rx="8" ry="5" fill="#EE7B8B" opacity="0.55"/>
          </g>
        </svg>
      `;
    },

    /**
     * 頂部導覽列／側欄 Logo：金幣發芽 3D 黏土圖示
     */
    sproutCoinLogo() {
      return `
        <svg viewBox="0 0 64 64" class="clay-svg-icon" role="img" aria-label="金幣嫩芽圖示">
          <g filter="url(#clay-shadow-sm)">
            <!-- 莖 -->
            <path d="M32 38 C32 26, 32 18, 32 13" fill="none" stroke="url(#clay-green)" stroke-width="5" stroke-linecap="round"/>
            <!-- 左葉 -->
            <path d="M31 22 C14 10, 8 28, 30 30 Z" fill="url(#clay-green)"/>
            <!-- 右葉 -->
            <path d="M33 18 C50 6, 56 24, 34 27 Z" fill="url(#clay-green)"/>
            <!-- 底部雙金幣與錢袋底座 -->
            <ellipse cx="32" cy="46" rx="16" ry="12" fill="url(#clay-sand)"/>
            <circle cx="24" cy="48" r="10" fill="url(#clay-gold)"/>
            <circle cx="38" cy="49" r="9" fill="url(#clay-gold)"/>
            <text x="24" y="52" text-anchor="middle" font-size="10" font-weight="800" fill="#8C5811">$</text>
          </g>
        </svg>
      `;
    },

    /**
     * 統計卡 1：在庫總成本 (錢袋金幣發芽 3D 黏土圖示)
     */
    costSproutBag() {
      return `
        <svg viewBox="0 0 80 80" class="clay-svg-stat" role="img" aria-label="在庫總成本圖示">
          <ellipse cx="42" cy="70" rx="26" ry="6" fill="#4E6B5B" opacity="0.16"/>
          <g filter="url(#clay-shadow-sm)">
            <!-- 嫩芽 -->
            <path d="M44 34 L44 15" stroke="url(#clay-green)" stroke-width="5" stroke-linecap="round"/>
            <path d="M43 22 C24 10, 20 28, 42 30 Z" fill="url(#clay-green)"/>
            <path d="M45 19 C64 8, 68 26, 46 28 Z" fill="url(#clay-green)"/>
            <!-- 錢袋本體 -->
            <path d="M26 42 C20 52, 22 66, 44 66 C66 66, 68 52, 60 42 C55 35, 31 35, 26 42 Z" fill="url(#clay-sand)"/>
            <rect x="33" y="34" width="22" height="6" rx="3" fill="url(#clay-brown)"/>
            <text x="45" y="57" text-anchor="middle" font-size="16" font-weight="800" fill="#8C6239">$</text>
            <!-- 前方堆疊金幣 -->
            <circle cx="24" cy="58" r="11" fill="url(#clay-gold)"/>
            <circle cx="24" cy="58" r="7.5" fill="none" stroke="#FFF4C8" stroke-width="1.5" opacity="0.75"/>
            <text x="24" y="62" text-anchor="middle" font-size="10" font-weight="800" fill="#8C5811">$</text>
          </g>
        </svg>
      `;
    },

    /**
     * 統計卡 2：未實現損益 (3D 黏土上揚折線與柱狀圖)
     */
    risingChart() {
      return `
        <svg viewBox="0 0 80 80" class="clay-svg-stat" role="img" aria-label="未實現損益圖示">
          <ellipse cx="42" cy="70" rx="26" ry="6" fill="#7D4B47" opacity="0.15"/>
          <g filter="url(#clay-shadow-sm)">
            <!-- 三根圓角立體柱 -->
            <rect x="16" y="46" width="12" height="20" rx="6" fill="url(#clay-pink)"/>
            <rect x="34" y="36" width="12" height="30" rx="6" fill="url(#clay-coral)"/>
            <rect x="52" y="24" width="12" height="42" rx="6" fill="url(#clay-coral)"/>
            <!-- 立體上揚箭頭曲線 -->
            <path d="M16 36 C28 34, 40 24, 58 12" fill="none" stroke="url(#clay-coral)" stroke-width="6" stroke-linecap="round"/>
            <path d="M47 11 L60 10 L58 23" fill="none" stroke="url(#clay-coral)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </svg>
      `;
    },

    /**
     * 統計卡 3：今年已實現損益 (3D 黏土飽滿金錢袋)
     */
    moneyBag() {
      return `
        <svg viewBox="0 0 80 80" class="clay-svg-stat" role="img" aria-label="已實現損益錢袋">
          <ellipse cx="40" cy="70" rx="24" ry="6" fill="#705B35" opacity="0.16"/>
          <g filter="url(#clay-shadow-sm)">
            <!-- 袋口荷葉邊 -->
            <path d="M27 20 C30 14, 50 14, 53 20 L48 28 L32 28 Z" fill="url(#clay-sand)"/>
            <!-- 袋身 -->
            <path d="M22 38 C14 54, 20 67, 40 67 C60 67, 66 54, 58 38 C53 28, 27 28, 22 38 Z" fill="url(#clay-sand)"/>
            <!-- 綠色束口繩 -->
            <rect x="28" y="25" width="24" height="6" rx="3" fill="url(#clay-green)"/>
            <!-- 金色 $ 標誌 -->
            <circle cx="40" cy="49" r="12" fill="url(#clay-gold)" opacity="0.9"/>
            <text x="40" y="54" text-anchor="middle" font-size="15" font-weight="900" fill="#7B4E12">$</text>
          </g>
        </svg>
      `;
    },

    /**
     * 統計卡 4：累計稅費 (3D 黏土圓角計算機)
     */
    calculator() {
      return `
        <svg viewBox="0 0 80 80" class="clay-svg-stat" role="img" aria-label="累計稅費計算機">
          <ellipse cx="40" cy="71" rx="22" ry="5.5" fill="#3F4E70" opacity="0.16"/>
          <g filter="url(#clay-shadow-sm)">
            <!-- 機身 -->
            <rect x="18" y="12" width="44" height="56" rx="12" fill="url(#clay-blue)"/>
            <!-- 螢幕 -->
            <rect x="24" y="19" width="32" height="13" rx="5" fill="url(#clay-gold)"/>
            <!-- 圓粒按鍵 -->
            <circle cx="28" cy="41" r="4" fill="url(#clay-cream)"/>
            <circle cx="40" cy="41" r="4" fill="url(#clay-cream)"/>
            <circle cx="52" cy="41" r="4" fill="url(#clay-coral)"/>
            <circle cx="28" cy="51" r="4" fill="url(#clay-cream)"/>
            <circle cx="40" cy="51" r="4" fill="url(#clay-cream)"/>
            <circle cx="52" cy="51" r="4" fill="url(#clay-mint)"/>
            <circle cx="28" cy="60" r="3.5" fill="url(#clay-cream)"/>
            <rect x="36" y="56.5" width="19" height="7" rx="3.5" fill="url(#clay-gold)"/>
          </g>
        </svg>
      `;
    },

    /**
     * 快捷卡 1：新增交易 (3D 黏土筆記本與鉛筆)
     */
    notepadPencil() {
      return `
        <svg viewBox="0 0 76 76" class="clay-svg-action" role="img" aria-label="新增交易">
          <g filter="url(#clay-shadow-sm)">
            <rect x="14" y="14" width="42" height="48" rx="9" fill="url(#clay-cream)"/>
            <rect x="14" y="14" width="42" height="11" rx="6" fill="url(#clay-sand)"/>
            <line x1="23" y1="33" x2="46" y2="33" stroke="#C5B4A0" stroke-width="3.5" stroke-linecap="round"/>
            <line x1="23" y1="42" x2="42" y2="42" stroke="#C5B4A0" stroke-width="3.5" stroke-linecap="round"/>
            <line x1="23" y1="51" x2="36" y2="51" stroke="#C5B4A0" stroke-width="3.5" stroke-linecap="round"/>
            <!-- 3D 黏土斜握鉛筆 -->
            <g transform="translate(46, 36) rotate(35)">
              <rect x="-5" y="-18" width="10" height="28" rx="4" fill="url(#clay-coral)"/>
              <rect x="-5" y="-22" width="10" height="6" rx="2.5" fill="url(#clay-gold)"/>
              <polygon points="-5,10 5,10 0,19" fill="url(#clay-sand)"/>
              <polygon points="-2,15 2,15 0,19" fill="#5A4638"/>
            </g>
          </g>
        </svg>
      `;
    },

    /**
     * 快捷卡 2：持倉總覽 (3D 黏土藍紫立體長條圖)
     */
    holdingsBars() {
      return `
        <svg viewBox="0 0 76 76" class="clay-svg-action" role="img" aria-label="持倉總覽">
          <g filter="url(#clay-shadow-sm)">
            <rect x="14" y="42" width="12" height="20" rx="6" fill="url(#clay-blue)"/>
            <rect x="32" y="28" width="12" height="34" rx="6" fill="url(#clay-blue)"/>
            <rect x="50" y="16" width="12" height="46" rx="6" fill="url(#clay-purple)"/>
          </g>
        </svg>
      `;
    },

    /**
     * 快捷卡 3：損益報表 (3D 黏土立體圓餅圖)
     */
    pieChart() {
      return `
        <svg viewBox="0 0 76 76" class="clay-svg-action" role="img" aria-label="損益報表">
          <g filter="url(#clay-shadow-sm)">
            <!-- 左下半圓扇形 -->
            <path d="M36 38 L36 62 A24 24 0 1 1 60 38 Z" fill="url(#clay-green)"/>
            <!-- 右上分離扇形 -->
            <path d="M40 34 L40 12 A22 22 0 0 1 62 34 Z" fill="url(#clay-coral)"/>
            <!-- 右下扇形 -->
            <path d="M39 40 L61 40 A22 22 0 0 1 39 62 Z" fill="url(#clay-gold)"/>
          </g>
        </svg>
      `;
    },

    /**
     * 快捷卡 4：帳戶管理 (3D 黏土皮革錢包)
     */
    wallet() {
      return `
        <svg viewBox="0 0 76 76" class="clay-svg-action" role="img" aria-label="帳戶管理">
          <g filter="url(#clay-shadow-sm)">
            <!-- 露出的鈔票與卡片 -->
            <rect x="20" y="16" width="34" height="14" rx="4" fill="url(#clay-green)" transform="rotate(-6 36 22)"/>
            <!-- 錢包主體 -->
            <rect x="14" y="24" width="48" height="36" rx="10" fill="url(#clay-brown)"/>
            <!-- 錢包扣帶 -->
            <rect x="44" y="36" width="20" height="12" rx="6" fill="url(#clay-sand)"/>
            <circle cx="50" cy="42" r="3.2" fill="#7B4326"/>
          </g>
        </svg>
      `;
    },

    /**
     * 登入頁底部 3D 黏土盾牌徽章
     */
    shield(variant = 'green') {
      const gradMap = {
        green: 'url(#clay-mint)',
        gold: 'url(#clay-gold)',
        blue: 'url(#clay-blue)',
      };
      const fill = gradMap[variant] || gradMap.green;
      return `
        <svg viewBox="0 0 56 56" class="clay-svg-shield" role="img" aria-hidden="true">
          <g filter="url(#clay-shadow-sm)">
            <path d="M28 6 L46 13 V27 C46 39 37 47 28 51 C19 47 10 39 10 27 V13 Z" fill="${fill}"/>
            <path d="M22 28 L26.5 32.5 L35 23" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </svg>
      `;
    },

    /**
     * 帳戶管理頁：四色 3D 黏土存摺／資料夾圖示
     */
    accountBadge(index = 0) {
      const grads = ['url(#clay-mint)', 'url(#clay-coral)', 'url(#clay-blue)', 'url(#clay-gold)'];
      const grad = grads[index % grads.length];
      return `
        <svg viewBox="0 0 56 56" class="clay-svg-acc" role="img" aria-hidden="true">
          <g filter="url(#clay-shadow-sm)">
            <rect x="8" y="12" width="40" height="32" rx="9" fill="${grad}"/>
            <rect x="15" y="20" width="26" height="16" rx="4" fill="url(#clay-cream)" opacity="0.9"/>
            <line x1="20" y1="26" x2="35" y2="26" stroke="#8C7A6B" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="20" y1="31" x2="30" y2="31" stroke="#8C7A6B" stroke-width="2.5" stroke-linecap="round"/>
          </g>
        </svg>
      `;
    },
  };

  root.ClayIcons = {
    SharedDefs,
    ...Icons,
  };
})(typeof self !== 'undefined' ? self : this);
