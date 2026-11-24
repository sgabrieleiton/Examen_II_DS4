import { onMounted, onUnmounted, ref } from 'vue';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';

export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');
  let listener: PluginListenerHandle | null = null;
  let desmontado = false;

  onMounted(async () => {
    const estado = await Network.getStatus();
    if (desmontado) return;
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;

    const handle = await Network.addListener('networkStatusChange', (status) => {
      conectado.value = status.connected;
      tipo.value = status.connectionType;
    });

    if (desmontado) {
      await handle.remove();
    } else {
      listener = handle;
    }
  });

  onUnmounted(() => {
    desmontado = true;
    listener?.remove();
  });

  return { conectado, tipo };
}

export async function vibrar() {
  if (!Capacitor.isNativePlatform()) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}