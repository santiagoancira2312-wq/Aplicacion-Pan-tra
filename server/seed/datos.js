/**
 * DATOS DE DEMOSTRACION COMPLETAMENTE FICTICIOS.
 * Nombres de personas, proveedores, clientes y materiales son inventados y no
 * representan informacion real de ninguna empresa. Estan pensados para poder
 * sustituirse despues desde la propia interfaz, sin reconstruir la aplicacion.
 */

export const AREAS = [
  ['ELE', 'Electricidad', 'Instalacion electrica e iluminacion'],
  ['PLO', 'Plomeria', 'Agua limpia, drenaje y accesorios'],
  ['GAS', 'Gas', 'Instalacion de gas y equipos de coccion'],
  ['PIN', 'Pintura', 'Preparacion, pintura y acabado exterior'],
  ['LAM', 'Laminado', 'Laminas, forros y aislamiento'],
  ['SOL', 'Soldadura', 'Estructura, chasis y herreria'],
  ['ACA', 'Acabados', 'Interiores, muebles y detalles finales'],
  ['CAR', 'Carpinteria', 'Cubiertas, gabinetes y madera']
];

export const UNIDADES = [
  ['PZA', 'Pieza', 0], ['MTS', 'Metro', 2], ['M2', 'Metro cuadrado', 2],
  ['LTS', 'Litro', 2], ['KG', 'Kilogramo', 2], ['ROLLO', 'Rollo', 0],
  ['JGO', 'Juego', 0], ['CAJA', 'Caja', 0], ['TRAMO', 'Tramo', 0]
];

export const CATEGORIAS = [
  'Electrico', 'Plomeria', 'Gas', 'Pintura', 'Lamina y aislamiento',
  'Soldadura y estructura', 'Acabados', 'Ferreteria', 'Equipos', 'Consumibles'
];

export const PROVEEDORES = [
  ['Suministros Industriales del Norte', 'Ventas mostrador', '81-5555-1010', 'ventas@demo-proveedor1.mx', 5],
  ['Electro Componentes Beta', 'Atencion a clientes', '81-5555-2020', 'contacto@demo-proveedor2.mx', 7],
  ['Aceros y Perfiles Delta', 'Mesa de control', '81-5555-3030', 'pedidos@demo-proveedor3.mx', 10],
  ['Comercializadora Omega', 'Ejecutivo de cuenta', '81-5555-4040', 'omega@demo-proveedor4.mx', 3],
  ['Refrigeracion y Clima Sigma', 'Servicio tecnico', '81-5555-5050', 'sigma@demo-proveedor5.mx', 14],
  ['Maderas y Cubiertas Lambda', 'Ventas', '81-5555-6060', 'lambda@demo-proveedor6.mx', 8]
];

/**
 * 50 materiales. Formato:
 * [sku, nombre oficial, categoria, unidad, costo, min, max, reorden, ubicacion, proveedor(idx), [alias]]
 */
export const MATERIALES = [
  ['ELE-0001', 'Cable THW calibre 12 negro', 'Electrico', 'MTS', 18.50, 200, 2000, 400, 'A-01-1', 1, ['cable 12', 'cable negro']],
  ['ELE-0002', 'Cable THW calibre 10 blanco', 'Electrico', 'MTS', 27.90, 150, 1500, 300, 'A-01-2', 1, ['cable 10']],
  ['ELE-0003', 'Cable uso rudo 3x12', 'Electrico', 'MTS', 62.00, 80, 600, 150, 'A-01-3', 1, ['uso rudo']],
  ['ELE-0004', 'Contacto duplex polarizado 15A', 'Electrico', 'PZA', 48.00, 40, 400, 80, 'A-02-1', 1, ['contacto', 'enchufe']],
  ['ELE-0005', 'Apagador sencillo blanco', 'Electrico', 'PZA', 39.50, 40, 300, 70, 'A-02-2', 1, ['apagador']],
  ['ELE-0006', 'Centro de carga 8 circuitos', 'Electrico', 'PZA', 985.00, 4, 40, 8, 'A-03-1', 1, ['centro de carga', 'tablero']],
  ['ELE-0007', 'Pastilla termomagnetica 20A', 'Electrico', 'PZA', 178.00, 15, 120, 30, 'A-03-2', 1, ['pastilla', 'breaker']],
  ['ELE-0008', 'Luminaria LED empotrable 12W', 'Electrico', 'PZA', 245.00, 20, 200, 45, 'A-04-1', 1, ['plafon led', 'lampara chica']],
  ['ELE-0009', 'Tira LED 12V rollo 5 metros', 'Electrico', 'ROLLO', 320.00, 10, 80, 20, 'A-04-2', 1, ['tira led']],
  ['ELE-0010', 'Tuberia flexible conduit 3/4', 'Electrico', 'MTS', 22.00, 100, 900, 200, 'A-05-1', 1, ['conduit', 'manguera electrica']],
  ['ELE-0011', 'Caja de registro 4x4 galvanizada', 'Electrico', 'PZA', 56.00, 30, 250, 60, 'A-05-2', 1, ['caja 4x4']],
  ['ELE-0012', 'Inversor de corriente 2000W', 'Equipos', 'PZA', 6850.00, 2, 20, 4, 'E-01-1', 5, ['inversor']],
  ['ELE-0013', 'Bateria ciclo profundo 100Ah', 'Equipos', 'PZA', 5400.00, 2, 16, 4, 'E-01-2', 5, ['bateria']],
  ['ELE-0014', 'Cinta aislante 3/4 negra', 'Consumibles', 'PZA', 26.00, 50, 400, 90, 'A-06-1', 4, ['cinta aislante', 'tape']],

  ['PLO-0001', 'Tuberia PPR 1/2 pulgada', 'Plomeria', 'MTS', 41.00, 100, 800, 180, 'B-01-1', 4, ['tubo medio', 'tuberia agua']],
  ['PLO-0002', 'Tuberia PVC sanitario 2 pulgadas', 'Plomeria', 'TRAMO', 168.00, 20, 150, 35, 'B-01-2', 4, ['tubo drenaje', 'pvc 2']],
  ['PLO-0003', 'Codo PPR 1/2 a 90 grados', 'Plomeria', 'PZA', 14.50, 100, 900, 200, 'B-02-1', 4, ['codo medio']],
  ['PLO-0004', 'Tee PPR 1/2 pulgada', 'Plomeria', 'PZA', 17.00, 80, 700, 160, 'B-02-2', 4, ['tee']],
  ['PLO-0005', 'Llave de paso 1/2 pulgada', 'Plomeria', 'PZA', 132.00, 20, 160, 40, 'B-02-3', 4, ['llave de paso']],
  ['PLO-0006', 'Tarja de acero inoxidable sencilla', 'Plomeria', 'PZA', 2450.00, 3, 25, 6, 'B-03-1', 1, ['tarja', 'fregadero']],
  ['PLO-0007', 'Monomando para tarja', 'Plomeria', 'PZA', 890.00, 4, 30, 8, 'B-03-2', 1, ['monomando', 'llave tarja']],
  ['PLO-0008', 'Bomba de agua 12V presurizadora', 'Equipos', 'PZA', 2980.00, 3, 20, 5, 'E-02-1', 5, ['bomba', 'bomba de agua']],
  ['PLO-0009', 'Tinaco portatil 200 litros', 'Plomeria', 'PZA', 1890.00, 2, 16, 4, 'B-04-1', 4, ['tinaco', 'tanque agua']],
  ['PLO-0010', 'Manguera reforzada 1/2 pulgada', 'Plomeria', 'MTS', 34.00, 60, 400, 120, 'B-04-2', 4, ['manguera']],
  ['PLO-0011', 'Cemento para PVC 500 ml', 'Consumibles', 'PZA', 148.00, 10, 80, 20, 'B-05-1', 4, ['pegamento pvc']],
  ['PLO-0012', 'Cinta teflon 1/2 pulgada', 'Consumibles', 'PZA', 12.00, 60, 500, 120, 'B-05-2', 4, ['teflon']],

  ['GAS-0001', 'Tuberia de cobre rigido 1/2', 'Gas', 'TRAMO', 720.00, 10, 90, 20, 'C-01-1', 3, ['cobre medio', 'tubo gas']],
  ['GAS-0002', 'Regulador de gas de dos etapas', 'Gas', 'PZA', 640.00, 5, 40, 10, 'C-01-2', 3, ['regulador']],
  ['GAS-0003', 'Manguera flexible para gas 1/2', 'Gas', 'PZA', 210.00, 10, 80, 20, 'C-02-1', 3, ['manguera gas']],
  ['GAS-0004', 'Valvula de paso para gas', 'Gas', 'PZA', 185.00, 12, 100, 25, 'C-02-2', 3, ['valvula gas']],
  ['GAS-0005', 'Parrilla de 4 quemadores acero', 'Equipos', 'PZA', 7200.00, 2, 15, 3, 'E-03-1', 5, ['parrilla', 'estufa']],
  ['GAS-0006', 'Detector de fuga de gas', 'Consumibles', 'PZA', 320.00, 5, 40, 10, 'C-03-1', 3, ['detector fuga']],

  ['CLI-0001', 'Mini Split 1 tonelada 220V', 'Equipos', 'PZA', 12800.00, 2, 18, 4, 'E-04-1', 5, ['minisplit', 'aire', 'clima']],
  ['CLI-0002', 'Tuberia de cobre flexible 1/4', 'Equipos', 'MTS', 96.00, 40, 300, 80, 'E-04-2', 5, ['cobre 1/4']],
  ['CLI-0003', 'Soporte metalico para condensador', 'Equipos', 'JGO', 480.00, 4, 30, 8, 'E-04-3', 5, ['soporte minisplit', 'mensula']],
  ['CLI-0004', 'Aislante para tuberia de cobre', 'Consumibles', 'MTS', 28.00, 50, 400, 100, 'E-04-4', 5, ['aislante cobre']],

  ['LAM-0001', 'Lamina galvanizada calibre 26', 'Lamina y aislamiento', 'M2', 285.00, 40, 400, 90, 'D-01-1', 3, ['lamina', 'lamina galvanizada']],
  ['LAM-0002', 'Lamina de acero inoxidable 430', 'Lamina y aislamiento', 'M2', 890.00, 20, 200, 45, 'D-01-2', 3, ['inoxidable', 'lamina inox']],
  ['LAM-0003', 'Panel aislante poliuretano 2 pulgadas', 'Lamina y aislamiento', 'M2', 640.00, 25, 250, 55, 'D-02-1', 3, ['panel aislante', 'poliuretano']],
  ['LAM-0004', 'Perfil de aluminio remate 3 metros', 'Lamina y aislamiento', 'PZA', 195.00, 20, 180, 40, 'D-02-2', 3, ['perfil aluminio', 'remate']],
  ['LAM-0005', 'Remache pop 1/8 caja 500 piezas', 'Ferreteria', 'CAJA', 320.00, 8, 60, 15, 'D-03-1', 1, ['remache', 'pop']],

  ['SOL-0001', 'Electrodo 6013 3/32 kilogramo', 'Soldadura y estructura', 'KG', 92.00, 20, 200, 45, 'F-01-1', 3, ['electrodo', 'soldadura 6013']],
  ['SOL-0002', 'Disco de corte 4 1/2 pulgadas', 'Consumibles', 'PZA', 38.00, 40, 350, 80, 'F-01-2', 1, ['disco corte']],
  ['SOL-0003', 'Perfil PTR 2x2 calibre 14', 'Soldadura y estructura', 'TRAMO', 780.00, 15, 120, 30, 'F-02-1', 3, ['ptr', 'perfil ptr']],
  ['SOL-0004', 'Angulo de acero 1 1/2 pulgada', 'Soldadura y estructura', 'TRAMO', 420.00, 15, 120, 30, 'F-02-2', 3, ['angulo']],

  ['PIN-0001', 'Pintura poliuretano blanco 4 litros', 'Pintura', 'LTS', 268.00, 40, 300, 80, 'G-01-1', 4, ['pintura blanca', 'poliuretano']],
  ['PIN-0002', 'Primer anticorrosivo gris', 'Pintura', 'LTS', 195.00, 30, 250, 60, 'G-01-2', 4, ['primer', 'anticorrosivo']],
  ['PIN-0003', 'Thinner estandar', 'Consumibles', 'LTS', 78.00, 40, 300, 80, 'G-02-1', 4, ['thinner']],
  ['PIN-0004', 'Lija de agua grano 220', 'Consumibles', 'PZA', 14.00, 80, 600, 150, 'G-02-2', 4, ['lija']],
  ['PIN-0005', 'Cinta de enmascarar 2 pulgadas', 'Consumibles', 'PZA', 42.00, 50, 400, 100, 'G-02-3', 4, ['masking', 'cinta enmascarar']],

  ['ACA-0001', 'Silicon estructural transparente', 'Acabados', 'PZA', 96.00, 60, 500, 120, 'H-01-1', 4, ['silicon']],
  ['ACA-0002', 'Cubierta de trabajo acero inoxidable', 'Acabados', 'M2', 1650.00, 10, 80, 20, 'H-01-2', 6, ['cubierta', 'mesa inox']],
  ['ACA-0003', 'Bisagra de acero inoxidable', 'Ferreteria', 'PZA', 78.00, 40, 300, 80, 'H-02-1', 1, ['bisagra']],
  ['ACA-0004', 'Tornillo autorroscante 3/8 caja', 'Ferreteria', 'CAJA', 210.00, 20, 160, 40, 'H-02-2', 1, ['tornillo chico', 'autorroscante', 'pijas']],
  ['ACA-0005', 'Tornillo estructural 1/2 x 3', 'Ferreteria', 'CAJA', 340.00, 15, 120, 30, 'H-02-3', 1, ['tornillo grande', 'tornillo estructural']],
  ['ACA-0006', 'Triplay de pino 18 mm', 'Acabados', 'M2', 520.00, 20, 180, 45, 'H-03-1', 6, ['triplay', 'madera']]
];

/** 8 kits ficticios. [codigo, nombre, area, descripcion, [[sku, cantidad]]] */
export const KITS = [
  ['KIT-MS', 'Kit Mini Split', 'ELE', 'Instalacion completa de un equipo de clima', [
    ['CLI-0001', 1], ['CLI-0002', 6], ['CLI-0003', 1], ['CLI-0004', 6],
    ['ELE-0002', 12], ['ELE-0007', 1], ['ACA-0004', 1], ['ACA-0001', 2]
  ]],
  ['KIT-ELE', 'Kit Electrico', 'ELE', 'Instalacion electrica basica de un trailer estandar', [
    ['ELE-0001', 60], ['ELE-0002', 15], ['ELE-0004', 6], ['ELE-0005', 4],
    ['ELE-0006', 1], ['ELE-0007', 4], ['ELE-0010', 25], ['ELE-0011', 8], ['ELE-0014', 3]
  ]],
  ['KIT-PLO', 'Kit Plomeria', 'PLO', 'Red hidraulica y sanitaria estandar', [
    ['PLO-0001', 18], ['PLO-0002', 2], ['PLO-0003', 12], ['PLO-0004', 8],
    ['PLO-0005', 3], ['PLO-0010', 6], ['PLO-0011', 1], ['PLO-0012', 4]
  ]],
  ['KIT-GAS', 'Kit Gas', 'GAS', 'Instalacion de gas para equipos de coccion', [
    ['GAS-0001', 2], ['GAS-0002', 1], ['GAS-0003', 2], ['GAS-0004', 3], ['GAS-0006', 1], ['PLO-0012', 3]
  ]],
  ['KIT-LAM', 'Kit Laminado', 'LAM', 'Forro exterior e interior con aislamiento', [
    ['LAM-0001', 18], ['LAM-0002', 8], ['LAM-0003', 14], ['LAM-0004', 6],
    ['LAM-0005', 2], ['ACA-0001', 4]
  ]],
  ['KIT-AGU', 'Kit Agua', 'PLO', 'Suministro y almacenamiento de agua limpia', [
    ['PLO-0008', 1], ['PLO-0009', 1], ['PLO-0010', 8], ['PLO-0005', 2], ['PLO-0003', 6], ['PLO-0012', 2]
  ]],
  ['KIT-ILU', 'Kit Iluminacion', 'ELE', 'Iluminacion interior y de area de servicio', [
    ['ELE-0008', 8], ['ELE-0009', 2], ['ELE-0001', 25], ['ELE-0005', 3], ['ELE-0014', 2]
  ]],
  ['KIT-ACA', 'Kit Acabados', 'ACA', 'Cubiertas, gabinetes y detalles finales', [
    ['ACA-0002', 3], ['ACA-0003', 8], ['ACA-0004', 2], ['ACA-0005', 1],
    ['ACA-0006', 4], ['ACA-0001', 3], ['PIN-0005', 2]
  ]]
];

/** Segunda version de un kit, para demostrar el versionado. */
export const KIT_V2 = {
  codigo: 'KIT-ELE',
  notas: 'Version 2: se ajusta el cable calibre 12 al consumo real observado y se agrega una pastilla adicional.',
  items: [
    ['ELE-0001', 75], ['ELE-0002', 18], ['ELE-0004', 6], ['ELE-0005', 4],
    ['ELE-0006', 1], ['ELE-0007', 5], ['ELE-0010', 28], ['ELE-0011', 8], ['ELE-0014', 3]
  ]
};

export const TRAILERS = [
  ['180', 'Food Truck Compacto', '4.5 m', 'Cliente Demo Alfa', 'Cocina caliente', 'TERMINADO'],
  ['181', 'Food Truck Estandar', '6.0 m', 'Cliente Demo Beta', 'Cocina mixta', 'TERMINADO'],
  ['182', 'Food Truck Estandar', '6.0 m', 'Cliente Demo Gamma', 'Cafeteria', 'TERMINADO'],
  ['183', 'Food Truck Premium', '7.5 m', 'Cliente Demo Delta', 'Cocina completa', 'EN_PROCESO'],
  ['184', 'Food Truck Estandar', '6.0 m', 'Cliente Demo Epsilon', 'Cocina caliente', 'EN_PROCESO'],
  ['185', 'Food Truck Premium', '7.5 m', 'Cliente Demo Zeta', 'Parrilla y plancha', 'EN_PROCESO'],
  ['186', 'Food Truck Compacto', '4.5 m', 'Cliente Demo Eta', 'Postres y bebidas', 'EN_PROCESO'],
  ['187', 'Food Truck Estandar', '6.0 m', 'Cliente Demo Theta', 'Cocina mixta', 'EN_PROCESO'],
  ['188', 'Food Truck Premium', '8.0 m', 'Cliente Demo Iota', 'Cocina completa', 'PLANEADO'],
  ['189', 'Food Truck Estandar', '6.0 m', 'Cliente Demo Kappa', 'Cafeteria', 'PLANEADO']
];

export const NOMBRES = [
  'Alberto Ramirez Solis', 'Beatriz Moreno Lugo', 'Carlos Estrada Pena', 'Diana Fuentes Robles',
  'Eduardo Navarro Islas', 'Fernanda Salgado Rivas', 'Gerardo Villalobos Cruz', 'Hilda Marquez Tovar',
  'Ignacio Bautista Reyes', 'Julia Cardenas Nieto', 'Kevin Orozco Padilla', 'Laura Zamora Rendon',
  'Martin Aguirre Salas', 'Nadia Trevino Campos', 'Oscar Delgado Mena', 'Paola Cervantes Luna',
  'Quintin Alvarado Rios', 'Rosa Elena Guzman Paz', 'Sergio Miranda Ochoa', 'Tania Barrera Vidal',
  'Ulises Contreras Gil', 'Veronica Espinoza Mata', 'Wilfrido Juarez Prado', 'Ximena Lozano Sandoval',
  'Yahir Peralta Montes', 'Zulema Rangel Duarte', 'Andres Tapia Quiroz', 'Brenda Valadez Ibarra',
  'Cesar Uribe Franco', 'Daniela Ynfante Cortes', 'Emilio Zavala Rocha', 'Fabiola Acosta Mejia',
  'Gustavo Beltran Nunez', 'Hector Calderon Sierra', 'Irene Duran Palacios', 'Jorge Elizondo Vargas',
  'Karina Flores Meraz', 'Leonardo Garza Rojas', 'Monica Herrera Bravo', 'Nestor Ibarra Cantu',
  'Olivia Jasso Medina', 'Pablo Klein Serrano'
];

export const MOTIVOS_RECHAZO = [
  ['Material no necesario todavia', 0],
  ['Cantidad excesiva', 0],
  ['Material incorrecto', 0],
  ['Solicitud duplicada', 0],
  ['Material no corresponde al area', 0],
  ['Utilizar material entregado previamente', 0],
  ['Trailer incorrecto', 0],
  ['Kit incorrecto', 0],
  ['Cantidad del kit incorrecta', 0],
  ['Otro', 1]
];
