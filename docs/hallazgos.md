# Hallazgos de pruebas

**23 hallazgos: 1 BLOQUEANTE, 9 GRAVES, 10 MENORES y 3 COSMETICOS.**
El BLOQUEANTE deja el inventario fisico en negativo y se alcanza sin salir de la
interfaz, con dos clics que un trabajador puede dar por accidente.
**Mi opinion: NO se puede presentar hasta arreglar el BLOQUEANTE y los hallazgos
2, 3, 4 y 9.** El resto de la aplicacion aguanto todo lo demas que le hice.

Fecha de las pruebas: 2 de septiembre de 2026.
Version probada: rama `claude/app-testing-hallazgos-5zocds`, base recien
sembrada con `npm run reset`. `npm test` pasa 14 de 14 antes y despues.

Como leer los comandos: primero hay que guardar la sesion en un archivo de
cookies. Todos los ejemplos suponen que se hizo esto antes:

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
```

---

# BLOQUEANTE

## [BLOQUEANTE] 1. El stock fisico queda en NEGATIVO si un vale trae el mismo material en dos lineas

**Gravedad:** BLOQUEANTE
**Rompe:** reglas de negocio 3 y 4
**Donde:** `server/routes/almacen.js`, endpoint `POST /api/almacen/vales/:id/entregar`

La comprobacion de existencia se hace linea por linea contra el stock **leido
antes** de aplicar ninguna salida (el bucle que arma `aEntregar` corre completo
antes del bucle que llama a `aplicarMovimiento`). Si dos lineas del mismo vale
apuntan al mismo material, las dos comparan contra el mismo stock inicial, las
dos pasan, y las dos se descuentan.

Un vale puede tener el mismo material dos veces sin hacer nada raro: basta con
agregar un kit y ademas buscar y agregar suelto uno de los materiales de ese
kit. La interfaz deduplica los materiales sueltos entre si, pero **no** entre un
kit y un suelto, ni entre dos kits que comparten material.

**Como reproducirlo (solo con la interfaz):**

1. `npm run reset` y entrar como `EMP-001` / PIN `300001`.
2. Crear vale, Trailer 183.
3. Agregar el kit **Kit Mini Split** (contiene CLI-0001, existencia 99).
4. Poner en 99 la cantidad de CLI-0001 dentro del kit, y en 0 las demas lineas
   del kit (boton de la basura).
5. En el buscador de materiales, buscar **CLI-0001** y agregarlo suelto, tambien
   con cantidad 99. Ahora el vale tiene dos lineas del mismo material.
6. Enviar. Entrar como `SUP-01` / PIN `100001` y aprobar todo.
7. Entrar como `ALM-01` / PIN `200001`, abrir el vale y **Registrar entrega**
   completa, firmando.
8. Ver el material en Inventario.

**Que esperaba:** que la segunda linea se rechace con
`Stock fisico insuficiente`, igual que pasa cuando son dos vales distintos (eso
si funciona bien).
**Que paso:** las dos lineas se entregaron. El material quedo en
**stock fisico = -99**, disponible -100, semaforo AGOTADO, y se grabaron dos
movimientos de SALIDA: uno de 99 -> 0 y otro de 0 -> **-99**.

**Comando exacto:**

```bash
# 1) vale con el kit 1 (todo en 0 salvo CLI-0001=99) MAS el mismo material suelto
curl -s -b emp.jar -X POST $API/api/vales -H 'Content-Type: application/json' -d '{
  "trailer_id":4,
  "items":[{"material_id":33,"cantidad":99}],
  "kits":[{"kit_id":1,"items":[
    {"material_id":33,"cantidad":99},{"material_id":34,"cantidad":0},
    {"material_id":35,"cantidad":0},{"material_id":36,"cantidad":0},
    {"material_id":2,"cantidad":0},{"material_id":7,"cantidad":0},
    {"material_id":54,"cantidad":0},{"material_id":51,"cantidad":0}]}]}'
# devuelve id=201 con items 1114 y 1115, los dos del material 33

# 2) el supervisor aprueba
curl -s -b sup.jar -X POST $API/api/vales/201/autorizar \
  -H 'Content-Type: application/json' -d '{"decision":"APROBAR"}'

# 3) el almacen entrega LAS DOS lineas en la misma peticion
FIRMA="data:image/png;base64,$(python3 -c "print('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='*6)")"
curl -s -b alm.jar -X POST $API/api/almacen/vales/201/entregar \
  -H 'Content-Type: application/json' -d "{\"receptor_nombre\":\"Kevin Orozco\",\"firma\":\"$FIRMA\",
  \"lineas\":[{\"vale_item_id\":1114,\"cantidad\":99},{\"vale_item_id\":1115,\"cantidad\":99}]}"

# 4) el resultado
curl -s -b alm.jar $API/api/materiales/33
#   "stock_fisico": -99, "disponible": -100, "semaforo": "AGOTADO"
```

**Por que es lo mas grave:** el producto entero se vende sobre la regla de que el
fisico nunca es negativo. Ademas se llega por el camino normal, y si pasa en
vivo el numero negativo queda a la vista en la pantalla de Inventario.

---

# GRAVES

## [GRAVE] 2. La restriccion de red y el limite de peticiones se saltan con una cabecera

**Gravedad:** GRAVE
**Rompe:** alcance por red (punto 2 del instructivo) y la proteccion del backend
**Donde:** `server/lib/http.js`, funcion `clientIp()`

`clientIp()` cree lo que diga la cabecera `X-Forwarded-For` sin comprobar si la
peticion viene de un proxy de confianza. Como durante la demostracion la
aplicacion va a estar publicada por un tunel, cualquiera que tenga la direccion
puede poner esa cabecera a mano.

**Como reproducirlo:**

1. Como administrador, en Configuracion, activar la restriccion de red y dejar
   permitida solo `192.168.50.0/24`.
2. Intentar entrar como trabajador desde fuera: lo rechaza, correcto.
3. Repetir el intento agregando `X-Forwarded-For: 192.168.50.9`.

**Que esperaba:** que la restriccion siguiera bloqueando.
**Que paso:** entro, y ademas pudo crear un vale desde fuera de la planta.

**Comando exacto:**

```bash
curl -s -b admin.jar -X PUT $API/api/admin/configuracion -H 'Content-Type: application/json' \
  -d '{"configuracion":{"restriccion_red_activa":"1","redes_permitidas":"192.168.50.0/24"}}'

# sin la cabecera: bloqueado (correcto)
curl -s -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -d '{"employee_id":"EMP-002","pin":"300002"}'
#   {"error":"Este dispositivo esta fuera de la red autorizada de la planta."}

# con la cabecera: entra
curl -s -c fuera.jar -X POST $API/api/auth/login-pin -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 192.168.50.9' -d '{"employee_id":"EMP-002","pin":"300002"}'

curl -s -b fuera.jar -X POST $API/api/vales -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 192.168.50.9' \
  -d '{"trailer_id":4,"items":[{"material_id":33,"cantidad":1}]}'
#   vale creado desde fuera de la red
```

**El mismo agujero tumba el limite de 600 peticiones por minuto.** Lo medi:
tras 620 peticiones desde la misma IP el servidor ya devolvia 429; enseguida
mande 30 peticiones mas cambiando `X-Forwarded-For` en cada una y **las 30
respondieron 200**, mientras la IP real seguia bloqueada.

```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code} " -H "X-Forwarded-For: 10.9.0.$i" $API/api/auth/estado
done
# 200 200 200 ... (treinta veces)
```

Lo que **si** aguanta: el bloqueo por intentos fallidos va contra el usuario, no
contra la IP, asi que cambiar de cabecera no lo evita. Eso esta bien resuelto.

---

## [GRAVE] 3. Un usuario de la empresa externa ve vales y personal de la empresa interna en el buscador

**Gravedad:** GRAVE
**Rompe:** alcance por empresa
**Donde:** `server/routes/catalogo.js`, endpoint `GET /api/buscar`

El buscador global solo filtra por trabajador cuando el rol es TRABAJADOR. No
aplica en ningun momento el filtro de empresa, ni el de area del supervisor.

**Como reproducirlo (desde la interfaz, con la lupa de arriba):**

1. Entrar como `RSU-01` / PIN `400010` (supervisor de la empresa externa).
2. En el buscador de la barra superior escribir `PT-2026-0001`.
3. Escribir despues `Kevin`.

**Que esperaba:** solo resultados de su propia empresa.
**Que paso:** salen ocho folios de vales de la empresa **interna** con su
trailer y su estado, y sale la ficha de un trabajador interno con nombre
completo, numero de empleado, rol y empresa.

**Comando exacto:**

```bash
curl -s -b rsu.jar --get --data-urlencode "q=PT-2026-0001" $API/api/buscar
#   VALE PT-2026-000198 | Trailer 185 - EN_PREPARACION   (empresa INTERNA)
#   VALE PT-2026-000199 | Trailer 183 - EN_PREPARACION   ... ocho en total

curl -s -b rsu.jar --get --data-urlencode "q=Kevin" $API/api/buscar
#   {"tipo":"PERSONA","titulo":"Kevin Orozco Padilla",
#    "detalle":"EMP-001 - TRABAJADOR (INTERNA)"}
```

Al abrir el resultado si da 403, o sea que el detalle esta protegido; lo que se
filtra es la existencia del vale, su folio, su trailer, su estado y los nombres
del personal interno. Un supervisor interno tambien ve por aqui folios de areas
que no son la suya.

---

## [GRAVE] 4. El panel ejecutivo esta abierto a cualquiera que escriba la direccion, y no filtra por empresa

**Gravedad:** GRAVE
**Rompe:** alcance por rol y alcance por empresa
**Donde:** `server/routes/dashboard.js`, endpoint `GET /api/dashboard`

El endpoint solo pide sesion iniciada: no comprueba el permiso `dashboard.leer`
ni filtra por empresa. Oculta los importes a quien no tiene permiso de costos,
pero deja pasar todo lo demas.

**Como reproducirlo (desde el navegador):**

1. Entrar como `EMP-001` / PIN `300001`. En su menu no hay panel ejecutivo.
2. Escribir a mano en la barra de direcciones `http://localhost:3000/panel`.

**Que esperaba:** "no tiene permiso", como pasa correctamente con
`/inventario`, `/auditoria`, `/usuarios` o `/configuracion`.
**Que paso:** se pinta el panel ejecutivo completo: vales de hoy, pendientes de
autorizar, en almacen, entregas parciales, materiales bajo minimo, trailers
activos, la grafica de tendencia de 30 dias, el reparto de vales por estado, el
top 10 de materiales y el consumo por area. Lo verifique en el navegador y
tengo la captura.

Con un usuario de la empresa externa pasa lo mismo y ademas cruza empresas:

```bash
curl -s -b rsu.jar $API/api/dashboard
#   vales_total: 205  <- de las dos empresas
#   actividad: [... "trabajador":"Laura Zamora Rendon","empresa":"INTERNA" ...]

curl -s -b rna.jar $API/api/dashboard   # RNA-001, trabajador externo
#   los mismos KPI de toda la operacion interna
```

---

## [GRAVE] 5. El supervisor recibe importes en pesos aunque no tenga permiso de costos

**Gravedad:** GRAVE
**Rompe:** "quien no tiene permiso de costos no debe ver costos en ninguna respuesta, ni siquiera escondidos en el JSON"
**Donde:** `server/routes/analitica.js`, endpoint `GET /api/analitica/kits`

El endpoint deja pasar a quien tenga `analitica.leer` **o** `analitica.area`
(el supervisor tiene la segunda), pero luego devuelve `costo_estandar`,
`costo_real` y `variacion_costo` sin comprobar `puedeVerCostos`. Todos los demas
endpoints si limpian los costos correctamente; este se quedo fuera.

**Como reproducirlo:**

```bash
curl -s -b sup.jar $API/api/auth/me    # permisos: NO incluye costos.leer
curl -s -b sup.jar $API/api/analitica/kits
#   {"kit":"Kit Electrico",
#    "costo_estandar":43193.115,"costo_real":41842.877,"variacion_costo":-1350.24}
```

**Que esperaba:** que esos tres campos no vinieran en la respuesta.
**Que paso:** vienen con el importe exacto en pesos.

---

## [GRAVE] 6. El consumo por area mezcla las dos empresas y no pide ningun permiso

**Gravedad:** GRAVE
**Rompe:** alcance por empresa
**Donde:** `server/routes/analitica.js`, endpoint `GET /api/analitica/area`

Filtra por area pero nunca por empresa, y solo pide sesion iniciada.

**Como reproducirlo:**

```bash
curl -s -b rsu.jar $API/api/analitica/area
#   area: "Acabados", vales.total: 71

# cuantos de esos 71 son de su empresa, segun el administrador:
curl -s -b admin.jar "$API/api/vales?area_id=7&limit=1"                 # total 71
curl -s -b admin.jar "$API/api/vales?area_id=7&empresa=REYNA&limit=1"   # total 36
```

**Que esperaba:** 36, solo lo de su empresa.
**Que paso:** 71, incluidos los 35 vales internos, mas los 25 materiales mas
consumidos del area sumando las dos empresas.

---

## [GRAVE] 7. La empresa externa puede exportar a Excel informacion de la empresa interna

**Gravedad:** GRAVE
**Rompe:** alcance por empresa
**Donde:** `server/routes/exportar.js`

El filtro de empresa es `filas.filter((f) => f.Empresa === undefined || f.Empresa === 'REYNA')`.
Los reportes que **no tienen columna Empresa** se salvan enteros del filtro.

**Como reproducirlo:**

```bash
curl -s -b rsu.jar $API/api/exportar
#   {"reportes":["inventario","consumo_trailer","consumo_area","kits","alertas"]}

curl -s -b rsu.jar $API/api/exportar/consumo_trailer
#   Trailer,Cliente,Modelo,Estado,Vales,Piezas netas
#   183,Cliente Demo Delta,Food Truck Premium,EN_PROCESO,23,1144.41
#   182,Cliente Demo Gamma,Food Truck Estandar,TERMINADO,22,1046.4
#   ...

curl -s -b rsu.jar $API/api/exportar/consumo_area
#   Area,Vales
#   Electricidad,28
#   Plomeria,32 ...
```

**Que esperaba:** que solo pudiera bajar informacion de su empresa.
**Que paso:** se lleva en un archivo de Excel el nombre de cliente, el modelo,
el estado y el consumo de cada trailer de la empresa interna, mas el consumo de
todas las areas, mas el inventario completo. Los importes si se los quita el
filtro de costos, pero el resto sale entero.

---

## [GRAVE] 8. Una entrada de almacen admite cantidades absurdas y costos negativos, sin ningun aviso

**Gravedad:** GRAVE
**Donde:** `server/routes/inventario.js`, endpoint `POST /api/entradas`

La cantidad solo se valida `> 0` (sin techo) y el costo no se valida en
absoluto. En la interfaz los campos tienen `min` pero al leerse con
`Number(valor) || 0` en el evento `change`, el `min` no frena nada.

**Como reproducirlo (todo desde la interfaz):**

1. Entrar como `ALM-01` / PIN `200001` y abrir **Entradas**.
2. **Registrar entrada**, buscar `Silicon` y agregar ACA-0001 (existencia 2,655).
3. Escribir cantidad `100000` y costo unitario `-500`.
4. **Registrar entrada**.

**Que esperaba:** que rechazara el costo negativo y que al menos pidiera
confirmacion por una cantidad cuarenta veces mayor a la existencia.
**Que paso:** "Entrada ENT-2026-00009 registrada", sin una sola advertencia.
El material paso de 2,655 a **102,655** piezas y su valor de inventario de
**$254,880 a $9,854,880**. En movimientos quedo grabado un importe de
**-$50,000,000**:

```
tipo=ENTRADA cantidad=100000 precio_unitario=-500 importe=-50000000
stock_antes=2655 stock_despues=102655
```

Si esto pasa durante la demostracion, el panel ejecutivo y el valor de
inventario quedan con numeros imposibles delante del cliente y no hay forma de
deshacerlo desde la interfaz.

Lo que **si** esta bien: los ajustes negativos si comprueban la existencia
(`No puede descontar mas de la existencia actual`), y las cantidades negativas o
de texto en los vales si se rechazan.

---

## [GRAVE] 9. Con la notificacion en vivo el vale NO aparece en la lista de Autorizaciones sin recargar

**Gravedad:** GRAVE
**Donde:** `public/js/app.js`, funcion `consultarNotificaciones()`
**Es el paso 3 del recorrido de la demostracion.**

La consulta cada 10 segundos si funciona: pinta el aviso, suena, vibra y
enciende el punto rojo. Pero **solo toca la campana**; nunca vuelve a pintar la
vista que se esta viendo. El supervisor recibe el aviso de un vale que no puede
ver hasta que recarga.

**Como reproducirlo:**

1. Navegador A: entrar como `SUP-01` / PIN `100001` y quedarse en
   **Autorizaciones**.
2. Navegador B: entrar como `EMP-001` / PIN `300001` y crear un vale cualquiera.
3. Esperar sin tocar nada en el navegador A.

**Que esperaba:** que apareciera el vale en la lista, como dice el instructivo.
**Que paso:** medido en el navegador, muestreando cada 6 segundos durante 30:

```
t+6s   avisos=[]                                                  vale visible=false
t+12s  avisos=["Nueva solicitud pendiente: Kevin Orozco Padilla
                creo el vale PT-2026-000204. Tra..."]             vale visible=false
t+18s  (igual)                                                    vale visible=false
t+24s  (igual)                                                    vale visible=false
t+30s  (igual)                                                    vale visible=false
peticiones a /api/notificaciones: 21:51:09, 21:51:19, 21:51:29, 21:51:39
```

Al pulsar recargar, el vale aparece de inmediato. El punto rojo tambien se
comprobo por separado y **si** funciona bien: pasa a `campana-punto oculto`
despues de marcar todo leido y vuelve a `campana-punto` visible en la siguiente
consulta despues del vale nuevo.

Es un hallazgo de demostracion: el guion dice "debe aparecer el vale" y no
aparece. Se ve raro que suene el aviso y la pantalla se quede igual.

---

## [GRAVE] 10. El contador que aparece junto a "Autorizaciones" no cuenta vales pendientes

**Gravedad:** GRAVE (se ve en la demostracion, en el menu, todo el tiempo)
**Donde:** `public/js/app.js`, `menu()` -> `{ ..., badge: 'pendientes' }`

Ese `pendientes` es `estado.pendientes`, que son **notificaciones sin leer**, no
vales pendientes de autorizar.

**Como reproducirlo:**

1. Entrar como `SUP-01`, abrir la campana y marcar todo como leido.
2. Que un trabajador cree **un** vale, y esperar la consulta de 10 segundos.
3. Mirar el menu lateral y luego abrir Autorizaciones.

**Que esperaba:** el mismo numero en los dos lados.
**Que paso:** el menu decia **Autorizaciones 1** mientras la pantalla decia
**Pendientes 5**. Si el supervisor abre la campana antes de la demostracion, el
menu se queda en 0 aunque tenga vales esperando.

---

# MENORES

## [MENOR] 11. Un costo no numerico en una entrada tira un error 500

**Donde:** `server/routes/inventario.js` linea 140

```bash
curl -s -b alm.jar -X POST $API/api/entradas -H 'Content-Type: application/json' \
  -d '{"items":[{"material_id":51,"cantidad":1,"costo":"abc"}]}'
#   {"error":"Error interno del servidor"}
```

En la Terminal queda `NOT NULL constraint failed: entrada_items.costo`. La
transaccion revierte bien y no queda basura en la base, y el mensaje al usuario
no filtra nada; pero deberia ser un 400 con un mensaje claro. Solo se alcanza
por la API, la interfaz siempre manda un numero.

## [MENOR] 12. No se puede cambiar solo el costo de un material por la API

**Donde:** `server/routes/catalogo.js`, `PUT /api/materiales/:id`

`sentenciaActualizacion` se llama con una lista de campos que **no incluye**
`costo`, asi que si el cuerpo solo trae `costo` la funcion lanza
`No se recibio ningun cambio` antes de llegar al bloque que si versiona el costo.

```bash
curl -s -b admin.jar -X PUT $API/api/materiales/51 -H 'Content-Type: application/json' \
  -d '{"costo":999,"motivo":"prueba"}'
#   {"error":"No se recibio ningun cambio"}
```

Desde la interfaz no se nota porque el formulario manda siempre todos los
campos. Mandando el objeto completo el precio historico si funciona: cambie el
costo de 96 a 999 y la linea ya entregada conservo 96 en `precio_unitario`, en
`importe` y en el movimiento de salida.

## [MENOR] 13. Con una sesion abierta se puede reemplazar el segundo factor del administrador sin la contrasena

**Donde:** `server/routes/auth.js`, `POST /api/auth/2fa/iniciar`

`2fa/iniciar` sobreescribe `twofa_secret` con solo tener sesion: no pide la
contrasena y no deja registro en auditoria. Si el 2FA ya estaba activo,
`twofa_enabled` se queda en 1 pero con el secreto nuevo, asi que el codigo del
telefono del administrador legitimo deja de servir de inmediato.

**Como reproducirlo:** con una sesion de administrador abierta (un equipo sin
bloquear), llamar `POST /api/auth/2fa/iniciar` y quedarse con el `secret` que
devuelve. Medido:

```
login con el codigo LEGITIMO  -> {"error":"Codigo de verificacion incorrecto"}
login con el codigo del nuevo -> entra
auditoria: no hay ningun registro de la llamada a 2fa/iniciar
```

Deberia pedir la contrasena, igual que hace `2fa/desactivar`, y quedar auditado.

## [MENOR] 14. Los motivos y el nombre de cliente no tienen limite de longitud

Las notas del vale si se recortan a 500 caracteres, pero `motivo` y
`motivo_cierre` no se recortan en ningun lado, y `trailers.cliente` tampoco.
Guarde 5,000 caracteres en los dos:

```bash
LARGO=$(python3 -c "print('A'*5000)")
curl -s -b emp.jar -X POST $API/api/vales/207/cancelar \
  -H 'Content-Type: application/json' -d "{\"motivo\":\"$LARGO\"}"   # {"ok":true}
```

Se guardan los 5,000 y luego se pintan enteros en el detalle del vale y en la
lista de trailers. No rompe nada, pero desarma la pantalla.

## [MENOR] 15. Se aceptan cantidades absurdas en un vale

```bash
curl -s -b emp.jar -X POST $API/api/vales -H 'Content-Type: application/json' \
  -d '{"trailer_id":4,"items":[{"material_id":33,"cantidad":1e15}]}'
#   vale creado con cantidad_solicitada = 1000000000000000
```

Si el supervisor lo autoriza, el comprometido de ese material se va a
1e15 y el disponible del inventario queda en un numero ilegible. Los negativos,
los textos e `Infinity` si se rechazan correctamente.

## [MENOR] 16. La cookie de sesion sale sin `Secure`

En el demo `SECURE_COOKIES` esta apagado, asi que la cabecera es:

```
Set-Cookie: dv_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800
```

`HttpOnly` y `SameSite` estan bien, y en la base solo se guarda el sha256 del
token (lo comprobe). Pero como la demostracion va a salir por un tunel con
HTTPS, conviene levantar el servidor con `SECURE_COOKIES=1` ese dia. Lo anoto
como recordatorio de operacion, no como error de codigo.

## [MENOR] 17. Cuatro catalogos se leen sin comprobar permiso

**Donde:** `server/routes/catalogo.js`, el bucle que registra
`/api/unidades`, `/api/categorias`, `/api/proveedores` y `/api/areas`

Los `GET` solo llaman `requireUser(ctx)`. Un trabajador puede listar la tabla de
proveedores completa con contacto, telefono y correo:

```bash
curl -s -b emp.jar $API/api/proveedores
```

Los `POST` y `PUT` si piden `catalogo.escribir` correctamente.

## [MENOR] 18. La lista de surtido se arma sin comprobar alcance (riesgo latente)

**Donde:** `server/routes/almacen.js`,
`GET /api/almacen/vales/:id/preparacion` llama `detalleVale(valeId, null)`.

Con `null` como usuario, `detalleVale` se salta las comprobaciones de rol, de
area y de empresa, y ademas devuelve los costos siempre. Hoy **no es
explotable** porque los tres usuarios de almacen del demo son de la empresa
interna y ningun usuario externo tiene `vales.preparar`. Pero el dia que exista
un almacenista de la empresa externa, ese endpoint le va a entregar cualquier
vale interno. Lo anoto para que se cierre junto con los demas de alcance.

## [MENOR] 19. Se puede registrar una devolucion contra un vale ya cerrado

**Donde:** `server/routes/almacen.js`, `POST /api/almacen/vales/:id/devolucion`

A diferencia de la entrega, la devolucion no comprueba el estado del vale. Sobre
un vale en estado `CERRADO` la acepto y sumo el material al inventario. Puede
que sea el comportamiento deseado (devolver despues de cerrar es realista), pero
hoy no esta decidido a proposito ni documentado, y el vale cerrado no vuelve a
abrirse ni cambia de estado.

Todo lo demas de la regla 11 esta bien: no se puede devolver mas de lo
entregado, hace falta motivo, y ni el trabajador ni el supervisor pueden
registrar devoluciones.

## [MENOR] 20. En la pantalla de acceso, los digitos escritos en cualquier lado entran al PIN

**Donde:** `public/js/views/acceso.js`, `document.onkeydown`

El manejador esta puesto en el documento, no en el campo. Si alguien escribe el
numero de empleado y toca un digito con el foco fuera del campo, el digito se va
al PIN sin que se vea donde. Con seis digitos el formulario se envia solo. En un
iPad compartido con teclado es facil que pase.

---

# COSMETICOS

## [COSMETICO] 21. En telefono se ven tres pestañas y hay seis

En **Mis vales** a 390 px de ancho se ven "Todos", "Pendientes" y "Aprobados";
"Preparados", "Entregados" y "Rechazados" quedan fuera. La tira **si** se
desplaza (`overflow-x: auto`, ancho real 802 px sobre 366 visibles), asi que no
esta rota, pero no hay ninguna señal de que haya mas a la derecha. Falta un
degradado o una flecha en el borde.

## [COSMETICO] 22. Los nombres de material se parten en tres renglones en telefono

En la pantalla de crear vale, a 390 px, "Cable THW calibre 12 negro" y
"Contacto duplex polarizado 15A" ocupan tres renglones cada uno porque la
columna del nombre queda muy angosta al lado de los botones de cantidad. Se lee,
pero la lista se ve apretada.

## [COSMETICO] 23. La pantalla de crear vale mide casi 5,000 px de alto con un kit

Con el Kit Electrico (9 materiales) agregado, la pagina en iPhone mide unos
5,000 px y el boton **REVISAR Y ENVIAR** queda hasta abajo. Hay que hacer
bastante scroll. Cronometre el paso 2 completo (entrar, elegir trailer, agregar
kit, ajustar una cantidad, revisar y enviar): **5.5 segundos** con automatizacion,
o sea que el objetivo de menos de un minuto se cumple de sobra con una persona;
es solo comodidad.

---

# Probado y sin hallazgos

Todo esto lo intente romper a proposito y aguanto.

**Reglas de negocio**

- Regla 1, las cuatro cantidades: se conservan siempre. En pantalla se ven
  ESTANDAR 75 / SOLICITADO 3 / AUTORIZADO 1 / ENTREGADO 1 en la misma linea.
- Regla 2, autorizar de mas: `cantidad_autorizada: 50` sobre 5 solicitadas ->
  `No puede autorizar mas de lo solicitado`. Negativo -> `Cantidad no valida`.
  Mandar `cantidad_solicitada: 99` en el cuerpo de la autorizacion **no** cambia
  la solicitada: se quedo en 5.
- Regla 4, entregar de mas: 40 sobre 2 autorizadas -> `No puede entregar mas de
  lo autorizado (pendiente: 2)`. Negativo -> rechazado. **Con vales distintos**
  el control de existencia si funciona (ver el BLOQUEANTE, que es el caso de dos
  lineas del mismo vale).
- Regla 5, entrega parcial: el vale queda en ENTREGA_PARCIAL con su pendiente
  correcto y se puede seguir surtiendo despues.
- Regla 6, precio historico: cambie el costo de ACA-0001 de 96 a 999 despues de
  entregar; la linea, el importe y el movimiento conservaron 96.
- Regla 7, kits versionados: cree la version 3 del Kit Electrico despues de un
  vale hecho con la version 2; el vale conservo `version_snapshot = 2` y sus 9
  lineas intactas.
- Regla 8, kit maestro: ajustar una cantidad dentro de un vale no toco el kit
  maestro (compare el kit completo antes y despues, identico).
- Regla 9, catalogo cerrado: el vale guarda `sku_snapshot` y `nombre_snapshot`;
  no hay forma de escribir el nombre a mano.
- Regla 10, unidades: `1.77` en una unidad PZA se ajusta a `2`, y `0.4` se
  rechaza con `debe ser mayor a cero`.
- Regla 11, devoluciones: solo el almacen (y el administrador) pueden; nunca mas
  de lo entregado; siempre con motivo.
- Regla 12, auditoria: quedan registrados LOGIN, LOGIN_PIN, LOGOUT,
  VALE_CREADO, VALE_AUTORIZADO, VALE_RECHAZADO, VALE_EN_PREPARACION,
  VALE_PREPARADO, ENTREGA_REGISTRADA, DEVOLUCION_REGISTRADA, VALE_CERRADO,
  VALE_CANCELADO, ENTRADA_REGISTRADA, INVENTARIO_*, MATERIAL_*, KIT_*,
  TRAILER_*, USUARIO_*, CONFIGURACION_MODIFICADA, EXPORTACION, 2FA_*,
  SESION_REVOCADA (15 acciones distintas presentes en la base tras mis pruebas),
  con usuario, fecha, valor anterior, valor nuevo, motivo e IP. **No existe
  ningun endpoint DELETE** para vales, materiales ni auditoria: probe
  `DELETE /api/auditoria`, `/api/vales/:id` y `/api/materiales/:id` y los tres
  dan `Ruta no encontrada`. El unico DELETE del sistema revoca sesiones.

**Maquina de estados y carreras**

- Cerrar el pendiente y despues entregar -> `El vale no esta en condiciones de
  entrega (estado: CERRADO)`.
- Cancelar y despues autorizar o entregar -> rechazado por estado.
- Cancelar un vale ajeno -> `No puede cancelar este vale`. Ver un vale ajeno ->
  `Solo puede consultar sus propios vales`.
- Doble clic en autorizar (dos peticiones a la vez): la primera aprueba, la
  segunda da 409. La cantidad autorizada queda correcta.
- Doble clic en entregar (dos peticiones a la vez): la primera entrega, la
  segunda da 409. Se entregaron 4 de 4, no 8.
- Dos vales distintos del mismo material con existencia justa, entregados a la
  vez: uno pasa, el otro da `Stock fisico insuficiente`, y el stock quedo en 0,
  nunca negativo.
- Reutilizar una firma: `Esa firma ya fue registrada anteriormente`.
- Firma demasiado corta o sin nombre de quien recibe: rechazadas.

**Alcance por rol**

Probe con cada rol todas las pantallas por URL directa. Estan bien bloqueadas
`/inventario`, `/movimientos`, `/entradas`, `/auditoria`, `/usuarios`,
`/configuracion`, `/exportar`, `/almacen` y `/reyna` para quien no le toca. Por
API, un trabajador recibe el 403 correcto en `/api/almacen/cola`,
`/api/vales/:id/autorizar`, `/api/auditoria`, `/api/usuarios`,
`/api/inventario`, `/api/movimientos` y `/api/exportar/*`. Las unicas fugas son
las de los hallazgos 3, 4, 5, 6, 7 y 17.

**Alcance por empresa (lo que si funciona)**

`GET /api/vales` de `RSU-01` devuelve solo vales REYNA. Abrir un vale interno
por URL da `Este vale no pertenece a su area` / `Solo puede consultar sus
propios vales`. Los movimientos si filtran por empresa. El flujo completo de la
empresa externa funciona: `RNA-001` crea, `RSU-01` autoriza (y `SUP-01` **no**
puede), el almacen entrega y el movimiento queda con `empresa = REYNA`.
`/api/reyna/*` esta bien cerrado: `RSU-01` no tiene `reyna.leer`.

**Seguridad**

- Inyeccion SQL: probe `' OR 1=1--`, `x'; DROP TABLE vales;--` y
  `2020-01-01') OR 1=1--` en el buscador de materiales, el buscador global, los
  filtros de fecha de vales y el parametro de exportacion. Todo va con consultas
  preparadas: devuelven cero resultados y las tablas quedaron intactas (205
  vales antes y despues).
- Texto malicioso: guarde `<img src=x onerror=alert(1)>`, comillas, acentos y
  emoji en notas, motivos, nombre de cliente y modelo de trailer. Se muestran
  como texto en todas las pantallas, incluida auditoria. La interfaz construye
  todo con `textContent` y solo usa `innerHTML` para los SVG que genera ella
  misma. Cero errores de JavaScript en la consola.
- CSP: la cabecera esta puesta y es estricta (`default-src 'self'`,
  `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`). Tambien estan `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy` y `Permissions-Policy`.
- Recorrido de rutas: probe `/../server/schema.sql`, `/..%2fserver%2fdb.js`,
  `/%2e%2e/server/index.js`, `/css/../../server/config.js`, `/data/app.db` y
  `/../data/app.db`. Ninguno sirve archivo: los bloquea el filtro de
  `serveStatic`. `/../../etc/passwd` responde 200 pero es **index.html** (la
  aplicacion es de una sola pagina y cualquier ruta desconocida devuelve el
  armazon); no se filtra ningun archivo.
- Contrasenas y PIN: no aparecen ni en `/api/auth/me`, ni en `/api/usuarios`,
  ni en ningun mensaje de error, ni en la salida de la Terminal. En la base solo
  hay hashes `scrypt$16384$8$1$...`.
- Sesiones: cerrar sesion invalida de verdad la cookie (`Sesion no valida o
  expirada` al reintentarla), y revocar una sesion desde Administracion tambien.
  En la tabla `sessions` el `id` es el sha256 del token, nunca el token.
- Enumeracion de usuarios: el mensaje es el mismo para un empleado que no existe
  y para un PIN equivocado (`ID de empleado o PIN incorrecto`). Bien resuelto.
- Bloqueo por intentos: tras 5 fallos pide la verificacion aritmetica y despues
  bloquea la cuenta (`Acceso bloqueado temporalmente por intentos fallidos`),
  aunque se cambie de IP en cada intento.
- 2FA: no se salta mandando el login sin codigo (devuelve `requiere_2fa`), ni
  con `codigo: null`, ni con un codigo inventado, ni mandando un arreglo en vez
  de una cadena.
- Cuerpo gigante: 8 MB en una peticion se corta con 413 y el servidor sigue
  respondiendo.
- Notificaciones ajenas: `EMP-001` intento marcar como leida una notificacion del
  supervisor; la peticion devuelve `{"ok":true}` pero **no** modifica nada,
  porque el UPDATE lleva `AND user_id = ?`. La notificacion del supervisor siguio
  sin leer.

**Interfaz**

- Recorri en telefono (390x844, con toque real) las pantallas de acceso, mis
  vales, crear vale, detalle de vale, cola de almacen, preparar, inventario,
  entradas, movimientos, kits, trailers, empresa externa, exportar y perfil.
  **Ninguna desborda horizontalmente** (`scrollWidth` = 390 en todas). Las tablas
  anchas se desplazan dentro de su propio contenedor.
- Modo oscuro: las mismas pantallas con `prefers-color-scheme: dark`, todas con
  fondo `rgb(15,19,25)` y sin desbordes.
- La firma con el dedo funciona: dibuje con eventos tactiles reales sobre el
  canvas, se guardo y la entrega quedo registrada. El aviso "Entrega registrada.
  Inventario actualizado." salio y la existencia bajo de 2,656 a 2,655 en la
  misma pantalla.
- Consola del navegador abierta todo el recorrido: **cero errores de
  JavaScript**. Lo unico que aparece son los 401 y 403 esperados cuando se
  entra a una pantalla sin permiso, que la aplicacion maneja bien.
- El aviso emergente no tapa el boton principal (lo comprobe con
  `elementFromPoint` sobre el centro del boton REVISAR Y ENVIAR).
- `npm test` pasa 14 de 14 antes y despues de todas las pruebas.

---

## Notas de operacion para el dia de la demostracion

1. Correr `npm run reset` antes de empezar: mis pruebas dejaron la base sucia
   varias veces y la volvi a dejar limpia al terminar.
2. Levantar el servidor con `SECURE_COOKIES=1` si sale por el tunel (hallazgo 16).
3. **No tocar la pantalla de Entradas** delante del cliente hasta que este
   arreglado el hallazgo 8.
4. Nunca cambie la duracion de la sesion con PIN: los cinco minutos no me
   estorbaron porque cada peticion renueva la sesion. La restriccion de red si
   la encendi para probar el hallazgo 2 y la volvi a apagar. Comprobado al
   terminar: `sesion_pin_minutos = 5`, `restriccion_red_activa = 0`,
   `redes_permitidas` con sus valores de origen, 200 vales y **ningun material
   con existencia negativa**. La base quedo como recien sembrada.
