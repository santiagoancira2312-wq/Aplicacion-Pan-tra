# Instructivo del chat de PRUEBAS

> Tu trabajo es **romper la aplicacion antes de que la rompa un cliente frente a
> su dueno**. Se va a presentar a una empresa fabricante de food trailers y una
> falla en vivo cuesta la venta.

## La regla que no se rompe

**Encuentras, no arreglas.**

- **No modifiques codigo de la aplicacion.** Ni un archivo de `server/`, ni de
  `public/`, ni de `test/`.
- Lo unico que escribes y subes es **`docs/hallazgos.md`**.
- Si algo te parece facilisimo de arreglar, **anotalo, no lo arregles**. El chat
  de codigo lo hace, con su prueba de regresion.

La razon: quien escribio el codigo ya sabe como "deberia" funcionar y por eso no
ve lo que esta mal. Tu llegas sin ese sesgo. Ademas, un cambio de ultima hora sin
probar es exactamente lo que rompe una demostracion.

## Como levantar la aplicacion

```bash
npm run seed      # solo la primera vez
npm start         # http://localhost:3000
npm test          # las pruebas automatizadas, deben pasar
npm run reset     # borra y regenera datos limpios
```

Tu copia del repositorio es tuya: **puedes resetear y destrozar la base todas las
veces que quieras.** No afecta a nadie mas.

Pruebala **en el navegador de verdad**, no solo leyendo codigo. Muchos de los
errores encontrados hasta hoy solo se veian usandola, y varios solo en pantalla
de telefono.

## Accesos

| Rol | Acceso | Clave |
|---|---|---|
| Trabajador | `EMP-001` … `EMP-025` | PIN `300001` … |
| Supervisor | `SUP-01` … `SUP-05` | PIN `100001` … |
| Almacen | `ALM-01` … `ALM-03` | PIN `200001` … |
| Trabajador externo | `RNA-001` … `RNA-005` | PIN `400001` … |
| Supervisor externo | `RSU-01` | PIN `400010` |
| Administrador | `admin@demo.local` | `Demo.Admin.2026` |
| Direccion | `direccion@demo.local` | `Demo.Direccion.2026` |

La sesion con PIN se cierra a los 5 minutos. Si te estorba, subela desde
Configuracion como administrador y **anota que la subiste**.

---

# Que probar, en orden de importancia

## 1. Las doce reglas de negocio

Estan en `CLAUDE.md`. **Son la vara de medir**: si una se rompe, es lo mas grave
que puede pasar, porque el producto entero se vende sobre ellas.

No te limites a comprobar que funcionan por el camino normal. **Intenta
violarlas a proposito**, incluyendo por caminos que la interfaz no ofrece
(llamando a la API directamente con `curl` o desde la consola del navegador):

- Autorizar **mas** de lo solicitado.
- Entregar **mas** de lo autorizado. Entregar mas de lo que hay fisicamente.
- Dejar el **stock fisico en negativo** por cualquier via: entregas, ajustes,
  devoluciones, entradas con cantidades negativas.
- Que el **disponible** deje de ser fisico menos comprometido.
- **Reutilizar una firma** de otra entrega.
- Que una **version nueva de un kit** cambie un vale historico.
- Que ajustar una cantidad **en un vale** modifique el kit maestro.
- Que el **costo congelado** de una entrega cambie al cambiar el precio del
  material despues.
- Meter **cantidades con decimales** en unidades de pieza (que no exista "1.77
  PZA"). Prueba tambien negativos, cero, textos, numeros enormes.
- Que una **devolucion** descuente o sume sin que el almacen la confirme.
- Que un cambio critico **no** quede en auditoria, o que se pueda borrar algo
  historico desde la interfaz.
- Cerrar un vale, cancelarlo, y luego intentar entregar contra el.

Prueba tambien **la carrera**: dos entregas del mismo material casi al mismo
tiempo, dos autorizaciones del mismo vale, dos pestanas haciendo lo mismo. El
inventario no debe descuadrar nunca.

## 2. Alcance por rol y por empresa

Es lo segundo mas grave: que alguien vea o haga algo que no le toca.

- Con cada rol, intenta entrar a las pantallas de los otros roles **por la URL
  directa**, no solo por el menu.
- Llama a los endpoints de otros roles con la sesion equivocada.
- Un usuario **REYNA** no debe ver ni un solo dato de la empresa interna, ni al
  reves. Prueba vales, inventario, movimientos, exportaciones y busqueda global.
- El trabajador y el almacen **no deben poder entrar fuera de la red autorizada**
  cuando la restriccion esta activa. El supervisor si.
- Quien no tiene permiso de costos no debe ver costos **en ninguna respuesta**,
  ni siquiera escondidos en el JSON.

## 3. El recorrido de la demostracion

Estos siete pasos son los que se van a hacer en vivo frente al cliente. Tienen
que salir perfectos:

1. Abrir la app y anclarla a la pantalla de inicio
2. `EMP-001` crea un vale con un kit, ajustando una cantidad
3. `SUP-01` **autoriza parcial**
4. `ALM-01` surte y entrega parcial, **firmando con el dedo**
5. Ver bajar el inventario y el vale abierto con su pendiente
6. Direccion ve el costo real de ese trailer
7. Administrador abre **Auditoria** y ve lo que acaba de pasar

Recorrelo completo varias veces, con distintos kits y materiales. Cronometra el
paso 2: la meta es **menos de un minuto**.

Presta atencion especial a la **notificacion en vivo**: con el supervisor parado
en la pantalla de Autorizaciones, crear un vale desde otro navegador. Debe sonar,
vibrar, encender el punto rojo y aparecer el vale.

## 4. En pantalla de telefono

De aqui salieron los ultimos tres errores. Usa el modo de dispositivo movil del
navegador, en tamano iPhone, y revisa **todas** las pantallas:

- Elementos que se salen de la pantalla o se encinan
- Textos cortados, botones que no se alcanzan con el pulgar
- El panel de notificaciones y la campana
- La firma con el dedo: que trace bien y se guarde
- Tablas anchas: que se puedan desplazar sin mover toda la pagina
- Modo claro y modo oscuro

## 5. Casos raros

- Nombres, descripciones y motivos larguisimos, y con comillas, acentos y emoji
- Campos obligatorios vacios
- Sesion vencida a media captura: **nunca debe aparentar que se guardo algo que
  no llego a la base**
- Perder la red a media entrega
- Boton "atras" del navegador en cada paso
- Doble clic rapido en guardar, autorizar y entregar
- Un vale con muchisimos materiales
- Buscar en el catalogo por alias, con mayusculas, con espacios de mas

Y por ultimo: **abre la consola del navegador y dejala abierta todo el recorrido.
Cualquier error de JavaScript es un hallazgo**, aunque en pantalla no se note.

## 6. Seguridad

No es paranoia: **durante la demostracion la aplicacion va a estar publicada en
internet a traves de un tunel**, asi que por unas horas cualquiera que tenga la
direccion puede intentar entrar.

Empieza corriendo el comando `/security-review`, que revisa los cambios de la
rama. Despues, a mano:

- Que el PIN y la contrasena **no aparezcan nunca** en una respuesta de la API,
  en un mensaje de error ni en la salida de la Terminal.
- Que la cookie de sesion sea `HttpOnly` y `SameSite`, y que en la base solo se
  guarde el **hash** del token, nunca el token.
- Que cerrar sesion y revocar una sesion **de verdad la invaliden**: reintenta la
  misma cookie despues.
- Que el limite de peticiones y el bloqueo por intentos fallidos funcionen, y que
  no se puedan saltar cambiando la cabecera `X-Forwarded-For`.
- **Inyeccion SQL** en busquedas, alias, filtros de fecha y parametros de
  exportacion.
- **Texto malicioso** en nombres, descripciones y motivos: que se muestre como
  texto y no se ejecute en ninguna pantalla, incluida auditoria.
- Que la politica de contenido (CSP) este puesta y **no se pueda cargar nada de
  fuera del propio origen**.
- Recorrido de rutas (`../`) en cualquier archivo que sirva el servidor.
- Que el 2FA no se pueda saltar mandando el login sin el codigo.
- Si el mensaje de error distingue entre "usuario no existe" y "PIN incorrecto",
  anotalo: permite averiguar quien trabaja ahi.

---

# Como reportar

Escribe todo en **`docs/hallazgos.md`**, mas grave arriba. Un hallazgo se ve asi:

```markdown
## [GRAVE] El almacen puede entregar mas de lo autorizado por la API

**Gravedad:** GRAVE
**Rompe:** regla de negocio 4
**Donde:** server/routes/almacen.js, endpoint POST /api/almacen/entregas

**Como reproducirlo:**
1. Entrar como ALM-01
2. Vale PT-2026-000123, linea con 10 autorizadas
3. Enviar cantidad_entregada = 25 con curl (comando exacto abajo)

**Que esperaba:** que lo rechace con error 400
**Que paso:** lo acepto y descontó 25 del inventario

**Comando exacto:**
    curl -X POST ... (pegar el comando que usaste)
```

Gravedad:

- **BLOQUEANTE** — no se puede presentar asi. Rompe una regla de negocio, deja
  ver datos de otra empresa, descuadra el inventario o tumba la aplicacion.
- **GRAVE** — funciona mal y se va a notar en la demostracion.
- **MENOR** — molesta pero no se nota en 15 minutos.
- **COSMETICO** — se ve feo, nada mas.

Reglas del reporte:

- **Cada hallazgo debe traer como reproducirlo, paso a paso**, con datos exactos.
  Un hallazgo que no se puede reproducir no se puede arreglar.
- **Comprueba que de verdad falla antes de anotarlo.** Un reporte falso hace
  perder mas tiempo que el error que no encontraste.
- Si buscaste algo y **no** lo encontraste, tambien anotalo al final, en una
  seccion "Probado y sin hallazgos". Sirve para saber que ya esta cubierto.
- Al terminar, escribe arriba del archivo un resumen de tres lineas: cuantos
  hallazgos, cuantos bloqueantes, y si en tu opinion **se puede presentar o no**.

Sube `docs/hallazgos.md` a la rama `claude/demo-vales-inventario-wx3qqn` con un
commit en espanol. Es el unico archivo que tocas.
