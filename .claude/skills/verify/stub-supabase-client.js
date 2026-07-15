/**
 * STUB do cliente Supabase para verificação local (sem rede).
 * Servido no lugar de js/supabase-client.js via interceptação do puppeteer.
 * Store em localStorage para que persistência sobreviva a F5.
 */
const USER = { id: 'stub-user-1', email: 'stub@teste.dev' };
const DB_KEY = '__stub_db__';

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {
    trades: [],
    user_preferences: [{ user_id: USER.id, active_block_index: 1, theme: 'dark' }],
    trading_plans: []
  };
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

let idSeq = 1;
function nextId() { return 'stub-id-' + (Date.now() + '-' + (idSeq++)); }

function matches(row, filters) {
  return filters.every(f => String(row[f.col]) === String(f.val));
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.orders = [];
    this.payload = null;
    this.wantSingle = false;
    this.wantMaybe = false;
    this.returning = false;
  }
  select() { if (this.op !== 'select') this.returning = true; return this; }
  eq(col, val) { this.filters.push({ col, val }); return this; }
  order(col, opts) { this.orders.push({ col, asc: !opts || opts.ascending !== false }); return this; }
  maybeSingle() { this.wantMaybe = true; return this; }
  single() { this.wantSingle = true; return this; }
  insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
  update(payload) { this.op = 'update'; this.payload = payload; return this; }
  upsert(payload, opts) { this.op = 'upsert'; this.payload = payload; this.onConflict = (opts && opts.onConflict) || 'id'; return this; }
  delete() { this.op = 'delete'; return this; }

  _exec() {
    const db = loadDB();
    const rows = db[this.table] || (db[this.table] = []);
    let result = null;

    if (this.op === 'select') {
      let out = rows.filter(r => matches(r, this.filters));
      for (const o of [...this.orders].reverse()) {
        out = out.slice().sort((a, b) => (a[o.col] > b[o.col] ? 1 : a[o.col] < b[o.col] ? -1 : 0) * (o.asc ? 1 : -1));
      }
      result = out;
    } else if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = list.map(p => ({ id: nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p }));
      rows.push(...inserted);
      result = inserted;
    } else if (this.op === 'update') {
      const hit = [];
      for (const r of rows) {
        if (matches(r, this.filters)) { Object.assign(r, this.payload, { updated_at: new Date().toISOString() }); hit.push(r); }
      }
      result = hit;
    } else if (this.op === 'upsert') {
      const key = this.onConflict;
      const idx = rows.findIndex(r => String(r[key]) === String(this.payload[key]));
      if (idx >= 0) rows[idx] = { ...rows[idx], ...this.payload, updated_at: new Date().toISOString() };
      else rows.push({ ...this.payload, updated_at: new Date().toISOString() });
      result = [this.payload];
    } else if (this.op === 'delete') {
      db[this.table] = rows.filter(r => !matches(r, this.filters));
      result = [];
    }

    saveDB(db);

    let data = result;
    if (this.wantSingle || this.wantMaybe) {
      data = result && result.length ? result[0] : null;
      if (this.wantSingle && data === null) return { data: null, error: { message: 'stub: nenhuma linha (single)' } };
    }
    return { data, error: null };
  }

  then(resolve, reject) {
    try { resolve(this._exec()); } catch (e) { resolve({ data: null, error: { message: String(e) } }); }
  }
}

const session = { user: USER, access_token: 'stub-token' };
const authListeners = [];

export const supabase = {
  auth: {
    async getSession() { return { data: { session }, error: null }; },
    async refreshSession() { return { data: { session }, error: null }; },
    async getUser() { return { data: { user: USER }, error: null }; },
    async signInWithPassword() { return { data: { session, user: USER }, error: null }; },
    async signUp() { return { data: { session, user: USER }, error: null }; },
    async signOut() {
      // Como o SDK real: notifica os listeners para o app reagir ao logout
      setTimeout(() => authListeners.forEach(cb => cb('SIGNED_OUT', null)), 0);
      return { error: null };
    },
    async resetPasswordForEmail() { return { error: null }; },
    onAuthStateChange(cb) {
      authListeners.push(cb);
      setTimeout(() => cb('SIGNED_IN', session), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    }
  },
  from(table) { return new Query(table); },
  channel(name) {
    return { on() { return this; }, subscribe() { return this; } };
  },
  removeChannel() {}
};
