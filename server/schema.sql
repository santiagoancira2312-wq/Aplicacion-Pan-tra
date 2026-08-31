-- ============================================================================
-- DEMO APLICACION - VALES, INVENTARIO Y CONTROL DE MATERIALES
-- Modelo de datos. Fuente unica de verdad. Excel solo para exportacion.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- CONFIGURACION (editable por el Administrador sin tocar codigo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  descripcion TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  INTEGER
);

-- ---------------------------------------------------------------------------
-- ORGANIZACION
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo     TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  descripcion TEXT,
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trailers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  numero        TEXT NOT NULL UNIQUE,
  modelo        TEXT,
  tamano        TEXT,
  cliente       TEXT,
  tipo_config   TEXT,
  fecha_inicio  TEXT,
  fecha_fin     TEXT,
  estado        TEXT NOT NULL DEFAULT 'EN_PROCESO'
                CHECK (estado IN ('PLANEADO','EN_PROCESO','TERMINADO','CERRADO')),
  activo        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- USUARIOS Y SEGURIDAD
-- Roles: ADMIN | SUPERVISOR | TRABAJADOR | ALMACEN | DIRECCION
-- Empresa: INTERNA | REYNA   (mismo inventario fisico, distinta responsable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,
  email          TEXT UNIQUE,
  rol            TEXT NOT NULL CHECK (rol IN ('ADMIN','DIRECCION','SUPERVISOR','ALMACEN','TRABAJADOR')),
  empresa        TEXT NOT NULL DEFAULT 'INTERNA' CHECK (empresa IN ('INTERNA','REYNA')),
  area_id        INTEGER REFERENCES areas(id),
  supervisor_id  INTEGER REFERENCES users(id),
  telefono       TEXT,
  pin_hash       TEXT,              -- scrypt, nunca texto plano
  password_hash  TEXT,              -- scrypt, nunca texto plano
  twofa_secret   TEXT,              -- base32 TOTP
  twofa_enabled  INTEGER NOT NULL DEFAULT 0,
  activo         INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_rol ON users(rol, activo);
CREATE INDEX IF NOT EXISTS idx_users_area ON users(area_id);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,           -- hash del token, nunca el token
  user_id       INTEGER NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL DEFAULT 'PIN' CHECK (kind IN ('PIN','PASSWORD')),
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  ip         TEXT,
  ok         INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(identifier, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip, created_at);

-- ---------------------------------------------------------------------------
-- CATALOGO DE MATERIALES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unidades (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo   TEXT NOT NULL UNIQUE,     -- PZA, MTS, LTS, KG, ROLLO...
  nombre   TEXT NOT NULL,
  decimales INTEGER NOT NULL DEFAULT 0,
  activo   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categorias (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT NOT NULL,
  parent_id INTEGER REFERENCES categorias(id),
  activo    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (nombre, parent_id)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT NOT NULL UNIQUE,
  contacto  TEXT,
  telefono  TEXT,
  email     TEXT,
  lead_time_dias INTEGER NOT NULL DEFAULT 7,
  activo    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS materiales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,          -- nombre OFICIAL, nunca texto libre del trabajador
  descripcion    TEXT,
  categoria_id   INTEGER REFERENCES categorias(id),
  subcategoria_id INTEGER REFERENCES categorias(id),
  unidad_id      INTEGER NOT NULL REFERENCES unidades(id),
  stock_fisico   REAL NOT NULL DEFAULT 0,
  stock_min      REAL NOT NULL DEFAULT 0,
  stock_max      REAL NOT NULL DEFAULT 0,
  punto_reorden  REAL NOT NULL DEFAULT 0,
  costo          REAL NOT NULL DEFAULT 0,   -- costo unitario vigente
  ubicacion      TEXT,
  proveedor_id   INTEGER REFERENCES proveedores(id),
  foto           TEXT,
  activo         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mat_nombre ON materiales(nombre);
CREATE INDEX IF NOT EXISTS idx_mat_cat ON materiales(categoria_id);

CREATE TABLE IF NOT EXISTS material_alias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (material_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_alias ON material_alias(alias);

-- Historial de costos: el precio usado al entregar NO cambia retroactivamente
CREATE TABLE IF NOT EXISTS material_costos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  costo       REAL NOT NULL,
  vigente_desde TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     INTEGER REFERENCES users(id),
  motivo      TEXT
);
CREATE INDEX IF NOT EXISTS idx_costos ON material_costos(material_id, vigente_desde);

-- ---------------------------------------------------------------------------
-- KITS (con versionado: un vale antiguo conserva la version que uso)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  area_id     INTEGER REFERENCES areas(id),
  descripcion TEXT,
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kit_versiones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id     INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','HISTORICA','BORRADOR')),
  notas      TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kit_id, version)
);

CREATE TABLE IF NOT EXISTS kit_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_version_id    INTEGER NOT NULL REFERENCES kit_versiones(id) ON DELETE CASCADE,
  material_id       INTEGER NOT NULL REFERENCES materiales(id),
  cantidad_estandar REAL NOT NULL,
  unidad_id         INTEGER NOT NULL REFERENCES unidades(id),
  notas             TEXT,
  orden             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kit_items ON kit_items(kit_version_id);

-- ---------------------------------------------------------------------------
-- VALES
-- Estados: PENDIENTE -> APROBADO/APROBADO_PARCIAL/RECHAZADO/CORRECCION
--          -> EN_PREPARACION -> PREPARADO -> ENTREGA_PARCIAL -> ENTREGADO
--          -> CERRADO (pendiente cancelado con motivo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  folio           TEXT NOT NULL UNIQUE,
  trabajador_id   INTEGER NOT NULL REFERENCES users(id),
  empresa         TEXT NOT NULL CHECK (empresa IN ('INTERNA','REYNA')),
  area_id         INTEGER REFERENCES areas(id),
  supervisor_id   INTEGER REFERENCES users(id),
  trailer_id      INTEGER NOT NULL REFERENCES trailers(id),
  estado          TEXT NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE','APROBADO','APROBADO_PARCIAL','RECHAZADO',
                                    'CORRECCION','EN_PREPARACION','PREPARADO',
                                    'ENTREGA_PARCIAL','ENTREGADO','CERRADO','CANCELADO')),
  prioridad       TEXT NOT NULL DEFAULT 'NORMAL' CHECK (prioridad IN ('BAJA','NORMAL','ALTA','URGENTE')),
  notas           TEXT,
  motivo_rechazo_id INTEGER REFERENCES motivos_rechazo(id),
  comentario_rechazo TEXT,
  autorizado_por  INTEGER REFERENCES users(id),
  preparado_por   INTEGER REFERENCES users(id),
  entregado_por   INTEGER REFERENCES users(id),
  cerrado_por     INTEGER REFERENCES users(id),
  motivo_cierre   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  autorizado_at   TEXT,
  preparacion_at  TEXT,
  preparado_at    TEXT,
  entregado_at    TEXT,
  cerrado_at      TEXT,
  cierre_reyna_id INTEGER REFERENCES reyna_cierres(id)
);
CREATE INDEX IF NOT EXISTS idx_vales_estado ON vales(estado);
CREATE INDEX IF NOT EXISTS idx_vales_trab ON vales(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_vales_area ON vales(area_id);
CREATE INDEX IF NOT EXISTS idx_vales_trailer ON vales(trailer_id);
CREATE INDEX IF NOT EXISTS idx_vales_empresa ON vales(empresa, created_at);

-- Kits copiados a un vale (snapshot de la version usada)
CREATE TABLE IF NOT EXISTS vale_kits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vale_id        INTEGER NOT NULL REFERENCES vales(id) ON DELETE CASCADE,
  kit_id         INTEGER NOT NULL REFERENCES kits(id),
  kit_version_id INTEGER NOT NULL REFERENCES kit_versiones(id),
  codigo_snapshot TEXT NOT NULL,
  nombre_snapshot TEXT NOT NULL,
  version_snapshot INTEGER NOT NULL
);

-- REGLA FUNDAMENTAL: estandar / solicitada / autorizada / entregada SIEMPRE se conservan
CREATE TABLE IF NOT EXISTS vale_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  vale_id             INTEGER NOT NULL REFERENCES vales(id) ON DELETE CASCADE,
  material_id         INTEGER NOT NULL REFERENCES materiales(id),
  vale_kit_id         INTEGER REFERENCES vale_kits(id) ON DELETE CASCADE,
  sku_snapshot        TEXT NOT NULL,
  nombre_snapshot     TEXT NOT NULL,
  unidad_id           INTEGER NOT NULL REFERENCES unidades(id),
  cantidad_estandar   REAL,          -- del kit maestro (NULL si material suelto)
  cantidad_solicitada REAL NOT NULL,
  cantidad_autorizada REAL NOT NULL DEFAULT 0,
  cantidad_entregada  REAL NOT NULL DEFAULT 0,
  precio_unitario     REAL,          -- congelado al entregar (precio historico)
  importe             REAL NOT NULL DEFAULT 0,
  estado_linea        TEXT NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado_linea IN ('PENDIENTE','AUTORIZADA','RECHAZADA','PARCIAL','ENTREGADA','CERRADA')),
  motivo_linea        TEXT,
  orden               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vitems_vale ON vale_items(vale_id);
CREATE INDEX IF NOT EXISTS idx_vitems_mat ON vale_items(material_id);

CREATE TABLE IF NOT EXISTS motivos_rechazo (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  texto    TEXT NOT NULL UNIQUE,
  requiere_comentario INTEGER NOT NULL DEFAULT 0,
  activo   INTEGER NOT NULL DEFAULT 1,
  orden    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- ENTREGAS Y FIRMA DIGITAL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entregas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vale_id        INTEGER NOT NULL REFERENCES vales(id),
  almacenista_id INTEGER NOT NULL REFERENCES users(id),
  receptor_id    INTEGER REFERENCES users(id),
  receptor_nombre TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('TOTAL','PARCIAL')),
  firma_id       INTEGER REFERENCES firmas(id),
  notas          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entregas_vale ON entregas(vale_id);

CREATE TABLE IF NOT EXISTS entrega_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entrega_id    INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  vale_item_id  INTEGER NOT NULL REFERENCES vale_items(id),
  cantidad      REAL NOT NULL,
  precio_unitario REAL NOT NULL DEFAULT 0,
  importe       REAL NOT NULL DEFAULT 0
);

-- Firma capturada con el dedo. Nunca se reutiliza una firma anterior.
CREATE TABLE IF NOT EXISTS firmas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vale_id      INTEGER NOT NULL REFERENCES vales(id),
  entrega_id   INTEGER,
  firmante     TEXT NOT NULL,
  firmante_id  INTEGER REFERENCES users(id),
  almacenista_id INTEGER REFERENCES users(id),
  data_url     TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,       -- impide reutilizar una firma identica
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- MOVIMIENTOS DE INVENTARIO (trazabilidad completa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','DEVOLUCION','AJUSTE_POSITIVO',
                                              'AJUSTE_NEGATIVO','MERMA','DANO','CORRECCION')),
  material_id   INTEGER NOT NULL REFERENCES materiales(id),
  cantidad      REAL NOT NULL,             -- siempre positiva
  signo         INTEGER NOT NULL,          -- +1 entra, -1 sale
  stock_antes   REAL NOT NULL,
  stock_despues REAL NOT NULL,
  vale_id       INTEGER REFERENCES vales(id),
  vale_item_id  INTEGER REFERENCES vale_items(id),
  entrega_id    INTEGER REFERENCES entregas(id),
  entrada_id    INTEGER REFERENCES entradas(id),
  empresa       TEXT CHECK (empresa IN ('INTERNA','REYNA')),
  trailer_id    INTEGER REFERENCES trailers(id),
  area_id       INTEGER REFERENCES areas(id),
  precio_unitario REAL NOT NULL DEFAULT 0,
  importe       REAL NOT NULL DEFAULT 0,
  motivo        TEXT,
  referencia    TEXT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mov_mat ON movimientos(material_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimientos(tipo, created_at);
CREATE INDEX IF NOT EXISTS idx_mov_empresa ON movimientos(empresa, created_at);
CREATE INDEX IF NOT EXISTS idx_mov_vale ON movimientos(vale_id);

-- Entradas de almacen
CREATE TABLE IF NOT EXISTS entradas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  folio         TEXT NOT NULL UNIQUE,
  proveedor_id  INTEGER REFERENCES proveedores(id),
  orden_compra  TEXT,
  fecha         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  notas         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entrada_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entrada_id  INTEGER NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  cantidad    REAL NOT NULL,
  costo       REAL NOT NULL DEFAULT 0,
  unidad_id   INTEGER REFERENCES unidades(id)
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vale_id       INTEGER NOT NULL REFERENCES vales(id),
  almacenista_id INTEGER NOT NULL REFERENCES users(id),
  motivo        TEXT NOT NULL,
  notas         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devolucion_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_id  INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  vale_item_id   INTEGER NOT NULL REFERENCES vale_items(id),
  material_id    INTEGER NOT NULL REFERENCES materiales(id),
  cantidad       REAL NOT NULL,
  precio_unitario REAL NOT NULL DEFAULT 0,
  importe        REAL NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- REYNA: estado de cuenta y cierre mensual
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reyna_cierres (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo     TEXT NOT NULL UNIQUE,     -- YYYY-MM
  total       REAL NOT NULL DEFAULT 0,
  lineas      INTEGER NOT NULL DEFAULT 0,
  estado      TEXT NOT NULL DEFAULT 'CERRADO' CHECK (estado IN ('ABIERTO','CERRADO')),
  cerrado_por INTEGER REFERENCES users(id),
  cerrado_at  TEXT NOT NULL DEFAULT (datetime('now')),
  notas       TEXT
);

-- Ajustes posteriores a un cierre (nunca se modifica el movimiento original)
CREATE TABLE IF NOT EXISTS reyna_ajustes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cierre_id  INTEGER NOT NULL REFERENCES reyna_cierres(id),
  importe    REAL NOT NULL,
  motivo     TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- AUDITORIA Y NOTIFICACIONES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  user_nombre TEXT,
  accion      TEXT NOT NULL,
  entidad     TEXT NOT NULL,
  entidad_id  TEXT,
  valor_antes TEXT,
  valor_nuevo TEXT,
  motivo      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit ON auditoria(entidad, entidad_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON auditoria(user_id, created_at);

CREATE TABLE IF NOT EXISTS notificaciones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  tipo       TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  cuerpo     TEXT,
  vale_id    INTEGER REFERENCES vales(id),
  leida_at   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif ON notificaciones(user_id, leida_at, created_at);

-- ---------------------------------------------------------------------------
-- VISTAS DE APOYO
-- STOCK DISPONIBLE = STOCK FISICO - AUTORIZADO PENDIENTE DE ENTREGA
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_comprometido;
CREATE VIEW v_comprometido AS
SELECT vi.material_id AS material_id,
       SUM(MAX(vi.cantidad_autorizada - vi.cantidad_entregada, 0)) AS comprometido
FROM vale_items vi
JOIN vales v ON v.id = vi.vale_id
WHERE v.estado IN ('APROBADO','APROBADO_PARCIAL','EN_PREPARACION','PREPARADO','ENTREGA_PARCIAL')
  AND vi.estado_linea IN ('AUTORIZADA','PARCIAL')
GROUP BY vi.material_id;

DROP VIEW IF EXISTS v_inventario;
CREATE VIEW v_inventario AS
SELECT m.id, m.sku, m.nombre, m.descripcion, m.activo, m.foto, m.ubicacion,
       m.stock_fisico,
       COALESCE(c.comprometido, 0) AS comprometido,
       m.stock_fisico - COALESCE(c.comprometido, 0) AS disponible,
       m.stock_min, m.stock_max, m.punto_reorden, m.costo,
       m.stock_fisico * m.costo AS valor,
       u.codigo AS unidad, u.id AS unidad_id,
       cat.nombre AS categoria, m.categoria_id,
       sub.nombre AS subcategoria,
       p.nombre AS proveedor, m.proveedor_id,
       CASE
         WHEN m.stock_fisico <= 0 THEN 'AGOTADO'
         WHEN m.stock_fisico <= m.stock_min THEN 'CRITICO'
         WHEN m.stock_fisico <= m.punto_reorden THEN 'BAJO'
         ELSE 'NORMAL'
       END AS semaforo
FROM materiales m
JOIN unidades u ON u.id = m.unidad_id
LEFT JOIN v_comprometido c ON c.material_id = m.id
LEFT JOIN categorias cat ON cat.id = m.categoria_id
LEFT JOIN categorias sub ON sub.id = m.subcategoria_id
LEFT JOIN proveedores p ON p.id = m.proveedor_id;
