# Hallazgos de pruebas

**Tercera vuelta, pasada corta de confirmacion: los hallazgos 11, 18 y 19 ya no
se reproducen, ninguna accion que escribe se rompio, ningun boton se queda
muerto despues de un error, y el recorrido de los siete pasos sale limpio.**
Quedan 7 abiertos: 6 menores y 1 cosmetico. Ninguno bloqueante ni grave.
**Se puede presentar**, con las tres notas de operacion del final.

Fecha: 3 de septiembre de 2026.
Codigo probado: rama `claude/demo-vales-inventario-wx3qqn`, commits `2b5c044`
(tarea 14), `4cdfe38` (tarea 17) y `e7b89de` (tarea 18), sobre lo ya verificado
en la segunda vuelta. Base recien sembrada. `npm test` pasa **20 de 20**.

Esta vuelta **no** es el instructivo completo: es la pasada corta que se pidio.
Lo que no aparece aqui quedo verificado en la segunda vuelta y no se toco.

---

# 1. Los tres hallazgos: los tres corregidos

## 11. Un doble toque en ENVIAR VALE creaba dos vales — CORREGIDO

Frené la red desde el navegador (el `POST /api/vales` tarda 1.2 s) y di dos
toques separados 400 ms, que es justo la ventana donde antes se colaba el
segundo.

```
a los 400 ms: boton en pantalla: true | DESACTIVADO: true | clase: btn btn-primario trabajando
el boton "Seguir editando" tambien: desactivado
segundo toque: el boton ya no acepta clics
VALES CREADOS: 1   (antes eran 2)
```

Se apagan **los dos** botones del pie, no solo el que se toco, y el que trabaja
enseña el giro. Un segundo toque no llega a ninguna parte.

## 19. Aviso rojo despues de una entrega que si funciono — CORREGIDO

Lo mismo en la pantalla de entregas, con la red frenada igual:

```
a los 400 ms: CONFIRMAR ENTREGA desactivado: true | Cancelar tambien: true
segundo toque: el boton ya no acepta clics
entregas registradas: 1 | entregado 4 de 4
stock: 2656 -> 2652   (baja 4, no 8)
avisos: ""            <- ya no sale el rojo "El vale no esta en condiciones de entrega"
```

Ademas el codigo ahora distingue el caso: si llegara un `409` por firma
repetida, lo trata como "esa entrega ya estaba registrada, no se duplico nada"
en verde, en vez de un error rojo encima de una operacion que salio bien.

## 18. Los digitos del ID de empleado entraban al PIN — CORREGIDO

```
puntos del PIN al abrir: 0
tras teclear "EMP-001" dentro del campo, puntos del PIN: 0     (antes: 3)
el campo tiene el texto completo: "EMP-001"
Backspace dentro del campo -> borra el campo ("EMP-00"), el PIN sigue en 0
con el foco FUERA del campo, tecleo 300001 -> puntos del PIN: 6
```

Lo importante es que **el teclado fisico sigue sirviendo** cuando el foco no
esta en un campo, que es como se usa en el iPad de planta; lo que se corto es
que los digitos del ID se colaran al PIN sin que se note.

---

# 2. Las acciones que escriben siguen funcionando

Todas desde la interfaz, ninguna por API.

| Accion | Resultado |
|---|---|
| Enviar vale | `PT-2026-000201` creado, un solo vale |
| Autorizar (parcial, con recorte de 3 a 1) | vale `APROBADO_PARCIAL` |
| Marcar en preparacion | `EN_PREPARACION` |
| Marcar preparado | `PREPARADO` |
| Registrar entrega, firmando con el dedo | `Entrega registrada. Inventario actualizado.`, firma guardada |
| Entrega **parcial** (una linea en 0) | `ENTREGA_PARCIAL`, entregado 6/0 de 6/2 |
| Registrar devolucion | 1 devolucion, stock 2,646 -> 2,647 |
| Cerrar pendiente | `CERRADO`, aviso `Pendiente cerrado` |
| Alta de trailer | `Trailer guardado`, aparece en la lista |
| Alta de usuario | `Usuario guardado` |
| Edicion de material (costo) | `Material guardado` |
| Configuracion | `Sin cambios que guardar` (correcto, no toque nada) |

## Ningun boton se queda muerto despues de un error

Es lo que mas me preocupaba del arreglo: si el boton se apaga al empezar y la
peticion falla, tiene que volver a encenderse o la pantalla queda inservible.

Forcé un `500` en la peticion de autorizar y despues reintenté con el mismo
boton:

```
tras el error 500 -> la ventana sigue abierta: true
  APROBAR REVIVIO: true
  Cancelar y Rechazar tambien revivieron
  aviso mostrado: "Error simulado de red"
segundo intento con el mismo boton (ya sin fallo):
  estado del vale: APROBADO   <- el boton volvio a funcionar
```

El codigo reactiva en `finally`, o sea salga bien o mal, y restaura el estado
que cada boton tenia antes (los que ya estaban desactivados por otro motivo se
quedan desactivados). Bien resuelto.

---

# 3. La pantalla de acceso, con los seis roles

Escribiendo el ID de empleado con el teclado y el PIN con las teclas grandes:

```
Trabajador         EMP-001               -> entra a /mis-vales
Supervisor         SUP-01                -> entra a /autorizaciones
Almacen            ALM-01                -> entra a /almacen
Trabajador Reyna   RNA-001               -> entra a /mis-vales
Supervisor Reyna   RSU-01                -> entra a /autorizaciones
Administrador      admin@demo.local      -> entra a /panel
Direccion          direccion@demo.local  -> entra a /panel
```

Los siete accesos llegan a su pantalla de inicio. Cero errores de JavaScript.

---

# 4. El aviso de AGOTADO, en tamano telefono

Dejé un material en cero con una merma (GAS-0006, Detector de fuga de gas) y
recorri los cinco puntos:

| Donde | Que se ve |
|---|---|
| Buscador de materiales en crear vale | `Detector de fuga de gas — GAS-0006 · PZA **AGOTADO**` |
| Linea ya agregada al vale | `GAS-0006 · PZA **AGOTADO**` |
| Cabecera de la lista de surtido | **`1 DE 1 SIN EXISTENCIA`** |
| Linea de la lista de surtido | `**AGOTADO**` + `Existencia insuficiente: faltan 1` |
| Cola del almacen e inventario | marcados |

Se lee bien a 390 px: es una etiqueta roja con la palabra completa, no un punto
de color. En la lista de surtido el almacenista lo ve **al abrir el vale**, en la
cabecera, sin tener que recorrer linea por linea, que era el punto. Tengo la
captura.

---

# 5. El recorrido de los siete pasos, completo

Una pasada, base recien sembrada, la consola abierta todo el tiempo.

1. **Abrir la app y anclarla.** Titulo y manifest correctos, service worker
   registrado.
2. **`EMP-001` crea un vale con kit ajustando una cantidad.** `PT-2026-000201`
   en **8.6 segundos** (meta: menos de 60). Las cuatro cantidades a la vista:
   `ESTANDAR 75 · SOLICITADO 3 · AUTORIZADO 0 · ENTREGADO 0`.
3. **`SUP-01` autoriza parcial.** Recorte de 3 a 1 desde la ventana; el vale
   queda `APROBADO_PARCIAL`, autorizado por Carlos Estrada Pena.
4. **`ALM-01` surte y entrega firmando con el dedo.** En preparacion ->
   preparado -> `Entrega registrada. Inventario actualizado.`, con la firma
   guardada y visible despues en el detalle del vale.
5. **El inventario baja.** 13,749.92 -> 13,748.92. Totales del vale:
   solicitado 76, autorizado 74, entregado 74.
6. **Direccion ve el costo real.** Panel con valor de inventario ($11.54 M),
   consumo del mes y por cobrar a la empresa externa; en Trailers, el 183 con
   **$241,424.51** de costo acumulado.
7. **El administrador abre Auditoria.** Arriba de todo, lo que acababa de pasar:
   `Hilda Marquez Tovar — ENTREGA REGISTRADA — vales 201 — Recibio: Kevin Orozco
   Padilla`, con su boton "Ver cambio", y debajo `VALE PREPARADO`,
   `VALE AUTORIZADO` y `VALE CREADO`.

**Cero errores de JavaScript en todo el recorrido.**

Una nota para quien presente, que no es un error: en el paso 4 la ventana de
entrega viene con **todo lo pendiente ya puesto**, asi que si no se baja alguna
cantidad a mano el vale se cierra como ENTREGADO y el paso 5 no enseña el
pendiente. Para que se vea el vale abierto hay que poner en 0 alguna linea antes
de confirmar. Lo probé aparte y funciona: entregado 6/0 de 6/2, vale en
`ENTREGA_PARCIAL`.

---

# Hallazgos que siguen abiertos

Ninguno estaba en las tres tareas de esta vuelta. Los volvi a comprobar uno por
uno y siguen igual. Conservo la numeracion.

| # | Que es | Gravedad |
|---|---|---|
| 12 | Cantidades absurdas en un vale (`1e15` se acepta; las entradas si tienen tope) | MENOR |
| 13 | No se puede cambiar solo el costo de un material por la API | MENOR |
| 14 | Se puede reemplazar el 2FA del administrador sin pedir la contrasena | MENOR |
| 15 | Motivos y nombre de cliente sin limite de longitud (guardé 5,000 caracteres) | MENOR |
| 16 | La cookie sale sin `Secure` (nota de operacion, no de codigo) | MENOR |
| 17 | Se puede devolver contra un vale ya cerrado | MENOR |
| 20 | Nombres de material en tres renglones en telefono | COSMETICO |

De los siete, el 14 es el mas serio en el fondo, pero solo lo alcanza alguien que
ya tenga abierta una sesion de administrador. Ninguno se ve en una demostracion
de quince minutos.

---

# Una cosa que revisé y NO era un error

A media prueba, la entrega empezo a fallarme con `Se requiere la firma del
receptor` aunque yo dibujaba el trazo, y la pantalla de entregas es justo la que
se toco. Lo perseguí antes de anotarlo: el lienzo esta bien
(`pointer-events: auto`, `touch-action: none`, nada encima de el, y dibujando
sobre el pinta 3,769 pixeles). Lo que fallaba era **mi guion de pruebas**: al
escribir el nombre del receptor la ventana se desplaza, y mis coordenadas del
lienzo quedaban viejas. Dejando que el desplazamiento se asiente antes de
dibujar, la firma entra y la entrega se registra. **No es un hallazgo**, lo dejo
escrito para que nadie lo persiga otra vez.

---

# Notas de operacion para el dia de la demostracion

1. **Correr `npm run reset` antes de empezar.** La deje limpia: 200 vales, 0
   materiales con existencia negativa, y la configuracion en sus valores de
   origen (`sesion_pin_minutos = 5`, `restriccion_red_activa = 0`,
   `redes_permitidas` por defecto).

2. **Si sale por el tunel, arrancar asi:**

   ```bash
   SECURE_COOKIES=1 PROXIES_CONFIANZA=127.0.0.1,::1 npm start
   ```

   Lo segundo importa: sin eso, todos los que entren por el tunel llegan con la
   misma direccion, comparten el limite de 600 peticiones por minuto y, si
   alguien falla cinco veces al entrar, a los demas les empieza a pedir la
   verificacion aritmetica aunque tecleen bien su PIN.

3. **En el paso 4, bajar a 0 alguna linea** antes de confirmar la entrega si se
   quiere enseñar el vale abierto con su pendiente en el paso 5.
