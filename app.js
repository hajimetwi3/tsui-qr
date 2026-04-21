(() => {
  'use strict';

  /* =========================================================
   * Tsui QR - app.js
   *   kazuhikoarase/qrcode-generator を同梱する前提
   *   グローバル関数 `qrcode(typeNumber, errorCorrectionLevel)` を使用
   * ========================================================= */

  const state = {
    type: 'text',
    ec: 'M',
    size: 'm',
    margin: '2',
    theme: 'mono',
  };

  /* ---------- TYPE定義（画面上部ヘッダ表示用） ---------- */
  const TYPE_INFO = {
    text:  { name: 'Text / URL', desc: 'テキスト または URL を埋め込みます' },
    wifi:  { name: 'Wi-Fi',      desc: 'SSIDとパスワードで Wi-Fi 接続情報を生成' },
    email: { name: 'Mail',       desc: 'メール送信用の mailto リンクを生成' },
    tel:   { name: 'Tel',        desc: '電話発信用の tel リンクを生成' },
    sms:   { name: 'SMS',        desc: 'SMS送信用の sms リンクを生成' },
    vcard: { name: 'vCard',      desc: '連絡先カード（vCard 3.0）を生成' },
    geo:   { name: 'Geo',        desc: '位置情報（geo:）を生成。iOSでは地図アプリが開かない場合あり' },
  };

  /* ---------- 設定保存（入力内容は保存しない） ---------- */
  const STORAGE_KEY = 'tsui-qr-settings-v1';

  // 許可する値のホワイトリスト（不正な値や予期せぬキーをガード）
  const ALLOWED = {
    type:   ['text', 'wifi', 'email', 'tel', 'sms', 'vcard', 'geo'],
    ec:     ['L', 'M', 'Q', 'H'],
    size:   ['s', 'm', 'l', 'xl'],
    margin: ['0', '2', '4'],
    theme:  ['mono', 'invert', 'green', 'amber', 'pink', 'cyber'],
  };

  const loadSettings = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!s || typeof s !== 'object') return;
      // 許可キー・許可値のみ取り込む
      for (const key of Object.keys(ALLOWED)) {
        if (ALLOWED[key].includes(s[key])) state[key] = s[key];
      }
    } catch (_) { /* noop */ }
  };
  const saveSettings = () => {
    try {
      // 既知キーのみシリアライズ
      const out = {};
      for (const key of Object.keys(ALLOWED)) out[key] = state[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch (_) { /* noop */ }
  };

  /* ---------- テンプレート組み立て ---------- */
  // MECARD/WIFI書式用エスケープ: \ ; , : "
  const esc = (s) => String(s).replace(/([\\;,":])/g, '\\$1');

  const val = (id) => (document.getElementById(id)?.value || '').trim();

  const build = () => {
    switch (state.type) {
      case 'text': {
        return document.getElementById('in-text').value;
      }
      case 'wifi': {
        const ssid = val('wf-ssid');
        if (!ssid) return '';
        const pass = val('wf-pass');
        const auth = document.querySelector('input[name="wf-auth"]:checked')?.value || 'WPA';
        const hidden = document.getElementById('wf-hidden').checked ? 'H:true;' : '';
        const p = auth === 'nopass' ? '' : `P:${esc(pass)};`;
        return `WIFI:T:${auth};S:${esc(ssid)};${p}${hidden};`;
      }
      case 'email': {
        const to = val('em-to');
        if (!to) return '';
        const q = [];
        const sub = val('em-sub'); if (sub) q.push('subject=' + encodeURIComponent(sub));
        const body = val('em-body'); if (body) q.push('body=' + encodeURIComponent(body));
        return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
      }
      case 'tel': {
        const n = val('tel-num');
        return n ? 'tel:' + n : '';
      }
      case 'sms': {
        const n = val('sms-num');
        if (!n) return '';
        const b = val('sms-body');
        return 'sms:' + n + (b ? '?body=' + encodeURIComponent(b) : '');
      }
      case 'vcard': {
        // vCard 3.0 エスケープ: \ ; , 改行
        const vesc = (s) => String(s)
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\r\n|\r|\n/g, '\\n');

        const fn = val('vc-fn');
        if (!fn) return '';
        const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + vesc(fn)];
        const org = val('vc-org'); if (org) lines.push('ORG:' + vesc(org));
        const tel = val('vc-tel'); if (tel) lines.push('TEL:' + vesc(tel));
        const em  = val('vc-em');  if (em)  lines.push('EMAIL:' + vesc(em));
        const url = val('vc-url'); if (url) lines.push('URL:' + vesc(url));
        lines.push('END:VCARD');
        return lines.join('\n');
      }
      case 'geo': {
        const la = val('geo-lat'), ln = val('geo-lng');
        return (la && ln) ? `geo:${la},${ln}` : '';
      }
      default:
        return '';
    }
  };

  /* ---------- QR生成 ---------- */
  const qrBox = document.getElementById('qr-box');
  const qrMsg = document.getElementById('qr-msg');
  const charCount = document.getElementById('char-count');
  let lastQr = null;

  // kazuhikoarase版のデフォルト stringToBytes は latin-1 相当で日本語等が壊れる。
  // TextEncoder による UTF-8 変換に差し替え。
  if (typeof qrcode === 'function' && 'stringToBytes' in qrcode) {
    qrcode.stringToBytes = function (s) {
      return Array.from(new TextEncoder().encode(String(s)));
    };
  }

  const generate = (text, ecLevel) => {
    // typeNumber=0 で自動バージョン選定。modeは省略し自動判定（数字/英数/バイト）。
    const qr = qrcode(0, ecLevel);
    qr.addData(text);
    qr.make();
    return {
      size: qr.getModuleCount(),
      isDark: (r, c) => qr.isDark(r, c),
    };
  };

  const render = () => {
    const text = build();
    charCount.textContent = `${text.length} chars`;
    if (!text) {
      qrBox.innerHTML = '';
      qrMsg.textContent = '';
      lastQr = null;
      return;
    }
    try {
      lastQr = generate(text, state.ec);
      qrBox.innerHTML = toSvg(lastQr, parseInt(state.margin, 10));
      qrMsg.textContent = '';
      delete qrMsg.dataset.kind;
    } catch (e) {
      qrBox.innerHTML = '';
      // 原因の切り分けをしやすくログは残すが、UIメッセージは利用者向けに統一
      if (typeof console !== 'undefined') console.warn('[TsuiQR] generate failed:', e);
      qrMsg.dataset.kind = 'err';
      qrMsg.textContent = '入力量が多すぎてQRに収まりません。ECを下げるか、内容を減らしてください。';
      lastQr = null;
    }
  };

  /* ---------- SVG描画 ---------- */
  // SVG属性値として安全な文字列に変換（XSS対策）
  const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // カラー値の簡易バリデーション（#hex / rgb() / rgba() / 基本名のみ許可）
  const safeColor = (c, fallback) => {
    const v = String(c || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    if (/^rgb(a)?\([\d.,\s%]+\)$/.test(v)) return v;
    if (/^[a-zA-Z]+$/.test(v)) return v; // transparent, black, white等
    return fallback;
  };

  const getColors = () => {
    const cs = getComputedStyle(document.documentElement);
    return {
      bg: safeColor(cs.getPropertyValue('--qr-bg').trim(), '#ffffff'),
      fg: safeColor(cs.getPropertyValue('--qr-fg').trim(), '#000000'),
    };
  };

  const toSvg = (qr, border) => {
    const parts = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.isDark(y, x)) parts.push(`M${x + border},${y + border}h1v1h-1z`);
      }
    }
    const dim = qr.size + border * 2;
    const { bg, fg } = getColors();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">
<rect width="100%" height="100%" fill="${escAttr(bg)}"/>
<path d="${parts.join(' ')}" fill="${escAttr(fg)}"/>
</svg>`;
  };

  /* ---------- 保存/コピー ---------- */
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  // 衝突しないようにタイムスタンプ付与（YYYYMMDD-HHMMSS）
  const stamp = () => {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  };

  const saveSvg = () => {
    if (!lastQr) return;
    const svg = toSvg(lastQr, parseInt(state.margin, 10));
    download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `qrcode-${stamp()}.svg`);
  };

  const renderPngBlob = (scale = 16) => new Promise((res) => {
    if (!lastQr) return res(null);
    const border = parseInt(state.margin, 10);
    const dim = (lastQr.size + border * 2) * scale;
    const cv = document.createElement('canvas');
    cv.width = cv.height = dim;
    const ctx = cv.getContext('2d');
    const { bg, fg } = getColors();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = fg;
    for (let y = 0; y < lastQr.size; y++) {
      for (let x = 0; x < lastQr.size; x++) {
        if (lastQr.isDark(y, x)) {
          ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
        }
      }
    }
    cv.toBlob((b) => res(b), 'image/png');
  });

  const savePng = async () => {
    const blob = await renderPngBlob(16);
    if (blob) download(blob, `qrcode-${stamp()}.png`);
  };

  const copyPng = async () => {
    const blob = await renderPngBlob(16);
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashMsg('クリップボードにコピーしました', 'ok');
    } catch (_) {
      flashMsg('コピーに失敗しました（ブラウザが未対応の可能性）', 'err');
    }
  };

  let msgTimer = null;
  const flashMsg = (text, kind) => {
    qrMsg.textContent = text;
    qrMsg.dataset.kind = kind || 'info';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      qrMsg.textContent = '';
      delete qrMsg.dataset.kind;
    }, 1800);
  };

  /* ---------- UI反映 ---------- */
  const ipName = document.getElementById('ip-name');
  const ipDesc = document.getElementById('ip-desc');

  const applyState = () => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.size = state.size;
    document.querySelectorAll('.panel button[data-k]').forEach((b) => {
      b.classList.toggle('on', state[b.dataset.k] === b.dataset.v);
    });
    document.querySelectorAll('.ip').forEach((p) => {
      p.hidden = p.dataset.type !== state.type;
    });
    const info = TYPE_INFO[state.type] || TYPE_INFO.text;
    ipName.textContent = info.name;
    ipDesc.textContent = info.desc;
  };

  /* ---------- イベント配線 ---------- */
  document.querySelectorAll('.panel button[data-k]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state[btn.dataset.k] = btn.dataset.v;
      applyState();
      saveSettings();
      render();
    });
  });

  document.querySelectorAll('.ip input, .ip textarea').forEach((el) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  document.getElementById('btn-svg').addEventListener('click', saveSvg);
  document.getElementById('btn-png').addEventListener('click', savePng);
  document.getElementById('btn-copy').addEventListener('click', copyPng);

  // Wi-Fiパスワード表示切替
  const pwToggle = document.getElementById('wf-pass-toggle');
  const pwInput = document.getElementById('wf-pass');
  if (pwToggle && pwInput) {
    pwToggle.addEventListener('click', () => {
      const shown = pwInput.type === 'text';
      pwInput.type = shown ? 'password' : 'text';
      pwToggle.textContent = shown ? '表示' : '隠す';
      pwToggle.setAttribute('aria-pressed', String(!shown));
    });
  }

  // Aboutモーダル
  const mb = document.getElementById('modal-backdrop');
  document.getElementById('about-btn').addEventListener('click', () => mb.classList.add('open'));
  document.getElementById('modal-close').addEventListener('click', () => mb.classList.remove('open'));
  mb.addEventListener('click', (e) => { if (e.target === mb) mb.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') mb.classList.remove('open'); });

  /* ---------- Service Worker登録（PWA） ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン機能が使えないだけ、致命ではない */ });
    });
  }

  /* ---------- 初期化 ---------- */
  loadSettings();
  applyState();
  render();
})();
