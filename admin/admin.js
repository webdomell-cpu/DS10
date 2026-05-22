'use strict';
/**
 * DIGITAL SIGNAGE CMS v9.7 — Tenant Admin
 * FIXES: Auth guard, event listeners, null-safe selectors, schedule CRUD, app store
 */

// ═══ GLOBAL AUTH ═══
const CMS = {
    token: localStorage.getItem('cms_token'),
    user:  JSON.parse(localStorage.getItem('cms_user') || 'null'),
    async api(method, url, body) {
        try {
            const res = await fetch('/api' + url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            if (res.status === 401) { cmsLogout(); return null; }
            return res.json();
        } catch(e) { console.error('API error:', url, e); return null; }
    }
};

function cmsLogout() {
    localStorage.removeItem('cms_token');
    localStorage.removeItem('cms_user');
    window.location.href = '/admin/login.html';
}

function returnToSuperAdmin() {
    const saToken = localStorage.getItem('cms_sa_token');
    if (saToken) {
        localStorage.setItem('cms_token', saToken);
        localStorage.setItem('cms_user', localStorage.getItem('cms_sa_user'));
        localStorage.removeItem('cms_sa_token');
        localStorage.removeItem('cms_sa_user');
        window.location.href = '/superadmin/';
    }
}

// ═══ BOOT — runs after DOM ready ═══
document.addEventListener('DOMContentLoaded', () => {
    const guard = document.getElementById('authGuard');
    const shell = document.getElementById('appShell');

    if (!CMS.token || !CMS.user) { window.location.href = '/admin/login.html'; return; }
    if (CMS.user.role === 'superadmin') { window.location.href = '/superadmin/'; return; }

    // Hide guard, show shell
    if (guard) guard.style.display = 'none';
    if (shell) shell.style.display = '';

    // Sidebar identity
    _setText('tenantName', CMS.user.tenantName || 'CMS');
    _setText('tenantPlan', CMS.user.plan || 'Plan');
    _setText('sidebarUserName', CMS.user.name || CMS.user.email);
    _setText('sidebarUserRole', { tenantadmin:'Tenant-Admin', editor:'Editor', viewer:'Viewer' }[CMS.user.role] || CMS.user.role);
    _setText('sidebarAvatar', (CMS.user.name || 'U')[0].toUpperCase());

    // SuperAdmin return button
    if (localStorage.getItem('cms_sa_token')) {
        const btn = document.getElementById('saReturnBtn');
        if (btn) btn.style.display = '';
    }

    // Role-based UI
    if (CMS.user.role === 'viewer') document.querySelectorAll('.viewer-hidden').forEach(el => el.style.display = 'none');
    if (CMS.user.role !== 'tenantadmin') document.querySelectorAll('.editor-hidden').forEach(el => el.style.display = 'none');

    // Boot app
    window.admin = new MenuboardAdmin();
});

function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function _on(id, ev, fn) { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

// ═══ MAIN CLASS ═══
class MenuboardAdmin {
    constructor() {
        this.data = null; this.products = []; this.zones = []; this.templates = [];
        this.displays = []; this.playlists = []; this.installedApps = [];
        this.availableApps = []; this.settings = {}; this.shapes = [];
        this.analyticsData = null; this.currentTab = 'dashboard';
        this.selectedZone = null; this.canvasZoom = 1; this.playlistItems = [];
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.setupClock();
        this.renderAll();
        this.switchTab('dashboard');
        this.loadAnalytics();
    }

    // ─── DATA ────────────────────────────────────────────────────────
    async loadData() {
        const d = await CMS.api('GET', '/data');
        if (!d) return;
        this.data = d;
        this.products      = d.products  || [];
        this.zones         = d.zones     || [];
        this.templates     = d.templates || [];
        this.displays      = d.displays  || [];
        this.playlists     = d.playlists || [];
        this.installedApps = d.apps      || [];
        this.settings      = d.settings  || {};
        this.shapes        = d.shapes    || [];
    }

    async saveData() {
        if (!this.data) return;
        const payload = {
            ...this.data,
            products: this.products, zones: this.zones, templates: this.templates,
            displays: this.displays, playlists: this.playlists, apps: this.installedApps,
            settings: this.settings, shapes: this.shapes, schedules: this.data.schedules || []
        };
        const res = await CMS.api('POST', '/save', payload);
        if (res?.success) { this.showToast('Gespeichert!', 'success'); this.data.lastModified = new Date().toISOString(); this.renderDashboard(); }
        else this.showToast('Speicherfehler', 'error');
    }

    // ─── EVENTS ──────────────────────────────────────────────────────
    setupEventListeners() {
        // Nav
        document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
            el.addEventListener('click', e => { e.preventDefault(); this.switchTab(el.dataset.tab); });
        });
        _on('sidebarToggle', 'click', () => document.querySelector('.sidebar')?.classList.toggle('collapsed'));
        _on('saveAllBtn', 'click', () => this.saveData());

        // Products
        _on('addProductBtn',  'click', () => this.openProductModal());
        _on('saveProductBtn', 'click', () => this.saveProduct());
        _on('productSearch',  'input', () => this.renderProducts());
        _on('categoryFilter', 'change', () => this.renderProducts());

        // Displays
        _on('addDisplayBtn',  'click', () => this.openDisplayModal());
        _on('saveDisplayBtn', 'click', () => this.saveDisplay());
        _on('displaySlug', 'input', e => {
            _setText('displayUrlPreview', `/display/${CMS.user.tenantSlug || 'tenant'}/${e.target.value}`);
        });

        // Templates
        _on('addTemplateBtn',  'click', () => this.openTemplateModal());
        _on('saveTemplateBtn', 'click', () => this.saveTemplate());

        // Designer tools
        const toolMap = { toolAddMenu:'menu', toolAddMedia:'media', toolAddTicker:'ticker', toolAddText:'text', toolAddClock:'clock', toolAddApp:'app', toolAddMenubox:'menubox', toolAddRssField:'rssfield' };
        Object.entries(toolMap).forEach(([id, type]) => _on(id, 'click', () => this.addZone(type)));
        _on('zoomIn',  'click', () => this.zoomCanvas(0.1));
        _on('zoomOut', 'click', () => this.zoomCanvas(-0.1));
        _on('zoomFit', 'click', () => { this.canvasZoom = 1; this.renderDesignerCanvas(); });
        _on('saveLayoutBtn', 'click', () => this.saveData());
        _on('saveZoneBtn',   'click', () => this.saveZone());
        _on('deleteZoneBtn', 'click', () => this.deleteSelectedZone());
        _on('zoneType', 'change', e => this.updateZoneTypeUI(e.target.value));
        _on('undoBtn',  'click', () => window.designerEngine?.undo());
        _on('redoBtn',  'click', () => window.designerEngine?.redo());

        // Playlists
        _on('addPlaylistBtn',  'click', () => this.openPlaylistModal());
        _on('savePlaylistBtn', 'click', () => this.savePlaylist());

        // Schedules
        _on('addScheduleBtn',  'click', () => this.openScheduleModal());
        _on('saveScheduleBtn', 'click', () => this.saveSchedule());

        // Users
        _on('addUserBtn',  'click', () => this.openUserModal());
        _on('saveUserBtn', 'click', () => this.saveUser());

        // Media
        _on('mediaUpload', 'change', e => this.handleMediaUpload(e));

        // Features
        _on('saveFeaturesBtn', 'click', () => this.saveFeatures());

        // Settings
        _on('saveSettingsBtn',  'click', () => this.saveSettings());
        _on('resetSettingsBtn', 'click', () => this.resetSettings());
        _on('settingTickerSpeed', 'input', e => _setText('tickerSpeedVal', e.target.value));

        // Theme pills
        document.querySelectorAll('.theme-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const inp = document.getElementById('settingTheme'); if (inp) inp.value = btn.dataset.theme;
                const ed = document.getElementById('customThemeEditor');
                if (ed) ed.style.display = btn.dataset.theme === 'custom' ? 'block' : 'none';
            });
        });

        // Color pickers live update
        ['bgPrimary','bgCard','accentPrimary','accentSecondary','textPrimary','priceColor','borderColor'].forEach(k => {
            const inp = document.getElementById('ct-' + k);
            const sp  = document.getElementById('ct-' + k + '-val');
            if (inp && sp) inp.addEventListener('input', () => sp.textContent = inp.value);
        });

        this.renderFontSelector();
        this.renderCurrencyPicker();

        // Modal close — all modals
        document.querySelectorAll('.modal-close, .modal-cancel, .modal-backdrop').forEach(el => {
            el.addEventListener('click', () => this.closeAllModals());
        });
    }

    // ─── TABS ────────────────────────────────────────────────────────
    switchTab(tab) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
        this.currentTab = tab;
        const titles = { dashboard:'Dashboard', products:'Produkte', media:'Mediathek', apps:'Apps',
            displays:'Displays', templates:'Templates', designer:'Designer', playlists:'Playlisten',
            remote:'Fernsteuerung', schedules:'Zeitpläne', analytics:'Analytics',
            users:'Nutzer', features:'Features', settings:'Einstellungen' };
        _setText('pageTitle', titles[tab] || tab);

        if (tab === 'designer')   setTimeout(() => this.renderDesignerCanvas(), 50);
        else if (tab === 'media')     this.loadMedia();
        else if (tab === 'apps')      this.renderApps();
        else if (tab === 'schedules') this.loadSchedules();
        else if (tab === 'analytics') this.loadAnalytics();
        else if (tab === 'remote')    this.renderRemoteControl();
        else if (tab === 'features')  this.renderFeatureSettings();
        else if (tab === 'settings')  this.renderSettings();
        else if (tab === 'users')     this.loadUsers();
        else if (tab === 'dashboard') this.renderDashboard();
        else if (tab === 'playlists') this.renderPlaylists();
        else if (tab === 'displays')  this.renderDisplays();
        else if (tab === 'templates') this.renderTemplates();
        else if (tab === 'products')  this.renderProducts();
    }

    renderAll() { this.renderProducts(); this.renderDisplays(); this.renderTemplates(); this.renderPlaylists(); this.updateNavBadges(); }

    updateNavBadges() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('nb-products', this.products.length);
        s('nb-displays',  this.displays.length);
        s('nb-playlists', this.playlists.length);
        s('nb-apps',      this.installedApps.length);
    }

    setupClock() {
        const tick = () => _setText('topbarTime', new Date().toLocaleTimeString('de-DE'));
        tick(); setInterval(tick, 1000);
    }

    timeAgo(ts) {
        const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (s < 60) return 'Gerade eben';
        if (s < 3600) return `vor ${Math.floor(s/60)} Min.`;
        if (s < 86400) return `vor ${Math.floor(s/3600)} Std.`;
        return `vor ${Math.floor(s/86400)} Tagen`;
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────
    renderDashboard() {
        const s = (id, v) => _setText(id, v);
        s('ds-products', this.products.length);
        s('ds-displays',  this.displays.length);
        s('ds-playlists', this.playlists.length);
        s('ds-apps',      this.installedApps.length);
        s('ds-views',     this.analyticsData?.totalProductViews || '—');
        const online = this.displays.filter(d => d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000).length;
        s('ds-online', online);
        s('di-tenant',  CMS.user.tenantName || '—');
        s('di-plan',    CMS.user.plan || '—');
        s('di-displays', this.displays.length);
        s('di-saved', this.data?.lastModified ? new Date(this.data.lastModified).toLocaleString('de-DE') : '—');

        const dl = document.getElementById('ds-display-list');
        if (dl) dl.innerHTML = this.displays.length ? this.displays.map(d => {
            const onl = d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000;
            return `<div class="display-status-row">
                <span class="display-status-name"><i class="fas fa-circle" style="color:${onl?'var(--green)':'var(--border)'};font-size:8px;margin-right:6px"></i>${d.name}</span>
                <span class="display-status-time">${d.lastSeen ? this.timeAgo(d.lastSeen) : 'Nie'}</span>
                <span class="display-online-badge ${onl?'badge-online':'badge-offline'}">${onl?'Online':'Offline'}</span>
            </div>`;
        }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px">Keine Displays vorhanden</div>';

        const tp = document.getElementById('ds-top-products');
        if (tp) {
            const top = (this.analyticsData?.productRanking || []).slice(0, 5);
            tp.innerHTML = top.length ? top.map((p, i) => {
                const maxV = top[0]?.views || 1;
                return `<div class="top-product-row"><span class="top-rank">${i+1}</span><span class="top-name">${p.name}</span>
                    <div class="top-bar"><div class="top-bar-fill" style="width:${Math.round(p.views/maxV*100)}%"></div></div>
                    <span class="top-views">${p.views}</span></div>`;
            }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px">Noch keine Daten</div>';
        }

        const pds = document.getElementById('previewDisplaySelect');
        if (pds) {
            const cur = pds.value;
            pds.innerHTML = this.displays.map(d => `<option value="${d.slug}" ${d.slug===cur?'selected':''}>${d.name}</option>`).join('');
            if (this.displays.length && !cur) this.updatePreview();
        }
    }

    refreshPreview() { const f = document.getElementById('livePreview'); if (f) f.src = f.src; }
    updatePreview() {
        const slug = document.getElementById('previewDisplaySelect')?.value;
        const f    = document.getElementById('livePreview');
        if (f && slug) f.src = `/display/${CMS.user.tenantSlug || 'demo'}/${slug}`;
    }

    // ─── PRODUCTS ────────────────────────────────────────────────────
    renderProducts() {
        const search = (document.getElementById('productSearch')?.value || '').toLowerCase();
        const cat    = document.getElementById('categoryFilter')?.value || '';
        const cur    = this.settings.currency || '€';
        const cpos   = this.settings.currencyPosition || 'after';
        const fmt    = p => cpos === 'before' ? `${cur} ${p}` : `${p} ${cur}`;
        const filtered = this.products.filter(p =>
            (!cat || p.category === cat) &&
            (!search || (p.title||'').toLowerCase().includes(search) || (p.description||'').toLowerCase().includes(search))
        );
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        grid.innerHTML = filtered.length ? filtered.map(p => `
        <div class="product-card" onclick="admin.openProductModal('${p.id}')">
            <div class="product-card-img">${p.image ? `<img src="${p.image}" alt="${p.title}" onerror="this.style.display='none'">` : '<i class="fas fa-image no-img"></i>'}</div>
            <div class="product-card-body">
                <div class="product-card-name" title="${p.title}">${p.title}</div>
                <div class="product-card-cat">${p.category || ''}</div>
                <div class="product-card-footer">
                    <span class="product-price">${p.stockStatus==='soldout'?'—':fmt(p.price)}</span>
                    ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
                </div>
            </div>
            <div class="product-card-actions">
                <button class="btn btn-ghost btn-xs viewer-hidden" onclick="event.stopPropagation();admin.openProductModal('${p.id}')"><i class="fas fa-pen"></i></button>
                <button class="btn btn-danger btn-xs viewer-hidden" onclick="event.stopPropagation();admin.deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><p>Keine Produkte gefunden</p></div>`;
    }

    openProductModal(id = null) {
        const p = id ? this.products.find(x => String(x.id) === String(id)) : null;
        _setText('productModalTitle', p ? 'Produkt bearbeiten' : 'Neues Produkt');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        set('productId',          p?.id || '');
        set('productTitle',       p?.title || '');
        set('productPrice',       p?.price || '');
        set('productCategory',    p?.category || 'burger');
        set('productBadge',       p?.badge || '');
        set('productDescription', p?.description || '');
        set('productImageUrl',    p?.image || '');
        set('productStock',       p?.stockStatus || 'available');
        document.getElementById('productModal')?.classList.add('active');
    }

    async saveProduct() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id = get('productId');
        const p = { title: get('productTitle'), price: get('productPrice'), category: get('productCategory'),
            badge: get('productBadge'), description: get('productDescription'), image: get('productImageUrl'),
            stockStatus: get('productStock') };
        if (!p.title || !p.price) { this.showToast('Name & Preis erforderlich', 'error'); return; }
        if (id) { const i = this.products.findIndex(x => String(x.id) === id); if (i !== -1) this.products[i] = { ...this.products[i], ...p }; }
        else this.products.push({ ...p, id: Date.now() });
        this.closeAllModals(); this.renderProducts(); this.updateNavBadges(); await this.saveData();
    }

    async deleteProduct(id) {
        if (!confirm('Produkt löschen?')) return;
        this.products = this.products.filter(p => String(p.id) !== String(id));
        this.renderProducts(); this.updateNavBadges(); await this.saveData();
    }

    // ─── DISPLAYS ────────────────────────────────────────────────────
    renderDisplays() {
        const grid = document.getElementById('displaysGrid');
        if (!grid) return;
        grid.innerHTML = this.displays.length ? this.displays.map(d => {
            const onl = d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000;
            const tpl = this.templates.find(t => t.id === d.templateId);
            const pl  = this.playlists.find(p => p.id === d.playlistId);
            const url = `/display/${CMS.user.tenantSlug || 'demo'}/${d.slug}`;
            return `<div class="display-card">
                <div class="display-card-header">
                    <div class="display-card-icon"><i class="fas fa-desktop"></i></div>
                    <span class="display-online-badge ${onl?'badge-online':'badge-offline'}">${onl?'Online':'Offline'}</span>
                </div>
                <div class="display-card-name">${d.name}</div>
                <div class="display-card-slug">${url}</div>
                <div class="display-card-desc">${d.description || '—'}</div>
                <div class="display-meta">
                    <span><i class="fas fa-table-cells-large"></i> ${tpl?.name || d.templateId || '—'}</span>
                    ${pl ? `<span><i class="fas fa-list-ol"></i> ${pl.name}</span>` : ''}
                    ${d.lastSeen ? `<span><i class="fas fa-clock"></i> ${this.timeAgo(d.lastSeen)}</span>` : ''}
                </div>
                <a class="display-url" href="${url}" target="_blank">${url}</a>
                <div class="display-card-actions">
                    <button class="btn btn-ghost btn-sm viewer-hidden" onclick="admin.openDisplayModal('${d.id}')"><i class="fas fa-pen"></i> Bearbeiten</button>
                    <button class="btn btn-ghost btn-sm" onclick="window.open('${url}','_blank')"><i class="fas fa-external-link-alt"></i></button>
                    <button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.deleteDisplay('${d.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('') : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-desktop"></i><p>Noch keine Displays.<br>Klicke auf "+ Display"</p></div>`;
    }

    openDisplayModal(id = null) {
        const d = id ? this.displays.find(x => x.id === id) : null;
        _setText('displayModalTitle', d ? 'Display bearbeiten' : 'Neues Display');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val ?? ''; };
        set('displayId',          d?.id || '');
        set('displayName',        d?.name || '');
        set('displaySlug',        d?.slug || '');
        set('displayDescription', d?.description || '');
        const act = document.getElementById('displayActive'); if (act) act.checked = d?.active !== false;
        if (d?.slug) _setText('displayUrlPreview', `/display/${CMS.user.tenantSlug || ''}/${d.slug}`);
        const tplSel = document.getElementById('displayTemplate');
        if (tplSel) tplSel.innerHTML = this.templates.map(t => `<option value="${t.id}" ${d?.templateId===t.id?'selected':''}>${t.name}</option>`).join('');
        const plSel = document.getElementById('displayPlaylist');
        if (plSel) plSel.innerHTML = '<option value="">Keine Playlist</option>' + this.playlists.map(p => `<option value="${p.id}" ${d?.playlistId===p.id?'selected':''}>${p.name}</option>`).join('');
        document.getElementById('displayModal')?.classList.add('active');
    }

    async saveDisplay() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id = get('displayId');
        const d = { name: get('displayName'),
            slug: get('displaySlug').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            description: get('displayDescription'),
            templateId: get('displayTemplate'),
            playlistId: get('displayPlaylist') || null,
            active: document.getElementById('displayActive')?.checked !== false };
        if (!d.name || !d.slug) { this.showToast('Name & Slug erforderlich', 'error'); return; }
        if (id) { const i = this.displays.findIndex(x => x.id === id); if (i !== -1) this.displays[i] = { ...this.displays[i], ...d }; }
        else this.displays.push({ ...d, id: 'display-' + Date.now(), createdAt: new Date().toISOString(), lastSeen: null });
        this.closeAllModals(); this.renderDisplays(); this.updateNavBadges(); await this.saveData();
        this.showToast(id ? 'Display aktualisiert!' : 'Display erstellt!', 'success');
    }

    async deleteDisplay(id) {
        if (!confirm('Display löschen?')) return;
        this.displays = this.displays.filter(d => d.id !== id);
        this.renderDisplays(); this.updateNavBadges(); await this.saveData();
    }

    // ─── TEMPLATES ───────────────────────────────────────────────────
    async loadGlobalDesignerTemplates() {
        const res = await CMS.api('GET', '/global-designer-templates');
        return res?.templates || [];
    }

    async openGlobalDesignerTemplate(tpl) {
        if (!confirm(`Globale Vorlage "${tpl.name}" laden?
Aktuelle Zonen & Shapes werden überschrieben.`)) return;
        if (tpl.zones?.length) this.zones = JSON.parse(JSON.stringify(tpl.zones));
        if (tpl.shapes?.length) {
            this.shapes = JSON.parse(JSON.stringify(tpl.shapes));
            if (window.designerEngine) window.designerEngine.loadShapes(this.shapes);
        }
        this.switchTab('designer');
        setTimeout(() => this.renderDesignerCanvas(), 100);
        this.showToast(`"${tpl.name}" geladen!`, 'success');
    }

    async saveCurrentAsGlobalTemplate() {
        const name = prompt('Name für die globale Vorlage:');
        if (!name) return;
        const desc = prompt('Beschreibung (optional):') || '';
        const res = await CMS.api('POST', '/global-designer-templates', {
            name, description: desc,
            zones: this.zones, shapes: this.shapes,
            category: 'mandant-erstellt'
        });
        if (res?.success) this.showToast('Vorlage gespeichert!', 'success');
        else this.showToast('Fehler beim Speichern', 'error');
    }

    renderTemplates() {
        const grid = document.getElementById('templatesGrid');
        if (!grid) return;
        const pills = document.getElementById('templateButtons');
        if (pills) pills.innerHTML = this.templates.map(t => `<button class="template-pill-btn" onclick="admin.applyTemplate('${t.id}')">${t.name}</button>`).join('');
        // Load & show global designer templates
        this.loadGlobalDesignerTemplates().then(globalTpls => {
            const globalEl = document.getElementById('globalTemplatesGrid');
            if (!globalEl) return;
            globalEl.innerHTML = globalTpls.length ? globalTpls.map(t => `<div class="template-card" style="border-color:rgba(34,211,164,.3)">
                <div class="template-preview" style="border-bottom:1px solid rgba(34,211,164,.2)">${(t.zones||[]).map(z=>`<div class="template-zone-preview" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%;border-color:rgba(34,211,164,.4)">${z.type}</div>`).join('')}</div>
                <div class="template-card-body">
                    <div class="template-card-name">🌐 ${t.name}</div>
                    <div class="template-card-desc">${t.description||''} <span style="font-size:10px;color:var(--green);font-weight:600">Globale Vorlage</span></div>
                    <div class="template-card-actions">
                        <button class="btn btn-ghost btn-sm" onclick="admin.openGlobalDesignerTemplate(${JSON.stringify(t).replace(/"/g,'&quot;')})"><i class="fas fa-download"></i> Laden</button>
                    </div>
                </div>
            </div>`).join('') : '<div style="color:var(--text-2);font-size:13px;padding:12px">Keine globalen Vorlagen vorhanden</div>';
        });

        grid.innerHTML = this.templates.map(t => `<div class="template-card ${t.isDefault?'is-default':''}">
            <div class="template-preview">${(t.zones||[]).map(z => `<div class="template-zone-preview" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%">${z.type}</div>`).join('')}</div>
            <div class="template-card-body">
                <div class="template-card-name">${t.name} ${t.isDefault?'<span class="template-default-badge">Standard</span>':''}</div>
                <div class="template-card-desc">${t.description||''}</div>
                <div class="template-card-actions">
                    <button class="btn btn-ghost btn-sm" onclick="admin.applyTemplate('${t.id}')"><i class="fas fa-check"></i> Anwenden</button>
                    <button class="btn btn-ghost btn-sm viewer-hidden" onclick="admin.openTemplateModal('${t.id}')"><i class="fas fa-pen"></i></button>
                    ${!t.isDefault?`<button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.deleteTemplate('${t.id}')"><i class="fas fa-trash"></i></button>`:''}
                </div>
            </div>
        </div>`).join('') || `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-table-cells-large"></i><p>Keine Templates</p></div>`;
    }

    openTemplateModal(id = null) {
        const t = id ? this.templates.find(x => x.id === id) : null;
        _setText('templateModalTitle', t ? 'Template bearbeiten' : 'Neues Template');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        set('templateId',          t?.id || '');
        set('templateName',        t?.name || '');
        set('templateDescription', t?.description || '');
        set('templateZonesJson',   t ? JSON.stringify(t.zones || [], null, 2) : '[]');
        document.getElementById('templateModal')?.classList.add('active');
    }

    copyCurrentLayoutToTemplate() {
        const el = document.getElementById('templateZonesJson');
        if (el) el.value = JSON.stringify(this.zones, null, 2);
        this.showToast('Layout übernommen', 'info');
    }

    async saveTemplate() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id   = get('templateId');
        const name = get('templateName');
        if (!name) { this.showToast('Name erforderlich', 'error'); return; }
        let zones = [];
        try { zones = JSON.parse(get('templateZonesJson') || '[]'); } catch { this.showToast('Ungültiges JSON', 'error'); return; }
        const t = { name, description: get('templateDescription'), zones, isDefault: false };
        if (id) { const i = this.templates.findIndex(x => x.id === id); if (i !== -1) { t.isDefault = this.templates[i].isDefault; this.templates[i] = { ...this.templates[i], ...t, id }; } }
        else this.templates.push({ ...t, id: 'template-' + Date.now() });
        this.closeAllModals(); this.renderTemplates(); await this.saveData(); this.showToast('Template gespeichert!', 'success');
    }

    async deleteTemplate(id) {
        if (!confirm('Template löschen?')) return;
        this.templates = this.templates.filter(t => t.id !== id);
        this.renderTemplates(); await this.saveData();
    }

    async applyTemplate(id) {
        const t = this.templates.find(x => x.id === id);
        if (!t || !confirm(`Template "${t.name}" anwenden?`)) return;
        this.zones = JSON.parse(JSON.stringify(t.zones));
        this.renderDesignerCanvas(); await this.saveData(); this.showToast(`"${t.name}" angewendet!`, 'success');
    }

    // ─── DESIGNER ────────────────────────────────────────────────────
    renderDesignerCanvas() {
        const canvas = document.getElementById('designerCanvas');
        if (!canvas) return;
        const W = 1920, H = 1080;
        const wrap  = canvas.parentElement;
        const scale = Math.min((wrap.clientWidth - 48) / W, (wrap.clientHeight - 48) / H) * this.canvasZoom;
        canvas.style.cssText = `width:${W}px;height:${H}px;transform:scale(${scale});transform-origin:top left;position:relative;`;
        _setText('canvasSize', `${W} × ${H} | ${Math.round(scale*100)}%`);

        canvas.innerHTML = this.zones.map(z => `
        <div class="zone-card ${this.selectedZone?.id===z.id?'selected':''}"
             style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%;display:${z.visible===false?'none':'flex'};flex-direction:column"
             data-zone-id="${z.id}" onmousedown="admin.startDrag(event,'${z.id}')">
            <div class="zone-card-header"><span>${z.name||z.type}</span><span class="zone-card-type">${z.type.toUpperCase()}</span></div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,.3)">
                ${z.type==='menu'?`🍽️ ${(z.productIds||[]).length} Produkte`:z.type==='app'?`🧩 App`:z.type==='ticker'?'📜 Ticker':z.type==='media'?'🖼️ Media':z.type==='clock'?'🕐 Uhr':'📝 Text'}
            </div>
            <div class="zone-resize-handle" onmousedown="admin.startResize(event,'${z.id}')"></div>
        </div>`).join('');

        canvas.querySelectorAll('.zone-card').forEach(el => {
            el.addEventListener('dblclick', () => this.openZoneModal(el.dataset.zoneId));
            el.addEventListener('click', e => { e.stopPropagation(); this.selectZone(el.dataset.zoneId); });
        });
        canvas.addEventListener('click', e => {
            if (e.target === canvas) { this.selectedZone = null; _setText('selectedZone', 'Keine Zone'); document.querySelectorAll('.zone-card').forEach(x => x.classList.remove('selected')); }
        });

        // Pass products to engine for menubox picker
        window._designerProducts = this.products || [];

        // Designer engine for graphic shapes
        if (window.DesignerEngine) {
            window.designerEngine = new DesignerEngine('designerCanvas', {
                width: 1920, height: 1080,
                snapGrid: document.getElementById('snapGridToggle')?.checked !== false,
                gridSize: 10,
                onChange: () => {
                    this.shapes = window.designerEngine.getShapes();
                    _setText('shapesCount', `${this.shapes.length} Grafikelemente`);
                },
                onSelect: shape => { if (window.pp) window.pp.render(shape); }
            });
            if (this.shapes?.length) window.designerEngine.loadShapes(this.shapes);
            window.pp = new PropertyPanel('shapesPropertyPanel', window.designerEngine);
        }
    }

    selectZone(id) {
        this.selectedZone = this.zones.find(z => z.id === id);
        _setText('selectedZone', this.selectedZone?.name || id);
        document.querySelectorAll('.zone-card').forEach(x => x.classList.toggle('selected', x.dataset.zoneId === id));
    }

    startDrag(e, id) {
        if (e.target.classList.contains('zone-resize-handle')) return;
        e.preventDefault(); e.stopPropagation();
        this.selectZone(id);
        const zone = this.zones.find(z => z.id === id); if (!zone) return;
        const canvas = document.getElementById('designerCanvas');
        const scale  = parseFloat(canvas.style.transform.replace('scale(','').replace(')','')) || 1;
        const cw = canvas.offsetWidth * scale, ch = canvas.offsetHeight * scale;
        const sx = e.clientX, sy = e.clientY, ox = zone.x, oy = zone.y;
        const mv = e => { zone.x = Math.max(0, Math.min(100-zone.w, ox+(e.clientX-sx)/cw*100)); zone.y = Math.max(0, Math.min(100-zone.h, oy+(e.clientY-sy)/ch*100)); this.renderDesignerCanvas(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }

    startResize(e, id) {
        e.preventDefault(); e.stopPropagation();
        const zone = this.zones.find(z => z.id === id); if (!zone) return;
        const canvas = document.getElementById('designerCanvas');
        const scale  = parseFloat(canvas.style.transform.replace('scale(','').replace(')','')) || 1;
        const cw = canvas.offsetWidth * scale, ch = canvas.offsetHeight * scale;
        const sx = e.clientX, sy = e.clientY, ow = zone.w, oh = zone.h;
        const mv = e => { zone.w = Math.max(5, Math.min(100-zone.x, ow+(e.clientX-sx)/cw*100)); zone.h = Math.max(5, Math.min(100-zone.y, oh+(e.clientY-sy)/ch*100)); this.renderDesignerCanvas(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }

    addZone(type) {
        // Special types go to designer engine as shapes
        if (type === 'menubox') {
            if (!window.designerEngine) { this.showToast('Öffne zuerst den Designer', 'error'); return; }
            window.designerEngine._pendingProduct = this.products[0] || null;
            window.designerEngine.setTool('menubox');
            this.showToast('Menübox: Auf Canvas zeichnen', 'info');
            return;
        }
        if (type === 'rssfield') {
            if (!window.designerEngine) { this.showToast('Öffne zuerst den Designer', 'error'); return; }
            const feedUrl = prompt('RSS Feed URL:', 'https://feeds.bbci.co.uk/news/rss.xml') || '';
            const field   = prompt('Feld anzeigen (title / description / image / video):', 'title') || 'title';
            window.designerEngine._pendingRssOpts = { feedUrl, field };
            window.designerEngine.setTool('rssfield');
            this.showToast('RSS-Feld: Auf Canvas zeichnen', 'info');
            return;
        }
        const zone = { id:'zone-'+Date.now(), name: type.charAt(0).toUpperCase()+type.slice(1)+' Zone', type,
            x:10, y:10, w:30, h:20, visible:true, productIds:[], tickerText:'',
            articleStyle:{showImage:true,showTitle:true,showPrice:true,showDescription:false,showBadge:true,showStock:true,pricePosition:'bottom-right',priceStyle:'badge-gold',imageSize:'large',cardLayout:'vertical',textAlign:'left',columnsCount:'auto'} };
        this.zones.push(zone); this.renderDesignerCanvas(); this.showToast(`${type}-Zone hinzugefügt`, 'success');
    }

    clearShapes() {
        if (!confirm('Alle Grafikelemente löschen?')) return;
        this.shapes = [];
        if (window.designerEngine) { window.designerEngine.shapes = []; window.designerEngine.renderShapes(); }
        _setText('shapesCount', '0 Grafikelemente');
    }

    zoomCanvas(delta) {
        if (window.designerEngine) { window.designerEngine.setZoom(delta); }
        else { this.canvasZoom = Math.max(.2, Math.min(2, this.canvasZoom + delta)); this.renderDesignerCanvas(); }
    }

    openZoneModal(id) {
        const zone = this.zones.find(z => z.id === id); if (!zone) return;
        this.selectedZone = zone;
        _setText('zoneModalTitle', zone.name);
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val ?? ''; };
        set('zoneId',  zone.id);
        set('zoneName', zone.name || '');
        set('zoneType', zone.type || 'menu');
        set('zoneX', parseFloat(zone.x).toFixed(1));
        set('zoneY', parseFloat(zone.y).toFixed(1));
        set('zoneW', parseFloat(zone.w).toFixed(1));
        set('zoneH', parseFloat(zone.h).toFixed(1));
        const vis = document.getElementById('zoneVisible'); if (vis) vis.checked = zone.visible !== false;
        this.updateZoneTypeUI(zone.type, zone);
        document.getElementById('zoneModal')?.classList.add('active');
    }

    updateZoneTypeUI(type, zone = null) {
        ['Articles','Media','Ticker','Text','App'].forEach(g => {
            const el = document.getElementById('zone'+g+'Group'); if (el) el.style.display = 'none';
        });
        if (type === 'menu') {
            const el = document.getElementById('zoneArticlesGroup'); if (el) el.style.display = 'block';
            const sel = document.getElementById('zoneProductSelector');
            if (sel) {
                const selected = zone?.productIds || [];
                sel.innerHTML = this.products.map(p => `<label class="zone-product-item ${selected.includes(p.id)||selected.includes(String(p.id))?'selected':''}" data-pid="${p.id}"><input type="checkbox" ${selected.includes(p.id)||selected.includes(String(p.id))?'checked':''} style="display:none">${p.title}</label>`).join('');
                sel.querySelectorAll('.zone-product-item').forEach(el => el.addEventListener('click', () => el.classList.toggle('selected')));
            }
            const as = zone?.articleStyle || {};
            ['showImage','showTitle','showPrice','showDescription','showBadge'].forEach(k => { const el = document.getElementById(k); if (el) el.checked = as[k] !== false; });
            ['priceStyle','cardLayout','columnsCount'].forEach(k => { const el = document.getElementById(k); if (el && as[k]) el.value = as[k]; });
        } else if (type === 'media') {
            const el = document.getElementById('zoneMediaGroup'); if (el) el.style.display = 'block';
            if (zone) { const s = document.getElementById('zoneMediaSrc'); if(s) s.value = zone.mediaSrc||''; const t = document.getElementById('zoneMediaType'); if(t) t.value = zone.mediaType||'image'; }
        } else if (type === 'ticker') {
            const el = document.getElementById('zoneTickerGroup'); if (el) el.style.display = 'block';
            if (zone) { const t = document.getElementById('zoneTickerText'); if(t) t.value = zone.tickerText||zone.text||''; }
        } else if (type === 'text' || type === 'clock') {
            const el = document.getElementById('zoneTextGroup'); if (el) el.style.display = 'block';
            if (zone && type === 'text') {
                const t = document.getElementById('zoneTextContent'); if(t) t.value = zone.text||'';
                const s = document.getElementById('zoneTextSize'); if(s) s.value = zone.fontSize||24;
                const c = document.getElementById('zoneTextColor'); if(c) c.value = zone.color||'#ffffff';
            }
        } else if (type === 'app') {
            const el = document.getElementById('zoneAppGroup'); if (el) el.style.display = 'block';
            const sel = document.getElementById('zoneAppSelect');
            if (sel) sel.innerHTML = this.installedApps.map(a => `<option value="${a.id}" ${zone?.appId===a.id?'selected':''}>${a.name}</option>`).join('');
        }
    }

    saveZone() {
        const id   = document.getElementById('zoneId')?.value;
        const type = document.getElementById('zoneType')?.value;
        const zone = this.zones.find(z => z.id === id); if (!zone) return;
        zone.name    = document.getElementById('zoneName')?.value || zone.name;
        zone.type    = type;
        zone.x       = parseFloat(document.getElementById('zoneX')?.value) || 0;
        zone.y       = parseFloat(document.getElementById('zoneY')?.value) || 0;
        zone.w       = parseFloat(document.getElementById('zoneW')?.value) || 20;
        zone.h       = parseFloat(document.getElementById('zoneH')?.value) || 20;
        zone.visible = document.getElementById('zoneVisible')?.checked !== false;
        if (type === 'menu') {
            zone.productIds = Array.from(document.querySelectorAll('.zone-product-item.selected')).map(el => parseInt(el.dataset.pid) || el.dataset.pid);
            zone.articleStyle = {
                showImage:       document.getElementById('showImage')?.checked !== false,
                showTitle:       document.getElementById('showTitle')?.checked !== false,
                showPrice:       document.getElementById('showPrice')?.checked !== false,
                showDescription: document.getElementById('showDescription')?.checked || false,
                showBadge:       document.getElementById('showBadge')?.checked !== false,
                showStock:       true,
                priceStyle:      document.getElementById('priceStyle')?.value || 'badge-gold',
                cardLayout:      document.getElementById('cardLayout')?.value || 'vertical',
                columnsCount:    document.getElementById('columnsCount')?.value || 'auto',
                pricePosition:   'bottom-right', imageSize: 'large', textAlign: 'left'
            };
        } else if (type === 'media') {
            zone.mediaSrc  = document.getElementById('zoneMediaSrc')?.value || '';
            zone.mediaType = document.getElementById('zoneMediaType')?.value || 'image';
        } else if (type === 'ticker') {
            zone.tickerText = document.getElementById('zoneTickerText')?.value || '';
            zone.text       = zone.tickerText;
        } else if (type === 'text') {
            zone.text     = document.getElementById('zoneTextContent')?.value || '';
            zone.fontSize = parseInt(document.getElementById('zoneTextSize')?.value) || 24;
            zone.color    = document.getElementById('zoneTextColor')?.value || '#ffffff';
        } else if (type === 'app') {
            zone.appId = document.getElementById('zoneAppSelect')?.value || '';
        }
        this.closeAllModals(); this.renderDesignerCanvas(); this.showToast('Zone gespeichert', 'success');
    }

    deleteSelectedZone() {
        const id = document.getElementById('zoneId')?.value;
        if (!confirm('Zone löschen?')) return;
        this.zones = this.zones.filter(z => z.id !== id);
        this.closeAllModals(); this.renderDesignerCanvas();
    }

    // ─── MEDIA ───────────────────────────────────────────────────────
    async loadMedia() {
        const res     = await CMS.api('GET', '/uploads-list');
        const uploads = res?.uploads || [];
        const grid    = document.getElementById('mediaGrid'); if (!grid) return;

        // Filter bar
        const filterVal = document.getElementById('mediaFilter')?.value || 'all';
        const filtered  = filterVal === 'global' ? uploads.filter(f => f.global)
                        : filterVal === 'own'    ? uploads.filter(f => !f.global)
                        : uploads;

        // Update counts
        const countEl = document.getElementById('mediaCount');
        if (countEl) countEl.textContent = `${uploads.filter(f=>!f.global).length} eigene · ${uploads.filter(f=>f.global).length} global`;

        grid.innerHTML = filtered.length ? filtered.map(f => {
            const isVid = /\.(mp4|webm|mov)$/i.test(f.filename);
            return `<div class="media-card ${f.global?'media-card--global':''}">
                <div class="media-thumb">${isVid ? '<i class="fas fa-video media-icon"></i>' : `<img src="${f.url}" loading="lazy" onerror="this.style.display='none'">`}
                    ${f.global ? '<div class="media-global-badge">🌐 Global</div>' : ''}
                </div>
                <div class="media-info">
                    <div class="media-name" title="${f.filename}">${f.filename}</div>
                    <div class="media-size">${this.formatBytes(f.size)}</div>
                </div>
                <div style="padding:4px 8px 8px;display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${f.url}');admin.showToast('Kopiert!','success')"><i class="fas fa-copy"></i></button>
                    ${!f.global ? `<button class="btn btn-danger btn-xs viewer-hidden" onclick="admin.deleteMedia('${f.filename}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>`;
        }).join('') : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-photo-film"></i><p>Keine Medien</p></div>`;
    }

    async handleMediaUpload(e) {
        for (const file of Array.from(e.target.files || [])) {
            const fd = new FormData(); fd.append('file', file);
            const res = await fetch('/api/upload', { method:'POST', headers:{'Authorization':'Bearer '+CMS.token}, body: fd });
            const r   = await res.json();
            if (r.success) this.showToast(`${file.name} hochgeladen!`, 'success');
            else this.showToast('Upload fehlgeschlagen', 'error');
        }
        this.loadMedia();
    }

    async deleteMedia(filename) {
        if (!confirm('Datei löschen?')) return;
        await CMS.api('DELETE', `/uploads/${filename}`);
        this.loadMedia(); this.showToast('Datei gelöscht', 'success');
    }

    formatBytes(b) {
        if (!b) return '0 B';
        const k=1024, u=['B','KB','MB','GB'], i=Math.floor(Math.log(b)/Math.log(k));
        return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+u[i];
    }

    // ─── APPS ────────────────────────────────────────────────────────
    async renderApps() {
        if (!this.availableApps.length) {
            const res = await CMS.api('GET', '/app-store');
            this.availableApps = res?.apps || [];
        }
        const grid = document.getElementById('installedApps'); if (!grid) return;
        grid.innerHTML = this.installedApps.length ? this.installedApps.map(a => `<div class="app-card">
            <div class="app-card-icon"><i class="${a.icon||'fas fa-puzzle-piece'}"></i></div>
            <div class="app-card-name">${a.name}</div>
            <div class="app-card-desc">${a.description||''}</div>
            <div class="app-card-meta">
                <span class="app-duration">${a.defaultDuration ? a.defaultDuration+'s Standard' : '∞ Endlos'}</span>
                <span class="app-status-badge installed">Installiert</span>
            </div>
            <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="admin.openAppConfig('${a.id}')"><i class="fas fa-gear"></i> Konfigurieren</button>
                <button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.uninstallApp('${a.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-puzzle-piece"></i><p>Noch keine Apps installiert.<br>Klicke auf "+ App installieren"</p></div>`;
    }

    async openAppStore() {
        if (!this.availableApps.length) {
            const res = await CMS.api('GET', '/app-store');
            this.availableApps = res?.apps || [];
        }
        const section = document.getElementById('appStoreSection'); if (!section) return;
        section.style.display = section.style.display === 'none' ? '' : 'none';
        const grid = document.getElementById('appStoreGrid'); if (!grid) return;
        const installedIds = this.installedApps.map(a => a.appId);
        grid.innerHTML = this.availableApps.map(a => {
            const isInst = installedIds.includes(a.appId);
            const hasPrev = ['social','menuboard'].includes(a.appId);
            const prevUrl = a.appId === 'menuboard'
                ? `/app/menuboard?tenantSlug=${CMS.user.tenantSlug||'demo'}`
                : '/app/social-feed?demo=true&layout=2x2';
            return `<div class="app-card">
                <div class="app-card-icon"><i class="${a.icon||'fas fa-puzzle-piece'}"></i></div>
                <div class="app-card-name">${a.name} <span style="font-size:10px;color:var(--text-2)">v${a.version||'1.0'}</span></div>
                <div class="app-card-desc">${a.description||''}</div>
                <div class="app-card-meta">
                    <span class="app-duration">${a.defaultDuration ? a.defaultDuration+'s' : '∞ Endlos'}</span>
                    <span class="app-status-badge ${isInst?'installed':'available'}">${isInst?'Installiert':'Verfügbar'}</span>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px">
                    ${!isInst ? `<button class="btn btn-primary btn-sm" onclick="admin.installApp('${a.appId}')"><i class="fas fa-download"></i> Installieren</button>` : '<button class="btn btn-ghost btn-sm" disabled><i class="fas fa-check"></i> Installiert</button>'}
                    ${hasPrev ? `<button class="btn btn-ghost btn-sm" onclick="window.open('${prevUrl}','_blank')"><i class="fas fa-eye"></i> Vorschau</button>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    async installApp(appId) {
        const app = this.availableApps.find(a => a.appId === appId); if (!app) return;
        const newApp = { ...app, id: 'app-' + Date.now(), installedAt: new Date().toISOString(), config: {} };
        this.installedApps.push(newApp);
        await this.saveData(); this.renderApps(); this.updateNavBadges();
        this.showToast(`${app.name} installiert!`, 'success');
    }

    async uninstallApp(id) {
        if (!confirm('App deinstallieren?')) return;
        this.installedApps = this.installedApps.filter(a => a.id !== id);
        await this.saveData(); this.renderApps(); this.updateNavBadges();
    }

    openAppConfig(id) {
        const app = this.installedApps.find(a => a.id === id); if (!app) return;
        const storeApp = this.availableApps.find(a => a.appId === app.appId);
        _setText('appConfigTitle', app.name + ' konfigurieren');
        const body   = document.getElementById('appConfigBody'); if (!body) return;
        const schema = storeApp?.configSchema || {};
        const config = app.config || {};
        body.innerHTML = Object.entries(schema).map(([key, s]) => `<div class="form-group">
            <label>${s.label}</label>
            ${s.type === 'boolean' ? `<label class="toggle"><input type="checkbox" data-key="${key}" ${config[key]!==false?'checked':''}><span class="toggle-knob"></span></label>`
            : s.type === 'select' ? `<select data-key="${key}">${(s.options||[]).map(o => `<option value="${o}" ${(config[key]??s.default)===o?'selected':''}>${o}</option>`).join('')}</select>`
            : `<input type="${s.type==='number'?'number':'text'}" data-key="${key}" value="${config[key]!==undefined?config[key]:s.default||''}" placeholder="${s.default||''}">`}
        </div>`).join('') || '<p style="color:var(--text-2);font-size:13px">Diese App hat keine Konfigurationsoptionen.</p>';

        const saveBtn = document.getElementById('saveAppConfigBtn');
        if (saveBtn) saveBtn.onclick = async () => {
            const newConfig = {};
            body.querySelectorAll('[data-key]').forEach(el => {
                newConfig[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value;
            });
            const i = this.installedApps.findIndex(a => a.id === id);
            if (i !== -1) this.installedApps[i].config = newConfig;
            await this.saveData(); this.closeAllModals(); this.showToast('App konfiguriert!', 'success');
        };
        document.getElementById('appConfigModal')?.classList.add('active');
    }

    // ─── PLAYLISTS ───────────────────────────────────────────────────
    renderPlaylists() {
        const grid = document.getElementById('playlistsGrid'); if (!grid) return;
        grid.innerHTML = this.playlists.length ? this.playlists.map(pl => `<div class="playlist-card">
            <div class="playlist-card-header">
                <div class="playlist-card-icon"><i class="fas fa-list-ol"></i></div>
                <span class="playlist-type-badge">${pl.type==='zone'?'Zonen':'Display'}</span>
            </div>
            <div class="display-card-name">${pl.name}</div>
            <div class="playlist-items-count"><i class="fas fa-layer-group"></i> ${(pl.items||[]).length} Elemente ${pl.loop?'· Loop':''} ${pl.shuffle?'· Shuffle':''}</div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-2)">${(pl.items||[]).slice(0,4).map(it => {
                const dur = it.duration ? it.duration+'s' : '∞';
                const label = it.contentType==='app' ? (this.installedApps.find(a=>a.id===it.contentId)?.name||'App') : it.contentType==='media' ? '🖼️ Media' : '📋 Template';
                return `<span style="background:var(--bg-hover);border-radius:4px;padding:2px 6px;margin:2px;display:inline-block">${label} (${dur})</span>`;
            }).join('')}${(pl.items||[]).length > 4 ? `<span style="color:var(--text-3)">+${pl.items.length-4} weitere</span>` : ''}</div>
            <div style="display:flex;gap:6px;margin-top:12px">
                <button class="btn btn-ghost btn-sm viewer-hidden" onclick="admin.openPlaylistModal('${pl.id}')"><i class="fas fa-pen"></i> Bearbeiten</button>
                <button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.deletePlaylist('${pl.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-list-ol"></i><p>Noch keine Playlisten.<br>Klicke auf "+ Playlist"</p></div>`;
    }

    openPlaylistModal(id = null) {
        const pl = id ? this.playlists.find(p => p.id === id) : null;
        this.playlistItems = pl ? JSON.parse(JSON.stringify(pl.items || [])) : [];
        _setText('playlistModalTitle', pl ? 'Playlist bearbeiten' : 'Neue Playlist');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        set('playlistId',   pl?.id || '');
        set('playlistName', pl?.name || '');
        set('playlistType', pl?.type || 'display');
        const loop = document.getElementById('playlistLoop'); if (loop) loop.checked = pl?.loop !== false;
        const shuf = document.getElementById('playlistShuffle'); if (shuf) shuf.checked = pl?.shuffle || false;
        this.renderPlaylistEditor();
        document.getElementById('playlistModal')?.classList.add('active');
    }

    renderPlaylistEditor() {
        const el = document.getElementById('playlistItemsEditor'); if (!el) return;
        el.innerHTML = this.playlistItems.length ? this.playlistItems.map((item, i) => `
        <div class="playlist-item-row">
            <span class="playlist-item-handle"><i class="fas fa-grip-vertical"></i></span>
            <div class="playlist-item-content">
                <select onchange="admin.playlistItems[${i}].contentType=this.value;admin.renderPlaylistEditor()">
                    <option value="template" ${item.contentType==='template'?'selected':''}>📋 Template</option>
                    <option value="app"      ${item.contentType==='app'?'selected':''}>🧩 App</option>
                    <option value="media"    ${item.contentType==='media'?'selected':''}>🖼️ Media URL</option>
                </select>
                ${item.contentType === 'app'
                    ? `<select onchange="admin.playlistItems[${i}].contentId=this.value">${this.installedApps.map(a=>`<option value="${a.id}" ${item.contentId===a.id?'selected':''}>${a.name}</option>`).join('')}</select>`
                    : item.contentType === 'template'
                    ? `<select onchange="admin.playlistItems[${i}].contentId=this.value">${this.templates.map(t=>`<option value="${t.id}" ${item.contentId===t.id?'selected':''}>${t.name}</option>`).join('')}</select>`
                    : `<input type="text" value="${item.contentId||''}" placeholder="/uploads/... oder URL" onchange="admin.playlistItems[${i}].contentId=this.value">`}
                <input type="number" class="playlist-item-duration" value="${item.duration||''}" min="1" placeholder="Sek." title="Dauer — leer = Standard der App" onchange="admin.playlistItems[${i}].duration=this.value?parseInt(this.value):null" style="width:70px">
            </div>
            <button class="playlist-item-remove" onclick="admin.removePlaylistItem(${i})"><i class="fas fa-xmark"></i></button>
        </div>`).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px"><i class="fas fa-info-circle" style="display:block;font-size:24px;margin-bottom:8px"></i>Noch keine Elemente. Apps, Templates & Medien kombinieren.</div>';
    }

    addPlaylistItem()         { this.playlistItems.push({ contentType:'template', contentId: this.templates[0]?.id||'', duration: null }); this.renderPlaylistEditor(); }
    removePlaylistItem(i)     { this.playlistItems.splice(i, 1); this.renderPlaylistEditor(); }
    updatePlaylistTypeUI()    {}

    async savePlaylist() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id  = get('playlistId');
        const pl  = { name: get('playlistName'), type: get('playlistType'),
            loop: document.getElementById('playlistLoop')?.checked !== false,
            shuffle: document.getElementById('playlistShuffle')?.checked || false,
            items: this.playlistItems };
        if (!pl.name) { this.showToast('Name erforderlich', 'error'); return; }
        if (id) { const i = this.playlists.findIndex(p => p.id === id); if (i !== -1) this.playlists[i] = { ...this.playlists[i], ...pl }; }
        else this.playlists.push({ ...pl, id: 'playlist-' + Date.now() });
        this.closeAllModals(); this.renderPlaylists(); this.updateNavBadges(); await this.saveData(); this.showToast('Playlist gespeichert!', 'success');
    }

    async deletePlaylist(id) {
        if (!confirm('Playlist löschen?')) return;
        this.playlists = this.playlists.filter(p => p.id !== id);
        this.renderPlaylists(); this.updateNavBadges(); await this.saveData();
    }

    // ─── REMOTE ──────────────────────────────────────────────────────
    renderRemoteControl() {
        const el = document.getElementById('remoteDisplaysList'); if (!el) return;
        el.innerHTML = this.displays.map(d => {
            const onl = d.lastSeen && (Date.now()-new Date(d.lastSeen).getTime()) < 5*60*1000;
            return `<div class="remote-display-card">
                <div class="remote-display-title"><span><i class="fas fa-circle" style="color:${onl?'var(--green)':'var(--border)'};font-size:8px;margin-right:6px"></i>${d.name}</span><span class="display-online-badge ${onl?'badge-online':'badge-offline'}">${onl?'Online':'Offline'}</span></div>
                <div class="remote-display-btns">
                    <button class="remote-btn" onclick="admin.remoteCommand('${d.id}','reload')"><i class="fas fa-rotate"></i> Neu laden</button>
                    <button class="remote-btn" onclick="admin.remoteCommand('${d.id}','next_template')"><i class="fas fa-forward-step"></i> Nächstes</button>
                    <button class="remote-btn danger" onclick="admin.remoteCommand('${d.id}','blackout')"><i class="fas fa-moon"></i> Blackout</button>
                    <button class="remote-btn" onclick="admin.remoteCommand('${d.id}','wake')"><i class="fas fa-sun"></i> Aufwecken</button>
                </div>
            </div>`;
        }).join('') || '<div class="empty-state"><i class="fas fa-desktop"></i><p>Keine Displays</p></div>';
    }

    async remoteCommand(displayId, command) {
        const url = displayId === 'all' ? '/displays/broadcast' : `/displays/${displayId}/command`;
        await CMS.api('POST', url, { command });
        this.showToast(`"${command}" gesendet`, 'success');
    }

    // ─── SCHEDULES ───────────────────────────────────────────────────
    async loadSchedules() {
        const schedules = this.data?.schedules || [];
        const now = new Date(); const cd = now.getDay(); const ct = now.getHours()*60+now.getMinutes();
        const active = schedules.find(s => {
            if (!s.active || !s.days?.includes(cd)) return false;
            const [sh,sm] = (s.startTime||'00:00').split(':').map(Number);
            const [eh,em] = (s.endTime||'23:59').split(':').map(Number);
            return ct >= sh*60+sm && ct < eh*60+em;
        });
        const list = document.getElementById('schedulesList'); if (!list) return;
        const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        list.innerHTML = schedules.length ? schedules.map(s => `<div class="schedule-card ${active?.id===s.id?'is-active-now':''}">
            <div class="schedule-active-dot"></div>
            <div class="schedule-info">
                <div class="schedule-name">${s.name} ${active?.id===s.id?'<span class="schedule-tag" style="color:var(--green)">🟢 Aktiv</span>':''}</div>
                <div class="schedule-meta">
                    <span class="schedule-tag time"><i class="fas fa-clock"></i> ${s.startTime||''}–${s.endTime||''}</span>
                    <span class="schedule-tag">${(s.days||[]).map(d=>days[d]).join(', ')}</span>
                    ${s.badge?`<span class="schedule-tag">${s.badge}</span>`:''}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                <label class="toggle"><input type="checkbox" ${s.active?'checked':''} onchange="admin.toggleSchedule('${s.id}',this.checked)"><span class="toggle-knob"></span></label>
                <button class="btn btn-ghost btn-xs viewer-hidden" onclick="admin.openScheduleModal('${s.id}')"><i class="fas fa-pen"></i></button>
                <button class="btn btn-danger btn-xs viewer-hidden" onclick="admin.deleteSchedule('${s.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : '<div class="empty-state"><i class="fas fa-clock"></i><p>Keine Zeitpläne</p></div>';
    }

    openScheduleModal(id = null) {
        const s = id ? (this.data?.schedules||[]).find(x => x.id === id) : null;
        _setText('scheduleModalTitle', s ? 'Zeitplan bearbeiten' : 'Neuer Zeitplan');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        set('scheduleId',    s?.id || '');
        set('scheduleName',  s?.name || '');
        set('scheduleBadge', s?.badge || '');
        set('scheduleStart', s?.startTime || '06:00');
        set('scheduleEnd',   s?.endTime || '22:00');
        set('scheduleTheme', s?.theme || 'dark');
        set('scheduleTicker',s?.tickerText || '');
        document.querySelectorAll('.schedule-day-check').forEach(cb => { cb.checked = s?.days ? s.days.includes(parseInt(cb.value)) : [1,2,3,4,5].includes(parseInt(cb.value)); });
        const tplSel = document.getElementById('scheduleTemplate');
        if (tplSel) tplSel.innerHTML = this.templates.map(t => `<option value="${t.id}" ${s?.templateId===t.id?'selected':''}>${t.name}</option>`).join('');
        document.getElementById('scheduleModal')?.classList.add('active');
    }

    async saveSchedule() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id  = get('scheduleId');
        const s   = { id: id || 'schedule-'+Date.now(), name: get('scheduleName'), badge: get('scheduleBadge'),
            startTime: get('scheduleStart'), endTime: get('scheduleEnd'),
            days: Array.from(document.querySelectorAll('.schedule-day-check:checked')).map(cb => parseInt(cb.value)),
            templateId: get('scheduleTemplate'), theme: get('scheduleTheme'),
            tickerText: get('scheduleTicker'), active: true };
        if (!s.name) { this.showToast('Name erforderlich', 'error'); return; }
        if (!this.data.schedules) this.data.schedules = [];
        if (id) { const i = this.data.schedules.findIndex(x => x.id === id); if (i !== -1) this.data.schedules[i] = s; else this.data.schedules.push(s); }
        else this.data.schedules.push(s);
        await this.saveData(); this.closeAllModals(); this.loadSchedules(); this.showToast('Zeitplan gespeichert!', 'success');
    }

    async deleteSchedule(id) {
        if (!confirm('Zeitplan löschen?')) return;
        this.data.schedules = (this.data.schedules||[]).filter(s => s.id !== id);
        await this.saveData(); this.loadSchedules(); this.showToast('Zeitplan gelöscht', 'success');
    }

    async toggleSchedule(id, active) {
        const s = (this.data?.schedules||[]).find(s => s.id === id);
        if (s) s.active = active;
        await this.saveData();
    }

    // ─── ANALYTICS ───────────────────────────────────────────────────
    async loadAnalytics() {
        const res = await CMS.api('GET', '/analytics');
        if (!res) return;
        this.analyticsData = res;
        if (this.currentTab === 'analytics') this.renderAnalytics();
        if (this.currentTab === 'dashboard')  this.renderDashboard();
    }

    renderAnalytics() {
        const a = this.analyticsData; if (!a) return;
        const pr = document.getElementById('analyticsProductRanking');
        if (pr) pr.innerHTML = (a.productRanking||[]).slice(0,10).map((p,i) => `<div class="analytics-row">
            <span class="analytics-rank">${i+1}</span><span class="analytics-name">${p.name}</span>
            <span class="analytics-cat">${p.category}</span><span class="analytics-views">${p.views}</span>
        </div>`).join('') || '<div style="text-align:center;color:var(--text-2);padding:20px">Noch keine Daten</div>';

        const d7 = document.getElementById('analytics7Days');
        if (d7 && a.last7Days) {
            const max = Math.max(...a.last7Days.map(d=>d.views), 1);
            d7.innerHTML = `<div class="chart-bars">${a.last7Days.map(d=>`<div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.round(d.views/max*100)}px" title="${d.views} Aufrufe am ${d.date}"></div></div>`).join('')}</div>
            <div class="chart-x-labels">${a.last7Days.map(d=>`<span class="chart-x-label">${d.date.slice(5)}</span>`).join('')}</div>`;
        }
        const ho = document.getElementById('analyticsHourly');
        if (ho && a.hourlyToday) {
            const max = Math.max(...a.hourlyToday.map(h=>h.views), 1);
            ho.innerHTML = `<div class="chart-bars">${a.hourlyToday.map(h=>`<div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.round(h.views/max*100)}px" title="${h.hour}:00 Uhr – ${h.views}x"></div></div>`).join('')}</div>`;
        }
        const dv = document.getElementById('analyticsDisplays');
        if (dv) {
            const entries = Object.entries(a.displayViews||{});
            dv.innerHTML = entries.length ? entries.map(([id,views])=>{
                const d = this.displays.find(d=>d.id===id);
                return `<div class="analytics-row"><span class="analytics-name">${d?.name||id}</span><span class="analytics-views">${views}</span></div>`;
            }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px">Noch keine Daten</div>';
        }
    }

    async resetAnalytics() {
        if (!confirm('Analytics zurücksetzen?')) return;
        await CMS.api('DELETE', '/analytics/reset');
        await this.loadAnalytics(); this.showToast('Zurückgesetzt', 'success');
    }

    // ─── USERS ───────────────────────────────────────────────────────
    async loadUsers() {
        const res   = await CMS.api('GET', '/users');
        const users = res?.users || [];
        const nbu   = document.getElementById('nb-users'); if (nbu) nbu.textContent = users.length;
        const table = document.getElementById('usersTable'); if (!table) return;
        table.innerHTML = `<table>
            <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
            <tbody>${users.map(u => `<tr>
                <td><strong>${u.name}</strong></td>
                <td style="font-size:12px">${u.email}</td>
                <td><span class="role-badge role-${u.role}">${{tenantadmin:'Tenant-Admin',editor:'Editor',viewer:'Viewer'}[u.role]||u.role}</span></td>
                <td><span class="${u.active!==false?'status-active':'status-inactive'}">${u.active!==false?'● Aktiv':'○ Inaktiv'}</span></td>
                <td style="font-size:11px;color:var(--text-2)">${new Date(u.createdAt).toLocaleDateString('de-DE')}</td>
                <td><div style="display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" onclick="admin.openUserModal('${u.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="admin.deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`).join('')}</tbody>
        </table>`;
    }

    openUserModal(id = null) {
        _setText('userModalTitle', id ? 'Nutzer bearbeiten' : 'Nutzer einladen');
        const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        set('userId', id || ''); set('userName', ''); set('userEmail', '');
        set('userRole', 'editor'); set('userPassword', '');
        const hint = document.getElementById('pwHint'); if (hint) hint.style.display = id ? 'inline' : 'none';
        if (id) {
            CMS.api('GET', '/users').then(res => {
                const u = (res?.users||[]).find(x => x.id === id);
                if (u) { set('userName', u.name); set('userEmail', u.email); set('userRole', u.role); }
            });
        }
        document.getElementById('userModal')?.classList.add('active');
    }

    async saveUser() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const id  = get('userId');
        const pw  = get('userPassword');
        const body = { name: get('userName'), email: get('userEmail'), role: get('userRole'), ...(pw ? { password: pw } : {}) };
        if (!id && !pw) { this.showToast('Passwort für neue Nutzer erforderlich', 'error'); return; }
        const res = id ? await CMS.api('PUT', `/users/${id}`, body) : await CMS.api('POST', '/users', body);
        if (res?.success) { this.closeAllModals(); this.loadUsers(); this.showToast(id ? 'Nutzer aktualisiert!' : 'Nutzer erstellt!', 'success'); }
        else this.showToast(res?.error || 'Fehler', 'error');
    }

    async deleteUser(id) {
        if (!confirm('Nutzer löschen?')) return;
        const res = await CMS.api('DELETE', `/users/${id}`);
        if (res?.success) { this.loadUsers(); this.showToast('Nutzer gelöscht', 'success'); }
    }

    // ─── FEATURES ────────────────────────────────────────────────────
    renderFeatureSettings() {
        const d = this.data || {}; const w = d.weather || {}; const qr = d.qrCodes || {}; const lang = d.languages || {}; const anim = d.animations || {};
        const ws = document.getElementById('weatherSettings');
        if (ws) ws.innerHTML = `
            <div class="setting-row"><label>Wetter aktiv</label><label class="toggle"><input type="checkbox" id="weatherEnabled" ${w.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Breitengrad</label><input type="text" id="weatherLat" value="${w.latitude||'52.52'}"></div>
            <div class="form-group"><label>Längengrad</label><input type="text" id="weatherLon" value="${w.longitude||'13.41'}"></div>
            <div class="setting-row"><label>Empfehlungen</label><label class="toggle"><input type="checkbox" id="weatherRecommendations" ${w.showRecommendations!==false?'checked':''}><span class="toggle-knob"></span></label></div>`;
        const qs = document.getElementById('qrSettings');
        if (qs) qs.innerHTML = `
            <div class="setting-row"><label>QR-Codes aktiv</label><label class="toggle"><input type="checkbox" id="qrEnabled" ${qr.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Basis-URL</label><input type="text" id="qrBaseUrl" value="${qr.baseUrl||''}"></div>`;
        const ls = document.getElementById('languageSettings');
        if (ls) ls.innerHTML = `
            <div class="form-group"><label>Aktivierte Sprachen</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="de" ${(lang.enabled||['de']).includes('de')?'checked':''}><span>🇩🇪 DE</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="en" ${(lang.enabled||[]).includes('en')?'checked':''}><span>🇬🇧 EN</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="ar" ${(lang.enabled||[]).includes('ar')?'checked':''}><span>🇸🇦 AR</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="tr" ${(lang.enabled||[]).includes('tr')?'checked':''}><span>🇹🇷 TR</span></label>
            </div></div>`;
        const as = document.getElementById('animationSettings');
        if (as) as.innerHTML = `
            <div class="setting-row"><label>Animationen aktiv</label><label class="toggle"><input type="checkbox" id="animEnabled" ${anim.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Übergang</label><select id="animTransition"><option value="slide" ${anim.pageTransition==='slide'?'selected':''}>Slide</option><option value="fade" ${anim.pageTransition==='fade'?'selected':''}>Fade</option><option value="none" ${anim.pageTransition==='none'?'selected':''}>Kein</option></select></div>`;
    }

    async testWeather() {
        const lat = document.getElementById('weatherLat')?.value||'52.52';
        const lon = document.getElementById('weatherLon')?.value||'13.41';
        const r   = document.getElementById('weatherTestResult'); if (r) r.textContent = '⏳ Lädt…';
        try { const w = await CMS.api('GET', `/weather?lat=${lat}&lon=${lon}`); if (r) r.textContent = w ? `${w.icon} ${w.temperature}°C | 💨 ${w.windspeed} km/h` : '❌ Fehler'; }
        catch { if (r) r.textContent = '❌ Fehler'; }
    }

    async saveFeatures() {
        if (!this.data) return;
        this.data.weather    = { enabled: document.getElementById('weatherEnabled')?.checked!==false, latitude: document.getElementById('weatherLat')?.value||'52.52', longitude: document.getElementById('weatherLon')?.value||'13.41', showRecommendations: document.getElementById('weatherRecommendations')?.checked!==false };
        this.data.qrCodes    = { enabled: document.getElementById('qrEnabled')?.checked!==false, baseUrl: document.getElementById('qrBaseUrl')?.value||'' };
        this.data.languages  = { enabled: Array.from(document.querySelectorAll('.lang-check:checked')).map(cb=>cb.value), default:'de' };
        this.data.animations = { enabled: document.getElementById('animEnabled')?.checked!==false, pageTransition: document.getElementById('animTransition')?.value||'slide' };
        await this.saveData(); this.showToast('Features gespeichert!', 'success');
    }

    // ─── SETTINGS ────────────────────────────────────────────────────
    renderSettings() {
        const s = this.settings;
        document.querySelectorAll('.theme-pill').forEach(b => b.classList.toggle('active', b.dataset.theme===(s.theme||'dark')));
        const st = document.getElementById('settingTheme'); if (st) st.value = s.theme||'dark';
        const ce = document.getElementById('customThemeEditor'); if (ce) ce.style.display = s.theme==='custom' ? 'block' : 'none';
        this.renderFontSelector(s.font||'Inter');
        this.renderCurrencyPicker(s.currency||'€');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('settingCurrencyPosition', s.currencyPosition||'after');
        set('settingLanguage',  s.language||'de');
        set('settingRefresh',   s.refreshInterval||30);
        const ar = document.getElementById('settingAutoRotate'); if (ar) ar.checked = s.autoRotate||false;
        const sb = document.getElementById('settingShowBadges'); if (sb) sb.checked = s.showBadges!==false;
        const t = this.data?.ticker||{};
        const te = document.getElementById('settingTickerEnabled'); if (te) te.checked = t.enabled!==false;
        set('settingTickerSpeed', t.speed||50);
        _setText('tickerSpeedVal', t.speed||50);
        set('settingTickerColor', t.color||'#FFD700');
        set('settingTickerBg',    t.backgroundColor||'#1a1a2e');
    }

    renderFontSelector(current='Inter') {
        const fonts = [{name:'Inter',label:'Inter'},{name:'DM Sans',label:'DM Sans'},{name:'Roboto',label:'Roboto'},{name:'Poppins',label:'Poppins'},{name:'Oswald',label:'Oswald'},{name:'Montserrat',label:'Montserrat'},{name:'Lato',label:'Lato'},{name:'Nunito',label:'Nunito'}];
        const el = document.getElementById('fontSelector'); if (!el) return;
        el.innerHTML = fonts.map(f => `<div class="font-option ${f.name===current?'active':''}" data-font="${f.name}" style="font-family:'${f.name}',sans-serif">${f.label}</div>`).join('');
        el.querySelectorAll('.font-option').forEach(opt => opt.addEventListener('click', () => {
            el.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const sf = document.getElementById('settingFont'); if (sf) sf.value = opt.dataset.font;
            const fp = document.getElementById('fontPreview'); if (fp) fp.style.fontFamily = `'${opt.dataset.font}',sans-serif`;
        }));
        const fp = document.getElementById('fontPreview'); if (fp) fp.style.fontFamily = `'${current}',sans-serif`;
    }

    renderCurrencyPicker(current='€') {
        const currencies = [{symbol:'€',name:'Euro'},{symbol:'$',name:'Dollar'},{symbol:'£',name:'Pfund'},{symbol:'¥',name:'Yen'},{symbol:'₺',name:'Lira'},{symbol:'CHF',name:'Franken'},{symbol:'kr',name:'Krone'},{symbol:'zł',name:'Zloty'},{symbol:'Ft',name:'Forint'}];
        const el = document.getElementById('currencyPicker'); if (!el) return;
        el.innerHTML = currencies.map(c => `<div class="currency-option ${c.symbol===current?'active':''}" data-currency="${c.symbol}"><span class="curr-symbol">${c.symbol}</span><span class="curr-name">${c.name}</span></div>`).join('');
        el.querySelectorAll('.currency-option').forEach(opt => opt.addEventListener('click', () => {
            el.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const sc = document.getElementById('settingCurrency'); if (sc) sc.value = opt.dataset.currency;
        }));
    }

    saveSettings() {
        const get  = id => document.getElementById(id)?.value || '';
        const getb = id => document.getElementById(id)?.checked !== false;
        const s = this.settings;
        s.theme              = get('settingTheme');
        s.font               = get('settingFont');
        s.currency           = get('settingCurrency');
        s.currencyPosition   = get('settingCurrencyPosition');
        s.language           = get('settingLanguage');
        s.refreshInterval    = parseInt(get('settingRefresh'))||30;
        s.autoRotate         = getb('settingAutoRotate');
        s.showBadges         = getb('settingShowBadges');
        if (s.theme === 'custom') {
            s.customTheme = {};
            ['bgPrimary','bgCard','accentPrimary','accentSecondary','textPrimary','priceColor','borderColor'].forEach(k => {
                const inp = document.getElementById('ct-'+k); if (inp) s.customTheme[k] = inp.value;
            });
        }
        if (!this.data.ticker) this.data.ticker = {};
        this.data.ticker.enabled         = getb('settingTickerEnabled');
        this.data.ticker.speed           = parseInt(get('settingTickerSpeed'))||50;
        this.data.ticker.color           = get('settingTickerColor');
        this.data.ticker.backgroundColor = get('settingTickerBg');
        this.saveData();
    }

    resetSettings() {
        if (!confirm('Einstellungen zurücksetzen?')) return;
        this.settings = { theme:'dark', currency:'€', currencyPosition:'after', language:'de', font:'Inter', refreshInterval:30, autoRotate:false, showBadges:true };
        this.renderSettings(); this.showToast('Zurückgesetzt', 'info');
    }

    async changePassword() {
        const cur = document.getElementById('curPw')?.value;
        const nw  = document.getElementById('newPw')?.value;
        const nw2 = document.getElementById('newPw2')?.value;
        if (nw !== nw2) { this.showToast('Passwörter stimmen nicht überein', 'error'); return; }
        const res = await CMS.api('POST', '/auth/change-password', { currentPassword: cur, newPassword: nw });
        if (res?.success) {
            this.showToast('Passwort geändert!', 'success');
            ['curPw','newPw','newPw2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        } else this.showToast(res?.error || 'Fehler', 'error');
    }

    // ─── MODALS & TOAST ──────────────────────────────────────────────
    closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

    showToast(msg, type='info') {
        const icons  = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
        const colors = { success:'var(--green)', error:'var(--red)', info:'var(--accent)' };
        const el     = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<i class="fas ${icons[type]||'fa-circle-info'}" style="color:${colors[type]}"></i><span>${msg}</span>`;
        document.getElementById('toastContainer')?.appendChild(el);
        setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, 3500);
    }
}
