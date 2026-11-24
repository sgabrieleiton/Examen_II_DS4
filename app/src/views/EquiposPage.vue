<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <!-- YA IMPLEMENTADO: depende de useConexion() [M7] -->
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ion-refresh="refrescar">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Primera carga con skeleton -->
      <ion-list v-if="cargando && equipos.length === 0">
        <ion-item v-for="n in 6" :key="n">
          <ion-label>
            <h2><ion-skeleton-text :animated="true" style="width: 65%" /></h2>
            <p><ion-skeleton-text :animated="true" style="width: 40%" /></p>
          </ion-label>
          <ion-skeleton-text slot="end" :animated="true" style="width: 72px; height: 20px; border-radius: 10px" />
        </ion-item>
      </ion-list>

      <!-- Error de carga -->
      <div v-else-if="error" class="estado-vacio">
        <ion-icon :icon="cloudOfflineOutline" size="large" />
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="cargar(true)">Reintentar</ion-button>
      </div>

      <!-- Estado vacío -->
      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" size="large" />
        <p>No se encontraron equipos</p>
      </div>

      <!-- Listado de equipos -->
      <ion-list v-else>
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item button :router-link="`/tabs/equipos/${equipo.id}/editar`">
            <ion-label>
              <h2>{{ equipo.nombre }}</h2>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">
              {{ equipo.estado }}
            </ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="start" :icon="trashOutline" />
              Eliminar
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <ion-infinite-scroll :disabled="!hayMas" @ion-infinite="cargarMas">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

const colorEstado: Record<Estado, string> = { disponible: 'success', prestado: 'warning', mantenimiento: 'medium' };

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(false);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);

async function cargar(reiniciar = false) {
  const paginaObjetivo = reiniciar ? 1 : pagina.value + 1;
  cargando.value = true;
  if (reiniciar) {
    error.value = '';
  }

  try {
    const respuesta = await listar(paginaObjetivo, q.value.trim());
    equipos.value = reiniciar ? respuesta.data : [...equipos.value, ...respuesta.data];
    pagina.value = respuesta.meta.current_page;
    ultimaPagina.value = respuesta.meta.last_page;
  } catch (err) {
    if (err instanceof ErrorApi && err.status === 401) return;
    const mensaje = err instanceof Error ? err.message : 'No fue posible cargar los equipos.';
    if (reiniciar) {
      equipos.value = [];
      error.value = mensaje;
    } else {
      await mostrarToast(mensaje, 'danger');
    }
  } finally {
    cargando.value = false;
  }
}

onIonViewWillEnter(() => {
  cargar(true);
});

const buscar = () => cargar(true);

async function refrescar(evento: RefresherCustomEvent) {
  try {
    await cargar(true);
  } finally {
    await evento.target.complete();
  }
}

async function cargarMas(evento: InfiniteScrollCustomEvent) {
  try {
    if (hayMas.value) {
      await cargar(false);
    }
  } finally {
    await evento.target.complete();
  }
}

async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  const sliding = (evento.target as HTMLElement | null)?.closest('ion-item-sliding');
  await sliding?.close();

  const alerta = await alertController.create({
    header: 'Eliminar equipo',
    message: `¿Desea eliminar "${equipo.nombre}" (${equipo.codigo})?`,
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });

  await alerta.present();
  const { role } = await alerta.onDidDismiss();
  if (role !== 'destructive') return;

  try {
    await eliminar(equipo.id);
    equipos.value = equipos.value.filter((item) => item.id !== equipo.id);
    await vibrar();
    await mostrarToast('Equipo eliminado correctamente.', 'success');
  } catch (err) {
    if (err instanceof ErrorApi) {
      if (err.status === 401) return;
      if (err.status === 409) {
        await mostrarToast(err.cuerpo?.mensaje ?? err.message, 'warning');
        return;
      }
      if (err.status === 404) {
        equipos.value = equipos.value.filter((item) => item.id !== equipo.id);
        await mostrarToast('El equipo ya no existe.', 'warning');
        return;
      }
      await mostrarToast(err.message, 'danger');
    } else {
      await mostrarToast('No fue posible eliminar el equipo.', 'danger');
    }
  }
}
</script>