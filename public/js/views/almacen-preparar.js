/**
 * Preparacion y entrega fisica.
 * El inventario solo disminuye aqui, al confirmar la entrega con firma.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, chipEstado, numero, moneda, fechaHora, cargando,
  avisoOk, avisoError, modal, pedirTexto, confirmar, cantidades
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render({ params }) {
  const contenedor = h('div', { clase: 'columna' });
  await pintar();
  return contenedor;

  async function pintar() {
    vaciar(contenedor);
    contenedor.appendChild(cargando());
    const { vale, lineas, kits } = await api.get(`/api/almacen/vales/${params.id}/preparacion`);
    tituloVista(`Preparar ${vale.folio}`, `Trailer ${vale.trailer_numero} · ${vale.trabajador_nombre}`);
    vaciar(contenedor);

    const porSurtir = lineas.filter((l) => l.por_surtir > 0);
    const entregar = new Map(porSurtir.map((l) => [l.id, Math.min(l.por_surtir, l.stock_fisico)]));

    // ------------------------------------------------------- Encabezado
    const acciones = [];
    if (['APROBADO', 'APROBADO_PARCIAL'].includes(vale.estado)) {
      acciones.push(botonEstado('EN_PREPARACION', 'Marcar en preparacion', 'btn'));
    }
    if (['APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION'].includes(vale.estado)) {
      acciones.push(botonEstado('PREPARADO', 'Marcar preparado', 'btn btn-azul'));
    }
    if (porSurtir.length) {
      acciones.push(h('button', { clase: 'btn btn-primario', onclick: abrirEntrega }, icono('firma', 18), 'Registrar entrega'));
    }
    if (porSurtir.length && puede('vales.cerrar')) {
      acciones.push(h('button', {
        clase: 'btn',
        onclick: async () => {
          const motivo = await pedirTexto({
            titulo: 'Cerrar pendiente',
            etiqueta: 'Motivo (el material ya no sera necesario)',
            textoOk: 'Cerrar pendiente'
          });
          if (!motivo) return;
          try {
            await api.post(`/api/almacen/vales/${vale.id}/cerrar-pendiente`, { motivo });
            avisoOk('Pendiente cerrado');
            pintar();
          } catch (err) { avisoError(err.message); }
        }
      }, 'Cerrar pendiente'));
    }
    acciones.push(h('button', { clase: 'btn btn-plano', onclick: () => ir(`/vales/${vale.id}`) }, 'Ver vale completo'));

    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('div', {},
          h('div', { clase: 'gap-s' },
            h('h2', { clase: 'mono', texto: vale.folio }),
            chipEstado(vale.estado),
            vale.empresa === 'REYNA' ? chip('Empresa externa', 'morado') : null
          ),
          h('div', { clase: 'pequeno silencio mt' },
            `Autorizado por ${vale.autorizado_por_nombre || '—'} · ${fechaHora(vale.autorizado_at)}`)
        ),
        h('div', { clase: 'gap', style: 'margin-left:auto' }, acciones)
      ),
      kits.length ? h('div', { clase: 'tarjeta-cuerpo' },
        h('div', { clase: 'gap-s' }, kits.map((k) => chip(`${k.nombre_snapshot} V${k.version_snapshot}`, 'acento')))
      ) : null
    ));

    // -------------------------------------------------- Lista de surtido
    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('h2', { texto: 'Lista de surtido' }),
        h('span', { clase: 'pequeno silencio', style: 'margin-left:auto',
          texto: 'Ordenada por ubicacion en el almacen' })
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        lineas.map((l) => h('div', { clase: 'linea-vale', style: 'flex-wrap:wrap' },
          h('div', { style: 'flex:0 0 84px' },
            h('div', { clase: 'kpi-etiqueta', texto: 'Ubicacion' }),
            h('div', { clase: 'mono negrita', texto: l.ubicacion || '—' })
          ),
          h('div', { clase: 'linea-vale-datos', style: 'min-width:200px' },
            h('div', { clase: 'linea-vale-nombre', texto: l.nombre_snapshot }),
            h('div', { clase: 'linea-vale-meta' },
              `${l.sku_snapshot} · ${l.unidad} · Existencia ${numero(l.stock_fisico ?? 0)}`),
            !l.alcanza && l.por_surtir > 0
              ? h('div', { clase: 'pequeno negrita', style: 'color:var(--rojo)',
                texto: `Existencia insuficiente: faltan ${numero(l.por_surtir - (l.stock_fisico ?? 0))}` })
              : null
          ),
          cantidades(l, l.unidad),
          h('div', { style: 'margin-left:auto' },
            l.por_surtir > 0
              ? chip(`Por surtir ${numero(l.por_surtir)}`, l.alcanza ? 'ambar' : 'rojo')
              : chip('Completo', 'verde')
          )
        ))
      )
    ));

    function botonEstado(nuevo, texto, clase) {
      return h('button', {
        clase,
        onclick: async () => {
          try {
            await api.post(`/api/almacen/vales/${vale.id}/estado`, { estado: nuevo });
            avisoOk(`Vale marcado como ${texto.toLowerCase()}`);
            pintar();
          } catch (err) { avisoError(err.message); }
        }
      }, texto);
    }

    // ------------------------------------------------------- Entrega
    function abrirEntrega() {
      const receptor = h('input', { type: 'text', valor: vale.trabajador_nombre, placeholder: 'Nombre de quien recibe' });
      const notas = h('input', { type: 'text', placeholder: 'Notas de la entrega (opcional)' });

      const filas = porSurtir.map((l) => {
        const max = Math.min(l.por_surtir, l.stock_fisico ?? 0);
        const input = h('input', {
          type: 'number', min: '0', max: String(max), step: '0.01', clase: 'num-grande',
          valor: String(max), style: 'width:110px',
          onchange: () => {
            let v = Number(input.value);
            if (!Number.isFinite(v) || v < 0) v = 0;
            if (v > l.por_surtir) { v = l.por_surtir; avisoError('No puede entregar mas de lo autorizado'); }
            if (v > (l.stock_fisico ?? 0)) { v = l.stock_fisico ?? 0; avisoError('No hay existencia fisica suficiente'); }
            input.value = String(v);
            entregar.set(l.id, v);
            recalcular();
          }
        });
        entregar.set(l.id, max);
        return h('tr', {},
          h('td', {},
            h('div', { clase: 'negrita', texto: l.nombre_snapshot }),
            h('div', { clase: 'pequeno silencio mono', texto: `${l.sku_snapshot} · ${l.ubicacion || 'sin ubicacion'}` })
          ),
          h('td', { clase: 'num silencio', texto: numero(l.cantidad_autorizada) }),
          h('td', { clase: 'num', texto: numero(l.por_surtir) }),
          h('td', { clase: 'num', texto: numero(l.stock_fisico ?? 0) }),
          h('td', { clase: 'num' }, input)
        );
      });

      const aviso = h('div', { clase: 'aviso mt' });
      const recalcular = () => {
        const total = [...entregar.values()].reduce((s, v) => s + v, 0);
        const totalPendiente = porSurtir.reduce((s, l) => s + l.por_surtir, 0);
        const completa = total >= totalPendiente;
        aviso.className = `aviso mt ${completa ? 'verde' : 'ambar'}`;
        vaciar(aviso);
        aviso.appendChild(h('div', { clase: 'aviso-titulo', texto: completa ? 'Entrega completa' : 'Entrega parcial' }));
        aviso.appendChild(h('div', {
          texto: completa
            ? 'Se entregara todo lo autorizado pendiente. El vale quedara como ENTREGADO.'
            : `Quedaran ${numero(totalPendiente - total)} unidades pendientes. El vale permanecera abierto.`
        }));
      };
      recalcular();

      // Lienzo de firma: dedo o Apple Pencil.
      const lienzo = h('canvas');
      const firma = crearFirma(lienzo);

      const cuerpo = h('div', {},
        h('div', { clase: 'fila mb' },
          h('div', { clase: 'campo', style: 'flex:2' }, h('label', { texto: 'Recibe' }), receptor),
          h('div', { clase: 'campo', style: 'flex:2' }, h('label', { texto: 'Notas' }), notas)
        ),
        h('div', { clase: 'tabla-envoltura' },
          h('table', { clase: 'tabla-compacta' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Material'), h('th', { clase: 'num' }, 'Autorizado'),
              h('th', { clase: 'num' }, 'Por surtir'), h('th', { clase: 'num' }, 'Existencia'),
              h('th', { clase: 'num' }, 'Entrega')
            )),
            h('tbody', {}, filas)
          )
        ),
        aviso,
        h('div', { clase: 'campo mt' },
          h('label', { texto: 'Firma de quien recibe' }),
          h('div', { clase: 'firma-area' },
            lienzo,
            h('div', { clase: 'firma-guia' }),
            h('div', { clase: 'firma-pista', texto: 'Firme con el dedo o el lapiz dentro del recuadro' })
          ),
          h('div', { clase: 'gap mt' },
            h('button', { clase: 'btn btn-s', onclick: () => firma.limpiar() }, 'Limpiar firma'),
            h('span', { clase: 'pequeno silencio', texto: 'La firma se guarda junto con folio, fecha, hora y almacenista.' })
          )
        )
      );

      modal({
        titulo: `Registrar entrega · ${vale.folio}`,
        ancho: 'ancho',
        cuerpo,
        acciones: [
          { texto: 'Cancelar' },
          {
            texto: 'CONFIRMAR ENTREGA',
            clase: 'btn-verde',
            accion: async (cerrar) => {
              if (!receptor.value.trim()) return avisoError('Indique quien recibe el material');
              if (!firma.tieneTrazo()) return avisoError('Se requiere la firma del receptor');
              const seleccion = [...entregar.entries()]
                .filter(([, c]) => c > 0)
                .map(([vale_item_id, cantidad]) => ({ vale_item_id, cantidad }));
              if (!seleccion.length) return avisoError('Indique al menos una cantidad a entregar');
              try {
                const r = await api.post(`/api/almacen/vales/${vale.id}/entregar`, {
                  receptor_nombre: receptor.value.trim(),
                  notas: notas.value.trim(),
                  firma: firma.dataUrl(),
                  lineas: seleccion
                });
                cerrar();
                avisoOk(r.tipo === 'TOTAL'
                  ? 'Entrega registrada. Inventario actualizado.'
                  : 'Entrega parcial registrada. El vale permanece abierto.');
                pintar();
              } catch (err) { avisoError(err.message); }
            }
          }
        ]
      });

      setTimeout(() => firma.ajustar(), 60);
    }
  }
}

/** Captura de firma con eventos de puntero (dedo, lapiz o raton). */
function crearFirma(lienzo) {
  const ctx = lienzo.getContext('2d');
  let dibujando = false;
  let hayTrazo = false;
  let ultimo = null;

  function ajustar() {
    const rect = lienzo.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const imagen = hayTrazo ? lienzo.toDataURL() : null;
    lienzo.width = Math.max(1, Math.round(rect.width * dpr));
    lienzo.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#161b22';
    if (imagen) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = imagen;
    }
  }

  const punto = (e) => {
    const rect = lienzo.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  lienzo.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lienzo.setPointerCapture(e.pointerId);
    dibujando = true;
    ultimo = punto(e);
    ctx.beginPath();
    ctx.arc(ultimo.x, ultimo.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#161b22';
    ctx.fill();
    hayTrazo = true;
  });

  lienzo.addEventListener('pointermove', (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.x, ultimo.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo = p;
  });

  for (const evento of ['pointerup', 'pointercancel', 'pointerleave']) {
    lienzo.addEventListener(evento, () => { dibujando = false; });
  }

  window.addEventListener('resize', ajustar);
  ajustar();

  return {
    ajustar,
    tieneTrazo: () => hayTrazo,
    limpiar: () => { hayTrazo = false; ajustar(); },
    dataUrl: () => lienzo.toDataURL('image/png')
  };
}
