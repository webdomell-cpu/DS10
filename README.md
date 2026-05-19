# Digital Menuboard v7.40

Ein professionelles Digital-Signage-System für Restaurants, Cafés und Bars.

## Features

- **Produktverwaltung** - CRUD für Menüpunkte mit Bildern, Badges, Bestand
- **Zonen-Designer** - Drag & Drop Layout-Editor mit Raster
- **Templates CRUD** - 5 Standard-Templates + eigene erstellen/bearbeiten/löschen
- **Multi-Display Support** - 10+ Displays mit eigenen URLs
- **12 Schriftarten** - Inter, Roboto, Montserrat, Oswald, Playfair, Bebas, Poppins, Lato, Raleway, Open Sans, Nunito, Ubuntu
- **4 Themes** - Dark, Light, Burger, Coffee
- **7 Währungen** - EUR, USD, GBP, CHF, AED, JPY, INR
- **Ticker** - Laufschrift mit konfigurierbarer Geschwindigkeit
- **Mediathek** - Bild- und Video-Upload
- **Sold-Out Overlay** - Automatische Ausverkauft-Anzeige
- **Live-Preview** - Echtzeit-Vorschau im Admin

## Installation

```bash
npm install
npm start
```

## Verzeichnisstruktur

```
├── server.js              # Express Backend
├── package.json           # Node.js Dependencies
├── data.json              # Datenbank (automatisch erstellt)
├── uploads/               # Hochgeladene Medien
├── public/                # Display-Frontend
│   ├── index.html
│   ├── css/display.css
│   └── js/display.js
├── public/assets/         # Statische Assets
└── admin/                 # Admin-Panel
    ├── index.html
    ├── admin.css
    └── admin.js
```

## API Endpoints

### Daten
- `GET /data` - Alle Daten
- `POST /save` - Daten speichern

### Produkte
- `GET /products` - Produkte abrufen
- `POST /products` - Produkt erstellen
- `PUT /products/:id` - Produkt aktualisieren
- `DELETE /products/:id` - Produkt löschen

### Zonen
- `GET /zones` - Zonen abrufen
- `POST /zones` - Zone erstellen
- `PUT /zones/:id` - Zone aktualisieren
- `DELETE /zones/:id` - Zone löschen

### Templates (v7.40)
- `GET /templates` - Alle Templates
- `GET /templates/:id` - Einzelnes Template
- `POST /templates` - Template erstellen
- `PUT /templates/:id` - Template aktualisieren
- `DELETE /templates/:id` - Template löschen

### Displays (v7.40)
- `GET /displays` - Alle Displays
- `GET /displays/:id` - Einzelnes Display
- `POST /displays` - Display erstellen
- `PUT /displays/:id` - Display aktualisieren
- `DELETE /displays/:id` - Display löschen
- `GET /display/:slug` - Öffentliche Display-Ansicht
- `POST /displays/:id/heartbeat` - Display Heartbeat

### Medien
- `POST /upload` - Datei upload
- `POST /upload-multiple` - Mehrere Dateien
- `GET /uploads-list` - Uploads auflisten
- `DELETE /uploads/:filename` - Datei löschen

## Display-URLs

- Hauptdisplay: `http://localhost:3000/display/main`
- Außendisplay: `http://localhost:3000/display/outdoor`
- Küchendisplay: `http://localhost:3000/display/kitchen`

## Admin-Panel

`http://localhost:3000/admin`

## Changelog

### v7.40
- Templates CRUD (Create/Edit/Delete)
- Multi-Display Support (10+ Displays)
- Display-spezifische URLs
- Display Heartbeat
- 5 Standard-Templates

### v7.30
- Theme-Wechsel Fix
- Bild-Upload Fix
- 12 Schriftarten
- AED-Währung
- Version-Counter

### v7.20
- Templates Basis
- Multi-Display Basis
- Kategorien CRUD
- Sold-Out Overlay
