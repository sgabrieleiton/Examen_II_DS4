<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/equipos" text="" />
        </ion-buttons>
        <ion-title>{{ id ? 'Editar equipo' : 'Nuevo equipo' }}</ion-title>
      </ion-toolbar>
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: no es posible guardar</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form @submit.prevent="guardar" novalidate>
        <ion-list lines="full">
          <ion-item>
            <ion-input v-model="datos.codigo" label="Código" label-placement="stacked" placeholder="EQ-0000"
              autocapitalize="characters" :maxlength="20" />
          </ion-item>
          <small v-if="errores.codigo" class="error-campo">{{ errores.codigo }}</small>

          <ion-item>
            <ion-input v-model="datos.nombre" label="Nombre" label-placement="stacked" :maxlength="120" />
          </ion-item>
          <small v-if="errores.nombre" class="error-campo">{{ errores.nombre }}</small>

          <ion-item>
            <ion-select v-model="datos.categoria_id" label="Categoría" label-placement="stacked"
              interface="action-sheet" placeholder="Seleccione" cancel-text="Cancelar">
              <ion-select-option v-for="c in listaCategorias" :key="c.id" :value="c.id">{{ c.nombre }}</ion-select-option>
            </ion-select>
          </ion-item>
          <small v-if="errores.categoria_id" class="error-campo">{{ errores.categoria_id }}</small>

          <ion-item v-if="estadoActual !== 'prestado'">
            <ion-select v-model="datos.estado" label="Estado" label-placement="stacked" interface="popover">
              <ion-select-option value="disponible">Disponible</ion-select-option>
              <ion-select-option value="mantenimiento">Mantenimiento</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item v-else>
            <ion-label>Estado: prestado (no se modifica desde aquí)</ion-label>
          </ion-item>
          <small v-if="errores.estado" class="error-campo">{{ errores.estado }}</small>

          <ion-item>
            <ion-input v-model="datos.fecha_adquisicion" label="Fecha de adquisición" label-placement="stacked"
              type="date" :max="hoy" />
          </ion-item>
          <small v-if="errores.fecha_adquisicion" class="error-campo">{{ errores.fecha_adquisicion }}</small>

          <ion-item>
            <ion-input v-model="datos.costo_interno" label="Costo interno (₡)" label-placement="stacked"
              type="number" inputmode="decimal" :min="0"
              :helper-text="id ? 'La API no expone este dato: vuelva a ingresarlo.' : undefined" />
          </ion-item>
          <small v-if="errores.costo_interno" class="error-campo">{{ errores.costo_interno }}</small>
        </ion-list>

        <ion-button type="submit" expand="block" class="ion-margin-top" :disabled="!conectado">
          Guardar
        </ion-button>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem,
  IonInput, IonSelect, IonSelectOption, IonLabel, IonButton,
  loadingController, onIonViewWillEnter, useIonRouter,
} from '@ionic/vue';
import { actualizar, categorias, crear, obtener, type Categoria, type DatosEquipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

// id llega por props: true en la ruta equipos/:id/editar; en equipos/nuevo es undefined
const props = defineProps<{ id?: string }>();
const id = props.id;

const ionRouter = useIonRouter();
const { conectado } = useConexion();
const hoy = new Date().toISOString().slice(0, 10);

const vacio = (): DatosEquipo => ({
  codigo: '', nombre: '', categoria_id: null, estado: 'disponible', fecha_adquisicion: hoy, costo_interno: null,
});

const datos = reactive<DatosEquipo>(vacio());
const listaCategorias = ref<Categoria[]>([]);
const estadoActual = ref<Estado>('disponible');
const errores = ref<Record<string, string>>({});

onIonViewWillEnter(async () => {
  errores.value = {};
  Object.assign(datos, vacio());
  estadoActual.value = 'disponible';

  try {
    if (id) {
      const [cats, equipo] = await Promise.all([categorias(), obtener(id)]);
      listaCategorias.value = cats;
      estadoActual.value = equipo.estado;
      Object.assign(datos, {
        codigo: equipo.codigo,
        nombre: equipo.nombre,
        categoria_id: equipo.categoria.id,
        estado: equipo.estado === 'prestado' ? undefined : equipo.estado,
        fecha_adquisicion: equipo.fecha_adquisicion,
        costo_interno: null,
      });
    } else {
      listaCategorias.value = await categorias();
    }
  } catch (err) {
    if (err instanceof ErrorApi) {
      if (err.status === 401) return;
      if (err.status === 404) {
        await mostrarToast('El equipo ya no existe.', 'warning');
        ionRouter.replace('/tabs/equipos');
        return;
      }
      await mostrarToast(err.message, 'danger');
    } else {
      await mostrarToast('No fue posible cargar el formulario.', 'danger');
    }
  }
});

async function guardar() {
  errores.value = {};
  const loading = await loadingController.create({ message: 'Guardando…' });
  await loading.present();

  try {
    const costoCrudo = datos.costo_interno as unknown;
    const costoNumerico =
      costoCrudo === null || costoCrudo === '' || costoCrudo === undefined
        ? null
        : Number(costoCrudo);

    const cuerpo: DatosEquipo = {
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
      categoria_id: datos.categoria_id,
      fecha_adquisicion: datos.fecha_adquisicion,
      costo_interno: costoNumerico !== null && !Number.isNaN(costoNumerico) ? costoNumerico : null,
    };

    if (estadoActual.value !== 'prestado' && datos.estado) {
      cuerpo.estado = datos.estado;
    }

    if (id) {
      await actualizar(id, cuerpo);
    } else {
      await crear(cuerpo);
    }

    await vibrar();
    await mostrarToast(id ? 'Equipo actualizado correctamente.' : 'Equipo creado correctamente.', 'success');

    if (ionRouter.canGoBack()) {
      ionRouter.back();
    } else {
      ionRouter.replace('/tabs/equipos');
    }
  } catch (err) {
    if (err instanceof ErrorApi) {
      if (err.status === 401) return;
      if (err.status === 422) {
        errores.value = err.erroresPorCampo;
        return;
      }
      if (err.status === 404) {
        await mostrarToast('El equipo ya no existe.', 'warning');
        ionRouter.replace('/tabs/equipos');
        return;
      }
      await mostrarToast(err.message, 'danger');
    } else {
      await mostrarToast('No fue posible guardar el equipo.', 'danger');
    }
  } finally {
    await loading.dismiss();
  }
}
</script>