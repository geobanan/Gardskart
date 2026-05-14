// Initier kartet, sentrert på et fint område
const map = L.map('map', { zoomControl: false }).setView([62.47, 6.35], 14);
L.control.zoom({ position: 'topright' }).addTo(map);

// Kartlag
const flyfoto = L.tileLayer
  .wms('https://wms.geonorge.no/skwms1/wms.nib', {
    layers: 'ortofoto',
    format: 'image/jpeg',
  })
  .addTo(map);
const topokart = L.tileLayer(
  'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png'
);
const matrikkel = L.tileLayer
  .wms('https://wms.geonorge.no/skwms1/wms.matrikkelkart', {
    layers: 'eiendomsgrense',
    format: 'image/png',
    transparent: true,
    opacity: 0.8,
  })
  .addTo(map);
const bratthet = L.tileLayer.wms(
  'https://wms.geonorge.no/skwms1/wms.bratthet',
  {
    layers: 'Bratthet_Over_20',
    format: 'image/png',
    transparent: true,
    opacity: 0.6,
  }
);

// Tegneverktøy
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);
const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: { marker: false, polyline: false, circle: false, circlemarker: false },
});
map.addControl(drawControl);

// Egendefinert knapp for å tegne
let drawPolygon = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
document.getElementById('drawBtn').addEventListener('click', () => {
  drawPolygon.enable();
});

// Håndter fullført tegning
map.on(L.Draw.Event.CREATED, (e) => {
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);

  // Her må vi senere regne ut arealet!
  document.getElementById('valAreal').innerText = 'Venter på server...';
});
// Håndter klikk i kartet for å autovelge eiendom
map.on('click', async (e) => {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  document.getElementById('gbnrText').innerText =
    '⏳ Henter eiendom fra Kartverket...';

  // Lag en bitteliten boks (Bounding Box) rundt klikket for API-søket
  const delta = 0.0001;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${
    lat + delta
  },EPSG:4326`;

  // Kartverkets Åpne WFS-API for Matrikkelkart
  const wfsUrl = `https://wfs.geonorge.no/skwms1/wfs.matrikkelkart?service=WFS&version=1.1.0&request=GetFeature&typeName=matrikkelkart:Teig&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox}`;

  try {
    const response = await fetch(wfsUrl);
    if (!response.ok) throw new Error('Feil mot Kartverket');

    const data = await response.json();

    // Sjekk om vi traff en eiendom
    if (data.features && data.features.length > 0) {
      const teig = data.features[0]; // Tar den første eiendommen vi traff

      // 1. Fjern gamle tegninger
      drawnItems.clearLayers();

      // 2. Tegn opp eiendommen i kartet (med en stilig oransje farge)
      const eiendomsLag = L.geoJSON(teig, {
        style: { color: '#f59e0b', weight: 3, fillOpacity: 0.3 },
      });
      drawnItems.addLayer(eiendomsLag);

      // Zoom kartet slik at hele eiendommen vises perfekt
      map.fitBounds(eiendomsLag.getBounds());

      // 3. Hent Gårds- og bruksnummer
      const props = teig.properties;
      document.getElementById(
        'gbnrText'
      ).innerText = `📍 Gnr ${props.gardsnummer} / Bnr ${props.bruksnummer} (${props.kommunenavn})`;

      // 4. Regn ut areal med Turf.js! (Gir kvadratmeter, vi deler på 1000 for Dekar)
      const arealKvm = turf.area(teig);
      const arealDekar = (arealKvm / 1000).toFixed(1);

      // 5. Oppdater Dashbordet
      document.getElementById('valAreal').innerText = `${arealDekar} daa`;

      // Superenkel mock-utregning av tilskudd (f.eks 200kr per dekar)
      const estimertTilskudd = Math.round(arealDekar * 200);
      document.getElementById(
        'valSum'
      ).innerText = `${estimertTilskudd.toLocaleString('no-NO')} kr`;
    } else {
      document.getElementById('gbnrText').innerText =
        '⚠️ Fant ingen eiendom her.';
    }
  } catch (error) {
    console.error('WFS Feil:', error);
    document.getElementById('gbnrText').innerText =
      '❌ Kunne ikke koble til Kartverket.';
  }
});
