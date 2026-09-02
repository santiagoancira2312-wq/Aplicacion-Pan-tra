# Comercial y presentacion — Panamerican Trailers

> Resumen de lo decidido en el chat de informacion general. Sustituye a la
> conversacion completa: lo que esta aqui no hace falta volver a preguntarlo.
> Complementa a `CLAUDE.md`, que describe la aplicacion en si.

## Nombre del producto

El demo se presenta como **TRAZA** (trazabilidad de material / trazo de plano).
La aplicacion en si no lleva branding: el nombre vive en los documentos
comerciales, no en el codigo ni en la interfaz.

## El cliente

**Panamerican Trailers.** Fabrica food trailers a la medida. Planta en
**Guadalupe, Nuevo Leon**; vende en **Estados Unidos y factura en dolares**.

- Siete puntos de venta: Nashville, Memphis, San Antonio, Houston,
  Dallas (Grand Prairie), Las Vegas y Miami (Hialeah).
- Presumen mas de 300 unidades fabricadas y vendidas (cifra acumulada, propia).
- Medidas de 10x8 a 20x8 pies mas unidades a la medida. Certificacion NHTSA,
  equipo NSF, acero inoxidable grado alimenticio.
- Financian al comprador a traves de LeasingCore.
- Sitio: panamericantrailers.com

**No publican precios ni facturacion, y no publican donde esta la planta.**
Es empresa privada: su facturacion no es dato publico y no se puede consultar.

## Estimacion de tamano (SUPUESTOS, no datos)

Escenario medio usado en la propuesta:

| Supuesto | Valor |
|---|---|
| Unidades al mes | 12 |
| Precio promedio por unidad | 45,000 USD |
| Material sobre precio de venta | 50 % |
| Facturacion mensual estimada | ~540,000 USD |
| Gasto en material mensual | ~270,000 USD |

Sale de: 300+ unidades acumuladas desde ~2022 (~8/mes) creciendo, y rangos de
mercado de food trailers equipados en EE.UU. (35,000 a 75,000 USD).
El 50% de material es alto porque la mano de obra es mexicana y el material
pesa proporcionalmente mas.

**Estas cifras se reemplazan con las reales en cuanto el cliente conteste las
cuatro preguntas** (ver mas abajo).

## Modelo de precio

Regla usada: **mensualidad = 0.5–1% del gasto mensual en material**;
**implementacion = 3–5%** del mismo.

Oferta de apertura recomendada, **en dolares** (no cotizar en pesos: facturan
en USD y un precio en pesos los hace ver mas chicos de lo que son):

| Etapa | Precio |
|---|---|
| Implementacion (pago unico) | **7,500 USD** |
| Operacion, por planta, usuarios ilimitados | **1,200 USD/mes** |
| Ano anticipado | **12,000 USD** (dos meses de descuento) |
| Piloto | primeros **3 meses sin mensualidad** a cambio de caso de exito |
| Cada punto de venta adicional | **+600 USD/mes** |
| Desarrollo a la medida | **110 USD/hora** o precio cerrado |

Inversion primer ano con piloto: **18,300 USD**. Contra una recuperacion
conservadora del 3% del material (97,200 USD/ano), el retorno es ~5x.

Reglas que no se negocian:
- **Cobrar por planta, nunca por usuario.** Cobrar por usuario castiga que
  todos lo usen, que es justo lo que hace valiosos los datos.
- **Nunca pago unico "y ya".** Sin mensualidad no hay soporte ni futuro.
  Vender el codigo fuente seria otra venta: del orden de 400,000–700,000 MXN.
- **Poner precio despues de las cuatro preguntas**, nunca antes.

## Las cuatro preguntas de la junta

1. ¿Cuantas unidades entregan al mes?
2. ¿Cual es su precio promedio de venta?
3. ¿Que porcentaje del costo se les va en material?
4. ¿Cuanto calculan que se pierde al mes en material que no aparece, compras
   urgentes y paros por falta de una pieza?

Las tres primeras dan el tamano. **La cuarta da el precio**, porque es la cifra
contra la que se compara la cotizacion.

## Argumentos especificos para este cliente

1. **Cada unidad es distinta** → kits versionados que se ajustan por vale sin
   alterar el kit maestro.
2. **Financian al comprador** → un error de costeo se paga durante todo el
   plazo. Traza da costo real por unidad, congelado al entregar.
3. **Fabrican en Mexico, venden en EE.UU.** → tablero y exportacion desde
   cualquier lugar.
4. **Trabajan con terceros** → alcance por empresa, mismo inventario, estado de
   cuenta y cierre mensual separados (lo que en el demo es "REYNA").
5. **Estan creciendo** → siete puntos de venta; cada uno es ampliacion del
   contrato.

## Documentos publicados

Paginas privadas del usuario, misma identidad visual (acero + ambar,
Archivo / IBM Plex). Se imprimen limpias a PDF.

- **Propuesta comercial** — https://claude.ai/code/artifact/cea1099f-c80d-402d-959a-f16954803868
- **Anexo "Traza en la planta"** (como funciona, diagramas) — https://claude.ai/code/artifact/b89bec37-d699-44ad-aa08-76c5b4a35d64

Pendiente de armar: **guion de la demostracion** (los siete pasos, accesos para
imprimir en tarjetas, lista de verificacion y plan B).

Faltan por llenar en la propuesta: telefono del usuario, y sustituir el correo
personal de iCloud por uno con dominio propio.

**Dominio: decidido comprarlo despues de la junta, y solo si el cliente compra
el sistema.** `trazaapp.com` estaba disponible en 10 USD al ano (Cloudflare).
Consecuencia: la propuesta se entrega con el correo de iCloud, y las
notificaciones push y Face ID quedan fuera de la demostracion. Se advirtio que
un correo personal en una propuesta de 18,000 USD resta credibilidad justo en
el momento de cobrar; el usuario prefiere no gastar antes de vender.

## Decisiones de arquitectura ya tomadas

**El servidor vive en la planta, no en la nube.** Razones, en orden de peso:

1. Si se cae el internet, el almacen sigue operando (la red local no depende
   del internet).
2. "Los datos no salen de su edificio" es argumento de venta con el dueno.
3. Cero dependencias externas: la app no carga nada de ningun CDN, por eso
   funciona con el internet muerto.

**No se migra a Supabase ni a Postgres hospedado por ahora.** La app ya tiene
base de datos real (SQLite con WAL y transacciones). Migrar solo tendria
sentido si aparece: varias plantas con inventario compartido, consulta en vivo
permanente desde los puntos de venta en EE.UU., o almacenamiento pesado de
archivos. Ninguno aplica todavia.

**Riesgo tecnico anotado:** `node:sqlite` llego a Node 22.5 marcado como
experimental (por eso los scripts corren con `--no-warnings`). Para produccion:
fijar una version exacta de Node y verificar el estado del modulo. Salida si
hiciera falta: sustituir por `better-sqlite3`, interfaz casi identica, un solo
archivo tocado (`server/db.js`). Seria la unica dependencia aceptable.

**El acceso se define por rol, no todo o nada** (`server/lib/net.js`, se
configura desde la pantalla de Configuracion):

| Rol | Desde donde | Estado en el codigo |
|---|---|---|
| Trabajador | solo red de la planta | ya aplicado (`server/routes/auth.js`) |
| Almacen | solo red de la planta | **falta** — ver pendientes |
| Supervisor | dentro o fuera | asi debe quedarse |
| Direccion y admin | dentro o fuera, con 2FA | ya |

Para el acceso desde fuera se recomienda **VPN a la planta** (no abre puertos).
Alternativas: tunel (mete un tercero) o publicar con HTTPS (mas superficie).

## Roadmap ligado a la venta

**HTTPS con dominio real es requisito de las dos funciones que mas piden.**
Una sola condicion, dos funciones:

- **Notificaciones push.** El telefono se da de alta UNA vez tras iniciar
  sesion; se guarda su buzon ligado al `user_id`. Despues el servidor manda a
  ese buzon sin saber quien trae el telefono. Con el telefono apagado el
  mensaje espera y se entrega al prender. En iPhone **solo llegan si la app
  esta anclada a la pantalla de inicio** (regla de Apple).
  Falta: escuchar el evento `push` en `public/sw.js`, tabla de suscripciones,
  llaves VAPID y el envio desde `server/lib/notify.js`.
  En pantalla de bloqueo no deben ir costos ni proveedores. Nunca activarlas en
  las iPads compartidas de planta.

- **Face ID (passkeys / WebAuthn).** La app nunca ve la cara: el telefono
  verifica localmente y desbloquea una llave ligada a la cuenta. Tres niveles:
  (0) llavero de iCloud, funciona hoy sin programar; (1) sesiones de 30 dias en
  dispositivos de confianza, cambio chico; (2) passkeys de verdad, varios dias
  de trabajo porque hay que escribir un decodificador CBOR sin dependencias.
  Solo para dispositivos personales. En iPads compartidas, NIP siempre.

**Orden recomendado:** llavero + sesiones largas (casi gratis) → HTTPS y
dominio en la instalacion → push → passkeys.

**En la presentacion, no prometer estas dos como si ya existieran.** Decir la
verdad: "la base ya esta construida; se activan cuando el sistema quede
instalado con certificado de seguridad, que es parte de la puesta en marcha".

## La demostracion en vivo

Objetivo: que **ellos** usen la app, no que la vean. El dueno crea un vale con
su dedo y tres minutos despues ve su nombre en Auditoria.

**Como publicarla para la junta** — tunel temporal, con `npm start` corriendo:

```
cloudflared tunnel --url http://localhost:3000
```

Da una direccion HTTPS que funciona desde datos celulares, sin depender del
Wi-Fi de la sala. Se pone en un **codigo QR**. Al terminar, Control+C y muere.
Ventaja sobre la IP local: HTTPS, se puede anclar a la pantalla de inicio, y no
importa la red de cada quien.

**Los cinco detalles que rompen la demo:**

1. **Sesion de 5 minutos.** Subir `sesion_pin_minutos` a 60 desde Configuracion
   antes de la junta. Bajarlo despues. Este es el que falla seguro.
2. **Bloqueo a los 5 intentos fallidos** (10 min). Llevar los accesos impresos
   en tarjetas y tener la sesion de admin abierta para desbloquear.
3. **`npm run reset` la manana de la junta**, para datos limpios.
4. **La Mac no se debe dormir:** arrancar con `caffeinate -i npm start`.
5. **La restriccion de red debe estar APAGADA**, o nadie entra.

**Coreografia (siete pasos):**

| # | Quien | Que hace |
|---|---|---|
| 1 | Todos | Escanean el QR y anclan la app a su pantalla de inicio |
| 2 | Alguien de piso | `EMP-001`: crea un vale con kit, ajustando una cantidad |
| 3 | Un supervisor de ellos | `SUP-01`: **autoriza parcial** a proposito |
| 4 | Su almacenista | `ALM-01`: surte y entrega parcial, firmando con el dedo |
| 5 | Todos | Ven bajar el inventario y el vale abierto con su pendiente |
| 6 | El dueno | Direccion: ve el costo real de ese trailer |
| 7 | El dueno | **Auditoria**: ve con nombre y hora lo que acaban de hacer |

El paso 3 ensena el producto (aparecen las cuatro cantidades juntas).
El paso 7 cierra la venta.

**Ensayar con dos telefonos el dia antes, de principio a fin.** Tener grabado
un video de pantalla de los siete pasos como plan B.

**Seguridad del demo:** los datos son ficticios, el riesgo es bajo. Apagar el
tunel al terminar. Si se deja un demo permanente arriba, cambiar los PINs del
demo (estan escritos en `CLAUDE.md`) y verificar si el repositorio es publico.

## Usos futuros de la app (para la conversacion con el cliente)

Con los datos que ya se guardan: reacomodo del almacen por frecuencia de salida
y materiales que salen juntos, costo real por trailer y por modelo para
cotizar, correccion de los kits contra el consumo real, planeacion de compras,
desempeno de proveedores, cuellos de botella del proceso (los tiempos
solicitud → autorizacion → preparacion → entrega ya se miden), facturacion
automatica a empresas externas, y presupuesto por area.

Requieren capturar algo nuevo: devoluciones por causa, lote o numero de serie,
fotos de materiales, etapa del trailer, y codigo de barras en los racks.

Discurso: hoy la app resuelve el **control**; con seis meses de historia sirve
para **decidir**. "No le vendes un sustituto del vale de papel, le vendes el
historial que hoy no tiene."

## Pendientes abiertos

- [ ] **Codigo:** agregar `ALMACEN` a la restriccion de red en
      `server/routes/auth.js` — hoy solo restringe a `TRABAJADOR`, pero el
      anexo publicado ya dice que el almacen es solo dentro de la planta.
      Debe hacerse antes de presentar.
- [ ] Guion de la demostracion como documento.
- [ ] Telefono y correo con dominio propio en la propuesta.
- [ ] Confirmar si el repositorio de GitHub es publico o privado.
