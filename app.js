document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('titleHeader');
  let asc = true;
  let hideOwned = false;
  const hideBtn = document.getElementById('toggleHideOwned');
  hideBtn.addEventListener('click', () => {
    hideOwned = !hideOwned;
    hideBtn.textContent = hideOwned ? 'Show Owned' : 'Hide Owned';
    state.filtered = state.all.filter(item => {
      const owned = !!state.ownedMap.get(normalizeTitle(item.Title));
      return hideOwned ? !owned : true;
    });
    renderTable();
  });
  header.addEventListener('click', () => {
    asc = !asc;
    state.filtered.sort((a, b) => {
      const ta = (a.Title || '').toLowerCase();
      const tb = (b.Title || '').toLowerCase();
      return asc ? ta.localeCompare(tb) : tb.localeCompare(ta);
    });
    renderTable();
    header.textContent = asc ? 'Title ▲' : 'Title ▼';
  });
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
  const q = document.getElementById('search').value.toLowerCase().trim();
  state.filtered = state.all.filter(item => {
    const matchesQ =
      !q ||
      (item.Title || '').toLowerCase().includes(q) ||
      (state.notesMap.get(normalizeTitle(item.Title)) || '').toLowerCase().includes(q);
    return matchesQ;
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

async function main() {
  const data = await fetchCSV('dune_unique_schematics.csv');
  data.sort((a,b) => (a.Title || '').localeCompare(b.Title || ''));
  state.all = data;

  await loadLocalState();
  applyFilters();

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('exportOwned').addEventListener('click', exportOwnedCSV);
}

main().catch(err => {
  console.error(err);
  alert('Failed to load data. Ensure dune_unique_schematics.csv exists in the same folder.');
});