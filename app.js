// ── State ────────────────────────────────────────────────────────────────────
let map;
let locations    = [];
let markers      = {};
let itineraries  = [];
let notesLists   = [];
let homeLocations = [];
let activeFilter = 'all';
let activeTab    = 'locations';
let pendingPlace = null;
let editingId    = null;
let editingTripId = null;

// ── Directions state ──────────────────────────────────────────────────────────
let directionsMode     = false;
let dirStops           = [null, null]; // array of {name,lat,lng} or null
let directionsService  = null;
let directionsRenderer = null;

// ── Places service ───────────────────────────────────────────────────────────
let placesService  = null;

// ── Place preview panel ───────────────────────────────────────────────────────
let previewPlace   = null;
let geocoder       = null;
let previewPending = false;

// ── Trip item / homes modal state ─────────────────────────────────────────────
let addingTripItemForTripId = null;
let tripItemSelectedPlace   = null;
let tripItemAutocomplete    = null;
let tripDestAutocomplete    = null;
let homeSelectedPlace       = null;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  visited:  { label: 'Visited',       icon: '✓', color: '#2e7d32', bg: '#4caf50' },
  plan:     { label: 'Plan to Visit', icon: '★', color: '#1565c0', bg: '#2196f3' },
  wont:     { label: "Won't Visit",   icon: '✕', color: '#757575', bg: '#9e9e9e' },
  favorite: { label: 'Favorite',      icon: '♥', color: '#f9a825', bg: '#ffc107' },
};

const CATEGORIES = [
  '', 'Nature / Hiking', 'Beach', 'City / Town', 'Food & Restaurants',
  'Religious / Historical', 'Parking / Trailhead', 'Accommodation',
  'Shopping', 'Viewpoint', 'Museum / Culture', 'Other',
];

// ── Map init ──────────────────────────────────────────────────────────────────
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 31.5, lng: 35.0 },
    zoom: 8,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    styles: [],
  });

  placesService = new google.maps.places.PlacesService(map);
  map.addListener('click', onMapClick);
  initPreviewPanel();
  initSearch();
  loadData();
  initFilterChips();
  initModal();
  initTripModal();
  initTripItemModal();
  initHomesModal();
  initDirections();
  initSidebarToggle();
  initTabs();
  initAddLocationBtn();
}

// ── Map click → preview panel ─────────────────────────────────────────────────
function onMapClick(event) {
  if (directionsMode) return;
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return;
  if (previewPending) return;

  if (event.placeId) {
    event.stop();
    previewPending = true;
    showPlacePreview({ name: 'Loading…', lat: event.latLng.lat(), lng: event.latLng.lng(), placeId: event.placeId });

    placesService.getDetails(
      { placeId: event.placeId,
        fields: ['name', 'geometry', 'photos', 'rating', 'user_ratings_total',
                 'reviews', 'opening_hours', 'website', 'url',
                 'formatted_phone_number', 'formatted_address'] },
      (place, status) => {
        previewPending = false;
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          closePreview(); return;
        }
        showPlacePreview({
          name:    place.name,
          lat:     place.geometry.location.lat(),
          lng:     place.geometry.location.lng(),
          placeId: event.placeId,
          address: place.formatted_address || null,
        });
        renderPreviewDetails(place);
      }
    );
  } else {
    previewPending = true;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    showPlacePreview({ name: 'Loading…', lat, lng, placeId: null });

    if (!geocoder) geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: event.latLng }, (results, status) => {
      previewPending = false;
      if (status !== 'OK' || !results || !results[0]) {
        showPlacePreview({ name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, placeId: null, address: null });
        renderPreviewDetails(null);
        return;
      }
      const best = results[0];
      const nameComp = best.address_components.find(c =>
        c.types.some(t => ['premise','point_of_interest','establishment',
                           'neighborhood','sublocality','locality'].includes(t))
      );
      const name    = nameComp ? nameComp.long_name : best.formatted_address;
      const placeId = best.place_id || null;

      showPlacePreview({ name, lat, lng, placeId, address: best.formatted_address });

      const specificTypes = ['street_address', 'route', 'premise', 'subpremise',
                             'natural_feature', 'park', 'point_of_interest',
                             'establishment', 'airport', 'transit_station'];
      const isSpecific = best.types.some(t => specificTypes.includes(t));

      if (placeId && isSpecific) {
        placesService.getDetails(
          { placeId, fields: ['photos', 'rating', 'user_ratings_total', 'reviews',
                              'opening_hours', 'website', 'url', 'formatted_phone_number'] },
          (place, s) => {
            renderPreviewDetails(s === google.maps.places.PlacesServiceStatus.OK && place ? place : null);
          }
        );
      } else {
        renderPreviewDetails(null);
      }
    });
  }
}

function showPlacePreview({ name, lat, lng, placeId, address }) {
  previewPlace = { name, lat, lng, placeId: placeId || null };

  document.getElementById('preview-name').textContent = name;

  const sub = document.getElementById('preview-subtitle');
  if (address) {
    sub.textContent = address;
    sub.classList.remove('hidden');
  } else {
    sub.classList.add('hidden');
  }

  document.getElementById('preview-details').innerHTML = '';

  const panel = document.getElementById('place-preview');
  panel.classList.remove('hidden');
  panel.classList.add('open');
}

function renderPreviewDetails(place) {
  const el = document.getElementById('preview-details');
  if (!place) {
    el.innerHTML = '<div style="padding:12px 0;color:#aaa;font-size:13px;text-align:center;">No additional info available.</div>';
    return;
  }
  renderPlaceDetails(place, el);
}

function closePreview() {
  const panel = document.getElementById('place-preview');
  panel.classList.remove('open');
  panel.classList.add('hidden');
  previewPlace   = null;
  previewPending = false;
}

function initPreviewPanel() {
  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('preview-add-btn').addEventListener('click', () => {
    if (!previewPlace) return;
    const place = { ...previewPlace };
    closePreview();
    pendingPlace = place;
    openModal({ place });
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'il' },
    fields: ['name', 'geometry', 'place_id'],
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
        placeId: place.place_id || null,
      };
      map.panTo(place.geometry.location);
      openModal({ place: pendingPlace });
    }

    input.value = '';
  });
}

function initAddLocationBtn() {
  document.getElementById('add-location-btn').addEventListener('click', () => {
    closeSidebarDrawer();
    document.getElementById('search-input').focus();
  });
}

// ── Data ──────────────────────────────────────────────────────────────────────
function loadData() {
  fetch('/data.json')
    .then(r => r.json())
    .then(data => {
      locations     = data.locations     || [];
      itineraries   = data.itineraries   || [];
      notesLists    = data.notesLists    || [];
      homeLocations = data.homeLocations || [];
      if (notesLists.length === 0) seedNotesLists();
      locations.forEach(addMarker);
      renderLocationsTab();
      renderItineraryTab();
      renderNotesTab();
      renderDirHomeBtns();
    })
    .catch(() => {
      locations = [];
      seedNotesLists();
      renderLocationsTab();
      renderNotesTab();
    });
}

function saveData() {
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, itineraries, notesLists, homeLocations }),
  });
}

// ── Markers ───────────────────────────────────────────────────────────────────
function markerIcon(status, _role, name) {
  const s = STATUS[status];
  const label = name ? (name.length > 12 ? name.slice(0, 11) + '…' : name) : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="62" viewBox="0 0 80 62">
      <path d="M40 0C30 0 22 8 22 18c0 12 18 26 18 26S58 30 58 18C58 8 50 0 40 0z"
            fill="${s.bg}" stroke="white" stroke-width="2"/>
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
    if (directionsMode) onDirectionsMarkerClick(loc);
    else openModal({ id: loc.id });
  });

  markers[loc.id] = marker;
  applyFilterToMarker(loc.id);
}

function updateMarkerIcon(id) {
  const loc = locations.find(l => l.id === id);
  if (loc && markers[id]) {
    markers[id].setIcon(markerIcon(loc.status, undefined, loc.name));
    markers[id].setTitle(loc.name);
  }
}

function removeMarker(id) {
  if (markers[id]) { markers[id].setMap(null); delete markers[id]; }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      document.getElementById(`tab-${activeTab}`).classList.remove('hidden');
    });
  });
}

// ── Locations Tab ─────────────────────────────────────────────────────────────
function renderLocationsTab() {
  const list    = document.getElementById('location-list');
  const visible = locations.filter(l => activeFilter === 'all' || l.status === activeFilter);

  document.getElementById('stat-total').textContent   = locations.length;
  document.getElementById('stat-visited').textContent = locations.filter(l => l.status === 'visited').length;
  document.getElementById('stat-planned').textContent = locations.filter(l => l.status === 'plan').length;

  const toggleCount = document.getElementById('toggle-count');
  if (toggleCount) toggleCount.textContent = visible.length;

  list.innerHTML = '';
  visible.forEach(loc => {
    const li = document.createElement('li');
    li.className = 'loc-card';
    li.dataset.id = loc.id;

    const coords = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
    const catTag = loc.category
      ? `<span class="category-tag">${escapeHtml(loc.category)}</span>`
      : '';

    li.innerHTML = `
      <button class="loc-delete-btn" title="Delete" aria-label="Delete location">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
      <div class="loc-card-header">
        <span class="status-dot ${loc.status}"></span>
        <span class="loc-name">${escapeHtml(loc.name)}</span>
        ${catTag}
      </div>
      <div class="loc-coords">${coords}</div>
      <div class="quick-btns">
        <button class="quick-btn visited ${loc.status === 'visited'  ? 'active' : ''}" data-status="visited">✓ Visited</button>
        <button class="quick-btn plan    ${loc.status === 'plan'     ? 'active' : ''}" data-status="plan">★ Plan</button>
        <button class="quick-btn favorite ${loc.status === 'favorite' ? 'active' : ''}" data-status="favorite">♥ Fav</button>
        <button class="quick-btn wont    ${loc.status === 'wont'     ? 'active' : ''}" data-status="wont">✕ Won't</button>
      </div>
      <textarea class="loc-notes-input" rows="2" placeholder="Notes…">${escapeHtml(loc.notes || '')}</textarea>
    `;

    li.querySelector('.loc-card-header').addEventListener('click', () => {
      closeSidebarDrawer();
      map.panTo({ lat: loc.lat, lng: loc.lng });
      map.setZoom(14);
      openModal({ id: loc.id });
    });

    li.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        loc.status = btn.dataset.status;
        updateMarkerIcon(loc.id);
        saveData();
        renderLocationsTab();
      });
    });

    const notesTA = li.querySelector('.loc-notes-input');
    notesTA.addEventListener('blur', () => {
      loc.notes = notesTA.value.trim();
      saveData();
    });

    li.querySelector('.loc-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete "${loc.name}"?`)) return;
      locations = locations.filter(l => l.id !== loc.id);
      removeMarker(loc.id);
      saveData();
      renderLocationsTab();
    });

    list.appendChild(li);
  });
}

// ── Filter chips ──────────────────────────────────────────────────────────────
function initFilterChips() {
  document.querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      locations.forEach(l => applyFilterToMarker(l.id));
      renderLocationsTab();
    });
  });
}

function applyFilterToMarker(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc || !markers[id]) return;
  markers[id].setMap(activeFilter === 'all' || loc.status === activeFilter ? map : null);
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
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

// ── Location Modal ────────────────────────────────────────────────────────────
function initModal() {
  document.getElementById('modal-save').addEventListener('click', onModalSave);
  document.getElementById('modal-delete').addEventListener('click', onModalDelete);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  initModalTodos();
}

function initModalTodos() {
  const input  = document.getElementById('modal-todo-input');
  const addBtn = document.getElementById('modal-todo-add-btn');

  const addTodo = () => {
    const text = input.value.trim();
    if (!text || !editingId) return;
    const loc = locations.find(l => l.id === editingId);
    if (!loc) return;
    if (!loc.todos) loc.todos = [];
    loc.todos.push({ id: crypto.randomUUID(), text, done: false });
    saveData();
    input.value = '';
    renderModalTodos(loc);
  };

  addBtn.addEventListener('click', addTodo);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
}

function renderModalTodos(loc) {
  const field    = document.getElementById('modal-todos-field');
  const list     = document.getElementById('modal-todos-list');
  const countEl  = document.getElementById('modal-todos-count');

  if (!loc) { field.classList.add('hidden'); return; }
  field.classList.remove('hidden');

  const todos = loc.todos || [];
  const doneCount = todos.filter(t => t.done).length;
  countEl.textContent = todos.length ? `${doneCount} / ${todos.length} done` : '';

  list.innerHTML = '';
  todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'modal-todo-item' + (todo.done ? ' done' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked;
      saveData();
      renderModalTodos(loc);
    });

    const span = document.createElement('span');
    span.className = 'modal-todo-text';
    span.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'modal-todo-delete';
    del.title = 'Delete';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      loc.todos = loc.todos.filter(t => t.id !== todo.id);
      saveData();
      renderModalTodos(loc);
    });

    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });
}

function openModal({ id, place } = {}) {
  editingId = id || null;
  const overlay    = document.getElementById('modal-overlay');
  const nameInput  = document.getElementById('modal-name');
  const notesInput = document.getElementById('modal-notes');
  const catSelect  = document.getElementById('modal-category');
  const deleteBtn  = document.getElementById('modal-delete');

  const detailsSection = document.getElementById('place-details-section');
  detailsSection.classList.add('hidden');
  detailsSection.innerHTML = '';

  if (id) {
    const loc = locations.find(l => l.id === id);
    document.getElementById('modal-title').textContent = 'Edit Location';
    nameInput.value  = loc.name;
    notesInput.value = loc.notes || '';
    catSelect.value  = loc.category || '';
    setRadio(loc.status);
    deleteBtn.classList.remove('hidden');
    renderModalTodos(loc);
    if (loc.placeId) {
      loadPlaceDetails(loc.placeId);
    } else {
      findAndLoadPlaceDetails(loc.name, loc.lat, loc.lng, loc.id);
    }
  } else {
    document.getElementById('modal-title').textContent = 'Add Location';
    nameInput.value  = place.name;
    notesInput.value = '';
    catSelect.value  = '';
    setRadio('visited');
    deleteBtn.classList.add('hidden');
    renderModalTodos(null);
    if (place.placeId) loadPlaceDetails(place.placeId);
  }

  overlay.classList.remove('hidden');
  closeSidebarDrawer();
  notesInput.focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId    = null;
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
  const status   = getRadio();
  const notes    = document.getElementById('modal-notes').value.trim();
  const category = document.getElementById('modal-category').value;
  const name     = document.getElementById('modal-name').value.trim() || 'Unnamed';

  if (editingId) {
    const loc = locations.find(l => l.id === editingId);
    loc.name     = name;
    loc.status   = status;
    loc.notes    = notes;
    loc.category = category;
    updateMarkerIcon(editingId);
  } else if (pendingPlace) {
    const loc = {
      id: crypto.randomUUID(),
      name,
      lat: pendingPlace.lat,
      lng: pendingPlace.lng,
      placeId: pendingPlace.placeId || null,
      status,
      category,
      notes,
      addedAt: new Date().toISOString(),
    };
    locations.push(loc);
    addMarker(loc);
  }

  saveData();
  renderLocationsTab();
  closeModal();
}

function onModalDelete() {
  if (!editingId) return;
  const loc = locations.find(l => l.id === editingId);
  if (!confirm(`Delete "${loc?.name}"?`)) return;
  locations = locations.filter(l => l.id !== editingId);
  removeMarker(editingId);
  saveData();
  renderLocationsTab();
  closeModal();
}

// ── Directions ────────────────────────────────────────────────────────────────
function initDirections() {
  directionsService  = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: { strokeColor: '#1a73e8', strokeWeight: 5, strokeOpacity: 0.8 },
  });
  directionsRenderer.setMap(map);

  document.getElementById('btn-directions').addEventListener('click', toggleDirectionsMode);
  document.getElementById('dir-clear').addEventListener('click', clearDirections);
  document.getElementById('dir-my-location').addEventListener('click', useMyLocation);
  document.getElementById('dir-add-stop').addEventListener('click', () => {
    dirStops.push(null);
    renderDirStops();
  });
  document.getElementById('dir-google-maps').addEventListener('click', openInGoogleMaps);
  document.getElementById('dir-waze').addEventListener('click', openInWaze);
  document.getElementById('dir-manage-homes').addEventListener('click', openHomesModal);

  renderDirStops();
}

function toggleDirectionsMode() {
  directionsMode = !directionsMode;
  document.getElementById('btn-directions').classList.toggle('active', directionsMode);
  document.getElementById('directions-bar').classList.toggle('hidden', !directionsMode);
  document.getElementById('map').classList.toggle('dir-selecting', directionsMode);
  if (!directionsMode) {
    dirStops = [null, null];
    clearRouteDisplay();
    renderDirStops();
  }
}

function onDirectionsMarkerClick(loc) {
  addDirStop({ name: loc.name, lat: loc.lat, lng: loc.lng });
}

function addDirStop(point) {
  const idx = dirStops.indexOf(null);
  if (idx !== -1) {
    dirStops[idx] = point;
  } else {
    dirStops.push(point);
  }
  renderDirStops();
  if (dirStops.filter(Boolean).length >= 2) drawRoute();
}

function clearDirStop(idx) {
  dirStops[idx] = null;
  while (dirStops.length > 2 && dirStops[dirStops.length - 1] === null) {
    dirStops.pop();
  }
  renderDirStops();
  if (dirStops.filter(Boolean).length >= 2) drawRoute();
  else clearRouteDisplay();
}

function renderDirStops() {
  const container = document.getElementById('dir-stops-list');
  container.innerHTML = '';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  dirStops.forEach((stop, idx) => {
    if (idx > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'dir-stop-arrow';
      arrow.textContent = '↓';
      container.appendChild(arrow);
    }

    const row = document.createElement('div');
    row.className = 'dir-stop';

    const labelEl = document.createElement('div');
    labelEl.className = 'dir-stop-label';
    labelEl.textContent = letters[idx] || String(idx + 1);

    const nameEl = document.createElement('div');
    nameEl.className = 'dir-stop-name' + (stop ? '' : ' empty');
    nameEl.textContent = stop ? stop.name : 'Click a pin to set…';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'dir-stop-clear';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear stop';
    clearBtn.addEventListener('click', () => clearDirStop(idx));

    row.appendChild(labelEl);
    row.appendChild(nameEl);
    row.appendChild(clearBtn);
    container.appendChild(row);
  });

  const filled = dirStops.filter(Boolean).length;
  const hint = document.getElementById('dir-hint');
  if (filled === 0) {
    hint.textContent = 'Click a pin on the map to set a stop.';
  } else if (filled === 1) {
    hint.textContent = 'Click another pin to add the next stop.';
  } else {
    hint.textContent = '';
  }
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => addDirStop({ name: '📍 My Location', lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => alert('Could not get your location.')
  );
}

function drawRoute() {
  const filled = dirStops.filter(Boolean);
  if (filled.length < 2) return;

  const origin      = filled[0];
  const destination = filled[filled.length - 1];
  const waypoints   = filled.slice(1, -1).map(s => ({
    location: { lat: s.lat, lng: s.lng },
    stopover: true,
  }));

  directionsService.route(
    {
      origin:      { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      waypoints,
      travelMode:  google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        let totalDist = 0, totalDur = 0;
        result.routes[0].legs.forEach(leg => {
          totalDist += leg.distance.value;
          totalDur  += leg.duration.value;
        });
        const distKm = (totalDist / 1000).toFixed(1) + ' km';
        const durMin = Math.round(totalDur / 60);
        const durStr = durMin >= 60
          ? `${Math.floor(durMin / 60)} h ${durMin % 60} min`
          : `${durMin} min`;
        document.getElementById('dir-summary').textContent = `${distKm} · ${durStr}`;
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

function clearDirections() {
  dirStops = [null, null];
  renderDirStops();
  clearRouteDisplay();
}

function openInGoogleMaps() {
  const filled = dirStops.filter(Boolean);
  if (filled.length < 2) return;
  const origin      = filled[0];
  const destination = filled[filled.length - 1];
  const waypoints   = filled.slice(1, -1).map(s => `${s.lat},${s.lng}`).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  window.open(url, '_blank');
}

function openInWaze() {
  const filled = dirStops.filter(Boolean);
  if (filled.length === 0) return;
  const dest = filled[filled.length - 1];
  window.open(`https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`, '_blank');
}

// ── Homes Management ──────────────────────────────────────────────────────────
function initHomesModal() {
  document.getElementById('homes-close-btn').addEventListener('click', closeHomesModal);
  document.getElementById('homes-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('homes-modal-overlay')) closeHomesModal();
  });
  document.getElementById('home-add-btn').addEventListener('click', saveNewHome);

  const homeInput = document.getElementById('home-place-input');
  const homeAC    = new google.maps.places.Autocomplete(homeInput, {
    fields: ['name', 'geometry', 'formatted_address'],
  });
  homeAC.addListener('place_changed', () => {
    const place = homeAC.getPlace();
    if (!place.geometry) return;
    homeSelectedPlace = {
      name: place.formatted_address || place.name,
      lat:  place.geometry.location.lat(),
      lng:  place.geometry.location.lng(),
    };
  });
}

function saveNewHome() {
  const label = document.getElementById('home-label-input').value.trim();
  if (!label) { document.getElementById('home-label-input').focus(); return; }
  if (!homeSelectedPlace) { document.getElementById('home-place-input').focus(); return; }
  addHomeLocation(label, homeSelectedPlace.name, homeSelectedPlace.lat, homeSelectedPlace.lng);
  document.getElementById('home-label-input').value = '';
  document.getElementById('home-place-input').value = '';
  homeSelectedPlace = null;
}

function openHomesModal() {
  renderHomesModal();
  document.getElementById('homes-modal-overlay').classList.remove('hidden');
}

function closeHomesModal() {
  document.getElementById('homes-modal-overlay').classList.add('hidden');
  homeSelectedPlace = null;
}

function renderHomesModal() {
  const container = document.getElementById('homes-list');
  if (homeLocations.length === 0) {
    container.innerHTML = '<p style="padding:10px 0;color:#aaa;font-size:13px;text-align:center;">No homes saved yet.</p>';
    return;
  }
  container.innerHTML = homeLocations.map(h => `
    <div class="home-item">
      <div class="home-item-label">${escapeHtml(h.label)}</div>
      <div class="home-item-name">${escapeHtml(h.name)}</div>
      <button class="home-item-delete" data-id="${h.id}" title="Delete">🗑</button>
    </div>`).join('');

  container.querySelectorAll('.home-item-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteHomeLocation(btn.dataset.id));
  });
}

function addHomeLocation(label, name, lat, lng) {
  homeLocations.push({ id: crypto.randomUUID(), label, name, lat, lng });
  saveData();
  renderHomesModal();
  renderDirHomeBtns();
}

function deleteHomeLocation(id) {
  homeLocations = homeLocations.filter(h => h.id !== id);
  saveData();
  renderHomesModal();
  renderDirHomeBtns();
}

function renderDirHomeBtns() {
  const container = document.getElementById('dir-home-btns');
  container.innerHTML = '';
  homeLocations.forEach(home => {
    const btn = document.createElement('button');
    btn.className = 'dir-home-btn';
    btn.textContent = `🏠 ${home.label}`;
    btn.title = home.name;
    btn.addEventListener('click', () => addDirStop({ name: home.label, lat: home.lat, lng: home.lng }));
    container.appendChild(btn);
  });
}

// ── Trip Item Modal ───────────────────────────────────────────────────────────
function initTripItemModal() {
  document.getElementById('trip-item-save').addEventListener('click', onTripItemSave);
  document.getElementById('trip-item-cancel').addEventListener('click', closeTripItemModal);
  document.getElementById('trip-item-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('trip-item-modal-overlay')) closeTripItemModal();
  });

  const input = document.getElementById('trip-item-place');
  tripItemAutocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['name', 'geometry', 'formatted_address'],
  });
  tripItemAutocomplete.addListener('place_changed', () => {
    const place = tripItemAutocomplete.getPlace();
    if (!place.geometry) return;
    tripItemSelectedPlace = {
      name: place.name,
      lat:  place.geometry.location.lat(),
      lng:  place.geometry.location.lng(),
    };
  });
}

function openTripItemModal(tripId) {
  addingTripItemForTripId = tripId;
  tripItemSelectedPlace   = null;
  document.getElementById('trip-item-place').value    = '';
  document.getElementById('trip-item-date').value     = '';
  document.getElementById('trip-item-category').value = '';
  document.getElementById('trip-item-notes').value    = '';
  document.getElementById('trip-item-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('trip-item-place').focus(), 50);
}

function closeTripItemModal() {
  document.getElementById('trip-item-modal-overlay').classList.add('hidden');
  addingTripItemForTripId = null;
  tripItemSelectedPlace   = null;
}

function onTripItemSave() {
  if (!addingTripItemForTripId) return;
  const nameFromInput = document.getElementById('trip-item-place').value.trim();
  const name = tripItemSelectedPlace ? tripItemSelectedPlace.name : nameFromInput;
  if (!name) { document.getElementById('trip-item-place').focus(); return; }

  addTripItem(addingTripItemForTripId, {
    name,
    lat:      tripItemSelectedPlace?.lat  ?? null,
    lng:      tripItemSelectedPlace?.lng  ?? null,
    date:     document.getElementById('trip-item-date').value,
    category: document.getElementById('trip-item-category').value,
    notes:    document.getElementById('trip-item-notes').value.trim(),
  });
  closeTripItemModal();
}

// ── Itinerary Tab ─────────────────────────────────────────────────────────────
function initTripModal() {
  document.getElementById('add-trip-btn').addEventListener('click', () => openTripModal());
  document.getElementById('trip-modal-save').addEventListener('click', onTripModalSave);
  document.getElementById('trip-modal-cancel').addEventListener('click', closeTripModal);
  document.getElementById('trip-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('trip-modal-overlay')) closeTripModal();
  });

  // Worldwide Places Autocomplete for destination
  tripDestAutocomplete = new google.maps.places.Autocomplete(
    document.getElementById('trip-destination'),
    { fields: ['name', 'formatted_address'] }
  );
}

function openTripModal(tripId) {
  editingTripId = tripId || null;
  const trip = tripId ? itineraries.find(t => t.id === tripId) : null;
  document.getElementById('trip-modal-title').textContent = trip ? 'Edit Trip' : 'New Trip';
  document.getElementById('trip-name').value        = trip ? trip.name        : '';
  document.getElementById('trip-destination').value = trip ? trip.destination : '';
  document.getElementById('trip-start-date').value  = trip ? trip.startDate   : '';
  document.getElementById('trip-end-date').value    = trip ? trip.endDate     : '';
  document.getElementById('trip-notes').value       = trip ? trip.notes       : '';
  document.getElementById('trip-modal-overlay').classList.remove('hidden');
  document.getElementById('trip-name').focus();
}

function closeTripModal() {
  document.getElementById('trip-modal-overlay').classList.add('hidden');
  editingTripId = null;
}

function onTripModalSave() {
  const name        = document.getElementById('trip-name').value.trim();
  const destination = document.getElementById('trip-destination').value.trim();
  const startDate   = document.getElementById('trip-start-date').value;
  const endDate     = document.getElementById('trip-end-date').value;
  const notes       = document.getElementById('trip-notes').value.trim();

  if (!name) { document.getElementById('trip-name').focus(); return; }

  if (editingTripId) {
    const trip = itineraries.find(t => t.id === editingTripId);
    Object.assign(trip, { name, destination, startDate, endDate, notes });
  } else {
    itineraries.push({ id: crypto.randomUUID(), name, destination, startDate, endDate, notes, items: [] });
  }

  saveData();
  renderItineraryTab();
  closeTripModal();
}

function deleteTrip(id) {
  const trip = itineraries.find(t => t.id === id);
  if (!confirm(`Delete trip "${trip?.name}"?`)) return;
  itineraries = itineraries.filter(t => t.id !== id);
  saveData();
  renderItineraryTab();
}

function addTripItem(tripId, item) {
  const trip = itineraries.find(t => t.id === tripId);
  if (!trip) return;
  trip.items.push({ id: crypto.randomUUID(), status: 'planned', ...item });
  saveData();
  renderItineraryTab();
}

function deleteTripItem(tripId, itemId) {
  const trip = itineraries.find(t => t.id === tripId);
  if (!trip) return;
  trip.items = trip.items.filter(i => i.id !== itemId);
  saveData();
  renderItineraryTab();
}

function cycleTripItemStatus(tripId, itemId) {
  const trip = itineraries.find(t => t.id === tripId);
  if (!trip) return;
  const item = trip.items.find(i => i.id === itemId);
  if (!item) return;
  const cycle = { planned: 'done', done: 'skipped', skipped: 'planned' };
  item.status = cycle[item.status] || 'planned';
  saveData();
  renderItineraryTab();
}

function renderItineraryTab() {
  const container = document.getElementById('itinerary-list');
  container.innerHTML = '';

  if (itineraries.length === 0) {
    container.innerHTML = '<p style="padding:16px;color:#aaa;font-size:13px;text-align:center;">No trips yet. Create your first trip!</p>';
    return;
  }

  itineraries.forEach(trip => {
    const dateRange = [trip.startDate, trip.endDate].filter(Boolean).join(' → ');
    const meta = [trip.destination, dateRange].filter(Boolean).join(' · ');

    const card = document.createElement('div');
    card.className = 'trip-card';
    card.dataset.id = trip.id;

    const itemsHtml = trip.items.map(item => {
      const statusLabel = { planned: '○', done: '✓', skipped: '—' }[item.status] || '○';
      const metaParts = [item.date, item.category].filter(Boolean).join(' · ');
      return `
        <div class="trip-item" data-item-id="${item.id}">
          <button class="trip-item-status-btn ${item.status}" title="Click to change status">${statusLabel}</button>
          <div class="trip-item-info">
            <div class="trip-item-name ${item.status}">${escapeHtml(item.name)}</div>
            ${metaParts ? `<div class="trip-item-meta">${escapeHtml(metaParts)}</div>` : ''}
            ${item.notes ? `<div class="trip-item-meta" style="color:#999;font-style:italic">${escapeHtml(item.notes)}</div>` : ''}
          </div>
          <button class="trip-item-delete" title="Remove">✕</button>
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="trip-header">
        <span class="trip-chevron">▶</span>
        <div class="trip-header-info">
          <div class="trip-name">${escapeHtml(trip.name)}</div>
          ${meta ? `<div class="trip-meta">${escapeHtml(meta)}</div>` : ''}
        </div>
        <button class="trip-delete-btn" title="Delete trip">🗑</button>
      </div>
      <div class="trip-body">
        <div class="trip-notes-section">
          <textarea class="trip-notes-input" rows="2" placeholder="Trip notes…">${escapeHtml(trip.notes || '')}</textarea>
        </div>
        <div class="trip-items-list">${itemsHtml}</div>
        <div style="padding:10px 12px;border-top:1px solid #f0f0f0;">
          <button class="add-item-btn">+ Add Place</button>
        </div>
      </div>`;

    card.querySelector('.trip-header').addEventListener('click', e => {
      if (e.target.closest('.trip-delete-btn')) return;
      card.classList.toggle('open');
    });

    card.querySelector('.trip-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteTrip(trip.id);
    });

    card.querySelector('.trip-notes-input').addEventListener('blur', function() {
      trip.notes = this.value.trim();
      saveData();
    });

    card.querySelectorAll('.trip-item-status-btn').forEach(btn => {
      const itemId = btn.closest('.trip-item').dataset.itemId;
      btn.addEventListener('click', () => cycleTripItemStatus(trip.id, itemId));
    });

    card.querySelectorAll('.trip-item-delete').forEach(btn => {
      const itemId = btn.closest('.trip-item').dataset.itemId;
      btn.addEventListener('click', () => deleteTripItem(trip.id, itemId));
    });

    card.querySelector('.add-item-btn').addEventListener('click', () => {
      closeSidebarDrawer();
      openTripItemModal(trip.id);
    });

    container.appendChild(card);
  });
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────
function seedNotesLists() {
  notesLists = [
    {
      id: crypto.randomUUID(), title: 'Packing List',
      items: [
        'Passport', 'Sunscreen', 'Water bottle', 'Comfortable shoes',
        'Camera', 'Phone charger', 'Cash / credit cards', 'Medications', 'Snacks', 'Swimsuit',
      ].map(text => ({ id: crypto.randomUUID(), text, done: false })),
    },
    {
      id: crypto.randomUUID(), title: 'Before You Go',
      items: [
        'Book accommodation', 'Check visa requirements', 'Arrange travel insurance',
        'Download offline maps', 'Notify bank of travel', 'Charge all devices',
        'Print itinerary', 'Check weather forecast',
      ].map(text => ({ id: crypto.randomUUID(), text, done: false })),
    },
    {
      id: crypto.randomUUID(), title: 'At Each Stop',
      items: [
        'Take photos', 'Note opening hours', 'Check local tips', 'Try local food', 'Pick up any local maps',
      ].map(text => ({ id: crypto.randomUUID(), text, done: false })),
    },
  ];
  saveData();
}

function addNoteList(title) {
  notesLists.push({ id: crypto.randomUUID(), title, items: [] });
  saveData();
  renderNotesTab();
}

function deleteNoteList(id) {
  const list = notesLists.find(l => l.id === id);
  if (!confirm(`Delete list "${list?.title}"?`)) return;
  notesLists = notesLists.filter(l => l.id !== id);
  saveData();
  renderNotesTab();
}

function addNoteItem(listId, text) {
  const list = notesLists.find(l => l.id === listId);
  if (!list) return;
  list.items.push({ id: crypto.randomUUID(), text, done: false });
  saveData();
  renderNotesTab();
}

function toggleNoteItem(listId, itemId) {
  const list = notesLists.find(l => l.id === listId);
  if (!list) return;
  const item = list.items.find(i => i.id === itemId);
  if (item) item.done = !item.done;
  saveData();
  renderNotesTab();
}

function deleteNoteItem(listId, itemId) {
  const list = notesLists.find(l => l.id === listId);
  if (!list) return;
  list.items = list.items.filter(i => i.id !== itemId);
  saveData();
  renderNotesTab();
}

function renderNotesTab() {
  const container = document.getElementById('notes-list');
  container.innerHTML = '';

  document.getElementById('add-list-btn').onclick = () => {
    const title = prompt('List name:');
    if (title && title.trim()) addNoteList(title.trim());
  };

  notesLists.forEach(list => {
    const card = document.createElement('div');
    card.className = 'notes-card';

    const itemsHtml = list.items.map(item => `
      <div class="note-item" data-item-id="${item.id}">
        <input type="checkbox" ${item.done ? 'checked' : ''} />
        <span class="note-item-text ${item.done ? 'done' : ''}">${escapeHtml(item.text)}</span>
        <button class="note-item-delete" title="Remove">✕</button>
      </div>`).join('');

    card.innerHTML = `
      <div class="notes-card-header">
        <input class="notes-card-title" value="${escapeHtml(list.title)}" />
        <button class="notes-list-delete" title="Delete list">🗑</button>
      </div>
      <div class="notes-items">${itemsHtml}</div>
      <div class="add-note-item-form">
        <input type="text" placeholder="Add item…" />
        <button>Add</button>
      </div>`;

    card.querySelector('.notes-card-title').addEventListener('blur', function() {
      list.title = this.value.trim() || list.title;
      saveData();
    });

    card.querySelector('.notes-list-delete').addEventListener('click', () => deleteNoteList(list.id));

    card.querySelectorAll('.note-item').forEach(row => {
      const itemId = row.dataset.itemId;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleNoteItem(list.id, itemId));
      row.querySelector('.note-item-delete').addEventListener('click', () => deleteNoteItem(list.id, itemId));
    });

    const addInput = card.querySelector('.add-note-item-form input');
    const addBtn   = card.querySelector('.add-note-item-form button');
    addBtn.addEventListener('click', () => {
      const text = addInput.value.trim();
      if (text) addNoteItem(list.id, text);
    });
    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addBtn.click();
    });

    container.appendChild(card);
  });
}

// ── Place Details ─────────────────────────────────────────────────────────────
function loadPlaceDetails(placeId) {
  const section = document.getElementById('place-details-section');
  section.innerHTML = '<div class="pd-loading">Loading place info…</div>';
  section.classList.remove('hidden');

  placesService.getDetails(
    { placeId, fields: ['photos', 'rating', 'user_ratings_total', 'reviews', 'opening_hours', 'website', 'url', 'formatted_phone_number'] },
    (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        section.classList.add('hidden');
        section.innerHTML = '';
        return;
      }
      renderPlaceDetails(place);
    }
  );
}

function findAndLoadPlaceDetails(name, lat, lng, locId) {
  if (!placesService) return;
  const section = document.getElementById('place-details-section');
  section.innerHTML = '<div class="pd-loading">Loading place info…</div>';
  section.classList.remove('hidden');

  placesService.findPlaceFromQuery(
    { query: name, fields: ['place_id'], locationBias: { center: { lat, lng }, radius: 1000 } },
    (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
        const placeId = results[0].place_id;
        const loc = locations.find(l => l.id === locId);
        if (loc) { loc.placeId = placeId; saveData(); }
        loadPlaceDetails(placeId);
      } else {
        console.warn('findPlaceFromQuery failed:', status, name);
        section.classList.add('hidden');
        section.innerHTML = '';
      }
    }
  );
}

function renderPlaceDetails(place, targetEl) {
  const section = targetEl || document.getElementById('place-details-section');
  const hoursId = 'pd-hours-' + Date.now();
  let html = '<div class="pd-divider"></div>';

  // Photos
  if (place.photos && place.photos.length > 0) {
    const photos = place.photos.slice(0, 8)
      .map(p => p.getUrl({ maxWidth: 400, maxHeight: 280 }));
    html += `<div class="pd-photos">` +
      photos.map(url => `<img class="pd-photo" src="${url}" alt="" loading="lazy" onclick="window.open('${url}','_blank')" />`).join('') +
      `</div>`;
  }

  // Rating
  if (place.rating) {
    const count = place.user_ratings_total ? `(${place.user_ratings_total.toLocaleString()} reviews)` : '';
    html += `
      <div class="pd-rating">
        <span class="pd-rating-num">${place.rating.toFixed(1)}</span>
        <span class="pd-stars">${renderStars(place.rating)}</span>
        <span class="pd-rating-count">${count}</span>
      </div>`;
  }

  // Opening hours
  if (place.opening_hours) {
    const isOpen = place.opening_hours.isOpen();
    const weekdayText = place.opening_hours.weekday_text || [];
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
    const todayText = weekdayText[todayIdx] || '';
    const todayHours = todayText.replace(/^[^:]+:\s*/, '');

    html += `<div class="pd-hours" id="${hoursId}">
      <span class="pd-open-badge ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Open now' : 'Closed'}</span>
      ${todayHours ? `<span class="pd-today-hours">${escapeHtml(todayHours)}</span>` : ''}
      ${weekdayText.length ? `<button class="pd-hours-toggle" onclick="document.getElementById('${hoursId}').classList.toggle('expanded')">▾ All hours</button>
        <div class="pd-hours-list">${weekdayText.map(t => `<div class="pd-hours-row">${escapeHtml(t)}</div>`).join('')}</div>` : ''}
    </div>`;
  }

  // Reviews
  if (place.reviews && place.reviews.length > 0) {
    const reviewsHtml = place.reviews.slice(0, 3).map(r => {
      const snippet = r.text ? (r.text.length > 200 ? r.text.slice(0, 200) + '…' : r.text) : '';
      const avatar = r.profile_photo_url
        ? `<img class="pd-review-avatar" src="${r.profile_photo_url}" alt="" />`
        : `<div class="pd-review-avatar pd-review-avatar-placeholder"></div>`;
      return `<div class="pd-review">
        <div class="pd-review-header">
          ${avatar}
          <div>
            <div class="pd-review-author">${escapeHtml(r.author_name)}</div>
            <div class="pd-review-meta">${renderStars(r.rating)} · ${escapeHtml(r.relative_time_description)}</div>
          </div>
        </div>
        ${snippet ? `<div class="pd-review-text">${escapeHtml(snippet)}</div>` : ''}
      </div>`;
    }).join('');
    html += `<div class="pd-reviews">${reviewsHtml}</div>`;
  }

  // Links
  const gmapsUrl  = safeUrl(place.url);
  const websiteUrl = safeUrl(place.website);
  const links = [];
  if (gmapsUrl)   links.push(`<a class="pd-link" href="${gmapsUrl}" target="_blank" rel="noopener">📍 Google Maps</a>`);
  if (websiteUrl) links.push(`<a class="pd-link" href="${websiteUrl}" target="_blank" rel="noopener">🌐 Website</a>`);
  if (links.length) html += `<div class="pd-links">${links.join('')}</div>`;

  section.innerHTML = html;
  section.classList.remove('hidden');
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = (rating % 1) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '<span class="pd-star full">★</span>'.repeat(full) +
         (half ? '<span class="pd-star half">½</span>' : '') +
         '<span class="pd-star empty">☆</span>'.repeat(empty);
}

function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url : null;
  } catch { return null; }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
