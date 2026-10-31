/*
 * Minimal in-memory stand-in for firebase-admin, just enough for the Netlify
 * Functions in this project. Used ONLY by tests/run-tests.js (never deployed).
 */
const crypto = require("crypto");

const store = new Map(); // "col/doc" or "col/doc/sub/doc" -> data

class Timestamp {
    constructor(ms) { this._ms = ms; }
    static fromMillis(ms) { return new Timestamp(ms); }
    toMillis() { return this._ms; }
    toDate() { return new Date(this._ms); }
}
class Increment { constructor(n) { this.n = n; } }
const DELETE = { __delete: true };
const SERVER_TS = { __serverTimestamp: true };

const clone = value => {
    if (value instanceof Timestamp) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === "object") {
        const out = {};
        Object.keys(value).forEach(k => { out[k] = clone(value[k]); });
        return out;
    }
    return value;
};

function applyValue(old, val) {
    if (val === SERVER_TS) return Timestamp.fromMillis(Date.now());
    if (val instanceof Increment) return (typeof old === "number" ? old : 0) + val.n;
    if (val instanceof Timestamp || Array.isArray(val) || val === null || typeof val !== "object") return clone(val);
    return mergeObj(old && typeof old === "object" && !(old instanceof Timestamp) ? old : {}, val);
}
function mergeObj(base, incoming) {
    const out = clone(base);
    Object.keys(incoming).forEach(k => {
        if (incoming[k] === DELETE) { delete out[k]; return; }
        out[k] = applyValue(base[k], incoming[k]);
    });
    return out;
}

const randomId = () => crypto.randomBytes(10).toString("hex");
const err = (code, message) => Object.assign(new Error(message), { code });

class DocSnap {
    constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
    data() { return this._d === undefined ? undefined : clone(this._d); }
}
class QuerySnap {
    constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
    forEach(fn) { this.docs.forEach(fn); }
}

class DocRef {
    constructor(path) { this.path = path; this.id = path.split("/").pop(); }
    async get() { return new DocSnap(this, store.get(this.path)); }
    async set(data, opts) { applyWrite({ op: "set", ref: this, data, merge: !!(opts && opts.merge) }); }
    async create(data) { applyWrite({ op: "create", ref: this, data }); }
    async update(data) { applyWrite({ op: "update", ref: this, data }); }
    async delete() { applyWrite({ op: "delete", ref: this }); }
    collection(name) { return new CollectionRef(this.path + "/" + name); }
}

function applyWrite(w) {
    const path = w.ref.path;
    const old = store.get(path);
    if (w.op === "create") {
        if (old !== undefined) throw err(6, "ALREADY_EXISTS");
        store.set(path, mergeObj({}, w.data));
    } else if (w.op === "set") {
        store.set(path, w.merge && old ? mergeObj(old, w.data) : mergeObj({}, w.data));
    } else if (w.op === "update") {
        if (old === undefined) throw err(5, "NOT_FOUND");
        store.set(path, mergeObj(old, w.data));
    } else if (w.op === "delete") {
        store.delete(path);
    }
}

class Query {
    constructor(colPath, filters, limitN, order) { this.colPath = colPath; this.filters = filters || []; this.limitN = limitN; this.order = order; }
    where(field, op, value) { return new Query(this.colPath, this.filters.concat([[field, op, value]]), this.limitN, this.order); }
    limit(n) { return new Query(this.colPath, this.filters, n, this.order); }
    orderBy(field, dir) { return new Query(this.colPath, this.filters, this.limitN, [field, dir || "asc"]); }
    _docs() {
        const prefix = this.colPath + "/";
        let out = [];
        for (const [path, data] of store.entries()) {
            if (!path.startsWith(prefix)) continue;
            if (path.slice(prefix.length).includes("/")) continue;
            const ok = this.filters.every(([f, op, v]) => {
                const actual = data[f];
                if (op === "==") return actual === v;
                if (op === "in") return v.includes(actual);
                throw new Error("fake: unsupported op " + op);
            });
            if (ok) out.push(new DocSnap(new DocRef(path), data));
        }
        if (this.order) {
            const [field, dir] = this.order;
            const key = snap => { const v = snap._d[field]; return v instanceof Timestamp ? v.toMillis() : (v === undefined ? 0 : v); };
            out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === "desc" ? -1 : 1));
        }
        if (this.limitN) out = out.slice(0, this.limitN);
        return out;
    }
    async get() { return new QuerySnap(this._docs()); }
    count() { return { __count: true, query: this, async get() { return { data: () => ({ count: this.query._docs().length }) }; } }; }
}

class CollectionRef extends Query {
    constructor(path) { super(path, [], undefined, undefined); this.path = path; }
    doc(id) { return new DocRef(this.path + "/" + (id || randomId())); }
}

class Transaction {
    constructor() { this.writes = []; }
    async get(x) {
        if (x && x.__count) return x.get();
        return x.get();
    }
    async getAll(...refs) { return Promise.all(refs.map(r => r.get())); }
    create(ref, data) { this.writes.push({ op: "create", ref, data }); return this; }
    set(ref, data, opts) { this.writes.push({ op: "set", ref, data, merge: !!(opts && opts.merge) }); return this; }
    update(ref, data) { this.writes.push({ op: "update", ref, data }); return this; }
    delete(ref) { this.writes.push({ op: "delete", ref }); return this; }
}
function commitAtomically(writes) {
    const snapshot = new Map(store);
    try { writes.forEach(applyWrite); } catch (e) { store.clear(); snapshot.forEach((v, k) => store.set(k, v)); throw e; }
}

const db = {
    collection: name => new CollectionRef(name),
    async runTransaction(fn) {
        const tx = new Transaction();
        const result = await fn(tx);
        commitAtomically(tx.writes);
        return result;
    },
    async getAll(...refs) { return Promise.all(refs.map(r => r.get())); },
    batch() {
        const b = new Transaction();
        b.commit = async () => { commitAtomically(b.writes); };
        return b;
    }
};

const users = new Map(); // email -> uid
const auth = {
    async verifyIdToken(token) {
        if (token === "expired") throw err("auth/id-token-expired", "expired");
        const [uid, email, matricNumber] = String(token).split("|");
        if (!uid) throw err("auth/argument-error", "bad token");
        return { uid, email: email || "", ...(matricNumber ? { matricNumber } : {}) };
    },
    async createCustomToken(uid, claims) { return "custom:" + uid + ":" + JSON.stringify(claims || {}); },
    async getUserByEmail(email) {
        if (!users.has(email)) throw err("auth/user-not-found", "none");
        return { uid: users.get(email), email };
    },
    async createUser({ email }) {
        if (users.has(email)) throw err("auth/email-already-exists", "dup");
        const uid = "auth-" + randomId();
        users.set(email, uid);
        return { uid, email };
    },
    async deleteUser(uid) { for (const [e, u] of users) if (u === uid) users.delete(e); }
};

function firestore() { return db; }
firestore.FieldValue = { serverTimestamp: () => SERVER_TS, increment: n => new Increment(n), delete: () => DELETE };
firestore.Timestamp = Timestamp;

const fake = {
    apps: [],
    initializeApp() { fake.apps.push({}); },
    credential: { cert: () => ({}) },
    firestore,
    auth: () => auth,
    __store: store,
    __users: users,
    __reset() { store.clear(); users.clear(); }
};

module.exports = fake;
