# Pendientes de codigo

> Lista de trabajo para el chat de CODIGO, en orden. Cada tarea trae el porque,
> los archivos, los criterios de aceptacion y lo que NO hay que tocar.
> Al terminar una tarea, marca su casilla en este archivo dentro del mismo commit.

## Reglas para todas las tareas

- Rama de trabajo: `claude/demo-vales-inventario-wx3qqn`. No crear ramas nuevas.
- `npm test` debe pasar completo antes de dar una tarea por terminada.
- Cuando la tarea toca pantalla, verificarla en la aplicacion corriendo, no solo
  que compile.
- Sin dependencias de npm y sin recursos externos: la CSP solo permite el propio
  origen.
- Todo en espanol y sin acentos en el codigo.
- Commits en espanol explicando el porque del cambio, y push a la rama.
- **Aditivo**: ninguna tarea nueva debe poder romper el flujo de vales ni el
  inventario. Si la funcion nueva falla, la app tiene que seguir funcionando
  igual que hoy.
- Si una tarea se complica mas de lo previsto, parar y avisar antes de seguir.
  Vale mas dejarla fuera que arriesgar la demostracion.

---

# ANTES DE LA PRESENTACION

## [x] 1. El almacen tambien queda restringido a la red de la planta

**Obligatorio.** El anexo que se le entrega al cliente ya afirma este
comportamiento, asi que el codigo tiene que decir lo mismo.

Hoy, en `server/routes/auth.js`, la restriccion solo aplica a `TRABAJADOR`:

```js
if (user.rol === 'TRABAJADOR' && !redAutorizada(ctx.ip)) { ... }
```

Debe aplicar tambien a `ALMACEN`: el material se entrega fisicamente en la
planta, no tiene sentido entregar desde fuera. `SUPERVISOR` se queda como esta
(autoriza desde donde sea) y `DIRECCION` / `ADMIN` tambien, que entran con
correo, contrasena y 2FA.

**Prueba de regresion** en `test/flujo.test.js`: con la restriccion de red
activa, el login con PIN de un usuario `ALMACEN` desde una IP fuera de las redes
permitidas debe ser rechazado; desde dentro debe pasar.

Aviso para no perder tiempo: `redAutorizada()` en `server/lib/net.js` devuelve
`true` para `::1`, y las redes permitidas por defecto incluyen `127.0.0.0/8`.
Una prueba contra localhost pasaria siempre. Hay que dejar `redes_permitidas` en
un rango que NO incluya localhost y restaurar el valor al terminar.

## [x] 2. No mostrar disponibles en negativo

Cuando hay mas autorizado que existencias, el disponible queda negativo y en
pantalla se lee "-127". Es correcto, pero parece un error y en la demostracion
invita a una pregunta incomoda.

Cambiar **solo la presentacion** en:

- `public/js/views/inventario.js:82`
- `public/js/views/panel.js:113`
- `public/js/views/material.js:50`

Cuando el disponible sea negativo, mostrar `0` y junto a el cuanto falta
(del estilo "0" con una etiqueta "faltan 127"). Resolverlo con el sistema visual
que ya existe en `public/js/ui.js` y `public/css/app.css`.

**El dato NO cambia.** La regla de negocio 3 dice que el disponible si puede ser
negativo (el fisico nunca). No tocar la vista `v_inventario`, ni las consultas,
ni ningun calculo del servidor.

## [x] 3. Notificacion en vivo dentro de la aplicacion

Hoy las notificaciones se guardan bien (tabla `notificaciones`,
`server/lib/notify.js`, endpoints en `server/routes/auth.js:209`) pero el usuario
solo las ve si abre o recarga la app. Se quiere que aparezcan solas.

Esta tarea es la version **sin riesgo** de las notificaciones: no necesita HTTPS
ni dominio ni criptografia, y da casi el mismo efecto en una demostracion en
vivo, donde todos tienen la app abierta.

Que la aplicacion consulte `/api/notificaciones` periodicamente mientras haya
sesion abierta y, cuando llegue una nueva:

- actualice el contador de pendientes
- muestre un aviso visible en pantalla, con el sistema visual existente
- haga un sonido corto y vibracion si el dispositivo lo soporta

Criterios:

- Cada 10 segundos. Detener la consulta cuando `document.hidden` sea verdadero y
  reanudar al volver, para no gastar bateria.
- Si la peticion falla: no mostrar error, no romper nada, reintentar despues.
- Verificar con dos navegadores abiertos: crear un vale en uno y ver que el aviso
  aparece solo en el otro, sin recargar.

## [x] 14. Decir "AGOTADO" con todas sus letras al crear un vale

Hoy el buscador de materiales muestra `Disponible: N` y un punto de color con el
semaforo, y las lineas del vale muestran el disponible. En una iPad, un punto de
color no comunica "ya no hay".

- En el buscador y en las lineas del vale, cuando el disponible sea 0 o menos,
  mostrar la palabra **AGOTADO** en texto, no solo el color.
- Al agregar un material agotado, avisar de forma visible.

**El ciclo real es de minutos, no de dias.** El trabajador pide a las 3:00 y a
las 3:10 esta en el mostrador del almacen. Lo que no esta en el estante ahora no
va a estar en diez minutos, asi que el objetivo de este aviso no es informar:
es **evitarle el viaje en balde**.

Aun asi, **avisar y no bloquear**, por una razon distinta a la de la regla 3: en
los primeros meses el stock del sistema y el del estante no coinciden. Si dice 0
y en el rack hay 20, bloquear deja al trabajador sin salida y sin nadie a quien
reclamar. Que el aviso sea imposible de pasar por alto, y que el decida.

- Antes de enviar el vale, si trae material sin existencia, un aviso claro:
  cuantas lineas y que el almacen no va a poder entregarlas hoy.
- Que la lista de surtido del almacen tambien marque esas lineas, para que el
  almacenista lo sepa antes de que el trabajador llegue.

**No es un detalle cosmetico: es un momento de la demostracion.** Es la unica
parte del flujo donde se ve, en pantalla y en un segundo, algo que con papel es
imposible saber sin caminar al almacen y hacer fila.

Solo presentacion: no tocar consultas ni calculos.

---

# DESPUES DE LA PRESENTACION

Estas tareas suben el valor del producto. **No empezarlas antes de la junta:**
la app esta terminada y probada, y una funcion nueva agrega riesgo, no valor.

## [ ] 15. Cerrar una linea del vale, y sustituir un material

Nace de dos peticiones reales: el trabajador ya no necesita un material, o se
equivoco de material y el almacenista lo descubre en el mostrador.

**Lo que NO se hace: dejar que el almacen edite o borre la linea.** Rompe la
regla 1 (las cuatro cantidades no se sobrescriben) y la 12 (no se borra
informacion historica). Un almacenista que puede borrar lineas del vale de otro
es el agujero que ya tenia el papel.

**Ya no lo necesita** -> cerrar esa linea con motivo, entregada = 0, el resto del
vale sigue vivo. Ya existe `POST /api/almacen/vales/:id/cerrar-pendiente` pero
cierra el vale completo; falta poder cerrar **una sola linea**. La infraestructura
esta: `estado_linea = 'CERRADA'` y `motivo_linea` ya existen en el esquema.

**Se equivoco de material** -> sustitucion, no edicion. La linea original se
cierra con motivo, y se agrega una linea nueva marcada como sustitucion de
aquella. Las dos quedan en el vale y en la auditoria.

Reglas:

- Motivo obligatorio, de una lista corta y configurable (ya existe la tabla
  `motivos_rechazo`, ver si sirve o hace falta una propia).
- **Notificar al trabajador y al supervisor en el momento.** El almacenista puede
  cerrar la linea, pero la decision no es suya: la trazabilidad resuelve el
  problema de autoridad. Las notificaciones en vivo ya funcionan.
- La **sustitucion la confirma el supervisor**, porque cambia el costo del
  trailer. Configurable desde Configuracion, activado por defecto.
- Todo a auditoria con usuario, motivo, linea anterior y linea nueva.
- El comprometido y el disponible se recalculan al cerrar la linea.

Efecto secundario que vale dinero: con esto se puede contar cuantas veces se
pidio mal cada material. Senala nombres confusos, kits mal armados y gente que
necesita capacitacion. Ese dato hoy no existe en ningun lado.

## [ ] 4. Fotos de materiales

El campo `foto` ya existe en la tabla `materiales` (`server/schema.sql:142`) y ya
se lee en la vista de inventario. Falta el almacenamiento de archivos.

- Subida desde la pantalla del catalogo.
- Guardado en disco junto a la base de datos (carpeta de datos), con la ruta en
  el campo que ya existe.
- Mostrarla en la pantalla del material y **en la lista de surtido del almacen**,
  que es donde de verdad sirve: el almacenista ve la foto y surte lo correcto.
- Limitar tipo y tamano de archivo, y validar en el servidor, no solo en el
  navegador.

Es la funcion de mas valor por hora de trabajo y la unica de esta seccion que no
depende de HTTPS.

## [ ] 16. La sesion del supervisor no puede durar 5 minutos

Sale del ritmo real de la planta: el trabajador pide a las 3:00 y a las 3:10
esta en el almacen, asi que **el supervisor esta en la ruta critica** y tiene que
autorizar dentro de esa ventana. Con la sesion de 5 minutos, mete su PIN cada
vez que le llega un vale. En tres dias lo odia y vuelve al papel.

Su telefono es personal, no una iPad compartida de planta: la sesion corta se
diseno para las iPads, y al supervisor no le aplica la misma razon.

- Separar el tiempo de sesion por rol, configurable desde Configuracion.
  Trabajador y almacen (iPads compartidas) se quedan cortos; supervisor mucho
  mas largo.
- Cuidado: el supervisor sigue entrando con PIN, asi que no basta con cambiar
  `sesion_pin_minutos`, que hoy aplica a los tres roles por igual.

Va junto con la tarea 5, que resuelve lo mismo para direccion y gerencia.

## [ ] 5. Sesiones largas en dispositivos de confianza

Hoy la sesion con contrasena dura 8 horas (`SESSION_MINUTES_PASSWORD`). Para
direccion y gerencia en su telefono personal, permitir marcar el dispositivo como
de confianza y extender la sesion a 30 dias. La tabla `sessions` ya guarda
dispositivo e IP.

- Configurable desde la pantalla de Configuracion.
- **No aplica a sesiones con PIN**: las iPads de planta son compartidas y su
  sesion corta es deliberada.
- El usuario debe poder ver y revocar sus dispositivos de confianza desde Perfil.

Esto resuelve la mayor parte de lo que la gente pide cuando dice "Face ID", por
mucho menos trabajo que la tarea 7. Hacer esta primero y despues evaluar si la 7
todavia hace falta.

## [ ] 6. Notificaciones push reales

**Requiere HTTPS con dominio real.** No se puede probar sobre `http://` en la red
local. En iPhone, ademas, solo llegan si la app esta anclada a la pantalla de
inicio: es regla de Apple, no un error del codigo.

Es la pieza mas delicada del proyecto: lleva firma de tokens, cifrado de cada
mensaje segun el estandar de push, y dialogo con los servidores de Apple y
Google, que devuelven errores poco descriptivos. Todo con `node:crypto`, sin
dependencias.

Que falta:

- Escuchar los eventos `push` y `notificationclick` en `public/sw.js`, que hoy
  solo maneja cache.
- Tabla de suscripciones: `user_id`, endpoint, llaves, nombre del dispositivo,
  fecha de alta y de ultimo uso.
- Llaves VAPID y el envio desde `server/lib/notify.js`, sin cambiar la firma de
  `notificar()` para no tocar quien ya la usa.

**Tres cosas que se olvidan y hay que construir:**

1. **Alta del dispositivo.** Crear al usuario NO es suficiente: la persona tiene
   que abrir la app en su telefono, iniciar sesion y aceptar el permiso. Solo en
   ese momento se crea el vinculo telefono-cuenta.
2. **Saber quien falta.** Una pantalla de administracion que muestre que usuarios
   tienen dispositivo dado de alta y cuales no. Sin eso, un supervisor sin dar de
   alta simplemente no recibe nada y **nadie se entera**: los vales se quedan
   esperando y el trabajador parado, sin ningun error visible.
3. **Limpiar buzones muertos.** Cuando alguien cambia de telefono, el servicio de
   push responde que el destino ya no existe. Hay que borrar esa suscripcion y
   pedir alta del nuevo dispositivo.

Reglas:

- En la pantalla de bloqueo **no** deben ir costos ni proveedores. Basta con
  "Vale PT-2026-000123 espera su autorizacion".
- **Nunca activarlas en las iPads compartidas de planta**: el buzon queda ligado a
  quien lo dio de alta y las notificaciones llegarian a la persona equivocada.
  Push solo en dispositivos personales.
- Si el permiso se deniega, el navegador no vuelve a preguntar. La interfaz debe
  explicar como rehabilitarlo desde los ajustes del telefono.

## [ ] 7. Face ID / huella (passkeys, WebAuthn)

Va al final: es comodidad, no un bloqueo. Hacer antes la tarea 5.

El telefono guarda una llave en su chip de seguridad ligada a la cuenta. Face ID
la desbloquea localmente y se firma un reto del servidor. **La aplicacion nunca ve
la cara ni recibe datos biometricos.**

Alcance: solo para usuarios que entran con correo y contrasena (`DIRECCION`,
`ADMIN`, gerencia) en su dispositivo personal. **Nunca** para los roles con PIN.
Debe convivir con la contrasena, no sustituirla: si se pierde el telefono, se
entra con contrasena y 2FA.

Que construir, sin dependencias:

- Tabla de credenciales: `user_id`, credential id, llave publica, contador de
  firmas, nombre del dispositivo, alta y ultimo uso. Varias por usuario. Se dan
  de baja desde Perfil.
- **Alta:** reto aleatorio guardado en el servidor, de un solo uso y con
  caducidad corta. Aceptar attestation `none`. Hace falta un decodificador CBOR
  minimo para sacar la llave publica del `attestationObject` y convertir la llave
  COSE a un formato que `node:crypto` pueda verificar. Solo ES256 (algoritmo -7);
  cualquier otro se rechaza con mensaje claro.
- **Entrada:** verificar la firma sobre `authenticatorData` + SHA-256 del
  `clientDataJSON`; que el reto sea el emitido y no usado; que `origin` y `rpId`
  sean los esperados; que las banderas de presencia y verificacion esten puestas;
  y que el contador de firmas no retroceda.
- Interfaz: boton "Entrar con Face ID" que solo aparezca si el navegador lo
  soporta, y alta/baja de dispositivos en Perfil.
- Auditoria: registrar alta de credencial, baja y cada entrada por esta via.

Donde se prueba: WebAuthn funciona en `localhost`, asi que se desarrolla y prueba
en la Mac con Touch ID. En el iPhone por la red local no va a funcionar hasta que
haya HTTPS con dominio.

Si el decodificador CBOR se va de las manos, parar y avisar: se puede vivir con
la tarea 5.

## [ ] 8. Escaneo de codigo de barras o QR en el surtido

Idea anotada, sin especificar todavia. El almacenista apunta la camara al rack en
vez de buscar en una lista. Sube la velocidad del surtido y quita errores de
captura. Requiere HTTPS (acceso a camara) y decidir antes como se etiquetan los
racks.

---

## [x] 9. Que la lista abierta se refresque sola

**Antes de la presentacion.** Salio al probar la tarea 3 en el telefono: al
supervisor le llega el aviso y el contador, pero si tiene la pantalla de
Autorizaciones a la vista, la lista no se actualiza. El vale aparece hasta que
toca la notificacion o vuelve a entrar.

Importa por la demostracion: el supervisor va a estar parado en esa pantalla
esperando, y que no aparezca nada invita a la pregunta "y por que no sale?".

Aprovechar la consulta que ya existe de la tarea 3. Cuando llegue una
notificacion nueva y el usuario este parado en una pantalla afectada, recargar
esa lista.

Solo en dos pantallas:

- **Autorizaciones** del supervisor
- **Cola de surtido** del almacen

No en el panel ni en el resto: ahi seria distraccion.

Cuidados:

- **Nunca recargar mientras el usuario esta a media accion** (un vale abierto,
  un formulario, una firma en curso). Si hay algo abierto, esperar.
- Conservar la posicion del desplazamiento: que no brinque la pantalla.
- Si falla la recarga, no mostrar error ni vaciar la lista: dejarla como estaba.

Es aditivo: si esto falla, todo lo demas sigue funcionando igual. Si se complica,
dejarlo fuera y avisar.

---

# HALLAZGOS DE PRUEBAS — arreglar antes de la junta

El chat de pruebas reporto 23 hallazgos en `docs/hallazgos.md`, con el numero,
la reproduccion y el comando exacto de cada uno. **Ese archivo es la fuente;
aqui solo va el orden y el criterio.**

Verificados a mano antes de escribir esto: el bloqueante (los dos bucles de
`server/routes/almacen.js` comparan contra el mismo stock inicial) y el
hallazgo 4 (`/api/dashboard` llama a `requireUser` pero nunca a
`requirePerm(user, 'dashboard.leer')`). El reporte es confiable, pero **cada
arreglo debe empezar por reproducir el fallo**, para poder escribir la prueba.

Van en cuatro grupos, en este orden. **Cada grupo es un commit aparte con sus
pruebas.** Si se acaba el tiempo, se para al terminar un grupo, nunca a la mitad.

## [x] 10. Grupo 1 — Integridad de inventario (hallazgos 1 y 8)

Lo mas grave y lo mas delicado de tocar, porque es el flujo central.

- **Hallazgo 1 (BLOQUEANTE).** En `POST /api/almacen/vales/:id/entregar`, el
  bucle que valida corre completo antes del que aplica, asi que dos lineas del
  mismo material comparan contra la misma existencia y las dos pasan. Llevar la
  cuenta de lo ya comprometido dentro de la misma entrega, o validar y aplicar
  material por material dentro de la transaccion. **El stock fisico no puede
  quedar negativo por ninguna via** (regla 3).
- **Hallazgo 8.** Validar cantidades y costos en las entradas de almacen:
  nada de costos negativos ni cantidades absurdas.

Pruebas de regresion obligatorias para los dos. Al terminar, **recorrer el flujo
completo de la demostracion** (crear, autorizar parcial, entregar parcial con
firma) para confirmar que no se rompio nada.

## [x] 11. Grupo 2 — Alcance y permisos (hallazgos 3, 4, 5, 6 y 7)

Son cinco caras del mismo problema y conviene arreglarlos juntos. Importan
doble: ademas de ser fallas, **contradicen lo que la propuesta le promete al
cliente** sobre separacion por rol y por empresa.

- **4.** `/api/dashboard` no comprueba `dashboard.leer` ni filtra por empresa.
- **3.** El buscador global deja ver vales y personal interno a un usuario de la
  empresa externa.
- **7.** La exportacion a Excel deja sacar informacion interna a la empresa
  externa.
- **5.** Llegan importes en pesos a quien no tiene `costos.leer`.
- **6.** El consumo por area mezcla las dos empresas y no pide permiso.

Regla al arreglar: **el permiso y el alcance por empresa se comprueban en el
servidor, en cada endpoint.** Que la interfaz no muestre un boton no es
proteccion. Revisar de paso los hallazgos 17 y 18, que son de la misma familia.

## [x] 12. Grupo 3 — Lo que se ve en la demostracion (hallazgos 9, 10, 21 y 23)

- **9.** El vale no aparece en Autorizaciones sin recargar. **Es la tarea 9 de
  arriba**; si ya se hizo, marcar las dos.
- **10.** El contador junto a "Autorizaciones" no cuenta vales pendientes.
- **21.** En telefono se ven tres pestanas y hay seis. El chat de pruebas lo
  puso como cosmetico; **no lo es para esta junta**: todos van a andar en
  telefono y la mitad de la navegacion esta escondida.
- **23.** La pantalla de crear vale mide casi 5,000 px con un kit. El paso que
  debe tomar menos de un minuto se vuelve un desfile de scroll en telefono.

## [x] 13. Grupo 4 — El tunel publico (hallazgo 2)

Durante la junta la app sale a internet por un tunel, asi que esto deja de ser
teorico.

**Hallazgo 2.** La cabecera `X-Forwarded-For` se puede falsificar y con eso se
salta la restriccion de red y el limite de peticiones (`server/lib/http.js`,
funcion `clientIp`).

**Cuidado al arreglarlo:** ignorar la cabecera por completo rompe la
demostracion, porque detras del tunel todo el mundo llegaria con la misma IP y
el limite de peticiones los tumbaria a todos. La cabecera debe respetarse
**solo cuando la peticion viene de un proxy de confianza configurado**, y usar
la direccion del socket en cualquier otro caso.

## Lo que NO se arregla antes de la junta

Hallazgos **11 a 20** (menos el 16, ver abajo) y el **22**. Son molestias que
nadie va a notar en quince minutos, y cada cambio extra es riesgo.

Dos aclaraciones:

- **Hallazgo 16** (cookie sin `Secure`) no es un error: es la configuracion
  local sobre `http`. Al publicar por el tunel hay que arrancar con
  `SECURE_COOKIES=1`. Es operacion, no codigo.
- **Hallazgo 13** (reemplazar el segundo factor con una sesion abierta) se
  arregla en cuanto haya tiempo, pero no bloquea la junta: requiere una sesion
  de administrador ya abierta.

---

## Fuera del codigo, pero bloquea las tareas 6 y 7

- [ ] Comprar un dominio y montar HTTPS. Sin eso, push y Face ID no se pueden ni
      probar. Tambien habilita anclar la app como aplicacion en el telefono y da
      un correo con dominio propio para la propuesta comercial.

**Decidido: el dominio se compra DESPUES de la junta, y solo si el cliente
compra el sistema.** `trazaapp.com` estaba disponible en 10 USD al ano; se deja
apartado como opcion, no reservado.

Consecuencia para el chat de codigo: **las tareas 6 y 7 no se empiezan.** No hay
donde probarlas y no van a la demostracion. La tarea 3, ya terminada, cubre el
momento de las notificaciones en la junta.

La demostracion corre sobre un tunel temporal de Cloudflare, que da HTTPS y
direccion desde datos celulares sin necesidad de dominio:

```
cloudflared tunnel --url http://localhost:3000
```
