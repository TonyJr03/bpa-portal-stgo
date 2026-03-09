<script setup lang="ts">
/**
 * @componente  src/components/vue/CalendarioEventos.vue
 * @directiva   client:load  (inyectado desde CalendarioWidget.astro)
 *
 * @responsabilidad
 *   Isla Vue que genera dinámicamente la cuadrícula mensual del calendario.
 *   Consulta la colección `eventos` de PocketBase al montarse y filtra
 *   localmente por mes/año — sin nuevas peticiones al navegar entre meses.
 *
 * @coleccion  eventos
 *   titulo      Text    → Ej: "Pago de Pensiones — Grupo I"
 *   fecha       Date    → Fecha del evento (YYYY-MM-DD)
 *   tipo        Select  → pago_jubilados | feriado | aviso
 *   descripcion Text    → Texto corto para el tooltip
 *   publicado   Bool    → true si debe mostrarse
 *
 * @estados
 *   cargando → spinner mientras llega la respuesta de PocketBase
 *   error    → PocketBase no responde (aviso con reintentar)
 *   vacío    → PocketBase responde OK pero sin eventos publicados
 *   datos    → grilla mensual con eventos resaltados
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Evento {
  id: string;
  titulo: string;
  fecha: string;       // ISO string "YYYY-MM-DD HH:mm:ss.sssZ"
  tipo: 'pago_jubilados' | 'feriado' | 'aviso';
  descripcion: string;
  publicado: boolean;
}

interface DiaCalendario {
  numero: number;        // 1-31
  esDelMes: boolean;     // false = relleno de mes anterior/siguiente
  esHoy: boolean;
  fecha: Date;
  eventos: Evento[];
  tooltipVisible: boolean;
}

// ── Estado principal ──────────────────────────────────────────────────────────
const todosLosEventos = ref<Evento[]>([]);
const cargando        = ref(true);
const errorDB         = ref(false);

// Mes y año actualmente en vista (inician en el mes actual)
const hoy        = new Date();
const mesActual  = ref(hoy.getMonth());      // 0-11
const anioActual = ref(hoy.getFullYear());

// ── Catálogos estáticos ───────────────────────────────────────────────────────
const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Configuración visual por tipo de evento
const CONFIG_TIPO = {
  pago_jubilados: {
    label:    'Pago a Jubilados',
    dot:      'bg-blue-500',
    badge:    'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
    celda:    'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-300 dark:ring-blue-700',
    numColor: 'text-blue-700 dark:text-blue-300 font-bold',
  },
  feriado: {
    label:    'Día Feriado',
    dot:      'bg-red-500',
    badge:    'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300',
    celda:    'bg-red-50 dark:bg-red-950/40 ring-1 ring-red-300 dark:ring-red-700',
    numColor: 'text-red-700 dark:text-red-300 font-bold',
  },
  aviso: {
    label:    'Aviso',
    dot:      'bg-amber-500',
    badge:    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    celda:    'bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-300 dark:ring-amber-700',
    numColor: 'text-amber-700 dark:text-amber-300 font-bold',
  },
} as const;

// ── Computed ──────────────────────────────────────────────────────────────────
/** Título del mes/año visible en la barra de navegación */
const tituloMes = computed(
  () => `${NOMBRES_MESES[mesActual.value]} ${anioActual.value}`
);

/** Eventos del mes/año actualmente en vista */
const eventosMes = computed(() =>
  todosLosEventos.value.filter((ev) => {
    const d = new Date(ev.fecha);
    return d.getMonth() === mesActual.value && d.getFullYear() === anioActual.value;
  })
);

/** Indica si hay al menos un evento en algún mes (para el estado vacío) */
const hayEventos = computed(() => todosLosEventos.value.length > 0);

/**
 * Genera los 35 o 42 "slots" de la grilla mensual.
 * La semana empieza en Lunes (ISO 8601), por eso el ajuste del día de inicio.
 */
const diasGrilla = computed<DiaCalendario[]>(() => {
  const dias: DiaCalendario[] = [];
  const primerDia    = new Date(anioActual.value, mesActual.value, 1);
  const ultimoDia    = new Date(anioActual.value, mesActual.value + 1, 0);

  // getDay() → 0=Dom, 1=Lun … convertir a 0=Lun..6=Dom
  const inicioSemana = (primerDia.getDay() + 6) % 7;

  // Relleno del mes anterior
  const mesAnterior     = new Date(anioActual.value, mesActual.value, 0);
  const diasMesAnterior = mesAnterior.getDate();
  for (let i = inicioSemana - 1; i >= 0; i--) {
    const num   = diasMesAnterior - i;
    const fecha = new Date(anioActual.value, mesActual.value - 1, num);
    dias.push({ numero: num, esDelMes: false, esHoy: false, fecha, eventos: [], tooltipVisible: false });
  }

  // Días del mes actual
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const fecha   = new Date(anioActual.value, mesActual.value, d);
    const esHoy   = fecha.toDateString() === hoy.toDateString();
    const eventos = eventosMes.value.filter((ev) => {
      const evFecha = new Date(ev.fecha);
      return evFecha.getDate() === d;
    });
    dias.push({ numero: d, esDelMes: true, esHoy, fecha, eventos, tooltipVisible: false });
  }

  // Relleno del mes siguiente para completar filas
  const restantes = dias.length % 7 === 0 ? 0 : 7 - (dias.length % 7);
  for (let d = 1; d <= restantes; d++) {
    const fecha = new Date(anioActual.value, mesActual.value + 1, d);
    dias.push({ numero: d, esDelMes: false, esHoy: false, fecha, eventos: [], tooltipVisible: false });
  }

  return dias;
});

/** Tipos de evento presentes en el mes visible (para la leyenda dinámica) */
const tiposEnMes = computed(() => {
  const tipos = new Set(eventosMes.value.map((e) => e.tipo));
  return Array.from(tipos);
});

// ── Navegación temporal ───────────────────────────────────────────────────────
function mesAnterior() {
  if (mesActual.value === 0) {
    mesActual.value = 11;
    anioActual.value--;
  } else {
    mesActual.value--;
  }
}

function mesSiguiente() {
  if (mesActual.value === 11) {
    mesActual.value = 0;
    anioActual.value++;
  } else {
    mesActual.value++;
  }
}

function irAHoy() {
  mesActual.value  = hoy.getMonth();
  anioActual.value = hoy.getFullYear();
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function mostrarTooltip(dia: DiaCalendario) {
  if (dia.eventos.length > 0) dia.tooltipVisible = true;
}

function ocultarTooltip(dia: DiaCalendario) {
  dia.tooltipVisible = false;
}

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarEventos() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const registros = await pb
      .collection('eventos')
      .getFullList<Evento>({
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
    <div v-if="cargando"
      class="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
      <!-- tabler:loader-2 -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 animate-spin text-blue-600">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm font-medium">Cargando calendario de eventos…</p>
    </div>

    <!-- ── ESTADO: Error de conexión ────────────────────────────────────── -->
    <div v-else-if="errorDB"
      class="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-8 text-center">
      <!-- tabler:alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 mx-auto mb-3 text-red-500">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-red-700 dark:text-red-400 mb-1">
        No se pudo conectar con el servidor
      </p>
      <p class="text-sm text-red-600 dark:text-red-500 mb-4">
        El calendario de eventos no está disponible en este momento.
      </p>
      <button
        @click="cargarEventos"
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

    <!-- ── Calendario (siempre visible si no hay carga ni error) ───────── -->
    <div v-else class="space-y-4">

      <!-- Barra de navegación temporal ────────────────────────────────────── -->
      <div class="flex items-center justify-between gap-2 rounded-xl bg-blue-700 dark:bg-blue-900 px-5 py-3">

        <!-- Botón mes anterior -->
        <button
          @click="mesAnterior"
          aria-label="Mes anterior"
          class="flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-blue-600 dark:hover:bg-blue-800 transition-colors"
        >
          <!-- tabler:chevron-left -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-5 h-5">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M15 6l-6 6l6 6" />
          </svg>
        </button>

        <!-- Título mes/año + botón Hoy -->
        <div class="flex items-center gap-3">
          <h2 class="text-white font-bold text-lg tracking-wide min-w-[14rem] text-center">
            {{ tituloMes }}
          </h2>
          <button
            @click="irAHoy"
            class="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            <!-- tabler:calendar-event -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-3.5 h-3.5">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
              <path d="M16 3l0 4" />
              <path d="M8 3l0 4" />
              <path d="M4 11l16 0" />
              <path d="M8 15h2v2h-2l0 -2" />
            </svg>
            Hoy
          </button>
        </div>

        <!-- Botón mes siguiente -->
        <button
          @click="mesSiguiente"
          aria-label="Mes siguiente"
          class="flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-blue-600 dark:hover:bg-blue-800 transition-colors"
        >
          <!-- tabler:chevron-right -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-5 h-5">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M9 6l6 6l-6 6" />
          </svg>
        </button>
      </div>

      <!-- Grilla del calendario ───────────────────────────────────────────── -->
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">

        <!-- Encabezados de días de la semana -->
        <div class="grid grid-cols-7 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div
            v-for="dia in DIAS_SEMANA"
            :key="dia"
            class="py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
          >
            {{ dia }}
          </div>
        </div>

        <!-- Celdas de días -->
        <div class="grid grid-cols-7 bg-white dark:bg-slate-800/50">
          <div
            v-for="(dia, idx) in diasGrilla"
            :key="idx"
            class="relative min-h-[3.5rem] p-1.5 border-b border-r border-slate-100 dark:border-slate-700/50 transition-colors"
            :class="[
              dia.eventos.length > 0
                ? CONFIG_TIPO[dia.eventos[0].tipo]?.celda
                : '',
              !dia.esDelMes ? 'bg-slate-50/60 dark:bg-slate-900/20' : '',
            ]"
            @mouseenter="mostrarTooltip(dia)"
            @mouseleave="ocultarTooltip(dia)"
          >
            <!-- Número del día -->
            <span
              class="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm transition-colors"
              :class="[
                dia.esHoy
                  ? 'bg-blue-600 text-white font-bold'
                  : dia.eventos.length > 0
                    ? CONFIG_TIPO[dia.eventos[0].tipo]?.numColor
                    : dia.esDelMes
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-300 dark:text-slate-600',
              ]"
            >
              {{ dia.numero }}
            </span>

            <!-- Puntos indicadores de eventos -->
            <div v-if="dia.eventos.length > 0 && dia.esDelMes"
              class="flex flex-wrap gap-0.5 mt-0.5 px-0.5">
              <span
                v-for="ev in dia.eventos.slice(0, 3)"
                :key="ev.id"
                class="inline-block w-1.5 h-1.5 rounded-full"
                :class="CONFIG_TIPO[ev.tipo]?.dot"
              />
            </div>

            <!-- Tooltip con detalles del evento -->
            <Transition
              enter-active-class="transition-all duration-150 ease-out"
              enter-from-class="opacity-0 scale-95 -translate-y-1"
              enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition-all duration-100 ease-in"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-95 -translate-y-1"
            >
              <div
                v-if="dia.tooltipVisible && dia.eventos.length > 0"
                class="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs pointer-events-none"
              >
                <!-- Flecha del tooltip -->
                <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-slate-800" />

                <div class="p-3 space-y-2">
                  <div v-for="ev in dia.eventos" :key="ev.id">
                    <!-- Badge tipo -->
                    <span
                      class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold mb-1"
                      :class="CONFIG_TIPO[ev.tipo]?.badge"
                    >
                      {{ CONFIG_TIPO[ev.tipo]?.label }}
                    </span>
                    <p class="font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                      {{ ev.titulo }}
                    </p>
                    <p v-if="ev.descripcion"
                      class="text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {{ ev.descripcion }}
                    </p>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Leyenda de tipos (solo muestra los presentes en el mes) ─────────── -->
      <div class="flex flex-wrap gap-3 justify-center pt-1">
        <div
          v-for="tipo in tiposEnMes"
          :key="tipo"
          class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
        >
          <span
            class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            :class="CONFIG_TIPO[tipo]?.dot"
          />
          {{ CONFIG_TIPO[tipo]?.label }}
        </div>

        <!-- Leyenda de "Hoy" siempre visible -->
        <div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex-shrink-0">
            {{ hoy.getDate() }}
          </span>
          Hoy
        </div>
      </div>

      <!-- Avisos debajo del calendario ──────────────────────────────────── -->

      <!-- Caso A: hay eventos en el sistema pero ninguno en este mes -->
      <p
        v-if="hayEventos && eventosMes.length === 0"
        class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-2"
      >
        No hay eventos registrados para este mes.
      </p>

      <!-- Caso B: la colección está vacía — aviso para el administrador -->
      <div
        v-if="!hayEventos"
        class="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 mt-2"
      >
        <!-- tabler:alert-circle -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <div>
          <p class="font-semibold text-amber-700 dark:text-amber-400 text-sm">
            No hay eventos publicados
          </p>
          <p class="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
            Agregue registros en la colección
            <code class="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">eventos</code>
            de PocketBase con
            <code class="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">publicado = true</code>.
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
