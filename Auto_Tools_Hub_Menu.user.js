// ==UserScript==
// @name         Auto Tools Hub — Menu
// @namespace    http://tampermonkey.net/
// @version      7.1.0-menu
// @description  Menu đơn giản: chọn link4m / gtrafic / site2s (cài 3 script riêng)
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  try {
    if (window !== window.top && /recaptcha|google\./i.test(location.hostname + location.href)) return;
  } catch (e) {}

  function ensure() {
    if (document.getElementById('as-simple-hub') || !document.body) return;
    const st = document.createElement('style');
    st.id = 'as-simple-hub-css';
    st.textContent = `
#as-simple-hub{position:fixed;z-index:2147483647;bottom:max(14px,env(safe-area-inset-bottom));right:12px;
width:48px;height:48px;border-radius:14px;background:#111;color:#fff;display:flex;align-items:center;
justify-content:center;font-size:20px;cursor:pointer;border:1px solid #333;box-shadow:0 6px 20px rgba(0,0,0,.4)}
#as-simple-panel{position:fixed;z-index:2147483647;left:12px;right:12px;bottom:70px;max-width:360px;margin:0 auto;
background:#111;color:#eee;border-radius:14px;padding:14px;display:none;border:1px solid #333;
font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
#as-simple-panel h2{margin:0 0 10px;font-size:15px}
#as-simple-panel .row{padding:12px;margin:0 0 8px;background:#1a1a1a;border-radius:10px;cursor:pointer;border:1px solid #2a2a2a}
#as-simple-panel .row:active{background:#222}
#as-simple-panel .row b{display:block;margin-bottom:2px}
#as-simple-panel .row span{color:#888;font-size:11px}
#as-simple-panel .note{font-size:11px;color:#666;line-height:1.4;margin-top:8px}
`;
    document.documentElement.appendChild(st);

    const btn = document.createElement('div');
    btn.id = 'as-simple-hub';
    btn.textContent = '☰';
    btn.title = 'Auto Tools';

    const panel = document.createElement('div');
    panel.id = 'as-simple-panel';
    panel.innerHTML = `
<h2>Auto Tools <span style="float:right;cursor:pointer;opacity:.6" id="as-sp-x">✕</span></h2>
<div class="row" data-tip="link4m"><b>🔗 link4m</b><span>Cuộn · Tìm link · Lấy mã · Dán mã — script riêng</span></div>
<div class="row" data-tip="gtrafic"><b>⚡ gtrafic</b><span>Giống link4m, nút trade-btn — script riêng</span></div>
<div class="row" data-tip="site2s"><b>🌐 site2s</b><span>Tìm link: từ khóa + domain → Google — script riêng</span></div>
<div class="note">Cài <b>3 script tool riêng</b> + menu này. Mỗi tool có nút ⚙️ riêng.<br>
link4m v6.90 đã chặn domain google.com. site2s chỉ tìm link.</div>`;
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.onclick = (e) => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    };
    document.getElementById('as-sp-x').onclick = () => { panel.style.display = 'none'; };
    panel.querySelectorAll('.row').forEach(row => {
      row.onclick = () => {
        const t = row.getAttribute('data-tip');
        alert(
          t === 'link4m' ? 'Mở nút ⚙️ của script link4m trên trang.' :
          t === 'gtrafic' ? 'Mở nút ⚙️ của script gtrafic trên trang.' :
          'Mở nút ⚙️ của script site2s (2s) trên trang.'
        );
        panel.style.display = 'none';
      };
    });
  }

  if (document.body) ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
  setTimeout(ensure, 1200);
})();
