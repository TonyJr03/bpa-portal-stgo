<script setup lang="ts">
/**
 * @componente  src/components/vue/CalendarioEventos.vue
 * @directiva   client:load  (inyectado desde Herramienta.astro)
 *
 * @descripcion
 *   Calendario mensual completo con eventos del BPA.
 *
 * @i18n — tres capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · eventos.titulo / titulo_en     → título del evento
 *      · eventos.descripcion / descripcion_en → descripción del evento
 *      Ambos se resuelven con tf(base, translated).
 *
 *   2. Textos semánticos institucionales → t() desde es.ts / en.ts:
 *      · Labels de tipos de evento (pago_jubilados, feriado, aviso)
 *
 *   3. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Nombres de meses y días de la semana
 *      · Estados de carga/error/vacío
 *      · Botones del calendario
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por Herramienta.astro
 *
 * @coleccion  eventos
 *   titulo       Text   → título del evento en español
 *   titulo_en    Text   → título del evento en inglés (puede estar vacío)
 *   fecha        Date   → fecha del evento (YYYY-MM-DD)
 *   tipo         Select → pago_jubilados | feriado | aviso  (se traduce en el código)
 *   descripcion  Text   → descripción breve en español
 *   descripcion_en Text → descripción breve en inglés (puede estar vacío)
 *   publicado    Bool   → true si debe mostrarse
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

import es from '~/i18n/es';
import en from '~/i18n/en';

import type { Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción desde el diccionario (tipos de evento — contenido institucional) ─
const dict = computed(() => (props.lang === 'en' ? en : es));
const t    = (key: keyof typeof es) => dict.value[key] ?? key;

// ── Traducción de campos de PocketBase ───────────────────────────────────────
// tf() aplica el campo _en si el idioma es inglés y no está vacío.
// Fallback al español en cualquier otro caso.
function tf(base: string, translated?: string | null): string {
  if (props.lang === 'es' || !translated?.trim()) return base;
  return translated.trim();
}

// ── Strings de interfaz pura del calendario (NO van a los archivos .ts) ───────
// IMPORTANTE: computed() es necesario porque depende de props.lang (reactivo).
// Sin computed(), cambiar el idioma NO actualizaría la UI.
const UILocal = computed(() => props.lang === 'en'
  ? {
      months: ['January','February','March','April','May','June',
               'July','August','September','October','November','December'],
      days:          ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      today:         'Today',
      loading:       'Loading event calendar…',
      retry:         'Retry',
      errorTitle:    'Could not connect to server',
      errorMsg:      'The event calendar is not available.',
      emptyTitle:    'No events published',
      emptyMsg:      'Add records in the',
      emptyCol:      'eventos',
      emptyPost:     'collection with publicado = true.',
      eventsDay:     'Events for the day',
      close:         'Close',
    }
  : {
      months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
      days:          ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
      today:         'Hoy',
      loading:       'Cargando calendario de eventos…',
      retry:         'Reintentar',
      errorTitle:    'No se pudo conectar con el servidor',
      errorMsg:      'El calendario de eventos no está disponible.',
      emptyTitle:    'Sin eventos publicados',
      emptyMsg:      'Añada registros en la colección',
      emptyCol:      'eventos',
      emptyPost:     'de PocketBase con publicado = true.',
      eventsDay:     'Eventos del día',
      close:         'Cerrar',
    }
);
const tUI = (key: keyof (typeof UILocal.value)) => UILocal.value[key];

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Evento {
  id:            string;
  titulo:        string;
  titulo_en:     string; // campo _en de PocketBase
  fecha:         string;
  tipo:          'pago_jubilados' | 'feriado' | 'aviso';
  descripcion:   string;
  descripcion_en:string; // campo _en de PocketBase
  publicado:     boolean;
}

interface DiaCalendario {
  numero:   number;
  esDelMes: boolean;
  esHoy:    boolean;
  fecha:    Date;
  eventos:  Evento[];
}

// ── Estado ────────────────────────────────────────────────────────────────────
const todosLosEventos = ref<Evento[]>([]);
const cargando        = ref(true);
const errorDB         = ref(false);

const hoy        = new Date();
const mesActual  = ref(hoy.getMonth());
const anioActual = ref(hoy.getFullYear());

// ── Configuración visual por tipo ─────────────────────────────────────────────
// Los labels vienen del diccionario (contenido institucional compartido
// con CalendarioMiniWidget). Los colores son constantes de diseño.
const CONFIG_TIPO = computed(() => ({
  pago_jubilados: {
    label:    t('calendar.type.pension'),
    dot:      'bg-amber-500',
    badge:    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    fondo:    'bg-amber-50 dark:bg-amber-950/40',
    anillo:   'ring-1 ring-amber-300 dark:ring-amber-700',
    borde:    'border-amber-300 dark:border-amber-700',
    numColor: 'text-amber-700 dark:text-amber-300 font-bold',
  },
  feriado: {
    label:    t('calendar.type.holiday'),
    dot:      'bg-blue-500',
    badge:    'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
    fondo:    'bg-blue-50 dark:bg-blue-950/40',
    anillo:   'ring-1 ring-blue-300 dark:ring-blue-700',
    borde:    'border-blue-300 dark:border-blue-700',
    numColor: 'text-blue-700 dark:text-blue-300 font-bold',
  },
  aviso: {
    label:    t('calendar.type.notice'),
    dot:      'bg-red-500',
    badge:    'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300',
    fondo:    'bg-red-50 dark:bg-red-950/40',
    anillo:   'ring-1 ring-red-300 dark:ring-red-700',
    borde:    'border-red-300 dark:border-red-700',
    numColor: 'text-red-700 dark:text-red-300 font-bold',
  },
}));

// ── Computed ──────────────────────────────────────────────────────────────────
const tituloMes = computed(() => `${UILocal.value.months[mesActual.value]} ${anioActual.value}`);

const eventosMes = computed(() =>
  todosLosEventos.value.filter((ev) => {
    const d = new Date(ev.fecha);
    return d.getMonth() === mesActual.value && d.getFullYear() === anioActual.value;
  }),
);

const hayEventos = computed(() => todosLosEventos.value.length > 0);
const tiposEnMes = computed(() => [...new Set(eventosMes.value.map((e) => e.tipo))]);

const diasGrilla = computed<DiaCalendario[]>(() => {
  const dias: DiaCalendario[] = [];
  const primerDia    = new Date(anioActual.value, mesActual.value, 1);
  const ultimoDia    = new Date(anioActual.value, mesActual.value + 1, 0);
  const inicioSemana = (primerDia.getDay() + 6) % 7;

  const mesAnt     = new Date(anioActual.value, mesActual.value, 0);
  const diasMesAnt = mesAnt.getDate();
  for (let i = inicioSemana - 1; i >= 0; i--) {
    const num   = diasMesAnt - i;
    const fecha = new Date(anioActual.value, mesActual.value - 1, num);
    dias.push({ numero: num, esDelMes: false, esHoy: false, fecha, eventos: [] });
  }

  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const fecha   = new Date(anioActual.value, mesActual.value, d);
    const esHoy   = fecha.toDateString() === hoy.toDateString();
    const eventos = eventosMes.value.filter((ev) => new Date(ev.fecha).getDate() === d);
    dias.push({ numero: d, esDelMes: true, esHoy, fecha, eventos });
  }

  const restantes = dias.length % 7 === 0 ? 0 : 7 - (dias.length % 7);
  for (let d = 1; d <= restantes; d++) {
    const fecha = new Date(anioActual.value, mesActual.value + 1, d);
    dias.push({ numero: d, esDelMes: false, esHoy: false, fecha, eventos: [] });
  }

  return dias;
});

// ── Navegación temporal ───────────────────────────────────────────────────────
function mesAnterior() {
  if (mesActual.value === 0) { mesActual.value = 11; anioActual.value--; }
  else mesActual.value--;
}

function mesSiguiente() {
  if (mesActual.value === 11) { mesActual.value = 0; anioActual.value++; }
  else mesActual.value++;
}

function irAHoy() {
  mesActual.value  = hoy.getMonth();
  anioActual.value = hoy.getFullYear();
}

// ── Utilidades de presentación ────────────────────────────────────────────────
// La etiqueta abreviada del evento para la celda del calendario usa el título
// traducido (tf()) y toma solo las palabras clave tras el separador "—" / "-"
function etiquetaEvento(evento: Evento): string {
  const titulo = tf(evento.titulo, evento.titulo_en);
  const sep = titulo.includes(' — ') ? ' — ' : titulo.includes(' - ') ? ' - ' : null;
  if (sep) return titulo.split(sep)[1]?.trim() ?? titulo;
  return titulo.split(/\s+/).slice(0, 2).join(' ');
}

const PRIORIDAD_BOTTOM: Record<string, number> = { aviso: 1, feriado: 2, pago_jubilados: 3 };

function eventoBottom(dia: DiaCalendario): Evento | null {
  if (!dia.esDelMes || dia.eventos.length === 0) return null;
  return [...dia.eventos].sort(
    (a, b) => (PRIORIDAD_BOTTOM[b.tipo] ?? 0) - (PRIORIDAD_BOTTOM[a.tipo] ?? 0),
  )[0];
}

function eventoTop(dia: DiaCalendario): Evento | null {
  if (dia.eventos.length < 2) return null;
  const bottom = eventoBottom(dia);
  return dia.eventos.find((e) => e !== bottom) ?? null;
}

function tieneCoexistencia(dia: DiaCalendario): boolean {
  if (!dia.esDelMes || dia.eventos.length < 2) return false;
  return new Set(dia.eventos.map((e) => e.tipo)).size > 1;
}

// ── Panel de detalle ──────────────────────────────────────────────────────────
const diaSeleccionado = ref<DiaCalendario | null>(null);

function seleccionarDia(dia: DiaCalendario) {
  if (dia.esDelMes && dia.eventos.length > 0) diaSeleccionado.value = dia;
}

function cerrarDetalle() { diaSeleccionado.value = null; }

const fechaDetalle = computed(() => {
  if (!diaSeleccionado.value) return '';
  return diaSeleccionado.value.fecha.toLocaleDateString(
    props.lang === 'en' ? 'en-US' : 'es-CU',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarEventos() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    // Se solicitan todos los campos incluidos titulo_en y descripcion_en
    const registros = await pb.collection('eventos').getFullList<Evento>({
      filter: 'publicado = true',
      sort:   'fecha',
    });
    todosLosEventos.value = registros;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarEventos);
</script>

<template>
  <div class="w-full">

    <!-- ── ESTADO: Cargando ──────────────────────────────────────────────── -->
    <div v-if="cargando" class="flex flex-col items-center justify-center gap-4 py-20 text-muted">
      <!-- tabler:loader-2 -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 animate-spin text-primary">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm font-medium">{{ tUI('loading') }}</p>
    </div>

    <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
    <div v-else-if="errorDB" class="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-8 text-center">
      <!-- tabler:alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 mx-auto mb-3 text-red-500">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-red-700 dark:text-red-400 mb-1">{{ tUI('errorTitle') }}</p>
      <p class="text-sm text-red-600 dark:text-red-500 mb-4">{{ tUI('errorMsg') }}</p>
      <button @click="cargarEventos" class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors">
        <!-- tabler:refresh -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
        {{ tUI('retry') }}
      </button>
    </div>

    <!-- ── ESTADO: Sin eventos publicados ───────────────────────────────── -->
    <div v-else-if="!hayEventos" class="rounded-xl border border-bpa-100 dark:border-bpa-800 bg-bpa-50 dark:bg-bpa-950/60 p-10 text-center">
      <!-- tabler:calendar-off -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 mx-auto mb-3 text-muted opacity-40">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /><path d="M3 3l18 18" />
      </svg>
      <p class="font-semibold text-default dark:text-default mb-1">{{ tUI('emptyTitle') }}</p>
      <p class="text-sm text-muted">
        {{ tUI('emptyMsg') }}
        <code class="font-mono text-xs bg-bpa-100 dark:bg-bpa-800/40 px-1 rounded">{{ tUI('emptyCol') }}</code>
        {{ tUI('emptyPost') }}
      </p>
    </div>

    <!-- ── ESTADO: Calendario ───────────────────────────────────────────── -->
    <template v-else>

      <!-- Barra de navegación del mes -->
      <div class="flex items-center justify-between mb-4 gap-2">
        <button @click="mesAnterior" class="flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-default dark:hover:text-default hover:bg-bpa-50 dark:hover:bg-bpa-800/40 transition-colors">
          <!-- tabler:chevron-left -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 6l-6 6l6 6" /></svg>
        </button>

        <div class="flex items-center gap-3">
          <h2 class="text-base font-bold font-heading text-default dark:text-default capitalize">
            {{ tituloMes }}
          </h2>
          <button @click="irAHoy" class="text-xs font-semibold px-2.5 py-1 rounded-full bg-bpa-100 dark:bg-bpa-800/40 text-primary dark:text-primary hover:bg-bpa-200 dark:hover:bg-bpa-700/50 transition-colors">
            {{ tUI('today') }}
          </button>
        </div>

        <button @click="mesSiguiente" class="flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-default dark:hover:text-default hover:bg-bpa-50 dark:hover:bg-bpa-800/40 transition-colors">
          <!-- tabler:chevron-right -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6l6 6l-6 6" /></svg>
        </button>
      </div>

      <!-- Grilla del calendario -->
      <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden shadow-sm">

        <!-- Encabezados de días de la semana -->
        <div class="grid grid-cols-7 bg-primary border-b border-bpa-200 dark:border-bpa-amber-800">
            <div v-for="dia in UILocal.days" :key="dia" class="py-2.5 text-center text-xs font-semibold text-white uppercase tracking-wide">
            {{ dia }}
          </div>
        </div>

        <!-- Celdas de días -->
        <div class="grid grid-cols-7 bg-white dark:bg-bpa-950/40">
          <div v-for="(dia, idx) in diasGrilla" :key="idx"
            class="relative min-h-[4rem] p-1.5 border-b border-r border-bpa-200/50 dark:border-bpa-amber-800/30 transition-colors overflow-hidden"
            :class="[
              !tieneCoexistencia(dia) && dia.esDelMes && eventoBottom(dia)
                ? [CONFIG_TIPO[eventoBottom(dia)!.tipo]?.fondo, CONFIG_TIPO[eventoBottom(dia)!.tipo]?.anillo] : '',
              !dia.esDelMes ? 'bg-bpa-50/40 dark:bg-bpa-950/60' : '',
              dia.esDelMes && dia.eventos.length > 0 ? 'cursor-pointer' : '',
            ]"
            @click="seleccionarDia(dia)">

            <!-- Fondos diagonales para coexistencia de tipos -->
            <template v-if="tieneCoexistencia(dia) && eventoTop(dia) && eventoBottom(dia)">
              <div class="absolute inset-0 pointer-events-none" :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.fondo" style="clip-path: polygon(0 0, 100% 0, 100% 100%)" />
              <div class="absolute inset-0 pointer-events-none" :class="CONFIG_TIPO[eventoBottom(dia)!.tipo]?.fondo" style="clip-path: polygon(0 0, 0 100%, 100% 100%)" />
              <div class="absolute inset-0 pointer-events-none border-t border-r" :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.borde" />
              <div class="absolute inset-0 pointer-events-none border-b border-l" :class="CONFIG_TIPO[eventoBottom(dia)!.tipo]?.borde" />
            </template>

            <!-- Punto del tipo superior en coexistencia -->
            <span v-if="tieneCoexistencia(dia) && eventoTop(dia)" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full z-10 pointer-events-none" :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.dot" />

            <!-- Número del día -->
            <span class="relative z-10 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm transition-colors"
              :class="[
                dia.esHoy ? 'bg-primary text-white font-bold'
                  : dia.esDelMes && eventoBottom(dia) ? CONFIG_TIPO[eventoBottom(dia)!.tipo]?.numColor
                  : dia.esDelMes ? 'text-default dark:text-default'
                  : 'text-muted opacity-50',
              ]">
              {{ dia.numero }}
            </span>

            <!-- Contenido del evento bottom -->
            <div v-if="dia.esDelMes && eventoBottom(dia)" class="absolute bottom-1.5 left-1.5 right-1.5 z-10">
              <div v-if="eventoBottom(dia)!.tipo === 'pago_jubilados'" class="flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" :class="CONFIG_TIPO.pago_jubilados.dot" />
                <!-- título del evento → tf() (campo PB traducible) -->
                <span class="text-[11px] font-bold leading-tight truncate" :class="CONFIG_TIPO.pago_jubilados.numColor">
                  {{ etiquetaEvento(eventoBottom(dia)!) }}
                </span>
              </div>
              <div v-else class="flex gap-0.5">
                <span v-for="ev in dia.eventos.slice(0, tieneCoexistencia(dia) ? 1 : 3)" :key="ev.id" class="inline-block w-2 h-2 rounded-full" :class="CONFIG_TIPO[ev.tipo]?.dot" />
              </div>
            </div>
          </div>
        </div>

        <!-- Panel de detalle del día seleccionado -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95">
          <div v-if="diaSeleccionado" class="absolute inset-0 z-40 flex items-center justify-center p-4" @click.self="cerrarDetalle">
            <div class="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-[2px]" @click="cerrarDetalle" />
            <div class="relative w-full max-w-sm rounded-2xl shadow-2xl border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden">

              <!-- Cabecera del panel -->
              <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-bpa-200 dark:border-bpa-amber-800">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-widest text-primary dark:text-primary mb-0.5">
                    {{ tUI('eventsDay') }}
                  </p>
                  <h3 class="font-bold text-default dark:text-default text-sm capitalize leading-tight">
                    {{ fechaDetalle }}
                  </h3>
                </div>
                <button @click="cerrarDetalle" :aria-label="UILocal.close"
                  class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-default dark:hover:text-default hover:bg-bpa-50 dark:hover:bg-bpa-800/40 transition-colors">
                  <!-- tabler:x -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
                </button>
              </div>

              <!-- Lista de eventos del día -->
              <div class="divide-y divide-bpa-200 dark:divide-bpa-amber-800">
                <div v-for="ev in diaSeleccionado.eventos" :key="ev.id" class="px-5 py-4">
                  <!-- label del tipo → t() (diccionario) -->
                  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-2" :class="CONFIG_TIPO[ev.tipo]?.badge">
                    <span class="inline-block w-1.5 h-1.5 rounded-full" :class="CONFIG_TIPO[ev.tipo]?.dot" />
                    {{ CONFIG_TIPO[ev.tipo]?.label }}
                  </span>
                  <!-- título → tf() (campo PB traducible) -->
                  <p class="font-semibold text-default dark:text-default leading-snug">
                    {{ tf(ev.titulo, ev.titulo_en) }}
                  </p>
                  <!-- descripción → tf() (campo PB traducible) -->
                  <p v-if="ev.descripcion || ev.descripcion_en" class="text-sm text-muted mt-1 leading-relaxed">
                    {{ tf(ev.descripcion, ev.descripcion_en) }}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </Transition>

      </div>

      <!-- Leyenda dinámica (solo tipos presentes en el mes) -->
      <div v-if="tiposEnMes.length > 0" class="mt-4 flex flex-wrap gap-3 justify-center">
        <span v-for="tipo in tiposEnMes" :key="tipo" class="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <span class="w-2.5 h-2.5 rounded-full" :class="CONFIG_TIPO[tipo]?.dot" />
          <!-- label del tipo → t() (diccionario) -->
          {{ CONFIG_TIPO[tipo]?.label }}
        </span>
      </div>

    </template>
  </div>
</template>
