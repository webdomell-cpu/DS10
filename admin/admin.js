'use strict';
/**
 * DIGITAL SIGNAGE CMS v9.0 — Tenant Admin JS
 * Multi-Tenant, JWT Auth, Apps, Playlists, Users
 */

// ═══ AUTH ═══
const CMS = {
    token: localStorage.getItem('cms_token'),
    user:  JSON.parse(localStorage.getItem('cms_user') || 'null'),
    async api(method, url, body) {
        const res = await fetch('/api' + url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        if (res.status === 401) { cmsLogout(); return null; }
        return res.json();
    }
};

function cmsLogout() {
    localStorage.removeItem('cms_token');
    localStorage.removeItem('cms_user');
    window.location.href = '/admin/login.html';
}

function returnToSuperAdmin() {
    const saToken = localStorage.getItem('cms_sa_token');
    const saUser  = localStorage.getItem('cms_sa_user');
    if (saToken) {
        localStorage.setItem('cms_token', saToken);
        localStorage.setItem('cms_user', saUser);
        localStorage.removeItem('cms_sa_token');
        localStorage.removeItem('cms_sa_user');
        window.location.href = '/superadmin/';
    }
}

// Auth check
(async () => {
    if (!CMS.token || !CMS.user) { window.location.href = '/admin/login.html'; return; }
    if (CMS.user.role === 'superadmin') { window.location.href = '/superadmin/'; return; }

    // Show UI
    document.getElementById('authGuard').style.display = 'none';
    document.getElementById('appShell').style.display  = '';

    // Set tenant info in sidebar
    document.getElementById('tenantName').textContent = CMS.user.tenantName || 'CMS';
    document.getElementById('tenantPlan').textContent  = 'Angemeldet';
    document.getElementById('sidebarAvatar').textContent = (CMS.user.name || 'U')[0].toUpperCase();
    document.getElementById('sidebarUserName').textContent = CMS.user.name || CMS.user.email;
    document.getElementById('sidebarUserRole').textContent = { tenantadmin:'Tenant-Admin', editor:'Editor', viewer:'Viewer' }[CMS.user.role] || CMS.user.role;

    // Show "return to superadmin" if impersonating
    if (localStorage.getItem('cms_sa_token')) document.getElementById('saReturnBtn').style.display = '';

    // Role-based UI
    if (CMS.user.role === 'viewer') {
        document.querySelectorAll('.viewer-hidden').forEach(el => el.style.display = 'none');
    }
    if (CMS.user.role !== 'tenantadmin') {
        document.querySelectorAll('.editor-hidden').forEach(el => el.style.display = 'none');
    }

    window.admin = new MenuboardAdmin();
})();

class MenuboardAdmin {
    constructor() {
        this.data = null;
        this.products = [];
        this.zones = [];
        this.templates = [];
        this.displays = [];
        this.playlists = [];
        this.installedApps = [];
        this.availableApps = [];
        this.settings = {};
        this.analyticsData = null;
        this.currentTab = 'dashboard';
        this.selectedZone = null;
        this.canvasZoom = 1;
        this.playlistItems = [];
        this.editingPlaylistId = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.setupClock();
        this.renderAll();
        this.switchTab('dashboard');
        await this.loadAnalytics();
    }

    // ═══ DATA ═══
    async loadData() {
        const d = await CMS.api('GET', '/data');
        if (!d) return;
        this.data = d;
        this.products  = d.products  || [];
        this.zones     = d.zones     || [];
        this.templates = d.templates || [];
        this.displays  = d.displays  || [];
        this.playlists = d.playlists || [];
        this.installedApps = d.apps  || [];
        this.settings  = d.settings  || {};

        // Display limit info
        const sa = await CMS.api('GET', '/superadmin/stats').catch(() => null);
        const lim = document.getElementById('displayLimitInfo');
        if (lim) lim.textContent = `${this.displays.length} Displays`;
    }

    async saveData() {
        const payload = { ...this.data, products: this.products, zones: this.zones, templates: this.templates, displays: this.displays, playlists: this.playlists, apps: this.installedApps, settings: this.settings };
        const res = await CMS.api('POST', '/save', payload);
        if (res?.success) { this.showToast('Gespeichert!', 'success'); this.data.lastModified = new Date().toISOString(); this.renderDashboard(); }
        else this.showToast('Speicherfehler', 'error');
    }

    // ═══ EVENTS ═══
    setupEventListeners() {
        // Nav
        document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
            el.addEventListener('click', e => { e.preventDefault(); this.switchTab(el.dataset.tab); });
        });
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('collapsed');
        });
        document.getElementById('saveAllBtn').addEventListener('click', () => this.saveData());

        // Products
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.openProductModal());
        document.getElementById('saveProductBtn').addEventListener('click', () => this.saveProduct());
        document.getElementById('productSearch').addEventListener('input', () => this.renderProducts());
        document.getElementById('categoryFilter').addEventListener('change', () => this.renderProducts());

        // Displays
        document.getElementById('addDisplayBtn')?.addEventListener('click', () => this.openDisplayModal());
        document.getElementById('saveDisplayBtn').addEventListener('click', () => this.saveDisplay());
        document.getElementById('displaySlug').addEventListener('input', e => {
            const preview = document.getElementById('displayUrlPreview');
            if (preview) preview.textContent = `/display/${CMS.user.tenantSlug || 'tenant'}/${e.target.value}`;
        });

        // Templates
        document.getElementById('addTemplateBtn')?.addEventListener('click', () => this.openTemplateModal());
        document.getElementById('saveTemplateBtn').addEventListener('click', () => this.saveTemplate());

        // Designer
        ['toolAddMenu','toolAddMedia','toolAddTicker','toolAddText','toolAddClock','toolAddApp'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                const types = { toolAddMenu:'menu', toolAddMedia:'media', toolAddTicker:'ticker', toolAddText:'text', toolAddClock:'clock', toolAddApp:'app' };
                this.addZone(types[id]);
            });
        });
        document.getElementById('zoomIn')?.addEventListener('click',  () => this.zoomCanvas(.1));
        document.getElementById('zoomOut')?.addEventListener('click', () => this.zoomCanvas(-.1));
        document.getElementById('zoomFit')?.addEventListener('click', () => { this.canvasZoom=1; this.renderDesignerCanvas(); });
        document.getElementById('saveLayoutBtn')?.addEventListener('click', () => this.saveData());
        document.getElementById('saveZoneBtn')?.addEventListener('click', () => this.saveZone());
        document.getElementById('deleteZoneBtn')?.addEventListener('click', () => this.deleteSelectedZone());
        document.getElementById('zoneType')?.addEventListener('change', e => this.updateZoneTypeUI(e.target.value));

        // Playlists
        document.getElementById('addPlaylistBtn')?.addEventListener('click', () => this.openPlaylistModal());
        document.getElementById('savePlaylistBtn').addEventListener('click', () => this.savePlaylist());

        // Schedules
        document.getElementById('addScheduleBtn')?.addEventListener('click', () => this.openScheduleModal());
        document.getElementById('saveScheduleBtn').addEventListener('click', () => this.saveSchedule());

        // Users
        document.getElementById('addUserBtn')?.addEventListener('click', () => this.openUserModal());
        document.getElementById('saveUserBtn').addEventListener('click', () => this.saveUser());

        // Media
        document.getElementById('mediaUpload')?.addEventListener('change', e => this.handleMediaUpload(e));

        // Features
        document.getElementById('saveFeaturesBtn')?.addEventListener('click', () => this.saveFeatures());

        // Settings
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettingsBtn')?.addEventListener('click', () => this.resetSettings());
        document.getElementById('settingTickerSpeed')?.addEventListener('input', e => {
            const v = document.getElementById('tickerSpeedVal'); if (v) v.textContent = e.target.value;
        });
        document.querySelectorAll('.theme-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('settingTheme').value = btn.dataset.theme;
                document.getElementById('customThemeEditor').style.display = btn.dataset.theme === 'custom' ? 'block' : 'none';
            });
        });
        ['bgPrimary','bgCard','accentPrimary','accentSecondary','textPrimary','priceColor','borderColor'].forEach(k => {
            const inp = document.getElementById('ct-' + k);
            const span = document.getElementById('ct-' + k + '-val');
            if (inp && span) inp.addEventListener('input', () => span.textContent = inp.value);
        });
        this.renderFontSelector();
        this.renderCurrencyPicker();

        // Modal close
        document.querySelectorAll('.modal-close, .modal-cancel, .modal-backdrop').forEach(el => {
            el.addEventListener('click', () => this.closeAllModals());
        });
    }

    // ═══ TABS ═══
    switchTab(tab) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
        this.currentTab = tab;
        const titles = { dashboard:'Dashboard', products:'Produkte', media:'Mediathek', apps:'Apps', displays:'Displays', templates:'Templates', designer:'Designer', playlists:'Playlisten', remote:'Fernsteuerung', schedules:'Zeitpläne', analytics:'Analytics', users:'Nutzer', features:'Features', settings:'Einstellungen' };
        document.getElementById('pageTitle').textContent = titles[tab] || tab;
        if (tab === 'designer')   { setTimeout(() => this.renderDesignerCanvas(), 50); }
        else if (tab === 'media')     this.loadMedia();
        else if (tab === 'apps')      this.renderApps();
        else if (tab === 'schedules') this.loadSchedules();
        else if (tab === 'analytics') this.loadAnalytics();
        else if (tab === 'remote')    this.renderRemoteControl();
        else if (tab === 'features')  this.renderFeatureSettings();
        else if (tab === 'settings')  this.renderSettings();
        else if (tab === 'users')     this.loadUsers();
        else if (tab === 'dashboard') this.renderDashboard();
    }

    renderAll() {
        this.renderProducts();
        this.renderDisplays();
        this.renderTemplates();
        this.renderPlaylists();
        this.updateNavBadges();
    }

    updateNavBadges() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('nb-products', this.products.length);
        s('nb-displays', this.displays.length);
        s('nb-playlists', this.playlists.length);
        s('nb-apps', this.installedApps.length);
    }

    setupClock() {
        const tick = () => { const el = document.getElementById('topbarTime'); if (el) el.textContent = new Date().toLocaleTimeString('de-DE'); };
        tick(); setInterval(tick, 1000);
    }

    timeAgo(ts) {
        const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
        if (s < 60) return 'Gerade eben';
        if (s < 3600) return `vor ${Math.floor(s/60)} Min.`;
        if (s < 86400) return `vor ${Math.floor(s/3600)} Std.`;
        return `vor ${Math.floor(s/86400)} Tagen`;
    }

    // ═══ DASHBOARD ═══
    renderDashboard() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('ds-products', this.products.length);
        s('ds-displays', this.displays.length);
        s('ds-playlists', this.playlists.length);
        s('ds-apps', this.installedApps.length);
        s('ds-views', this.analyticsData?.totalProductViews || '—');
        const online = this.displays.filter(d => d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000).length;
        s('ds-online', online);
        s('di-tenant', CMS.user.tenantName || '—');
        s('di-plan', CMS.user.plan || '—');
        s('di-displays', this.displays.length);
        s('di-saved', this.data?.lastModified ? new Date(this.data.lastModified).toLocaleString('de-DE') : '—');

        const dl = document.getElementById('ds-display-list');
        if (dl) {
            dl.innerHTML = this.displays.length ? this.displays.map(d => {
                const onl = d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000;
                return `<div class="display-status-row">
                    <span class="display-status-name"><i class="fas fa-circle" style="color:${onl?'var(--green)':'var(--border)'};font-size:8px;margin-right:6px"></i>${d.name}</span>
                    <span class="display-status-time">${d.lastSeen ? this.timeAgo(d.lastSeen) : 'Nie'}</span>
                    <span class="display-online-badge ${onl?'badge-online':'badge-offline'}">${onl?'Online':'Offline'}</span>
                </div>`;
            }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px">Keine Displays</div>';
        }

        const tp = document.getElementById('ds-top-products');
        if (tp) {
            const top = (this.analyticsData?.productRanking || []).slice(0,5);
            tp.innerHTML = top.length ? top.map((p,i) => {
                const maxV = top[0]?.views || 1;
                return `<div class="top-product-row"><span class="top-rank">${i+1}</span><span class="top-name">${p.name}</span><div class="top-bar" style="width:60px"><div class="top-bar-fill" style="width:${Math.round(p.views/maxV*100)}%"></div></div><span class="top-views">${p.views}</span></div>`;
            }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px">Noch keine Daten</div>';
        }

        // Preview select
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
        const f = document.getElementById('livePreview');
        if (f && slug) f.src = `/display/${CMS.user.tenantSlug || 'demo'}/${slug}`;
    }

    // ═══ PRODUCTS ═══
    renderProducts() {
        const search = document.getElementById('productSearch').value.toLowerCase();
        const cat = document.getElementById('categoryFilter').value;
        const currency = this.settings.currency || '€';
        const cpos = this.settings.currencyPosition || 'after';
        const fmt = p => cpos === 'before' ? `${currency} ${p}` : `${p} ${currency}`;
        const filtered = this.products.filter(p => (!cat || p.category === cat) && (!search || p.title.toLowerCase().includes(search)));
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        grid.innerHTML = filtered.length ? filtered.map(p => `
        <div class="product-card" onclick="admin.openProductModal('${p.id}')">
            <div class="product-card-img">${p.image ? `<img src="${p.image}" alt="${p.title}">` : '<i class="fas fa-image no-img"></i>'}</div>
            <div class="product-card-body">
                <div class="product-card-name">${p.title}</div>
                <div class="product-card-cat">${p.category}</div>
                <div class="product-card-footer">
                    <span class="product-price">${p.stockStatus==='soldout'?'—':fmt(p.price)}</span>
                    ${p.badge?`<span class="product-badge">${p.badge}</span>`:''}
                </div>
            </div>
            <div class="product-card-actions">
                <button class="btn btn-ghost btn-xs viewer-hidden" onclick="event.stopPropagation();admin.openProductModal('${p.id}')"><i class="fas fa-pen"></i></button>
                <button class="btn btn-danger btn-xs viewer-hidden" onclick="event.stopPropagation();admin.deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><p>Keine Produkte</p></div>';
    }

    openProductModal(id = null) {
        const p = id ? this.products.find(p => String(p.id) === String(id)) : null;
        document.getElementById('productModalTitle').textContent = p ? 'Produkt bearbeiten' : 'Neues Produkt';
        document.getElementById('productId').value = p?.id || '';
        document.getElementById('productTitle').value = p?.title || '';
        document.getElementById('productPrice').value = p?.price || '';
        document.getElementById('productCategory').value = p?.category || 'burger';
        document.getElementById('productBadge').value = p?.badge || '';
        document.getElementById('productDescription').value = p?.description || '';
        document.getElementById('productImageUrl').value = p?.image || '';
        document.getElementById('productStock').value = p?.stockStatus || 'available';
        document.getElementById('productModal').classList.add('active');
    }

    async saveProduct() {
        const id = document.getElementById('productId').value;
        const p = { title: document.getElementById('productTitle').value.trim(), price: document.getElementById('productPrice').value.trim(), category: document.getElementById('productCategory').value, badge: document.getElementById('productBadge').value, description: document.getElementById('productDescription').value.trim(), image: document.getElementById('productImageUrl').value.trim(), stockStatus: document.getElementById('productStock').value };
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

    // ═══ DISPLAYS ═══
    renderDisplays() {
        const grid = document.getElementById('displaysGrid');
        if (!grid) return;
        grid.innerHTML = this.displays.length ? this.displays.map(d => {
            const onl = d.lastSeen && (Date.now() - new Date(d.lastSeen).getTime()) < 5*60*1000;
            const tpl = this.templates.find(t => t.id === d.templateId);
            const pl  = this.playlists.find(p => p.id === d.playlistId);
            const url = `/display/${CMS.user.tenantSlug || 'demo'}/${d.slug}`;
            return `<div class="display-card">
                <div class="display-card-header"><div class="display-card-icon"><i class="fas fa-desktop"></i></div><span class="display-online-badge ${onl?'badge-online':'badge-offline'}">${onl?'Online':'Offline'}</span></div>
                <div class="display-card-name">${d.name}</div>
                <div class="display-card-slug">/display/${CMS.user.tenantSlug || ''}/${d.slug}</div>
                <div class="display-card-desc">${d.description || '—'}</div>
                <div class="display-meta">
                    <span><i class="fas fa-table-cells-large"></i> ${tpl?.name || '—'}</span>
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
        }).join('') : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-desktop"></i><p>Noch keine Displays.<br>Klicke auf "+ Display"</p></div>';
    }

    openDisplayModal(id = null) {
        const d = id ? this.displays.find(x => x.id === id) : null;
        document.getElementById('displayModalTitle').textContent = d ? 'Display bearbeiten' : 'Neues Display';
        document.getElementById('displayId').value = d?.id || '';
        document.getElementById('displayName').value = d?.name || '';
        document.getElementById('displaySlug').value = d?.slug || '';
        document.getElementById('displayDescription').value = d?.description || '';
        document.getElementById('displayActive').checked = d?.active !== false;
        const prev = document.getElementById('displayUrlPreview');
        if (prev && d?.slug) prev.textContent = `/display/${CMS.user.tenantSlug || ''}/${d.slug}`;
        document.getElementById('displayTemplate').innerHTML = this.templates.map(t => `<option value="${t.id}" ${d?.templateId===t.id?'selected':''}>${t.name}</option>`).join('');
        document.getElementById('displayPlaylist').innerHTML = '<option value="">Keine Playlist</option>' + this.playlists.map(p => `<option value="${p.id}" ${d?.playlistId===p.id?'selected':''}>${p.name}</option>`).join('');
        document.getElementById('displayModal').classList.add('active');
    }

    async saveDisplay() {
        const id = document.getElementById('displayId').value;
        const d = { name: document.getElementById('displayName').value.trim(), slug: document.getElementById('displaySlug').value.toLowerCase().replace(/[^a-z0-9-]/g,'-'), description: document.getElementById('displayDescription').value.trim(), templateId: document.getElementById('displayTemplate').value, playlistId: document.getElementById('displayPlaylist').value || null, active: document.getElementById('displayActive').checked };
        if (!d.name || !d.slug) { this.showToast('Name & Slug erforderlich', 'error'); return; }
        if (id) { const i = this.displays.findIndex(x => x.id === id); if (i !== -1) this.displays[i] = { ...this.displays[i], ...d }; }
        else this.displays.push({ ...d, id: 'display-' + Date.now(), createdAt: new Date().toISOString(), lastSeen: null });
        this.closeAllModals(); this.renderDisplays(); this.updateNavBadges(); await this.saveData();
    }

    async deleteDisplay(id) {
        if (!confirm('Display löschen?')) return;
        this.displays = this.displays.filter(d => d.id !== id);
        this.renderDisplays(); this.updateNavBadges(); await this.saveData();
    }

    // ═══ TEMPLATES ═══
    renderTemplates() {
        const grid = document.getElementById('templatesGrid');
        if (!grid) return;
        const pills = document.getElementById('templateButtons');
        if (pills) pills.innerHTML = this.templates.map(t => `<button class="template-pill-btn" onclick="admin.applyTemplate('${t.id}')">${t.name}</button>`).join('');
        grid.innerHTML = this.templates.map(t => `<div class="template-card ${t.isDefault?'is-default':''}">
            <div class="template-preview">${t.zones?.map(z => `<div class="template-zone-preview" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%">${z.type}</div>`).join('')||''}</div>
            <div class="template-card-body">
                <div class="template-card-name">${t.name} ${t.isDefault?'<span class="template-default-badge">Standard</span>':''}</div>
                <div class="template-card-desc">${t.description||''}</div>
                <div class="template-card-actions">
                    <button class="btn btn-ghost btn-sm" onclick="admin.applyTemplate('${t.id}')"><i class="fas fa-check"></i> Anwenden</button>
                    <button class="btn btn-ghost btn-sm viewer-hidden" onclick="admin.openTemplateModal('${t.id}')"><i class="fas fa-pen"></i></button>
                    ${!t.isDefault?`<button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.deleteTemplate('${t.id}')"><i class="fas fa-trash"></i></button>`:''}
                </div>
            </div>
        </div>`).join('') || '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-table-cells-large"></i><p>Keine Templates</p></div>';
    }

    openTemplateModal(id = null) {
        const t = id ? this.templates.find(t => t.id === id) : null;
        document.getElementById('templateModalTitle').textContent = t ? 'Template bearbeiten' : 'Neues Template';
        document.getElementById('templateId').value = t?.id || '';
        document.getElementById('templateName').value = t?.name || '';
        document.getElementById('templateDescription').value = t?.description || '';
        document.getElementById('templateZonesJson').value = t ? JSON.stringify(t.zones || [], null, 2) : '[]';
        document.getElementById('templateModal').classList.add('active');
    }

    copyCurrentLayoutToTemplate() {
        document.getElementById('templateZonesJson').value = JSON.stringify(this.zones, null, 2);
        this.showToast('Layout übernommen', 'info');
    }

    async saveTemplate() {
        const id = document.getElementById('templateId').value;
        const name = document.getElementById('templateName').value.trim();
        if (!name) { this.showToast('Name erforderlich', 'error'); return; }
        let zones = [];
        try { zones = JSON.parse(document.getElementById('templateZonesJson').value || '[]'); } catch { this.showToast('Ungültiges JSON', 'error'); return; }
        const t = { name, description: document.getElementById('templateDescription').value.trim(), zones, isDefault: false };
        if (id) { const i = this.templates.findIndex(x => x.id === id); if (i !== -1) { t.isDefault = this.templates[i].isDefault; this.templates[i] = { ...this.templates[i], ...t, id }; } }
        else this.templates.push({ ...t, id: 'template-' + Date.now() });
        this.closeAllModals(); this.renderTemplates(); await this.saveData(); this.showToast('Template gespeichert!', 'success');
    }

    async deleteTemplate(id) {
        if (!confirm('Template löschen?')) return;
        this.templates = this.templates.filter(t => t.id !== id);
        this.renderTemplates(); await this.saveData(); this.showToast('Template gelöscht', 'success');
    }

    async applyTemplate(id) {
        const t = this.templates.find(t => t.id === id);
        if (!t || !confirm(`Template "${t.name}" anwenden?`)) return;
        this.zones = JSON.parse(JSON.stringify(t.zones));
        this.renderDesignerCanvas(); await this.saveData(); this.showToast(`"${t.name}" angewendet!`, 'success');
    }

    // ═══ DESIGNER ═══
    renderDesignerCanvas() {
        const canvas = document.getElementById('designerCanvas');
        if (!canvas) return;
        const W = 1920, H = 1080;
        const wrap = canvas.parentElement;
        const scale = Math.min((wrap.clientWidth - 48) / W, (wrap.clientHeight - 48) / H) * this.canvasZoom;
        canvas.style.cssText = `width:${W}px;height:${H}px;transform:scale(${scale});transform-origin:top left;position:relative;`;
        document.getElementById('canvasSize').textContent = `${W} × ${H} | ${Math.round(scale*100)}%`;

        canvas.innerHTML = this.zones.map(z => `
        <div class="zone-card ${this.selectedZone?.id===z.id?'selected':''}"
             style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%;display:${z.visible===false?'none':'flex'};flex-direction:column"
             data-zone-id="${z.id}" onmousedown="admin.startDrag(event,'${z.id}')">
            <div class="zone-card-header"><span>${z.name||z.type}</span><span class="zone-card-type">${z.type.toUpperCase()}</span></div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,.3)">
                ${z.type==='menu'?`🍽️ ${(z.productIds||[]).length}`:z.type==='app'?`🧩 App`:z.type==='ticker'?'📜':z.type==='media'?'🖼️':z.type==='clock'?'🕐':'📝'}
            </div>
            <div class="zone-resize-handle" onmousedown="admin.startResize(event,'${z.id}')"></div>
        </div>`).join('');

        canvas.querySelectorAll('.zone-card').forEach(el => {
            el.addEventListener('dblclick', () => this.openZoneModal(el.dataset.zoneId));
            el.addEventListener('click', e => { e.stopPropagation(); this.selectZone(el.dataset.zoneId); });
        });
        canvas.addEventListener('click', () => { this.selectedZone = null; document.getElementById('selectedZone').textContent = 'Keine Zone'; document.querySelectorAll('.zone-card').forEach(x => x.classList.remove('selected')); });
    }

    selectZone(id) {
        this.selectedZone = this.zones.find(z => z.id === id);
        document.getElementById('selectedZone').textContent = this.selectedZone?.name || id;
        document.querySelectorAll('.zone-card').forEach(x => x.classList.toggle('selected', x.dataset.zoneId === id));
    }

    startDrag(e, id) {
        if (e.target.classList.contains('zone-resize-handle')) return;
        e.preventDefault(); e.stopPropagation();
        this.selectZone(id);
        const zone = this.zones.find(z => z.id === id);
        if (!zone) return;
        const canvas = document.getElementById('designerCanvas');
        const scale = parseFloat(canvas.style.transform.replace('scale(','').replace(')','')) || 1;
        const cw = canvas.offsetWidth * scale, ch = canvas.offsetHeight * scale;
        const sx = e.clientX, sy = e.clientY, ox = zone.x, oy = zone.y;
        const mv = e => { zone.x = Math.max(0, Math.min(100-zone.w, ox+(e.clientX-sx)/cw*100)); zone.y = Math.max(0, Math.min(100-zone.h, oy+(e.clientY-sy)/ch*100)); this.renderDesignerCanvas(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }

    startResize(e, id) {
        e.preventDefault(); e.stopPropagation();
        const zone = this.zones.find(z => z.id === id);
        if (!zone) return;
        const canvas = document.getElementById('designerCanvas');
        const scale = parseFloat(canvas.style.transform.replace('scale(','').replace(')','')) || 1;
        const cw = canvas.offsetWidth * scale, ch = canvas.offsetHeight * scale;
        const sx = e.clientX, sy = e.clientY, ow = zone.w, oh = zone.h;
        const mv = e => { zone.w = Math.max(5, Math.min(100-zone.x, ow+(e.clientX-sx)/cw*100)); zone.h = Math.max(5, Math.min(100-zone.y, oh+(e.clientY-sy)/ch*100)); this.renderDesignerCanvas(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }

    addZone(type) {
        const zone = { id:'zone-'+Date.now(), name:type.charAt(0).toUpperCase()+type.slice(1)+' Zone', type, x:10, y:10, w:30, h:20, visible:true, productIds:[], articleStyle:{showImage:true,showTitle:true,showPrice:true,showDescription:false,showBadge:true,showStock:true,pricePosition:'bottom-right',priceStyle:'badge-gold',imageSize:'large',cardLayout:'vertical',textAlign:'left',columnsCount:'auto'} };
        this.zones.push(zone); this.renderDesignerCanvas(); this.showToast(`${type}-Zone hinzugefügt`, 'success');
    }

    openZoneModal(id) {
        const zone = this.zones.find(z => z.id === id);
        if (!zone) return;
        this.selectedZone = zone;
        document.getElementById('zoneModalTitle').textContent = zone.name;
        document.getElementById('zoneId').value = zone.id;
        document.getElementById('zoneName').value = zone.name || '';
        document.getElementById('zoneType').value = zone.type || 'menu';
        document.getElementById('zoneX').value = parseFloat(zone.x).toFixed(1);
        document.getElementById('zoneY').value = parseFloat(zone.y).toFixed(1);
        document.getElementById('zoneW').value = parseFloat(zone.w).toFixed(1);
        document.getElementById('zoneH').value = parseFloat(zone.h).toFixed(1);
        document.getElementById('zoneVisible').checked = zone.visible !== false;
        this.updateZoneTypeUI(zone.type, zone);
        document.getElementById('zoneModal').classList.add('active');
    }

    updateZoneTypeUI(type, zone = null) {
        ['Articles','Media','Ticker','Text','App'].forEach(g => { const el = document.getElementById('zone'+g+'Group'); if (el) el.style.display = 'none'; });
        if (type === 'menu') {
            document.getElementById('zoneArticlesGroup').style.display = 'block';
            const sel = document.getElementById('zoneProductSelector');
            if (sel) { const selected = zone?.productIds || []; sel.innerHTML = this.products.map(p => `<label class="zone-product-item ${selected.includes(p.id)||selected.includes(String(p.id))?'selected':''}" data-pid="${p.id}"><input type="checkbox" ${selected.includes(p.id)||selected.includes(String(p.id))?'checked':''} style="display:none">${p.title}</label>`).join(''); sel.querySelectorAll('.zone-product-item').forEach(el => { el.addEventListener('click', () => { el.classList.toggle('selected'); }); }); }
            const as = zone?.articleStyle || {};
            ['showImage','showTitle','showPrice','showDescription','showBadge'].forEach(k => { const el = document.getElementById(k); if (el) el.checked = as[k] !== false; });
            ['priceStyle','cardLayout','columnsCount'].forEach(k => { const el = document.getElementById(k); if (el && as[k]) el.value = as[k]; });
        } else if (type === 'media') {
            document.getElementById('zoneMediaGroup').style.display = 'block';
            if (zone) { document.getElementById('zoneMediaSrc').value = zone.mediaSrc||''; document.getElementById('zoneMediaType').value = zone.mediaType||'image'; }
        } else if (type === 'ticker') {
            document.getElementById('zoneTickerGroup').style.display = 'block';
            if (zone) document.getElementById('zoneTickerText').value = zone.tickerText||zone.text||'';
        } else if (type === 'text' || type === 'clock') {
            document.getElementById('zoneTextGroup').style.display = 'block';
            if (zone && type === 'text') { document.getElementById('zoneTextContent').value = zone.text||''; document.getElementById('zoneTextSize').value = zone.fontSize||24; document.getElementById('zoneTextColor').value = zone.color||'#ffffff'; }
        } else if (type === 'app') {
            document.getElementById('zoneAppGroup').style.display = 'block';
            const sel = document.getElementById('zoneAppSelect');
            if (sel) sel.innerHTML = this.installedApps.map(a => `<option value="${a.id}" ${zone?.appId===a.id?'selected':''}>${a.name}</option>`).join('');
        }
    }

    saveZone() {
        const id = document.getElementById('zoneId').value;
        const type = document.getElementById('zoneType').value;
        const zone = this.zones.find(z => z.id === id);
        if (!zone) return;
        zone.name = document.getElementById('zoneName').value;
        zone.type = type;
        zone.x = parseFloat(document.getElementById('zoneX').value) || 0;
        zone.y = parseFloat(document.getElementById('zoneY').value) || 0;
        zone.w = parseFloat(document.getElementById('zoneW').value) || 20;
        zone.h = parseFloat(document.getElementById('zoneH').value) || 20;
        zone.visible = document.getElementById('zoneVisible').checked;
        if (type === 'menu') { zone.productIds = Array.from(document.querySelectorAll('.zone-product-item.selected')).map(el => parseInt(el.dataset.pid)||el.dataset.pid); zone.articleStyle = { showImage:document.getElementById('showImage').checked, showTitle:document.getElementById('showTitle').checked, showPrice:document.getElementById('showPrice').checked, showDescription:document.getElementById('showDescription').checked, showBadge:document.getElementById('showBadge').checked, showStock:true, priceStyle:document.getElementById('priceStyle').value, cardLayout:document.getElementById('cardLayout').value, columnsCount:document.getElementById('columnsCount').value, pricePosition:'bottom-right', imageSize:'large', textAlign:'left' }; }
        else if (type === 'media') { zone.mediaSrc = document.getElementById('zoneMediaSrc').value; zone.mediaType = document.getElementById('zoneMediaType').value; }
        else if (type === 'ticker') { zone.tickerText = document.getElementById('zoneTickerText').value; zone.text = zone.tickerText; }
        else if (type === 'text') { zone.text = document.getElementById('zoneTextContent').value; zone.fontSize = parseInt(document.getElementById('zoneTextSize').value)||24; zone.color = document.getElementById('zoneTextColor').value; }
        else if (type === 'app') { zone.appId = document.getElementById('zoneAppSelect').value; }
        this.closeAllModals(); this.renderDesignerCanvas(); this.showToast('Zone gespeichert', 'success');
    }

    deleteSelectedZone() {
        const id = document.getElementById('zoneId').value;
        if (!confirm('Zone löschen?')) return;
        this.zones = this.zones.filter(z => z.id !== id);
        this.closeAllModals(); this.renderDesignerCanvas();
    }

    zoomCanvas(delta) { this.canvasZoom = Math.max(.2, Math.min(2, this.canvasZoom + delta)); this.renderDesignerCanvas(); }

    // ═══ MEDIA ═══
    async loadMedia() {
        const res = await CMS.api('GET', '/uploads-list');
        const uploads = res?.uploads || [];
        const grid = document.getElementById('mediaGrid');
        if (!grid) return;
        grid.innerHTML = uploads.length ? uploads.map(f => {
            const isVid = /\.(mp4|webm|mov)$/i.test(f.filename);
            return `<div class="media-card">
                <div class="media-thumb">${isVid ? '<i class="fas fa-video media-icon"></i>' : `<img src="${f.url}" loading="lazy">`}</div>
                <div class="media-info"><div class="media-name" title="${f.filename}">${f.filename}</div><div class="media-size">${this.formatBytes(f.size)}</div></div>
                <div style="padding:4px 8px 8px;display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${f.url}');admin.showToast('URL kopiert!','success')"><i class="fas fa-copy"></i></button>
                    <button class="btn btn-danger btn-xs viewer-hidden" onclick="admin.deleteMedia('${f.filename}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('') : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-photo-film"></i><p>Keine Medien</p></div>';
    }

    async handleMediaUpload(e) {
        for (const file of e.target.files) {
            const fd = new FormData(); fd.append('file', file);
            const res = await fetch('/api/upload', { method:'POST', headers:{'Authorization':'Bearer '+CMS.token}, body: fd });
            const r = await res.json();
            if (r.success) this.showToast(`${file.name} hochgeladen!`, 'success');
            else this.showToast('Upload fehlgeschlagen', 'error');
        }
        this.loadMedia();
    }

    async deleteMedia(filename) {
        if (!confirm('Datei löschen?')) return;
        await CMS.api('DELETE', `/uploads/${filename}`);
        this.loadMedia();
    }

    formatBytes(b) { if (!b) return '0 B'; const k=1024,u=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+u[i]; }

    // ═══ APPS ═══
    async renderApps() {
        const storeRes = await CMS.api('GET', '/app-store');
        this.availableApps = storeRes?.apps || [];
        const grid = document.getElementById('installedApps');
        if (!grid) return;
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
        </div>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-puzzle-piece"></i><p>Keine Apps installiert.</p></div>';
    }

    openAppStore() {
        const section = document.getElementById('appStoreSection');
        if (!section) return;
        section.style.display = section.style.display === 'none' ? '' : 'none';
        const grid = document.getElementById('appStoreGrid');
        if (!grid) return;
        const installedIds = this.installedApps.map(a => a.appId);
        grid.innerHTML = this.availableApps.map(a => {
            const isInst = installedIds.includes(a.appId);
            return `<div class="app-card">
                <div class="app-card-icon"><i class="${a.icon||'fas fa-puzzle-piece'}"></i></div>
                <div class="app-card-name">${a.name}</div>
                <div class="app-card-desc">${a.description||''}</div>
                <div class="app-card-meta">
                    <span class="app-duration">${a.defaultDuration ? a.defaultDuration+'s' : '∞'}</span>
                    <span class="app-status-badge ${isInst?'installed':'available'}">${isInst?'Installiert':'Verfügbar'}</span>
                </div>
                ${!isInst ? `<button class="btn btn-primary btn-sm" onclick="admin.installApp('${a.appId}')"><i class="fas fa-download"></i> Installieren</button>` : '<button class="btn btn-ghost btn-sm" disabled><i class="fas fa-check"></i> Installiert</button>'}
            </div>`;
        }).join('');
    }

    async installApp(appId) {
        const app = this.availableApps.find(a => a.appId === appId);
        if (!app) return;
        const newApp = { ...app, id: 'app-' + Date.now(), installedAt: new Date().toISOString(), config: {} };
        this.installedApps.push(newApp);
        await this.saveData();
        this.renderApps();
        this.openAppStore();
        this.updateNavBadges();
        this.showToast(`${app.name} installiert!`, 'success');
    }

    async uninstallApp(id) {
        if (!confirm('App deinstallieren?')) return;
        this.installedApps = this.installedApps.filter(a => a.id !== id);
        await this.saveData(); this.renderApps(); this.updateNavBadges();
    }

    openAppConfig(id) {
        const app = this.installedApps.find(a => a.id === id);
        if (!app) return;
        const storeApp = this.availableApps.find(a => a.appId === app.appId);
        document.getElementById('appConfigTitle').textContent = app.name + ' konfigurieren';
        const body = document.getElementById('appConfigBody');
        const schema = storeApp?.configSchema || {};
        const config = app.config || {};
        body.innerHTML = Object.entries(schema).map(([key, s]) => `<div class="form-group">
            <label>${s.label}</label>
            ${s.type === 'boolean' ? `<label class="toggle"><input type="checkbox" data-key="${key}" ${config[key]!==false?'checked':''}><span class="toggle-knob"></span></label>`
            : s.type === 'select' ? `<select data-key="${key}">${(s.options||[]).map(o => `<option value="${o}" ${(config[key]||s.default)===o?'selected':''}>${o}</option>`).join('')}</select>`
            : `<input type="${s.type==='number'?'number':'text'}" data-key="${key}" value="${config[key]!==undefined?config[key]:s.default||''}" placeholder="${s.default||''}">`}
        </div>`).join('');
        document.getElementById('saveAppConfigBtn').onclick = async () => {
            const newConfig = {};
            body.querySelectorAll('[data-key]').forEach(el => { newConfig[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; });
            const i = this.installedApps.findIndex(a => a.id === id);
            if (i !== -1) this.installedApps[i].config = newConfig;
            await this.saveData(); this.closeAllModals(); this.showToast('App konfiguriert!', 'success');
        };
        document.getElementById('appConfigModal').classList.add('active');
    }

    // ═══ PLAYLISTS ═══
    renderPlaylists() {
        const grid = document.getElementById('playlistsGrid');
        if (!grid) return;
        grid.innerHTML = this.playlists.length ? this.playlists.map(pl => `<div class="playlist-card">
            <div class="playlist-card-header"><div class="playlist-card-icon"><i class="fas fa-list-ol"></i></div><span class="playlist-type-badge">${pl.type==='zone'?'Zonen':'Display'}</span></div>
            <div class="display-card-name">${pl.name}</div>
            <div class="playlist-items-count"><i class="fas fa-layer-group"></i> ${(pl.items||[]).length} Elemente ${pl.loop?'· Loop':''} ${pl.shuffle?'· Shuffle':''}</div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-2)">${(pl.items||[]).map(it => {
                const dur = it.duration ? it.duration+'s' : '∞';
                const label = it.contentType === 'app' ? (this.installedApps.find(a=>a.id===it.contentId)?.name||'App') : it.contentType === 'media' ? '📷 Media' : '📋 Template';
                return `<span style="background:var(--bg-hover);border-radius:4px;padding:2px 6px;margin:2px;display:inline-block">${label} (${dur})</span>`;
            }).join('')}</div>
            <div style="display:flex;gap:6px;margin-top:12px">
                <button class="btn btn-ghost btn-sm viewer-hidden" onclick="admin.openPlaylistModal('${pl.id}')"><i class="fas fa-pen"></i> Bearbeiten</button>
                <button class="btn btn-danger btn-sm viewer-hidden" onclick="admin.deletePlaylist('${pl.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-list-ol"></i><p>Noch keine Playlisten.<br>Apps, Medien & Templates in eine Reihenfolge bringen.</p></div>';
    }

    openPlaylistModal(id = null) {
        const pl = id ? this.playlists.find(p => p.id === id) : null;
        this.editingPlaylistId = pl?.id || null;
        this.playlistItems = pl ? JSON.parse(JSON.stringify(pl.items || [])) : [];
        document.getElementById('playlistModalTitle').textContent = pl ? 'Playlist bearbeiten' : 'Neue Playlist';
        document.getElementById('playlistId').value = pl?.id || '';
        document.getElementById('playlistName').value = pl?.name || '';
        document.getElementById('playlistType').value = pl?.type || 'display';
        document.getElementById('playlistLoop').checked = pl?.loop !== false;
        document.getElementById('playlistShuffle').checked = pl?.shuffle || false;
        this.renderPlaylistEditor();
        document.getElementById('playlistModal').classList.add('active');
    }

    renderPlaylistEditor() {
        const el = document.getElementById('playlistItemsEditor');
        if (!el) return;
        el.innerHTML = this.playlistItems.length ? this.playlistItems.map((item, i) => {
            const durLabel = item.duration ? item.duration + 's' : item.contentType === 'app' ? (this.installedApps.find(a=>a.id===item.contentId)?.defaultDuration||'15')+'s (Standard)' : '10s (Standard)';
            return `<div class="playlist-item-row">
                <span class="playlist-item-handle"><i class="fas fa-grip-vertical"></i></span>
                <div class="playlist-item-content">
                    <select onchange="admin.playlistItems[${i}].contentType=this.value;admin.renderPlaylistEditor()">
                        <option value="template" ${item.contentType==='template'?'selected':''}>📋 Template</option>
                        <option value="app" ${item.contentType==='app'?'selected':''}>🧩 App</option>
                        <option value="media" ${item.contentType==='media'?'selected':''}>🖼️ Media URL</option>
                    </select>
                    ${item.contentType === 'app'
                        ? `<select onchange="admin.playlistItems[${i}].contentId=this.value">${this.installedApps.map(a=>`<option value="${a.id}" ${item.contentId===a.id?'selected':''}>${a.name}</option>`).join('')}</select>`
                        : item.contentType === 'template'
                        ? `<select onchange="admin.playlistItems[${i}].contentId=this.value">${this.templates.map(t=>`<option value="${t.id}" ${item.contentId===t.id?'selected':''}>${t.name}</option>`).join('')}</select>`
                        : `<input type="text" value="${item.contentId||''}" placeholder="/uploads/.../bild.jpg" onchange="admin.playlistItems[${i}].contentId=this.value">`}
                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                        <input type="number" class="playlist-item-duration" value="${item.duration||''}" min="1" placeholder="Sek." title="Anzeigedauer — leer = Standard" onchange="admin.playlistItems[${i}].duration=parseInt(this.value)||null" style="width:65px">
                        <span style="font-size:11px;color:var(--text-2)">s</span>
                    </div>
                </div>
                <button class="playlist-item-remove" onclick="admin.removePlaylistItem(${i})"><i class="fas fa-xmark"></i></button>
            </div>`;
        }).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px"><i class="fas fa-info-circle" style="display:block;font-size:24px;margin-bottom:8px"></i>Noch keine Elemente. Apps, Templates & Medien mit Dauer kombinieren.</div>';
    }

    addPlaylistItem() { this.playlistItems.push({ contentType: 'template', contentId: this.templates[0]?.id || '', duration: null, order: this.playlistItems.length }); this.renderPlaylistEditor(); }
    removePlaylistItem(i) { this.playlistItems.splice(i, 1); this.renderPlaylistEditor(); }

    async savePlaylist() {
        const id = document.getElementById('playlistId').value;
        const pl = { name: document.getElementById('playlistName').value.trim(), type: document.getElementById('playlistType').value, loop: document.getElementById('playlistLoop').checked, shuffle: document.getElementById('playlistShuffle').checked, items: this.playlistItems };
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

    // ═══ REMOTE ═══
    renderRemoteControl() {
        const el = document.getElementById('remoteDisplaysList');
        if (!el) return;
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

    // ═══ SCHEDULES ═══
    async loadSchedules() {
        const res = await CMS.api('GET', '/schedule');
        const schedules = res?.allSchedules || [];
        const active = res?.activeSchedule;
        const list = document.getElementById('schedulesList');
        if (!list) return;
        const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        list.innerHTML = schedules.length ? schedules.map(s => `<div class="schedule-card ${active?.id===s.id?'is-active-now':''}">
            <div class="schedule-active-dot"></div>
            <div class="schedule-info">
                <div class="schedule-name">${s.name} ${active?.id===s.id?'<span class="schedule-tag" style="color:var(--green)">🟢 Aktiv</span>':''}</div>
                <div class="schedule-meta">
                    <span class="schedule-tag time"><i class="fas fa-clock"></i> ${s.startTime}–${s.endTime}</span>
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
        document.getElementById('scheduleModalTitle').textContent = s ? 'Zeitplan bearbeiten' : 'Neuer Zeitplan';
        document.getElementById('scheduleId').value = s?.id || '';
        document.getElementById('scheduleName').value = s?.name || '';
        document.getElementById('scheduleBadge').value = s?.badge || '';
        document.getElementById('scheduleStart').value = s?.startTime || '06:00';
        document.getElementById('scheduleEnd').value = s?.endTime || '22:00';
        document.getElementById('scheduleTheme').value = s?.theme || 'dark';
        document.getElementById('scheduleTicker').value = s?.tickerText || '';
        document.querySelectorAll('.schedule-day-check').forEach(cb => { cb.checked = s?.days ? s.days.includes(parseInt(cb.value)) : [1,2,3,4,5].includes(parseInt(cb.value)); });
        document.getElementById('scheduleTemplate').innerHTML = this.templates.map(t => `<option value="${t.id}" ${s?.templateId===t.id?'selected':''}>${t.name}</option>`).join('');
        document.getElementById('scheduleModal').classList.add('active');
    }

    async saveSchedule() {
        const id = document.getElementById('scheduleId').value;
        const s = { id: id || 'schedule-'+Date.now(), name: document.getElementById('scheduleName').value.trim(), badge: document.getElementById('scheduleBadge').value.trim(), startTime: document.getElementById('scheduleStart').value, endTime: document.getElementById('scheduleEnd').value, days: Array.from(document.querySelectorAll('.schedule-day-check:checked')).map(cb=>parseInt(cb.value)), templateId: document.getElementById('scheduleTemplate').value, theme: document.getElementById('scheduleTheme').value, tickerText: document.getElementById('scheduleTicker').value.trim(), active: true };
        if (!s.name) { this.showToast('Name erforderlich', 'error'); return; }
        if (!this.data.schedules) this.data.schedules = [];
        if (id) { const i = this.data.schedules.findIndex(x=>x.id===id); if (i!==-1) this.data.schedules[i]=s; } else this.data.schedules.push(s);
        await CMS.api('PUT', '/schedules/'+s.id, s).catch(() => {});
        await this.saveData(); this.closeAllModals(); this.loadSchedules(); this.showToast('Zeitplan gespeichert!', 'success');
    }

    async deleteSchedule(id) {
        if (!confirm('Zeitplan löschen?')) return;
        this.data.schedules = (this.data.schedules||[]).filter(s=>s.id!==id);
        await this.saveData(); this.loadSchedules();
    }

    async toggleSchedule(id, active) {
        const s = (this.data?.schedules||[]).find(s=>s.id===id);
        if (s) s.active = active;
        await this.saveData();
    }

    // ═══ ANALYTICS ═══
    async loadAnalytics() {
        const res = await CMS.api('GET', '/analytics');
        if (!res) return;
        this.analyticsData = res;
        if (this.currentTab === 'analytics') this.renderAnalytics();
        if (this.currentTab === 'dashboard') this.renderDashboard();
    }

    renderAnalytics() {
        const a = this.analyticsData; if (!a) return;
        const pr = document.getElementById('analyticsProductRanking');
        if (pr) pr.innerHTML = (a.productRanking||[]).slice(0,10).map((p,i) => `<div class="analytics-row"><span class="analytics-rank">${i+1}</span><span class="analytics-name">${p.name}</span><span class="analytics-cat">${p.category}</span><span class="analytics-views">${p.views}</span></div>`).join('') || '<div style="text-align:center;color:var(--text-2);padding:20px">Noch keine Daten</div>';

        const d7 = document.getElementById('analytics7Days');
        if (d7 && a.last7Days) { const max=Math.max(...a.last7Days.map(d=>d.views),1); d7.innerHTML = `<div class="chart-bars">${a.last7Days.map(d=>`<div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.round(d.views/max*100)}px" title="${d.views}"></div></div>`).join('')}</div><div class="chart-x-labels">${a.last7Days.map(d=>`<span class="chart-x-label">${d.date.slice(5)}</span>`).join('')}</div>`; }

        const ho = document.getElementById('analyticsHourly');
        if (ho && a.hourlyToday) { const max=Math.max(...a.hourlyToday.map(h=>h.views),1); ho.innerHTML = `<div class="chart-bars">${a.hourlyToday.map(h=>`<div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.round(h.views/max*100)}px" title="${h.hour}:00"></div></div>`).join('')}</div>`; }

        const dv = document.getElementById('analyticsDisplays');
        if (dv) { const entries=Object.entries(a.displayViews||{}); dv.innerHTML = entries.length ? entries.map(([id,views])=>{const d=this.displays.find(d=>d.id===id);return `<div class="analytics-row"><span class="analytics-name">${d?.name||id}</span><span class="analytics-views">${views}</span></div>`;}).join('') : '<div style="text-align:center;color:var(--text-2);padding:20px">Noch keine Daten</div>'; }
    }

    async resetAnalytics() {
        if (!confirm('Analytics zurücksetzen?')) return;
        await CMS.api('DELETE', '/analytics/reset');
        await this.loadAnalytics(); this.showToast('Zurückgesetzt', 'success');
    }

    // ═══ USERS ═══
    async loadUsers() {
        const res = await CMS.api('GET', '/users');
        const users = res?.users || [];
        document.getElementById('nb-users').textContent = users.length;
        const table = document.getElementById('usersTable');
        if (!table) return;
        table.innerHTML = `<table>
            <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
            <tbody>${users.map(u => `<tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="role-badge role-${u.role}">${{tenantadmin:'Tenant-Admin',editor:'Editor',viewer:'Viewer'}[u.role]||u.role}</span></td>
                <td><span class="${u.active!==false?'status-active':'status-inactive'}">${u.active!==false?'✓ Aktiv':'✗ Inaktiv'}</span></td>
                <td style="font-size:12px;color:var(--text-2)">${new Date(u.createdAt).toLocaleDateString('de-DE')}</td>
                <td><div style="display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" onclick="admin.openUserModal('${u.id}')"><i class="fas fa-pen"></i></button>
                    ${u.id !== '${CMS.user.id}' ? `<button class="btn btn-danger btn-xs" onclick="admin.deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div></td>
            </tr>`).join('')}</tbody>
        </table>`;
    }

    openUserModal(id = null) {
        const modal = document.getElementById('userModal');
        document.getElementById('userModalTitle').textContent = id ? 'Nutzer bearbeiten' : 'Nutzer einladen';
        document.getElementById('userId').value = id || '';
        document.getElementById('userName').value = '';
        document.getElementById('userEmail').value = '';
        document.getElementById('userRole').value = 'editor';
        document.getElementById('userPassword').value = '';
        document.getElementById('pwHint').style.display = id ? 'inline' : 'none';
        if (id) {
            CMS.api('GET', '/users').then(res => {
                const u = (res?.users||[]).find(u => u.id === id);
                if (u) { document.getElementById('userName').value = u.name; document.getElementById('userEmail').value = u.email; document.getElementById('userRole').value = u.role; }
            });
        }
        modal.classList.add('active');
    }

    async saveUser() {
        const id = document.getElementById('userId').value;
        const body = { name: document.getElementById('userName').value.trim(), email: document.getElementById('userEmail').value.trim(), role: document.getElementById('userRole').value, password: document.getElementById('userPassword').value || undefined };
        if (!id && !body.password) { this.showToast('Passwort erforderlich für neue Nutzer', 'error'); return; }
        const res = id ? await CMS.api('PUT', `/users/${id}`, body) : await CMS.api('POST', '/users', body);
        if (res?.success) { this.closeAllModals(); this.loadUsers(); this.showToast(id ? 'Nutzer aktualisiert!' : 'Nutzer erstellt!', 'success'); }
        else this.showToast(res?.error || 'Fehler', 'error');
    }

    async deleteUser(id) {
        if (!confirm('Nutzer löschen?')) return;
        const res = await CMS.api('DELETE', `/users/${id}`);
        if (res?.success) { this.loadUsers(); this.showToast('Nutzer gelöscht', 'success'); }
    }

    // ═══ FEATURES ═══
    renderFeatureSettings() {
        const d = this.data || {};
        const w = d.weather || {};
        document.getElementById('weatherSettings').innerHTML = `
            <div class="setting-row"><label>Wetter aktiv</label><label class="toggle"><input type="checkbox" id="weatherEnabled" ${w.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Breitengrad</label><input type="text" id="weatherLat" value="${w.latitude||'52.52'}"></div>
            <div class="form-group"><label>Längengrad</label><input type="text" id="weatherLon" value="${w.longitude||'13.41'}"></div>
            <div class="setting-row"><label>Empfehlungen</label><label class="toggle"><input type="checkbox" id="weatherRecommendations" ${w.showRecommendations!==false?'checked':''}><span class="toggle-knob"></span></label></div>`;
        const qr = d.qrCodes || {};
        document.getElementById('qrSettings').innerHTML = `
            <div class="setting-row"><label>QR-Codes aktiv</label><label class="toggle"><input type="checkbox" id="qrEnabled" ${qr.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Basis-URL</label><input type="text" id="qrBaseUrl" value="${qr.baseUrl||''}"></div>`;
        const lang = d.languages || {};
        document.getElementById('languageSettings').innerHTML = `
            <div class="form-group"><label>Aktivierte Sprachen</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="de" ${(lang.enabled||['de']).includes('de')?'checked':''}><span>🇩🇪 DE</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="en" ${(lang.enabled||[]).includes('en')?'checked':''}><span>🇬🇧 EN</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="ar" ${(lang.enabled||[]).includes('ar')?'checked':''}><span>🇸🇦 AR</span></label>
                <label class="toggle-chip"><input type="checkbox" class="lang-check" value="tr" ${(lang.enabled||[]).includes('tr')?'checked':''}><span>🇹🇷 TR</span></label>
            </div></div>`;
        const anim = d.animations || {};
        document.getElementById('animationSettings').innerHTML = `
            <div class="setting-row"><label>Animationen aktiv</label><label class="toggle"><input type="checkbox" id="animEnabled" ${anim.enabled!==false?'checked':''}><span class="toggle-knob"></span></label></div>
            <div class="form-group" style="margin-top:10px"><label>Übergang</label><select id="animTransition"><option value="slide" ${anim.pageTransition==='slide'?'selected':''}>Slide</option><option value="fade" ${anim.pageTransition==='fade'?'selected':''}>Fade</option><option value="none" ${anim.pageTransition==='none'?'selected':''}>Kein</option></select></div>`;
    }

    async testWeather() {
        const lat = document.getElementById('weatherLat')?.value||'52.52', lon = document.getElementById('weatherLon')?.value||'13.41';
        const r = document.getElementById('weatherTestResult'); if (r) r.textContent = '⏳ Lädt…';
        try { const w = await CMS.api('GET', `/weather?lat=${lat}&lon=${lon}`); if (r) r.textContent = w ? `${w.icon} ${w.temperature}°C | 💨 ${w.windspeed} km/h` : '❌ Fehler'; } catch { if (r) r.textContent = '❌ Fehler'; }
    }

    async saveFeatures() {
        if (!this.data) return;
        this.data.weather = { enabled: document.getElementById('weatherEnabled')?.checked!==false, latitude: document.getElementById('weatherLat')?.value||'52.52', longitude: document.getElementById('weatherLon')?.value||'13.41', showRecommendations: document.getElementById('weatherRecommendations')?.checked!==false };
        this.data.qrCodes = { enabled: document.getElementById('qrEnabled')?.checked!==false, baseUrl: document.getElementById('qrBaseUrl')?.value||'' };
        this.data.languages = { enabled: Array.from(document.querySelectorAll('.lang-check:checked')).map(cb=>cb.value), default: 'de' };
        this.data.animations = { enabled: document.getElementById('animEnabled')?.checked!==false, pageTransition: document.getElementById('animTransition')?.value||'slide' };
        await this.saveData(); this.showToast('Features gespeichert!', 'success');
    }

    // ═══ SETTINGS ═══
    renderSettings() {
        const s = this.settings;
        document.querySelectorAll('.theme-pill').forEach(b => b.classList.toggle('active', b.dataset.theme===(s.theme||'dark')));
        document.getElementById('settingTheme').value = s.theme||'dark';
        if (s.theme==='custom') document.getElementById('customThemeEditor').style.display = 'block';
        this.renderFontSelector(s.font||'Inter');
        this.renderCurrencyPicker(s.currency||'€');
        document.getElementById('settingCurrencyPosition').value = s.currencyPosition||'after';
        document.getElementById('settingLanguage').value = s.language||'de';
        document.getElementById('settingRefresh').value = s.refreshInterval||30;
        document.getElementById('settingAutoRotate').checked = s.autoRotate||false;
        document.getElementById('settingShowBadges').checked = s.showBadges!==false;
        const t = this.data?.ticker||{};
        document.getElementById('settingTickerEnabled').checked = t.enabled!==false;
        document.getElementById('settingTickerSpeed').value = t.speed||50;
        const sv = document.getElementById('tickerSpeedVal'); if (sv) sv.textContent = t.speed||50;
        document.getElementById('settingTickerColor').value = t.color||'#FFD700';
        document.getElementById('settingTickerBg').value = t.backgroundColor||'#1a1a2e';
    }

    renderFontSelector(current='Inter') {
        const fonts = [{name:'Inter',label:'Inter'},{name:'DM Sans',label:'DM Sans'},{name:'Roboto',label:'Roboto'},{name:'Poppins',label:'Poppins'},{name:'Oswald',label:'Oswald'},{name:'Montserrat',label:'Montserrat'},{name:'Lato',label:'Lato'},{name:'Nunito',label:'Nunito'}];
        const el = document.getElementById('fontSelector'); if (!el) return;
        el.innerHTML = fonts.map(f => `<div class="font-option ${f.name===current?'active':''}" data-font="${f.name}" style="font-family:'${f.name}',sans-serif">${f.label}</div>`).join('');
        el.querySelectorAll('.font-option').forEach(opt => { opt.addEventListener('click', () => { el.querySelectorAll('.font-option').forEach(o=>o.classList.remove('active')); opt.classList.add('active'); document.getElementById('settingFont').value=opt.dataset.font; const p=document.getElementById('fontPreview'); if(p) p.style.fontFamily=`'${opt.dataset.font}',sans-serif`; }); });
        const p = document.getElementById('fontPreview'); if(p) p.style.fontFamily=`'${current}',sans-serif`;
    }

    renderCurrencyPicker(current='€') {
        const currencies = [{symbol:'€',name:'Euro'},{symbol:'$',name:'Dollar'},{symbol:'£',name:'Pfund'},{symbol:'¥',name:'Yen'},{symbol:'₺',name:'Lira'},{symbol:'CHF',name:'Franken'},{symbol:'kr',name:'Krone'},{symbol:'zł',name:'Zloty'},{symbol:'Ft',name:'Forint'}];
        const el = document.getElementById('currencyPicker'); if (!el) return;
        el.innerHTML = currencies.map(c => `<div class="currency-option ${c.symbol===current?'active':''}" data-currency="${c.symbol}"><span class="curr-symbol">${c.symbol}</span><span class="curr-name">${c.name}</span></div>`).join('');
        el.querySelectorAll('.currency-option').forEach(opt => { opt.addEventListener('click', () => { el.querySelectorAll('.currency-option').forEach(o=>o.classList.remove('active')); opt.classList.add('active'); document.getElementById('settingCurrency').value=opt.dataset.currency; }); });
    }

    saveSettings() {
        const s = this.settings;
        s.theme = document.getElementById('settingTheme').value;
        s.font = document.getElementById('settingFont').value;
        s.currency = document.getElementById('settingCurrency').value;
        s.currencyPosition = document.getElementById('settingCurrencyPosition').value;
        s.language = document.getElementById('settingLanguage').value;
        s.refreshInterval = parseInt(document.getElementById('settingRefresh').value)||30;
        s.autoRotate = document.getElementById('settingAutoRotate').checked;
        s.showBadges = document.getElementById('settingShowBadges').checked;
        if (s.theme==='custom') { s.customTheme={}; ['bgPrimary','bgCard','accentPrimary','accentSecondary','textPrimary','priceColor','borderColor'].forEach(k=>{const i=document.getElementById('ct-'+k);if(i)s.customTheme[k]=i.value;}); }
        if (!this.data.ticker) this.data.ticker={};
        this.data.ticker.enabled = document.getElementById('settingTickerEnabled').checked;
        this.data.ticker.speed = parseInt(document.getElementById('settingTickerSpeed').value)||50;
        this.data.ticker.color = document.getElementById('settingTickerColor').value;
        this.data.ticker.backgroundColor = document.getElementById('settingTickerBg').value;
        this.saveData();
    }

    resetSettings() { if (!confirm('Einstellungen zurücksetzen?')) return; this.settings={theme:'dark',currency:'€',currencyPosition:'after',language:'de',font:'Inter',refreshInterval:30,autoRotate:false,showBadges:true}; this.renderSettings(); this.showToast('Zurückgesetzt','info'); }

    async changePassword() {
        const cur=document.getElementById('curPw').value, nw=document.getElementById('newPw').value, nw2=document.getElementById('newPw2').value;
        if (nw !== nw2) { this.showToast('Passwörter stimmen nicht überein','error'); return; }
        const res = await CMS.api('POST', '/auth/change-password', { currentPassword: cur, newPassword: nw });
        if (res?.success) { this.showToast('Passwort geändert!','success'); ['curPw','newPw','newPw2'].forEach(id=>document.getElementById(id).value=''); }
        else this.showToast(res?.error||'Fehler','error');
    }

    // ═══ MODALS & TOAST ═══
    closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

    showToast(msg, type='info') {
        const icons = {success:'fa-circle-check',error:'fa-circle-xmark',info:'fa-circle-info'};
        const colors = {success:'var(--green)',error:'var(--red)',info:'var(--accent)'};
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<i class="fas ${icons[type]||'fa-circle-info'}" style="color:${colors[type]}"></i><span>${msg}</span>`;
        document.getElementById('toastContainer').appendChild(el);
        setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, 3000);
    }
}
