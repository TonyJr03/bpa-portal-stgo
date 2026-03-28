<script setup lang="ts">
/**
 * @componente  src/components/vue/TablonComunicados.vue
 * @directiva   client:visible  (inyectado desde Comunicados.astro)
 *
 * @responsabilidad
 *   Tablón de Comunicados institucionales en la página de inicio.
 *   Muestra los últimos 3 comunicados del BPA, ordenados por updated.
 *
 *   · Borde siempre verde/ámbar del tema (fijo, no depende del nivel)
 *   · Badge de la etiqueta sí depende del nivel: verde/ámbar si informativo,
 *     ámbar semántico si alerta, rojo si urgente
 *   · Botón "Leer más" al detalle si el registro tiene slug
 *   · "Ver todos" apunta a /actualidad?categoria=comunicado
 *
 * @coleccion  actualidad  (antes: noticias)
 *   filter: publicado = true && categoria = "comunicado"
 *   sort:   -updated
 *   limit:  3
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

interface Comunicado {
  id:           string;
  titulo:       string;
  slug:         string;
  resumen:      string;
  fecha:        string;
  nivel:        'informativo' | 'alerta' | 'urgente';
  categoria:    string;
  publicado:    boolean;
  imagen:       string;
  collectionId: string;
}

const comunicados = ref<Comunicado[]>([]);
const cargando    = ref(true);
const errorDB     = ref(false);

// ── Badge por nivel — solo el color del texto/fondo varía ────────────────────
// El BORDE de la tarjeta es siempre verde/ámbar del tema.
// El BADGE de la etiqueta refleja la urgencia del comunicado:
//   informativo → verde/ámbar del tema (color institucional neutro)
//   alerta      → ámbar semántico (advertencia)
//   urgente     → rojo semántico (crítico)
const CONFIG_NIVEL = {
  informativo: {
    label: 'Comunicado',
    badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200',
  },
  alerta: {
    label: 'Alerta',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  },
  urgente: {
    label: 'Urgente',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  },
} as const;

// Icono SVG para el placeholder de cards sin imagen
// tabler:speakerphone
const ICONO_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
  class="w-12 h-12 opacity-50">
  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
  <path d="M18 8a3 3 0 0 1 0 6"/>
  <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/>
  <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>
</svg>`;

function configNivel(nivel: Comunicado['nivel']) {
  return CONFIG_NIVEL[nivel] ?? CONFIG_NIVEL.informativo;
}

function urlImagen(c: Comunicado): string | null {
  return c.imagen ? pb.files.getURL(c, c.imagen, { thumb: '600x300' }) : null;
}

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CU', {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

const cargar = async () => {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const res = await pb.collection('actualidad').getList<Comunicado>(1, 3, {
      filter: 'publicado = true && categoria = "comunicado"',
      sort:   '-updated',
      fields: 'id,titulo,slug,resumen,fecha,nivel,imagen,collectionId',
    });
    comunicados.value = res.items;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
};

onMounted(cargar);
</script>

<template>
  <!-- ── Cargando ───────────────────────────────────────────────────────────── -->
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 3" :key="i"
      class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800
             bg-white dark:bg-bpa-950/60 overflow-hidden animate-pulse">
      <div class="h-40 bg-bpa-100 dark:bg-bpa-800/40"></div>
      <div class="p-5 space-y-3">
        <div class="h-3 bg-bpa-100 dark:bg-bpa-800/40 rounded w-24"></div>
        <div class="h-5 bg-bpa-100 dark:bg-bpa-800/40 rounded w-full"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-4/5"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-3/5"></div>
      </div>
    </div>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────────── -->
  <div v-else-if="errorDB"
    class="rounded-xl border border-red-200 dark:border-red-800
           bg-red-50 dark:bg-red-950/30 p-8 text-center">
    <!-- tabler:wifi-off -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-red-400">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M12 18l.01 0"/><path d="M9.172 15.172a4 4 0 0 1 5.656 0"/>
      <path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"/>
      <path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.182 -.982a12 12 0 0 1 10.043 3.438"/>
      <path d="M3 3l18 18"/>
    </svg>
    <p class="font-semibold text-red-700 dark:text-red-400 mb-1">
      Los comunicados no están disponibles en este momento
    </p>
    <p class="text-sm text-red-600 dark:text-red-500 mb-4">
      No se pudo obtener la información. Inténtelo de nuevo en unos momentos.
    </p>
    <button @click="cargar"
      class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700
             text-white text-sm font-medium px-4 py-2 transition-colors">
      <!-- tabler:refresh -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/>
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>
      </svg>
      Reintentar
    </button>
  </div>

  <!-- ── Sin comunicados ────────────────────────────────────────────────────── -->
  <div v-else-if="!comunicados.length"
    class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800
           bg-bpa-50 dark:bg-bpa-950/60 p-10 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-primary opacity-40">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M18 8a3 3 0 0 1 0 6"/>
      <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/>
      <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>
    </svg>
    <p class="font-semibold text-default dark:text-default mb-1">
      Sin comunicados publicados por el momento
    </p>
  </div>

  <!-- ── Datos ──────────────────────────────────────────────────────────────── -->
  <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <article v-for="c in comunicados" :key="c.id"
      class="group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60
             overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300
             border-bpa-400 dark:border-bpa-amber-600">

      <!-- Imagen o placeholder — borde fijo verde/ámbar independiente del nivel -->
      <div class="overflow-hidden h-40 flex-shrink-0">
        <img v-if="urlImagen(c)" :src="urlImagen(c)!" :alt="c.titulo"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy" />
        <div v-else
          class="w-full h-full flex items-center justify-center
                 bg-gradient-to-br from-bpa-600 to-bpa-100
                 dark:from-bpa-amber-600 dark:to-bpa-amber-950">
          <span class="text-bpa-50 dark:text-bpa-amber-200"
            v-html="ICONO_PLACEHOLDER"></span>
        </div>
      </div>

      <!-- Contenido -->
      <div class="flex flex-col flex-1 p-5 gap-3">

        <!-- Badge (nivel) + Fecha -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span :class="['text-xs font-semibold px-2.5 py-1 rounded-full',
            configNivel(c.nivel).badge]">
            {{ configNivel(c.nivel).label }}
          </span>
          <time :datetime="c.fecha" class="text-xs text-muted flex-shrink-0">
            {{ formatearFecha(c.fecha) }}
          </time>
        </div>

        <h3 class="font-bold text-default dark:text-default text-base leading-snug line-clamp-2">
          {{ c.titulo }}
        </h3>

        <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">
          {{ c.resumen }}
        </p>

        <a v-if="c.slug" :href="`/actualidad/${c.slug}`"
          class="inline-flex items-center gap-1.5 text-sm font-medium mt-auto
                 text-primary dark:text-primary hover:text-secondary dark:hover:text-secondary
                 transition-colors">
          Leer más
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>
          </svg>
        </a>
      </div>
    </article>
  </div>
</template>
