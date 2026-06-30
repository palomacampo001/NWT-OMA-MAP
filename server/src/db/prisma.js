const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bundledDbPath = path.resolve(__dirname, '../../data/indoor-map-db.json');
const dbPath = process.env.DB_PATH || (process.env.VERCEL ? path.join(os.tmpdir(), 'indoor-map-db.json') : bundledDbPath);
const tables = ['building', 'floor', 'uploadedFile', 'mapFeature', 'pOI', 'routeNode', 'routeEdge', 'qrAnchor', 'mapVersion'];

function id(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function now() {
  return new Date().toISOString();
}

function initialDb() {
  return Object.fromEntries(tables.map((table) => [table, []]));
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(bundledDbPath, 'utf8'));
    } catch {
      return initialDb();
    }
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return matches(row[key] || {}, value);
    return row[key] === value;
  });
}

function orderRows(rows, orderBy) {
  if (!orderBy) return rows;
  const orderItems = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orderItems) {
      const [key, direction] = Object.entries(order)[0];
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (av < bv) return direction === 'desc' ? 1 : -1;
      if (av > bv) return direction === 'desc' ? -1 : 1;
    }
    return 0;
  });
}

function attachIncludes(table, row, include) {
  if (!row || !include) return row;
  const db = load();
  const out = { ...row };
  if (table === 'building') {
    if (include.floors) {
      let floors = db.floor.filter((floor) => floor.buildingId === row.id);
      floors = orderRows(floors, include.floors.orderBy);
      if (include.floors.include) floors = floors.map((floor) => attachIncludes('floor', floor, include.floors.include));
      out.floors = floors;
    }
  }
  if (table === 'floor') {
    if (include.building) out.building = db.building.find((item) => item.id === row.buildingId);
    if (include.svgFile) out.svgFile = db.uploadedFile.find((item) => item.id === row.svgFileId);
    if (include.features) out.features = db.mapFeature.filter((item) => item.floorId === row.id);
    if (include.pois) out.pois = db.pOI.filter((item) => item.floorId === row.id);
    if (include.qrAnchors) out.qrAnchors = db.qrAnchor.filter((item) => item.floorId === row.id);
    if (include.routeNodes) out.routeNodes = db.routeNode.filter((item) => item.floorId === row.id);
    if (include.routeEdges) out.routeEdges = db.routeEdge.filter((item) => item.floorId === row.id);
  }
  if ((table === 'mapFeature' || table === 'pOI') && include.floor) out.floor = db.floor.find((item) => item.id === row.floorId);
  if (table === 'qrAnchor') {
    if (include.floor) out.floor = db.floor.find((item) => item.id === row.floorId);
    if (include.routeNode) out.routeNode = db.routeNode.find((item) => item.id === row.routeNodeId);
  }
  return out;
}

function model(table, prefix) {
  return {
    findMany({ where = {}, orderBy, include } = {}) {
      const db = load();
      return Promise.resolve(orderRows(db[table].filter((row) => matches(row, where)), orderBy).map((row) => attachIncludes(table, row, include)));
    },
    findUnique({ where, include }) {
      const db = load();
      const row = db[table].find((item) => matches(item, where));
      return Promise.resolve(attachIncludes(table, row || null, include));
    },
    findFirst({ where = {}, orderBy, include } = {}) {
      const db = load();
      const rows = orderRows(db[table].filter((row) => matches(row, where)), orderBy);
      return Promise.resolve(attachIncludes(table, rows[0] || null, include));
    },
    count({ where = {} } = {}) {
      const db = load();
      return Promise.resolve(db[table].filter((row) => matches(row, where)).length);
    },
    create({ data }) {
      const db = load();
      const row = { id: data.id || id(prefix), ...data, createdAt: data.createdAt || now(), updatedAt: data.updatedAt || now() };
      db[table].push(row);
      save(db);
      return Promise.resolve(row);
    },
    createMany({ data }) {
      const db = load();
      const rows = data.map((item) => ({ id: item.id || id(prefix), ...item, createdAt: item.createdAt || now(), updatedAt: item.updatedAt || now() }));
      db[table].push(...rows);
      save(db);
      return Promise.resolve({ count: rows.length });
    },
    update({ where, data }) {
      const db = load();
      const index = db[table].findIndex((row) => matches(row, where));
      if (index < 0) return Promise.reject(new Error(`${table} not found`));
      db[table][index] = { ...db[table][index], ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), updatedAt: now() };
      save(db);
      return Promise.resolve(db[table][index]);
    },
    updateMany({ where = {}, data }) {
      const db = load();
      let count = 0;
      db[table] = db[table].map((row) => {
        if (!matches(row, where)) return row;
        count += 1;
        return { ...row, ...data, updatedAt: now() };
      });
      save(db);
      return Promise.resolve({ count });
    },
    delete({ where }) {
      const db = load();
      const index = db[table].findIndex((row) => matches(row, where));
      if (index < 0) return Promise.reject(new Error(`${table} not found`));
      const [removed] = db[table].splice(index, 1);
      save(db);
      return Promise.resolve(removed);
    },
    deleteMany({ where = {} }) {
      const db = load();
      const before = db[table].length;
      db[table] = db[table].filter((row) => !matches(row, where));
      save(db);
      return Promise.resolve({ count: before - db[table].length });
    },
    upsert({ where, update, create }) {
      const db = load();
      const existing = db[table].find((row) => matches(row, where));
      if (existing) return this.update({ where, data: update });
      return this.create({ data: create });
    },
  };
}

const prisma = {
  building: model('building', 'building'),
  floor: model('floor', 'floor'),
  uploadedFile: model('uploadedFile', 'file'),
  mapFeature: model('mapFeature', 'feature'),
  pOI: model('pOI', 'poi'),
  routeNode: model('routeNode', 'node'),
  routeEdge: model('routeEdge', 'edge'),
  qrAnchor: model('qrAnchor', 'qr'),
  mapVersion: model('mapVersion', 'version'),
  $disconnect: () => Promise.resolve(),
};

module.exports = { prisma };
