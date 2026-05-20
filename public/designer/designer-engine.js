/**
 * DIGITAL SIGNAGE CMS v9.5 — DESIGNER ENGINE
 * Graphic elements: Rect, Circle, Line, Text, Image, Gradient, Shadow
 * Full property panel, snap-to-grid, z-index, undo/redo
 */
'use strict';

class DesignerEngine {
    constructor(canvasId, options = {}) {
        this.canvasEl    = document.getElementById(canvasId);
        this.canvas      = null; // SVG or div overlay
        this.zones       = [];   // zone layers (menu/media/ticker etc.)
        this.shapes      = [];   // graphic elements
        this.selected    = null;
        this.tool        = 'select';
        this.zoom        = 1;
        this.snapGrid    = options.snapGrid !== false;
        this.gridSize    = options.gridSize || 10;
        this.width       = options.width  || 1920;
        this.height      = options.height || 1080;
        this.history     = [];
        this.historyIdx  = -1;
        this.onChange    = options.onChange || (() => {});
        this.onSelect    = options.onSelect || (() => {});
        this.drawState   = null; // active drawing

        this._initCanvas();
        this._setupEvents();
    }

    // ─── CANVAS SETUP ────────────────────────────────────────────────
    _initCanvas() {
        const wrap = this.canvasEl.parentElement;
        const scaleX = (wrap.clientWidth  - 48) / this.width;
        const scaleY = (wrap.clientHeight - 48) / this.height;
        this.zoom = Math.min(scaleX, scaleY) * (this._currentZoom || 1);

        this.canvasEl.style.width  = this.width  + 'px';
        this.canvasEl.style.height = this.height + 'px';
        this.canvasEl.style.transform        = `scale(${this.zoom})`;
        this.canvasEl.style.transformOrigin  = 'top left';
        this.canvasEl.style.position         = 'relative';
        this.canvasEl.style.overflow         = 'hidden';

        // SVG overlay for shapes (sits on top of zone divs)
        let svg = this.canvasEl.querySelector('.designer-svg-overlay');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'designer-svg-overlay');
            svg.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:visible`;
            this.canvasEl.appendChild(svg);
        }
        this.svg = svg;

        this._updateInfoBar();
    }

    setZoom(delta) {
        this._currentZoom = Math.max(0.15, Math.min(2, (this._currentZoom || 1) + delta));
        this._initCanvas();
        this.renderShapes();
    }

    fitZoom() { this._currentZoom = 1; this._initCanvas(); this.renderShapes(); }

    _updateInfoBar() {
        const el = document.getElementById('canvasSize');
        if (el) el.textContent = `${this.width} × ${this.height} | ${Math.round(this.zoom * 100)}%`;
    }

    // ─── EVENTS ──────────────────────────────────────────────────────
    _setupEvents() {
        this.canvasEl.addEventListener('mousedown', e => this._onMouseDown(e));
        document.addEventListener('mousemove',  e => this._onMouseMove(e));
        document.addEventListener('mouseup',    e => this._onMouseUp(e));
        this.canvasEl.addEventListener('click', e => { if (e.target === this.canvasEl || e.target === this.svg) this.deselect(); });

        document.addEventListener('keydown', e => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selected && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    this.deleteSelected(); e.preventDefault();
                }
            }
            if (e.ctrlKey && e.key === 'z') { this.undo(); e.preventDefault(); }
            if (e.ctrlKey && e.key === 'y') { this.redo(); e.preventDefault(); }
            if (e.ctrlKey && e.key === 'd') { this.duplicateSelected(); e.preventDefault(); }
            // Arrow nudge
            if (this.selected && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
                const d = e.shiftKey ? 10 : 1;
                const s = this.selected;
                if (e.key === 'ArrowUp')    s.y -= d;
                if (e.key === 'ArrowDown')  s.y += d;
                if (e.key === 'ArrowLeft')  s.x -= d;
                if (e.key === 'ArrowRight') s.x += d;
                this.renderShapes(); this.onChange(); e.preventDefault();
            }
        });
    }

    _getCanvasPos(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        return {
            x: Math.round((e.clientX - rect.left) / this.zoom),
            y: Math.round((e.clientY - rect.top)  / this.zoom)
        };
    }

    _snap(val) { return this.snapGrid ? Math.round(val / this.gridSize) * this.gridSize : val; }

    _onMouseDown(e) {
        if (e.button !== 0) return;
        const pos = this._getCanvasPos(e);

        if (this.tool === 'select') return; // handled by shape click

        e.preventDefault();
        this.drawState = { startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, w: 0, h: 0, active: true };

        if (this.tool === 'line') {
            this.drawState.x2 = pos.x; this.drawState.y2 = pos.y;
        }
    }

    _onMouseMove(e) {
        if (!this.drawState?.active) return;
        const pos = this._getCanvasPos(e);
        const ds  = this.drawState;
        ds.x = this._snap(Math.min(ds.startX, pos.x));
        ds.y = this._snap(Math.min(ds.startY, pos.y));
        ds.w = this._snap(Math.abs(pos.x - ds.startX));
        ds.h = this._snap(Math.abs(pos.y - ds.startY));
        if (this.tool === 'line') { ds.x2 = this._snap(pos.x); ds.y2 = this._snap(pos.y); }
        this._renderPreview();
    }

    _onMouseUp(e) {
        if (!this.drawState?.active) return;
        const ds = this.drawState;
        this.drawState = null;
        this._clearPreview();

        const minSize = 4;
        if (this.tool !== 'line' && (ds.w < minSize || ds.h < minSize)) return;

        const shape = this._createShape(this.tool, ds);
        if (shape) {
            this.shapes.push(shape);
            this.saveHistory();
            this.renderShapes();
            this.select(shape.id);
            this.onChange();
        }
    }

    _renderPreview() {
        this._clearPreview();
        const ds  = this.drawState;
        const ns  = 'http://www.w3.org/2000/svg';
        let el;
        if (this.tool === 'rect') {
            el = document.createElementNS(ns, 'rect');
            el.setAttribute('x', ds.x); el.setAttribute('y', ds.y);
            el.setAttribute('width', ds.w); el.setAttribute('height', ds.h);
            el.setAttribute('fill', 'rgba(124,111,255,.15)');
            el.setAttribute('stroke', '#7c6fff'); el.setAttribute('stroke-width', '1');
            el.setAttribute('stroke-dasharray', '4 2');
        } else if (this.tool === 'circle') {
            el = document.createElementNS(ns, 'ellipse');
            el.setAttribute('cx', ds.x + ds.w/2); el.setAttribute('cy', ds.y + ds.h/2);
            el.setAttribute('rx', ds.w/2); el.setAttribute('ry', ds.h/2);
            el.setAttribute('fill', 'rgba(124,111,255,.15)');
            el.setAttribute('stroke', '#7c6fff'); el.setAttribute('stroke-width', '1');
            el.setAttribute('stroke-dasharray', '4 2');
        } else if (this.tool === 'line') {
            el = document.createElementNS(ns, 'line');
            el.setAttribute('x1', ds.startX); el.setAttribute('y1', ds.startY);
            el.setAttribute('x2', ds.x2); el.setAttribute('y2', ds.y2);
            el.setAttribute('stroke', '#7c6fff'); el.setAttribute('stroke-width', '2');
            el.setAttribute('stroke-dasharray', '6 3');
        }
        if (el) { el.setAttribute('class', 'draw-preview'); el.style.pointerEvents = 'none'; this.svg.appendChild(el); }
    }

    _clearPreview() { this.svg.querySelectorAll('.draw-preview').forEach(el => el.remove()); }

    // ─── SHAPE CREATION ──────────────────────────────────────────────
    _createShape(tool, ds) {
        const id = 'shape-' + Date.now();
        const base = { id, tool, x: ds.x, y: ds.y, opacity: 1, locked: false, zIndex: this.shapes.length };

        switch (tool) {
            case 'rect':
                return { ...base, w: ds.w, h: ds.h, fill: '#6c63ff', fillType: 'solid',
                    gradientStart: '#6c63ff', gradientEnd: '#22d3a4', gradientAngle: 135,
                    stroke: 'none', strokeWidth: 0, cornerRadius: 0,
                    shadow: false, shadowColor: 'rgba(0,0,0,.4)', shadowX: 4, shadowY: 4, shadowBlur: 12 };
            case 'circle':
                return { ...base, w: ds.w, h: ds.h, fill: '#22d3a4', fillType: 'solid',
                    gradientStart: '#22d3a4', gradientEnd: '#6c63ff', gradientAngle: 135,
                    stroke: 'none', strokeWidth: 0,
                    shadow: false, shadowColor: 'rgba(0,0,0,.4)', shadowX: 4, shadowY: 4, shadowBlur: 12 };
            case 'line':
                return { ...base, x: ds.startX, y: ds.startY, x2: ds.x2, y2: ds.y2,
                    stroke: '#ffffff', strokeWidth: 3, lineCap: 'round', strokeDash: 'none' };
            case 'text':
                return { ...base, x: ds.x, y: ds.y, w: Math.max(ds.w, 200), h: Math.max(ds.h, 60),
                    text: 'Text eingeben', fontSize: 48, fontWeight: '700', fontFamily: 'inherit',
                    textColor: '#ffffff', textAlign: 'center', textDecoration: 'none',
                    fill: 'transparent', stroke: 'none', strokeWidth: 0,
                    shadow: false, shadowColor: 'rgba(0,0,0,.6)', shadowX: 2, shadowY: 2, shadowBlur: 8 };
            case 'image':
                const imgSrc = prompt('Bild-URL eingeben:');
                if (!imgSrc) return null;
                return { ...base, w: ds.w || 300, h: ds.h || 200, src: imgSrc,
                    objectFit: 'cover', cornerRadius: 0,
                    shadow: false, shadowColor: 'rgba(0,0,0,.4)', shadowX: 4, shadowY: 4, shadowBlur: 12 };
        }
        return null;
    }

    // ─── RENDER SHAPES ───────────────────────────────────────────────
    renderShapes() {
        this.svg.innerHTML = '';

        // Defs for gradients + filters
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        this.svg.appendChild(defs);

        const sorted = [...this.shapes].sort((a, b) => (a.zIndex||0) - (b.zIndex||0));

        sorted.forEach(s => {
            const ns = 'http://www.w3.org/2000/svg';
            let fill = s.fill || 'transparent';
            let filterId = null;

            // Gradient
            if (s.fillType === 'gradient' && s.tool !== 'line' && s.tool !== 'text') {
                const gid = 'grad-' + s.id;
                const angle = s.gradientAngle || 135;
                const rad   = angle * Math.PI / 180;
                const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
                const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
                const lg  = document.createElementNS(ns, 'linearGradient');
                lg.setAttribute('id', gid);
                lg.setAttribute('x1', x1+'%'); lg.setAttribute('y1', y1+'%');
                lg.setAttribute('x2', x2+'%'); lg.setAttribute('y2', y2+'%');
                const s1 = document.createElementNS(ns, 'stop');
                s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', s.gradientStart || '#6c63ff');
                const s2 = document.createElementNS(ns, 'stop');
                s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', s.gradientEnd || '#22d3a4');
                lg.appendChild(s1); lg.appendChild(s2); defs.appendChild(lg);
                fill = `url(#${gid})`;
            }

            // Shadow filter
            if (s.shadow) {
                filterId = 'shadow-' + s.id;
                const f  = document.createElementNS(ns, 'filter');
                f.setAttribute('id', filterId);
                f.setAttribute('x', '-50%'); f.setAttribute('y', '-50%');
                f.setAttribute('width', '200%'); f.setAttribute('height', '200%');
                const fe = document.createElementNS(ns, 'feDropShadow');
                fe.setAttribute('dx', s.shadowX || 4);
                fe.setAttribute('dy', s.shadowY || 4);
                fe.setAttribute('stdDeviation', (s.shadowBlur || 12) / 2);
                fe.setAttribute('flood-color', s.shadowColor || 'rgba(0,0,0,.4)');
                f.appendChild(fe); defs.appendChild(f);
            }

            let el;
            const commonAttrs = (el) => {
                el.setAttribute('opacity', s.opacity ?? 1);
                if (filterId) el.setAttribute('filter', `url(#${filterId})`);
                el.setAttribute('data-shape-id', s.id);
                el.style.cursor = s.locked ? 'default' : 'move';
                el.style.pointerEvents = 'all';
                el.addEventListener('click', e => { e.stopPropagation(); this.select(s.id); });
                el.addEventListener('mousedown', e => { if (!s.locked) this._startShapeDrag(e, s); });
            };

            if (s.tool === 'rect') {
                el = document.createElementNS(ns, 'rect');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                el.setAttribute('fill', fill);
                if (s.stroke && s.stroke !== 'none') { el.setAttribute('stroke', s.stroke); el.setAttribute('stroke-width', s.strokeWidth||1); }
                if (s.cornerRadius) el.setAttribute('rx', s.cornerRadius);
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
                el.setAttribute('stroke', s.stroke||'#ffffff');
                el.setAttribute('stroke-width', s.strokeWidth||2);
                el.setAttribute('stroke-linecap', s.lineCap||'round');
                if (s.strokeDash === 'dashed') el.setAttribute('stroke-dasharray', '12 6');
                else if (s.strokeDash === 'dotted') el.setAttribute('stroke-dasharray', '2 6');
            } else if (s.tool === 'text') {
                // Use foreignObject for HTML text rendering
                el = document.createElementNS(ns, 'foreignObject');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                const div = document.createElement('div');
                div.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:${s.textAlign==='center'?'center':s.textAlign==='right'?'flex-end':'flex-start'};
                    font-size:${s.fontSize||48}px;font-weight:${s.fontWeight||'700'};font-family:${s.fontFamily||'inherit'};
                    color:${s.textColor||'#fff'};text-align:${s.textAlign||'center'};
                    text-decoration:${s.textDecoration||'none'};line-height:1.2;padding:8px;
                    ${s.shadow?`text-shadow:${s.shadowX||2}px ${s.shadowY||2}px ${s.shadowBlur||8}px ${s.shadowColor||'rgba(0,0,0,.6)'}`:''};
                    white-space:pre-wrap;word-break:break-word;`;
                div.textContent = s.text || 'Text';
                div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                el.appendChild(div);
            } else if (s.tool === 'image') {
                const g = document.createElementNS(ns, 'g');
                if (s.cornerRadius) {
                    // Clip path for rounded images
                    const clipId = 'clip-' + s.id;
                    const clipPath = document.createElementNS(ns, 'clipPath');
                    clipPath.setAttribute('id', clipId);
                    const rect = document.createElementNS(ns, 'rect');
                    rect.setAttribute('x', s.x); rect.setAttribute('y', s.y);
                    rect.setAttribute('width', s.w); rect.setAttribute('height', s.h);
                    rect.setAttribute('rx', s.cornerRadius);
                    clipPath.appendChild(rect); defs.appendChild(clipPath);
                    g.setAttribute('clip-path', `url(#${clipId})`);
                }
                el = document.createElementNS(ns, 'image');
                el.setAttribute('x', s.x); el.setAttribute('y', s.y);
                el.setAttribute('width', s.w); el.setAttribute('height', s.h);
                el.setAttribute('href', s.src);
                el.setAttribute('preserveAspectRatio', s.objectFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice');
                g.appendChild(el);
                commonAttrs(g);
                if (filterId) g.setAttribute('filter', `url(#${filterId})`);
                this.svg.appendChild(g);
                // Selection ring
                if (this.selected === s.id) this._drawSelectionRing(s);
                return;
            }

            if (el) {
                commonAttrs(el);
                this.svg.appendChild(el);
                // Selection ring
                if (this.selected === s.id) this._drawSelectionRing(s);
                // Resize handle
                if (this.selected === s.id && !s.locked) this._drawResizeHandle(s);
            }
        });
    }

    _drawSelectionRing(s) {
        const ns = 'http://www.w3.org/2000/svg';
        const x = s.x, y = s.y;
        const w = s.tool === 'line' ? Math.abs((s.x2||s.x) - s.x) : s.w;
        const h = s.tool === 'line' ? Math.abs((s.y2||s.y) - s.y) : s.h;
        const ring = document.createElementNS(ns, 'rect');
        ring.setAttribute('x', Math.min(x, s.x2||x) - 2);
        ring.setAttribute('y', Math.min(y, s.y2||y) - 2);
        ring.setAttribute('width',  (s.tool === 'line' ? w : s.w) + 4);
        ring.setAttribute('height', (s.tool === 'line' ? h : s.h) + 4);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#7c6fff');
        ring.setAttribute('stroke-width', '1.5');
        ring.setAttribute('stroke-dasharray', '5 3');
        ring.style.pointerEvents = 'none';
        this.svg.appendChild(ring);
    }

    _drawResizeHandle(s) {
        if (s.tool === 'line') return;
        const ns = 'http://www.w3.org/2000/svg';
        const handles = [
            [s.x + s.w - 5, s.y + s.h - 5, 'se'],
            [s.x + s.w/2 - 4, s.y - 4, 'n'],
            [s.x + s.w/2 - 4, s.y + s.h - 4, 's'],
            [s.x - 4, s.y + s.h/2 - 4, 'w'],
            [s.x + s.w - 4, s.y + s.h/2 - 4, 'e'],
        ];
        handles.forEach(([hx, hy, dir]) => {
            const h = document.createElementNS(ns, 'rect');
            h.setAttribute('x', hx); h.setAttribute('y', hy);
            h.setAttribute('width', 8); h.setAttribute('height', 8);
            h.setAttribute('fill', '#fff'); h.setAttribute('stroke', '#7c6fff'); h.setAttribute('stroke-width', '1.5');
            h.setAttribute('rx', '1');
            h.style.cursor = dir + '-resize';
            h.style.pointerEvents = 'all';
            h.addEventListener('mousedown', e => { e.stopPropagation(); this._startResize(e, s, dir); });
            this.svg.appendChild(h);
        });
    }

    // ─── DRAG & RESIZE ───────────────────────────────────────────────
    _startShapeDrag(e, shape) {
        if (e.target.closest('[class*="handle"]')) return;
        e.preventDefault(); e.stopPropagation();
        this.select(shape.id);
        const start = this._getCanvasPos(e);
        const ox = shape.x, oy = shape.y;
        const ox2 = shape.x2, oy2 = shape.y2;
        const onMove = e => {
            const pos = this._getCanvasPos(e);
            const dx = this._snap(pos.x - start.x), dy = this._snap(pos.y - start.y);
            shape.x = ox + dx; shape.y = oy + dy;
            if (shape.tool === 'line') { shape.x2 = ox2 + dx; shape.y2 = oy2 + dy; }
            this.renderShapes(); this.onChange();
        };
        const onUp = () => { this.saveHistory(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _startResize(e, shape, dir) {
        e.preventDefault(); e.stopPropagation();
        const start  = this._getCanvasPos(e);
        const ox = shape.x, oy = shape.y, ow = shape.w, oh = shape.h;
        const onMove = e => {
            const pos = this._getCanvasPos(e);
            const dx = this._snap(pos.x - start.x), dy = this._snap(pos.y - start.y);
            if (dir.includes('e')) shape.w = Math.max(10, ow + dx);
            if (dir.includes('s')) shape.h = Math.max(10, oh + dy);
            if (dir.includes('w')) { shape.x = Math.min(ox + ow - 10, ox + dx); shape.w = Math.max(10, ow - dx); }
            if (dir.includes('n')) { shape.y = Math.min(oy + oh - 10, oy + dy); shape.h = Math.max(10, oh - dy); }
            this.renderShapes(); this.onChange();
        };
        const onUp = () => { this.saveHistory(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ─── SELECTION ───────────────────────────────────────────────────
    select(id) {
        this.selected = id;
        const shape = this.shapes.find(s => s.id === id);
        this.renderShapes();
        this.onSelect(shape);
    }

    deselect() {
        this.selected = null;
        this.renderShapes();
        this.onSelect(null);
    }

    // ─── ACTIONS ─────────────────────────────────────────────────────
    deleteSelected() {
        if (!this.selected) return;
        this.shapes = this.shapes.filter(s => s.id !== this.selected);
        this.selected = null;
        this.saveHistory(); this.renderShapes(); this.onChange(); this.onSelect(null);
    }

    duplicateSelected() {
        const s = this.shapes.find(s => s.id === this.selected);
        if (!s) return;
        const copy = JSON.parse(JSON.stringify(s));
        copy.id = 'shape-' + Date.now();
        copy.x += 20; copy.y += 20;
        copy.zIndex = this.shapes.length;
        this.shapes.push(copy);
        this.saveHistory(); this.renderShapes(); this.select(copy.id); this.onChange();
    }

    bringForward() {
        const s = this.shapes.find(x => x.id === this.selected);
        if (!s) return;
        const above = this.shapes.filter(x => x.zIndex > s.zIndex);
        if (above.length) { const next = above.reduce((a,b) => a.zIndex < b.zIndex ? a : b); [s.zIndex, next.zIndex] = [next.zIndex, s.zIndex]; }
        this.renderShapes(); this.onChange();
    }

    sendBackward() {
        const s = this.shapes.find(x => x.id === this.selected);
        if (!s) return;
        const below = this.shapes.filter(x => x.zIndex < s.zIndex);
        if (below.length) { const prev = below.reduce((a,b) => a.zIndex > b.zIndex ? a : b); [s.zIndex, prev.zIndex] = [prev.zIndex, s.zIndex]; }
        this.renderShapes(); this.onChange();
    }

    lockToggle() {
        const s = this.shapes.find(x => x.id === this.selected);
        if (s) { s.locked = !s.locked; this.renderShapes(); this.onChange(); }
    }

    updateShape(id, props) {
        const s = this.shapes.find(x => x.id === id);
        if (!s) return;
        Object.assign(s, props);
        this.renderShapes(); this.onChange();
    }

    // ─── TOOLS ───────────────────────────────────────────────────────
    setTool(tool) {
        this.tool = tool;
        this.canvasEl.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }

    // ─── HISTORY ─────────────────────────────────────────────────────
    saveHistory() {
        this.history = this.history.slice(0, this.historyIdx + 1);
        this.history.push(JSON.parse(JSON.stringify(this.shapes)));
        this.historyIdx = this.history.length - 1;
        if (this.history.length > 50) { this.history.shift(); this.historyIdx--; }
    }

    undo() {
        if (this.historyIdx <= 0) return;
        this.historyIdx--;
        this.shapes = JSON.parse(JSON.stringify(this.history[this.historyIdx]));
        this.selected = null; this.renderShapes(); this.onChange(); this.onSelect(null);
    }

    redo() {
        if (this.historyIdx >= this.history.length - 1) return;
        this.historyIdx++;
        this.shapes = JSON.parse(JSON.stringify(this.history[this.historyIdx]));
        this.selected = null; this.renderShapes(); this.onChange(); this.onSelect(null);
    }

    // ─── IMPORT / EXPORT ─────────────────────────────────────────────
    getShapes() { return JSON.parse(JSON.stringify(this.shapes)); }

    loadShapes(shapes) {
        this.shapes = JSON.parse(JSON.stringify(shapes || []));
        this.saveHistory();
        this.renderShapes();
    }

    exportSVG() {
        const svgEl  = this.svg.cloneNode(true);
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgEl.setAttribute('width',  this.width);
        svgEl.setAttribute('height', this.height);
        svgEl.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
        svgEl.querySelectorAll('[data-shape-id]').forEach(el => el.removeAttribute('data-shape-id'));
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgEl.outerHTML;
    }

    exportPNG(callback) {
        const svgStr = this.exportSVG();
        const blob   = new Blob([svgStr], {type:'image/svg+xml'});
        const url    = URL.createObjectURL(blob);
        const img    = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = this.width;
            canvas.height = this.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            callback(canvas.toDataURL('image/png'));
        };
        img.src = url;
    }
}

window.DesignerEngine = DesignerEngine;
