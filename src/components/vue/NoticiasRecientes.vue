<script setup lang="ts">
/**
 * @componente  src/components/vue/NoticiasRecientes.vue
 * @directiva   client:visible  (inyectado desde Noticias.astro)
 *
 * @responsabilidad
 *   Isla Vue que muestra las últimas 3 noticias/avisos institucionales
 *   del BPA en tiempo real, consumiendo la colección `noticias` de
 *   PocketBase. Es el "Tablón de Avisos" de la página de inicio.
 *
 * @coleccion  noticias
 *   titulo      Text    → Titular del aviso
 *   resumen     Text    → Descripción breve (máx. 2 líneas)
 *   fecha       Date    → Fecha de publicación (YYYY-MM-DD)
 *   nivel       Select  → 'informativo' | 'alerta' | 'urgente'
 *   publicado   Bool    → true si debe mostrarse en el portal
 *   imagen      File    → (opcional) imagen de portada del aviso
 *
 * @paleta de niveles:
 *   informativo → Verde BPA  (institucional, neutral)
 *   alerta      → Ámbar      (advertencia — semántico universal, se conserva)
 *   urgente     → Rojo       (crítico — semántico universal, se conserva)
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Noticia {
  id:           string;
  titulo:       string;
  resumen:      string;
  fecha:        string;
  nivel:        'informativo' | 'alerta' | 'urgente';
  publicado:    boolean;
  imagen:       string;
  collectionId: string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const noticias = ref<Noticia[]>([]);
const cargando = ref(true);
const errorDB  = ref(false);

// ── Configuración visual por nivel ────────────────────────────────────────────
const CONFIG_NIVEL = {
  informativo: {
    label: 'Informativo',
    // Verde BPA — coherente con la identidad del banco
    badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-800/40 dark:text-bpa-200',
    borde: 'border-bpa-200 dark:border-bpa-700',
    icono:  // tabler:info-circle
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4 inline-block mr-1 -mt-0.5">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 9h.01" /><path d="M11 12h1v4h1" />
      </svg>`,
  },
  alerta: {
    label: 'Alerta',
    // Ámbar — semántico universal, se conserva
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    borde: 'border-amber-300 dark:border-amber-700',
    icono:  // tabler:alert-triangle
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4 inline-block mr-1 -mt-0.5">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 9v4" />
        <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
        <path d="M12 16h.01" />
      </svg>`,
  },
  urgente: {
    label: 'Urgente',
    // Rojo — semántico universal, se conserva
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    borde: 'border-red-400 dark:border-red-700',
    icono:  // tabler:alert-octagon
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4 inline-block mr-1 -mt-0.5">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.208 .486 .208 1.037 0 1.524l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.486 .208 -1.037 .208 -1.524 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.524l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.524 0z" />
        <path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>`,
  },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
const configDeNoticia = (nivel: Noticia['nivel']) =>
  CONFIG_NIVEL[nivel] ?? CONFIG_NIVEL.informativo;

const urlImagen = (noticia: Noticia): string | null => {
  if (!noticia.imagen) return null;
  return pb.files.getURL(noticia, noticia.imagen, { thumb: '600x300' });
};

const formatearFecha = (isoStr: string): string => {
  try {
    return new Intl.DateTimeFormat('es-CU', {
      day:   '2-digit',
      month: 'long',
      year:  'numeric',
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
};

// ── Carga de datos ────────────────────────────────────────────────────────────
const cargarNoticias = async () => {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const resultado = await pb.collection('noticias').getList<Noticia>(1, 3, {
      filter: 'publicado = true',
      sort:   '-fecha',
      fields: 'id,titulo,resumen,fecha,nivel,imagen,collectionId',
    });
    noticias.value = resultado.items;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
};

onMounted(cargarNoticias);
</script>

<template>
  <!-- ── ESTADO: Cargando (esqueleto) ──────────────────────────────────────── -->
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div
      v-for="i in 3"
      :key="i"
      class="rounded-xl border border-bpa-100 dark:border-bpa-800 bg-white dark:bg-bpa-950/60 overflow-hidden animate-pulse"
    >
      <div class="h-40 bg-bpa-100 dark:bg-bpa-800/40"></div>
      <div class="p-5 space-y-3">
        <div class="h-3 bg-bpa-100 dark:bg-bpa-800/40 rounded w-24"></div>
        <div class="h-5 bg-bpa-100 dark:bg-bpa-800/40 rounded w-full"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-4/5"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-3/5"></div>
      </div>
    </div>
  </div>

  <!-- ── ESTADO: Error de conexión ─────────────────────────────────────────── -->
  <div
    v-else-if="errorDB"
    class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-10 text-center"
  >
    <!-- tabler:wifi-off -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-red-400">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M12 18l.01 0" /><path d="M9.172 15.172a4 4 0 0 1 5.656 0" />
      <path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2" />
      <path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.182 -.982a12 12 0 0 1 10.043 3.438" />
      <path d="M3 3l18 18" />
    </svg>
    <p class="font-semibold text-red-700 dark:text-red-400 mb-1">
      No se pudo conectar con el servidor
    </p>
    <p class="text-sm text-red-600 dark:text-red-500 mb-4">
      Verifique que PocketBase esté activo en
      <code class="font-mono text-xs bg-red-100 dark:bg-red-900/50 px-1 rounded">
        http://127.0.0.1:8090
      </code>
    </p>
    <button
      @click="cargarNoticias"
      class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors"
    >
      <!-- tabler:refresh -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      </svg>
      Reintentar
    </button>
  </div>

  <!-- ── ESTADO: Sin noticias publicadas ───────────────────────────────────── -->
  <div
    v-else-if="!noticias.length"
    class="rounded-xl border border-bpa-100 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-950/60 p-10 text-center"
  >
    <!-- tabler:news-off -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-primary">
      <path d="M16 6h3a1 1 0 0 1 1 1v9m-.606 3.435A2 2 0 0 1 16 18v-2m0-4V5a1 1 0 0 0-1-1H8m-3.735.321A1 1 0 0 0 4 5v12a3 3 0 0 0 3 3h11M8 12h4m-4 4h4M3 3l18 18"/>
    </svg>
    <p class="font-semibold text-default dark:text-default mb-1">
      No hay avisos publicados
    </p>
    <p class="text-sm text-muted">
      Agregue noticias en PocketBase con
      <code class="font-mono text-xs bg-bpa-100 dark:bg-bpa-amber-800/40 px-1 rounded">publicado = true</code>
      para que aparezcan aquí.
    </p>
  </div>

  <!-- ── ESTADO: Datos ──────────────────────────────────────────────────────── -->
  <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <article
      v-for="noticia in noticias"
      :key="noticia.id"
      :class="[
        'group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60 overflow-hidden',
        'shadow-sm hover:shadow-md transition-shadow duration-300',
        configDeNoticia(noticia.nivel).borde,
      ]"
    >
      <!-- Imagen (si existe) -->
      <div v-if="urlImagen(noticia)" class="overflow-hidden h-40 bg-bpa-50 dark:bg-bpa-800/30">
        <img
          :src="urlImagen(noticia)!"
          :alt="noticia.titulo"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>
      <!-- Placeholder sin imagen -->
      <div
        v-else
        class="h-40 bg-gradient-to-br from-bpa-50 to-bpa-100 dark:from-bpa-950 dark:to-bpa-800/60 flex items-center justify-center"
      >
        <!-- tabler:news -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          class="w-12 h-12 text-muted opacity-40">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1-4 0V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a3 3 0 0 0 3 3h11M8 8h4m-4 4h4m-4 4h4"/>
        </svg>
      </div>

      <!-- Contenido -->
      <div class="flex flex-col flex-1 p-5 gap-3">
        <!-- Badge de nivel + fecha -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span
            :class="[
              'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
              configDeNoticia(noticia.nivel).badge,
            ]"
            v-html="configDeNoticia(noticia.nivel).icono + configDeNoticia(noticia.nivel).label"
          />
          <time
            :datetime="noticia.fecha"
            class="text-xs text-muted shrink-0"
          >
            {{ formatearFecha(noticia.fecha) }}
          </time>
        </div>

        <!-- Título -->
        <h3 class="font-bold text-default dark:text-default text-base leading-snug line-clamp-2">
          {{ noticia.titulo }}
        </h3>

        <!-- Resumen -->
        <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">
          {{ noticia.resumen }}
        </p>
      </div>
    </article>
  </div>
</template>
