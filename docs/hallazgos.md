# Hallazgos de pruebas

**Segunda vuelta: los 14 hallazgos que se arreglaron ya NO se reproducen, ninguno
de ellos volvio por otro lado, y no encontre ninguna regresion en el flujo de
entregas.** Quedan 9 abiertos (0 bloqueantes, 0 graves, 8 menores y 1 cosmetico)
mas 1 nuevo que se me habia escapado en la primera vuelta.
**Mi opinion: ya se puede presentar**, con las tres notas de operacion del final.

Fecha: 3 de septiembre de 2026.
Codigo probado: rama `claude/demo-vales-inventario-wx3qqn`, commits `00489dd`,
`0211853`, `25a7519` y `8401b4f`. Base recien sembrada con `npm run reset`.
`npm test` pasa **19 de 19** (5 pruebas nuevas de regresion), antes y despues.

Los comandos suponen esto hecho antes:

```bash
API=http://localhost:3000
curl -s -c emp.jar -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -d '{"employee_id":"EMP-001","pin":"300001"}' > /dev/null
curl -s -c sup.jar -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -d '{"employee_id":"SUP-01","pin":"100001"}' > /dev/null
curl -s -c alm.jar -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -d '{"employee_id":"ALM-01","pin":"200001"}' > /dev/null
curl -s -c rsu.jar -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -d '{"employee_id":"RSU-01","pin":"400010"}' > /dev/null
curl -s -c admin.jar -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"usuario":"admin@demo.local","password":"Demo.Admin.2026"}' > /dev/null
```

---

# Verificacion de los 14 hallazgos arreglados

Repeti el mismo comando de la primera vuelta en cada uno.

## 1. Stock fisico negativo — CORREGIDO

Mismo vale de antes: kit con CLI-0001 en 99 mas el mismo material suelto en 99,
aprobado entero, y las dos lineas entregadas en la misma peticion.

```bash
curl -s -b alm.jar -X POST $API/api/almacen/vales/201/entregar \
  -H 'Content-Type: application/json' -d "{\"receptor_nombre\":\"Kevin Orozco\",\"firma\":\"$FIRMA\",
  \"lineas\":[{\"vale_item_id\":1105,\"cantidad\":99},{\"vale_item_id\":1106,\"cantidad\":99}]}"
```

- Antes: las dos pasaban y el material quedaba en **-99**.
- Ahora: `409 Stock fisico insuficiente de Mini Split 1 tonelada 220V. Existencia: 98`.
  El material se quedo en **98**, sin tocar.

Probe ademas la variante que no habia probado, la **misma linea repetida dos
veces en la misma peticion**: `400 No puede entregar mas de lo autorizado
(pendiente: 0)`, y la linea se quedo en 0 entregadas. Las dos puertas estan
cerradas.

Al terminar toda la bateria: **0 materiales con existencia negativa de 56**.

## 2. X-Forwarded-For — CORREGIDO

Con la restriccion de red encendida y solo `192.168.50.0/24` permitida:

```bash
curl -s -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 192.168.50.9' -d '{"employee_id":"EMP-002","pin":"300002"}'
#   {"error":"Este dispositivo esta fuera de la red autorizada de la planta."}
```

Tambien probe una cadena larga (`192.168.50.9, 10.0.0.1, 127.0.0.1`) y las
cabeceras `X-Real-IP` y `Forwarded`: las cuatro rechazadas. El supervisor si
sigue entrando desde fuera, como pide el instructivo.

El limite de peticiones tambien quedo cerrado: tras las 620 peticiones que lo
disparan, mande 30 mas cambiando `X-Forwarded-For` en cada una y **las 30
respondieron 429** (antes las 30 respondian 200).

**Comprobe ademas que el tunel sigue siendo usable**, que era mi duda con este
arreglo. Levante un segundo servidor con `PROXIES_CONFIANZA=127.0.0.1`:

- trabajador que el tunel reporta dentro de la red -> entra;
- que reporta fuera -> rechazado;
- cliente que intenta colar una IP falsa delante de la del tunel
  (`X-Forwarded-For: 192.168.50.9, 8.8.8.8`) -> rechazado.

El recorrido de derecha a izquierda esta bien hecho. Ver la nota de operacion 2.

## 3. Buscador global — CORREGIDO

```bash
curl -s -b rsu.jar --get --data-urlencode "q=PT-2026-0001" $API/api/buscar
curl -s -b rsu.jar --get --data-urlencode "q=Kevin" $API/api/buscar
```

- Folios: los 8 que ve `RSU-01` son **todos REYNA** (antes eran todos internos).
  Lo comprobe cruzando cada folio con su empresa desde la sesion de administrador.
- Personas: `[]`. Antes salia `Kevin Orozco Padilla — EMP-001 - TRABAJADOR (INTERNA)`.
- `SUP-01` ve 8 folios y **los 8 son de su area**. `EMP-001` ve 4 y **los 4 son
  suyos**. El catalogo de materiales lo siguen viendo los dos, que es lo correcto
  porque el almacen es compartido.

## 4. Panel ejecutivo — CORREGIDO

```bash
for j in emp sup alm rsu rna; do curl -s -b $j.jar $API/api/dashboard; done
```

Los cinco reciben `403`. `EMP-001`, `SUP-01`, `ALM-01`, `RSU-01` y `RNA-001`:
`Su rol no tiene el permiso: dashboard.leer`. En el navegador, escribir
`localhost:3000/panel` como trabajador ya no pinta nada. `ADMIN` y `DIRECCION`
lo siguen viendo completo, con importes.

## 5. Costos en la analitica de kits — CORREGIDO

```bash
curl -s -b sup.jar $API/api/analitica/kits
```

Los campos `costo_estandar`, `costo_real` y `variacion_costo` **ya no vienen** en
la respuesta del supervisor (antes traian $43,193.11 y $41,842.87). `DIRECCION`,
que si tiene `costos.leer`, los sigue recibiendo.

## 6. Analitica por area — CORREGIDO

```bash
curl -s -b rsu.jar $API/api/analitica/area
```

`RSU-01` ve **33 vales**, que son exactamente los de REYNA en el area 7 (lo
verifique con `?area_id=7&empresa=REYNA` desde administracion). Antes veia 67,
los de las dos empresas. Ademas ya pide permiso: `EMP-001` recibe `403`.

## 7. Exportaciones — CORREGIDO

```bash
curl -s -b rsu.jar $API/api/exportar
curl -s -b rsu.jar $API/api/exportar/consumo_trailer
```

- La lista de reportes que se le ofrece a `RSU-01` ahora es `[]`.
- `consumo_trailer`, `consumo_area`, `inventario`, `kits` y `alertas` devuelven
  los cinco `403 Ese reporte contiene informacion de la empresa interna`.

Antes bajaba en un CSV el cliente, el modelo y el consumo de cada trailer interno.

## 8. Entradas de almacen — CORREGIDO

```bash
curl -s -b alm.jar -X POST $API/api/entradas -H 'Content-Type: application/json' \
  -d '{"items":[{"material_id":51,"cantidad":100000,"costo":-500}]}'
```

| Lo que mande | Respuesta |
|---|---|
| cantidad 100000 + costo -500 | 400 `Costo no valido: no puede ser negativo ni quedar vacio` |
| solo costo negativo | 400, mismo mensaje |
| costo con letras | 400 (antes era un **500**, o sea que el hallazgo 11 tambien quedo cerrado) |
| cantidad 1e14 | 400 `demasiado alta (maximo 1000000 por linea). Revise si sobra un cero.` |
| cantidad 0 | 400 `Cantidad no valida` |
| costo 99999999999 | 400 `demasiado alto (maximo 10000000 por unidad)` |
| **entrada normal, 10 piezas a 96** | **200, ENT-2026-00009** |

El material paso de 2,682 a 2,692: solo entro la entrada legitima. Los mensajes
estan escritos para una persona, no para un programador. Los ajustes de
inventario, que no se tocaron, siguen bien.

## 9. El vale aparece solo en Autorizaciones — CORREGIDO

Con `SUP-01` parado en Autorizaciones y un vale creado desde otro navegador,
muestreando cada 6 segundos:

```
t+6s   aviso="Nueva solicitud pendiente: Kevin Orozco Padilla creo el vale"
       punto=ENCENDIDO  menu=1  Pendientes=1  EL VALE ESTA EN LA LISTA=true
```

Antes se quedaba en `false` a los 24 segundos y solo aparecia al recargar. Ahora
llega en la primera consulta: suena, vibra, enciende el punto y **el vale entra
en la lista**.

## 10. El numero del menu — CORREGIDO

Ahora cuenta vales pendientes, no notificaciones sin leer. Lo comprobe con el
caso que lo rompia: marcar todo como leido en la campana. Antes el menu se
quedaba en 0 con 5 vales esperando; ahora menu y pantalla dicen lo mismo (1 y 1).

## 17. Catalogos sin permiso — CORREGIDO

```bash
curl -s -b emp.jar $API/api/proveedores
#   {"error":"Su rol (TRABAJADOR) no tiene el permiso: inventario.leer"}
```

Proveedores, que era el que llevaba contacto, telefono y correo, ahora pide
`inventario.leer`. `unidades`, `categorias` y `areas` pasan a pedir
`catalogo.leer`; el trabajador los sigue viendo porque **si** tiene ese permiso y
los necesita para pintar la pantalla de crear vale. Los cuatro comprueban
permiso, que era el fondo del hallazgo. `ALM-01` sigue viendo proveedores.

## 18. Lista de surtido sin alcance — CORREGIDO

`GET /api/almacen/vales/:id/preparacion` ya pasa el usuario a `detalleVale` en
vez de `null`. El almacen sigue viendo sus lineas y sus costos con normalidad
(`200`, 2 lineas, precios visibles).

## 21. Pestañas en telefono — CORREGIDO

La tira ahora vive en un `.pestanas-caja` con dos flechas y una mascara que
degrada el borde. Medido a 390 px: la caja lleva la clase `mas-derecha`, hay 2
flechas, y al tocar la de la derecha el `scrollLeft` pasa de 0 a **256**. Ya se
ve que hay mas pestañas y se llega a ellas sin adivinar.

## 23. Alto de la pantalla de crear vale — CORREGIDO

Con el Kit Electrico (9 materiales) en iPhone: **2,296 px**, antes ~5,000. El
boton REVISAR Y ENVIAR queda a 711 px, **visible sin hacer scroll** en una
pantalla de 844.

---

# Busqueda de regresiones en el flujo de entregas

Es lo que mas se toco, asi que lo apreté aparte.

**Nada se rompio.** El detalle:

- **Entrega normal, una linea**: `PARCIAL` / `ENTREGA_PARCIAL`, precio congelado
  correcto, inventario baja exactamente lo entregado (13,811.12 -> 13,810.12).
- **Entrega parcial y despues completar**: el vale pasa por `ENTREGA_PARCIAL` con
  su pendiente (57) y llega a `ENTREGADO`.
- **Entrega desde el navegador, en telefono, firmando con el dedo**: dibuje el
  trazo con eventos de puntero reales (4,338 pixeles pintados), salio
  `Entrega registrada. Inventario actualizado.`, el vale quedo `ENTREGADO`, las
  cuatro cantidades correctas (SOLICITADO 3 / AUTORIZADO 1 / ENTREGADO 1) y la
  firma quedo guardada y se ve en el detalle del vale.
- **Entregar mas de lo autorizado**: sigue rechazando con el pendiente correcto.
- **Entregar negativo, firma corta, sin receptor, sin lineas**: los cuatro
  rechazados.
- **Reutilizar una firma**: sigue rechazando.
- **Doble clic en entregar** (dos peticiones a la vez): la primera entrega, la
  segunda `409`. Entregado 4 de 4, no 8.
- **Doble clic en entregar con la red lenta a proposito** (1.2 s por peticion,
  dos clics separados 400 ms): una sola entrega registrada, inventario baja 4 y
  no 8. Ver el hallazgo 19 por el mensaje rojo que sale despues.
- **Carrera entre dos vales distintos por el mismo material**: uno pasa, el otro
  `409`, stock final 0 y nunca negativo.
- **Cerrar pendiente y luego entregar**: rechazado por estado.
- **La ventana de entrega no se cierra sola** cuando llega una notificacion a
  media firma (ver abajo).

**Regresion que busque a proposito y no ocurre:** el refresco automatico nuevo
podria haber borrado una ventana abierta. Lo probe: con el supervisor a media
decision, un recorte ya tecleado en el campo, y un vale nuevo llegando desde otro
navegador, esperé 14 segundos. La ventana **siguio abierta**, el `1` que habia
tecleado **seguia ahi**, y en cuanto decidio, el refresco pendiente entro y el
vale nuevo aparecio. Bien resuelto.

---

# Hallazgos que siguen abiertos

Ninguno de estos estaba en la lista de arreglados. Renumerados; entre parentesis
el numero que tenian en la primera vuelta.

## [MENOR] 11 (nuevo). Un doble toque en ENVIAR VALE crea dos vales

**Donde:** `public/js/views/vale-nuevo.js`, la accion `ENVIAR VALE` del modal

El boton no se desactiva mientras la peticion viaja, y la ventana solo se cierra
cuando ya llego la respuesta. Con la red rapida no se nota porque la respuesta
vuelve en 20 ms; con la red de una planta o el tunel de la demostracion, si.

**Como reproducirlo:** con la peticion tardando ~1 s, crear un vale y tocar
**ENVIAR VALE** dos veces con 400 ms de separacion.

**Que esperaba:** que el segundo toque no hiciera nada.
**Que paso:** dos vales, `PT-2026-000223` y `PT-2026-000224`, con el mismo
contenido. A los 400 ms el boton seguia en pantalla y **sin desactivar**. El
supervisor se encuentra dos solicitudes iguales que tiene que resolver por
separado.

Es de la primera vuelta, no lo introdujeron los arreglos: en la primera pase por
ese boton una sola vez y no lo cace. Autorizar y entregar **no** tienen el
problema porque el servidor rechaza el segundo intento por estado; crear un vale
no puede protegerse asi, porque cada peticion es un vale legitimo. El arreglo va
en el navegador: desactivar el boton en cuanto se toca.

## [MENOR] 12 (era 15). Cantidades absurdas en un vale

```bash
curl -s -b emp.jar -X POST $API/api/vales -H 'Content-Type: application/json' \
  -d '{"trailer_id":4,"items":[{"material_id":33,"cantidad":1e15}]}'
#   se crea con cantidad_solicitada = 1000000000000000
```

Las entradas ya tienen tope (`MAX_CANTIDAD_MOVIMIENTO`); los vales no. Si el
supervisor lo autoriza, el comprometido de ese material se dispara y el
disponible del inventario queda ilegible. Lo natural seria usar el mismo tope.

## [MENOR] 13 (era 12). No se puede cambiar solo el costo de un material por la API

```bash
curl -s -b admin.jar -X PUT $API/api/materiales/51 -H 'Content-Type: application/json' \
  -d '{"costo":123,"motivo":"x"}'
#   {"error":"No se recibio ningun cambio"}
```

Desde la interfaz no se nota, porque el formulario manda todos los campos.

## [MENOR] 14 (era 13). Se puede reemplazar el 2FA del administrador sin la contrasena

`POST /api/auth/2fa/iniciar` sobreescribe el secreto con solo tener sesion
abierta, no pide contrasena y no queda en auditoria. Lo volvi a comprobar: tras
llamarlo, el codigo del telefono del administrador legitimo deja de servir y
sirve el nuevo. Deberia pedir contrasena, como si hace `2fa/desactivar`.

## [MENOR] 15 (era 14). Motivos y nombre de cliente sin limite de longitud

Las notas del vale si se recortan a 500. `motivo`, `motivo_cierre` y
`trailers.cliente` no: guarde 5,000 caracteres en los tres y se pintan enteros.

## [MENOR] 16 (era 16). La cookie sale sin `Secure`

```
Set-Cookie: dv_session=***; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800
```

`HttpOnly` y `SameSite` estan bien y en la base solo se guarda el sha256 del
token (verificado otra vez). Es nota de operacion para el dia del tunel.

## [MENOR] 17 (era 19). Se puede devolver contra un vale ya cerrado

La devolucion no comprueba el estado del vale, a diferencia de la entrega. Sobre
un vale `CERRADO` la acepta y suma el material al inventario. Puede ser
deliberado, pero hoy no esta escrito en ningun lado y el vale no cambia de estado.

## [MENOR] 18 (era 20). Los digitos escritos fuera del campo entran al PIN

`document.onkeydown` en `public/js/views/acceso.js` esta puesto en el documento,
no en el campo.

## [MENOR] 19 (nuevo, menor). Un aviso rojo despues de una entrega que si funciono

Consecuencia del hallazgo 11 en la pantalla de entregas. El segundo clic recibe
`409` y se pinta en rojo `El vale no esta en condiciones de entrega (estado:
ENTREGADO)` **encima de la entrega que acaba de salir bien**. El inventario queda
correcto, pero el almacenista ve un error donde no lo hubo. Se arregla solo si se
desactiva el boton al primer toque.

## [COSMETICO] 20 (era 22). Nombres de material en tres renglones en telefono

En crear vale, a 390 px, "Cable THW calibre 12 negro" y "Contacto duplex
polarizado 15A" ocupan tres renglones. Se lee; se ve apretado.

---

# Probado y sin hallazgos

## Las doce reglas

- **R1** las cuatro cantidades: se conservan. En pantalla, ESTANDAR 77 /
  SOLICITADO 3 / AUTORIZADO 1 / ENTREGADO 1 en la misma linea.
- **R2** autorizar 50 sobre 3 -> rechazado; negativo -> rechazado; inyectar
  `cantidad_solicitada: 99` en la autorizacion **no** cambia la solicitada (se
  quedo en 3); doble autorizacion -> `409`.
- **R3** el inventario solo baja al entregar, y nunca queda negativo por ninguna
  via: entregas, entregas repetidas, ajustes, devoluciones ni entradas.
- **R4** ver la seccion de entregas: todas las puertas cerradas.
- **R5** entrega parcial: el vale queda abierto con su pendiente y se completa
  despues.
- **R6** precio historico: cambie el costo de 18.5 a 9,999 despues de entregar;
  la linea y el movimiento conservaron 18.5.
- **R7** kits versionados: cree la version 3 del Kit Electrico; el vale hecho con
  la 2 conservo `version_snapshot = 2` y sus 9 lineas.
- **R8** ajustar una cantidad en un vale no toco el kit maestro (comparado entero,
  antes y despues).
- **R9** el vale guarda SKU y nombre oficial (`ELE-0001` / `Cable THW calibre 12
  negro`).
- **R10** 1.77 en PZA -> 2; 0.4 -> rechazado; negativo, texto e `Infinity`
  rechazados.
- **R11** devoluciones: solo el almacen y el administrador; nunca mas de lo
  entregado; siempre con motivo; la devolucion valida devuelve el material al
  inventario.
- **R12** auditoria: 19 acciones distintas registradas con usuario, fecha, valor
  anterior, valor nuevo, motivo e IP. No existe ningun `DELETE` de vales,
  materiales ni auditoria.

## Maquina de estados y carreras

Cerrar y entregar, cancelar y autorizar, cancelar y entregar, cancelar un vale
ajeno, ver un vale ajeno, un estado invalido desde el almacen: todo rechazado con
el mensaje correcto. Doble autorizacion, doble entrega y carrera entre dos vales
por el mismo material: en los tres casos uno pasa y el otro recibe `409`, con las
cantidades y el inventario cuadrados.

## Alcance por rol

Probe once endpoints de otros roles con cada uno de los cinco roles de planta.
Resultado limpio: el trabajador recibe `403` en los once; el supervisor solo pasa
en inventario y exportar; el almacen en cola, inventario, movimientos, exportar y
empresa externa; el trabajador externo en ninguno. En el navegador, escribir la
URL a mano ya no abre ninguna pantalla que no toque.

## Alcance por empresa

`RSU-01` ve 33 vales, todos REYNA; no puede abrir un vale interno; no tiene
`movimientos.leer` ni `reyna.leer`; su lista de exportaciones esta vacia. El
flujo completo de la empresa externa funciona: `RNA-001` crea, `SUP-01` **no**
puede autorizarlo, `RSU-01` si, el almacen entrega, el movimiento queda con
`empresa = REYNA` y aparece en el estado de cuenta.

## Costos ocultos

Revise el JSON crudo, no solo la pantalla. Ni `EMP-001`, ni `SUP-01`, ni
`RSU-01`, ni `RNA-001` reciben `precio_unitario` ni `importe` en el detalle del
vale, ni `importe` en los totales, ni costos en inventario, ni `valor_total` en el
resumen, ni `costo_total` en trailers, ni costos en la analitica de kits.

## Los siete pasos de la demostracion

1. **Abrir y anclar**: titulo, manifest y service worker registrados.
2. **`EMP-001` crea un vale con kit ajustando una cantidad**: **5.2 segundos**
   (meta: menos de 60). Las cuatro cantidades a la vista.
3. **`SUP-01` autoriza parcial**: recorte de 3 a 1 desde la ventana; el vale sale
   de pendientes.
4. **`ALM-01` surte y entrega firmando con el dedo**: funciona, ver arriba.
5. **El inventario baja y el vale queda con su pendiente**: verificado en pantalla
   y por API.
6. **Direccion ve el costo real del trailer**: panel con valor de inventario,
   consumo del mes y por cobrar a la empresa externa; en Trailers, el trailer 183
   con **$243,530.23** de costo acumulado.
7. **El administrador abre Auditoria**: la entrega que acababa de hacer aparece
   arriba — `Hilda Marquez Tovar / ENTREGA REGISTRADA / vales 216 / Recibio:
   Kevin Orozco Padilla`, con su boton de "Ver cambio", y encima la autorizacion.

**La notificacion en vivo**, que era el punto flojo, ahora cumple los cuatro
requisitos: suena, vibra, enciende el punto rojo y **aparece el vale**.

## Telefono

Barri 21 pantallas con los tres perfiles (trabajador, almacen, administrador), en
**modo claro y modo oscuro**, a 390x844 con toque real. **Ninguna desborda
horizontalmente** (390 de 390 en las 42 combinaciones). Modo oscuro consistente
(`rgb(15,19,25)`). Las tablas anchas se desplazan dentro de su contenedor. El
boton "atras" del navegador recorre bien las cinco pantallas hacia atras y hacia
adelante, sin pantallas en blanco.

## Seguridad

- **Inyeccion SQL**: ocho vectores (materiales, buscador global, filtros de fecha
  de vales, inventario, accion de auditoria, tipo de movimiento, periodo de la
  empresa externa y el parametro de exportacion). Todo parametrizado: cero
  resultados y las 215 filas de vales intactas.
- **Texto malicioso**: `<script>alert(1)</script>`, `<img src=x onerror=...>`,
  comillas, acentos y emoji guardados en cliente, modelo, notas y motivos. En
  trailers, auditoria y vales: **0 scripts inyectados, 0 imagenes fantasma, 0
  alertas disparadas**, y el texto se ve como texto.
- **Secretos**: ni `pin_hash`, ni `password_hash`, ni `twofa_secret` aparecen en
  `/api/auth/me` ni en `/api/usuarios`. En la base, solo hashes.
- **Enumeracion de usuarios**: mismo mensaje para un empleado que no existe y
  para un PIN equivocado.
- **Bloqueo por intentos**: tras 5 fallos entra la verificacion aritmetica y
  despues el bloqueo de la cuenta, aunque se cambie de IP.
- **Sesiones**: cerrar sesion invalida la cookie; revocar una sesion desde
  Administracion tambien (`Sesion no valida o expirada` al intentar guardar un
  vale). En `sessions` el `id` es el sha256 del token.
- **2FA**: no se salta sin codigo, con codigo malo, con `null` ni mandando un
  arreglo.
- **Cabeceras**: CSP estricta, `nosniff`, `X-Frame-Options: DENY`.
- **Cuerpo gigante**: 8 MB se corta y el servidor sigue respondiendo.
- **Recorrido de rutas**: seis vectores, todos `404`. Ningun archivo del servidor
  ni la base se sirven.

## Casos raros

Campos obligatorios vacios (vale sin trailer, sin materiales, con trailer o
material inexistente) y cuerpo que no es JSON: todos con `400` y mensaje claro.
Consola del navegador abierta todo el recorrido: **cero errores de JavaScript**
en las 21 pantallas, los dos temas, los siete pasos y las pruebas de doble clic.
Lo unico que sale son los `401`/`403` esperados al tocar algo sin permiso.

---

# Notas de operacion para el dia de la demostracion

1. **Correr `npm run reset` antes de empezar.** Mis pruebas ensuciaron la base
   varias veces; la deje limpia (200 vales, 0 materiales en negativo, la
   configuracion en sus valores de origen: `sesion_pin_minutos = 5`,
   `restriccion_red_activa = 0`, `redes_permitidas` por defecto).

2. **Si sale por el tunel, hay que arrancar asi:**

   ```bash
   SECURE_COOKIES=1 PROXIES_CONFIANZA=127.0.0.1,::1 npm start
   ```

   `SECURE_COOKIES=1` por el hallazgo 16. `PROXIES_CONFIANZA` es nuevo y **es
   importante**: sin el, todo el que entre por el tunel llega con la misma
   direccion, asi que **el limite de 600 peticiones por minuto lo comparten
   todos** y, si alguien falla cinco veces al entrar, a los demas les empieza a
   pedir la verificacion aritmetica aunque tecleen bien su PIN. Me paso durante
   las pruebas: fallé unos intentos y despues `EMP-003`, con su PIN correcto,
   tuvo que resolver "5 + 8" para entrar. No es un error del arreglo, es la
   consecuencia de compartir IP; el codigo ya lo advierte en `server/config.js` y
   la variable existe justo para eso.

3. **Cuidado con el doble toque al enviar un vale** (hallazgo 11) mientras no se
   arregle: si la red va lenta y alguien toca dos veces, se crean dos vales
   iguales. Tocar una sola vez y esperar.
