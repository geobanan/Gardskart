import './style.css';

// --- 1. KARTOPPSETT ---
const map = L.map('map', { zoomControl: false }).setView([62.47, 6.35], 14);
L.control.zoom({ position: 'topright' }).addTo(map);

// --- 2. KARTLAG ---
const flyfoto = L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.nib', {
  layers: 'ortofoto', format: 'image/jpeg', attribution: "Norge i Bilder"
}).addTo(map);

const topokart = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
  attribution: "Kartverket"
});

const matrikkel = L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.matrikkelkart', {
  layers: 'eiendomsgrense', format: 'image/png', transparent: true, opacity: 0.8
}).addTo(map);

const bratthet = L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.bratthet', {
  layers: 'Bratthet_Over_20', format: 'image/png', transparent: true, opacity: 0.6
});

L.control.layers(
  { "Flyfoto": flyfoto, "Topografisk": topokart },
  { "Eiendomsgrenser": matrikkel, "Bratthet (>20 grader)": bratthet },
  { position: 'bottomright' }
).addTo(map);


// --- 3. TEGNEVERKTØY ---
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);
const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: { marker: false, polyline: false, circle: false, circlemarker: false },
});
map.addControl(drawControl);

const drawPolygon = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
document.getElementById('drawBtn').addEventListener('click', () => {
  drawPolygon.enable();
});


// --- 4. FELLES FUNKSJON FOR UTREGNING ---
function oppdaterKalkyle(geojson, tittelTekst) {
  const arealKvm = turf.area(geojson);
  const arealDekar = (arealKvm / 1000).toFixed(1);
  const estimertTilskudd = Math.round(arealDekar * 200);

  document.getElementById('gbnrText').innerText = tittelTekst;
  document.getElementById('valAreal').innerText = `${arealDekar} daa`;
  document.getElementById('valSum').innerText = `${estimertTilskudd.toLocaleString('no-NO')} kr`;
}


// --- 5. HENDELSE: NÅR BONDEN TEGNER FERDIG ---
map.on(L.Draw.Event.CREATED, (e) => {
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);

  const geojson = e.layer.toGeoJSON();
  oppdaterKalkyle(geojson, "📍 Egendefinert opptegning");
});


// --- 6. HENDELSE: KLIKK I KARTET (HENT VIA VERCEL API) ---
map.on('click', async (e) => {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  document.getElementById('gbnrText').innerText = '⏳ Henter jordsmonn fra NIBIO...';

  const delta = 0.0001;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  // URL til ditt nye Vercel-API
  const wfsUrl = `/api/nibio?bbox=${bbox}`;

  try {
    const response = await fetch(wfsUrl);
    if (!response.ok) throw new Error("Fikk ikke svar fra Vercel-serveren");

    const textData = await response.text();
    if (textData.startsWith("<?xml")) throw new Error("NIBIO sendte XML, forventet JSON.");

    const data = JSON.parse(textData);

    if (data.features && data.features.length > 0) {
      const polygon = data.features[0];

      drawnItems.clearLayers();
      const jordLag = L.geoJSON(polygon, {
        style: { color: '#10b981', weight: 3, fillOpacity: 0.3 },
      });
      drawnItems.addLayer(jordLag);
      map.fitBounds(jordLag.getBounds());

      const artypeKode = polygon.properties.artype;
      const typeKart = {
        21: "🌾 Fulldyrka jord",
        22: "🚜 Overflatedyrka",
        23: "🐄 Innmarksbeite",
        30: "🌲 Skog",
        60: "💧 Myr"
      };

      const arealTypeNavn = typeKart[artypeKode] || `Areal (Kode: ${artypeKode})`;
      oppdaterKalkyle(polygon, arealTypeNavn);

    } else {
      document.getElementById('gbnrText').innerText = '⚠️ Fant ingen NIBIO-polygon her.';
    }
  } catch (error) {
    console.error('API Feil:', error);
    document.getElementById('gbnrText').innerText = '❌ Venter på Vercel-deployment...';
  }
});
