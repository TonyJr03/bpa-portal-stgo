<script setup lang="ts">
/**
 * @componente  src/components/vue/UltimasNoticias.vue
 * @directiva   client:visible  (inyectado desde Noticias.astro)
 *
 * @responsabilidad
 *   Carrusel de las últimas 3 noticias (categoria = "noticia") en el home.
 *
 *   · Avanza automáticamente cada 6 segundos
 *   · El usuario puede avanzar/retroceder con los botones o los puntos
 *   · Al interactuar manualmente, el autoplay se reinicia desde cero
 *   · Silencioso si no hay noticias (no renderiza nada visible)
 *   · Error discreto inline si falla la conexión
 *
 * @nota-arquitectura
 *   El componente tiene un único <div> raíz que siempre existe en el DOM.
 *   Esto es necesario para que la hidratación client:visible de Astro
 *   funcione correctamente — los fragments vacíos (<template v-if>)
 *   como raíz de una cadena v-if/v-else confunden el reconciliador de Vue
 *   durante la hidratación y pierden el hilo condicional.
 *
 * @coleccion  actualidad  (antes: noticias)
 *   filter: publicado = true && categoria = "noticia"
 *   sort:   -updated
 *   limit:  3
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { pb } from '~/lib/pocketbase';

interface Noticia {
  id:           string;
  titulo:       string;
  slug:         string;
  resumen:      string;
  fecha:        string;
  nivel:        string;
  publicado:    boolean;
  imagen:       string;
  collectionId: string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const noticias     = ref<Noticia[]>([]);
const cargando     = ref(true);
const errorDB      = ref(false);
const indice       = ref(0);

let intervalo: ReturnType<typeof setInterval> | null = null;
const INTERVALO_MS = 6000;

// ── Computed ──────────────────────────────────────────────────────────────────
const total          = computed(() => noticias.value.length);
const hayNoticias    = computed(() => total.value > 0);
const noticiaActual  = computed(() => noticias.value[indice.value] ?? null);
// Solo muestra el componente cuando terminó de cargar y hay datos
const mostrar        = computed(() => !cargando.value && hayNoticias.value);
// Error visible solo si terminó de cargar y hay error
const mostrarError   = computed(() => !cargando.value && errorDB.value);

// ── Navegación ────────────────────────────────────────────────────────────────
function siguiente() {
  indice.value = (indice.value + 1) % total.value;
  reiniciarAutoplay();
}

function anterior() {
  indice.value = (indice.value - 1 + total.value) % total.value;
  reiniciarAutoplay();
}

function irA(idx: number) {
  if (idx === indice.value) return;
  indice.value = idx;
  reiniciarAutoplay();
}

function iniciarAutoplay() {
  if (total.value <= 1) return;
  intervalo = setInterval(() => {
    indice.value = (indice.value + 1) % total.value;
  }, INTERVALO_MS);
}

function reiniciarAutoplay() {
  if (intervalo) clearInterval(intervalo);
  iniciarAutoplay();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function urlImagen(n: Noticia): string | null {
  return n.imagen ? pb.files.getURL(n, n.imagen, { thumb: '800x400' }) : null;
}

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CU', {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

// ── Carga ─────────────────────────────────────────────────────────────────────
async function cargar() {
  cargando.value = true;
  errorDB.value  = false;
  indice.value   = 0;
  if (intervalo) clearInterval(intervalo);

  try {
    const res = await pb.collection('actualidad').getList<Noticia>(1, 3, {
      filter: 'publicado = true && categoria = "noticia"',
      sort:   '-updated',
      fields: 'id,titulo,slug,resumen,fecha,imagen,collectionId',
    });
    noticias.value = res.items;
    if (res.items.length > 1) iniciarAutoplay();
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
onUnmounted(() => { if (intervalo) clearInterval(intervalo); });
</script>

<template>
  <!--
    Un único div raíz siempre presente — imprescindible para que la hidratación
    client:visible de Astro funcione correctamente.
    Cuando no hay datos, el div tiene height:0 y no ocupa espacio visual.
  -->
  <div>

    <!-- ── Error discreto ──────────────────────────────────────────────────── -->
    <div v-if="mostrarError"
      class="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200
             dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm">
      <!-- tabler:wifi-off -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4 text-red-500 flex-shrink-0">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 18l.01 0"/><path d="M9.172 15.172a4 4 0 0 1 5.656 0"/>
        <path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"/>
        <path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.182 -.982a12 12 0 0 1 10.043 3.438"/>
        <path d="M3 3l18 18"/>
      </svg>
      <span class="text-red-700 dark:text-red-400 flex-1">
        No se pudieron cargar las últimas noticias.
      </span>
      <button @click="cargar"
        class="text-red-600 dark:text-red-400 hover:underline underline-offset-2
               font-medium flex-shrink-0">
        Reintentar
      </button>
    </div>

    <!-- ── Carrusel ────────────────────────────────────────────────────────── -->
    <div v-if="mostrar"
      class="relative overflow-hidden rounded-2xl border-2
             border-bpa-400 dark:border-bpa-amber-600
             bg-white dark:bg-bpa-950/60 shadow-sm">

      <Transition
        enter-active-class="transition-all duration-500 ease-in-out"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-300 ease-in"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 -translate-x-4"
        mode="out-in">

        <div v-if="noticiaActual" :key="noticiaActual.id"
          class="flex flex-col sm:flex-row">

          <!-- Imagen o placeholder -->
          <div class="sm:w-2/5 h-52 sm:h-auto overflow-hidden flex-shrink-0">
            <img
              v-if="urlImagen(noticiaActual)"
              :src="urlImagen(noticiaActual)!"
              :alt="noticiaActual.titulo"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div v-else
              class="w-full h-full min-h-[13rem] flex items-center justify-center
                     bg-gradient-to-br from-bpa-600 to-bpa-100
                     dark:from-bpa-amber-600 dark:to-bpa-amber-950">
              <!-- tabler:news -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                class="w-14 h-14 text-bpa-50 dark:text-bpa-amber-200 opacity-50">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/>
                <path d="M8 8h4"/><path d="M8 12h4"/><path d="M8 16h4"/>
              </svg>
            </div>
          </div>

          <!-- Texto -->
          <div class="flex flex-col flex-1 p-6 gap-4 justify-between">
            <div class="space-y-3">

              <!-- Badge + Fecha -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full
                             bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200">
                  Noticia
                </span>
                <time :datetime="noticiaActual.fecha" class="text-xs text-muted">
                  {{ formatearFecha(noticiaActual.fecha) }}
                </time>
              </div>

              <!-- Título -->
              <h3 class="font-bold text-default dark:text-default text-lg leading-snug line-clamp-2">
                {{ noticiaActual.titulo }}
              </h3>

              <!-- Resumen -->
              <p class="text-sm text-muted leading-relaxed line-clamp-3">
                {{ noticiaActual.resumen }}
              </p>
            </div>

            <!-- Pie: enlace + controles -->
            <div class="flex items-center justify-between gap-4 pt-2
                        border-t border-bpa-200 dark:border-bpa-amber-800">

              <!-- "Leer artículo completo" -->
              <a v-if="noticiaActual.slug" :href="`/actualidad/${noticiaActual.slug}`"
                class="inline-flex items-center gap-1.5 text-sm font-medium flex-shrink-0
                       text-primary dark:text-primary
                       hover:text-secondary dark:hover:text-secondary transition-colors">
                Leer artículo completo
                <!-- tabler:arrow-right -->
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="w-3.5 h-3.5">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>
                </svg>
              </a>
              <span v-else class="flex-1"></span>

              <!-- Controles (solo si hay más de 1 noticia) -->
              <div v-if="total > 1" class="flex items-center gap-2 flex-shrink-0">

                <!-- Anterior -->
                <button @click="anterior" aria-label="Noticia anterior"
                  class="flex items-center justify-center w-8 h-8 rounded-full transition-colors
                         border border-bpa-200 dark:border-bpa-amber-800
                         bg-white dark:bg-bpa-950/60 text-muted
                         hover:border-primary hover:text-primary dark:hover:text-primary">
                  <!-- tabler:chevron-left -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="w-4 h-4">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M15 6l-6 6l6 6"/>
                  </svg>
                </button>

                <!-- Puntos indicadores -->
                <div class="flex gap-1.5">
                  <button
                    v-for="(_, idx) in noticias" :key="idx"
                    @click="irA(idx)"
                    :aria-label="`Ir a la noticia ${idx + 1}`"
                    :class="[
                      'h-2 rounded-full transition-all duration-300',
                      idx === indice
                        ? 'w-4 bg-primary dark:bg-bpa-amber-400'
                        : 'w-2 bg-bpa-200 dark:bg-bpa-amber-800 hover:bg-primary dark:hover:bg-bpa-amber-400',
                    ]"
                  />
                </div>

                <!-- Siguiente -->
                <button @click="siguiente" aria-label="Siguiente noticia"
                  class="flex items-center justify-center w-8 h-8 rounded-full transition-colors
                         border border-bpa-200 dark:border-bpa-amber-800
                         bg-white dark:bg-bpa-950/60 text-muted
                         hover:border-primary hover:text-primary dark:hover:text-primary">
                  <!-- tabler:chevron-right -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="w-4 h-4">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M9 6l6 6l-6 6"/>
                  </svg>
                </button>

              </div>
            </div>
          </div>

        </div>
      </Transition>
    </div>

  </div>
</template>
