/**
 * DIGITAL SIGNAGE CMS v9.0
 * Multi-Tenant SaaS Platform
 * Auth: JWT (Email + Password)
 * Storage: Separate JSON per Tenant
 */
'use strict';

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cms-secret-change-in-production-' + Date.now();
const JWT_EXPIRES = '7d';

// ═══ PATHS ═══
const TENANTS_DIR    = path.join(__dirname, 'tenants');
const SUPERADMIN_DIR = path.join(__dirname, 'superadmin');
const UPLOADS_DIR    = path.join(__dirname, 'uploads');
const APPS_DIR       = path.join(__dirname, 'apps');

[TENANTS_DIR, SUPERADMIN_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ═══ MIDDLEWARE ═══
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/apps', express.static(APPS_DIR));

// ═══ MULTER ═══
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tenantId = req.tenant?.id || 'global';
        const dir = path.join(UPLOADS_DIR, tenantId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4().slice(0,8) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|mp4|webm|mov|pdf/.test(path.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Dateityp nicht erlaubt'));
    }
});

// ═══ SUPERADMIN DATA ═══
function getSuperAdminPath() { return path.join(SUPERADMIN_DIR, 'superadmin.json'); }
function loadSuperAdmin() {
    const p = getSuperAdminPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { users: [], tenants: [] };
}
function saveSuperAdmin(data) {
    fs.writeFileSync(getSuperAdminPath(), JSON.stringify(data, null, 2));
}

// ═══ TENANT DATA ═══
function getTenantPath(tenantId) { return path.join(TENANTS_DIR, `${tenantId}.json`); }
function loadTenant(tenantId) {
    const p = getTenantPath(tenantId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return null;
}
function saveTenant(tenantId, data) {
    data.lastModified = new Date().toISOString();
    fs.writeFileSync(getTenantPath(tenantId), JSON.stringify(data, null, 2));
    return true;
}
function getDefaultTenantData(tenant) {
    return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        settings: {
            theme: 'dark', currency: '€', currencyPosition: 'after',
            language: 'de', font: 'Inter', refreshInterval: 30,
            autoRotate: false, showBadges: true,
            customTheme: { bgPrimary:'#0a0a0f', bgSecondary:'#13131a', bgCard:'#1e1e2e', accentPrimary:'#6c63ff', accentSecondary:'#ff6584', textPrimary:'#ffffff', textSecondary:'#a0a0b8', priceColor:'#FFD700', borderColor:'#2a2a3e' }
        },
        users: [],
        products: getDefaultProducts(),
        zones: getDefaultZones(),
        ticker: { enabled: true, speed: 50, direction: 'left', fontSize: 24, color: '#FFD700', backgroundColor: '#1a1a2e' },
        layout: { width: 1920, height: 1080, orientation: 'landscape', snapGrid: 10, showGrid: true },
        templates: getDefaultTemplates(),
        displays: [],
        playlists: [],
        schedules: getDefaultSchedules(),
        apps: getDefaultApps(),
        weather: { enabled: true, latitude: '52.52', longitude: '13.41', showOnDisplay: true, showRecommendations: true },
        qrCodes: { enabled: true, baseUrl: '', showOnProducts: true, showOnDisplay: true },
        languages: { enabled: ['de', 'en'], default: 'de', showSelector: true },
        animations: { enabled: true, pageTransition: 'slide', productFadeIn: true, offerPulse: true, transitionDuration: 500 },
        remoteControl: { enabled: true },
        shapes: []
    };
}

function getDefaultProducts() {
    return [
        {id:1,title:'Classic Burger',price:'8.90',image:'',category:'burger',badge:'Bestseller',stockStatus:'available',description:'Saftiges Rindfleisch'},
        {id:2,title:'Cheese Deluxe',price:'9.90',image:'',category:'burger',badge:'',stockStatus:'available',description:'Doppelter Cheddar'},
        {id:3,title:'BBQ Bacon',price:'10.90',image:'',category:'burger',badge:'Neu',stockStatus:'available',description:'Rauchiger BBQ'},
        {id:4,title:'Veggie Supreme',price:'8.50',image:'',category:'burger',badge:'',stockStatus:'available',description:'100% pflanzlich'},
        {id:5,title:'Crispy Fries',price:'3.90',image:'',category:'sides',badge:'',stockStatus:'available',description:'Knusprige Pommes'},
        {id:6,title:'Coca Cola',price:'2.90',image:'',category:'drinks',badge:'',stockStatus:'available',description:'0,4L'},
        {id:7,title:'Vanilla Shake',price:'4.90',image:'',category:'dessert',badge:'',stockStatus:'available',description:'Cremiger Shake'},
    ];
}
function getDefaultZones() {
    return [
        {id:'zone-menu',name:'Menü',type:'menu',x:0,y:0,w:65,h:92,visible:true,productIds:[1,2,3,4,5,6,7],articleStyle:{showImage:true,showTitle:true,showPrice:true,showDescription:false,showBadge:true,showStock:true,pricePosition:'bottom-right',priceStyle:'badge-gold',imageSize:'large',cardLayout:'vertical',textAlign:'left',columnsCount:'auto'}},
        {id:'zone-media',name:'Media',type:'media',x:65,y:0,w:35,h:65,visible:true,mediaSrc:'',mediaType:'image'},
        {id:'zone-ticker',name:'Ticker',type:'ticker',x:0,y:92,w:100,h:8,visible:true,tickerText:'🍔 Willkommen!'},
        {id:'zone-info',name:'Info',type:'clock',x:65,y:65,w:35,h:27,visible:true}
    ];
}
function getDefaultTemplates() {
    return [
        {id:'split',name:'Split Screen',description:'Menü links, Media rechts',isDefault:true,zones:getDefaultZones()},
        {id:'fullscreen',name:'Vollbild',description:'Vollbild-Inhalt',isDefault:true,zones:[{id:'z1',name:'Vollbild',type:'media',x:0,y:0,w:100,h:100,visible:true}]},
        {id:'menuonly',name:'Nur Menü',description:'Menü im Vollbild',isDefault:true,zones:[{id:'z1',name:'Menü',type:'menu',x:0,y:0,w:100,h:92,visible:true,productIds:[1,2,3,4,5,6,7],articleStyle:{showImage:true,showTitle:true,showPrice:true,showDescription:false,showBadge:true,showStock:true,pricePosition:'bottom-right',priceStyle:'badge-gold',imageSize:'large',cardLayout:'vertical',textAlign:'left',columnsCount:'auto'}},{id:'z2',name:'Ticker',type:'ticker',x:0,y:92,w:100,h:8,visible:true,tickerText:'🍔 Willkommen!'}]},
    ];
}
function getDefaultSchedules() {
    return [
        {id:'s1',name:'Frühstück',startTime:'06:00',endTime:'11:00',days:[0,1,2,3,4,5,6],templateId:'split',tickerText:'☀️ Guten Morgen!',theme:'light',badge:'Frühstück',active:true},
        {id:'s2',name:'Mittagessen',startTime:'11:00',endTime:'14:00',days:[1,2,3,4,5],templateId:'split',tickerText:'🍽️ Mittagsmenü!',theme:'dark',badge:'Mittag',active:true},
    ];
}
function getDefaultApps() {
    return [
        {id:'app-weather',appId:'weather',name:'Wetter',description:'Aktuelles Wetter',icon:'fas fa-cloud-sun',version:'1.0',enabled:true,config:{latitude:'52.52',longitude:'13.41',unit:'celsius'},defaultDuration:15},
        {id:'app-clock',appId:'clock',name:'Uhr & Datum',description:'Digitale Uhr',icon:'fas fa-clock',version:'1.0',enabled:true,config:{format:'24h',showDate:true,showSeconds:false},defaultDuration:null},
        {id:'app-news',appId:'news-feed',name:'News Feed',description:'RSS-Nachrichten',icon:'fas fa-newspaper',version:'1.0',enabled:true,config:{feedUrl:'https://feeds.bbci.co.uk/news/rss.xml',itemCount:5},defaultDuration:20},
        {id:'app-room',appId:'room-booking',name:'Raumbuchung',description:'Kalender & Verfügbarkeit',icon:'fas fa-calendar-check',version:'1.0',enabled:true,config:{calendarUrl:'',roomName:'',roomCapacity:10},defaultDuration:null},
    ];
}

// ═══ ANALYTICS ═══
function loadAnalytics(tenantId) {
    const p = path.join(TENANTS_DIR, `${tenantId}_analytics.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { productViews:{}, displayViews:{}, hourlyStats:{}, dailyStats:{}, events:[] };
}
function saveAnalytics(tenantId, data) {
    fs.writeFileSync(path.join(TENANTS_DIR, `${tenantId}_analytics.json`), JSON.stringify(data, null, 2));
}

// ═══ JWT MIDDLEWARE ═══
function authMiddleware(roles = []) {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht authentifiziert' });
        try {
            const token = header.slice(7);
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
            next();
        } catch (e) {
            res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
        }
    };
}

function tenantMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Kein Mandant' });
    const tenant = loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Mandant nicht gefunden' });
    req.tenant = tenant;
    req.tenantId = tenantId;
    next();
}

// ═══ STATIC FILES ═══
// Serve tenant-specific admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/superadmin', express.static(path.join(__dirname, 'superadmin')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/apps', express.static(APPS_DIR));

// ═══ AUTH ROUTES ═══

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email und Passwort erforderlich' });

    const sa = loadSuperAdmin();

    // Check SuperAdmin
    const superUser = sa.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (superUser) {
        const valid = await bcrypt.compare(password, superUser.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        const token = jwt.sign({ id: superUser.id, email: superUser.email, role: 'superadmin', name: superUser.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        return res.json({ token, user: { id: superUser.id, email: superUser.email, role: 'superadmin', name: superUser.name } });
    }

    // Check Tenant Users
    for (const tenant of sa.tenants) {
        const tData = loadTenant(tenant.id);
        if (!tData) continue;
        const tUser = (tData.users || []).find(u => u.email.toLowerCase() === email.toLowerCase() && u.active !== false);
        if (tUser) {
            const valid = await bcrypt.compare(password, tUser.passwordHash);
            if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
            const token = jwt.sign({ id: tUser.id, email: tUser.email, role: tUser.role, name: tUser.name, tenantId: tenant.id, tenantName: tenant.name, tenantSlug: tenant.slug }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
            return res.json({ token, user: { id: tUser.id, email: tUser.email, role: tUser.role, name: tUser.name, tenantId: tenant.id, tenantName: tenant.name } });
        }
    }

    res.status(401).json({ error: 'Ungültige Anmeldedaten' });
});

// Get current user
app.get('/api/auth/me', authMiddleware(), (req, res) => {
    res.json({ user: req.user });
});

// Change password
app.post('/api/auth/change-password', authMiddleware(), async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Passwort min. 6 Zeichen' });

    if (req.user.role === 'superadmin') {
        const sa = loadSuperAdmin();
        const u = sa.users.find(u => u.id === req.user.id);
        if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
        const valid = await bcrypt.compare(currentPassword, u.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
        u.passwordHash = await bcrypt.hash(newPassword, 10);
        saveSuperAdmin(sa);
    } else {
        const tData = loadTenant(req.user.tenantId);
        const u = (tData.users || []).find(u => u.id === req.user.id);
        if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
        const valid = await bcrypt.compare(currentPassword, u.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
        u.passwordHash = await bcrypt.hash(newPassword, 10);
        saveTenant(req.user.tenantId, tData);
    }
    res.json({ success: true });
});

// ═══ SUPERADMIN ROUTES ═══

// List all tenants
app.get('/api/superadmin/tenants', authMiddleware(['superadmin']), (req, res) => {
    const sa = loadSuperAdmin();
    const tenants = sa.tenants.map(t => {
        const tData = loadTenant(t.id);
        return {
            ...t,
            displayCount: (tData?.displays || []).length,
            userCount: (tData?.users || []).length,
            productCount: (tData?.products || []).length,
            lastModified: tData?.lastModified
        };
    });
    res.json({ tenants });
});

// Create tenant
app.post('/api/superadmin/tenants', authMiddleware(['superadmin']), async (req, res) => {
    const { name, slug, plan, adminEmail, adminName, adminPassword } = req.body;
    if (!name || !slug || !adminEmail || !adminPassword) return res.status(400).json({ error: 'Pflichtfelder fehlen' });

    const sa = loadSuperAdmin();
    if (sa.tenants.find(t => t.slug === slug)) return res.status(409).json({ error: 'Slug bereits vergeben' });

    const tenantId = uuidv4();
    const tenant = { id: tenantId, name, slug, plan: plan || 'starter', active: true, createdAt: new Date().toISOString(), maxDisplays: plan === 'business' ? 15 : plan === 'agency' ? 50 : 3, maxUsers: plan === 'business' ? 5 : plan === 'agency' ? 15 : 2, storageMb: plan === 'business' ? 5000 : plan === 'agency' ? 20000 : 1000 };

    const adminUser = { id: uuidv4(), email: adminEmail, name: adminName || adminEmail.split('@')[0], role: 'tenantadmin', passwordHash: await bcrypt.hash(adminPassword, 10), createdAt: new Date().toISOString(), active: true };

    const tData = getDefaultTenantData(tenant);
    tData.users = [adminUser];
    saveTenant(tenantId, tData);

    sa.tenants.push(tenant);
    saveSuperAdmin(sa);

    res.json({ success: true, tenant, adminUser: { ...adminUser, passwordHash: undefined } });
});

// Update tenant
app.put('/api/superadmin/tenants/:id', authMiddleware(['superadmin']), (req, res) => {
    const sa = loadSuperAdmin();
    const idx = sa.tenants.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Mandant nicht gefunden' });
    sa.tenants[idx] = { ...sa.tenants[idx], ...req.body, id: req.params.id };
    saveSuperAdmin(sa);
    res.json({ success: true, tenant: sa.tenants[idx] });
});

// Delete tenant
app.delete('/api/superadmin/tenants/:id', authMiddleware(['superadmin']), (req, res) => {
    const sa = loadSuperAdmin();
    const tenant = sa.tenants.find(t => t.id === req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Mandant nicht gefunden' });
    sa.tenants = sa.tenants.filter(t => t.id !== req.params.id);
    saveSuperAdmin(sa);
    const p = getTenantPath(req.params.id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ success: true });
});

// SuperAdmin Stats
app.get('/api/superadmin/stats', authMiddleware(['superadmin']), (req, res) => {
    const sa = loadSuperAdmin();
    let totalDisplays = 0, totalUsers = 0, totalProducts = 0;
    sa.tenants.forEach(t => {
        const d = loadTenant(t.id);
        if (d) { totalDisplays += (d.displays||[]).length; totalUsers += (d.users||[]).length; totalProducts += (d.products||[]).length; }
    });
    res.json({ tenantCount: sa.tenants.length, totalDisplays, totalUsers, totalProducts, activeTenants: sa.tenants.filter(t => t.active).length });
});

// Impersonate tenant (login as tenant)
app.post('/api/superadmin/impersonate/:tenantId', authMiddleware(['superadmin']), (req, res) => {
    const sa = loadSuperAdmin();
    const tenant = sa.tenants.find(t => t.id === req.params.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Mandant nicht gefunden' });
    const tData = loadTenant(tenant.id);
    const adminUser = (tData?.users || []).find(u => u.role === 'tenantadmin');
    if (!adminUser) return res.status(404).json({ error: 'Kein Admin-User gefunden' });
    const token = jwt.sign({ id: adminUser.id, email: adminUser.email, role: adminUser.role, name: adminUser.name, tenantId: tenant.id, tenantName: tenant.name, tenantSlug: tenant.slug, impersonated: true }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, user: { ...adminUser, passwordHash: undefined, tenantId: tenant.id, tenantName: tenant.name } });
});

// ═══ TENANT: USER MANAGEMENT ═══
app.get('/api/users', authMiddleware(['tenantadmin', 'superadmin']), tenantMiddleware, (req, res) => {
    const users = (req.tenant.users || []).map(u => ({ ...u, passwordHash: undefined }));
    res.json({ users });
});

app.post('/api/users', authMiddleware(['tenantadmin']), tenantMiddleware, async (req, res) => {
    const { email, name, role, password } = req.body;
    const sa = loadSuperAdmin();
    const tenantMeta = sa.tenants.find(t => t.id === req.tenantId);
    const currentUsers = req.tenant.users?.length || 0;
    if (tenantMeta && currentUsers >= tenantMeta.maxUsers) return res.status(403).json({ error: `Maximale Nutzeranzahl (${tenantMeta.maxUsers}) erreicht` });
    if (!email || !password || !role) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
    const validRoles = ['tenantadmin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
    if ((req.tenant.users || []).find(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'Email bereits vorhanden' });
    const user = { id: uuidv4(), email, name: name || email.split('@')[0], role, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString(), active: true };
    if (!req.tenant.users) req.tenant.users = [];
    req.tenant.users.push(user);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, user: { ...user, passwordHash: undefined } });
});

app.put('/api/users/:id', authMiddleware(['tenantadmin']), tenantMiddleware, async (req, res) => {
    const u = (req.tenant.users || []).find(u => u.id === req.params.id);
    if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
    if (req.body.name) u.name = req.body.name;
    if (req.body.role) u.role = req.body.role;
    if (req.body.active !== undefined) u.active = req.body.active;
    if (req.body.password) u.passwordHash = await bcrypt.hash(req.body.password, 10);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, user: { ...u, passwordHash: undefined } });
});

app.delete('/api/users/:id', authMiddleware(['tenantadmin']), tenantMiddleware, (req, res) => {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
    req.tenant.users = (req.tenant.users || []).filter(u => u.id !== req.params.id);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

// ═══ TENANT: DATA ═══
// Public tenant resolver — finds tenant from JWT OR from display slug header
function resolveTenant(req, res, next) {
    // Try JWT first
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), JWT_SECRET);
            req.user = decoded;
            if (decoded.tenantId) {
                const t = loadTenant(decoded.tenantId);
                if (t) { req.tenant = t; req.tenantId = decoded.tenantId; return next(); }
            }
        } catch(e) {}
    }
    // Try tenant slug from query or header
    const slug = req.query.tenantSlug || req.headers['x-tenant-slug'];
    if (slug) {
        const sa = loadSuperAdmin();
        const meta = sa.tenants.find(t => t.slug === slug);
        if (meta) {
            const t = loadTenant(meta.id);
            if (t) { req.tenant = t; req.tenantId = meta.id; return next(); }
        }
    }
    // Try display ID from query
    const displayId = req.query.displayId;
    if (displayId) {
        const sa = loadSuperAdmin();
        for (const tm of sa.tenants) {
            const td = loadTenant(tm.id);
            if (!td) continue;
            const d = (td.displays||[]).find(d => d.id === displayId || d.slug === displayId);
            if (d) { req.tenant = td; req.tenantId = tm.id; return next(); }
        }
    }
    return res.status(401).json({ error: 'Tenant nicht bestimmbar' });
}

app.get('/api/data', resolveTenant, (req, res) => {
    const { users, ...safeData } = req.tenant;
    res.json(safeData);
});

app.post('/api/save', authMiddleware(['tenantadmin', 'editor']), tenantMiddleware, (req, res) => {
    const { users, id, slug } = req.tenant; // preserve protected fields
    const updated = { ...req.body, users, id, slug };
    saveTenant(req.tenantId, updated) ? res.json({ success: true }) : res.status(500).json({ success: false });
});

// Settings
app.get('/api/settings', authMiddleware(), tenantMiddleware, (req, res) => res.json(req.tenant.settings || {}));
app.post('/api/settings', authMiddleware(['tenantadmin', 'editor']), tenantMiddleware, (req, res) => {
    req.tenant.settings = { ...req.tenant.settings, ...req.body };
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, settings: req.tenant.settings });
});

// ═══ TENANT: PRODUCTS ═══
const crudRoutes = (entity) => {
    app.get(`/api/${entity}`, authMiddleware(), tenantMiddleware, (req, res) => res.json(req.tenant[entity] || []));
    app.post(`/api/${entity}`, authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
        if (!req.tenant[entity]) req.tenant[entity] = [];
        const item = { ...req.body, id: req.body.id || uuidv4() };
        req.tenant[entity].push(item);
        saveTenant(req.tenantId, req.tenant);
        res.json({ success: true, [entity.slice(0,-1)]: item });
    });
    app.put(`/api/${entity}/:id`, authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
        const arr = req.tenant[entity] || [];
        const idx = arr.findIndex(i => String(i.id) === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
        arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id };
        saveTenant(req.tenantId, req.tenant);
        res.json({ success: true, [entity.slice(0,-1)]: arr[idx] });
    });
    app.delete(`/api/${entity}/:id`, authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
        req.tenant[entity] = (req.tenant[entity] || []).filter(i => String(i.id) !== req.params.id);
        saveTenant(req.tenantId, req.tenant);
        res.json({ success: true });
    });
};
['products','zones','templates','displays','playlists','schedules'].forEach(crudRoutes);

// Apply template
app.post('/api/apply-template', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    const t = (req.tenant.templates || []).find(t => t.id === req.body.templateId);
    if (!t) return res.status(404).json({ error: 'Template nicht gefunden' });
    req.tenant.zones = JSON.parse(JSON.stringify(t.zones));
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, zones: req.tenant.zones });
});

// ═══ TENANT: APPS ═══
app.get('/api/apps', authMiddleware(), tenantMiddleware, (req, res) => res.json(req.tenant.apps || []));
app.post('/api/apps', authMiddleware(['tenantadmin']), tenantMiddleware, (req, res) => {
    if (!req.tenant.apps) req.tenant.apps = [];
    const app_ = { ...req.body, id: uuidv4(), installedAt: new Date().toISOString() };
    req.tenant.apps.push(app_);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, app: app_ });
});
app.put('/api/apps/:id', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    const idx = (req.tenant.apps || []).findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'App nicht gefunden' });
    req.tenant.apps[idx] = { ...req.tenant.apps[idx], ...req.body, id: req.params.id };
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, app: req.tenant.apps[idx] });
});
app.delete('/api/apps/:id', authMiddleware(['tenantadmin']), tenantMiddleware, (req, res) => {
    req.tenant.apps = (req.tenant.apps || []).filter(a => a.id !== req.params.id);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

// Available apps from /apps directory
app.get('/api/app-store', authMiddleware(), (req, res) => {
    const available = [
        { appId:'weather', name:'Wetter', description:'Aktuelles Wetter & Vorhersage', icon:'fas fa-cloud-sun', version:'1.0', author:'System', defaultDuration:15, category:'info', configSchema:{ latitude:{type:'text',label:'Breitengrad',default:'52.52'}, longitude:{type:'text',label:'Längengrad',default:'13.41'}, unit:{type:'select',label:'Einheit',options:['celsius','fahrenheit'],default:'celsius'} } },
        { appId:'clock', name:'Uhr & Datum', description:'Digitale Uhr mit Datum', icon:'fas fa-clock', version:'1.0', author:'System', defaultDuration:null, category:'info', configSchema:{ format:{type:'select',label:'Format',options:['24h','12h'],default:'24h'}, showDate:{type:'boolean',label:'Datum anzeigen',default:true}, showSeconds:{type:'boolean',label:'Sekunden anzeigen',default:false} } },
        { appId:'news-feed', name:'News Feed', description:'RSS-Nachrichten-Ticker', icon:'fas fa-newspaper', version:'1.0', author:'System', defaultDuration:20, category:'content', configSchema:{ feedUrl:{type:'text',label:'RSS-Feed URL',default:''}, itemCount:{type:'number',label:'Anzahl Nachrichten',default:5} } },
        { appId:'room-booking', name:'Raumbuchung', description:'Kalender & Raumverfügbarkeit', icon:'fas fa-calendar-check', version:'1.0', author:'System', defaultDuration:null, category:'business', configSchema:{ calendarUrl:{type:'text',label:'CalDAV/iCal URL',default:''}, roomName:{type:'text',label:'Raumname',default:'Konferenzraum'}, roomCapacity:{type:'number',label:'Kapazität',default:10} } },
        { appId:'countdown', name:'Countdown', description:'Countdown-Timer für Events', icon:'fas fa-hourglass-half', version:'1.0', author:'System', defaultDuration:null, category:'info', configSchema:{ targetDate:{type:'text',label:'Zieldatum (YYYY-MM-DD)',default:''}, targetLabel:{type:'text',label:'Bezeichnung',default:'Event'} } },
        { appId:'menuboard', name:'Menüboard', description:'Digitales Speisekarten-Display mit Produkten, Preisen & Kategorien', icon:'fas fa-utensils', version:'1.0', author:'System', defaultDuration:null, category:'business',
            configSchema:{ categoryFilter:{type:'text',label:'Kategorie-Filter (kommagetrennt)',default:''}, columns:{type:'select',label:'Spalten',options:['auto','2','3','4'],default:'auto'}, showImages:{type:'boolean',label:'Bilder anzeigen',default:true}, showPrices:{type:'boolean',label:'Preise anzeigen',default:true}, showBadges:{type:'boolean',label:'Badges anzeigen',default:true}, cardStyle:{type:'select',label:'Karten-Stil',options:['vertical','horizontal','compact'],default:'vertical'}, priceStyle:{type:'select',label:'Preis-Stil',options:['badge-gold','badge-dark','text-plain','text-bold'],default:'badge-gold'} } },
        { appId:'social', name:'Social Feed', description:'Instagram & TikTok Feed', icon:'fab fa-instagram', version:'2.0', author:'System', defaultDuration:30, category:'social',
            configSchema:{ platform:{type:'select',label:'Plattform',options:['instagram','tiktok'],default:'instagram'}, handle:{type:'text',label:'@Handle',default:''}, hashtag:{type:'text',label:'Hashtag (ohne #)',default:''}, token:{type:'text',label:'Access Token',default:''}, postCount:{type:'number',label:'Anzahl Posts',default:6}, layout:{type:'select',label:'Layout',options:['2x2','3x1','1-big','strip'],default:'2x2'}, showCaptions:{type:'boolean',label:'Beschriftungen',default:true}, showLikes:{type:'boolean',label:'Likes anzeigen',default:true}, refreshMin:{type:'number',label:'Refresh (Minuten)',default:15} } },
    ];
    res.json({ apps: available });
});

// ═══ TENANT: DISPLAYS & REMOTE ═══
app.post('/api/displays/:id/heartbeat', (req, res) => {
    // Public endpoint — find tenant by display slug/id
    const sa = loadSuperAdmin();
    for (const t of sa.tenants) {
        const tData = loadTenant(t.id);
        if (!tData) continue;
        const disp = (tData.displays || []).find(d => d.id === req.params.id);
        if (disp) {
            disp.lastSeen = new Date().toISOString();
            saveTenant(t.id, tData);
            return res.json({ success: true, config: disp });
        }
    }
    res.status(404).json({ success: false });
});

app.post('/api/displays/:id/command', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    const disp = (req.tenant.displays || []).find(d => d.id === req.params.id);
    if (!disp) return res.status(404).json({ error: 'Display nicht gefunden' });
    if (!disp.pendingCommands) disp.pendingCommands = [];
    disp.pendingCommands.push({ ...req.body, timestamp: new Date().toISOString(), id: uuidv4() });
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

app.get('/api/displays/:id/commands', (req, res) => {
    const sa = loadSuperAdmin();
    for (const t of sa.tenants) {
        const tData = loadTenant(t.id);
        if (!tData) continue;
        const disp = (tData.displays || []).find(d => d.id === req.params.id);
        if (disp) {
            const cmds = disp.pendingCommands || [];
            disp.pendingCommands = [];
            saveTenant(t.id, tData);
            return res.json({ success: true, commands: cmds });
        }
    }
    res.status(404).json({ success: false });
});

app.post('/api/displays/broadcast', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    (req.tenant.displays || []).forEach(d => {
        if (!d.pendingCommands) d.pendingCommands = [];
        d.pendingCommands.push({ ...req.body, timestamp: new Date().toISOString(), id: uuidv4() });
    });
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

// ═══ TENANT: PLAYLIST ENGINE ═══
// Playlist with duration per item
app.get('/api/playlist-engine/:displayId', (req, res) => {
    // Public — resolve tenant from display
    const sa = loadSuperAdmin();
    for (const t of sa.tenants) {
        const tData = loadTenant(t.id);
        if (!tData) continue;
        const disp = (tData.displays || []).find(d => d.id === req.params.displayId || d.slug === req.params.displayId);
        if (disp) {
            const playlist = disp.playlistId ? (tData.playlists || []).find(p => p.id === disp.playlistId) : null;
            const items = (playlist?.items || []).map(item => {
                // Resolve duration
                let duration = item.duration;
                if (!duration) {
                    if (item.contentType === 'app') {
                        const app_ = (tData.apps || []).find(a => a.id === item.contentId);
                        duration = app_?.defaultDuration || 15;
                    } else if (item.contentType === 'media') {
                        duration = item.duration || 10;
                    } else {
                        duration = 10;
                    }
                }
                return { ...item, resolvedDuration: duration };
            });
            return res.json({ success: true, display: disp, playlist: playlist ? { ...playlist, items } : null, tenantSettings: tData.settings });
        }
    }
    res.status(404).json({ success: false });
});

// ═══ TENANT: SCHEDULE ═══
// POST /api/schedules — save all schedules
app.post('/api/schedules', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    req.tenant.schedules = req.body.schedules || [];
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true, schedules: req.tenant.schedules });
});

// PUT /api/schedules/:id — update single schedule
app.put('/api/schedules/:id', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    if (!req.tenant.schedules) req.tenant.schedules = [];
    const idx = req.tenant.schedules.findIndex(s => s.id === req.params.id);
    if (idx !== -1) req.tenant.schedules[idx] = { ...req.tenant.schedules[idx], ...req.body, id: req.params.id };
    else req.tenant.schedules.push({ ...req.body, id: req.params.id });
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

// DELETE /api/schedules/:id
app.delete('/api/schedules/:id', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    req.tenant.schedules = (req.tenant.schedules||[]).filter(s => s.id !== req.params.id);
    saveTenant(req.tenantId, req.tenant);
    res.json({ success: true });
});

app.get('/api/schedule', resolveTenant, (req, res) => {
    const schedules = req.tenant.schedules || [];
    const now = new Date();
    const cd = now.getDay(), ct = now.getHours() * 60 + now.getMinutes();
    const active = schedules.find(s => {
        if (!s.active || !s.days?.includes(cd)) return false;
        const [sh,sm] = (s.startTime||'00:00').split(':').map(Number);
        const [eh,em] = (s.endTime||'23:59').split(':').map(Number);
        return ct >= sh*60+sm && ct < eh*60+em;
    });
    res.json({ activeSchedule: active || null, allSchedules: schedules });
});

// ═══ TENANT: WEATHER ═══
app.get('/api/weather', async (req, res) => { // Public endpoint
    try {
        const lat = req.query.lat || '52.52', lon = req.query.lon || '13.41';
        const { default: fetch } = await import('node-fetch');
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&windspeed_unit=kmh`);
        const wd = await r.json();
        const code = wd.current_weather.weathercode;
        const icons = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',51:'🌦️',61:'🌧️',71:'❄️',80:'🌦️',95:'⛈️'};
        res.json({ temperature: wd.current_weather.temperature, windspeed: wd.current_weather.windspeed, weathercode: code, icon: icons[code]||'🌡️' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ TENANT: ANALYTICS ═══
app.post('/api/analytics/track', resolveTenant, (req, res) => {
    const a = loadAnalytics(req.tenantId);
    const { type, id, displayId } = req.body;
    const now = new Date(), h = now.getHours(), day = now.toISOString().split('T')[0];
    if (type === 'product_view' && id) a.productViews[id] = (a.productViews[id]||0) + 1;
    if (displayId) a.displayViews[displayId] = (a.displayViews[displayId]||0) + 1;
    a.hourlyStats[`${day}_h${h}`] = (a.hourlyStats[`${day}_h${h}`]||0) + 1;
    a.dailyStats[day] = (a.dailyStats[day]||0) + 1;
    a.events.push({ type, id, displayId, ts: now.toISOString() });
    if (a.events.length > 1000) a.events = a.events.slice(-1000);
    saveAnalytics(req.tenantId, a);
    res.json({ success: true });
});

app.get('/api/analytics', authMiddleware(), resolveTenant, (req, res) => {
    const a = loadAnalytics(req.tenantId);
    const productRanking = Object.entries(a.productViews).map(([id,views]) => {
        const p = (req.tenant.products||[]).find(p => String(p.id) === id);
        return { id, name: p?.title||'Unbekannt', category: p?.category||'', views };
    }).sort((x,y) => y.views-x.views).slice(0,20);
    const last7Days = [];
    for (let i=6; i>=0; i--) { const d=new Date(); d.setDate(d.getDate()-i); const k=d.toISOString().split('T')[0]; last7Days.push({date:k,views:a.dailyStats[k]||0}); }
    const today = new Date().toISOString().split('T')[0];
    const hourlyToday = Array.from({length:24},(_,h) => ({hour:h,views:a.hourlyStats[`${today}_h${h}`]||0}));
    res.json({ productRanking, last7Days, hourlyToday, totalProductViews: Object.values(a.productViews).reduce((x,y)=>x+y,0), displayViews: a.displayViews });
});

// ═══ MEDIA UPLOAD ═══
app.post('/api/upload', authMiddleware(['tenantadmin','editor']), tenantMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
    res.json({ success: true, file: { filename: req.file.filename, originalname: req.file.originalname, url: `/uploads/${req.tenantId}/${req.file.filename}`, size: req.file.size, mimetype: req.file.mimetype } });
});
app.post('/api/upload-multiple', authMiddleware(['tenantadmin','editor']), tenantMiddleware, upload.array('files', 20), (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Keine Dateien' });
    res.json({ success: true, files: req.files.map(f => ({ filename: f.filename, originalname: f.originalname, url: `/uploads/${req.tenantId}/${f.filename}`, size: f.size, mimetype: f.mimetype })) });
});
// /api/uploads-list replaced by enhanced version above
app.delete('/api/uploads/:filename', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req, res) => {
    const fp = path.join(UPLOADS_DIR, req.tenantId, req.params.filename);
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ success: true }); }
    else res.status(404).json({ error: 'Datei nicht gefunden' });
});

// ═══ PUBLIC DISPLAY PAGE ═══
// Public API for displays — resolves tenant from URL
app.get('/api/public/:tenantSlug/data', (req, res) => {
    const sa = loadSuperAdmin();
    const meta = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!meta) return res.status(404).json({ error: 'Tenant nicht gefunden' });
    const t = loadTenant(meta.id);
    if (!t) return res.status(404).json({ error: 'Daten nicht gefunden' });
    const { users, ...safeData } = t;
    res.json(safeData);
});
app.get('/api/public/:tenantSlug/schedule', (req, res) => {
    const sa = loadSuperAdmin();
    const meta = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!meta) return res.status(404).json({ error: 'Nicht gefunden' });
    const t = loadTenant(meta.id);
    const schedules = t?.schedules || [];
    const now = new Date(); const cd = now.getDay(); const ct = now.getHours()*60+now.getMinutes();
    const active = schedules.find(s => {
        if (!s.active||!s.days?.includes(cd)) return false;
        const [sh,sm]=(s.startTime||'00:00').split(':').map(Number);
        const [eh,em]=(s.endTime||'23:59').split(':').map(Number);
        return ct>=sh*60+sm&&ct<eh*60+em;
    });
    res.json({ activeSchedule: active||null, allSchedules: schedules });
});
app.post('/api/public/:tenantSlug/analytics', (req, res) => {
    const sa = loadSuperAdmin();
    const meta = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!meta) return res.status(200).json({ success: false });
    const a = loadAnalytics(meta.id);
    const { type, id, displayId } = req.body;
    const now = new Date(), h = now.getHours(), day = now.toISOString().split('T')[0];
    if (type==='product_view'&&id) a.productViews[id]=(a.productViews[id]||0)+1;
    if (displayId) a.displayViews[displayId]=(a.displayViews[displayId]||0)+1;
    a.hourlyStats[`${day}_h${h}`]=(a.hourlyStats[`${day}_h${h}`]||0)+1;
    a.dailyStats[day]=(a.dailyStats[day]||0)+1;
    a.events.push({type,id,displayId,ts:now.toISOString()});
    if(a.events.length>1000) a.events=a.events.slice(-1000);
    saveAnalytics(meta.id, a);
    res.json({ success: true });
});
app.get('/api/public/:tenantSlug/commands/:displayId', (req, res) => {
    const sa = loadSuperAdmin();
    const meta = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!meta) return res.status(200).json({ success: true, commands: [] });
    const t = loadTenant(meta.id);
    const d = (t?.displays||[]).find(x => x.id === req.params.displayId);
    if (!d) return res.json({ success: true, commands: [] });
    const cmds = d.pendingCommands||[];
    d.pendingCommands = [];
    saveTenant(meta.id, t);
    res.json({ success: true, commands: cmds });
});
app.post('/api/public/:tenantSlug/heartbeat/:displayId', (req, res) => {
    const sa = loadSuperAdmin();
    const meta = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!meta) return res.status(200).json({ success: false });
    const t = loadTenant(meta.id);
    const d = (t?.displays||[]).find(x => x.id === req.params.displayId);
    if (d) { d.lastSeen = new Date().toISOString(); saveTenant(meta.id, t); }
    res.json({ success: true });
});

app.get('/display/:tenantSlug/:displaySlug', (req, res) => {
    const sa = loadSuperAdmin();
    const tenant = sa.tenants.find(t => t.slug === req.params.tenantSlug);
    if (!tenant) return res.status(404).send('<h1>Tenant nicht gefunden</h1>');
    const tData = loadTenant(tenant.id);
    const disp = (tData?.displays || []).find(d => d.slug === req.params.displaySlug && d.active !== false);
    if (!disp) return res.status(404).send('<h1>Display nicht gefunden</h1>');
    disp.lastSeen = new Date().toISOString();
    saveTenant(tenant.id, tData);
    res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${disp.name} — ${tenant.name}</title>
  <link rel="stylesheet" href="/public/css/display.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
  <div id="loadingScreen" class="loading-screen">
    <div class="loading-spinner"></div>
    <p>${disp.name}</p>
  </div>
  <div id="displayContainer" class="display-container"></div>
  <script>
    window.DISPLAY_ID   = '${disp.id}';
  window.TENANT_SLUG  = '${tenant.slug}';
    window.DISPLAY_SLUG = '${disp.slug}';
    window.TENANT_ID    = '${tenant.id}';
    window.TENANT_SLUG  = '${tenant.slug}';
    window.API_BASE     = '/api';
  </script>
  <script src="/public/js/display.js"></script>
</body>
</html>`);
});

// ═══ INIT SUPERADMIN ═══
async function initSuperAdmin() {
    const sa = loadSuperAdmin();
    if (sa.users.length === 0) {
        const pw = process.env.SUPERADMIN_PASSWORD || 'admin1234';
        sa.users.push({ id: uuidv4(), email: 'admin@cms.local', name: 'Super Admin', role: 'superadmin', passwordHash: await bcrypt.hash(pw, 10), createdAt: new Date().toISOString() });
        saveSuperAdmin(sa);
        console.log('✅ SuperAdmin erstellt: admin@cms.local / ' + pw);
    }
    // Create demo tenant if none exists
    if (sa.tenants.length === 0) {
        const tenantId = uuidv4();
        const tenant = { id: tenantId, name: 'Demo Restaurant', slug: 'demo', plan: 'business', active: true, createdAt: new Date().toISOString(), maxDisplays: 15, maxUsers: 5, storageMb: 5000 };
        const adminUser = { id: uuidv4(), email: 'demo@cms.local', name: 'Demo Admin', role: 'tenantadmin', passwordHash: await bcrypt.hash('demo1234', 10), createdAt: new Date().toISOString(), active: true };
        const tData = getDefaultTenantData(tenant);
        tData.users = [adminUser];
        tData.displays = [{ id: uuidv4(), name: 'Hauptdisplay', slug: 'main', description: 'Hauptdisplay Theke', templateId: 'split', playlistId: null, active: true, createdAt: new Date().toISOString(), lastSeen: null }];
        saveTenant(tenantId, tData);
        sa.tenants.push(tenant);
        saveSuperAdmin(sa);
        console.log('✅ Demo-Tenant erstellt: demo@cms.local / demo1234');
        console.log('   Display-URL: /display/demo/main');
    }
}

// Shapes (graphic elements in designer)
app.get('/api/shapes', authMiddleware(), tenantMiddleware, (req,res) => res.json(req.tenant.shapes||[]));
app.post('/api/shapes', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req,res) => {
    req.tenant.shapes = req.body.shapes || [];
    saveTenant(req.tenantId, req.tenant);
    res.json({ success:true, shapes: req.tenant.shapes });
});

// Designer export — serve SVG/PNG
app.post('/api/designer/export', authMiddleware(['tenantadmin','editor']), tenantMiddleware, (req,res) => {
    const { svg, format='svg' } = req.body;
    if (!svg) return res.status(400).json({ error:'Kein SVG' });
    const filename = `design-${Date.now()}.${format}`;
    const dir = path.join(UPLOADS_DIR, req.tenantId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, filename);
    fs.writeFileSync(fp, svg, 'utf8');
    res.json({ success: true, url: `/uploads/${req.tenantId}/${filename}`, filename });
});

// Social feed app iframe (public)
// Menuboard App (served as iframe)
app.get('/app/menuboard', resolveTenant, (req, res) => {
    const config = req.query;
    const products = (req.tenant?.products || []);
    const settings = req.tenant?.settings || {};
    const currency = settings.currency || '€';
    const cpos = settings.currencyPosition || 'after';
    const fmt = p => cpos === 'before' ? `${currency} ${p}` : `${p} ${currency}`;
    const catFilter = config.categoryFilter ? config.categoryFilter.split(',').map(c => c.trim()).filter(Boolean) : [];
    const filtered = catFilter.length ? products.filter(p => catFilter.includes(p.category)) : products;
    const cols = config.columns || 'auto';
    const cardStyle = config.cardStyle || 'vertical';
    const showImages = config.showImages !== 'false';
    const showPrices = config.showPrices !== 'false';
    const showBadges = config.showBadges !== 'false';
    const priceStyle = config.priceStyle || 'badge-gold';
    const theme = settings.theme || 'dark';
    const font = settings.font || 'Inter';

    const gridCols = cols === 'auto' ? (filtered.length <= 4 ? 2 : filtered.length <= 9 ? 3 : 4) : parseInt(cols);

    const priceClass = {'badge-gold':'price-badge-gold','badge-dark':'price-badge-dark','text-plain':'price-plain','text-bold':'price-bold'}[priceStyle]||'price-badge-gold';

    const cards = filtered.map(p => {
        const sold = p.stockStatus === 'soldout';
        const price = showPrices && !sold ? `<span class="${priceClass}">${fmt(p.price)}</span>` : '';
        const badge = showBadges && p.badge ? `<span class="mb-badge">${p.badge}</span>` : '';
        if (cardStyle === 'compact') return `<div class="mb-card mb-compact"><span class="mb-title">${p.title}</span>${price}</div>`;
        if (cardStyle === 'horizontal') return `<div class="mb-card mb-horizontal">${showImages && p.image ? `<img src="${p.image}" class="mb-img-h">` : ''}<div class="mb-info">${badge}<div class="mb-title">${p.title}</div>${price}</div></div>`;
        return `<div class="mb-card">${showImages && p.image ? `<div class="mb-img-wrap"><img src="${p.image}" class="mb-img">${sold?'<div class="mb-sold">AUSVERKAUFT</div>':''}</div>` : ''}<div class="mb-info">${badge}<div class="mb-title">${p.title}</div>${price}</div></div>`;
    }).join('');

    res.send(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=${font.replace(/ /g,'+')}:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;font-family:'${font}',system-ui,sans-serif;background:${theme==='light'?'#f0f2f5':theme==='burger'?'#1a0a00':theme==='coffee'?'#1a1200':'#0a0a0f'};color:${theme==='light'?'#1a1a2e':'#fff'};overflow:hidden}
.mb-grid{display:grid;grid-template-columns:repeat(${gridCols},1fr);gap:10px;padding:12px;height:100%;align-content:start;overflow:hidden}
.mb-card{background:${theme==='light'?'#fff':theme==='burger'?'#2a1500':theme==='coffee'?'#2a1f0a':'#141420'};border:1px solid ${theme==='light'?'#e0e0e0':'#2a2a3a'};border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.mb-horizontal{flex-direction:row!important}
.mb-compact{flex-direction:row!important;align-items:center;padding:10px 14px;justify-content:space-between}
.mb-img-wrap{position:relative;padding-top:55%;background:rgba(0,0,0,.2);flex-shrink:0}
.mb-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mb-img-h{width:80px;height:100%;object-fit:cover;flex-shrink:0}
.mb-sold{position:absolute;inset:0;background:rgba(0,0,0,.7);color:#f43f5e;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(8px,.8vw,12px);letter-spacing:.1em}
.mb-info{padding:8px 10px;display:flex;flex-direction:column;gap:4px;flex:1}
.mb-badge{font-size:clamp(7px,.65vw,10px);font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(124,111,255,.2);color:#7c6fff;width:fit-content}
.mb-title{font-weight:700;font-size:clamp(10px,.9vw,15px);line-height:1.2;color:${theme==='light'?'#1a1a2e':'#fff'}}
.price-badge-gold{display:inline-block;background:#FFD700;color:#000;font-weight:800;font-size:clamp(10px,.9vw,15px);padding:3px 10px;border-radius:20px;margin-top:auto}
.price-badge-dark{display:inline-block;background:rgba(0,0,0,.5);color:#FFD700;border:1px solid #FFD700;font-weight:700;font-size:clamp(10px,.9vw,15px);padding:3px 10px;border-radius:20px;margin-top:auto}
.price-plain{font-size:clamp(11px,1vw,16px);font-weight:600;color:${theme==='light'?'#1a1a2e':'#fff'};margin-top:auto}
.price-bold{font-size:clamp(12px,1.1vw,18px);font-weight:900;color:#FFD700;margin-top:auto}
</style></head><body>
<div class="mb-grid">${cards||'<div style="grid-column:1/-1;text-align:center;padding:40px;color:#666">Keine Produkte vorhanden</div>'}</div>
</body></html>`);
});

app.get('/app/social-feed', (req,res) => {
    res.sendFile(path.join(APPS_DIR, 'social-feed', 'app.html'));
});


// ═══ GLOBAL MEDIA (SuperAdmin) ═══

const GLOBAL_UPLOADS_DIR = path.join(UPLOADS_DIR, 'global');
if (!fs.existsSync(GLOBAL_UPLOADS_DIR)) fs.mkdirSync(GLOBAL_UPLOADS_DIR, { recursive: true });

const globalStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, GLOBAL_UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4().slice(0,8) + path.extname(file.originalname))
});
const uploadGlobal = multer({ storage: globalStorage, limits: { fileSize: 100*1024*1024 },
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|mp4|webm|mov|svg|pdf/.test(path.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Dateityp nicht erlaubt'));
    }
});

app.get('/api/superadmin/media', authMiddleware(['superadmin']), (req, res) => {
    try {
        const files = fs.readdirSync(GLOBAL_UPLOADS_DIR).filter(f => f !== '.gitkeep').map(f => {
            const s = fs.statSync(path.join(GLOBAL_UPLOADS_DIR, f));
            return { filename: f, url: `/uploads/global/${f}`, size: s.size, modified: s.mtime, global: true };
        });
        res.json({ success: true, uploads: files });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/superadmin/media/upload', authMiddleware(['superadmin']), uploadGlobal.array('files', 20), (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Keine Dateien' });
    res.json({ success: true, files: req.files.map(f => ({ filename: f.filename, originalname: f.originalname, url: `/uploads/global/${f.filename}`, size: f.size, mimetype: f.mimetype, global: true })) });
});

app.delete('/api/superadmin/media/:filename', authMiddleware(['superadmin']), (req, res) => {
    const fp = path.join(GLOBAL_UPLOADS_DIR, req.params.filename);
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ success: true }); }
    else res.status(404).json({ error: 'Nicht gefunden' });
});

// Tenant media: include global files
app.get('/api/uploads-list', authMiddleware(), resolveTenant, (req, res) => {
    try {
        const tenantDir = path.join(UPLOADS_DIR, req.tenantId);
        if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
        const tenantFiles = fs.readdirSync(tenantDir).filter(f => f !== '.gitkeep').map(f => {
            const s = fs.statSync(path.join(tenantDir, f));
            return { filename: f, url: `/uploads/${req.tenantId}/${f}`, size: s.size, modified: s.mtime, global: false };
        });
        const globalFiles = fs.readdirSync(GLOBAL_UPLOADS_DIR).filter(f => f !== '.gitkeep').map(f => {
            const s = fs.statSync(path.join(GLOBAL_UPLOADS_DIR, f));
            return { filename: f, url: `/uploads/global/${f}`, size: s.size, modified: s.mtime, global: true };
        });
        res.json({ success: true, uploads: [...tenantFiles, ...globalFiles] });
    } catch(e) { res.status(500).json({ success: false }); }
});


// ═══ GLOBAL DESIGNER TEMPLATES ═══

const GLOBAL_TEMPLATES_FILE = path.join(SUPERADMIN_DIR, 'global-designer-templates.json');

function loadGlobalDesignerTemplates() {
    try { if (fs.existsSync(GLOBAL_TEMPLATES_FILE)) return JSON.parse(fs.readFileSync(GLOBAL_TEMPLATES_FILE,'utf8')); }
    catch(e) {}
    return [];
}
function saveGlobalDesignerTemplates(templates) {
    fs.writeFileSync(GLOBAL_TEMPLATES_FILE, JSON.stringify(templates, null, 2));
}

// SuperAdmin: list/create/update/delete global designer templates
app.get('/api/superadmin/designer-templates', authMiddleware(['superadmin']), (req, res) => {
    res.json({ templates: loadGlobalDesignerTemplates() });
});
app.post('/api/superadmin/designer-templates', authMiddleware(['superadmin']), (req, res) => {
    const templates = loadGlobalDesignerTemplates();
    const t = { id: uuidv4(), name: req.body.name || 'Neue Vorlage', description: req.body.description || '',
        thumbnail: req.body.thumbnail || '', zones: req.body.zones || [], shapes: req.body.shapes || [],
        category: req.body.category || 'allgemein', createdAt: new Date().toISOString(), global: true };
    templates.push(t);
    saveGlobalDesignerTemplates(templates);
    res.json({ success: true, template: t });
});
app.put('/api/superadmin/designer-templates/:id', authMiddleware(['superadmin']), (req, res) => {
    const templates = loadGlobalDesignerTemplates();
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    templates[idx] = { ...templates[idx], ...req.body, id: req.params.id, global: true, updatedAt: new Date().toISOString() };
    saveGlobalDesignerTemplates(templates);
    res.json({ success: true, template: templates[idx] });
});
app.delete('/api/superadmin/designer-templates/:id', authMiddleware(['superadmin']), (req, res) => {
    const templates = loadGlobalDesignerTemplates();
    saveGlobalDesignerTemplates(templates.filter(t => t.id !== req.params.id));
    res.json({ success: true });
});

// Tenants: read global designer templates (read-only)
app.get('/api/global-designer-templates', authMiddleware(), (req, res) => {
    res.json({ templates: loadGlobalDesignerTemplates() });
});


// ═══ RSS PROXY with media extraction ═══
app.get('/api/rss-proxy', async (req, res) => {
    const feedUrl = req.query.url;
    if (!feedUrl) return res.status(400).json({ error: 'URL fehlt' });
    try {
        const { default: fetch } = await import('node-fetch');
        const r = await fetch(feedUrl, { headers: { 'User-Agent': 'SignageCMS/9.8 RSS Reader' }, timeout: 8000 });
        if (!r.ok) throw new Error('Feed nicht erreichbar: ' + r.status);
        const xml = await r.text();

        // Parse XML — simple regex-based parser (no external deps)
        const items = [];
        const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
        for (const m of itemMatches) {
            const chunk = m[1];
            const get   = (tag) => { const rx = new RegExp(`<${tag}[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/${tag}>|<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'); const r2 = rx.exec(chunk); return r2 ? (r2[1]||r2[2]||'').trim() : ''; };
            const attr  = (tag, a) => { const rx = new RegExp(`<${tag}[^>]*\s${a}=["']([^"']+)["']`, 'i'); const r2 = rx.exec(chunk); return r2 ? r2[1] : ''; };

            const title       = get('title');
            const description = get('description').replace(/<[^>]+>/g,'').substring(0,300);
            const link        = get('link') || attr('link','href');
            const pubDate     = get('pubDate') || get('dc:date') || '';
            const category    = get('category');

            // Image extraction: enclosure → media:content → media:thumbnail → og from description
            let imageUrl = '';
            const encType = attr('enclosure','type');
            if (encType?.startsWith('image')) imageUrl = attr('enclosure','url');
            if (!imageUrl) imageUrl = attr('media:content','url');
            if (!imageUrl) imageUrl = attr('media:thumbnail','url');
            if (!imageUrl) {
                const imgRx = /<img[^>]+src=["']([^"']+)["']/i.exec(get('description'));
                if (imgRx) imageUrl = imgRx[1];
            }

            // Video extraction
            let videoUrl = '';
            const encTypeV = attr('enclosure','type');
            if (encTypeV?.startsWith('video')) videoUrl = attr('enclosure','url');
            if (!videoUrl) { const mcType = attr('media:content','type'); if (mcType?.startsWith('video')) videoUrl = attr('media:content','url'); }

            if (title) items.push({ title, description, link, pubDate, category, imageUrl, videoUrl, hasMedia: !!(imageUrl||videoUrl) });
            if (items.length >= 20) break;
        }

        // Feed metadata
        const feedTitle = (/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title[^>]*>([^<]+)<\/title>/i.exec(xml)||[])[1]||'RSS Feed';

        res.json({ success: true, feed: { title: feedTitle, url: feedUrl }, items });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


// ═══ SuperAdmin: App Store global config ═══
const GLOBAL_APPS_FILE = path.join(SUPERADMIN_DIR, 'global-apps.json');
function loadGlobalApps() {
    try { if (fs.existsSync(GLOBAL_APPS_FILE)) return JSON.parse(fs.readFileSync(GLOBAL_APPS_FILE,'utf8')); } catch(e) {}
    return null; // null = use defaults
}
function saveGlobalApps(apps) { fs.writeFileSync(GLOBAL_APPS_FILE, JSON.stringify(apps,null,2)); }

app.get('/api/superadmin/app-store', authMiddleware(['superadmin']), (req, res) => {
    const custom = loadGlobalApps();
    res.json({ apps: custom || [], usingDefaults: !custom });
});
app.post('/api/superadmin/app-store', authMiddleware(['superadmin']), (req, res) => {
    saveGlobalApps(req.body.apps || []);
    res.json({ success: true });
});


app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '9.8', timestamp: new Date().toISOString() }));
app.get('/', (req, res) => res.redirect('/admin/'));

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

initSuperAdmin().then(() => {
    app.listen(PORT, () => {
        console.log('╔═══════════════════════════════════════════╗');
        console.log('║   DIGITAL SIGNAGE CMS v9.0 — SaaS        ║');
        console.log(`║   http://localhost:${PORT}/admin           ║`);
        console.log(`║   http://localhost:${PORT}/superadmin      ║`);
        console.log('╚═══════════════════════════════════════════╝');
    });
});

module.exports = app;
