/**
 * DESIGNER PROPERTY PANEL v9.5
 * Dynamic property editor for selected shape
 */
'use strict';

class PropertyPanel {
    constructor(containerId, engine) {
        this.container = document.getElementById(containerId);
        this.engine    = engine;
        this.shapeId   = null;
    }

    render(shape) {
        if (!this.container) return;
        this.shapeId = shape?.id || null;

        if (!shape) {
            this.container.innerHTML = '<p class="no-selection">Kein Element ausgewählt.<br><small>Klicke ein Element an oder zeichne ein neues.</small></p>';
            return;
        }

        const tool = shape.tool;
        this.container.innerHTML = `
        <div class="prop-section">
            <div class="prop-label">Element: <strong>${{rect:'Rechteck',circle:'Kreis',line:'Linie',text:'Text',image:'Bild'}[tool]||tool}</strong>
                ${shape.locked ? '<span style="color:var(--amber);font-size:10px;margin-left:6px">🔒 Gesperrt</span>' : ''}
            </div>
        </div>

        ${tool !== 'line' && tool !== 'image' ? `
        <div class="prop-section">
            <div class="prop-label">Position & Größe</div>
            <div class="prop-row-4">
                <div class="prop-group"><label>X</label><input type="number" id="pp-x" value="${Math.round(shape.x)}" onchange="pp.update({x:+this.value})"></div>
                <div class="prop-group"><label>Y</label><input type="number" id="pp-y" value="${Math.round(shape.y)}" onchange="pp.update({y:+this.value})"></div>
                <div class="prop-group"><label>B</label><input type="number" id="pp-w" value="${Math.round(shape.w||0)}" onchange="pp.update({w:+this.value})"></div>
                <div class="prop-group"><label>H</label><input type="number" id="pp-h" value="${Math.round(shape.h||0)}" onchange="pp.update({h:+this.value})"></div>
            </div>
        </div>` : ''}

        <div class="prop-section">
            <div class="prop-label">Darstellung</div>
            <div class="prop-row-2">
                <div class="prop-group"><label>Deckkraft</label>
                    <input type="range" min="0" max="1" step="0.01" value="${shape.opacity??1}" oninput="pp.update({opacity:+this.value});document.getElementById('pp-opacity-val').textContent=Math.round(this.value*100)+'%'">
                    <span id="pp-opacity-val">${Math.round((shape.opacity??1)*100)}%</span>
                </div>
            </div>
        </div>

        ${tool === 'text' ? this._textProps(shape) : ''}
        ${tool === 'rect' || tool === 'circle' ? this._fillProps(shape) : ''}
        ${tool === 'line' ? this._lineProps(shape) : ''}
        ${tool === 'image' ? this._imageProps(shape) : ''}
        ${tool !== 'line' ? this._shadowProps(shape) : ''}
        ${tool === 'rect' ? this._cornerProps(shape) : ''}

        <div class="prop-section">
            <div class="prop-label">Reihenfolge</div>
            <div class="prop-row-2">
                <button class="prop-btn" onclick="window.designerEngine.bringForward()"><i class="fas fa-arrow-up"></i> Nach vorne</button>
                <button class="prop-btn" onclick="window.designerEngine.sendBackward()"><i class="fas fa-arrow-down"></i> Nach hinten</button>
            </div>
            <div class="prop-row-2" style="margin-top:6px">
                <button class="prop-btn" onclick="window.designerEngine.lockToggle()"><i class="fas fa-${shape.locked?'lock-open':'lock'}"></i> ${shape.locked?'Entsperren':'Sperren'}</button>
                <button class="prop-btn" onclick="window.designerEngine.duplicateSelected()"><i class="fas fa-copy"></i> Duplizieren</button>
            </div>
            <button class="prop-btn prop-btn-danger" style="margin-top:6px;width:100%" onclick="window.designerEngine.deleteSelected()"><i class="fas fa-trash"></i> Löschen</button>
        </div>

        <div class="prop-section">
            <div class="prop-label">Export</div>
            <button class="prop-btn" style="width:100%" onclick="pp.exportSVG()"><i class="fas fa-download"></i> Als SVG exportieren</button>
        </div>`;
    }

    _textProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Text</div>
            <div class="prop-group"><label>Inhalt</label>
                <textarea rows="2" style="font-size:12px;resize:vertical" onchange="pp.update({text:this.value})">${s.text||''}</textarea>
            </div>
            <div class="prop-row-2">
                <div class="prop-group"><label>Größe</label><input type="number" value="${s.fontSize||48}" onchange="pp.update({fontSize:+this.value})"></div>
                <div class="prop-group"><label>Gewicht</label>
                    <select onchange="pp.update({fontWeight:this.value})">
                        <option value="300" ${s.fontWeight==='300'?'selected':''}>Light</option>
                        <option value="400" ${s.fontWeight==='400'?'selected':''}>Normal</option>
                        <option value="600" ${s.fontWeight==='600'?'selected':''}>Semi-Bold</option>
                        <option value="700" ${!s.fontWeight||s.fontWeight==='700'?'selected':''}>Bold</option>
                        <option value="900" ${s.fontWeight==='900'?'selected':''}>Black</option>
                    </select>
                </div>
            </div>
            <div class="prop-row-2">
                <div class="prop-group"><label>Farbe</label><input type="color" value="${s.textColor||'#ffffff'}" onchange="pp.update({textColor:this.value})"></div>
                <div class="prop-group"><label>Ausrichtung</label>
                    <select onchange="pp.update({textAlign:this.value})">
                        <option value="left" ${s.textAlign==='left'?'selected':''}>Links</option>
                        <option value="center" ${(!s.textAlign||s.textAlign==='center')?'selected':''}>Mitte</option>
                        <option value="right" ${s.textAlign==='right'?'selected':''}>Rechts</option>
                    </select>
                </div>
            </div>
            <div class="prop-group"><label>Hintergrund</label><input type="color" value="${s.fill&&s.fill!=='transparent'?s.fill:'#000000'}" onchange="pp.update({fill:this.value})">
                <label style="margin-top:4px;display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" ${s.fill==='transparent'?'checked':''} onchange="pp.update({fill:this.checked?'transparent':document.querySelector('#pp-textbg').value})" id="pp-tbg-none"> Transparent</label>
            </div>
        </div>`;
    }

    _fillProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Füllung</div>
            <div class="prop-group">
                <label>Typ</label>
                <select onchange="pp.update({fillType:this.value});pp.refresh()">
                    <option value="solid" ${(!s.fillType||s.fillType==='solid')?'selected':''}>Einfarbig</option>
                    <option value="gradient" ${s.fillType==='gradient'?'selected':''}>Verlauf</option>
                    <option value="none" ${s.fillType==='none'?'selected':''}>Keine</option>
                </select>
            </div>
            ${s.fillType !== 'none' ? (s.fillType === 'gradient' ? `
            <div class="prop-row-2">
                <div class="prop-group"><label>Farbe 1</label><input type="color" value="${s.gradientStart||'#6c63ff'}" onchange="pp.update({gradientStart:this.value})"></div>
                <div class="prop-group"><label>Farbe 2</label><input type="color" value="${s.gradientEnd||'#22d3a4'}" onchange="pp.update({gradientEnd:this.value})"></div>
            </div>
            <div class="prop-group"><label>Winkel: <span id="pp-grad-angle-val">${s.gradientAngle||135}°</span></label>
                <input type="range" min="0" max="360" value="${s.gradientAngle||135}" oninput="pp.update({gradientAngle:+this.value});document.getElementById('pp-grad-angle-val').textContent=this.value+'°'">
            </div>` : `
            <div class="prop-group"><label>Farbe</label><input type="color" value="${s.fill||'#6c63ff'}" onchange="pp.update({fill:this.value})"></div>`) : ''}

            <div class="prop-row-2">
                <div class="prop-group"><label>Rahmen</label>
                    <select onchange="pp.update({stroke:this.value})">
                        <option value="none" ${(!s.stroke||s.stroke==='none')?'selected':''}>Kein</option>
                        <option value="#ffffff" ${s.stroke==='#ffffff'?'selected':''}>Weiß</option>
                        <option value="#000000" ${s.stroke==='#000000'?'selected':''}>Schwarz</option>
                        <option value="custom" ${s.stroke&&s.stroke!=='none'&&s.stroke!=='#ffffff'&&s.stroke!=='#000000'?'selected':''}>Custom</option>
                    </select>
                </div>
                <div class="prop-group"><label>Stärke</label><input type="number" min="0" max="20" value="${s.strokeWidth||0}" onchange="pp.update({strokeWidth:+this.value})"></div>
            </div>
            ${s.stroke && s.stroke !== 'none' && s.stroke !== '#ffffff' && s.stroke !== '#000000' ? `<div class="prop-group"><label>Rahmenfarbe</label><input type="color" value="${s.stroke}" onchange="pp.update({stroke:this.value})"></div>` : ''}
        </div>`;
    }

    _lineProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Linie</div>
            <div class="prop-row-2">
                <div class="prop-group"><label>Farbe</label><input type="color" value="${s.stroke||'#ffffff'}" onchange="pp.update({stroke:this.value})"></div>
                <div class="prop-group"><label>Stärke</label><input type="number" min="1" max="30" value="${s.strokeWidth||3}" onchange="pp.update({strokeWidth:+this.value})"></div>
            </div>
            <div class="prop-group"><label>Stil</label>
                <select onchange="pp.update({strokeDash:this.value})">
                    <option value="none" ${(!s.strokeDash||s.strokeDash==='none')?'selected':''}>Durchgehend</option>
                    <option value="dashed" ${s.strokeDash==='dashed'?'selected':''}>Gestrichelt</option>
                    <option value="dotted" ${s.strokeDash==='dotted'?'selected':''}>Gepunktet</option>
                </select>
            </div>
        </div>`;
    }

    _imageProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Bild</div>
            <div class="prop-group"><label>URL</label><input type="text" value="${s.src||''}" onchange="pp.update({src:this.value})"></div>
            <div class="prop-row-2">
                <div class="prop-group"><label>X</label><input type="number" value="${Math.round(s.x)}" onchange="pp.update({x:+this.value})"></div>
                <div class="prop-group"><label>Y</label><input type="number" value="${Math.round(s.y)}" onchange="pp.update({y:+this.value})"></div>
            </div>
            <div class="prop-row-2">
                <div class="prop-group"><label>Breite</label><input type="number" value="${Math.round(s.w||300)}" onchange="pp.update({w:+this.value})"></div>
                <div class="prop-group"><label>Höhe</label><input type="number" value="${Math.round(s.h||200)}" onchange="pp.update({h:+this.value})"></div>
            </div>
            <div class="prop-group"><label>Skalierung</label>
                <select onchange="pp.update({objectFit:this.value})">
                    <option value="cover" ${(!s.objectFit||s.objectFit==='cover')?'selected':''}>Cover (füllen)</option>
                    <option value="contain" ${s.objectFit==='contain'?'selected':''}>Contain (einpassen)</option>
                </select>
            </div>
            <div class="prop-group"><label>Eckenradius</label><input type="number" min="0" value="${s.cornerRadius||0}" onchange="pp.update({cornerRadius:+this.value})"></div>
        </div>`;
    }

    _shadowProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Schatten</div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
                <input type="checkbox" ${s.shadow?'checked':''} onchange="pp.update({shadow:this.checked});pp.refresh()"> Schatten aktivieren
            </label>
            ${s.shadow ? `
            <div class="prop-row-2" style="margin-top:8px">
                <div class="prop-group"><label>X-Offset</label><input type="number" value="${s.shadowX||4}" onchange="pp.update({shadowX:+this.value})"></div>
                <div class="prop-group"><label>Y-Offset</label><input type="number" value="${s.shadowY||4}" onchange="pp.update({shadowY:+this.value})"></div>
            </div>
            <div class="prop-group"><label>Weichheit</label><input type="number" min="0" max="50" value="${s.shadowBlur||12}" onchange="pp.update({shadowBlur:+this.value})"></div>
            <div class="prop-group"><label>Farbe</label><input type="color" value="#000000" onchange="pp.update({shadowColor:this.value})"></div>` : ''}
        </div>`;
    }

    _cornerProps(s) {
        return `<div class="prop-section">
            <div class="prop-label">Ecken</div>
            <div class="prop-group"><label>Radius</label><input type="number" min="0" max="500" value="${s.cornerRadius||0}" onchange="pp.update({cornerRadius:+this.value})"></div>
        </div>`;
    }

    update(props) {
        if (!this.shapeId) return;
        this.engine.updateShape(this.shapeId, props);
    }

    refresh() {
        const shape = this.engine.shapes.find(s => s.id === this.shapeId);
        this.render(shape);
    }

    exportSVG() {
        const svg  = this.engine.exportSVG();
        const blob = new Blob([svg], {type:'image/svg+xml'});
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'design-export.svg';
        a.click();
    }
}

window.PropertyPanel = PropertyPanel;

// ═══ v9.8: menubox + rssfield property panels ═══

const _origRender = PropertyPanel.prototype.render;
PropertyPanel.prototype.render = function(shape) {
    if (!shape) { _origRender.call(this, shape); return; }
    if (shape.tool === 'menubox')  { this._renderMenuboxPanel(shape); return; }
    if (shape.tool === 'rssfield') { this._renderRssFieldPanel(shape); return; }
    _origRender.call(this, shape);
};

PropertyPanel.prototype._renderMenuboxPanel = function(s) {
    if (!this.container) return;
    this.shapeId = s.id;
    this.container.innerHTML = `
    <div class="prop-section">
        <div class="prop-label">Menübox — Produkt</div>
        <div class="prop-group">
            <label>Produkt auswählen</label>
            <select id="pp-product-select" onchange="pp._onProductSelect(this.value)">
                <option value="">– Produkt wählen –</option>
                ${(window._designerProducts||[]).map(p => `<option value="${p.id}" ${String(s.productId)===String(p.id)?'selected':''}>${p.title} (${p.price})</option>`).join('')}
            </select>
        </div>
    </div>
    <div class="prop-section">
        <div class="prop-label">Sichtbare Felder</div>
        <label class="toggle-row"><input type="checkbox" ${s.showImage?'checked':''} onchange="pp.update({showImage:this.checked})"> Bild</label>
        <label class="toggle-row"><input type="checkbox" ${s.showTitle?'checked':''} onchange="pp.update({showTitle:this.checked})"> Titel</label>
        <label class="toggle-row"><input type="checkbox" ${s.showPrice?'checked':''} onchange="pp.update({showPrice:this.checked})"> Preis</label>
        <label class="toggle-row"><input type="checkbox" ${s.showBadge?'checked':''} onchange="pp.update({showBadge:this.checked})"> Badge</label>
        <label class="toggle-row"><input type="checkbox" ${s.showDescription?'checked':''} onchange="pp.update({showDescription:this.checked})"> Beschreibung</label>
    </div>
    <div class="prop-section">
        <div class="prop-label">Stil</div>
        <div class="prop-group"><label>Preis-Stil</label>
            <select onchange="pp.update({priceStyle:this.value})">
                <option value="badge-gold" ${s.priceStyle==='badge-gold'?'selected':''}>Gold Badge</option>
                <option value="badge-dark" ${s.priceStyle==='badge-dark'?'selected':''}>Dark Badge</option>
                <option value="text-plain" ${s.priceStyle==='text-plain'?'selected':''}>Text</option>
                <option value="text-bold"  ${s.priceStyle==='text-bold'?'selected':''}>Fett</option>
            </select>
        </div>
        <div class="prop-row-2">
            <div class="prop-group"><label>Hintergrund</label><input type="color" value="${s.cardBg||'#141420'}" onchange="pp.update({cardBg:this.value})"></div>
            <div class="prop-group"><label>Rahmen</label><input type="color" value="${s.cardBorder||'#2a2a3a'}" onchange="pp.update({cardBorder:this.value})"></div>
        </div>
        <div class="prop-row-2">
            <div class="prop-group"><label>Textfarbe</label><input type="color" value="${s.textColor||'#ffffff'}" onchange="pp.update({textColor:this.value})"></div>
            <div class="prop-group"><label>Schriftgr.</label><input type="number" value="${s.fontSize||16}" onchange="pp.update({fontSize:+this.value})"></div>
        </div>
        <div class="prop-group"><label>Eckenradius</label><input type="number" min="0" value="${s.cornerRadius||10}" onchange="pp.update({cornerRadius:+this.value})"></div>
    </div>
    <div class="prop-section">
        <div class="prop-label">Währung</div>
        <div class="prop-row-2">
            <div class="prop-group"><label>Symbol</label><input type="text" value="${s.currency||'€'}" maxlength="5" onchange="pp.update({currency:this.value})"></div>
            <div class="prop-group"><label>Position</label>
                <select onchange="pp.update({currencyPos:this.value})">
                    <option value="after"  ${s.currencyPos==='after'?'selected':''}>9.90 €</option>
                    <option value="before" ${s.currencyPos==='before'?'selected':''}>€ 9.90</option>
                </select>
            </div>
        </div>
    </div>
    <div class="prop-section">
        <div class="prop-label">Position & Größe</div>
        <div class="prop-row-4">
            <div class="prop-group"><label>X</label><input type="number" value="${Math.round(s.x)}" onchange="pp.update({x:+this.value})"></div>
            <div class="prop-group"><label>Y</label><input type="number" value="${Math.round(s.y)}" onchange="pp.update({y:+this.value})"></div>
            <div class="prop-group"><label>B</label><input type="number" value="${Math.round(s.w)}" onchange="pp.update({w:+this.value})"></div>
            <div class="prop-group"><label>H</label><input type="number" value="${Math.round(s.h)}" onchange="pp.update({h:+this.value})"></div>
        </div>
        <div class="prop-group"><label>Deckkraft</label><input type="range" min="0" max="1" step="0.01" value="${s.opacity??1}" oninput="pp.update({opacity:+this.value})"></div>
    </div>
    <div class="prop-section">
        <button class="prop-btn" onclick="window.designerEngine.duplicateSelected()"><i class="fas fa-copy"></i> Duplizieren</button>
        <button class="prop-btn prop-btn-danger" style="margin-top:6px" onclick="window.designerEngine.deleteSelected()"><i class="fas fa-trash"></i> Löschen</button>
    </div>`;
};

PropertyPanel.prototype._onProductSelect = function(productId) {
    const product = (window._designerProducts||[]).find(p => String(p.id) === String(productId));
    this.update({ productId: product?.id || null, productData: product || null });
    this.refresh();
};

PropertyPanel.prototype._renderRssFieldPanel = function(s) {
    if (!this.container) return;
    this.shapeId = s.id;
    this.container.innerHTML = `
    <div class="prop-section">
        <div class="prop-label">RSS-Feld — Datenquelle</div>
        <div class="prop-group"><label>Feed-URL</label>
            <input type="text" value="${s.feedUrl||''}" placeholder="https://feeds.example.com/rss" onchange="pp.update({feedUrl:this.value})">
        </div>
        <div class="prop-group"><label>Angezeigtes Feld</label>
            <select onchange="pp.update({field:this.value});pp.refresh()">
                <option value="title"       ${s.field==='title'?'selected':''}>📰 Überschrift</option>
                <option value="description" ${s.field==='description'?'selected':''}>📝 Beschreibung</option>
                <option value="image"       ${s.field==='image'?'selected':''}>🖼️ Bild</option>
                <option value="video"       ${s.field==='video'?'selected':''}>🎬 Video</option>
            </select>
        </div>
        <div class="prop-group"><label>Artikel-Index (0 = neuester)</label>
            <input type="number" min="0" max="19" value="${s.itemIndex||0}" onchange="pp.update({itemIndex:+this.value})">
        </div>
        <div class="prop-group"><label>Auto-Scroll (Sek. pro Artikel)</label>
            <input type="number" min="0" max="60" value="${s.scrollInterval||8}" placeholder="0 = deaktiviert" onchange="pp.update({scrollInterval:+this.value, autoScroll:this.value>0})">
        </div>
    </div>
    ${s.field !== 'image' && s.field !== 'video' ? `
    <div class="prop-section">
        <div class="prop-label">Text-Stil</div>
        <div class="prop-row-2">
            <div class="prop-group"><label>Größe</label><input type="number" value="${s.fontSize||16}" onchange="pp.update({fontSize:+this.value})"></div>
            <div class="prop-group"><label>Gewicht</label>
                <select onchange="pp.update({fontWeight:this.value})">
                    <option value="400" ${s.fontWeight==='400'?'selected':''}>Normal</option>
                    <option value="600" ${s.fontWeight==='600'?'selected':''}>Semi-Bold</option>
                    <option value="700" ${s.fontWeight==='700'?'selected':''}>Bold</option>
                </select>
            </div>
        </div>
        <div class="prop-row-2">
            <div class="prop-group"><label>Farbe</label><input type="color" value="${s.textColor||'#ffffff'}" onchange="pp.update({textColor:this.value})"></div>
            <div class="prop-group"><label>Ausrichtung</label>
                <select onchange="pp.update({textAlign:this.value})">
                    <option value="left"   ${s.textAlign==='left'?'selected':''}>Links</option>
                    <option value="center" ${s.textAlign==='center'?'selected':''}>Mitte</option>
                    <option value="right"  ${s.textAlign==='right'?'selected':''}>Rechts</option>
                </select>
            </div>
        </div>
        <div class="prop-group"><label>Max. Zeilen</label><input type="number" min="1" max="10" value="${s.maxLines||3}" onchange="pp.update({maxLines:+this.value})"></div>
        <div class="prop-group"><label>Hintergrund</label><input type="color" value="${s.fill&&s.fill!=='transparent'?s.fill:'#141420'}" onchange="pp.update({fill:this.value})"></div>
    </div>` : `
    <div class="prop-section">
        <div class="prop-label">Bild-Stil</div>
        <div class="prop-group"><label>Skalierung</label>
            <select onchange="pp.update({objectFit:this.value})">
                <option value="cover"   ${s.objectFit==='cover'?'selected':''}>Cover</option>
                <option value="contain" ${s.objectFit==='contain'?'selected':''}>Contain</option>
            </select>
        </div>
        <div class="prop-group"><label>Eckenradius</label><input type="number" min="0" value="${s.cornerRadius||0}" onchange="pp.update({cornerRadius:+this.value})"></div>
    </div>`}
    <div class="prop-section">
        <div class="prop-label">Position & Größe</div>
        <div class="prop-row-4">
            <div class="prop-group"><label>X</label><input type="number" value="${Math.round(s.x)}" onchange="pp.update({x:+this.value})"></div>
            <div class="prop-group"><label>Y</label><input type="number" value="${Math.round(s.y)}" onchange="pp.update({y:+this.value})"></div>
            <div class="prop-group"><label>B</label><input type="number" value="${Math.round(s.w)}" onchange="pp.update({w:+this.value})"></div>
            <div class="prop-group"><label>H</label><input type="number" value="${Math.round(s.h)}" onchange="pp.update({h:+this.value})"></div>
        </div>
        <div class="prop-group"><label>Deckkraft</label><input type="range" min="0" max="1" step="0.01" value="${s.opacity??1}" oninput="pp.update({opacity:+this.value})"></div>
    </div>
    <div class="prop-section">
        <button class="prop-btn" onclick="window.designerEngine.duplicateSelected()"><i class="fas fa-copy"></i> Duplizieren</button>
        <button class="prop-btn prop-btn-danger" style="margin-top:6px" onclick="window.designerEngine.deleteSelected()"><i class="fas fa-trash"></i> Löschen</button>
    </div>`;
};
