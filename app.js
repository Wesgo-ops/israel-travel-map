// ── State ────────────────────────────────────────────────────────────────────
let map;
let locations = [];       // array of location objects
let markers = {};         // id → google.maps.Marker
let activeFilter = 'all';
let pendingPlace = null;  // place data waiting for modal confirmation
let editingId = null;     // id of location currently being edited

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
function markerIcon(status) {
  const s = STATUS[status];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <path d="M18 0C8 0 0 8 0 18c0 12 18 26 18 26S36 30 36 18C36 8 28 0 18 0z"
            fill="${s.bg}" stroke="white" stroke-width="2"/>
      <text x="18" y="24" text-anchor="middle" font-size="16" fill="white"
            font-family="Arial,sans-serif">${s.icon}</text>
    </svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(36, 44),
    anchor: new google.maps.Point(18, 44),
  };
}

function addMarker(loc) {
  const marker = new google.maps.Marker({
    position: { lat: loc.lat, lng: loc.lng },
    map,
    title: loc.name,
    icon: markerIcon(loc.status),
  });

  marker.addListener('click', () => openModal({ id: loc.id }));
  markers[loc.id] = marker;
  applyFilterToMarker(loc.id);
}

function updateMarkerIcon(id) {
  const loc = locations.find(l => l.id === id);
  if (loc && markers[id]) markers[id].setIcon(markerIcon(loc.status));
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

  document.getElementById('location-count').textContent =
    `${visible.length} location${visible.length !== 1 ? 's' : ''}`;

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
      map.panTo({ lat: loc.lat, lng: loc.lng });
      map.setZoom(14);
      openModal({ id: loc.id });
    });
    list.appendChild(li);
  });
}

// ── Filter chips ───────────────────────────────────────────────────────────────
function initFilterChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
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
