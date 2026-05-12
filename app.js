// ── State ────────────────────────────────────────────────────────────────────
let map;
let locations = [];       // array of location objects
let markers = {};         // id → google.maps.Marker
let activeFilter = 'all';
let pendingPlace = null;  // place data waiting for modal confirmation
let editingId = null;     // id of location currently being edited

// ── Directions state ──────────────────────────────────────────────────────────
let directionsMode = false;
let dirOrigin = null;     // { name, lat, lng }
let dirDest = null;       // { name, lat, lng }
let directionsService = null;
let directionsRenderer = null;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  visited:  { label: 'Visited',       icon: '✓', color: '#2e7d32', bg: '#4caf50' },
  plan:     { label: 'Plan to Visit', icon: '★', color: '#1565c0', bg: '#2196f3' },
  wont:     { label: "Won't Visit",   icon: '✕', color: '#757575', bg: '#9e9e9e' },
  favorite: { label: 'Favorite',      icon: '♥', color: '#f9a825', bg: '#ffc107' },
};

// ── Map init (called by Google Maps script callback) ──────────────────────────
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 31.5, lng: 35.0 },
    zoom: 8,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
  });

  initSearch();
  loadData();
  initFilterChips();
  initModal();
  initDirections();
  initSidebarToggle();
}

// ── Search (Places Autocomplete) ───────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'il' },
    fields: ['name', 'geometry'],
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    const existing = locations.find(
      l => Math.abs(l.lat - place.geometry.location.lat()) < 0.0001 &&
           Math.abs(l.lng - place.geometry.location.lng()) < 0.0001
    );

    if (existing) {
      openModal({ id: existing.id });
    } else {
      pendingPlace = {
        name: place.name,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      map.panTo(place.geometry.location);
      openModal({ place: pendingPlace });
    }

    input.value = '';
  });
}

// ── Data persistence ───────────────────────────────────────────────────────────
function loadData() {
  fetch('/data.json')
    .then(r => r.json())
    .then(data => {
      locations = data.locations || [];
      locations.forEach(addMarker);
      renderSidebar();
    })
    .catch(() => {
      locations = [];
    });
}

function saveData() {
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
  });
}

// ── Markers ────────────────────────────────────────────────────────────────────
function markerIcon(status, role, name) {
  const s = STATUS[status];
  let fill = s.bg;
  let stroke = 'white';
  let strokeWidth = 2;
  if (role === 'origin') { stroke = '#2e7d32'; strokeWidth = 4; }
  if (role === 'dest')   { stroke = '#c62828'; strokeWidth = 4; }

  const label = name ? (name.length > 12 ? name.slice(0, 11) + '…' : name) : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="62" viewBox="0 0 80 62">
      <path d="M40 0C30 0 22 8 22 18c0 12 18 26 18 26S58 30 58 18C58 8 50 0 40 0z"
            fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      <text x="40" y="24" text-anchor="middle" font-size="16" fill="white"
            font-family="Arial,sans-serif">${s.icon}</text>
      <rect x="1" y="46" width="78" height="15" rx="7" fill="white" fill-opacity="0.88"/>
      <text x="40" y="58" text-anchor="middle" font-size="10" fill="#333"
            font-family="Arial,sans-serif" font-weight="600">${escapeHtml(label)}</text>
    </svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(80, 62),
    anchor: new google.maps.Point(40, 44),
  };
}

function addMarker(loc) {
  const marker = new google.maps.Marker({
    position: { lat: loc.lat, lng: loc.lng },
    map,
    title: loc.name,
    icon: markerIcon(loc.status, undefined, loc.name),
  });

  marker.addListener('click', () => {
    if (directionsMode) {
      onDirectionsMarkerClick(loc);
    } else {
      openModal({ id: loc.id });
    }
  });

  markers[loc.id] = marker;
  applyFilterToMarker(loc.id);
}

function updateMarkerIcon(id, role) {
  const loc = locations.find(l => l.id === id);
  if (loc && markers[id]) markers[id].setIcon(markerIcon(loc.status, role, loc.name));
}

function removeMarker(id) {
  if (markers[id]) {
    markers[id].setMap(null);
    delete markers[id];
  }
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('location-list');
  const visible = locations.filter(l => activeFilter === 'all' || l.status === activeFilter);
  const count = visible.length;

  document.getElementById('location-count').textContent =
    `${count} location${count !== 1 ? 's' : ''}`;

  const toggleCount = document.getElementById('toggle-count');
  if (toggleCount) toggleCount.textContent = count;

  list.innerHTML = '';
  visible.forEach(loc => {
    const s = STATUS[loc.status];
    const li = document.createElement('li');
    li.className = `status-${loc.status}`;
    li.innerHTML = `
      <span class="list-icon">${s.icon}</span>
      <div class="list-info">
        <div class="list-name">${escapeHtml(loc.name)}</div>
        ${loc.notes ? `<div class="list-note">${escapeHtml(loc.notes)}</div>` : ''}
      </div>`;
    li.addEventListener('click', () => {
      closeSidebarDrawer();
      if (directionsMode) {
        onDirectionsMarkerClick(loc);
      } else {
        map.panTo({ lat: loc.lat, lng: loc.lng });
        map.setZoom(14);
        openModal({ id: loc.id });
      }
    });
    list.appendChild(li);
  });
}

// ── Sidebar drawer (mobile) ────────────────────────────────────────────────────
function closeSidebarDrawer() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

function initSidebarToggle() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('open');
  });
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebarDrawer);
  document.getElementById('sidebar-close').addEventListener('click', closeSidebarDrawer);
}

// ── Filter chips ───────────────────────────────────────────────────────────────
function initFilterChips() {
  document.querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      locations.forEach(l => applyFilterToMarker(l.id));
      renderSidebar();
    });
  });
}

function applyFilterToMarker(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc || !markers[id]) return;
  const visible = activeFilter === 'all' || loc.status === activeFilter;
  markers[id].setMap(visible ? map : null);
}

// ── Directions ────────────────────────────────────────────────────────────────
function initDirections() {
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: { strokeColor: '#1a73e8', strokeWeight: 5, strokeOpacity: 0.8 },
  });
  directionsRenderer.setMap(map);

  document.getElementById('btn-directions').addEventListener('click', toggleDirectionsMode);
  document.getElementById('dir-clear').addEventListener('click', clearDirections);
  document.getElementById('dir-my-location').addEventListener('click', useMyLocation);
  document.getElementById('dir-google-maps').addEventListener('click', openInGoogleMaps);
  document.getElementById('dir-waze').addEventListener('click', openInWaze);
}

function toggleDirectionsMode() {
  directionsMode = !directionsMode;
  const btn = document.getElementById('btn-directions');
  const bar = document.getElementById('directions-bar');
  btn.classList.toggle('active', directionsMode);
  bar.classList.toggle('hidden', !directionsMode);
  document.getElementById('map').classList.toggle('dir-selecting', directionsMode);
  if (!directionsMode) clearDirections();
}

function onDirectionsMarkerClick(loc) {
  const point = { name: loc.name, lat: loc.lat, lng: loc.lng };
  if (!dirOrigin) {
    setDirOrigin(point);
  } else if (!dirDest) {
    setDirDest(point);
    drawRoute();
  } else {
    // Both set — reset and start over with new origin
    resetDirMarkers();
    dirDest = null;
    clearRouteDisplay();
    setDirOrigin(point);
  }
}

function setDirOrigin(point) {
  dirOrigin = point;
  document.getElementById('dir-origin-name').textContent = point.name;
  document.getElementById('dir-origin-name').className = 'dir-value set-origin';
  document.getElementById('dir-hint').textContent = 'Now click a pin to set the destination.';
  // Highlight origin marker
  const loc = locations.find(l => l.name === point.name && Math.abs(l.lat - point.lat) < 0.0001);
  if (loc) updateMarkerIcon(loc.id, 'origin');
}

function setDirDest(point) {
  dirDest = point;
  document.getElementById('dir-dest-name').textContent = point.name;
  document.getElementById('dir-dest-name').className = 'dir-value set-dest';
  document.getElementById('dir-hint').textContent = '';
  const loc = locations.find(l => l.name === point.name && Math.abs(l.lat - point.lat) < 0.0001);
  if (loc) updateMarkerIcon(loc.id, 'dest');
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const point = { name: 'My Location', lat: pos.coords.latitude, lng: pos.coords.longitude };
      resetDirMarkers();
      dirOrigin = null;
      dirDest = null;
      clearRouteDisplay();
      setDirOrigin(point);
      document.getElementById('dir-hint').textContent = 'Now click a pin to set the destination.';
    },
    () => alert('Could not get your location. Please allow location access.')
  );
}

function drawRoute() {
  if (!dirOrigin || !dirDest) return;

  directionsService.route(
    {
      origin: { lat: dirOrigin.lat, lng: dirOrigin.lng },
      destination: { lat: dirDest.lat, lng: dirDest.lng },
      travelMode: google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        document.getElementById('dir-summary').textContent =
          `${leg.distance.text} · ${leg.duration.text}`;
        document.getElementById('dir-google-maps').classList.remove('hidden');
        document.getElementById('dir-waze').classList.remove('hidden');
      } else {
        document.getElementById('dir-summary').textContent = 'Could not find route.';
      }
    }
  );
}

function clearRouteDisplay() {
  directionsRenderer.setDirections({ routes: [] });
  document.getElementById('dir-summary').textContent = '';
  document.getElementById('dir-google-maps').classList.add('hidden');
  document.getElementById('dir-waze').classList.add('hidden');
}

function resetDirMarkers() {
  // Restore normal icons for previously selected origin/dest
  if (dirOrigin) {
    const loc = locations.find(l => Math.abs(l.lat - dirOrigin.lat) < 0.0001);
    if (loc) updateMarkerIcon(loc.id);
  }
  if (dirDest) {
    const loc = locations.find(l => Math.abs(l.lat - dirDest.lat) < 0.0001);
    if (loc) updateMarkerIcon(loc.id);
  }
}

function clearDirections() {
  resetDirMarkers();
  dirOrigin = null;
  dirDest = null;
  clearRouteDisplay();
  document.getElementById('dir-origin-name').textContent = '—';
  document.getElementById('dir-origin-name').className = 'dir-value';
  document.getElementById('dir-dest-name').textContent = '—';
  document.getElementById('dir-dest-name').className = 'dir-value';
  document.getElementById('dir-hint').textContent = 'Click a pin on the map to set the start point, or use My Location.';
}

function openInGoogleMaps() {
  if (!dirOrigin || !dirDest) return;
  const url = `https://www.google.com/maps/dir/?api=1` +
    `&origin=${dirOrigin.lat},${dirOrigin.lng}` +
    `&destination=${dirDest.lat},${dirDest.lng}` +
    `&travelmode=driving`;
  window.open(url, '_blank');
}

function openInWaze() {
  if (!dirDest) return;
  const url = `https://waze.com/ul?ll=${dirDest.lat},${dirDest.lng}&navigate=yes`;
  window.open(url, '_blank');
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function initModal() {
  document.getElementById('modal-save').addEventListener('click', onModalSave);
  document.getElementById('modal-delete').addEventListener('click', onModalDelete);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

function openModal({ id, place } = {}) {
  editingId = id || null;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('modal-name');
  const notesInput = document.getElementById('modal-notes');
  const deleteBtn = document.getElementById('modal-delete');

  if (id) {
    const loc = locations.find(l => l.id === id);
    title.textContent = 'Edit Location';
    nameInput.value = loc.name;
    notesInput.value = loc.notes || '';
    setRadio(loc.status);
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Add Location';
    nameInput.value = place.name;
    notesInput.value = '';
    setRadio('visited');
    deleteBtn.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  closeSidebarDrawer();
  notesInput.focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
  pendingPlace = null;
}

function setRadio(value) {
  const radio = document.querySelector(`input[name="status"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function getRadio() {
  const radio = document.querySelector('input[name="status"]:checked');
  return radio ? radio.value : 'visited';
}

function onModalSave() {
  const status = getRadio();
  const notes = document.getElementById('modal-notes').value.trim();

  if (editingId) {
    const loc = locations.find(l => l.id === editingId);
    loc.status = status;
    loc.notes = notes;
    updateMarkerIcon(editingId);
  } else if (pendingPlace) {
    const loc = {
      id: crypto.randomUUID(),
      name: pendingPlace.name,
      lat: pendingPlace.lat,
      lng: pendingPlace.lng,
      status,
      notes,
      addedAt: new Date().toISOString(),
    };
    locations.push(loc);
    addMarker(loc);
  }

  saveData();
  renderSidebar();
  closeModal();
}

function onModalDelete() {
  if (!editingId) return;
  locations = locations.filter(l => l.id !== editingId);
  removeMarker(editingId);
  saveData();
  renderSidebar();
  closeModal();
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
