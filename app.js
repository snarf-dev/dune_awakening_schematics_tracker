document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('titleHeader');

  state.sortAsc = true;
  state.hideOwned = false;

  const hideBtn = document.getElementById('toggleHideOwned');
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      state.hideOwned = !state.hideOwned;
      hideBtn.textContent = state.hideOwned ? 'Show Owned' : 'Hide Owned';
      applyFilters();
    });
  }

  if (header) {
    header.addEventListener('click', () => {
      state.sortAsc = !state.sortAsc;
      header.textContent = state.sortAsc ? 'Title ▲' : 'Title ▼';
      applyFilters();
    });
  }
});

const db = (() => {
  const DB_NAME = 'dune-schematics-db';
  const STORE = 'owned';
  let _db;
  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => { _db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }
  async function get(key) {
    await openIfNeeded();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  async function set(key, value) {
    await openIfNeeded();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function keys() {
    await openIfNeeded();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      let req;
      const hasGetAllKeys = typeof store.getAllKeys === 'function';
      if (hasGetAllKeys) {
        req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } else {
        req = typeof store.openKeyCursor === 'function' ? store.openKeyCursor() : store.openCursor();
        const out = [];
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) { out.push(cursor.primaryKey || cursor.key); cursor.continue(); }
          else resolve(out);
        };
        req.onerror = () => reject(req.error);
      }
    });
  }
  function openIfNeeded() { return _db ? Promise.resolve() : open(); }
  return { get, set, keys };
})();

async function fetchCSV(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(csv) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < csv.length) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        if (c === '\r' && csv[i + 1] === '\n') i++;
      } else { field += c; }
    }
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? '').trim());
    return obj;
  });
}

const state = {
  all: [],
  filtered: [],
  ownedMap: new Map(),
  notesMap: new Map(),
  sortAsc: true,
  hideOwned: false,
};

function normalizeTitle(t) {
  return (t || '').toLowerCase().trim();
}

async function loadLocalState() {
  state.ownedMap.clear();
  state.notesMap.clear();
  const keys = await db.keys();
  await Promise.all(keys.map(async k => {
    const v = await db.get(k);
    if (k.startsWith('owned:')) {
      state.ownedMap.set(k.slice(6), v === true);
    } else if (k.startsWith('notes:')) {
      state.notesMap.set(k.slice(6), String(v || ''));
    } else {
      state.ownedMap.set(k, v === true);
    }
  }));
}

function applyFilters() {
  const q = document.getElementById('search')?.value.toLowerCase().trim() || '';
  const hide = !!state.hideOwned;
  state.filtered = state.all.filter(item => {
    const matchesQ =
      !q ||
      (item.Title || '').toLowerCase().includes(q) ||
      (state.notesMap.get(normalizeTitle(item.Title)) || '').toLowerCase().includes(q);
    if (!matchesQ) return false;
    const owned = !!state.ownedMap.get(normalizeTitle(item.Title));
    if (hide && owned) return false;
    return true;
  });
  state.filtered.sort((a, b) => {
    const ta = (a.Title || '').toLowerCase();
    const tb = (b.Title || '').toLowerCase();
    return state.sortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta);
  });
  renderTable();
}

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text ?? '';
  return td;
}

function renderTable() {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  for (const item of state.filtered) {
    const tr = document.createElement('tr');

    const key = normalizeTitle(item.Title);

    const ownedTD = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!state.ownedMap.get(key);
    checkbox.addEventListener('change', async () => {
      await db.set('owned:' + key, checkbox.checked);
      state.ownedMap.set(key, checkbox.checked);
      applyFilters();
    });
    ownedTD.appendChild(checkbox);
    tr.appendChild(ownedTD);

    const imgCell = document.createElement('td');
    if (item.ImageURL) {
      imgCell.innerHTML = `
        <a href="${item.ImageURL}" target="_blank" rel="noopener">
          <img src="${item.ImageURL}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee;"/>
        </a>`;
    } else {
      imgCell.textContent = '';
    }
    tr.appendChild(imgCell);

    const titleTD = document.createElement('td');
    titleTD.className = 'title-col';
    if (item.PageURL) {
      const a = document.createElement('a');
      a.href = item.PageURL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = item.Title || '';
      titleTD.appendChild(a);
    } else {
      titleTD.textContent = item.Title || '';
    }
    tr.appendChild(titleTD);

    const notesCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a note…';
    input.value = state.notesMap.get(key) || '';
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const val = input.value;
        state.notesMap.set(key, val);
        await db.set('notes:' + key, val);
      }, 250);
    });
    notesCell.appendChild(input);
    tr.appendChild(notesCell);

    tbody.appendChild(tr);
  }
}

function exportOwnedCSV() {
  const headers = ['Title','ImageURL','PageURL','Notes'];
  const ownedSet = new Set([...state.ownedMap.entries()].filter(([,v]) => v).map(([k]) => k));
  const rows = state.all.filter(x => ownedSet.has(normalizeTitle(x.Title)));
  const lines = [headers.join(',')];
  for (const r of rows) {
    const notes = state.notesMap.get(normalizeTitle(r.Title)) || '';
    const vals = [r.Title || '', r.ImageURL || '', r.PageURL || '', notes].map(v => String(v).replaceAll('"','""'));
    lines.push('"' + vals.join('","') + '"');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'owned_schematics.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function importOwnedCSVFile(file) {
  const text = await file.text();
  const rows = parseCSV(text);
  if (!rows.length) return alert('No rows found in CSV.');

  const headerLine = text.split(/\r?\n/)[0];
  const headers = headerLine.split(',').map(h => h.replace(/(^\"|\"$)/g,'').trim().toLowerCase());
  const titleKey = headers.find(h => h === 'title');
  if (!titleKey) return alert('CSV must include a Title column.');
  const notesKey = headers.find(h => h === 'notes');

  let ownedCount = 0;
  for (const r of rows) {
    const title = (r.Title || r.title || '').trim();
    if (!title) continue;
    const key = normalizeTitle(title);

    await db.set('owned:' + key, true);
    state.ownedMap.set(key, true);
    ownedCount++;

    const notes = (r.Notes || r.notes || '').trim();
    if (notesKey && notes) {
      await db.set('notes:' + key, notes);
      state.notesMap.set(key, notes);
    }
  }

  applyFilters();
  alert(`Imported ${ownedCount} owned items${notesKey ? ' (with notes where present)' : ''}.`);
}

async function main() {
  const data = await fetchCSV('dune_unique_schematics.csv');
  data.sort((a,b) => (a.Title || '').localeCompare(b.Title || ''));
  state.all = data;

  await loadLocalState();
  applyFilters();

  const header = document.getElementById('titleHeader');
  if (header) header.textContent = state.sortAsc ? 'Title ▲' : 'Title ▼';
  const hideBtn = document.getElementById('toggleHideOwned');
  if (hideBtn) hideBtn.textContent = state.hideOwned ? 'Show Owned' : 'Hide Owned';

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('exportOwned').addEventListener('click', exportOwnedCSV);

  const importInput = document.getElementById('importOwned');
  const importBtn = document.getElementById('importOwnedBtn');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importOwnedCSVFile(file);
    } finally {
      e.target.value = '';
    }
  });
}

main().catch(err => {
  console.error(err);
  alert('Failed to load data. Ensure dune_unique_schematics.csv exists in the same folder.');
});