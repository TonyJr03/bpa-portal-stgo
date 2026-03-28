<script setup lang="ts">
/**
 * @componente  src/components/vue/ActualidadListado.vue
 * @directiva   client:load  (inyectado desde ListadoActualidad.astro)
 *
 * Listado reactivo y paginado de /actualidad.
 * Lee ?categoria= de la URL al montar para preseleccionar el filtro.
 * Ordena por -updated (más reciente primero, por creación o edición).
 *
 * @coleccion  actualidad  (antes: noticias)
 */

import { ref, computed, watch, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

type Categoria = 'comunicado' | 'noticia';
type Nivel     = 'informativo' | 'alerta' | 'urgente';

interface Registro {
  id:           string;
  titulo:       string;
  slug:         string;
  resumen:      string;
  fecha:        string;
  nivel:        Nivel;
  categoria:    Categoria;
  publicado:    boolean;
  imagen:       string;
  collectionId: string;
}

const registros       = ref<Registro[]>([]);
const cargando        = ref(true);
const errorDB         = ref(false);
const totalItems      = ref(0);
const paginaActual    = ref(1);
const busqueda        = ref('');
const categoriaFiltro = ref<'todas' | Categoria>('todas');

const POR_PAGINA = 9;
let debounceTimer: ReturnType<typeof setTimeout>;

const CONFIG_CATEGORIA: Record<Categoria, { label: string; icono: string }> = {
  comunicado: {
    label: 'Comunicado',
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      class="w-12 h-12 opacity-50">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M18 8a3 3 0 0 1 0 6"/>
      <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/>
      <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>
    </svg>`,
  },
  noticia: {
    label: 'Noticia',
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      class="w-12 h-12 opacity-50">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/>
      <path d="M8 8h4"/><path d="M8 12h4"/><path d="M8 16h4"/>
    </svg>`,
  },
};

const CONFIG_NIVEL = {
  alerta:  { label: 'Alerta',  badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  urgente: { label: 'Urgente', badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
} as const;

const totalPaginas    = computed(() => Math.max(1, Math.ceil(totalItems.value / POR_PAGINA)));
const hayResultados   = computed(() => registros.value.length > 0);
const textoPaginacion = computed(() => `Página ${paginaActual.value} de ${totalPaginas.value}`);

function urlImagen(r: Registro): string | null {
  return r.imagen ? pb.files.getURL(r, r.imagen, { thumb: '600x300' }) : null;
}

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CU', {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

function badge(r: Registro): { label: string; badge: string } {
  if (r.nivel === 'alerta' || r.nivel === 'urgente') return CONFIG_NIVEL[r.nivel];
  return {
    label: CONFIG_CATEGORIA[r.categoria]?.label ?? 'Aviso',
    badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200',
  };
}

async function cargar() {
  cargando.value = true;
  errorDB.value  = false;
  const filtros: string[] = ['publicado = true'];
  if (categoriaFiltro.value !== 'todas') filtros.push(`categoria = "${categoriaFiltro.value}"`);
  const q = busqueda.value.trim().replace(/"/g, '');
  if (q) filtros.push(`(titulo ~ "${q}" || resumen ~ "${q}")`);
  try {
    const res = await pb.collection('actualidad').getList<Registro>(
      paginaActual.value, POR_PAGINA,
      {
        filter: filtros.join(' && '),
        sort:   '-updated',
        fields: 'id,titulo,slug,resumen,fecha,nivel,categoria,imagen,collectionId',
      }
    );
    registros.value  = res.items;
    totalItems.value = res.totalItems;
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
  paginaActual.value    = 1;
}

watch(busqueda, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { paginaActual.value = 1; cargar(); }, 350);
});
watch(categoriaFiltro, cargar);
watch(paginaActual, cargar);

onMounted(() => {
  const param = new URLSearchParams(window.location.search).get('categoria');
  if (param === 'comunicado' || param === 'noticia') {
    categoriaFiltro.value = param;
    // el watcher de categoriaFiltro llama a cargar()
  } else {
    cargar();
  }
});
</script>

<template>
  <!-- Controles -->
  <div class="flex flex-col sm:flex-row gap-3 mb-8">
    <div class="relative flex-1">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
        <path d="M21 21l-6 -6"/>
      </svg>
      <input :value="busqueda"
        @input="busqueda = ($event.target as HTMLInputElement).value"
        type="text" placeholder="Buscar en Actualidad…"
        class="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-bpa-200
               dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/60
               text-default dark:text-default placeholder:text-muted
               focus:outline-none focus:ring-2 focus:ring-primary transition" />
      <button v-if="busqueda" @click="busqueda = ''"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-default transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          class="w-3.5 h-3.5">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M18 6l-12 12"/><path d="M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="flex gap-2 flex-shrink-0">
      <button v-for="opt in [
        { val: 'todas', label: 'Todos' },
        { val: 'comunicado', label: 'Comunicados' },
        { val: 'noticia', label: 'Noticias' },
      ]" :key="opt.val"
        @click="cambiarCategoria(opt.val as 'todas' | Categoria)"
        :class="[
          'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
          categoriaFiltro === opt.val
            ? 'bg-primary text-white border-primary'
            : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary dark:hover:text-primary',
        ]">
        {{ opt.label }}
      </button>
    </div>
  </div>

  <!-- Cargando -->
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 6" :key="i"
      class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800
             bg-white dark:bg-bpa-950/60 overflow-hidden animate-pulse">
      <div class="h-40 bg-bpa-100 dark:bg-bpa-800/40"></div>
      <div class="p-5 space-y-3">
        <div class="h-3 bg-bpa-100 dark:bg-bpa-800/40 rounded w-24"></div>
        <div class="h-5 bg-bpa-100 dark:bg-bpa-800/40 rounded w-full"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-4/5"></div>
      </div>
    </div>
  </div>

  <!-- Error -->
  <div v-else-if="errorDB"
    class="rounded-xl border border-red-200 dark:border-red-800
           bg-red-50 dark:bg-red-950/30 p-12 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-red-500">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/>
      <path d="M12 8v4"/><path d="M12 16h.01"/>
    </svg>
    <p class="font-semibold text-red-700 dark:text-red-400 mb-1">No se pudo cargar la sección</p>
    <p class="text-sm text-red-600 dark:text-red-500 mb-5">Verifique la conexión e intente de nuevo.</p>
    <button @click="cargar"
      class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700
             text-white text-sm font-medium px-5 py-2.5 transition-colors">
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

  <!-- Sin resultados -->
  <div v-else-if="!hayResultados"
    class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800
           bg-bpa-50 dark:bg-bpa-950/60 p-12 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-muted opacity-40">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M16 6h3a1 1 0 0 1 1 1v9m-.606 3.435A2 2 0 0 1 16 18v-2m0-4V5a1 1 0 0 0-1-1H8m-3.735.321A1 1 0 0 0 4 5v12a3 3 0 0 0 3 3h11M8 12h4m-4 4h4M3 3l18 18"/>
    </svg>
    <p class="font-semibold text-default dark:text-default mb-1">No se encontraron resultados</p>
    <p class="text-sm text-muted">
      <span v-if="busqueda || categoriaFiltro !== 'todas'">Pruebe con otros términos o elimine los filtros.</span>
      <span v-else>Aún no hay contenido publicado en esta sección.</span>
    </p>
    <button v-if="busqueda || categoriaFiltro !== 'todas'"
      @click="busqueda = ''; categoriaFiltro = 'todas'"
      class="mt-4 text-sm text-primary dark:text-primary hover:underline underline-offset-4">
      Limpiar filtros
    </button>
  </div>

  <!-- Datos -->
  <template v-else>
    <p class="text-sm text-muted mb-6">
      <span class="font-semibold text-default dark:text-default">{{ totalItems }}</span>
      resultado{{ totalItems !== 1 ? 's' : '' }}
      <span v-if="categoriaFiltro !== 'todas'">
        en {{ CONFIG_CATEGORIA[categoriaFiltro].label.toLowerCase() }}s
      </span>
    </p>

    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="r in registros" :key="r.id"
        class="group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60
               overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300
               border-bpa-400 dark:border-bpa-amber-600">
        <div class="overflow-hidden h-40 flex-shrink-0">
          <img v-if="urlImagen(r)" :src="urlImagen(r)!" :alt="r.titulo"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy" />
          <div v-else
            class="w-full h-full flex items-center justify-center
                   bg-gradient-to-br from-bpa-600 to-bpa-100
                   dark:from-bpa-amber-600 dark:to-bpa-amber-950">
            <span class="text-bpa-50 dark:text-bpa-amber-200"
              v-html="CONFIG_CATEGORIA[r.categoria].icono"></span>
          </div>
        </div>
        <div class="flex flex-col flex-1 p-5 gap-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span :class="['text-xs font-semibold px-2.5 py-1 rounded-full', badge(r).badge]">
              {{ badge(r).label }}
            </span>
            <time :datetime="r.fecha" class="text-xs text-muted flex-shrink-0">
              {{ formatearFecha(r.fecha) }}
            </time>
          </div>
          <h3 class="font-bold text-default dark:text-default text-base leading-snug line-clamp-2">
            {{ r.titulo }}
          </h3>
          <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">{{ r.resumen }}</p>
          <a v-if="r.slug" :href="`/actualidad/${r.slug}`"
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

    <!-- Paginación -->
    <div v-if="totalPaginas > 1"
      class="flex items-center justify-between gap-4 mt-10 pt-6
             border-t border-bpa-200 dark:border-bpa-amber-800">
      <button @click="irAPagina(paginaActual - 1)" :disabled="paginaActual === 1"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
               transition-colors border border-bpa-200 dark:border-bpa-amber-800
               disabled:opacity-40 disabled:cursor-not-allowed
               hover:border-primary hover:text-primary dark:hover:text-primary
               bg-white dark:bg-bpa-950/60 text-default">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>
        </svg>
        Anterior
      </button>
      <span class="text-sm text-muted">{{ textoPaginacion }}</span>
      <button @click="irAPagina(paginaActual + 1)" :disabled="paginaActual === totalPaginas"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
               transition-colors border border-bpa-200 dark:border-bpa-amber-800
               disabled:opacity-40 disabled:cursor-not-allowed
               hover:border-primary hover:text-primary dark:hover:text-primary
               bg-white dark:bg-bpa-950/60 text-default">
        Siguiente
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>
        </svg>
      </button>
    </div>
  </template>
</template>
