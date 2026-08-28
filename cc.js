// ==UserScript==
// @name         Auto Tools Hub (link4m + gtrafic + layma)
// @namespace    http://tampermonkey.net/
// @version      6.61
// @description  link4m + gtrafic + layma — fix chạm/cuộn, hết đơ khi có mã, menu hiện lại trên link4m
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      api.pateway.ai
// @connect      pateway.ai
// @connect      www.google.com
// @connect      google.com
// @connect      *
// @run-at       document-start
// @all_frames   true
// ==/UserScript==

(function () {
    'use strict';

    // ---- reCAPTCHA frame ----
    (function autoTickRecaptchaFrame() {
        try {
            const href = location.href || '';
            const host = location.hostname || '';
            if (!/google\.[^/]+$/i.test(host) && !host.includes('recaptcha')) return;
            if (!/recaptcha|anchor/i.test(href) && !document.querySelector('.recaptcha-checkbox')) return;
            const clickBox = () => {
                const sels = ['#recaptcha-anchor', '.recaptcha-checkbox', '.recaptcha-checkbox-border', 'span[role="checkbox"]'];
                for (const s of sels) {
                    const el = document.querySelector(s);
                    if (!el) continue;
                    const checked = el.getAttribute('aria-checked') === 'true' || (el.className && String(el.className).includes('checked'));
                    if (checked) return true;
                    try { el.click(); return true; } catch (e) {}
                }
                return false;
            };
            const should = () => { try { return !!GM_getValue('as_need_captcha_click', false); } catch (e) { return false; } };
            const run = () => { if (should() && clickBox()) try { GM_setValue('as_need_captcha_click', false); } catch (e) {} };
            setTimeout(run, 400); setTimeout(run, 1200); setTimeout(run, 2500);
            try {
                const obs = new MutationObserver(run);
                obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
                setTimeout(() => obs.disconnect(), 15000);
            } catch (e) {}
        } catch (e) {}
    })();

    try {
        if (window !== window.top && /recaptcha|google\./i.test(location.hostname + location.href)) return;
    } catch (e) {}

    (function injectPageHook() {
        const code = function () {
            if (window.__asHooked) return;
            window.__asHooked = true;
            const store = new WeakMap();
            const orig = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, fn, opts) {
                try {
                    if ((type === 'click' || type === 'touchstart' || type === 'mousedown' || type === 'pointerdown') && typeof fn === 'function') {
                        let arr = store.get(this);
                        if (!arr) { arr = []; store.set(this, arr); }
                        arr.push({ type, fn });
                    }
                } catch (e) {}
                return orig.call(this, type, fn, opts);
            };
            window.__asInvokeHandlers = function (el, types) {
                if (!el) return false;
                let ok = false;
                const list = types || ['touchstart', 'click', 'mousedown', 'pointerdown'];
                const fake = { type: 'click', target: el, currentTarget: el, srcElement: el, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, isTrusted: true, bubbles: true, cancelable: true, clientX: 0, clientY: 0, touches: [], changedTouches: [] };
                try {
                    const r = el.getBoundingClientRect();
                    fake.clientX = r.left + r.width / 2;
                    fake.clientY = r.top + r.height / 2;
                } catch (e) {}
                const tryEl = (node) => {
                    if (!node) return;
                    const arr = store.get(node) || [];
                    for (let i = 0; i < arr.length; i++) {
                        if (list.indexOf(arr[i].type) === -1) continue;
                        try { fake.type = arr[i].type; arr[i].fn.call(node, fake); ok = true; } catch (e) {}
                    }
                    if (typeof node.onclick === 'function') try { node.onclick(fake); ok = true; } catch (e) {}
                };
                tryEl(el);
                try { el.querySelectorAll('*').forEach(tryEl); } catch (e) {}
                try { let p = el.parentElement, d = 0; while (p && d < 5) { tryEl(p); p = p.parentElement; d++; } } catch (e) {}
                return ok;
            };
        };
        try {
            const s = document.createElement('script');
            s.textContent = '(' + code.toString() + ')();';
            (document.documentElement || document.head).appendChild(s);
            s.remove();
        } catch (e) {}
    })();

    const config = { scrollAmount: 70, scrollDelay: 1100, countdownScrollAmount: 45, countdownScrollDelay: 900 };
    let isScrolling = false, scrollTimer = null, scrollDir = -1, countdownScrollMode = false, scrollLocked = false;
    let autoLayMaEnabled = true, autoLayMaBusy = false, autoDanMaEnabled = true, autoDanMaBusy = false, autoWhatOnEnabled = true, lastAutoDanCode = '';
    const CFG_KEY = 'as_user_config_v1';

    try {
        if (GM_getValue('as_scroll_lock', false) || GM_getValue('as_stop_scroll', false) || GM_getValue('as_pending_code', '')) scrollLocked = true;
    } catch (e) {}

    function loadUserConfig() {
        try {
            const raw = GM_getValue(CFG_KEY, null);
            if (!raw) return;
            const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof o.scrollAmount === 'number') config.scrollAmount = o.scrollAmount;
            if (typeof o.scrollDelay === 'number') config.scrollDelay = o.scrollDelay;
            if (typeof o.autoLayMaEnabled === 'boolean') autoLayMaEnabled = o.autoLayMaEnabled;
            if (typeof o.autoDanMaEnabled === 'boolean') autoDanMaEnabled = o.autoDanMaEnabled;
            if (typeof o.autoWhatOnEnabled === 'boolean') autoWhatOnEnabled = o.autoWhatOnEnabled;
        } catch (e) {}
    }
    function saveUserConfig() {
        try {
            GM_setValue(CFG_KEY, { scrollAmount: config.scrollAmount, scrollDelay: config.scrollDelay, autoLayMaEnabled, autoDanMaEnabled, autoWhatOnEnabled, savedAt: Date.now() });
        } catch (e) {}
    }
    loadUserConfig();

    function isLink4mHost() { return /link4m\./i.test(location.hostname || ''); }
    function isGtraficHost() { return /gtraffic\.|gtrafic\./i.test(location.hostname || ''); }
    function isLaymaHost() { return /layma\.net/i.test(location.hostname || ''); }
    function isOriginFormHost() { return isLink4mHost() || isGtraficHost() || isLaymaHost(); }

    function isScrollBlocked() {
        if (scrollLocked) return true;
        try {
            if (GM_getValue('as_scroll_lock', false) || GM_getValue('as_stop_scroll', false) || GM_getValue('as_pending_code', '')) return true;
        } catch (e) {}
        return false;
    }

    function stopScroll() { isScrolling = false; countdownScrollMode = false; clearTimeout(scrollTimer); updateSwitch(); }
    function lockScroll(reason) {
        scrollLocked = true;
        try { GM_setValue('as_scroll_lock', true); GM_setValue('as_stop_scroll', true); } catch (e) {}
        stopScroll();
    }
    function unlockScroll() {
        scrollLocked = false;
        try { GM_deleteValue('as_scroll_lock'); GM_deleteValue('as_stop_scroll'); } catch (e) {}
    }
    function scrollStep() {
        if (!isScrolling || isScrollBlocked()) { stopScroll(); return; }
        if (countdownScrollMode) {
            const y = window.scrollY || 0;
            window.scrollBy({ top: y <= 8 ? 140 : -config.countdownScrollAmount, behavior: 'smooth' });
            scrollTimer = setTimeout(scrollStep, config.countdownScrollDelay);
            return;
        }
        window.scrollBy({ top: config.scrollAmount * scrollDir, behavior: 'smooth' });
        scrollDir *= -1;
        scrollTimer = setTimeout(scrollStep, config.scrollDelay);
    }
    function startScroll(opts) {
        if (isScrollBlocked() || isOriginFormHost()) { stopScroll(); return; }
        if (opts && opts.countdown) countdownScrollMode = true;
        if (isScrolling) { updateSwitch(); return; }
        isScrolling = true;
        if (!countdownScrollMode) scrollDir = -1;
        clearTimeout(scrollTimer);
        scrollStep();
        updateSwitch();
    }
    function toggleScroll() {
        if (isScrolling) { stopScroll(); return; }
        unlockScroll(); countdownScrollMode = false; startScroll();
    }
    function updateSwitch() {
        ['as-sw', 'as-cfg-scroll-sw', 'as-lm-scroll-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.className = 'as-switch' + (isScrolling ? ' on' : ''); });
        ['as-layma-sw', 'as-cfg-layma-sw', 'as-gt-layma-sw', 'as-lm-layma-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.className = 'as-switch' + (autoLayMaEnabled ? ' on' : ''); });
        ['as-danma-sw', 'as-cfg-danma-sw', 'as-gt-danma-sw', 'as-lm-danma-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.className = 'as-switch' + (autoDanMaEnabled ? ' on' : ''); });
        ['as-lm-whaton-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.className = 'as-switch' + (autoWhatOnEnabled ? ' on' : ''); });
    }

    function isValidPromoCode(t) {
        t = String(t || '').trim();
        if (!t || t.length < 4 || t.length > 20) return false;
        if (!/[A-Za-z]/.test(t)) return false;
        if (!/^[A-Za-z0-9]+$/.test(t)) return false;
        if (/^(code|mã|lay|lấy|wait|copy|click)$/i.test(t)) return false;
        return true;
    }

    function extractPromoCode() {
        // layma / what-on: quét TẤT CẢ #message (có thể có nhiều)
        try {
            const msgs = document.querySelectorAll('#message, [id="message"]');
            for (const msg of msgs) {
                const t = (msg.textContent || '').replace(/\s+/g, ' ').trim();
                const m = t.match(/Mã\s*Code\s*[:：]\s*([A-Za-z0-9]{4,16})/i) ||
                    t.match(/Ma\s*Code\s*[:：]\s*([A-Za-z0-9]{4,16})/i) ||
                    t.match(/Code\s*[:：]\s*([A-Za-z0-9]{4,16})/i);
                if (m && isValidPromoCode(m[1])) return m[1];
            }
        } catch (e) {}
        // gtrafic
        try {
            for (const el of document.querySelectorAll('.trade-btn-clf__content.copy-allowed')) {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (isValidPromoCode(t)) return t;
            }
            if (document.querySelector('#trade-btn-clf.trade-btn-clf--show-code, .trade-btn-clf--show-code')) {
                for (const el of document.querySelectorAll('.trade-btn-clf__content')) {
                    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (isValidPromoCode(t)) return t;
                }
            }
        } catch (e) {}
        const candidates = [];
        try {
            document.querySelectorAll('div, span, p, strong, b').forEach((el) => {
                try {
                    if (el.id === 'as-code' || (el.closest && el.closest('#as-panel, #as-btn, #as-search-float'))) return;
                    if (el.closest('#trade-btn-clf, .trade-btn-clf-container')) return;
                } catch (e) {}
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!t || t.length > 80) return;
                const m = t.match(/Mã\s*(?:KM|KN|Code)?\s*[:：]\s*([A-Za-z0-9]{3,16})/i) ||
                    t.match(/(?:code|mã|ma)\s*[:：]\s*([A-Za-z0-9]{3,16})/i);
                if (!m || !isValidPromoCode(m[1])) return;
                let score = 10;
                try {
                    if (el.id === 'message') score += 25;
                    if (el.closest('#BuURfz, .whatoncode, [class*="whaton"]')) score += 10;
                } catch (e) {}
                candidates.push({ code: m[1], score });
            });
        } catch (e) {}
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length ? candidates[0].code : '';
    }

    function isCodeReady() { return !!extractPromoCode(); }

    // ---- layma message overlay handler (v6.61 fixed) ----
    let __asWhatOnCooldownUntil = 0;
    let __asLastWhatOnKind = '';
    let __asCodeSeenAt = 0;

    function normalizeVi(s) {
        try {
            return String(s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        } catch (e) {
            return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        }
    }

    function getAllMessageTexts() {
        const texts = [];
        try {
            document.querySelectorAll('#message, [id="message"]').forEach((el) => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t) texts.push(t);
            });
        } catch (e) {}
        // fallback: fixed overlay white box often contains the instruction
        try {
            document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]').forEach((el) => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t && t.length < 120 && /chạm|cuộn|cuon|mã code|ma code|scroll|touch/i.test(t)) {
                    texts.push(t);
                }
            });
        } catch (e) {}
        return texts;
    }

    function fireTapAt(x, y) {
        let el = null;
        try { el = document.elementFromPoint(x, y); } catch (e) {}
        if (!el) el = document.body || document.documentElement;
        // Prefer the fixed overlay if the point hits it
        try {
            const fixed = el.closest && el.closest('div[style*="position: fixed"], div[style*="position:fixed"]');
            if (fixed) el = fixed;
        } catch (e) {}
        try {
            const t = {
                identifier: 1, target: el,
                clientX: x, clientY: y,
                pageX: x + (window.scrollX || 0), pageY: y + (window.scrollY || 0),
                screenX: x, screenY: y, radiusX: 10, radiusY: 10, force: 1, rotation: 0
            };
            el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, composed: true, view: window, touches: [t], targetTouches: [t], changedTouches: [t] }));
            el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, composed: true, view: window, touches: [], targetTouches: [], changedTouches: [t] }));
        } catch (e) {}
        try {
            const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
            el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 1, pointerType: 'touch', isPrimary: true }, o)));
            el.dispatchEvent(new MouseEvent('mousedown', o));
            el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerId: 1, pointerType: 'touch', isPrimary: true }, o)));
            el.dispatchEvent(new MouseEvent('mouseup', o));
            el.dispatchEvent(new MouseEvent('click', o));
        } catch (e) {}
        try { el.click(); } catch (e) {}
        // also invoke captured handlers if page-hook exists
        try {
            if (typeof window.__asInvokeHandlers === 'function') window.__asInvokeHandlers(el, ['touchstart', 'pointerdown', 'mousedown', 'click']);
        } catch (e) {}
    }

    function forceScrollTop() {
        try { stopScroll(); } catch (e) {}
        const doScroll = () => {
            try {
                const se = document.scrollingElement || document.documentElement || document.body;
                window.scrollTo(0, 0);
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
                if (se) { se.scrollTop = 0; se.scrollLeft = 0; }
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                window.scrollBy(0, -999999);
                // some sites put overflow on a wrapper
                document.querySelectorAll('html, body, #app, #root, .container, main').forEach((n) => {
                    try { n.scrollTop = 0; } catch (e) {}
                });
            } catch (e) {}
        };
        doScroll();
        setTimeout(doScroll, 80);
        setTimeout(doScroll, 250);
    }

    function forceScrollBottom() {
        try { stopScroll(); } catch (e) {}
        const doScroll = () => {
            try {
                const h = Math.max(
                    document.body?.scrollHeight || 0,
                    document.documentElement?.scrollHeight || 0,
                    document.body?.offsetHeight || 0,
                    document.documentElement?.offsetHeight || 0
                );
                const se = document.scrollingElement || document.documentElement || document.body;
                window.scrollTo(0, h);
                window.scrollTo({ top: h, left: 0, behavior: 'auto' });
                if (se) se.scrollTop = h;
                document.documentElement.scrollTop = h;
                document.body.scrollTop = h;
                window.scrollBy(0, 999999);
                document.querySelectorAll('html, body, #app, #root, .container, main').forEach((n) => {
                    try { n.scrollTop = n.scrollHeight; } catch (e) {}
                });
            } catch (e) {}
        };
        doScroll();
        setTimeout(doScroll, 80);
        setTimeout(doScroll, 250);
    }

    function doTouchAnywhere() {
        const w = window.innerWidth || 360;
        const h = window.innerHeight || 640;
        // Nhiều điểm: giữa + hơi trên + hơi dưới + 2 bên — web thường chỉ cần 1 lần chạm
        const points = [
            [Math.floor(w / 2), Math.floor(h / 2)],
            [Math.floor(w / 2), Math.floor(h * 0.4)],
            [Math.floor(w / 2), Math.floor(h * 0.6)],
            [Math.floor(w * 0.3), Math.floor(h / 2)],
            [Math.floor(w * 0.7), Math.floor(h / 2)]
        ];
        points.forEach(([x, y], i) => {
            setTimeout(() => fireTapAt(x, y), i * 40);
        });
        // Nút xác thực nếu hiện
        setTimeout(() => {
            try {
                const xb = document.getElementById('xacthucButton');
                if (xb) {
                    const st = getComputedStyle(xb);
                    if (st.display !== 'none' && st.visibility !== 'hidden' && xb.offsetParent !== null) {
                        try { xb.click(); } catch (e) {}
                        fireTapAt(
                            xb.getBoundingClientRect().left + xb.offsetWidth / 2,
                            xb.getBoundingClientRect().top + xb.offsetHeight / 2
                        );
                    }
                }
            } catch (e) {}
        }, 220);
    }

    function handleLaymaWhatOnMessages() {
        if (!autoWhatOnEnabled) return false;
        if (Date.now() < __asWhatOnCooldownUntil) return false;

        // Đã có mã thật → dừng hoàn toàn, unlock, cooldown dài để khỏi đơ web
        const codeNow = extractPromoCode();
        if (codeNow) {
            if (!__asCodeSeenAt) __asCodeSeenAt = Date.now();
            try { stopScroll(); } catch (e) {}
            try { unlockScroll(); } catch (e) {}
            __asWhatOnCooldownUntil = Date.now() + 8000;
            __asLastWhatOnKind = 'code';
            return false;
        }
        __asCodeSeenAt = 0;

        const texts = getAllMessageTexts();
        if (!texts.length) return false;

        let kind = '';
        for (const raw of texts) {
            const t = normalizeVi(raw);
            if (!t) continue;
            // Có mã → không đụng
            if (/ma\s*code\s*[:：]|ma\s*code\s*=|code\s*[:：]\s*[a-z0-9]{4,}/i.test(raw) || /ma code/.test(t)) {
                kind = 'code';
                break;
            }
            if (/cham vao man hinh|cham vao|touch the screen|tap (the )?screen|cham man hinh/.test(t) || /chạm vào màn hình|chạm vào/.test(raw.toLowerCase())) {
                kind = 'touch';
                break;
            }
            if (/cuon len|scroll up|vui long cuon len|cuộn lên/.test(t) || (t.includes('len') && t.includes('tiep tuc')) || /cuộn lên/.test(raw.toLowerCase())) {
                kind = 'up';
                break;
            }
            if (/cuon xuong|scroll down|vui long cuon xuong|cuộn xuống/.test(t) || (t.includes('xuong') && t.includes('tiep tuc')) || /cuộn xuống/.test(raw.toLowerCase())) {
                kind = 'down';
                break;
            }
        }

        if (!kind || kind === 'code') {
            if (kind === 'code') {
                try { stopScroll(); unlockScroll(); } catch (e) {}
                __asWhatOnCooldownUntil = Date.now() + 5000;
            }
            return false;
        }

        // Tránh spam cùng một hành động liên tục
        if (kind === __asLastWhatOnKind && Date.now() - (__asWhatOnCooldownUntil - 900) < 400) {
            // still allow after cooldown
        }

        if (kind === 'touch') {
            console.log('[Auto Tools v6.61] what-on: CHẠM BẤT KỲ (multi-point)');
            try { stopScroll(); } catch (e) {}
            doTouchAnywhere();
            __asLastWhatOnKind = 'touch';
            __asWhatOnCooldownUntil = Date.now() + 1100;
            return true;
        }
        if (kind === 'up') {
            console.log('[Auto Tools v6.61] what-on: CUỘN LÊN CÙNG (force)');
            forceScrollTop();
            __asLastWhatOnKind = 'up';
            __asWhatOnCooldownUntil = Date.now() + 900;
            return true;
        }
        if (kind === 'down') {
            console.log('[Auto Tools v6.61] what-on: CUỘN XUỐNG CÙNG (force)');
            forceScrollBottom();
            __asLastWhatOnKind = 'down';
            __asWhatOnCooldownUntil = Date.now() + 900;
            return true;
        }
        return false;
    }

    function watchLaymaMessages() {
        let lastTickCode = '';
        const tick = () => {
            try {
                const code = extractPromoCode();
                if (code) {
                    if (code !== lastTickCode) {
                        lastTickCode = code;
                        console.log('[Auto Tools v6.61] Đã thấy mã, dừng can thiệp overlay:', code);
                    }
                    try { stopScroll(); } catch (e) {}
                    try { unlockScroll(); } catch (e) {}
                    __asWhatOnCooldownUntil = Date.now() + 6000;
                    return;
                }
                lastTickCode = '';
                if (!autoWhatOnEnabled) return;
                handleLaymaWhatOnMessages();
            } catch (e) {}
        };
        setInterval(tick, 450);
        try {
            const obs = new MutationObserver(() => {
                // debounce nhẹ
                if (Date.now() < __asWhatOnCooldownUntil - 200) return;
                tick();
            });
            if (document.body) obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
            else document.addEventListener('DOMContentLoaded', () => {
                try { obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true }); } catch (e) {}
            });
        } catch (e) {}
    }
    setTimeout(watchLaymaMessages, 600);

    // ---- AUTO PASTE ----
    function watchAndAutoPasteCode() {
        if (location.hostname.includes('google.')) return;
        if (isOriginFormHost() && findPasswordInput()) return;

        const tryOnce = () => {
            try {
                if (!autoDanMaEnabled || autoDanMaBusy) return;
                if (GM_getValue('as_pending_code', '')) return;
                const code = extractPromoCode();
                if (!code || !isValidPromoCode(code)) return;
                if (code === lastAutoDanCode) return;
                const usedKey = 'as_auto_dan_' + code;
                const usedAt = GM_getValue(usedKey, 0);
                if (usedAt && Date.now() - usedAt < 180000) return;
                lastAutoDanCode = code;
                autoDanMaBusy = true;
                GM_setValue(usedKey, Date.now());
                try { lockScroll('auto dán mã'); stopScroll(); } catch (e) {}
                console.log('[Auto Tools] ✅ Mã:', code);
                setTimeout(() => {
                    try { submitCode(code); } catch (e) {}
                    finally { setTimeout(() => { autoDanMaBusy = false; }, 5000); }
                }, 400);
            } catch (e) {}
        };
        setTimeout(tryOnce, 800);
        setInterval(tryOnce, 1200);
        try {
            const roots = [
                document.getElementById('message'),
                document.getElementById('trade-btn-clf'),
                document.getElementById('BuURfz'),
                ...document.querySelectorAll('.trade-btn-clf, .copy-allowed, .whatoncode')
            ].filter(Boolean);
            const obs = new MutationObserver(() => tryOnce());
            if (roots.length) roots.forEach(r => obs.observe(r, { childList: true, subtree: true, characterData: true, attributes: true }));
            else if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }
    setTimeout(() => { try { watchAndAutoPasteCode(); } catch (e) {} }, 1500);

    function isCountdownVisible() {
        // Có mã rồi → không coi là countdown
        if (extractPromoCode()) return false;
        try {
            if (document.querySelector('#trade-btn-clf.trade-btn-clf--show-code')) return false;
            const t = document.getElementById('trade-btn-clf__content');
            if (t) {
                const v = (t.textContent || '').trim();
                if (/^\d+$/.test(v) && +v > 0) return true;
            }
        } catch (e) {}
        // #counter trên overlay what-on (89, ...) — chỉ khi CHƯA có mã
        try {
            const msg = document.getElementById('message');
            const mtxt = (msg && msg.textContent) || '';
            if (/mã\s*code/i.test(mtxt)) return false;
            // đang yêu cầu cuộn/chạm → không bật auto-scroll lên xuống kiểu link4m
            if (/chạm|cuộn lên|cuộn xuống|cuon len|cuon xuong/i.test(mtxt)) return false;
        } catch (e) {}
        const nodes = document.querySelectorAll('.whatoncode, #BuURfz [class*="whaton"]');
        for (const n of nodes) {
            const t = (n.textContent || '').trim();
            if (/^\d+$/.test(t) && +t > 0 && +t < 300) return true;
        }
        return false;
    }

    function watchCountdownAndScroll() {
        if (location.hostname.includes('google.') || isOriginFormHost()) { stopScroll(); return; }
        let miss = 0;
        const tick = () => {
            try {
                if (isScrollBlocked()) { if (isScrolling) stopScroll(); return; }
                // Có mã → dừng cuộn ngay, không vuốt nữa
                if (isCodeReady() || extractPromoCode()) {
                    if (isScrolling) stopScroll();
                    return;
                }
                // Ưu tiên xử lý message what-on (chạm / cuộn đúng hướng)
                if (handleLaymaWhatOnMessages()) {
                    if (isScrolling) stopScroll();
                    return;
                }
                if (isCountdownVisible() && !document.getElementById('trade-btn-clf')) {
                    miss = 0;
                    if (!isScrolling || !countdownScrollMode) startScroll({ countdown: true });
                } else if (countdownScrollMode) {
                    miss++;
                    if (miss >= 2) { stopScroll(); miss = 0; }
                }
            } catch (e) {}
        };
        setTimeout(tick, 1000);
        setInterval(tick, 1500);
    }
    watchCountdownAndScroll();

    // ---- AI helpers (compact) ----
    const DEFAULT_PATEWAY_KEY = 'sk-ptw-12HRGLsVqdzLdfnJ1UagmAfcz9G8eMBbwN6KS';
    function getPatewayKey() {
        try { return (GM_getValue('as_pateway_key', DEFAULT_PATEWAY_KEY) || DEFAULT_PATEWAY_KEY).trim(); }
        catch (e) { return DEFAULT_PATEWAY_KEY; }
    }
    function gmFetchBinary(url) {
        return new Promise((resolve, reject) => {
            if (!url) return reject(new Error('no url'));
            if (url.startsWith('data:')) {
                const m = url.match(/^data:([^;]+);base64,(.+)$/);
                if (m) return resolve({ mime: m[1], b64: m[2] });
                return reject(new Error('bad data'));
            }
            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'blob',
                onload(res) {
                    if (res.status < 200 || res.status >= 300) return reject(new Error('HTTP ' + res.status));
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const m = String(reader.result || '').match(/^data:([^;]+);base64,(.+)$/);
                        if (m) resolve({ mime: m[1], b64: m[2] });
                        else reject(new Error('read fail'));
                    };
                    reader.onerror = () => reject(new Error('FR'));
                    reader.readAsDataURL(res.response);
                },
                onerror: () => reject(new Error('GM'))
            });
        });
    }
    async function imgToInlineData(img) {
        const src = img.currentSrc || img.src || '';
        if (src.startsWith('data:')) return gmFetchBinary(src);
        try {
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) throw new Error('no size');
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0);
            const m = c.toDataURL('image/png').match(/^data:([^;]+);base64,(.+)$/);
            if (m) return { mime: m[1], b64: m[2] };
        } catch (e) {}
        if (src.startsWith('http')) return gmFetchBinary(src);
        throw new Error('img fail');
    }
    function callPatewayVision(partsInline, promptText) {
        return new Promise((resolve, reject) => {
            const key = getPatewayKey();
            if (!key) return reject(new Error('no key'));
            const content = partsInline.map(p => ({ type: 'image', source: { type: 'base64', media_type: p.mime || 'image/png', data: p.b64 } }));
            content.push({ type: 'text', text: promptText });
            const models = ['claude-sonnet-4-6', 'claude-haiku-4-5'];
            const tryModel = (idx) => {
                if (idx >= models.length) return reject(new Error('vision fail'));
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.pateway.ai/v1/messages',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'Authorization': 'Bearer ' + key, 'anthropic-version': '2023-06-01' },
                    data: JSON.stringify({ model: models[idx], max_tokens: 512, messages: [{ role: 'user', content }] }),
                    onload(res) {
                        try {
                            const j = JSON.parse(res.responseText || '{}');
                            if (res.status < 200 || res.status >= 300) return tryModel(idx + 1);
                            let t = '';
                            if (Array.isArray(j.content)) t = j.content.map(c => c.text || '').join('\n').trim();
                            if (!t) return tryModel(idx + 1);
                            resolve(t);
                        } catch (e) { tryModel(idx + 1); }
                    },
                    onerror: () => tryModel(idx + 1)
                });
            };
            tryModel(0);
        });
    }
    function normalizeDomainHint(domain) {
        domain = String(domain || '').trim().replace(/^["']|["']$/g, '');
        if (!domain) return '';
        const star = domain.indexOf('*');
        if (star >= 0) domain = domain.slice(0, star);
        return domain.replace(/\.+$/, '').trim();
    }
    function parseAiDomain(text) {
        let domain = '';
        for (const line of String(text).split(/\n/)) {
            const d = line.match(/^(?:domain|g[oợ]i\s*y[eế])\s*[:=]\s*(.+)$/i);
            if (d) domain = d[1].trim().replace(/^["']|["']$/g, '');
        }
        if (!domain) {
            const m2 = String(text).match(/\b([a-z0-9][a-z0-9.-]{1,40})\b/i);
            if (m2) domain = m2[1];
        }
        return normalizeDomainHint(domain);
    }

    // ---- KEYWORD SCRAPERS ----
    function scrapeLaymaKeyword() {
        // #TK1, #TK2, #TK3
        for (const id of ['TK1', 'TK2', 'TK3']) {
            const el = document.getElementById(id);
            if (!el) continue;
            let t = (el.getAttribute('data-clipboard-text') || el.textContent || '').trim();
            if (t && t.length >= 2 && t.length < 80) return t;
        }
        const el = document.querySelector('p.box-copy-code, .box-copy-code.no-copy');
        if (el) {
            const t = (el.textContent || '').trim();
            if (t && t.length >= 2) return t;
        }
        return '';
    }
    function scrapeGtraficKeyword() {
        const sels = [
            'span.text-slate-900.font-mono.font-bold.text-lg.notranslate',
            'span.font-mono.font-bold.notranslate',
            'span.notranslate.font-mono'
        ];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el) {
                const t = (el.textContent || '').trim();
                if (t && t.length >= 2 && t.length < 80) return t;
            }
        }
        return '';
    }
    function scrapeGtraficResultTitle() {
        const candidates = [];
        document.querySelectorAll('a h3, h3, a[class*="blue"]').forEach(el => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length >= 12 && t.length < 180 && /sunwin|trang\s*chủ|chính\s*thức/i.test(t)) {
                candidates.push(t);
            }
        });
        return candidates[0] || '';
    }

    function pickDomainImage() {
        // layma #hinh_nv
        const hinh = document.getElementById('hinh_nv');
        if (hinh && (hinh.naturalWidth || hinh.width) > 50) return hinh;
        const scored = [];
        for (const img of document.querySelectorAll('img')) {
            const src = (img.currentSrc || img.src || '').toLowerCase();
            let score = 0;
            if (/api\.layma\.net\/media|layma\.net.*posts/i.test(src)) score += 20;
            if (/cdn\.gtraffic\.io|gtraffic\.io\/image/i.test(src)) score += 15;
            if (/gallery-item|anh\s*tim/i.test((img.className || '') + (img.alt || ''))) score += 8;
            if ((img.naturalWidth || img.width) >= 150) score += 2;
            if (score >= 8) scored.push({ img, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.length ? scored[0].img : null;
    }

    async function aiFillGeneric(statusId, keywordFn, autoSearch) {
        const statusEl = document.getElementById(statusId);
        const setSt = (t) => { if (statusEl) statusEl.textContent = t; };
        let keyword = '';
        try { keyword = keywordFn() || ''; } catch (e) {}
        // fill keyword inputs
        ['as-keyword', 'as-gt-keyword', 'as-lm-keyword'].forEach(id => {
            const el = document.getElementById(id);
            if (el && keyword) el.value = keyword;
        });
        setSt(keyword ? ('KW: ' + keyword.slice(0, 60)) : 'Không thấy từ khóa…');
        const img = pickDomainImage();
        let domain = '';
        if (img) {
            setSt('AI đọc domain từ ảnh…');
            try {
                const inline = await imgToInlineData(img);
                const raw = await callPatewayVision([inline],
                    'Đọc domain/website trong ảnh (có thể bị che đỏ). Chỉ lấy chữ trước dấu *. Trả 1 dòng:\ndomain: ...');
                domain = parseAiDomain(raw);
            } catch (e) {
                setSt('AI lỗi: ' + e.message);
            }
        }
        ['as-domain', 'as-gt-domain', 'as-lm-domain'].forEach(id => {
            const el = document.getElementById(id);
            if (el && domain) el.value = domain;
        });
        setSt((keyword || '?') + ' | domain: ' + (domain || '(trống)'));
        if (autoSearch && keyword) startSmartSearch(keyword, domain);
    }

    // ---- PANEL GOOGLE NỔI (cùng tab) ----
    function similarity(a, b) {
        a = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        b = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!a || !b) return 0;
        if (a.includes(b) || b.includes(a)) return 0.92;
        let longer = a.length > b.length ? a : b, shorter = a.length > b.length ? b : a, m = 0;
        for (const c of shorter) if (longer.includes(c)) m++;
        return m / longer.length;
    }
    function getDomain(url) {
        try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
        catch { return (url || '').replace(/^www\./, '').split('/')[0]; }
    }
    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }





    function markOriginTab() {
        try {
            if (!window.name || window.name.indexOf('as_origin_') !== 0) window.name = 'as_origin_' + Date.now();
            GM_setValue('as_origin_window_name', window.name);
            GM_setValue('as_keep_origin_tab', true);
            GM_setValue('as_original_url', location.href);
        } catch (e) {}
    }



    function startSmartSearch(keyword, domain) {
        if (!keyword) return alert('Nhập từ khóa!');
        try { stopScroll(); } catch (e) {}
        markOriginTab();
        let title = keyword;
        try {
            if (isGtraficHost()) title = scrapeGtraficResultTitle() || keyword;
        } catch (e) {}
        GM_setValue('as_smart_keyword', keyword);
        GM_setValue('as_smart_domain', domain || '');
        GM_setValue('as_smart_title', title);
        GM_setValue('as_smart_time', Date.now());
        GM_setValue('as_force_layma', true);
        GM_setValue('as_keep_origin_tab', true);

        const url = 'https://www.google.com/search?q=' + encodeURIComponent(keyword) + '&hl=vi';
        // gtrafic: tab mới (giữ form, tránh đổi keyword)
        // link4m + layma: CÙNG tab theo yêu cầu
        if (isGtraficHost()) {
            const w = window.open(url, '_blank');
            if (!w) {
                alert('Cho phép popup để giữ tab gtrafic không load lại.');
                return;
            }
            try { w.focus(); } catch (e) {}
        } else {
            // link4m / layma / khác → cùng tab
            location.href = url;
        }
    }

    // Auto-click kết quả Google (tab mới)
    if (location.hostname.includes('google.') && location.pathname.includes('/search')) {
        const keyword = GM_getValue('as_smart_keyword', '');
        const suggested = GM_getValue('as_smart_domain', '');
        const hintTitle = GM_getValue('as_smart_title', '');
        const time = GM_getValue('as_smart_time', 0);
        if (keyword && Date.now() - time < 180000) {
            let tried = 0;
            const tryClick = () => {
                tried++;
                let best = null, bestScore = -1;
                document.querySelectorAll('a').forEach(a => {
                    let href = a.href;
                    if (!href || href.includes('google.') || href.includes('webcache') || href.includes('accounts.google')) return;
                    let real = href;
                    try {
                        const u = new URL(href);
                        if (u.pathname === '/url' && u.searchParams.get('q')) real = u.searchParams.get('q');
                    } catch (e) {}
                    const domain = getDomain(real);
                    if (!domain || domain.length < 4) return;
                    let score = suggested ? similarity(domain, suggested) : 0.35;
                    const linkText = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    if (hintTitle) {
                        const ht = hintTitle.toLowerCase();
                        if (linkText.includes(ht.slice(0, 24)) || ht.includes(linkText.slice(0, 24))) score += 0.5;
                        score += similarity(linkText.slice(0, 90), ht.slice(0, 90)) * 0.4;
                    }
                    if (score > bestScore) { bestScore = score; best = a; }
                });
                if (best && bestScore > 0.28) {
                    GM_deleteValue('as_smart_keyword');
                    GM_deleteValue('as_smart_domain');
                    GM_deleteValue('as_smart_title');
                    GM_deleteValue('as_smart_time');
                    console.log('[Auto Tools] Click Google score=', bestScore.toFixed(2));
                    best.click();
                } else if (tried < 12) setTimeout(tryClick, 1000);
            };
            setTimeout(tryClick, 2200);
        }
    }

    // ---- CLICK HELPERS ----
    function pageWin() {
        try { return (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window; } catch (e) { return window; }
    }
    function forcePhysicalClick(el, opts) {
        if (!el) return false;
        opts = opts || {};
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        try {
            const fn = pageWin().__asInvokeHandlers;
            if (typeof fn === 'function') fn(el);
        } catch (e) {}
        // touch nhẹ
        try {
            const t = { identifier: 1, target: el, clientX: x, clientY: y, pageX: x + (window.scrollX || 0), pageY: y + (window.scrollY || 0), screenX: x, screenY: y, radiusX: 6, radiusY: 6, force: 1 };
            el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, view: window, touches: [t], targetTouches: [t], changedTouches: [t] }));
            el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, view: window, touches: [], targetTouches: [], changedTouches: [t] }));
        } catch (e) {}
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })); } catch (e) {}
        });
        try { el.click(); } catch (e) {}
        // CHỈ khi opts.deep — không click hết span con (tránh bấm hết nút LẤY MÃ)
        if (opts.deep) {
            try {
                const inner = el.querySelector('span, img, svg');
                if (inner) {
                    const ir = inner.getBoundingClientRect();
                    if (ir.width >= 3) try { inner.click(); } catch (e) {}
                }
            } catch (e) {}
        }
        return true;
    }

    /** Click 1 lần duy nhất — dùng cho nút LẤY MÃ */
    function clickOnce(el) {
        if (!el) return false;
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
        return forcePhysicalClick(el, { deep: false });
    }

    function findLayMaButton() {
        // gtrafic — 1 nút
        try {
            const gt = document.getElementById('trade-btn-clf') || document.querySelector('.trade-btn-clf-container, #avt-btn');
            if (gt) {
                const r = gt.getBoundingClientRect();
                if (r.width > 10 && r.height > 10) return gt.closest('#trade-btn-clf, .trade-btn-clf, .trade-btn-clf-container') || gt;
            }
        } catch (e) {}

        // layma / what-on: chọn ĐÚNG 1 nút xanh LẤY MÃ (visible, điểm cao nhất)
        try {
            const candidates = [];
            document.querySelectorAll('span, div, a, button').forEach(el => {
                try {
                    if (el.closest && el.closest('#as-panel, #as-btn')) return;
                    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    // chỉ đúng chữ LẤY MÃ (không lấy block dài chứa nhiều nút)
                    if (!/^LẤY\s*MÃ$/i.test(txt) && txt.toUpperCase() !== 'LAY MA') return;
                    const r = el.getBoundingClientRect();
                    if (r.width < 20 || r.height < 12) return;
                    if (r.bottom < 0 || r.top > window.innerHeight + 200) return; // gần viewport
                    let score = 10;
                    const st = (el.getAttribute('style') || '') + ' ' + (getComputedStyle(el).backgroundColor || '');
                    if (/11\s*,\s*244\s*,\s*5|#0bf405|rgb\(\s*11\s*,\s*244/i.test(st)) score += 30;
                    // phần tử nhỏ = nút thật, không phải wrapper
                    if (r.width < 160 && r.height < 60) score += 15;
                    if (r.top >= 0 && r.bottom <= window.innerHeight) score += 10; // trong màn hình
                    // ưu tiên node lá (ít con)
                    if (el.children.length <= 1) score += 8;
                    candidates.push({ el, score, y: r.top });
                } catch (e) {}
            });
            candidates.sort((a, b) => b.score - a.score || a.y - b.y);
            if (candidates.length) {
                console.log('[Auto Tools] Chọn 1 nút LẤY MÃ, có', candidates.length, 'ứng viên, score=', candidates[0].score);
                return candidates[0].el;
            }
        } catch (e) {}

        // link4m fallback
        for (const el of document.querySelectorAll('button, a, [role="button"]')) {
            const txt = (el.textContent || '').trim().toUpperCase().replace(/\s+/g, ' ');
            if ((txt === 'LẤY MÃ' || txt === 'LAY MA' || (txt.includes('LẤY MÃ') && txt.length < 24)) && el.offsetWidth > 10) {
                return el;
            }
        }
        return null;
    }

    function autoClickLayMa() {
        if (location.hostname.includes('google.') && location.pathname.includes('/search')) return;
        if (isOriginFormHost() && !findLayMaButton() && !document.getElementById('BuURfz') && !document.getElementById('trade-btn-clf')) {
            stopScroll();
            return;
        }
        const pageKey = 'as_layma_once_' + location.hostname + location.pathname + location.search;
        if (GM_getValue('as_force_layma', false)) {
            GM_deleteValue(pageKey);
            GM_deleteValue('as_force_layma');
        }
        if (GM_getValue(pageKey, false) || !autoLayMaEnabled) return;

        let clicked = false, attempts = 0;
        const startTime = Date.now(), maxWait = 90000, maxAttempts = 6;

        const doOne = (btn) => {
            if (!btn || clicked || autoLayMaBusy || !autoLayMaEnabled) return;
            // Đã có mã / đang overlay message → không bấm thêm nút
            if (extractPromoCode()) {
                clicked = true;
                GM_setValue(pageKey, true);
                try { stopScroll(); unlockScroll(); } catch (e) {}
                return;
            }
            try {
                const allTxt = getAllMessageTexts().join(' | ').toLowerCase();
                if (/chạm|cuộn lên|cuộn xuống|cuon len|cuon xuong|mã\s*code|cham vao|scroll/i.test(allTxt)) {
                    // để handleLayma xử lý, không spam nút LẤY MÃ
                    handleLaymaWhatOnMessages();
                    return;
                }
            } catch (e) {}
            autoLayMaBusy = true;
            attempts++;
            console.log('[Auto Tools] Click ĐÚNG 1 nút LẤY MÃ (lần', attempts, ')');
            try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            setTimeout(() => {
                if (clicked || !autoLayMaEnabled) { autoLayMaBusy = false; return; }
                const el = findLayMaButton() || btn;
                // MỘT click — không deep, không lặp
                clickOnce(el);
                clicked = true;
                GM_setValue(pageKey, true);
                autoLayMaBusy = false;
                updateSwitch();
                console.log('[Auto Tools] Đã bấm 1 nút — dừng, không bấm các nút khác');
            }, 2200);
        };

        const tryFind = () => {
            if (clicked || GM_getValue(pageKey, false) || !autoLayMaEnabled || autoLayMaBusy) return;
            if (Date.now() - startTime > maxWait || attempts >= maxAttempts) return;
            // Ưu tiên message overlay
            if (handleLaymaWhatOnMessages()) return;
            if (extractPromoCode()) {
                clicked = true;
                GM_setValue(pageKey, true);
                try { stopScroll(); unlockScroll(); } catch (e) {}
                return;
            }
            const btn = findLayMaButton();
            if (btn) doOne(btn);
        };

        setTimeout(tryFind, 2800);
        const timer = setInterval(() => {
            if (clicked || GM_getValue(pageKey, false)) { clearInterval(timer); return; }
            tryFind();
        }, 4000);
        try {
            const obs = new MutationObserver(() => {
                if (!clicked && !GM_getValue(pageKey, false)) tryFind();
            });
            if (document.body) obs.observe(document.body, { childList: true, subtree: true, attributes: true });
            setTimeout(() => { try { obs.disconnect(); } catch (e) {} }, maxWait);
        } catch (e) {}
    }
    autoClickLayMa();

    // ---- PASTE ----
    function isToolUiElement(el) {
        if (!el) return true;
        try {
            if (/^as-/.test(el.id || '')) return true;
            if (el.closest && el.closest('#as-panel, #as-btn, #as-search-float')) return true;
        } catch (e) {}
        return false;
    }
    function findPasswordInput() {
        // layma
        const codeInput = document.getElementById('codeInput');
        if (codeInput && !isToolUiElement(codeInput)) return codeInput;
        const selectors = [
            'input#codeInput', 'input[name="code"]',
            'input[name="password"].password', 'input.password[placeholder*="Nhập mã"]',
            'input[name="password"]', 'input[placeholder*="mã"]', 'input[placeholder*="Mã"]',
            'input[placeholder*="Nhập mã vào đây"]', 'input.form-control[name="code"]'
        ];
        for (const sel of selectors) {
            for (const input of document.querySelectorAll(sel)) {
                if (isToolUiElement(input)) continue;
                if (input.offsetParent !== null || input.getClientRects().length) return input;
            }
        }
        return null;
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    async function fillCodeNatural(code) {
        code = String(code || '').trim();
        if (!code || !isValidPromoCode(code)) return false;
        const input = findPasswordInput();
        if (!input) return false;
        try {
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(400);
            input.focus(); input.click(); await sleep(300);
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            for (let i = 0; i < code.length; i++) {
                const ch = code[i];
                try {
                    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeSet.call(input, (input.value || '') + ch);
                } catch (e) { input.value = (input.value || '') + ch; }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(60 + Math.floor(Math.random() * 80));
            }
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (e) {
            try { input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })); return true; } catch (e2) { return false; }
        }
    }
    function clickRecaptchaCheckbox() {
        try { GM_setValue('as_need_captcha_click', true); } catch (e) {}
        const local = document.querySelector('.recaptcha-checkbox-border, #recaptcha-anchor, span[role="checkbox"]');
        if (local) try { local.click(); } catch (e) {}
        document.querySelectorAll('iframe[src*="recaptcha"]').forEach(iframe => {
            try { iframe.click(); } catch (e) {}
        });
    }
    function clickConfirmLayma() {
        const btn = document.getElementById('btn-xac-nhan');
        if (btn) {
            try {
                if (typeof pageWin().confirm1 === 'function') pageWin().confirm1();
            } catch (e) {}
            forcePhysicalClick(btn);
            return true;
        }
        return false;
    }
    function findContinueLink() {
        if (isLaymaHost()) {
            const b = document.getElementById('btn-xac-nhan');
            if (b) return b;
        }
        let el = document.querySelector('a.get-link, a.btn.get-link, #main-form a.btn-success');
        if (el) return el;
        for (const btn of document.querySelectorAll('a, button')) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text.includes('tiếp tục') || text === 'xác nhận') return btn;
        }
        return null;
    }
    function hasCaptchaToken() {
        try {
            for (const a of document.querySelectorAll('textarea.g-recaptcha-response, #g-recaptcha-response')) {
                if ((a.value || '').trim().length > 20) return true;
            }
        } catch (e) {}
        return false;
    }
    function waitCaptchaThenContinue(maxMs) {
        maxMs = maxMs || 180000;
        const start = Date.now();
        let done = false;
        setTimeout(clickRecaptchaCheckbox, 500);
        setTimeout(clickRecaptchaCheckbox, 1500);
        const timer = setInterval(() => {
            if (done || Date.now() - start > maxMs) {
                clearInterval(timer);
                if (!done) {
                    if (isLaymaHost()) clickConfirmLayma();
                    else {
                        const el = findContinueLink();
                        if (el) forcePhysicalClick(el);
                    }
                }
                return;
            }
            if (hasCaptchaToken() || Date.now() - start > 4000) {
                done = true;
                clearInterval(timer);
                setTimeout(() => {
                    if (isLaymaHost()) clickConfirmLayma();
                    else {
                        const el = findContinueLink();
                        if (el) forcePhysicalClick(el);
                    }
                    setTimeout(unlockScroll, 1500);
                }, 400);
            } else {
                clickRecaptchaCheckbox();
            }
        }, 800);
    }
    async function runPasteFlow(code) {
        code = (code || '').trim();
        if (!code || !isValidPromoCode(code) || window.__asPasteRunning) return false;
        window.__asPasteRunning = true;
        lockScroll('paste flow');
        try {
            await sleep(600);
            if (!findPasswordInput()) await sleep(1200);
            let ok = await fillCodeNatural(code);
            if (!ok) { await sleep(1000); ok = await fillCodeNatural(code); }
            if (ok) {
                try { GM_deleteValue('as_pending_code'); } catch (e) {}
                await sleep(400);
                waitCaptchaThenContinue();
                return true;
            }
            return false;
        } finally { window.__asPasteRunning = false; }
    }
    function sendCodeToOriginTab(code) {
        GM_setValue('as_pending_code', code);
        GM_setValue('as_pending_code_time', Date.now());
        GM_setValue('as_stop_scroll', true);
        GM_setValue('as_scroll_lock', true);
        let focused = false;
        try {
            const name = GM_getValue('as_origin_window_name', '');
            if (name) {
                const w = window.open('', name);
                if (w && !w.closed) { try { w.focus(); focused = true; } catch (e) {} }
            }
        } catch (e) {}
        try {
            const bc = new BroadcastChannel('as_tools_hub');
            bc.postMessage({ type: 'paste_code', code, t: Date.now() });
            setTimeout(() => { try { bc.close(); } catch (e) {} }, 2000);
        } catch (e) {}
        return focused;
    }
    function submitCode(code) {
        code = (code || '').trim();
        if (!code || !isValidPromoCode(code)) return;
        lockScroll('submitCode');
        const original = GM_getValue('as_original_url', '');
        const keepOrigin = !!GM_getValue('as_keep_origin_tab', false);
        const realForm = findPasswordInput();
        if (realForm && (isOriginFormHost() || (original && location.href.indexOf(new URL(original).hostname) >= 0))) {
            runPasteFlow(code);
            return;
        }
        if (keepOrigin || original) {
            const focused = sendCodeToOriginTab(code);
            if (focused || keepOrigin) {
                if (!focused) try { alert('Đã gửi mã. Chuyển tab form CŨ (đừng F5).'); } catch (e) {}
                return;
            }
            if (original && original !== location.href) { location.href = original; return; }
        }
        if (realForm) runPasteFlow(code);
        else alert('Không tìm thấy ô nhập mã.');
    }

    (function listenPendingCode() {
        const maybeOrigin = () => {
            try {
                if (findPasswordInput()) return true;
                if (isOriginFormHost()) return true;
                const original = GM_getValue('as_original_url', '');
                if (!original) return false;
                return new URL(original).hostname === location.hostname;
            } catch (e) { return !!findPasswordInput(); }
        };
        const tryConsume = () => {
            try {
                if (!maybeOrigin()) return;
                const code = GM_getValue('as_pending_code', '');
                if (!code || !isValidPromoCode(code) || window.__asPasteRunning) return;
                const t = GM_getValue('as_pending_code_time', 0);
                if (t && Date.now() - t > 300000) return;
                lockScroll('consume');
                runPasteFlow(code);
            } catch (e) {}
        };
        try {
            if (typeof GM_addValueChangeListener === 'function') {
                GM_addValueChangeListener('as_pending_code', (n, o, v, remote) => { if (v && remote) setTimeout(tryConsume, 150); });
            }
        } catch (e) {}
        try {
            const bc = new BroadcastChannel('as_tools_hub');
            bc.onmessage = (ev) => {
                if (ev.data && ev.data.type === 'paste_code' && ev.data.code) {
                    GM_setValue('as_pending_code', ev.data.code);
                    GM_setValue('as_pending_code_time', Date.now());
                    setTimeout(tryConsume, 100);
                }
            };
        } catch (e) {}
        setInterval(tryConsume, 1200);
        setTimeout(tryConsume, 500);
    })();

    const pending = GM_getValue('as_pending_code', '');
    if (pending || GM_getValue('as_scroll_lock', false)) lockScroll('boot');
    if (pending && isValidPromoCode(pending)) {
        const boot = () => setTimeout(() => runPasteFlow(pending), 400);
        if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
    }

    // ---- UI ----
    function ensureUI() {
        try {
        // Nếu nút còn trong DOM nhưng bị tách khỏi body (link4m hay xóa/rebuild body) → tạo lại
        const existing = document.getElementById('as-btn');
        if (existing && document.body && document.body.contains(existing)) return;
        if (existing) {
            try { existing.remove(); } catch (e) {}
            try { document.getElementById('as-panel')?.remove(); } catch (e) {}
        }
        if (!document.getElementById('as-style')) {
            const style = document.createElement('style');
            style.id = 'as-style';
            style.textContent = `#as-btn{position:fixed!important;bottom:20px!important;right:20px!important;width:52px!important;height:52px!important;background:linear-gradient(135deg,#1a73e8,#0d47a1)!important;color:#fff!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:24px!important;z-index:2147483647!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;cursor:pointer!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
#as-panel{position:fixed!important;bottom:85px!important;right:12px!important;width:300px!important;max-width:94vw!important;background:#1c1c1c!important;color:#fff!important;border-radius:14px!important;z-index:2147483647!important;font-family:system-ui,sans-serif!important;font-size:13.5px!important;display:none;box-shadow:0 10px 30px rgba(0,0,0,.5)!important;overflow:hidden!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}
.as-header{background:#111!important;padding:12px 14px!important;display:flex!important;justify-content:space-between!important;align-items:center!important;font-weight:700!important;cursor:move!important}
.as-tabs{display:flex!important;background:#111!important}
.as-tabs div{flex:1!important;text-align:center!important;padding:9px 4px!important;font-size:12px!important;font-weight:600!important;color:#888!important;cursor:pointer!important}
.as-tabs div.active{color:#fff!important;background:#1c1c1c!important;border-bottom:2px solid #1a73e8!important}
.as-body{padding:12px 14px 16px!important}
.as-tool-btn{display:flex!important;align-items:center!important;gap:10px!important;padding:13px 14px!important;border-bottom:1px solid #2a2a2a!important;cursor:pointer!important}
.as-switch{width:42px!important;height:24px!important;background:#444!important;border-radius:12px!important;position:relative!important;cursor:pointer!important;flex-shrink:0!important}
.as-switch::after{content:''!important;position:absolute!important;width:20px!important;height:20px!important;background:#fff!important;border-radius:50%!important;top:2px!important;left:2px!important;transition:.2s!important}
.as-switch.on{background:#1a73e8!important}.as-switch.on::after{transform:translateX(18px)!important}
#as-panel input{width:100%!important;box-sizing:border-box!important;background:#2a2a2a!important;border:1px solid #444!important;color:#fff!important;border-radius:8px!important;padding:9px 11px!important;margin:5px 0 10px!important;font-size:14px!important}
.as-btn-main{width:100%!important;background:#1a73e8!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:11px!important;font-weight:600!important;cursor:pointer!important;margin-bottom:8px!important}
.as-btn-green{background:#16a34a!important}.as-btn-orange{background:#ea580c!important}
.back-btn{background:none!important;border:none!important;color:#1a73e8!important;font-size:13px!important;cursor:pointer!important;margin-bottom:10px!important;padding:0!important}`;
            (document.head || document.documentElement).appendChild(style);
        }

        const btn = document.createElement('div');
        btn.id = 'as-btn'; btn.innerHTML = '⚙️';
        const panel = document.createElement('div');
        panel.id = 'as-panel';
        panel.innerHTML = `
<div id="panel-main">
  <div class="as-header"><span>Auto Tools Hub</span><span style="cursor:pointer;opacity:.7;font-size:17px" id="as-close">✕</span></div>
  <div class="as-tool-btn" id="btn-link4m"><div style="font-size:18px;width:26px;text-align:center">🔗</div><div><div style="font-weight:600">link4m</div><div style="font-size:12px;color:#888">Cuộn · Tìm · Auto mã</div></div></div>
  <div class="as-tool-btn" id="btn-gtrafic"><div style="font-size:18px;width:26px;text-align:center">🚦</div><div><div style="font-weight:600">gtrafic</div><div style="font-size:12px;color:#888">Tìm Google tab mới</div></div></div>
  <div class="as-tool-btn" id="btn-layma"><div style="font-size:18px;width:26px;text-align:center">🎫</div><div><div style="font-weight:600">layma.net</div><div style="font-size:12px;color:#888">TK1 · LẤY MÃ · Truy cập thẳng</div></div></div>
</div>
<div id="panel-link4m" style="display:none">
  <div class="as-header" id="drag-handle"><span>link4m</span><span style="cursor:pointer;opacity:.7" id="as-close2">✕</span></div>
  <div class="as-tabs" id="link4m-tabs"><div data-tab="config" class="active">Config</div><div data-tab="scroll">Cuộn</div><div data-tab="search">Tìm link</div></div>
  <div class="as-body">
    <button class="back-btn" id="btn-back">← Menu</button>
    <div id="tab-config">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🔄 Cuộn</span><div id="as-cfg-scroll-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🎯 Lấy mã</span><div id="as-cfg-layma-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>📋 Dán mã</span><div id="as-cfg-danma-sw" class="as-switch"></div></div>
      <button class="as-btn-main" id="as-manual-layma">Click LẤY MÃ</button>
      <button class="as-btn-main as-btn-orange" id="as-manual-extract">📋 Đọc mã</button>
    </div>
    <div id="tab-scroll" style="display:none">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🔄 Cuộn</span><div id="as-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🎯 Lấy mã</span><div id="as-layma-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>📋 Dán mã</span><div id="as-danma-sw" class="as-switch"></div></div>
    </div>
    <div id="tab-search" style="display:none">
      <div style="font-size:12px;color:#aaa">Từ khóa</div><input id="as-keyword">
      <div style="font-size:12px;color:#aaa">Domain</div><input id="as-domain">
      <button class="as-btn-main as-btn-green" id="as-ai-fill">🤖 AI đọc</button>
      <button class="as-btn-main" id="as-search-btn">🔍 Tìm (tab mới)</button>
      <div id="as-ai-status" style="font-size:11px;color:#94a3b8;min-height:16px"></div>
    </div>
  </div>
</div>
<div id="panel-gtrafic" style="display:none">
  <div class="as-header" id="drag-handle-gt"><span>gtrafic</span><span style="cursor:pointer;opacity:.7" id="as-close-gt">✕</span></div>
  <div class="as-tabs" id="gtrafic-tabs"><div data-tab="gt-config" class="active">Config</div><div data-tab="gt-search">Tìm link</div></div>
  <div class="as-body">
    <button class="back-btn" id="btn-back-gt">← Menu</button>
    <div id="tab-gt-config">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🎯 Lấy mã</span><div id="as-gt-layma-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>📋 Dán mã</span><div id="as-gt-danma-sw" class="as-switch"></div></div>
      <div style="font-size:11px;color:#fbbf24;line-height:1.4;margin-bottom:10px;padding:8px;background:#2a1f00;border-radius:8px;border:1px solid #854d0e">
        ⚠ <b>Gtrafic dễ lỗi / sai mã</b> — nút countdown, overlay đỏ, mã đổi theo phiên. Nên kiểm tra mã trước khi dán.
      </div>
      <button class="as-btn-main" id="as-gt-manual-layma">Click nút lấy mã</button>
      <button class="as-btn-main as-btn-orange" id="as-gt-manual-extract">📋 Đọc mã</button>
    </div>
    <div id="tab-gt-search" style="display:none">
      <div style="font-size:12px;color:#aaa">Từ khóa</div><input id="as-gt-keyword">
      <div style="font-size:12px;color:#aaa">Domain</div><input id="as-gt-domain">
      <button class="as-btn-main as-btn-green" id="as-gt-ai-fill">🤖 Đọc title + domain</button>
      <button class="as-btn-main" id="as-gt-search-btn">🔍 Tìm Google</button>
      <div id="as-gt-ai-status" style="font-size:11px;color:#94a3b8;min-height:16px"></div>
      <div style="font-size:11px;color:#fbbf24;margin-top:8px;line-height:1.35">⚠ Gtrafic dễ lệch kết quả / sai mã — đối chiếu title + domain trước khi lấy mã.</div>
    </div>
  </div>
</div>
<div id="panel-layma" style="display:none">
  <div class="as-header" id="drag-handle-lm"><span>layma.net</span><span style="cursor:pointer;opacity:.7" id="as-close-lm">✕</span></div>
  <div class="as-tabs" id="layma-tabs"><div data-tab="lm-config" class="active">Config</div><div data-tab="lm-search">Tìm link</div><div data-tab="lm-direct">Truy cập</div></div>
  <div class="as-body">
    <button class="back-btn" id="btn-back-lm">← Menu</button>
    <div id="tab-lm-config">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>🎯 Tự lấy mã</span><div id="as-lm-layma-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>📋 Tự dán mã</span><div id="as-lm-danma-sw" class="as-switch"></div></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>👆 Tự xử lý yêu cầu web</span><div id="as-lm-whaton-sw" class="as-switch"></div></div>
      <div style="font-size:11px;color:#aaa;line-height:1.4;margin-bottom:8px">
        Bật: <b>Chạm màn hình</b> → click · <b>Cuộn lên/xuống</b> → top/bottom · Có <b>Mã Code</b> → dừng cuộn, gửi về layma dán.
      </div>
      <button class="as-btn-main" id="as-lm-manual-layma">Click LẤY MÃ ngay</button>
      <button class="as-btn-main as-btn-orange" id="as-lm-manual-extract">📋 Đọc mã trên trang</button>
    </div>
    <div id="tab-lm-search" style="display:none">
      <div style="font-size:12px;color:#aaa">Từ khóa (#TK1)</div><input id="as-lm-keyword" placeholder="sunwin">
      <div style="font-size:12px;color:#aaa">Domain (ảnh #hinh_nv)</div><input id="as-lm-domain" placeholder="domain…">
      <button class="as-btn-main as-btn-green" id="as-lm-ai-fill">🤖 Đọc TK1 + AI ảnh</button>
      <button class="as-btn-main as-btn-orange" id="as-lm-ai-fill-search">🤖 Đọc + Tìm Google (tab mới)</button>
      <button class="as-btn-main" id="as-lm-search-btn">🔍 Tìm Google</button>
      <div id="as-lm-ai-status" style="font-size:11px;color:#94a3b8;min-height:16px;margin-top:6px"></div>
      <div style="font-size:11px;color:#86efac;margin-top:6px;line-height:1.35">Google mở <b>cùng tab</b>. Có mã → quay lại layma để dán.</div>
    </div>
    <div id="tab-lm-direct" style="display:none">
      <div style="font-size:12px;color:#aaa;margin-bottom:6px">Dán link cần truy cập thẳng</div>
      <input id="as-lm-direct-url" placeholder="https://...">
      <button class="as-btn-main as-btn-green" id="as-lm-direct-go">🚀 Truy cập thẳng (cùng tab)</button>
      <button class="as-btn-main" id="as-lm-direct-new">🆕 Mở tab mới</button>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;line-height:1.4">Lưu tab layma làm gốc → mở link → lấy mã → quay về dán <b>#codeInput</b>.</div>
    </div>
  </div>
</div>`;

        // Inline style cứng — chống CSS/JS trang (đặc biệt link4m) ẩn nút
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '52px', height: '52px',
            background: 'linear-gradient(135deg,#1a73e8,#0d47a1)', color: '#fff',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', zIndex: '2147483647', boxShadow: '0 4px 16px rgba(0,0,0,.45)',
            cursor: 'pointer', opacity: '1', visibility: 'visible', pointerEvents: 'auto',
            transform: 'none', margin: '0', padding: '0', border: 'none'
        });
        const mount = document.body || document.documentElement;
        mount.appendChild(btn);
        mount.appendChild(panel);

        btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            if (panel.style.display === 'block') {
                Object.assign(panel.style, {
                    position: 'fixed', bottom: '85px', right: '12px', zIndex: '2147483647',
                    opacity: '1', visibility: 'visible', pointerEvents: 'auto', display: 'block'
                });
            }
        };
        const hideAll = () => {
            ['panel-main', 'panel-link4m', 'panel-gtrafic', 'panel-layma'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        };
        ['as-close', 'as-close2', 'as-close-gt', 'as-close-lm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => { panel.style.display = 'none'; };
        });
        document.getElementById('btn-link4m').onclick = () => { hideAll(); document.getElementById('panel-link4m').style.display = 'block'; };
        document.getElementById('btn-gtrafic').onclick = () => { hideAll(); document.getElementById('panel-gtrafic').style.display = 'block'; };
        document.getElementById('btn-layma').onclick = () => { hideAll(); document.getElementById('panel-layma').style.display = 'block'; };
        document.getElementById('btn-back').onclick = () => { hideAll(); document.getElementById('panel-main').style.display = 'block'; };
        document.getElementById('btn-back-gt').onclick = () => { hideAll(); document.getElementById('panel-main').style.display = 'block'; };
        document.getElementById('btn-back-lm').onclick = () => { hideAll(); document.getElementById('panel-main').style.display = 'block'; };
        // show main by default structure
        document.getElementById('panel-main').style.display = 'block';

        function bindTabs(tabBarId, prefix) {
            document.querySelectorAll('#' + tabBarId + ' div').forEach(tab => {
                tab.onclick = () => {
                    document.querySelectorAll('#' + tabBarId + ' div').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    document.querySelectorAll('#' + tabBarId).forEach(() => {});
                    // hide siblings in same body
                    const body = tab.closest('.as-body') || tab.parentElement.nextElementSibling;
                    // simpler: known tab ids
                };
            });
        }
        document.querySelectorAll('#link4m-tabs div').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#link4m-tabs div').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                ['config', 'scroll', 'search'].forEach(n => {
                    const el = document.getElementById('tab-' + n);
                    if (el) el.style.display = tab.dataset.tab === n ? 'block' : 'none';
                });
            };
        });
        document.querySelectorAll('#gtrafic-tabs div').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#gtrafic-tabs div').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                ['gt-config', 'gt-search'].forEach(n => {
                    const el = document.getElementById('tab-' + n);
                    if (el) el.style.display = tab.dataset.tab === n ? 'block' : 'none';
                });
            };
        });
        document.querySelectorAll('#layma-tabs div').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#layma-tabs div').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                ['lm-config', 'lm-search', 'lm-direct'].forEach(n => {
                    const el = document.getElementById('tab-' + n);
                    if (el) el.style.display = tab.dataset.tab === n ? 'block' : 'none';
                });
            };
        });

        const toggleLayMa = () => { autoLayMaEnabled = !autoLayMaEnabled; saveUserConfig(); updateSwitch(); };
        const toggleDanMa = () => { autoDanMaEnabled = !autoDanMaEnabled; saveUserConfig(); updateSwitch(); };
        const toggleWhatOn = () => { autoWhatOnEnabled = !autoWhatOnEnabled; saveUserConfig(); updateSwitch(); };
        ['as-sw', 'as-cfg-scroll-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.onclick = toggleScroll; });
        ['as-layma-sw', 'as-cfg-layma-sw', 'as-gt-layma-sw', 'as-lm-layma-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.onclick = toggleLayMa; });
        ['as-danma-sw', 'as-cfg-danma-sw', 'as-gt-danma-sw', 'as-lm-danma-sw'].forEach(id => { const el = document.getElementById(id); if (el) el.onclick = toggleDanMa; });
        const whatonSw = document.getElementById('as-lm-whaton-sw');
        if (whatonSw) whatonSw.onclick = toggleWhatOn;

        const doExtract = () => {
            const code = extractPromoCode();
            if (!code) return alert('Chưa thấy mã');
            if (confirm('Mã: ' + code + '\nGửi về form?')) submitCode(code);
        };
        const doManualLay = () => {
            const b = findLayMaButton();
            if (!b) return alert('Không thấy nút LẤY MÃ');
            b.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => forcePhysicalClick(b), 2500);
        };
        ['as-manual-layma', 'as-gt-manual-layma', 'as-lm-manual-layma'].forEach(id => {
            const el = document.getElementById(id); if (el) el.onclick = doManualLay;
        });
        ['as-manual-extract', 'as-gt-manual-extract', 'as-lm-manual-extract'].forEach(id => {
            const el = document.getElementById(id); if (el) el.onclick = doExtract;
        });

        document.getElementById('as-search-btn').onclick = () => startSmartSearch(document.getElementById('as-keyword').value.trim(), document.getElementById('as-domain').value.trim());
        document.getElementById('as-ai-fill').onclick = () => aiFillGeneric('as-ai-status', () => document.getElementById('as-keyword').value || scrapeLaymaKeyword() || scrapeGtraficKeyword(), false);

        document.getElementById('as-gt-search-btn').onclick = () => startSmartSearch(document.getElementById('as-gt-keyword').value.trim(), document.getElementById('as-gt-domain').value.trim());
        document.getElementById('as-gt-ai-fill').onclick = () => {
            const kw = scrapeGtraficKeyword();
            const title = scrapeGtraficResultTitle();
            const full = (kw && title && !title.toLowerCase().includes(kw.toLowerCase())) ? (kw + ' ' + title) : (title || kw);
            const kEl = document.getElementById('as-gt-keyword');
            if (kEl && full) kEl.value = full;
            aiFillGeneric('as-gt-ai-status', () => full, false);
        };

        document.getElementById('as-lm-search-btn').onclick = () => startSmartSearch(document.getElementById('as-lm-keyword').value.trim() || scrapeLaymaKeyword(), document.getElementById('as-lm-domain').value.trim());
        document.getElementById('as-lm-ai-fill').onclick = () => aiFillGeneric('as-lm-ai-status', scrapeLaymaKeyword, false);
        document.getElementById('as-lm-ai-fill-search').onclick = () => aiFillGeneric('as-lm-ai-status', scrapeLaymaKeyword, true);

        function openLaymaDirect(sameTab) {
            let u = (document.getElementById('as-lm-direct-url').value || '').trim();
            if (!u) return alert('Dán link trước!');
            if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
            markOriginTab();
            GM_setValue('as_force_layma', true);
            GM_setValue('as_keep_origin_tab', true);
            GM_setValue('as_original_url', location.href);
            if (sameTab) {
                location.href = u;
            } else {
                const w = window.open(u, '_blank');
                if (!w) alert('Cho phép popup hoặc dùng Truy cập cùng tab.');
                else try { w.focus(); } catch (e) {}
            }
        }
        const dGo = document.getElementById('as-lm-direct-go');
        const dNew = document.getElementById('as-lm-direct-new');
        if (dGo) dGo.onclick = () => openLaymaDirect(true);
        if (dNew) dNew.onclick = () => openLaymaDirect(false);

        // auto-fill keyword on layma when open panel
        try {
            if (isLaymaHost()) {
                const kw = scrapeLaymaKeyword();
                const el = document.getElementById('as-lm-keyword');
                if (el && kw) el.value = kw;
            }
        } catch (e) {}

        updateSwitch();
        console.log('[Auto Tools] v6.61 — UI ready (link4m menu fix)');
        } catch (err) {
            console.error('[Auto Tools] ensureUI error:', err);
        }
    }

    function scheduleEnsureUI() {
        try { ensureUI(); } catch (e) { console.error(e); }
    }

    if (document.body) scheduleEnsureUI();
    else document.addEventListener('DOMContentLoaded', scheduleEnsureUI);
    setTimeout(scheduleEnsureUI, 500);
    setTimeout(scheduleEnsureUI, 1500);
    setTimeout(scheduleEnsureUI, 3000);
    // link4m hay rebuild DOM → check dày hơn trên host gốc
    setInterval(() => {
        try {
            const b = document.getElementById('as-btn');
            if (!b || (document.body && !document.body.contains(b))) scheduleEnsureUI();
        } catch (e) {}
    }, isOriginFormHost() ? 1500 : 4000);

    // Nếu body bị thay thế hoàn toàn (SPA / link4m)
    try {
        const mo = new MutationObserver(() => {
            try {
                const b = document.getElementById('as-btn');
                if (!b || (document.body && !document.body.contains(b))) scheduleEnsureUI();
            } catch (e) {}
        });
        const startObs = () => {
            try {
                if (document.documentElement) mo.observe(document.documentElement, { childList: true, subtree: false });
                if (document.body) mo.observe(document.body, { childList: true, subtree: false });
            } catch (e) {}
        };
        if (document.body) startObs();
        else document.addEventListener('DOMContentLoaded', startObs);
    } catch (e) {}
})();
