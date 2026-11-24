import { ErrorApi } from './errores';
import { obtenerToken, olvidarSesion } from '@/composables/useAuth';
import router from '@/router';

const BASE_URL = import.meta.env.VITE_API_URL;
const TIEMPO_MAXIMO_MS = 10_000;

export interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export async function api<T = unknown>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const searchParams = new URLSearchParams();
  if (opciones.params) {
    for (const [clave, valor] of Object.entries(opciones.params)) {
      if (valor !== undefined && valor !== '') {
        searchParams.append(clave, String(valor));
      }
    }
  }

  const query = searchParams.toString();
  const url = `${BASE_URL}${ruta}${query ? `?${query}` : ''}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const tokenActual = obtenerToken();
  if (tokenActual) {
    headers['Authorization'] = `Bearer ${tokenActual}`;
  }

  if (opciones.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: opciones.method ?? 'GET',
      headers,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
      signal: controlador.signal,
    });
  } catch {
    throw new ErrorApi(0, { mensaje: 'No fue posible conectar con la API.' });
  } finally {
    clearTimeout(temporizador);
  }

  if (respuesta.status === 204) {
    return null as T;
  }

  let cuerpo: unknown = null;
  const texto = await respuesta.text();
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = null;
    }
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 && ruta !== '/login') {
      await olvidarSesion();
      await router.replace('/login');
    }
    throw new ErrorApi(respuesta.status, cuerpo);
  }

  return cuerpo as T;
}
