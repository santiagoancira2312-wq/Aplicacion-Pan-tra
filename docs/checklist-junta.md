# Lista para llegar a la junta

> Lo que falta de aqui a la presentacion con Panamerican Trailers.
> Se va marcando conforme se cierra. Lo de la manana de la junta y lo que se
> dice en cada paso esta en el guion, no aqui:
> https://claude.ai/code/artifact/70662620-0e7b-481f-b174-92e9a38d145c

**Estado del codigo: cerrado.** Cero bloqueantes, cero graves, 22 de 22 pruebas,
5 hallazgos menores abiertos a proposito. Nada de lo que falta es programar.

---

## 1. Datos que faltan (solo el usuario los tiene)

- [ ] **Fecha y hora de la junta.** Marca todo lo demas.
- [ ] **Quienes van a estar.** Cambia el enfoque: si esta el dueno, la junta
      termina en precio; si es solo el jefe de planta, termina en una segunda
      cita con el dueno.
- [ ] **Cuanto dura.** El guion esta armado para 20 minutos de nucleo.

## 2. En la Mac

- [ ] **Fetch origin** en GitHub Desktop: tener todo hasta el ultimo commit.
- [ ] Arrancar y confirmar que corre la version nueva.
- [ ] `cloudflared` instalado (`brew install cloudflared`) y **probado una vez**.
- [ ] Levantar el tunel y abrir la app desde el telefono por esa direccion, con
      **datos celulares apagando el Wi-Fi**, para comprobar que sale a internet.
- [ ] Anclar la app a la pantalla de inicio del iPhone por el tunel (con HTTPS
      si funciona; es como la van a ver ellos).

## 3. Conocer la aplicacion

Esta es la parte que mas rinde y la que no se puede delegar.

- [ ] Usarla **dos o tres dias desde dos telefonos**, con los usuarios del demo.
- [ ] **Crear tus propios usuarios** desde Administrador, con nombres reales.
      Cronometrar cuanto tarda dar de alta a una persona: en la puesta en marcha
      son 40, y ese numero se cotiza.
- [ ] **Cargar un trailer y un kit reales** desde la interfaz. Comprueba con tus
      manos la promesa de la propuesta: que se sustituye todo sin reprogramar.
      Si te topas con algo que NO se puede cambiar desde la pantalla, avisame:
      ese seria el cambio de codigo mas importante que existe.
- [ ] **Cronometrar tu mismo el paso 2** (crear un vale). Necesitas saber el
      numero real antes de presumirlo en la junta.
- [ ] **Identificar que material esta agotado** en el demo, para el paso 2 del
      guion. Anotarlo aqui: ______________________
- [ ] **Verificar como se ve el AGOTADO en pantalla.** El guion lo describe como
      se espero que quedara; si se ve distinto, hay que ajustar el texto.
- [ ] Anotar todo lo que estorbe. De ahi sale la ultima tanda de cambios, si da
      tiempo, o la lista de mejoras que se le ensena al cliente.

## 4. Documentos

- [ ] **Telefono** en la propuesta (hoy esta en blanco).
- [ ] Decidir el correo. Quedo acordado entregar con el de iCloud y comprar el
      dominio despues de la junta; si se reconsidera, son 10 USD y 10 minutos.
- [ ] Imprimir la **propuesta**.
- [ ] Imprimir el **anexo "Traza en la planta"**.
- [ ] Imprimir y **recortar las tarjetas de acceso** (ultima pagina del guion).
- [ ] Llevar los tres en PDF en el telefono, por si falta una copia.

## 5. El ensayo

**Un dia antes, no el mismo dia.**

- [ ] `npm run reset` para arrancar limpio.
- [ ] Subir `sesion_pin_minutos` a 60 desde Configuracion.
- [ ] Levantar el tunel y **recorrer los siete pasos completos** con dos
      telefonos, por el tunel, no por la red local.
- [ ] Repetirlo hasta que salga **sin leer el guion**.
- [ ] **Grabar el video de respaldo** de los siete pasos, y dejarlo en el
      telefono. Es el plan B.
- [ ] Practicar en voz alta las cuatro preguntas y las tres o cuatro respuestas
      que mas probablemente te toquen.

## 6. Preparado por si acaso

- [ ] Cargador de la Mac y del telefono.
- [ ] Saber que hacer si se cae el tunel (esta en el guion, seccion Plan B).
- [ ] Tener abierta la sesion de administrador en la Mac, para desbloquear a
      alguien en un clic si se equivoca cinco veces con el PIN.

---

## Despues de la junta

No es parte de esta lista, pero para que no se pierda: las tareas 4 a 8, 15, 16
y 21 de `docs/pendientes-codigo.md`, y la compra del dominio si el cliente
compra el sistema.
