import { computed, ref } from 'vue';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Device } from '@capacitor/device';
import { api } from '@/services/api';

export interface Usuario { id: number; nombre: string }

const CLAVE_TOKEN = 'token';
const CLAVE_USUARIO = 'usuario';

// Estado compartido por toda la app (fuera de la función = un solo valor) — YA IMPLEMENTADO
const token = ref<string | null>(null);
const usuario = ref<Usuario | null>(null);
let tokenCargado = false;
let promesaCarga: Promise<void> | null = null;

/** YA IMPLEMENTADO — lo usa services/api.ts para armar el encabezado Authorization. */
export const obtenerToken = () => token.value;

/** Borrar token y usuario de la memoria (refs) y del almacenamiento cifrado. */
export async function olvidarSesion() {
  token.value = null;
  usuario.value = null;
  try {
    await SecureStorage.remove(CLAVE_TOKEN);
    await SecureStorage.remove(CLAVE_USUARIO);
  } catch {
    // Ignorar si las claves no existían
  }
}

export function useAuth() {
  const estaAutenticado = computed(() => token.value !== null);

  async function login(email: string, password: string) {
    const info = await Device.getInfo();
    const device_name = `${info.platform} ${info.model}`.slice(0, 60);

    const respuesta = await api<{ token: string; usuario: Usuario }>('/login', {
      method: 'POST',
      body: { email, password, device_name },
    });

    token.value = respuesta.token;
    usuario.value = respuesta.usuario;
    tokenCargado = true;

    await SecureStorage.set(CLAVE_TOKEN, respuesta.token);
    await SecureStorage.set(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
  }

  async function cargarToken() {
    if (tokenCargado) {
      if (promesaCarga) await promesaCarga;
      return;
    }

    tokenCargado = true;
    promesaCarga = (async () => {
      try {
        const tokenGuardado = await SecureStorage.get(CLAVE_TOKEN);
        const usuarioGuardado = await SecureStorage.get(CLAVE_USUARIO);

        if (typeof tokenGuardado === 'string' && tokenGuardado) {
          token.value = tokenGuardado;

          if (typeof usuarioGuardado === 'string' && usuarioGuardado) {
            usuario.value = JSON.parse(usuarioGuardado) as Usuario;
          } else if (usuarioGuardado && typeof usuarioGuardado === 'object') {
            usuario.value = usuarioGuardado as unknown as Usuario;
          }
        }
      } catch {
        await olvidarSesion();
      } finally {
        promesaCarga = null;
      }
    })();

    await promesaCarga;
  }

  async function cerrarSesion() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      // Aunque falle la red o el token haya expirado, siempre borramos la sesión local
    } finally {
      await olvidarSesion();
    }
  }

  return { usuario, estaAutenticado, login, cargarToken, cerrarSesion };
}