<script setup lang="ts">
/**
 * @componente  src/components/vue/ActualidadListado.vue
 * @directiva   client:load  (inyectado desde ListadoActualidad.astro)
 *
 * @responsabilidad
 *   Listado reactivo y paginado de la sección "Actualidad" del portal BPA.
 *   Gestiona búsqueda por texto, filtrado por categoría y paginación en
 *   runtime consultando PocketBase — sin necesidad de rebuild al publicar.
 *
 * @coleccion  noticias
 *   titulo      Text    → Titular de la pieza
 *   slug        Text    → Identificador para la URL de detalle
 *   resumen     Text    → Descripción breve para la tarjeta
 *   fecha       Date    → Fecha de publicación
 *   nivel       Select  → 'informativo' | 'alerta' | 'urgente'
 *   categoria   Select  → 'comunicado' | 'noticia'
 *   publicado   Bool    → true si debe mostrarse
 *   imagen      File    → Foto de portada opcional
 *
 * @diseño
 *   Las tarjetas siguen el mismo patrón que NoticiasRecientes.vue:
 *   · Imagen de portada o placeholder con degradado de fondo por categoría
 *   · Borde 2px y placeholder en verde BPA (claro) / ámbar BPA (oscuro)
 *     usando las escalas tonales fijas del sistema — mismo comportamiento
 *     que el resto del portal.
 *   · Badge único: nivel si es alerta/urgente, categoría si no.
 *     El badge de categoría usa el mismo verde/ámbar del tema.
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, watch, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Categoria = 'comunicado' | 'noticia';
type Nivel     = 'informativo' | 'alerta' | 'urgente';

interface Noticia {
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

// ── Estado ────────────────────────────────────────────────────────────────────
const noticias        = ref<Noticia[]>([]);
const cargando        = ref(true);
const errorDB         = ref(false);
const totalItems      = ref(0);
const paginaActual    = ref(1);
const busqueda        = ref('');
const categoriaFiltro = ref<'todas' | Categoria>('todas');

const POR_PAGINA = 9;
let debounceTimer: ReturnType<typeof setTimeout>;

// ── Configuración visual por categoría ───────────────────────────────────────
// Las tarjetas usan las escalas tonales fijas del sistema BPA:
//   · Claro: escala verde bpa-* (bpa-100, bpa-800, etc.)
//   · Oscuro: escala ámbar bpa-amber-* (bpa-amber-800/40, bpa-amber-200, etc.)
// Idéntico al patrón del badge 'informativo' en NoticiasRecientes.vue.
const CONFIG_CATEGORIA: Record<Categoria, {
  label:     string;
  // Icono SVG para el placeholder (sin foto)
  icono:     string;
}> = {
  comunicado: {
    label: 'Comunicado',
    // tabler:speakerphone
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
    // tabler:news
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      class="w-12 h-12 opacity-50">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/>
      <path d="M8 8h4"/><path d="M8 12h4"/><path d="M8 16h4"/>
    </svg>`,
  },
};

// ── Nivel — solo alerta y urgente tienen badge propio ─────────────────────────
const CONFIG_NIVEL = {
  alerta:  { label: 'Alerta',  badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  urgente: { label: 'Urgente', badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
} as const;

// ── Computed ──────────────────────────────────────────────────────────────────
const totalPaginas    = computed(() => Math.max(1, Math.ceil(totalItems.value / POR_PAGINA)));
const hayResultados   = computed(() => noticias.value.length > 0);
const textoPaginacion = computed(() => `Página ${paginaActual.value} de ${totalPaginas.value}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function urlImagen(noticia: Noticia): string | null {
  if (!noticia.imagen) return null;
  return pb.files.getURL(noticia, noticia.imagen, { thumb: '600x300' });
}

function formatearFecha(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat('es-CU', {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(isoStr));
  } catch { return isoStr; }
}

/**
 * Badge único por tarjeta:
 *   · Nivel alerta/urgente → badge semántico (ámbar/rojo, prioridad visual)
 *   · Cualquier otro caso  → badge de categoría con paleta verde/ámbar del tema
 */
function badgeNoticia(noticia: Noticia): { label: string; badge: string } {
  if (noticia.nivel === 'alerta' || noticia.nivel === 'urgente') {
    return CONFIG_NIVEL[noticia.nivel];
  }
  // Badge de categoría: verde en claro, ámbar en oscuro — igual que el portal
  return {
    label: CONFIG_CATEGORIA[noticia.categoria]?.label ?? 'Aviso',
    badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200',
  };
}

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarNoticias() {
  cargando.value = true;
  errorDB.value  = false;

  const filtros: string[] = ['publicado = true'];

  if (categoriaFiltro.value !== 'todas') {
    filtros.push(`categoria = "${categoriaFiltro.value}"`);
  }

  const q = busqueda.value.trim().replace(/"/g, '');
  if (q) {
    filtros.push(`(titulo ~ "${q}" || resumen ~ "${q}")`);
  }

  try {
    const resultado = await pb.collection('noticias').getList<Noticia>(
      paginaActual.value,
      POR_PAGINA,
      {
        filter: filtros.join(' && '),
        sort:   '-fecha',
        fields: 'id,titulo,slug,resumen,fecha,nivel,categoria,imagen,collectionId',
      }
    );
    noticias.value   = resultado.items;
    totalItems.value = resultado.totalItems;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

function irAPagina(pagina: number) {
  if (pagina < 1 || pagina > totalPaginas.value) return;
  paginaActual.value = pagina;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiarCategoria(cat: 'todas' | Categoria) {
  categoriaFiltro.value = cat;
  paginaActual.value    = 1;
}

// ── Watchers ──────────────────────────────────────────────────────────────────
watch(busqueda, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    paginaActual.value = 1;
    cargarNoticias();
  }, 350);
});

watch(categoriaFiltro, cargarNoticias);
watch(paginaActual,    cargarNoticias);

onMounted(cargarNoticias);
</script>

<template>
  <!-- ══════════════════════════════════════════════════════════════════════
      CONTROLES: Búsqueda + Filtros de categoría
  ══════════════════════════════════════════════════════════════════════ -->
  <div class="flex flex-col sm:flex-row gap-3 mb-8">

    <!-- Búsqueda -->
    <div class="relative flex-1">
      <!-- tabler:search -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
        <path d="M21 21l-6 -6"/>
      </svg>
      <input
        :value="busqueda"
        @input="busqueda = ($event.target as HTMLInputElement).value"
        type="text"
        placeholder="Buscar en Actualidad…"
        class="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-bpa-200
               dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/60
               text-default dark:text-default placeholder:text-muted
               focus:outline-none focus:ring-2 focus:ring-primary transition"
      />
      <button v-if="busqueda" @click="busqueda = ''"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted
               hover:text-default dark:hover:text-default transition-colors">
        <!-- tabler:x -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          class="w-3.5 h-3.5">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M18 6l-12 12"/><path d="M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Filtros de categoría — usan primary igual que el resto del portal -->
    <div class="flex gap-2 flex-shrink-0">
      <button
        @click="cambiarCategoria('todas')"
        :class="[
          'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
          categoriaFiltro === 'todas'
            ? 'bg-primary text-white border-primary'
            : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary dark:hover:text-primary',
        ]">
        Todos
      </button>
      <button
        @click="cambiarCategoria('comunicado')"
        :class="[
          'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
          categoriaFiltro === 'comunicado'
            ? 'bg-primary text-white border-primary'
            : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary dark:hover:text-primary',
        ]">
        Comunicados
      </button>
      <button
        @click="cambiarCategoria('noticia')"
        :class="[
          'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
          categoriaFiltro === 'noticia'
            ? 'bg-primary text-white border-primary'
            : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary dark:hover:text-primary',
        ]">
        Noticias
      </button>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: Cargando (esqueletos)
  ══════════════════════════════════════════════════════════════════════ -->
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div
      v-for="i in 6" :key="i"
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

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: Error de conexión
  ══════════════════════════════════════════════════════════════════════ -->
  <div v-else-if="errorDB"
    class="rounded-xl border border-red-200 dark:border-red-800
           bg-red-50 dark:bg-red-950/30 p-12 text-center">
    <!-- tabler:alert-circle -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-red-500">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/>
      <path d="M12 8v4"/><path d="M12 16h.01"/>
    </svg>
    <p class="font-semibold text-red-700 dark:text-red-400 mb-1">
      No se pudo cargar la sección de Actualidad
    </p>
    <p class="text-sm text-red-600 dark:text-red-500 mb-5">
      Verifique la conexión con el servidor e intente de nuevo.
    </p>
    <button @click="cargarNoticias"
      class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700
             text-white text-sm font-medium px-5 py-2.5 transition-colors">
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

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: Sin resultados
  ══════════════════════════════════════════════════════════════════════ -->
  <div v-else-if="!hayResultados"
    class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800
           bg-bpa-50 dark:bg-bpa-950/60 p-12 text-center">
    <!-- tabler:news-off -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-10 h-10 mx-auto mb-3 text-muted opacity-40">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M16 6h3a1 1 0 0 1 1 1v9m-.606 3.435A2 2 0 0 1 16 18v-2m0-4V5a1 1 0 0 0-1-1H8m-3.735.321A1 1 0 0 0 4 5v12a3 3 0 0 0 3 3h11M8 12h4m-4 4h4M3 3l18 18"/>
    </svg>
    <p class="font-semibold text-default dark:text-default mb-1">
      No se encontraron resultados
    </p>
    <p class="text-sm text-muted">
      <span v-if="busqueda || categoriaFiltro !== 'todas'">
        Pruebe con otros términos o elimine los filtros activos.
      </span>
      <span v-else>
        Aún no hay contenido publicado en esta sección.
      </span>
    </p>
    <button v-if="busqueda || categoriaFiltro !== 'todas'"
      @click="busqueda = ''; categoriaFiltro = 'todas'"
      class="mt-4 text-sm text-primary dark:text-primary hover:underline underline-offset-4">
      Limpiar filtros
    </button>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: Datos — grilla de tarjetas
  ══════════════════════════════════════════════════════════════════════ -->
  <template v-else>

    <!-- Contador -->
    <p class="text-sm text-muted mb-6">
      <span class="font-semibold text-default dark:text-default">{{ totalItems }}</span>
      resultado{{ totalItems !== 1 ? 's' : '' }}
      <span v-if="categoriaFiltro !== 'todas'">
        en {{ CONFIG_CATEGORIA[categoriaFiltro].label.toLowerCase() }}s
      </span>
    </p>

    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="noticia in noticias"
        :key="noticia.id"
        class="group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60
               overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300
               border-bpa-400 dark:border-bpa-amber-600">

        <!-- ── Imagen o placeholder con degradado verde/ámbar ─────────────── -->
        <div class="overflow-hidden h-40 flex-shrink-0">
          <img
            v-if="urlImagen(noticia)"
            :src="urlImagen(noticia)!"
            :alt="noticia.titulo"
            class="w-full h-full object-cover group-hover:scale-105
                   transition-transform duration-500"
            loading="lazy"
          />
          <!-- Degradado verde claro → verde muy suave en claro
               Degradado ámbar oscuro → ámbar muy suave en oscuro -->
          <div
            v-else
            class="w-full h-full flex items-center justify-center
                   bg-gradient-to-br from-bpa-600 to-bpa-100
                   dark:from-bpa-amber-400 dark:to-bpa-amber-950">
            <span
              class="text-bpa-50 dark:text-bpa-amber-200"
              v-html="CONFIG_CATEGORIA[noticia.categoria].icono">
            </span>
          </div>
        </div>

        <!-- ── Contenido ──────────────────────────────────────────────────── -->
        <div class="flex flex-col flex-1 p-5 gap-3">

          <!-- Badge único + Fecha -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span
              :class="[
                'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
                badgeNoticia(noticia).badge,
              ]">
              {{ badgeNoticia(noticia).label }}
            </span>
            <time :datetime="noticia.fecha" class="text-xs text-muted flex-shrink-0">
              {{ formatearFecha(noticia.fecha) }}
            </time>
          </div>

          <!-- Título -->
          <h3 class="font-bold text-default dark:text-default text-base
                     leading-snug line-clamp-2">
            {{ noticia.titulo }}
          </h3>

          <!-- Resumen -->
          <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">
            {{ noticia.resumen }}
          </p>

          <!-- Enlace al detalle (solo si tiene slug) -->
          <a
            v-if="noticia.slug"
            :href="`/actualidad/${noticia.slug}`"
            class="inline-flex items-center gap-1.5 text-sm font-medium
                   text-primary dark:text-primary
                   hover:text-secondary dark:hover:text-secondary
                   transition-colors mt-auto">
            Leer más
            <!-- tabler:arrow-right -->
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

    <!-- ── Paginación ──────────────────────────────────────────────────────── -->
    <div v-if="totalPaginas > 1"
      class="flex items-center justify-between gap-4 mt-10 pt-6
             border-t border-bpa-200 dark:border-bpa-amber-800">

      <button
        @click="irAPagina(paginaActual - 1)"
        :disabled="paginaActual === 1"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
               transition-colors border border-bpa-200 dark:border-bpa-amber-800
               disabled:opacity-40 disabled:cursor-not-allowed
               hover:border-primary hover:text-primary dark:hover:text-primary
               bg-white dark:bg-bpa-950/60 text-default">
        <!-- tabler:arrow-left -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>
        </svg>
        Anterior
      </button>

      <span class="text-sm text-muted">{{ textoPaginacion }}</span>

      <button
        @click="irAPagina(paginaActual + 1)"
        :disabled="paginaActual === totalPaginas"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
               transition-colors border border-bpa-200 dark:border-bpa-amber-800
               disabled:opacity-40 disabled:cursor-not-allowed
               hover:border-primary hover:text-primary dark:hover:text-primary
               bg-white dark:bg-bpa-950/60 text-default">
        Siguiente
        <!-- tabler:arrow-right -->
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
