<script setup lang="ts">
/**
 * @componente  src/components/vue/ActualidadListado.vue
 * @directiva   client:load  (inyectado desde ListadoActualidad.astro)
 *
 * @descripcion
 *   Listado reactivo y paginado de /actualidad con búsqueda y filtros.
 *   Lee ?categoria= de la URL al montar para preseleccionar el filtro.
 *   Ordena por -updated (más reciente primero).
 *
 * @i18n — tres capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · actualidad.titulo  / titulo_en  → título de cada tarjeta
 *      · actualidad.resumen / resumen_en → descripción en la tarjeta
 *      Se resuelven con tf(base, translated).
 *
 *   2. Campos Select que se traducen en el código (no en PB):
 *      · actualidad.nivel    (informativo / alerta / urgente) → ui local
 *      · actualidad.categoria (comunicado / noticia)          → ui local
 *
 *   3. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Labels de filtros, búsqueda, paginación, estados de carga/error
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por ListadoActualidad.astro
 *
 * @coleccion  actualidad
 *   titulo      Text   → título en español
 *   titulo_en   Text   → título en inglés (puede estar vacío)
 *   resumen     Text   → descripción breve en español
 *   resumen_en  Text   → descripción breve en inglés (puede estar vacío)
 *   fecha       Date   → fecha de publicación visible
 *   nivel       Select → informativo | alerta | urgente  (traducido en código)
 *   categoria   Select → comunicado | noticia            (traducido en código)
 *   publicado   Bool
 *   imagen      File
 *   updated     Date   → campo automático (ordenación principal)
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, watch, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';
import { useTranslations, useFieldTranslation, useLocalTranslations, type Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción ────────────────────────────────────────────────────────────────
const t = useTranslations(props.lang);
const tf = useFieldTranslation(props.lang);

// ── Strings de interfaz pura + labels de selects (local — no van a .ts) ───────
const tl = useLocalTranslations(props.lang, {
  es: {
    filterAll: 'Todos',
    searchPlaceholder: 'Buscar en Actualidad…',
    clearFilters: 'Limpiar filtros',
    result: 'resultado',
    resultPlural: 'resultados',
    resultIn: 'en',
    emptyTitle: 'No se encontraron resultados',
    emptyFilters: 'Pruebe con otros términos o elimine los filtros.',
    emptyNoContent: 'Aún no hay contenido publicado en esta sección.',
    readMore: 'Leer más',
    prev: 'Anterior',
    next: 'Siguiente',
    page: 'Página',
    of: 'de',
    loading: 'Cargando…',
    retry: 'Reintentar',
    errorTitle: 'No se pudo cargar la sección',
    errorMsg: 'Verifique la conexión e intente de nuevo.',
  },
  en: {
    filterAll: 'All',
    searchPlaceholder: 'Search news & announcements…',
    clearFilters: 'Clear filters',
    result: 'result',
    resultPlural: 'results',
    resultIn: 'in',
    emptyTitle: 'No results found',
    emptyFilters: 'Try different terms or remove the filters.',
    emptyNoContent: 'No content has been published in this section yet.',
    readMore: 'Read more',
    prev: 'Previous',
    next: 'Next',
    page: 'Page',
    of: 'of',
    loading: 'Loading…',
    retry: 'Retry',
    errorTitle: 'Could not load this section',
    errorMsg: 'Check your connection and try again.',
  },
});

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Categoria = 'comunicado' | 'noticia';
type Nivel = 'informativo' | 'alerta' | 'urgente';

interface Registro {
  id: string;
  titulo: string;
  titulo_en: string; // campo _en de PocketBase
  slug: string;
  resumen: string;
  resumen_en: string; // campo _en de PocketBase
  fecha: string;
  nivel: Nivel;
  categoria: Categoria;
  publicado: boolean;
  imagen: string;
  collectionId: string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const todosRegistros = ref<Registro[]>([]);
const cargando = ref(true);
const errorDB = ref(false);
const paginaActual = ref(1);
const busqueda = ref('');
const categoriaFiltro = ref<'todas' | Categoria>('todas');

const POR_PAGINA = 9;
let debounceTimer: ReturnType<typeof setTimeout>;

// ── Badge por nivel/categoría ─────────────────────────────────────────────────
// La lógica: si el nivel es alerta o urgente → muestra el nivel (semántico).
// Si es informativo → muestra la categoría (comunicado/noticia).
// Los colores son semánticos universales; no se traducen.
// Los labels vienen del diccionario centralizado.
function badgeConfig(r: Registro): { label: string; badge: string } {
  if (r.nivel === 'alerta')
    return {
      label: t('news.level.alerta'),
      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    };
  if (r.nivel === 'urgente')
    return {
      label: t('news.level.urgente'),
      badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    };
  return {
    label: t(`news.category.${r.categoria}`),
    badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200',
  };
}

// ── Placeholders SVG por categoría ────────────────────────────────────────────
const ICONO_PLACEHOLDER: Record<Categoria, string> = {
  comunicado: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    class="w-12 h-12 opacity-50">
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M18 8a3 3 0 0 1 0 6"/>
    <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/>
    <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>
  </svg>`,
  noticia: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    class="w-12 h-12 opacity-50">
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/>
    <path d="M8 8h4"/><path d="M8 12h4"/><path d="M8 16h4"/>
  </svg>`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ── Computed (filtrado en cliente con tf() según idioma) ──────────────────────
const todosFiltrados = computed((): Registro[] => {
  let lista = todosRegistros.value;

  // Filtrar por categoría
  if (categoriaFiltro.value !== 'todas') {
    lista = lista.filter((r) => r.categoria === categoriaFiltro.value);
  }

  // Filtrar por búsqueda usando tf() para aplicar el idioma correcto
  const q = normalizar(busqueda.value.trim());
  if (q) {
    lista = lista.filter(
      (r) => normalizar(tf(r.titulo, r.titulo_en)).includes(q) || normalizar(tf(r.resumen, r.resumen_en)).includes(q)
    );
  }

  return lista;
});

const totalItems = computed(() => todosFiltrados.value.length);
const totalPaginas = computed(() => Math.max(1, Math.ceil(totalItems.value / POR_PAGINA)));
const hayResultados = computed(() => registros.value.length > 0);
const registros = computed((): Registro[] => {
  const inicio = (paginaActual.value - 1) * POR_PAGINA;
  const fin = inicio + POR_PAGINA;
  return todosFiltrados.value.slice(inicio, fin);
});
const textoPaginacion = computed(() => `${tl('page')} ${paginaActual.value} ${tl('of')} ${totalPaginas.value}`);

function urlImagen(r: Registro): string | null {
  return r.imagen ? pb.files.getURL(r, r.imagen, { thumb: '600x300' }) : null;
}

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat(props.lang === 'en' ? 'en-US' : 'es-CU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarDatos() {
  cargando.value = true;
  errorDB.value = false;
  try {
    const res = await pb.collection('actualidad').getFullList<Registro>({
      filter: 'publicado = true',
      sort: '-updated',
      fields: 'id,titulo,titulo_en,slug,resumen,resumen_en,fecha,nivel,categoria,imagen,collectionId',
    });
    todosRegistros.value = res;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

function irAPagina(p: number) {
  if (p < 1 || p > totalPaginas.value) return;
  paginaActual.value = p;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiarCategoria(cat: 'todas' | Categoria) {
  categoriaFiltro.value = cat;
  paginaActual.value = 1;
}

watch(busqueda, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    paginaActual.value = 1;
  }, 350);
});
watch(categoriaFiltro, () => {
  paginaActual.value = 1;
});

onMounted(() => {
  const param = new URLSearchParams(window.location.search).get('categoria');
  if (param === 'comunicado' || param === 'noticia') {
    categoriaFiltro.value = param;
  }
  cargarDatos();
});
</script>

<template>
  <!-- Controles de búsqueda y filtro -->
  <div class="flex flex-col sm:flex-row gap-3 mb-8">
    <!-- Campo de búsqueda -->
    <div class="relative flex-1">
      <!-- tabler:search -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
        <path d="M21 21l-6 -6" />
      </svg>
      <input
        :value="busqueda"
        @input="busqueda = ($event.target as HTMLInputElement).value"
        type="text"
        :placeholder="tl('searchPlaceholder')"
        class="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/60 text-default dark:text-default placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary transition"
      />
      <button
        v-if="busqueda"
        @click="busqueda = ''"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-default transition-colors"
      >
        <!-- tabler:x -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-3.5 h-3.5"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M18 6l-12 12" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Filtros por categoría -->
    <div class="flex gap-2 flex-shrink-0">
      <button
        v-for="opt in [
          { val: 'todas', label: tl('filterAll') },
          { val: 'comunicado', label: t('news.category.comunicado') },
          { val: 'noticia', label: t('news.category.noticia') },
        ]"
        :key="opt.val"
        @click="cambiarCategoria(opt.val as 'todas' | Categoria)"
        :class="[
          'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
          categoriaFiltro === opt.val
            ? 'bg-primary text-white border-primary'
            : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary dark:hover:text-primary',
        ]"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>

  <!-- ── ESTADO: Cargando ──────────────────────────────────────────────── -->
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div
      v-for="i in 6"
      :key="i"
      class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/60 overflow-hidden animate-pulse"
    >
      <div class="h-40 bg-bpa-100 dark:bg-bpa-800/40" />
      <div class="p-5 space-y-3">
        <div class="h-3 bg-bpa-100 dark:bg-bpa-800/40 rounded w-24" />
        <div class="h-5 bg-bpa-100 dark:bg-bpa-800/40 rounded w-full" />
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-4/5" />
      </div>
    </div>
  </div>

  <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
  <div
    v-else-if="errorDB"
    class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-12 text-center"
  >
    <!-- tabler:alert-circle -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-red-500"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
    <p class="font-semibold text-red-700 dark:text-red-400 mb-1">{{ tl('errorTitle') }}</p>
    <p class="text-sm text-red-600 dark:text-red-500 mb-5">{{ tl('errorMsg') }}</p>
    <button
      @click="cargarDatos"
      class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-5 py-2.5 transition-colors"
    >
      <!-- tabler:refresh -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      </svg>
      {{ tl('retry') }}
    </button>
  </div>

  <!-- ── ESTADO: Sin resultados ────────────────────────────────────────── -->
  <div
    v-else-if="!hayResultados"
    class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-950/60 p-12 text-center"
  >
    <!-- tabler:news-off -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-muted opacity-40"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path
        d="M16 6h3a1 1 0 0 1 1 1v9m-.606 3.435A2 2 0 0 1 16 18v-2m0-4V5a1 1 0 0 0-1-1H8m-3.735.321A1 1 0 0 0 4 5v12a3 3 0 0 0 3 3h11M8 12h4m-4 4h4M3 3l18 18"
      />
    </svg>
    <p class="font-semibold text-default dark:text-default mb-1">{{ tl('emptyTitle') }}</p>
    <p class="text-sm text-muted">
      <span v-if="busqueda || categoriaFiltro !== 'todas'">{{ tl('emptyFilters') }}</span>
      <span v-else>{{ tl('emptyNoContent') }}</span>
    </p>
    <button
      v-if="busqueda || categoriaFiltro !== 'todas'"
      @click="
        busqueda = '';
        categoriaFiltro = 'todas';
      "
      class="mt-4 text-sm text-primary dark:text-primary hover:underline underline-offset-4"
    >
      {{ tl('clearFilters') }}
    </button>
  </div>

  <!-- ── ESTADO: Datos ─────────────────────────────────────────────────── -->
  <template v-else>
    <!-- Contador de resultados -->
    <p class="text-sm text-muted mb-6">
      <span class="font-semibold text-default dark:text-default">{{ totalItems }}</span>
      {{ totalItems !== 1 ? tl('resultPlural') : tl('result') }}
      <span v-if="categoriaFiltro !== 'todas'">
        {{ tl('resultIn') }} {{ t(`news.category.${categoriaFiltro}`).toLowerCase() }}s
      </span>
    </p>

    <!-- Grid de tarjetas -->
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="r in registros"
        :key="r.id"
        class="group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border-bpa-400 dark:border-bpa-amber-600"
      >
        <!-- Imagen o placeholder por categoría -->
        <div class="overflow-hidden h-40 flex-shrink-0">
          <img
            v-if="urlImagen(r)"
            :src="urlImagen(r)!"
            :alt="tf(r.titulo, r.titulo_en)"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-gradient-to-br from-bpa-600 to-bpa-100 dark:from-bpa-amber-600 dark:to-bpa-amber-950"
          >
            <span class="text-bpa-50 dark:text-bpa-amber-200" v-html="ICONO_PLACEHOLDER[r.categoria]" />
          </div>
        </div>

        <!-- Contenido -->
        <div class="flex flex-col flex-1 p-5 gap-3">
          <!-- Badge + Fecha -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <!-- badge: nivel si urgente/alerta, categoría si informativo -->
            <span :class="['text-xs font-semibold px-2.5 py-1 rounded-full', badgeConfig(r).badge]">
              {{ badgeConfig(r).label }}
            </span>
            <time :datetime="r.fecha" class="text-xs text-muted flex-shrink-0">
              {{ formatearFecha(r.fecha) }}
            </time>
          </div>
          <!-- Título → tf() (campo PB traducible) -->
          <h3 class="font-bold text-default dark:text-default text-base leading-snug line-clamp-2">
            {{ tf(r.titulo, r.titulo_en) }}
          </h3>
          <!-- Resumen → tf() (campo PB traducible) -->
          <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">
            {{ tf(r.resumen, r.resumen_en) }}
          </p>
          <!-- Enlace al detalle -->
          <a
            v-if="r.slug"
            :href="`/${props.lang}/actualidad/${r.slug}`"
            class="inline-flex items-center gap-1.5 text-sm font-medium mt-auto text-primary dark:text-primary hover:text-secondary dark:hover:text-secondary transition-colors"
          >
            {{ tl('readMore') }}
            <!-- tabler:arrow-right -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M5 12l14 0" />
              <path d="M13 18l6 -6" />
              <path d="M13 6l6 6" />
            </svg>
          </a>
        </div>
      </article>
    </div>

    <!-- Paginación -->
    <div
      v-if="totalPaginas > 1"
      class="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-bpa-200 dark:border-bpa-amber-800"
    >
      <button
        @click="irAPagina(paginaActual - 1)"
        :disabled="paginaActual === 1"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-bpa-200 dark:border-bpa-amber-800 disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary hover:text-primary dark:hover:text-primary bg-white dark:bg-bpa-950/60 text-default"
      >
        <!-- tabler:arrow-left -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M5 12l14 0" />
          <path d="M5 12l6 6" />
          <path d="M5 12l6 -6" />
        </svg>
        {{ tl('prev') }}
      </button>
      <span class="text-sm text-muted">{{ textoPaginacion }}</span>
      <button
        @click="irAPagina(paginaActual + 1)"
        :disabled="paginaActual === totalPaginas"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-bpa-200 dark:border-bpa-amber-800 disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary hover:text-primary dark:hover:text-primary bg-white dark:bg-bpa-950/60 text-default"
      >
        {{ tl('next') }}
        <!-- tabler:arrow-right -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M5 12l14 0" />
          <path d="M13 18l6 -6" />
          <path d="M13 6l6 6" />
        </svg>
      </button>
    </div>
  </template>
</template>
