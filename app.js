// ── State ────────────────────────────────────────────────────────────────────
let map;
let locations   = [];
let markers     = {};
let itineraries = [];
let notesLists  = [];
let activeFilter = 'all';
let activeTab    = 'locations';
let pendingPlace = null;
let editingId    = null;
let editingTripId = null;

// ── Directions state ──────────────────────────────────────────────────────────
let directionsMode = false;
let dirOrigin = null;
let dirDest   = null;
let directionsService  = null;
let directionsRenderer = null;

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
    styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
  });

  initSearch();
  loadData();
  initFilterChips();
  initModal();
  initTripModal();
  initDirections();
  initSidebarToggle();
  initTabs();
  initAddLocationBtn();
}

// ── Search ────────────────────────────────────────────────────────────────────
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
      locations   = data.locations   || [];
      itineraries = data.itineraries || [];
      notesLists  = data.notesLists  || [];
      if (notesLists.length === 0) seedNotesLists();
      locations.forEach(addMarker);
      renderLocationsTab();
      renderItineraryTab();
      renderNotesTab();
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
    body: JSON.stringify({ locations, itineraries, notesLists }),
  });
}

// ── Markers ───────────────────────────────────────────────────────────────────
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
    if (directionsMode) onDirectionsMarkerClick(loc);
    else openModal({ id: loc.id });
  });

  markers[loc.id] = marker;
  applyFilterToMarker(loc.id);
}

function updateMarkerIcon(id, role) {
  const loc = locations.find(l => l.id === id);
  if (loc && markers[id]) markers[id].setIcon(markerIcon(loc.status, role, loc.name));
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
  const count   = visible.length;

  // Stats
  document.getElementById('stat-total').textContent   = locations.length;
  document.getElementById('stat-visited').textContent = locations.filter(l => l.status === 'visited').length;
  document.getElementById('stat-planned').textContent = locations.filter(l => l.status === 'plan').length;

  // Toggle button count
  const toggleCount = document.getElementById('toggle-count');
  if (toggleCount) toggleCount.textContent = count;

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

    // Header click → pan + open modal
    li.querySelector('.loc-card-header').addEventListener('click', () => {
      closeSidebarDrawer();
      map.panTo({ lat: loc.lat, lng: loc.lng });
      map.setZoom(14);
      openModal({ id: loc.id });
    });

    // Quick status buttons
    li.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const newStatus = btn.dataset.status;
        loc.status = newStatus;
        updateMarkerIcon(loc.id);
        saveData();
        renderLocationsTab();
      });
    });

    // Inline notes auto-save
    const notesTA = li.querySelector('.loc-notes-input');
    notesTA.addEventListener('blur', () => {
      loc.notes = notesTA.value.trim();
      saveData();
    });

    // Delete button
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
}

function openModal({ id, place } = {}) {
  editingId = id || null;
  const overlay    = document.getElementById('modal-overlay');
  const title      = document.getElementById('modal-title');
  const nameInput  = document.getElementById('modal-name');
  const notesInput = document.getElementById('modal-notes');
  const catSelect  = document.getElementById('modal-category');
  const deleteBtn  = document.getElementById('modal-delete');

  if (id) {
    const loc = locations.find(l => l.id === id);
    title.textContent   = 'Edit Location';
    nameInput.value     = loc.name;
    notesInput.value    = loc.notes || '';
    catSelect.value     = loc.category || '';
    setRadio(loc.status);
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent   = 'Add Location';
    nameInput.value     = place.name;
    notesInput.value    = '';
    catSelect.value     = '';
    setRadio('visited');
    deleteBtn.classList.add('hidden');
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

  if (editingId) {
    const loc = locations.find(l => l.id === editingId);
    loc.status   = status;
    loc.notes    = notes;
    loc.category = category;
    updateMarkerIcon(editingId);
  } else if (pendingPlace) {
    const loc = {
      id: crypto.randomUUID(),
      name: pendingPlace.name,
      lat: pendingPlace.lat,
      lng: pendingPlace.lng,
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
    resetDirMarkers();
    dirDest = null;
    clearRouteDisplay();
    setDirOrigin(point);
  }
}

function setDirOrigin(point) {
  dirOrigin = point;
  document.getElementById('dir-origin-name').textContent = point.name;
  document.getElementById('dir-origin-name').className   = 'dir-value set-origin';
  document.getElementById('dir-hint').textContent = 'Now click a pin to set the destination.';
  const loc = locations.find(l => Math.abs(l.lat - point.lat) < 0.0001);
  if (loc) updateMarkerIcon(loc.id, 'origin');
}

function setDirDest(point) {
  dirDest = point;
  document.getElementById('dir-dest-name').textContent = point.name;
  document.getElementById('dir-dest-name').className   = 'dir-value set-dest';
  document.getElementById('dir-hint').textContent = '';
  const loc = locations.find(l => Math.abs(l.lat - point.lat) < 0.0001);
  if (loc) updateMarkerIcon(loc.id, 'dest');
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      resetDirMarkers(); dirOrigin = null; dirDest = null; clearRouteDisplay();
      setDirOrigin({ name: 'My Location', lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    () => alert('Could not get your location.')
  );
}

function drawRoute() {
  if (!dirOrigin || !dirDest) return;
  directionsService.route(
    { origin: { lat: dirOrigin.lat, lng: dirOrigin.lng },
      destination: { lat: dirDest.lat, lng: dirDest.lng },
      travelMode: google.maps.TravelMode.DRIVING },
    (result, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        document.getElementById('dir-summary').textContent = `${leg.distance.text} · ${leg.duration.text}`;
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
  if (dirOrigin) { const l = locations.find(l => Math.abs(l.lat - dirOrigin.lat) < 0.0001); if (l) updateMarkerIcon(l.id); }
  if (dirDest)   { const l = locations.find(l => Math.abs(l.lat - dirDest.lat)   < 0.0001); if (l) updateMarkerIcon(l.id); }
}

function clearDirections() {
  resetDirMarkers();
  dirOrigin = null; dirDest = null;
  clearRouteDisplay();
  document.getElementById('dir-origin-name').textContent = '—';
  document.getElementById('dir-origin-name').className   = 'dir-value';
  document.getElementById('dir-dest-name').textContent   = '—';
  document.getElementById('dir-dest-name').className     = 'dir-value';
  document.getElementById('dir-hint').textContent = 'Click a pin on the map to set the start point, or use My Location.';
}

function openInGoogleMaps() {
  if (!dirOrigin || !dirDest) return;
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${dirOrigin.lat},${dirOrigin.lng}&destination=${dirDest.lat},${dirDest.lng}&travelmode=driving`, '_blank');
}

function openInWaze() {
  if (!dirDest) return;
  window.open(`https://waze.com/ul?ll=${dirDest.lat},${dirDest.lng}&navigate=yes`, '_blank');
}

// ── Itinerary Tab ─────────────────────────────────────────────────────────────
function initTripModal() {
  document.getElementById('add-trip-btn').addEventListener('click', () => openTripModal());
  document.getElementById('trip-modal-save').addEventListener('click', onTripModalSave);
  document.getElementById('trip-modal-cancel').addEventListener('click', closeTripModal);
  document.getElementById('trip-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('trip-modal-overlay')) closeTripModal();
  });
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

    const categoryOptions = CATEGORIES.map(c =>
      `<option value="${escapeHtml(c)}">${escapeHtml(c || '— Category —')}</option>`
    ).join('');

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
        ${trip.notes ? `
        <div class="trip-notes-section">
          <textarea class="trip-notes-input" rows="2" placeholder="Trip notes…">${escapeHtml(trip.notes)}</textarea>
        </div>` : `
        <div class="trip-notes-section">
          <textarea class="trip-notes-input" rows="2" placeholder="Trip notes…"></textarea>
        </div>`}
        <div class="trip-items-list">${itemsHtml}</div>
        <div class="add-trip-item-form">
          <input class="new-item-name" type="text" placeholder="Place name (e.g. Masada)" />
          <div class="add-trip-item-form-row">
            <input class="new-item-date" type="date" />
            <select class="new-item-category">${categoryOptions}</select>
          </div>
          <input class="new-item-notes" type="text" placeholder="Notes (optional)" />
          <button class="add-item-btn">+ Add Place</button>
        </div>
      </div>`;

    // Toggle collapse
    card.querySelector('.trip-header').addEventListener('click', e => {
      if (e.target.closest('.trip-delete-btn')) return;
      card.classList.toggle('open');
    });

    // Delete trip
    card.querySelector('.trip-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteTrip(trip.id);
    });

    // Notes auto-save
    card.querySelector('.trip-notes-input').addEventListener('blur', function() {
      trip.notes = this.value.trim();
      saveData();
    });

    // Item status cycle
    card.querySelectorAll('.trip-item-status-btn').forEach(btn => {
      const itemId = btn.closest('.trip-item').dataset.itemId;
      btn.addEventListener('click', () => cycleTripItemStatus(trip.id, itemId));
    });

    // Item delete
    card.querySelectorAll('.trip-item-delete').forEach(btn => {
      const itemId = btn.closest('.trip-item').dataset.itemId;
      btn.addEventListener('click', () => deleteTripItem(trip.id, itemId));
    });

    // Add item
    card.querySelector('.add-item-btn').addEventListener('click', () => {
      const name = card.querySelector('.new-item-name').value.trim();
      if (!name) { card.querySelector('.new-item-name').focus(); return; }
      addTripItem(trip.id, {
        name,
        date:     card.querySelector('.new-item-date').value,
        category: card.querySelector('.new-item-category').value,
        notes:    card.querySelector('.new-item-notes').value.trim(),
      });
    });

    // Add on Enter in name field
    card.querySelector('.new-item-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') card.querySelector('.add-item-btn').click();
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

    // Title edit auto-save
    card.querySelector('.notes-card-title').addEventListener('blur', function() {
      list.title = this.value.trim() || list.title;
      saveData();
    });

    // Delete list
    card.querySelector('.notes-list-delete').addEventListener('click', () => deleteNoteList(list.id));

    // Checkboxes
    card.querySelectorAll('.note-item').forEach(row => {
      const itemId = row.dataset.itemId;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleNoteItem(list.id, itemId));
      row.querySelector('.note-item-delete').addEventListener('click', () => deleteNoteItem(list.id, itemId));
    });

    // Add item
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
