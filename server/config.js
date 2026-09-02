import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'app.db');

export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';

// Cookies Secure solo con HTTPS. En el demo local se desactiva.
export const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';

// Sesiones: los iPads compartidos de planta cierran sesion muy rapido.
export const SESSION_MINUTES_PIN = Number(process.env.SESSION_MINUTES_PIN || 5);
export const SESSION_MINUTES_PASSWORD = Number(process.env.SESSION_MINUTES_PASSWORD || 480);

export const MAX_LOGIN_ATTEMPTS = 5;

// Topes de sensatez para los movimientos de almacen. No son reglas de negocio:
// existen para que un dedazo (un cero de mas, un menos delante del costo) no
// deje el inventario y el panel con numeros imposibles, sin forma de deshacerlo
// desde la interfaz.
export const MAX_CANTIDAD_MOVIMIENTO = 1000000;
export const MAX_COSTO_UNITARIO = 10000000;
export const LOCKOUT_MINUTES = 10;

// Valores por defecto de configuracion editables desde la interfaz.
export const DEFAULT_SETTINGS = {
  folio_formato: 'PT-{YYYY}-{SEQ:6}',
  folio_secuencia_anual: '1',
  folio_entrada_formato: 'ENT-{YYYY}-{SEQ:5}',
  empresa_externa_nombre: 'REYNA',
  moneda: 'MXN',
  sesion_pin_minutos: String(SESSION_MINUTES_PIN),
  sesion_password_minutos: String(SESSION_MINUTES_PASSWORD),
  restriccion_red_activa: '0',
  redes_permitidas: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8',
  captcha_umbral_intentos: '5',
  dias_prediccion_corto: '7',
  dias_prediccion_largo: '30',
  anomalia_factor: '2.5',
  requiere_2fa_admin: '1'
};
