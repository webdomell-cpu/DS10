/**
 * DIGITAL SIGNAGE CMS v9.0 — DISPLAY JS
 * Multi-Tenant, Playlist Engine, App Zones, Remote Control, Heartbeat
 */
'use strict';

class MenuboardDisplay {
    constructor() {
        this.data           = null;
        this.products       = [];
        this.zones          = [];
        this.settings       = {};
        this.ticker         = {};
        this.displayConfig  = null;
        this.playlist       = null;
        this.playlistIndex  = 0;
        this.playlistTimer  = null;
        this.installedApps  = [];
        this.weather        = null;
        this.lastModified   = null;
        this.isBlackout     = false;
        this.currentLanguage = 'de';
        this.init();
    }

    // ─── INIT ───────────────────────────────────────────────────────
    async init() {
        await this.loadData();
        await this.loadSchedule();
        await this.loadWeather();
        this.applyTheme();
        this.applyFont();
        this.render();
        this.hideLoading();
        this.startAutoRefresh();
        this.startHeartbeat();
        this.startCommandPolling();
        this.startClocks();
        this.startPlaylistEngine();
        this.setupKeyboard();
    }

    // ─── DATA ────────────────────────────────────────────────────────
    async loadData() {
        try {
            const tenantSlug = window.TENANT_SLUG;
            if (!tenantSlug) { console.error('TENANT_SLUG not set'); return; }

            const res  = await fetch(`/api/public/${tenantSlug}/data`);
            if (!res.ok) throw new Error('Data fetch failed: ' + res.status);
            const full = await res.json();

            const slug = window.DISPLAY_SLUG;
            const disp = slug ? (full.displays||[]).find(d => d.slug === slug) : null;

            this.displayConfig = disp || null;
            this.settings      = { ...full.settings, ...(disp?.settings || {}) };
            this.zones         = (disp?.zones?.length ? disp.zones : full.zones) || [];
            this.products      = full.products  || [];
            this.ticker        = full.ticker    || {};
            this.installedApps = full.apps      || [];
            this.shapes        = full.shapes    || [];
            this.data          = full;
            this.lastModified  = full.lastModified;
            this.currentLanguage = this.settings?.languages?.default || 'de';

            if (disp?.playlistId) {
                const pl = (full.playlists||[]).find(p => p.id === disp.playlistId);
                if (pl?.items?.length) this.playlist = pl;
            }
        } catch(e) { console.error('loadData:', e); }
    }

    // ─── SCHEDULE ────────────────────────────────────────────────────
    async loadSchedule() {
        try {
            const tenantSlug = window.TENANT_SLUG;
            if (!tenantSlug) return;
            const res = await fetch(`/api/public/${tenantSlug}/schedule`);
            const d   = await res.json();
            if (d.activeSchedule) {
                if (d.activeSchedule.theme)      this.settings.theme      = d.activeSchedule.theme;
                if (d.activeSchedule.tickerText) this.ticker.text         = d.activeSchedule.tickerText;
                if (d.activeSchedule.templateId) {
                    const tpl = (this.data?.templates||[]).find(t => t.id === d.activeSchedule.templateId);
                    if (tpl?.zones?.length) this.zones = JSON.parse(JSON.stringify(tpl.zones));
                }
            }
        } catch(e) {}
    }

    // ─── WEATHER ─────────────────────────────────────────────────────
    async loadWeather() {
        try {
            const w   = this.data?.weather || {};
            if (w.enabled === false) return;
            const lat = w.latitude  || '52.52';
            const lon = w.longitude || '13.41';
            const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            if (res.ok) this.weather = await res.json();
        } catch(e) {}
    }

    // ─── THEME ───────────────────────────────────────────────────────
    applyTheme() {
        const theme = this.settings.theme || 'dark';
        document.body.className = 'theme-' + theme;
        const themes = {
            dark:   { bg:'#0a0a0f', card:'#141420', border:'#2a2a3a', t1:'#ffffff', t2:'#b0b0c8', tm:'#6a6a8a', accent:'#6c63ff', gold:'#FFD700' },
            light:  { bg:'#f0f2f5', card:'#ffffff', border:'#e0e0e0', t1:'#1a1a2e', t2:'#4a4a6a', tm:'#8a8aaa', accent:'#6366f1', gold:'#b8860b' },
            burger: { bg:'#1a0a00', card:'#2a1500', border:'#4a3000', t1:'#ffffff', t2:'#e0c8a0', tm:'#a08060', accent:'#ff6b00', gold:'#ffaa00' },
            coffee: { bg:'#1a1200', card:'#2a1f0a', border:'#4a3a20', t1:'#ffffff', t2:'#d4c4a8', tm:'#a09070', accent:'#8b6914', gold:'#c4a35a' }
        };
        const r = document.documentElement;
        if (theme === 'custom' && this.settings.customTheme) {
            const c = this.settings.customTheme;
            r.style.setProperty('--bg-primary',    c.bgPrimary    || '#0a0a0f');
            r.style.setProperty('--bg-card',        c.bgCard       || '#141420');
            r.style.setProperty('--border-color',   c.borderColor  || '#2a2a3a');
            r.style.setProperty('--text-primary',   c.textPrimary  || '#ffffff');
            r.style.setProperty('--text-secondary', c.textSecondary|| '#b0b0c8');
            r.style.setProperty('--accent-primary', c.accentPrimary|| '#6c63ff');
            r.style.setProperty('--accent-gold',    c.priceColor   || '#FFD700');
        } else {
            const t = themes[theme] || themes.dark;
            r.style.setProperty('--bg-primary',    t.bg);
            r.style.setProperty('--bg-card',        t.card);
            r.style.setProperty('--border-color',   t.border);
            r.style.setProperty('--text-primary',   t.t1);
            r.style.setProperty('--text-secondary', t.t2);
            r.style.setProperty('--text-muted',     t.tm);
            r.style.setProperty('--accent-primary', t.accent);
            r.style.setProperty('--accent-gold',    t.gold);
        }
    }

    applyFont() {
        const font = this.settings.font || 'Inter';
        document.body.style.fontFamily = `'${font}', system-ui, sans-serif`;
        const url = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g,'+')}:wght@300;400;500;600;700;800&display=swap`;
        if (!document.querySelector(`link[href*="${font}"]`)) {
            const lnk = document.createElement('link'); lnk.rel = 'stylesheet'; lnk.href = url; document.head.appendChild(lnk);
        }
    }

    // ─── RENDER ──────────────────────────────────────────────────────
    render() {
        if (this.isBlackout) return;
        const container = document.getElementById('displayContainer');
        if (!container) return;
        container.innerHTML = '';
        container.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden;background:var(--bg-primary)';

        const fadeIn = this.settings?.animations?.enabled !== false && this.settings?.animations?.productFadeIn !== false;

        this.zones.forEach((zone, i) => {
            if (zone.visible === false) return;
            const el = document.createElement('div');
            el.className = `display-zone zone-${zone.type}`;
            el.dataset.zoneId = zone.id;
            el.style.cssText = `position:absolute;left:${zone.x}%;top:${zone.y}%;width:${zone.w}%;height:${zone.h}%;box-sizing:border-box;overflow:hidden;`;
            if (fadeIn) { el.style.opacity='0'; el.style.transform='translateY(8px)'; el.style.transition=`opacity .4s ease ${i*.08}s,transform .4s ease ${i*.08}s`; }

            switch (zone.type) {
                case 'menu':    el.innerHTML = this.renderMenuZone(zone);    break;
                case 'media':   el.innerHTML = this.renderMediaZone(zone);   break;
                case 'ticker':  el.innerHTML = this.renderTickerZone(zone);  break;
                case 'text':    el.innerHTML = this.renderTextZone(zone);    break;
                case 'clock':   el.innerHTML = this.renderClockZone(zone);   break;
                case 'weather': el.innerHTML = this.renderWeatherZone(zone); break;
                case 'app':     this.renderAppZone(zone, el);               break;
                case 'social':  el.innerHTML = this.renderSocialZone(zone);  break;
            }

            container.appendChild(el);
            if (fadeIn) requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='none'; });
        });

        this.applyTickerSpeed();
        this.renderShapes();
        this.trackAnalytics();
    }

    // ─── SHAPES (SVG graphic elements) ───────────────────────────────
    renderShapes() {
        const shapes = this.shapes || this.data?.shapes || [];
        if (!shapes.length) return;

        const container = document.getElementById('displayContainer');
        if (!container) return;

        // Remove old SVG overlay
        container.querySelector('.display-shapes-overlay')?.remove();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'display-shapes-overlay');
        svg.setAttribute('viewBox', '0 0 1920 1080');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:visible';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);

        const sorted = [...shapes].sort((a,b) => (a.zIndex||0) - (b.zIndex||0));

        sorted.forEach(s => {
            if (s.opacity === 0) return;
            const ns = 'http://www.w3.org/2000/svg';
            let fill = s.fill || 'transparent';
            let filterId = null;

            // Gradient
            if (s.fillType === 'gradient') {
                const gid = 'dg-' + s.id;
                const angle = s.gradientAngle || 135;
                const rad = angle * Math.PI / 180;
                const lg = document.createElementNS(ns, 'linearGradient');
                lg.setAttribute('id', gid);
                lg.setAttribute('x1', (50 - Math.cos(rad)*50)+'%'); lg.setAttribute('y1', (50 - Math.sin(rad)*50)+'%');
                lg.setAttribute('x2', (50 + Math.cos(rad)*50)+'%'); lg.setAttribute('y2', (50 + Math.sin(rad)*50)+'%');
                const s1 = document.createElementNS(ns,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', s.gradientStart||'#6c63ff');
                const s2 = document.createElementNS(ns,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', s.gradientEnd||'#22d3a4');
                lg.appendChild(s1); lg.appendChild(s2); defs.appendChild(lg);
                fill = `url(#${gid})`;
            }

            // Shadow
            if (s.shadow) {
                filterId = 'df-' + s.id;
                const f = document.createElementNS(ns, 'filter');
                f.setAttribute('id', filterId);
                f.setAttribute('x','-50%'); f.setAttribute('y','-50%'); f.setAttribute('width','200%'); f.setAttribute('height','200%');
                const fe = document.createElementNS(ns,'feDropShadow');
                fe.setAttribute('dx', s.shadowX||4); fe.setAttribute('dy', s.shadowY||4);
                fe.setAttribute('stdDeviation', (s.shadowBlur||12)/2);
                fe.setAttribute('flood-color', s.shadowColor||'rgba(0,0,0,.4)');
                f.appendChild(fe); defs.appendChild(f);
            }

            let el;
            const setCommon = el => {
                el.setAttribute('opacity', s.opacity ?? 1);
                if (filterId) el.setAttribute('filter', `url(#${filterId})`);
            };

            if (s.tool === 'rect') {
                el = document.createElementNS(ns, 'rect');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                el.setAttribute('fill', fill);
                if (s.cornerRadius) el.setAttribute('rx', s.cornerRadius);
                if (s.stroke && s.stroke !== 'none') { el.setAttribute('stroke', s.stroke); el.setAttribute('stroke-width', s.strokeWidth||1); }
            } else if (s.tool === 'circle') {
                el = document.createElementNS(ns, 'ellipse');
                el.setAttribute('cx', s.x + s.w/2); el.setAttribute('cy', s.y + s.h/2);
                el.setAttribute('rx', s.w/2); el.setAttribute('ry', s.h/2);
                el.setAttribute('fill', fill);
                if (s.stroke && s.stroke !== 'none') { el.setAttribute('stroke', s.stroke); el.setAttribute('stroke-width', s.strokeWidth||1); }
            } else if (s.tool === 'line') {
                el = document.createElementNS(ns, 'line');
                el.setAttribute('x1', s.x); el.setAttribute('y1', s.y);
                el.setAttribute('x2', s.x2||s.x+100); el.setAttribute('y2', s.y2||s.y);
                el.setAttribute('stroke', s.stroke||'#fff'); el.setAttribute('stroke-width', s.strokeWidth||2);
                el.setAttribute('stroke-linecap', s.lineCap||'round');
                if (s.strokeDash === 'dashed') el.setAttribute('stroke-dasharray','12 6');
                else if (s.strokeDash === 'dotted') el.setAttribute('stroke-dasharray','2 6');
            } else if (s.tool === 'text') {
                el = document.createElementNS(ns, 'foreignObject');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                const div = document.createElement('div');
                const shadow = s.shadow ? `text-shadow:${s.shadowX||2}px ${s.shadowY||2}px ${s.shadowBlur||8}px ${s.shadowColor||'rgba(0,0,0,.6)'}` : '';
                const justify = s.textAlign==='center'?'center':s.textAlign==='right'?'flex-end':'flex-start';
                div.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:${justify};font-size:${s.fontSize||48}px;font-weight:${s.fontWeight||700};color:${s.textColor||'#fff'};text-align:${s.textAlign||'center'};line-height:1.2;padding:8px;${shadow};white-space:pre-wrap;word-break:break-word;`;
                if (s.fill && s.fill !== 'transparent') div.style.background = s.fill;
                div.textContent = s.text || '';
                div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                el.appendChild(div);
            } else if (s.tool === 'image') {
                const g = document.createElementNS(ns, 'g');
                if (s.cornerRadius) {
                    const clipId = 'dc-' + s.id;
                    const cp = document.createElementNS(ns, 'clipPath');
                    cp.setAttribute('id', clipId);
                    const r = document.createElementNS(ns, 'rect');
                    r.setAttribute('x', s.x); r.setAttribute('y', s.y);
                    r.setAttribute('width', s.w); r.setAttribute('height', s.h);
                    r.setAttribute('rx', s.cornerRadius);
                    cp.appendChild(r); defs.appendChild(cp);
                    g.setAttribute('clip-path', `url(#${clipId})`);
                }
                el = document.createElementNS(ns, 'image');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                el.setAttribute('href', s.src);
                el.setAttribute('preserveAspectRatio', s.objectFit==='contain'?'xMidYMid meet':'xMidYMid slice');
                if (filterId) g.setAttribute('filter', `url(#${filterId})`);
                g.setAttribute('opacity', s.opacity ?? 1);
                g.appendChild(el);
                svg.appendChild(g);
                return;
            }

            if (el) { setCommon(el); svg.appendChild(el); }
        });

        container.appendChild(svg);
    }

    // ─── MENU ZONE ───────────────────────────────────────────────────
    renderMenuZone(zone) {
        const ids  = zone.productIds || [];
        const prods = ids.map(id => this.products.find(p => p.id === id || p.id === parseInt(id))).filter(Boolean);
        if (!prods.length) return `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:8px;color:var(--text-secondary)"><i class="fas fa-utensils" style="font-size:28px"></i><p>Keine Produkte</p></div>`;

        const cur   = this.settings.currency || '€';
        const cpos  = this.settings.currencyPosition || 'after';
        const fmt   = p => cpos === 'before' ? `${cur} ${p}` : `${p} ${cur}`;
        const s     = zone.articleStyle || {};
        const cols  = s.columnsCount === 'auto'
            ? (prods.length <= 2 ? 2 : prods.length <= 6 ? 3 : 4)
            : parseInt(s.columnsCount) || 3;
        const layout  = s.cardLayout || 'vertical';
        const pStyle  = s.priceStyle || 'badge-gold';
        const pClass  = {
            'badge-gold':'price-badge-gold',
            'badge-dark':'price-badge-dark',
            'text-plain':'price-plain',
            'text-bold':'price-bold'
        }[pStyle] || 'price-badge-gold';

        const cards = prods.map(p => {
            const sold = p.stockStatus === 'soldout';
            const low  = p.stockStatus === 'low';
            const imgH = { large:'55%', medium:'45%', small:'35%' }[s.imageSize] || '50%';
            const img  = s.showImage !== false ? (p.image
                ? `<div class="product-img-wrap" style="height:${imgH};flex-shrink:0"><img src="${p.image}" alt="${p.title}" onerror="this.parentNode.innerHTML='<div class=pimg-placeholder><i class=fas fa-utensils></i></div>'">${sold?'<div class="stock-overlay soldout">AUSVERKAUFT</div>':low?'<div class="stock-overlay low">WENIG</div>':''}</div>`
                : `<div class="product-img-wrap" style="height:${imgH};flex-shrink:0"><div class="pimg-placeholder"><i class="fas fa-utensils"></i></div></div>`) : '';
            const badge = s.showBadge !== false && p.badge && !sold ? `<span class="pbadge pbadge-${p.badge.toLowerCase()}">${p.badge}</span>` : '';
            const price = s.showPrice !== false && !sold ? `<span class="${pClass}">${fmt(p.price)}</span>` : '';
            const titleStyle = (sold ? 'opacity:.5;' : '') + `text-align:${s.textAlign||'left'}`;
            const title = s.showTitle !== false ? `<div class="ptitle" style="${titleStyle}">${p.title}</div>` : '';
            const desc  = s.showDescription && p.description ? `<div class="pdesc" style="text-align:${s.textAlign||'left'}">${p.description}</div>` : '';

            if (layout === 'compact') return `<div class="pcard pcard-compact"><span class="ptitle" style="flex:1">${p.title}</span>${price}</div>`;
            if (layout === 'horizontal') return `<div class="pcard pcard-horizontal">${img}<div class="pinfo">${badge}${title}${desc}${price}</div></div>`;
            return `<div class="pcard"><div class="pimg-area">${img}${badge}${price}</div><div class="pinfo">${title}${desc}</div></div>`;
        }).join('');

        return `<div class="menu-zone-wrap"><div class="menu-zone-grid" style="grid-template-columns:repeat(${cols},1fr)">${cards}</div></div>`;
    }

    // ─── MEDIA ZONE ──────────────────────────────────────────────────
    renderMediaZone(zone) {
        const { mediaSrc:src='', mediaType:type='image' } = zone;
        if (!src) return `<div class="zone-placeholder"><i class="fas fa-image"></i><span>Kein Medium</span></div>`;
        if (type === 'video') return `<video src="${src}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover"></video>`;
        return `<img src="${src}" alt="Media" style="width:100%;height:100%;object-fit:cover">`;
    }

    // ─── TICKER ZONE ─────────────────────────────────────────────────
    renderTickerZone(zone) {
        const text = zone.tickerText || zone.text || this.ticker.text || '🍔 Willkommen!';
        const color = this.ticker.color || '#FFD700';
        const bg    = this.ticker.backgroundColor || '#1a1a2e';
        const size  = this.ticker.fontSize || 24;
        const rep   = `${text} ⬥ ${text} ⬥ ${text} ⬥ ${text}`;
        return `<div style="background:${bg};height:100%;display:flex;align-items:center;overflow:hidden">
            <div class="ticker-track" style="color:${color};font-size:${size}px;white-space:nowrap;display:inline-block;will-change:transform">${rep}</div>
        </div>`;
    }

    applyTickerSpeed() {
        document.querySelectorAll('.ticker-track').forEach(el => {
            const spd = this.ticker.speed || 50;
            const dur = Math.max(8, el.textContent.length / spd * 15);
            el.style.animation = `ticker-scroll ${dur}s linear infinite`;
        });
    }

    // ─── TEXT ZONE ───────────────────────────────────────────────────
    renderTextZone(zone) {
        const { text='', fontSize:size=24, color='#fff', textAlign:align='center' } = zone;
        const j = align==='center'?'center':align==='right'?'flex-end':'flex-start';
        return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:${j};padding:16px"><span style="color:${color};font-size:${size}px;font-weight:600;text-align:${align};line-height:1.4">${text}</span></div>`;
    }

    // ─── CLOCK ZONE ──────────────────────────────────────────────────
    renderClockZone(zone) {
        return `<div class="clock-zone" id="clk_${zone.id}">
            <div class="clock-time">00:00</div>
            <div class="clock-date">--.--.----</div>
        </div>`;
    }

    startClocks() {
        const tick = () => {
            const now = new Date();
            document.querySelectorAll('[id^="clk_"]').forEach(el => {
                const t = el.querySelector('.clock-time'); const d = el.querySelector('.clock-date');
                if (t) t.textContent = now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
                if (d) d.textContent = now.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
            });
        };
        tick(); setInterval(tick, 1000);
    }

    // ─── WEATHER ZONE ────────────────────────────────────────────────
    renderWeatherZone(zone) {
        if (!this.weather) return `<div class="zone-placeholder"><i class="fas fa-cloud"></i><span>Lädt…</span></div>`;
        const w = this.weather;
        return `<div class="weather-zone">
            <div class="weather-main"><span class="weather-icon">${w.icon||'🌡️'}</span><span class="weather-temp">${w.temperature}°C</span><span class="weather-wind">💨 ${w.windspeed} km/h</span></div>
            ${w.recommendation?`<div class="weather-rec">${w.recommendation}</div>`:''}
        </div>`;
    }

    // ─── APP ZONE ────────────────────────────────────────────────────
    renderAppZone(zone, el) {
        const installedApp = this.installedApps.find(a => a.id === zone.appId);
        if (!installedApp) {
            el.innerHTML = `<div class="zone-placeholder"><i class="fas fa-puzzle-piece"></i><span>App nicht gefunden</span></div>`;
            return;
        }
        const config = installedApp.config || {};

        switch (installedApp.appId) {
            case 'clock':
                el.innerHTML = this.renderClockZone({ id: zone.id + '_app' });
                break;
            case 'weather':
                el.innerHTML = this.renderWeatherZone(zone);
                // Refresh weather with app-specific config
                if (config.latitude || config.longitude) {
                    fetch(`/api/weather?lat=${config.latitude||'52.52'}&lon=${config.longitude||'13.41'}`)
                        .then(r => r.json()).then(w => { this.weather = w; el.innerHTML = this.renderWeatherZone(zone); }).catch(()=>{});
                }
                break;
            case 'countdown':
                el.innerHTML = this.renderCountdownApp(config, zone.id);
                break;
            case 'news-feed':
                el.innerHTML = `<div class="news-zone" id="news_${zone.id}"><div class="zone-placeholder"><i class="fas fa-newspaper"></i><span>Nachrichten laden…</span></div></div>`;
                this.loadNewsFeed(config, zone.id);
                break;
            case 'room-booking':
                el.innerHTML = this.renderRoomBookingApp(config, zone.id);
                this.loadRoomCalendar(config, zone.id);
                break;
            case 'social': {
                // Use the dedicated social-feed app iframe
                const plat   = config.platform || 'instagram';
                const hdl    = config.handle  || '';
                const htag   = config.hashtag || '';
                const tok    = config.token   || '';
                const cnt    = config.postCount || 6;
                const layout = config.layout  || '2x2';
                const demo   = !tok ? 'true' : 'false';
                const src    = `/app/social-feed?platform=${plat}&handle=${encodeURIComponent(hdl)}&hashtag=${encodeURIComponent(htag)}&token=${encodeURIComponent(tok)}&postCount=${cnt}&layout=${layout}&demo=${demo}&showCaptions=${config.showCaptions!==false}&showLikes=${config.showLikes!==false}&refreshMin=${config.refreshMin||15}`;
                el.innerHTML = `<iframe src="${src}" style="width:100%;height:100%;border:none;background:transparent" allowtransparency="true" loading="lazy"></iframe>`;
                break;
            }
            case 'menuboard': {
                const tenantSlug = window.TENANT_SLUG || 'demo';
                const mc = config;
                const mbSrc = `/app/menuboard?tenantSlug=${tenantSlug}&categoryFilter=${encodeURIComponent(mc.categoryFilter||'')}&columns=${mc.columns||'auto'}&showImages=${mc.showImages!==false}&showPrices=${mc.showPrices!==false}&showBadges=${mc.showBadges!==false}&cardStyle=${mc.cardStyle||'vertical'}&priceStyle=${mc.priceStyle||'badge-gold'}`;
                el.innerHTML = `<iframe src="${mbSrc}" style="width:100%;height:100%;border:none;background:transparent" loading="lazy"></iframe>`;
                break;
            }
            default:
                el.innerHTML = `<div class="zone-placeholder"><i class="fas fa-puzzle-piece"></i><span>${installedApp.name}</span></div>`;
        }
    }

    // ─── COUNTDOWN APP ───────────────────────────────────────────────
    renderCountdownApp(config, zoneId) {
        const id = 'cd_' + zoneId;
        const targetDate = config.targetDate || '';
        const label      = config.targetLabel || 'Event';
        setTimeout(() => {
            const el = document.getElementById(id);
            if (!el || !targetDate) return;
            const tick = () => {
                const diff = new Date(targetDate) - new Date();
                if (diff <= 0) { el.textContent = '🎉 ' + label + '!'; return; }
                const d = Math.floor(diff/86400000), h = Math.floor(diff%86400000/3600000), m = Math.floor(diff%3600000/60000), s = Math.floor(diff%60000/1000);
                el.textContent = `${d}d ${h}h ${m}m ${s}s`;
            };
            tick(); setInterval(tick, 1000);
        }, 100);
        return `<div class="countdown-zone">
            <div class="countdown-label">${label}</div>
            <div class="countdown-timer" id="${id}">—</div>
        </div>`;
    }

    // ─── ROOM BOOKING APP ────────────────────────────────────────────
    renderRoomBookingApp(config, zoneId) {
        return `<div class="room-zone" id="room_${zoneId}">
            <div class="room-header">
                <div class="room-icon"><i class="fas fa-door-open"></i></div>
                <div class="room-name">${config.roomName || 'Konferenzraum'}</div>
                <div class="room-capacity"><i class="fas fa-users"></i> ${config.roomCapacity || '—'}</div>
            </div>
            <div class="room-status room-available" id="room_status_${zoneId}">
                <i class="fas fa-circle-check"></i> Verfügbar
            </div>
            <div class="room-next" id="room_next_${zoneId}">
                <div style="color:var(--text-secondary);font-size:13px">Nächste Termine werden geladen…</div>
            </div>
            <div class="clock-zone" style="background:transparent;gap:4px;padding:0;margin-top:auto">
                <div class="clock-time" style="font-size:clamp(24px,3.5vw,52px)" id="clk_room_${zoneId}">00:00</div>
            </div>
        </div>`;
    }

    async loadRoomCalendar(config, zoneId) {
        if (!config.calendarUrl) return;
        // iCal/CalDAV parsing would require a backend proxy in production
        // For now, show placeholder with real-time clock
        const clockEl = document.getElementById('clk_room_' + zoneId);
        if (clockEl) {
            setInterval(() => { clockEl.textContent = new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }, 1000);
        }
    }

    // ─── NEWS FEED APP ───────────────────────────────────────────────
    async loadNewsFeed(config, zoneId) {
        const el = document.getElementById('news_' + zoneId);
        if (!el) return;
        try {
            // Use RSS2JSON proxy (free tier)
            const feedUrl = config.feedUrl || 'https://feeds.bbci.co.uk/news/rss.xml';
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=${config.itemCount||5}`;
            const res = await fetch(proxyUrl);
            const data = await res.json();
            if (data.status !== 'ok') throw new Error('Feed error');
            el.innerHTML = `<div class="news-zone-inner">
                <div class="news-header"><i class="fas fa-newspaper"></i> ${data.feed?.title || 'News'}</div>
                <div class="news-items">${data.items.map(item => `
                    <div class="news-item">
                        ${item.thumbnail ? `<div class="news-thumb"><img src="${item.thumbnail}" alt=""></div>` : ''}
                        <div class="news-content">
                            <div class="news-title">${item.title}</div>
                            <div class="news-date">${new Date(item.pubDate).toLocaleDateString('de-DE')}</div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        } catch(e) {
            el.innerHTML = `<div class="zone-placeholder"><i class="fas fa-newspaper"></i><span>Feed nicht verfügbar</span></div>`;
        }
    }

    // ─── SOCIAL ZONE ─────────────────────────────────────────────────
    renderSocialZone(zone) {
        const cfg    = zone.socialConfig || {};
        const handle = cfg.handle || '';
        const count  = cfg.postsCount || 4;
        const token  = cfg.embedToken || '';
        const mockPosts = ['🍔','🍟','🥤','🎉','🌮','🍕'].slice(0, count);

        if (token && handle) {
            const id = `ig_${zone.id || Date.now()}`;
            setTimeout(() => this.fetchInstagramPosts(handle, count, token, id), 100);
            return `<div class="social-zone" id="${id}"><div class="social-header"><i class="fab fa-instagram"></i><span>@${handle}</span></div>
                <div class="social-grid social-grid-${Math.min(count,4)}">${Array.from({length:count}).map((_,i)=>`<div class="social-card loading" style="animation-delay:${i*.1}s"><div class="social-shimmer"></div></div>`).join('')}</div>
            </div>`;
        }

        return `<div class="social-zone social-zone--demo">
            <div class="social-header"><i class="fab fa-instagram"></i><span>${handle?'@'+handle:'Instagram Feed'}</span><span class="social-demo-badge">Demo</span></div>
            <div class="social-grid social-grid-${Math.min(count,4)}">${mockPosts.map(e=>`<div class="social-card"><div class="social-card-img social-card-demo">${e}</div></div>`).join('')}</div>
            <div class="social-footer"><small>Token in Admin → Apps konfigurieren</small></div>
        </div>`;
    }

    async fetchInstagramPosts(handle, count, token, id) {
        try {
            const res  = await fetch(`https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp&limit=${count}&access_token=${token}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            const grid = document.getElementById(id)?.querySelector('.social-grid');
            if (!grid) return;
            grid.innerHTML = (data.data||[]).slice(0,count).map(post => {
                const src = post.media_type==='VIDEO' ? post.thumbnail_url : post.media_url;
                return `<div class="social-card"><div class="social-card-img"><img src="${src}" loading="lazy"></div>${post.caption?`<div class="social-card-caption">${post.caption.substring(0,80)}</div>`:''}</div>`;
            }).join('');
        } catch(e) {
            const grid = document.getElementById(id)?.querySelector('.social-grid');
            if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;font-size:13px"><i class="fab fa-instagram" style="font-size:24px;display:block;margin-bottom:8px"></i>@${handle}</div>`;
        }
    }

    // ─── PLAYLIST ENGINE ─────────────────────────────────────────────
    startPlaylistEngine() {
        if (!this.playlist?.items?.length) return;
        this.playlistIndex = 0;
        this.runPlaylistItem();
    }

    runPlaylistItem() {
        if (!this.playlist?.items?.length) return;
        const items = this.playlist.items;
        const item  = items[this.playlistIndex];
        if (!item) return;

        // Resolve zones/content for this item
        if (item.contentType === 'template') {
            const tpl = (this.data?.templates||[]).find(t => t.id === item.contentId);
            if (tpl?.zones) { this.zones = JSON.parse(JSON.stringify(tpl.zones)); this.render(); }
        } else if (item.contentType === 'media') {
            this.zones = [{ id:'pl-media', name:'Media', type:'media', x:0, y:0, w:100, h:100, visible:true, mediaSrc: item.contentId, mediaType: /\.(mp4|webm|mov)$/i.test(item.contentId||'') ? 'video' : 'image' }];
            this.render();
        } else if (item.contentType === 'app') {
            const app = this.installedApps.find(a => a.id === item.contentId);
            if (app) { this.zones = [{ id:'pl-app', name:app.name, type:'app', x:0, y:0, w:100, h:100, visible:true, appId: app.id }]; this.render(); }
        }

        // Duration: explicit → app default → 10s; null = stay
        let duration = item.duration;
        if (!duration && item.contentType === 'app') {
            const app = this.installedApps.find(a => a.id === item.contentId);
            duration = app?.defaultDuration || null;
        }
        if (!duration && item.contentType === 'media') {
            // Video: try to get actual duration after render
            const video = document.querySelector('video');
            if (video) {
                video.addEventListener('loadedmetadata', () => {
                    if (video.duration && isFinite(video.duration)) {
                        clearTimeout(this.playlistTimer);
                        this.playlistTimer = setTimeout(() => this.nextPlaylistItem(), video.duration * 1000);
                    }
                }, { once: true });
                return; // wait for metadata
            }
            duration = 10;
        }

        if (duration) {
            clearTimeout(this.playlistTimer);
            this.playlistTimer = setTimeout(() => this.nextPlaylistItem(), duration * 1000);
        }
        // null duration = stay indefinitely (e.g. room booking, clock)
    }

    nextPlaylistItem() {
        if (!this.playlist?.items?.length) return;
        const items = this.playlist.items;
        this.playlistIndex = (this.playlistIndex + 1) % items.length;
        if (this.playlist.shuffle && items.length > 1) {
            let next;
            do { next = Math.floor(Math.random() * items.length); } while (next === this.playlistIndex);
            this.playlistIndex = next;
        }
        this.runPlaylistItem();
    }

    // ─── AUTO REFRESH ─────────────────────────────────────────────────
    startAutoRefresh() {
        const interval = (this.settings.refreshInterval || 30) * 1000;
        setInterval(async () => {
            try {
                const tenantSlug = window.TENANT_SLUG;
                if (!tenantSlug) return;
                const res  = await fetch(`/api/public/${tenantSlug}/data`);
                const d    = await res.json();
                if (d.lastModified !== this.lastModified) {
                    await this.loadData();
                    this.applyTheme(); this.applyFont();
                    if (!this.playlist?.items?.length) this.render();
                }
            } catch(e) {}
        }, interval);
        // Schedule re-check every 60s
        setInterval(() => this.loadSchedule(), 60000);
        // Weather refresh every 5min
        setInterval(() => this.loadWeather(), 5*60*1000);
    }

    // ─── HEARTBEAT ───────────────────────────────────────────────────
    startHeartbeat() {
        if (!this.displayConfig?.id || !window.TENANT_SLUG) return;
        const beat = () => fetch(`/api/public/${window.TENANT_SLUG}/heartbeat/${this.displayConfig.id}`, { method:'POST' }).catch(()=>{});
        beat();
        setInterval(beat, 30000);
    }

    // ─── REMOTE CONTROL ──────────────────────────────────────────────
    startCommandPolling() {
        if (!this.displayConfig?.id || !window.TENANT_SLUG) return;
        const poll = async () => {
            try {
                const res  = await fetch(`/api/public/${window.TENANT_SLUG}/commands/${this.displayConfig.id}`);
                const data = await res.json();
                if (data.success && data.commands?.length) data.commands.forEach(cmd => this.executeCommand(cmd));
            } catch(e) {}
        };
        poll();
        setInterval(poll, 5000);
    }

    executeCommand(cmd) {
        switch(cmd.command) {
            case 'reload':         window.location.reload(); break;
            case 'blackout':       this.setBlackout(true); break;
            case 'wake':           this.setBlackout(false); break;
            case 'next_template':  this.nextPlaylistItem(); break;
            case 'refresh_data':   this.loadData().then(() => { this.applyTheme(); this.applyFont(); this.render(); }); break;
            case 'set_theme':      if (cmd.theme) { this.settings.theme = cmd.theme; this.applyTheme(); } break;
            case 'show_message':   if (cmd.message) this.showOverlayMessage(cmd.message, cmd.duration||5000); break;
        }
    }

    setBlackout(on) {
        this.isBlackout = on;
        const c = document.getElementById('displayContainer');
        if (!c) return;
        if (on) c.innerHTML = '<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center"><span style="color:#222;font-size:64px">●</span></div>';
        else this.render();
    }

    showOverlayMessage(msg, dur=5000) {
        document.getElementById('overlay-msg')?.remove();
        const el = document.createElement('div');
        el.id = 'overlay-msg';
        el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);color:#fff;padding:32px 48px;border-radius:16px;font-size:clamp(20px,3vw,48px);font-weight:700;z-index:9999;text-align:center;border:2px solid rgba(255,255,255,.2);backdrop-filter:blur(8px)';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), dur);
    }

    // ─── ANALYTICS ───────────────────────────────────────────────────
    trackAnalytics() {
        const displayId = this.displayConfig?.id;
        const tenantSlug = window.TENANT_SLUG;
        if (!tenantSlug) return;
        this.zones.filter(z => z.type === 'menu').forEach(zone => {
            (zone.productIds||[]).forEach(id => {
                fetch(`/api/public/${tenantSlug}/analytics`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'product_view', id, displayId}) }).catch(()=>{});
            });
        });
        if (displayId) fetch(`/api/public/${tenantSlug}/analytics`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'display_view', displayId}) }).catch(()=>{});
    }

    // ─── KEYBOARD ────────────────────────────────────────────────────
    setupKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(()=>{}); }
            if (e.key === 'F5')  { e.preventDefault(); this.loadData().then(() => { this.applyTheme(); this.applyFont(); this.render(); }); }
            if (e.key === 'b' || e.key === 'B') this.setBlackout(!this.isBlackout);
            if (e.key === 'ArrowRight') this.nextPlaylistItem();
        });
    }

    hideLoading() {
        const el = document.getElementById('loadingScreen');
        if (el) { el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>el.remove(),400); }
    }
}

window.menuboard = new MenuboardDisplay();
