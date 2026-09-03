# Demo Aplicacion — Vales, Inventario y Control de Materiales

> Claude Code lee este archivo al abrir **cualquier** sesion sobre este
> repositorio. Es la memoria compartida entre todos los chats del proyecto:
> lo que este escrito aqui, cualquier chat nuevo ya lo sabe.

## Que es este proyecto

Aplicacion web responsiva (PWA) que digitaliza el proceso de vales en papel
usado para retirar materiales del almacen durante la fabricacion de food trucks.

**Es un DEMO.** No debe usar logotipos, nombre corporativo, colores oficiales
ni branding de ninguna empresa real. Toda la informacion cargada es ficticia y
esta pensada para sustituirse por datos reales desde la propia interfaz, sin
reconstruir la aplicacion.

Flujo que resuelve:

```
TRABAJADOR            SUPERVISOR             ALMACEN
crea el vale   ->     autoriza total o  ->   prepara, entrega (total o parcial),
(trailer + kits)      parcialmente           captura firma y descuenta inventario
```

## Como se ejecuta

Requiere **Node.js 22.5 o superior**. No hay dependencias que instalar.

```bash
npm run seed      # carga los datos ficticios (solo la primera vez)
npm start         # http://localhost:3000
npm run reset     # borra la base y regenera el demo desde cero
npm test          # pruebas de extremo a extremo (deben pasar siempre)
```

La Terminal debe quedarse abierta mientras se usa la aplicacion. Si el
navegador dice `localhost refused to connect`, el servidor esta apagado:
`cd ~/Downloads/demo-vales && npm start`.

### Cuando la app sale a internet por el tunel

La cabecera `X-Forwarded-For` solo se cree si la peticion viene de un proxy
declarado. En la red local eso no hace falta, pero **detras del tunel hay que
declararlo**, porque si no todos los visitantes llegan con la misma direccion
(la del tunel): el limite de peticiones los cuenta como uno solo y la
restriccion de red deja de distinguir quien esta dentro de la planta.

```bash
SECURE_COOKIES=1 PROXIES_CONFIANZA=127.0.0.1,::1 npm start
```

Sin esa variable la cabecera se ignora, que es lo seguro por defecto: creerla
siempre dejaba que cualquiera la escribiera a mano y con eso se saltara la
restriccion de red y el limite de peticiones.

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

## Mapa del proyecto

```
server/
  index.js          Servidor HTTP, enrutador, limite de peticiones, cabeceras de seguridad
  schema.sql        Modelo de datos completo (tablas, indices, vistas)
  db.js             Conexion SQLite (WAL), migracion y transacciones
  seed.js           Generador de datos ficticios de demostracion
  lib/              http, auth (scrypt, sesiones, TOTP), rbac, auditoria, folio,
                    csv, red autorizada, unidades, sql (updates parciales), notify
  routes/           auth, catalogo, kits, vales, almacen, inventario,
                    reyna, dashboard, analitica, admin, exportar
public/
  index.html        Armazon de la PWA        sw.js  Service worker
  css/app.css       Sistema visual propio (industrial, claro y oscuro)
  js/               api, ui, router, graficas (SVG), iconos (SVG), app
  js/views/         24 pantallas de la interfaz
test/flujo.test.js  Pruebas de extremo a extremo (13 casos)
tools/              Generador de iconos PNG de la PWA
```

Donde tocar segun el cambio:

- **Una pantalla se ve mal o le falta algo** -> `public/js/views/<vista>.js`
- **Estilos, colores, tamanos** -> `public/css/app.css`
- **Regla de negocio, calculo, permiso** -> `server/routes/<modulo>.js`
- **Campo nuevo en la base** -> `server/schema.sql` + el route correspondiente
- **Datos del demo** (mas materiales, otros kits) -> `server/seed/datos.js`

## Reglas de negocio que NUNCA deben romperse

1. **Las cuatro cantidades siempre se conservan**: ESTANDAR (del kit),
   SOLICITADA (trabajador), AUTORIZADA (supervisor) y ENTREGADA (almacen).
   Ninguna sobrescribe a otra.
2. **El supervisor nunca modifica la cantidad solicitada**, solo la autorizada,
   y no puede autorizar mas de lo solicitado.
3. **El inventario solo baja al entregar fisicamente.** Crear o autorizar un
   vale no descuenta: reserva (comprometido) y reduce el disponible.
   `DISPONIBLE = FISICO - COMPROMETIDO`. El disponible si puede ser negativo
   (hay mas autorizado que existencias); el **fisico nunca**.
4. **El almacen no puede entregar mas de lo autorizado ni mas de lo que hay**
   fisicamente.
5. **Entrega parcial**: el vale queda abierto con su pendiente hasta
   completarse o hasta que alguien autorizado lo cierre con motivo.
6. **Precio historico**: el costo se congela al entregar y no cambia despues.
7. **Kits versionados**: una version nueva no altera los vales historicos;
   cada vale conserva la version que uso y su cantidad estandar.
8. **Kit editable**: cambiar una cantidad en un vale no modifica el kit maestro.
9. **Catalogo cerrado**: el trabajador nunca escribe el nombre del material.
   Busca por alias, pero el vale guarda SKU + nombre oficial.
10. **Unidades respetadas**: no existen "1.77 piezas". Toda cantidad se ajusta
    a los decimales de su unidad.
11. **Devoluciones** solo son validas cuando el almacen las confirma.
12. **Todo cambio critico queda en auditoria** con usuario, fecha, valor
    anterior, valor nuevo y motivo. No se borra informacion historica desde la
    interfaz: se usa activo/inactivo.

## Convenciones de codigo

- **Todo en espanol** (variables, funciones, comentarios, mensajes) y **sin
  acentos en el codigo** para evitar problemas de codificacion.
- **Sin dependencias externas.** Solo `node:http`, `node:sqlite`, `node:crypto`.
  No agregar paquetes de npm ni librerias por CDN: la politica de seguridad de
  contenido (CSP) solo permite recursos del propio origen.
- Graficas e iconos se generan en SVG dentro del navegador
  (`public/js/graficas.js`, `public/js/iconos.js`). No usar emoji en la interfaz.
- Las actualizaciones parciales usan `server/lib/sql.js` para no borrar campos
  que el cliente no envio.
- **`npm test` debe pasar siempre** antes de dar un cambio por terminado.
- Commits en espanol, explicando el porque del cambio.

## Estado actual

Funciona de extremo a extremo y esta probado: 13 pruebas automatizadas cubren
el flujo completo (crear vale con kit ajustado, autorizacion parcial,
preparacion, entrega parcial con firma, devolucion, alcance por rol y empresa,
precio historico, cierre mensual, versionado de kits y exportacion).

Pendientes conocidos (documentados en el README):

- Notificaciones push reales (el service worker esta listo; falta el servidor
  de suscripciones y las llaves VAPID). Hoy las notificaciones son dentro de la
  aplicacion.
- Carga de fotografias de materiales (el campo existe en el catalogo, falta el
  almacenamiento de archivos).
- Para produccion: HTTPS con `SECURE_COOKIES=1`, respaldos, y activar la
  restriccion de red con los rangos reales de la planta.

## Subir cambios a GitHub

Claude **si puede hacer `git push`** sobre este repositorio: tiene permiso de
escritura. Al terminar un cambio, deja el commit hecho y subelo tu mismo a la
rama de trabajo `claude/demo-vales-inventario-wx3qqn`.

Trabaja **siempre** en esa rama. No crees ramas nuevas.

Del lado del usuario, para bajar los cambios a la Mac: abrir **GitHub Desktop**
y darle a **Fetch origin** (y luego **Pull origin** si aparece). Ya no hace
falta que el usuario haga el commit ni el push.

## Como trabajar en cada tipo de chat

El usuario mantiene chats separados por proposito. Todos comparten este archivo
como contexto, y el repositorio como fuente de verdad.

### Chat de CODIGO — "agrega esto, quita aquello"

Cambios reales en la aplicacion. Aqui se edita, se prueba y se hace commit.
Antes de dar por terminado un cambio: correr `npm test`, y cuando sea una
pantalla, verificar el resultado en la aplicacion, no solo que compile.

**La lista de trabajo esta en `docs/pendientes-codigo.md`**, en orden y con los
criterios de aceptacion de cada tarea. Al terminar una, marca su casilla en ese
archivo dentro del mismo commit.

### Chat de PRUEBAS — encontrar errores antes que el cliente

Recorre la aplicacion intentando romperla y reporta lo que encuentra.
**Instructivo completo en `docs/pruebas.md`.**

Regla que no se rompe: **encuentra, no arregla.** No modifica codigo de la
aplicacion; lo unico que escribe y sube es `docs/hallazgos.md`. Lo que encuentra
lo corrige el chat de codigo, con su prueba de regresion.

### Chat de DUDAS — "no se como hacer X" / "me esta fallando Y"

Preguntas de operacion y fallas: la app no abre, un error en la Terminal, como
se usa una pantalla, que significa un dato. Explicar en lenguaje simple, con
pasos concretos para una persona que no programa (Mac, Terminal, GitHub
Desktop). No cambiar codigo aqui salvo que el usuario lo pida.

### Chat de INFORMACION GENERAL — el proyecto en conjunto

Alcance, decisiones, como presentarlo a una empresa fabricante de food trucks,
que falta para produccion, costos y tiempos. Consultas y explicaciones; sin
cambios de codigo.

**Antes de responder aqui, lee `docs/comercial.md`.** Ahi esta lo ya decidido
sobre el cliente, el precio, la demostracion en vivo y las decisiones de
arquitectura, para no volver a discutirlo desde cero.

## Contexto del usuario

- Trabaja en Mac, con la Terminal y GitHub Desktop; **no es programador**.
  Explicar sin jerga y dar los pasos exactos (que abrir, que pegar, que esperar).
- El proyecto local vive en `~/Downloads/demo-vales`.
- El repositorio es `santiagoancira2312-wq/Aplicacion-Pan-tra`, rama de trabajo
  `claude/demo-vales-inventario-wx3qqn`.
- El objetivo final es presentar el demo a **Panamerican Trailers** (planta en
  Guadalupe, Nuevo Leon; vende en Estados Unidos), asi que la aplicacion debe
  verse profesional, industrial y terminada. En los documentos comerciales el
  producto se llama **TRAZA**; la aplicacion sigue sin branding.
- Todo lo comercial y de presentacion vive en `docs/comercial.md`.
