# Demo Aplicacion — Vales, Inventario y Control de Materiales

Aplicacion web responsiva (PWA) que digitaliza por completo el proceso de vales
en papel usado para retirar materiales del almacen durante la fabricacion de
food trucks.

> **Es una demostracion.** No utiliza logotipos, nombre corporativo, colores
> oficiales ni branding de ninguna empresa real. Toda la informacion cargada es
> ficticia y esta preparada para sustituirse por datos reales desde la propia
> interfaz, sin reconstruir la aplicacion.

---

## 1. Que resuelve

El proceso en papel produce mala letra, materiales pedidos por apodo, errores de
cantidad y de unidad, captura duplicada en Excel, inventario desactualizado y
falta de trazabilidad. La aplicacion sustituye ese circuito completo:

```
TRABAJADOR            SUPERVISOR             ALMACEN
crea el vale   ->     autoriza total o  ->   prepara, entrega (total o parcial),
(trailer + kits)      parcialmente           captura firma y descuenta inventario
```

Todo queda en una sola fuente de verdad: la base de datos de la aplicacion.
Excel se usa unicamente para exportar reportes, nunca como base de datos.

### La regla fundamental

El sistema **nunca** pierde la diferencia entre las cuatro cantidades, y las
muestra juntas en cada linea de cada vale:

| ESTANDAR | SOLICITADO | AUTORIZADO | ENTREGADO | PENDIENTE |
|---------:|-----------:|-----------:|----------:|----------:|
| 15 m (kit) | 22 m (trabajador) | 20 m (supervisor) | 18 m (almacen) | 2 m |

---

## 2. Arranque

Requiere unicamente **Node.js 22.5 o superior**. No hay dependencias externas
que instalar: el servidor usa `node:http`, `node:sqlite` y `node:crypto`.

```bash
npm run seed      # crea la base y carga los datos ficticios de demostracion
npm start         # servidor en http://localhost:3000
```

Otros comandos:

```bash
npm run reset     # borra la base y regenera el demo desde cero
npm run dev       # servidor con recarga automatica
npm test          # pruebas de extremo a extremo del flujo completo
node tools/generar-iconos.js   # regenera los iconos PNG de la PWA
```

Variables de entorno opcionales: `PORT`, `HOST`, `DATA_DIR`, `DB_FILE`,
`SECURE_COOKIES=1` (activa la marca `Secure` en cookies cuando se sirve por HTTPS).

### Accesos de demostracion (ficticios)

| Rol | Acceso | Clave |
|---|---|---|
| Trabajador de planta | `EMP-001` … `EMP-025` | PIN `300001` … |
| Supervisor de area | `SUP-01` … `SUP-05` | PIN `100001` … |
| Almacen / inventario | `ALM-01` … `ALM-03` | PIN `200001` … |
| Trabajador empresa externa | `RNA-001` … `RNA-005` | PIN `400001` … |
| Supervisor empresa externa | `RSU-01` | PIN `400010` |
| Administrador general | `admin@demo.local` | `Demo.Admin.2026` |
| Direccion | `direccion@demo.local` | `Demo.Direccion.2026` |
| Gerencia | `gerencia@demo.local` | `Demo.Gerencia.2026` |

---

## 3. Roles y permisos

El control de acceso se define en `server/lib/rbac.js` y se aplica en cada
endpoint, ademas del alcance por empresa (un usuario de la empresa externa solo
ve informacion de su empresa).

| Rol | Puede |
|---|---|
| **Administrador general** | Todo: usuarios, areas, trailers, catalogo, SKU, alias, kits y versiones, costos, ubicaciones, entradas, ajustes, configuracion, auditoria y exportacion. Cada cambio critico queda auditado. |
| **Trabajador de planta** | Crear vale, elegir trailer, agregar materiales y kits, ajustar cantidades del kit para su solicitud, enviar y consultar **solo sus propios** vales. No ve costos ni dashboards. |
| **Supervisor de area** | Sus propios vales y los de su area; aprobar, aprobar parcialmente, rechazar o solicitar correccion; cambiar la cantidad **autorizada** (nunca la solicitada); consultar existencias y consumo de su departamento. |
| **Almacen / inventario** | Cola de preparacion, marcar en preparacion y preparado, registrar entregas totales o parciales con firma, devoluciones, entradas, ajustes y mermas, cierre mensual de la empresa externa. No puede alterar lo solicitado, lo autorizado, el trabajador, el trailer, la fecha ni el folio. |
| **Direccion / gerencia** | Visibilidad amplia de todo (vales, inventario, costos, consumo, empresa externa, tendencias, alertas, auditoria de alto nivel) y dashboard ejecutivo. No modifica configuracion. |

---

## 4. Arquitectura

```
server/
  index.js          Servidor HTTP, enrutador, limite de peticiones y cabeceras de seguridad
  schema.sql        Modelo de datos completo (tablas, indices y vistas)
  db.js             Conexion SQLite (WAL), migracion y transacciones
  seed.js           Generador de datos ficticios de demostracion
  lib/              http, auth (scrypt, sesiones, TOTP), rbac, auditoria,
                    folio configurable, csv, red autorizada, unidades, notificaciones
  routes/           auth, catalogo, kits, vales, almacen, inventario,
                    reyna, dashboard, analitica, admin, exportar
public/
  index.html        Armazon de la PWA
  sw.js             Service worker (solo cachea el armazon, nunca operaciones)
  css/app.css       Sistema visual propio: industrial, minimalista, tactil
  js/               api, ui, router, graficas SVG, iconos SVG, app
  js/views/         24 pantallas (acceso, vales, autorizaciones, almacen,
                    inventario, kits, panel, analitica, empresa externa, admin)
test/               Pruebas de extremo a extremo del flujo completo
tools/              Generador de iconos PNG de la PWA
```

Sin frameworks ni CDNs: la politica de seguridad de contenido (CSP) solo permite
recursos del propio origen, y no se carga ningun recurso de terceros.

### Modelo de datos

Entidades principales: `users`, `areas`, `trailers`, `materiales` (+ `material_alias`,
`material_costos`), `unidades`, `categorias`, `proveedores`, `kits` +
`kit_versiones` + `kit_items`, `vales` + `vale_kits` + `vale_items`,
`entregas` + `entrega_items`, `firmas`, `devoluciones` + `devolucion_items`,
`entradas` + `entrada_items`, `movimientos`, `reyna_cierres` + `reyna_ajustes`,
`auditoria`, `notificaciones`, `sessions`, `settings`.

Dos vistas resuelven el inventario en tiempo real:

```sql
-- STOCK DISPONIBLE = STOCK FISICO - MATERIAL AUTORIZADO PENDIENTE DE ENTREGA
v_comprometido    -- autorizado y aun no entregado, por material
v_inventario      -- fisico, comprometido, disponible, valor y semaforo
```

---

## 5. Reglas de negocio implementadas

- **Folio automatico y unico**, con formato configurable desde la interfaz
  (`PT-{YYYY}-{SEQ:6}` produce `PT-2026-000001`). Tokens: `{YYYY} {YY} {MM} {DD} {SEQ:n}`.
- **Trailer obligatorio** en todo vale; los trailers terminados o cerrados no admiten vales nuevos.
- **Catalogo cerrado**: el trabajador nunca escribe el nombre del material. Puede
  buscar por apodo (alias), pero el vale guarda siempre **SKU + nombre oficial**.
- **Unidades respetadas**: no existen "1.77 piezas". Cada cantidad se ajusta a los
  decimales que admite su unidad.
- **Kits editables**: al agregar un kit se copia su contenido al vale. Cambiar una
  cantidad afecta solo a ese vale; el kit maestro no se modifica.
- **Kits versionados**: una version nueva no altera el historico. Cada vale conserva
  la version que uso, con su cantidad estandar.
- **El inventario solo baja al entregar fisicamente.** Crear o autorizar un vale
  no descuenta existencias: reserva (comprometido) y reduce el disponible.
- **Entrega parcial**: el vale permanece abierto con su pendiente hasta completarse
  o hasta que un usuario autorizado lo cierre indicando motivo.
- **Firma digital con el dedo o lapiz** al recibir; se guarda con folio, persona,
  fecha, hora y almacenista. Una firma identica no puede reutilizarse.
- **Devoluciones** validas solo cuando el almacen las confirma; incrementan el
  inventario y reducen el importe cobrado.
- **Precio historico**: el costo se congela al entregar. Si el material sube de
  precio en septiembre, el vale de agosto conserva el precio de agosto.
- **Motivos de rechazo predefinidos** y configurables; solo "Otro" pide comentario.
- **Auditoria** de todo cambio critico con usuario, fecha, hora, accion, valor
  anterior, valor nuevo y motivo. La informacion historica no se borra desde la
  interfaz: se usa activo/inactivo.

### Empresa externa

Los trabajadores de la empresa externa usan **el mismo inventario fisico**. Cada
movimiento guarda `empresa = REYNA`, su precio unitario historico y su importe.
El modulo incluye dashboard, consumos, vales, trabajadores, estado de cuenta,
historial, exportacion y **cierre mensual**. Tras un cierre nada se modifica en
silencio: cualquier cambio posterior se registra como **ajuste** con motivo y
queda en auditoria.

---

## 6. Seguridad

- Contrasenas y PIN cifrados con **scrypt** (nunca en texto plano).
- Sesiones con cookie **HttpOnly, SameSite=Lax** y `Secure` bajo HTTPS; en la base
  solo se guarda el hash del token.
- **Cierre automatico por inactividad** (5 minutos por defecto) en los iPads
  compartidos de planta, y boton grande de CERRAR SESION siempre visible.
- **Bloqueo temporal** tras varios intentos fallidos y limite de peticiones por IP.
- **Verificacion adicional** (aritmetica simple, sin servicios de terceros) solo
  ante actividad sospechosa. En el uso normal de planta nunca aparece.
- **2FA (TOTP)** para Administracion y Direccion, activable desde el perfil.
- **Restriccion de red** configurable por CIDR: si un iPad sale de la red
  autorizada, no puede crear vales.
- Cabeceras `Content-Security-Policy`, `X-Frame-Options`, `nosniff` y
  `Referrer-Policy`. Solo se usan cookies tecnicas de sesion: sin publicidad,
  sin pixeles ni seguimiento comercial, por lo que el demo no muestra banner.

---

## 7. PWA y compatibilidad

Instalable como aplicacion (manifest, service worker e iconos propios) y probada
en resoluciones de iPhone, iPad y escritorio. Funciona en Safari, Chrome y Edge,
en iPad, iPhone, Android, tablets, Windows y Mac. La interfaz esta optimizada
para iPad: botones grandes, tipografia legible, campos de 16 px (evitan el zoom
automatico de iOS) y firma con puntero para dedo o Apple Pencil. Tema claro y
oscuro automaticos.

**Conexion:** el MVP asume red disponible. El service worker cachea unicamente el
armazon de la aplicacion y **jamas responde una operacion desde cache**: si no hay
conexion se avisa con claridad y nunca se aparenta que una salida quedo guardada.

---

## 8. Analisis

- **Panel ejecutivo**: valor del inventario, consumo de hoy/semana/mes, consumo
  interno y externo, vales por estado, entregas parciales, material bajo minimo y
  agotado, por cobrar a la empresa externa, trailers activos y tiempos promedio
  del proceso (solicitud → autorizacion → preparacion → entrega).
- **Graficas** en SVG generadas localmente: consumo mensual, tendencia de 30 dias,
  top 10 de materiales, consumo por area y por trailer, distribucion por estado.
- **Analitica por kit**: cantidad y costo estandar contra el consumo real, con la
  variacion por kit y por material, para decidir cuando actualizar un estandar.
- **Prediccion** con metodos sencillos (promedio, media movil ponderada,
  tendencia, punto de reorden y lead time): dias estimados de inventario, fecha
  estimada de agotamiento, consumo esperado a 7 y 30 dias y cantidad sugerida de compra.
- **Deteccion de patrones**: consumo inusual, rechazos frecuentes, solicitudes muy
  repetidas, uso fuera del area y kits con desviaciones. Nunca acusa a nadie: solo
  senala *"Patron de consumo fuera del comportamiento habitual. Requiere revision."*

### Exportacion a Excel

Inventario, movimientos, vales, detalle de vales, trabajadores, consumo por
trailer, consumo por area, consumo de la empresa externa, kits, alertas y
auditoria (CSV con BOM, compatible con Excel).

---

## 9. Datos de demostracion

1 administrador, 2 de direccion, 5 supervisores internos, 1 supervisor externo,
3 almacenistas, 25 trabajadores internos y 5 externos; 56 materiales con alias,
8 kits (uno con dos versiones), 10 trailers y 200 vales historicos con sus
autorizaciones, entregas, firmas reales en PNG, devoluciones, movimientos y
cierres mensuales de los meses cerrados.

Todos los nombres de personas, proveedores y clientes son inventados.

---

## 10. Pruebas

`npm test` levanta el servidor con una base temporal y recorre el flujo completo:
acceso por PIN y por contrasena, creacion de vale con kit ajustado, autorizacion
parcial, preparacion, entrega parcial con firma, rechazo de firma repetida,
descuento de inventario, devolucion, alcance por rol y por empresa, precio
historico, cierre mensual, dashboard, configuracion sin tocar codigo, versionado
de kits sin alterar historicos y exportacion.

---

## 11. Que falta para produccion

Esto es un demo funcional, no un despliegue. Antes de usarlo con datos reales:

- Servir detras de HTTPS con `SECURE_COOKIES=1` y un proxy inverso.
- Definir respaldos automaticos del archivo de base de datos (o migrar a
  PostgreSQL: el modelo es portable y todo el SQL esta centralizado).
- Sustituir los datos ficticios por los reales desde la interfaz de
  administracion (usuarios, areas, trailers, materiales, kits, costos).
- Activar la restriccion de red con los rangos reales de la planta.
- Notificaciones push: el service worker ya esta listo; falta el servidor de
  suscripciones y las llaves VAPID. Hoy las notificaciones son dentro de la
  aplicacion.
- Fotografia de materiales: el campo existe en el catalogo; falta la carga de
  archivos y su almacenamiento.
- Revisar politicas legales de cookies y datos personales de la empresa.
