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
    fondo:    'bg-blue-50 dark:bg-blue-950/40',
    anillo:   'ring-1 ring-blue-300 dark:ring-blue-700',
    borde:    'border-blue-300 dark:border-blue-700',
    numColor: 'text-blue-700 dark:text-blue-300 font-bold',
  },
  feriado: {
    label:    'Día Feriado',
    dot:      'bg-red-500',
    badge:    'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300',
    fondo:    'bg-red-50 dark:bg-red-950/40',
    anillo:   'ring-1 ring-red-300 dark:ring-red-700',
    borde:    'border-red-300 dark:border-red-700',
    numColor: 'text-red-700 dark:text-red-300 font-bold',
  },
  aviso: {
    label:    'Aviso',
    dot:      'bg-amber-500',
    badge:    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    fondo:    'bg-amber-50 dark:bg-amber-950/40',
    anillo:   'ring-1 ring-amber-300 dark:ring-amber-700',
    borde:    'border-amber-300 dark:border-amber-700',
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
    dias.push({ numero: num, esDelMes: false, esHoy: false, fecha, eventos: [] });
  }

  // Días del mes actual
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const fecha   = new Date(anioActual.value, mesActual.value, d);
    const esHoy   = fecha.toDateString() === hoy.toDateString();
    const eventos = eventosMes.value.filter((ev) => {
      const evFecha = new Date(ev.fecha);
      return evFecha.getDate() === d;
    });
    dias.push({ numero: d, esDelMes: true, esHoy, fecha, eventos });
  }

  // Relleno del mes siguiente para completar filas
  const restantes = dias.length % 7 === 0 ? 0 : 7 - (dias.length % 7);
  for (let d = 1; d <= restantes; d++) {
    const fecha = new Date(anioActual.value, mesActual.value + 1, d);
    dias.push({ numero: d, esDelMes: false, esHoy: false, fecha, eventos: [] });
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

// ── Utilidades de presentación ───────────────────────────────────────────────
/**
 * Extrae la etiqueta corta para mostrar dentro de la celda del día.
 * Lógica:
 *   · Si el título contiene " — " o " - ", devuelve lo que hay después del guión.
 *     Ej: "Pago Jubilados — Grupo III" → "Grupo III"
 *         "Último día de pago — Cierre" → "Cierre"
 *   · Si no hay guión, devuelve las primeras 2 palabras del título.
 *     Ej: "Último día de pago" → "Último día"
 */
function etiquetaEvento(titulo: string): string {
  const sep = titulo.includes(' — ') ? ' — ' : titulo.includes(' - ') ? ' - ' : null;
  if (sep) return titulo.split(sep)[1]?.trim() ?? titulo;
  return titulo.split(/\s+/).slice(0, 2).join(' ');
}

/**
 * Prioridad para ocupar la mitad inferior de la celda en caso de coexistencia.
 * Mayor número → mitad inferior. Menor número → mitad superior.
 *   pago_jubilados (3) > feriado (2) > aviso (1)
 */
const PRIORIDAD_BOTTOM: Record<string, number> = {
  aviso: 1, feriado: 2, pago_jubilados: 3,
};

/** Evento que ocupa la mitad inferior (mayor prioridad). */
function eventoBottom(dia: DiaCalendario): Evento | null {
  if (!dia.esDelMes || dia.eventos.length === 0) return null;
  return [...dia.eventos].sort(
    (a, b) => (PRIORIDAD_BOTTOM[b.tipo] ?? 0) - (PRIORIDAD_BOTTOM[a.tipo] ?? 0)
  )[0];
}

/** Evento que ocupa la mitad superior (menor prioridad). Null si solo hay uno. */
function eventoTop(dia: DiaCalendario): Evento | null {
  if (dia.eventos.length < 2) return null;
  const bottom = eventoBottom(dia);
  return dia.eventos.find((e) => e !== bottom) ?? null;
}

/** True cuando el día tiene dos tipos distintos de evento y pertenece al mes visible. */
function tieneCoexistencia(dia: DiaCalendario): boolean {
  if (!dia.esDelMes || dia.eventos.length < 2) return false;
  return new Set(dia.eventos.map((e) => e.tipo)).size > 1;
}

// ── Panel de detalle del día ──────────────────────────────────────────────────
/** Día actualmente seleccionado. null = panel cerrado. */
const diaSeleccionado = ref<DiaCalendario | null>(null);

function seleccionarDia(dia: DiaCalendario) {
  if (dia.esDelMes && dia.eventos.length > 0) diaSeleccionado.value = dia;
}

function cerrarDetalle() {
  diaSeleccionado.value = null;
}

/** Fecha formateada para el título del panel. Ej: "Martes, 19 de marzo de 2026" */
const fechaDetalle = computed(() => {
  if (!diaSeleccionado.value) return '';
  return diaSeleccionado.value.fecha.toLocaleDateString('es-CU', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
});

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
            class="relative min-h-[4rem] p-1.5 border-b border-r border-slate-100 dark:border-slate-700/50 transition-colors overflow-hidden"
            :class="[
              /* Fondo sólido solo cuando NO hay coexistencia */
              !tieneCoexistencia(dia) && dia.esDelMes && eventoBottom(dia)
                ? [CONFIG_TIPO[eventoBottom(dia)!.tipo]?.fondo,
                  CONFIG_TIPO[eventoBottom(dia)!.tipo]?.anillo]
                : '',
              !dia.esDelMes ? 'bg-slate-50/60 dark:bg-slate-900/20' : '',
              dia.esDelMes && dia.eventos.length > 0 ? 'cursor-pointer' : '',
            ]"
            @click="seleccionarDia(dia)"
          >

            <!--
              ── Fondos diagonales (solo cuando hay dos tipos distintos) ────────
              Triángulo SUPERIOR (top-right): eventoTop → menor prioridad
              Triángulo INFERIOR (bottom-left): eventoBottom → mayor prioridad
              clip-path: diagonal desde esquina superior-izquierda a inferior-derecha
            -->
            <template v-if="tieneCoexistencia(dia) && eventoTop(dia) && eventoBottom(dia)">
              <!-- Triángulo superior-derecha -->
              <div
                class="absolute inset-0 pointer-events-none"
                :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.fondo"
                style="clip-path: polygon(0 0, 100% 0, 100% 100%)"
              />
              <!-- Triángulo inferior-izquierda -->
              <div
                class="absolute inset-0 pointer-events-none"
                :class="CONFIG_TIPO[eventoBottom(dia)!.tipo]?.fondo"
                style="clip-path: polygon(0 0, 0 100%, 100% 100%)"
              />
              <!--
                Bordes split: borde superior+derecho con color de eventoTop,
                borde inferior+izquierdo con color de eventoBottom.
                Cada div cubre todo el recuadro pero solo dibuja 2 lados.
              -->
              <div
                class="absolute inset-0 pointer-events-none border-t border-r"
                :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.borde"
              />
              <div
                class="absolute inset-0 pointer-events-none border-b border-l"
                :class="CONFIG_TIPO[eventoBottom(dia)!.tipo]?.borde"
              />
            </template>

            <!--
              ── Punto del tipo superior en esquina superior-derecha ─────────
              Solo visible cuando hay coexistencia. Marca la mitad de arriba.
            -->
            <span
              v-if="tieneCoexistencia(dia) && eventoTop(dia)"
              class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full z-10 pointer-events-none"
              :class="CONFIG_TIPO[eventoTop(dia)!.tipo]?.dot"
            />

            <!-- ── Número del día ────────────────────────────────────────────── -->
            <span
              class="relative z-10 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm transition-colors"
              :class="[
                dia.esHoy
                  ? 'bg-blue-600 text-white font-bold'
                  : dia.esDelMes && eventoBottom(dia)
                    ? CONFIG_TIPO[eventoBottom(dia)!.tipo]?.numColor
                    : dia.esDelMes
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-300 dark:text-slate-600',
              ]"
            >
              {{ dia.numero }}
            </span>

            <!--
              ── Contenido informativo del evento bottom ──────────────────────
              Anclado al fondo de la celda (absolute bottom) para quedar
              visualmente dentro del triángulo inferior.
              pago_jubilados → punto + etiqueta corta (Grupo III, Último día…)
              feriado / aviso → solo punto(s) de color
            -->
            <div
              v-if="dia.esDelMes && eventoBottom(dia)"
              class="absolute bottom-1.5 left-1.5 right-1.5 z-10"
            >
              <!-- pago_jubilados: • Etiqueta -->
              <div
                v-if="eventoBottom(dia)!.tipo === 'pago_jubilados'"
                class="flex items-center gap-1"
              >
                <span class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  :class="CONFIG_TIPO.pago_jubilados.dot" />
                <span
                  class="text-[11px] font-bold leading-tight truncate"
                  :class="CONFIG_TIPO.pago_jubilados.numColor"
                >
                  {{ etiquetaEvento(eventoBottom(dia)!.titulo) }}
                </span>
              </div>

              <!-- feriado / aviso: punto(s) -->
              <div v-else class="flex gap-0.5">
                <span
                  v-for="ev in dia.eventos.slice(0, tieneCoexistencia(dia) ? 1 : 3)"
                  :key="ev.id"
                  class="inline-block w-2 h-2 rounded-full"
                  :class="CONFIG_TIPO[ev.tipo]?.dot"
                />
              </div>
            </div>

          </div>
        </div>

        <!-- ── Panel de detalle del día ───────────────────────────────────────
          Se superpone sobre la grilla completa cuando hay un día seleccionado.
          El backdrop semitransparente permite ver el calendario de fondo.
          Clic en el backdrop también cierra el panel.
        ─────────────────────────────────────────────────────────────────────── -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="diaSeleccionado"
            class="absolute inset-0 z-40 flex items-center justify-center p-4"
            @click.self="cerrarDetalle"
          >
            <!-- Backdrop -->
            <div
              class="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-[2px]"
              @click="cerrarDetalle"
            />

            <!-- Tarjeta del panel -->
            <div class="relative w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">

              <!-- Cabecera: fecha + botón cerrar -->
              <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-0.5">
                    Eventos del día
                  </p>
                  <h3 class="font-bold text-slate-800 dark:text-slate-100 text-sm capitalize leading-tight">
                    {{ fechaDetalle }}
                  </h3>
                </div>
                <button
                  @click="cerrarDetalle"
                  aria-label="Cerrar"
                  class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <!-- tabler:x -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="w-4 h-4">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M18 6l-12 12" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- Lista de eventos del día -->
              <div class="divide-y divide-slate-100 dark:divide-slate-700">
                <div
                  v-for="ev in diaSeleccionado.eventos"
                  :key="ev.id"
                  class="px-5 py-4"
                >
                  <!-- Badge del tipo -->
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-2"
                    :class="CONFIG_TIPO[ev.tipo]?.badge"
                  >
                    <span class="inline-block w-1.5 h-1.5 rounded-full" :class="CONFIG_TIPO[ev.tipo]?.dot" />
                    {{ CONFIG_TIPO[ev.tipo]?.label }}
                  </span>
                  <!-- Título -->
                  <p class="font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                    {{ ev.titulo }}
                  </p>
                  <!-- Descripción -->
                  <p
                    v-if="ev.descripcion"
                    class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-1"
                  >
                    {{ ev.descripcion }}
                  </p>
                </div>
              </div>

              <!-- Pie con botón cerrar -->
              <div class="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                <button
                  @click="cerrarDetalle"
                  class="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition-colors"
                >
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        </Transition>

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
