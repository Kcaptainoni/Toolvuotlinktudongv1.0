// ==UserScript==
// @name         Auto Tools Hub (link4m)
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Fix nút menu + link4m nhiều tab
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Nếu đã có nút rồi thì thôi
    if (document.getElementById('as-btn')) return;

    const config = {
        scrollAmount: 70,
        scrollDelay: 1100,
    };

    let isScrolling = false;
    let scrollTimer = null;
    let scrollDir = -1;

    // ====================== SCROLL ======================
    function scrollStep() {
        if (!isScrolling) return;
        window.scrollBy({ top: config.scrollAmount * scrollDir, behavior: 'smooth' });
        scrollDir *= -1;
        scrollTimer = setTimeout(scrollStep, config.scrollDelay);
    }
    function startScroll() {
        if (isScrolling) return;
        isScrolling = true;
        scrollDir = -1;
        scrollStep();
        updateSwitch();
    }
    function stopScroll() {
        isScrolling = false;
        clearTimeout(scrollTimer);
        updateSwitch();
    }
    function toggleScroll() {
        isScrolling ? stopScroll() : startScroll();
    }
    function updateSwitch() {
        const sw = document.getElementById('as-sw');
        if (sw) sw.className = 'as-switch' + (isScrolling ? ' on' : '');
    }

    // ====================== KEEP ALIVE ======================
    try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    } catch (e) {}

    // ====================== GOOGLE SEARCH ======================
    function similarity(a, b) {
        a = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        b = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!a || !b) return 0;
        if (a.includes(b) || b.includes(a)) return 0.92;
        let longer = a.length > b.length ? a : b;
        let shorter = a.length > b.length ? b : a;
        let m = 0;
        for (let c of shorter) if (longer.includes(c)) m++;
        return m / longer.length;
    }

    function getDomain(url) {
        try {
            return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
        } catch {
            return (url || '').replace(/^www\./, '').split('/')[0];
        }
    }

    function startSmartSearch(keyword, domain) {
        if (!keyword) return alert('Nhập từ khóa trước!');
        localStorage.setItem('as_original_url', location.href);
        localStorage.setItem('as_smart_keyword', keyword);
        localStorage.setItem('as_smart_domain', domain || '');
        localStorage.setItem('as_smart_time', Date.now());
        window.open('https://www.google.com/search?q=' + encodeURIComponent(keyword) + '&hl=vi', '_blank');
    }

    // Tự click kết quả Google
    if (location.hostname.includes('google.') && location.pathname.includes('/search')) {
        const keyword = localStorage.getItem('as_smart_keyword');
        const suggested = localStorage.getItem('as_smart_domain') || '';
        const time = +localStorage.getItem('as_smart_time') || 0;

        if (keyword && Date.now() - time < 90000) {
            setTimeout(() => {
                let best = null, bestScore = -1;
                document.querySelectorAll('a').forEach(a => {
                    let href = a.href;
                    if (!href || href.includes('google.') || href.includes('webcache') || href.includes('accounts.google')) return;
                    let real = href;
                    try {
                        const u = new URL(href);
                        if (u.pathname === '/url' && u.searchParams.get('q')) real = u.searchParams.get('q');
                    } catch {}
                    const domain = getDomain(real);
                    if (!domain || domain.length < 4) return;
                    const score = suggested ? similarity(domain, suggested) : 0.5;
                    if (score > bestScore) {
                        bestScore = score;
                        best = a;
                    }
                });
                if (best && bestScore > 0.28) {
                    localStorage.removeItem('as_smart_keyword');
                    localStorage.removeItem('as_smart_domain');
                    localStorage.removeItem('as_smart_time');
                    best.click();
                }
            }, 1500);
        }
    }

    // ====================== DÁN MÃ ======================
    function fillCode(code) {
        const input = document.querySelector('input[name="password"].password') ||
                      document.querySelector('input.password[placeholder*="Nhập mã"]') ||
                      document.querySelector('input[name="password"][maxlength="6"]') ||
                      document.querySelector('input[name="password"]');
        if (!input) return false;
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        return true;
    }

    function submitCode(code) {
        code = (code || '').trim();
        if (!code) return alert('Chưa nhập mã!');
        const original = localStorage.getItem('as_original_url');
        if (original && original !== location.href) {
            localStorage.setItem('as_pending_code', code);
            location.href = original;
        } else {
            if (!fillCode(code)) alert('Không tìm thấy ô nhập mã trên trang này!');
        }
    }

    // Tự dán mã khi quay về trang đầu
    const pending = localStorage.getItem('as_pending_code');
    if (pending) {
        setTimeout(() => {
            if (fillCode(pending)) localStorage.removeItem('as_pending_code');
        }, 800);
    }

    // ====================== TẠO MENU ======================
    const style = document.createElement('style');
    style.textContent = `
        #as-btn {
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            width: 52px !important;
            height: 52px !important;
            background: linear-gradient(135deg, #1a73e8, #0d47a1) !important;
            color: white !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 24px !important;
            z-index: 2147483647 !important;
            box-shadow: 0 4px 16px rgba(0,0,0,0.45) !important;
            cursor: pointer !important;
            user-select: none !important;
        }
        #as-panel {
            position: fixed !important;
            bottom: 85px !important;
            right: 12px !important;
            width: 300px !important;
            max-width: 94vw !important;
            background: #1c1c1c !important;
            color: #fff !important;
            border-radius: 14px !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 13.5px !important;
            display: none;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            overflow: hidden !important;
        }
        .as-header {
            background: #111 !important;
            padding: 12px 14px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            font-weight: 700 !important;
            cursor: move !important;
        }
        .as-tabs {
            display: flex !important;
            background: #111 !important;
            overflow-x: auto !important;
        }
        .as-tabs div {
            flex: 1 !important;
            text-align: center !important;
            padding: 9px 4px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            color: #888 !important;
            cursor: pointer !important;
        }
        .as-tabs div.active {
            color: #fff !important;
            background: #1c1c1c !important;
            border-bottom: 2px solid #1a73e8 !important;
        }
        .as-body { padding: 12px 14px 16px !important; }
        .as-tool-btn {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 13px 14px !important;
            border-bottom: 1px solid #2a2a2a !important;
            cursor: pointer !important;
        }
        .as-switch {
            width: 42px !important;
            height: 24px !important;
            background: #444 !important;
            border-radius: 12px !important;
            position: relative !important;
            cursor: pointer !important;
        }
        .as-switch::after {
            content: '' !important;
            position: absolute !important;
            width: 20px !important;
            height: 20px !important;
            background: #fff !important;
            border-radius: 50% !important;
            top: 2px !important;
            left: 2px !important;
            transition: 0.2s !important;
        }
        .as-switch.on { background: #1a73e8 !important; }
        .as-switch.on::after { transform: translateX(18px) !important; }
        #as-panel input {
            width: 100% !important;
            box-sizing: border-box !important;
            background: #2a2a2a !important;
            border: 1px solid #444 !important;
            color: #fff !important;
            border-radius: 8px !important;
            padding: 9px 11px !important;
            margin: 5px 0 10px !important;
            font-size: 14px !important;
        }
        .as-btn-main {
            width: 100% !important;
            background: #1a73e8 !important;
            color: #fff !important;
            border: none !important;
            border-radius: 8px !important;
            padding: 11px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
        }
        .as-btn-green { background: #16a34a !important; }
        .back-btn {
            background: none !important;
            border: none !important;
            color: #1a73e8 !important;
            font-size: 13px !important;
            cursor: pointer !important;
            margin-bottom: 10px !important;
            padding: 0 !important;
        }
    `;
    document.head.appendChild(style);

    // Nút mở menu
    const btn = document.createElement('div');
    btn.id = 'as-btn';
    btn.innerHTML = '⚙️';
    btn.title = 'Mở menu';
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'as-panel';
    panel.innerHTML = `
        <div id="panel-main">
            <div class="as-header">
                <span>Auto Tools Hub</span>
                <span style="cursor:pointer;opacity:.7;font-size:17px" id="as-close">✕</span>
            </div>
            <div class="as-tool-btn" id="btn-link4m">
                <div style="font-size:18px;width:26px;text-align:center">🔗</div>
                <div>
                    <div style="font-weight:600">link4m</div>
                    <div style="font-size:12px;color:#888">Cuộn + Tìm link + Dán mã</div>
                </div>
            </div>
            <div class="as-tool-btn" style="opacity:.4;cursor:not-allowed">
                <div style="font-size:18px;width:26px;text-align:center">🚧</div>
                <div>
                    <div style="font-weight:600">Tool 2</div>
                    <div style="font-size:12px;color:#888">Đang phát triển...</div>
                </div>
            </div>
        </div>

        <div id="panel-link4m" style="display:none">
            <div class="as-header" id="drag-handle">
                <span>link4m</span>
                <span style="cursor:pointer;opacity:.7;font-size:17px" id="as-close2">✕</span>
            </div>
            <div class="as-tabs" id="link4m-tabs">
                <div data-tab="scroll" class="active">Cuộn</div>
                <div data-tab="search">Tìm link</div>
                <div data-tab="direct">Truy cập</div>
                <div data-tab="code">Nhập mã</div>
            </div>
            <div class="as-body">
                <button class="back-btn" id="btn-back">← Menu chính</button>

                <div id="tab-scroll">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                        <span>🔄 Tự cuộn</span>
                        <div id="as-sw" class="as-switch"></div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#aaa">
                        <span>Pixel</span>
                        <input id="as-amount" type="number" value="70" style="width:70px;margin:0">
                        <span>Delay</span>
                        <input id="as-delay" type="number" value="1100" style="width:75px;margin:0">
                    </div>
                </div>

                <div id="tab-search" style="display:none">
                    <div style="font-size:12px;color:#aaa">Từ khóa</div>
                    <input id="as-keyword" placeholder="Nhập từ khóa...">
                    <div style="font-size:12px;color:#aaa">Domain gợi ý</div>
                    <input id="as-domain" placeholder="exam****.com">
                    <button class="as-btn-main" id="as-search-btn">Tìm Google (tab mới)</button>
                </div>

                <div id="tab-direct" style="display:none">
                    <div style="font-size:12px;color:#aaa">Dán link</div>
                    <input id="as-direct-link" placeholder="https://...">
                    <button class="as-btn-main" id="as-direct-btn">Mở tab mới</button>
                </div>

                <div id="tab-code" style="display:none">
                    <div style="font-size:12px;color:#aaa">Dán mã vừa lấy</div>
                    <input id="as-code" placeholder="Nhập mã..." maxlength="10">
                    <button class="as-btn-main as-btn-green" id="as-paste-btn">Quay lại trang đầu + Dán mã</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Sự kiện
    btn.onclick = () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('as-close').onclick = () => panel.style.display = 'none';
    document.getElementById('as-close2').onclick = () => panel.style.display = 'none';

    document.getElementById('btn-link4m').onclick = () => {
        document.getElementById('panel-main').style.display = 'none';
        document.getElementById('panel-link4m').style.display = 'block';
    };
    document.getElementById('btn-back').onclick = () => {
        document.getElementById('panel-link4m').style.display = 'none';
        document.getElementById('panel-main').style.display = 'block';
    };

    // Tab
    document.querySelectorAll('#link4m-tabs div').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('#link4m-tabs div').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            ['scroll', 'search', 'direct', 'code'].forEach(name => {
                document.getElementById('tab-' + name).style.display = (tab.dataset.tab === name) ? 'block' : 'none';
            });
        };
    });

    // Chức năng
    document.getElementById('as-sw').onclick = toggleScroll;
    document.getElementById('as-amount').onchange = e => config.scrollAmount = +e.target.value || 70;
    document.getElementById('as-delay').onchange = e => config.scrollDelay = +e.target.value || 1100;

    document.getElementById('as-search-btn').onclick = () => {
        startSmartSearch(
            document.getElementById('as-keyword').value.trim(),
            document.getElementById('as-domain').value.trim()
        );
    };

    document.getElementById('as-direct-btn').onclick = () => {
        let link = document.getElementById('as-direct-link').value.trim();
        if (!link) return alert('Dán link trước!');
        localStorage.setItem('as_original_url', location.href);
        if (!link.startsWith('http')) link = 'https://' + link;
        window.open(link, '_blank');
    };

    document.getElementById('as-paste-btn').onclick = () => {
        submitCode(document.getElementById('as-code').value);
    };

    // Kéo thả đơn giản
    (function makeDrag(el, handle) {
        let ox, oy, dragging = false;
        handle = handle || el;
        handle.style.cursor = 'move';

        const start = (x, y) => {
            dragging = true;
            const r = el.getBoundingClientRect();
            ox = x - r.left;
            oy = y - r.top;
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        };
        const move = (x, y) => {
            if (!dragging) return;
            el.style.left = (x - ox) + 'px';
            el.style.top = (y - oy) + 'px';
        };
        const end = () => dragging = false;

        handle.addEventListener('mousedown', e => {
            if (e.target.closest('input,button,.as-switch')) return;
            e.preventDefault();
            start(e.clientX, e.clientY);
        });
        document.addEventListener('mousemove', e => move(e.clientX, e.clientY));
        document.addEventListener('mouseup', end);

        handle.addEventListener('touchstart', e => {
            if (e.target.closest('input,button,.as-switch')) return;
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        }, {passive:true});
        document.addEventListener('touchmove', e => {
            if (!dragging) return;
            const t = e.touches[0];
            move(t.clientX, t.clientY);
        }, {passive:true});
        document.addEventListener('touchend', end);
    })(panel, document.getElementById('drag-handle'));

    console.log('[Auto Tools] Đã tải xong - nút ⚙️ ở góc dưới bên phải');
})();