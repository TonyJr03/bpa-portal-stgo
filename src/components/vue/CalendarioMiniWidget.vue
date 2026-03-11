<script setup lang="ts">
/**
 * @componente  src/components/vue/CalendarioMiniWidget.vue
 * @directiva   client:visible  (inyectado desde AccesoRapidoHome.astro)
 *
 * @responsabilidad
 *   Micro-widget para la tarjeta de Calendario en el Acceso Rápido del Home.
 *   Obtiene todos los eventos publicados de PocketBase y muestra únicamente
 *   el PRÓXIMO evento relevante (el más cercano a la fecha actual que no haya
 *   pasado aún), con su fecha, tipo y título.
 *   El detalle completo del calendario está en /herramientas/calendario.
 *
 * @coleccion  eventos
 *   titulo      Text    → Ej: "Pago de Pensiones — Grupo I"
 *   fecha       Date    → Fecha del evento (YYYY-MM-DD)
 *   tipo        Select  → 'pago_jubilados' | 'feriado' | 'aviso'
 *   descripcion Text    → Descripción breve
 *   publicado   Bool    → true si debe mostrarse
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Evento {
  id:          string;
  titulo:      string;
  fecha:       string;  // ISO string
  tipo:        'pago_jubilados' | 'feriado' | 'aviso';
  descripcion: string;
  publicado:   boolean;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const eventos  = ref<Evento[]>([]);
const cargando = ref(true);
const errorDB  = ref(false);

// ── Config visual por tipo ────────────────────────────────────────────────────
const CONFIG_TIPO = {
  pago_jubilados: {
    label:  'Pago a Jubilados',
    color:  'text-blue-600 dark:text-blue-400',
    badge:  'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    // tabler:pig-money
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-8 h-8">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M15 11v.01" />
      <path d="M5.173 8.378a3 3 0 1 1 4.656 -1.377" />
      <path d="M16 4v3.803a6.019 6.019 0 0 1 2.658 3.197h1.341a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-1.342c-.336 .95 -.907 1.8 -1.658 2.473v2.027a1.5 1.5 0 0 1 -3 0v-.583a6.04 6.04 0 0 1 -1 .083h-4a6.04 6.04 0 0 1 -1 -.083v.583a1.5 1.5 0 0 1 -3 0v-2l0 -.027a6 6 0 0 1 4 -10.473h2.5l4.5 -3z" />
    </svg>`,
  },
  feriado: {
    label:  'Día Feriado',
    color:  'text-red-600 dark:text-red-400',
    badge:  'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    // tabler:calendar-event
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-8 h-8">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" />
      <path d="M8 15h2v2h-2z" />
    </svg>`,
  },
  aviso: {
    label:  'Aviso Institucional',
    color:  'text-amber-600 dark:text-amber-400',
    badge:  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    // tabler:speakerphone
    icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-8 h-8">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M18 8a3 3 0 0 1 0 6" />
      <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5" />
      <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8" />
    </svg>`,
  },
} as const;

// ── Computed: próximo evento que no haya pasado ───────────────────────────────
const hoy = new Date();
hoy.setHours(0, 0, 0, 0);

/** Prioridad numérica por tipo: menor número = mayor prioridad */
const PRIORIDAD: Record<string, number> = {
  pago_jubilados: 0,
  aviso:          1,
};

const proximoEvento = computed<Evento | null>(() => {
  const futuros = eventos.value
    // Solo eventos publicados, desde hoy, excluyendo feriados
    .filter(e => e.publicado && new Date(e.fecha) >= hoy && e.tipo !== 'feriado')
    .sort((a, b) => {
      const diffFecha = new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      if (diffFecha !== 0) return diffFecha;
      // Misma fecha → gana el de mayor prioridad (menor número)
      return (PRIORIDAD[a.tipo] ?? 99) - (PRIORIDAD[b.tipo] ?? 99);
    });
  return futuros[0] ?? null;
});

/** Formatea fecha a texto natural: "Hoy", "Mañana", o "dd de mes" */
const formatearFecha = (isoStr: string): string => {
  try {
    const fecha = new Date(isoStr);
    fecha.setHours(0, 0, 0, 0);
    const diff = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    return new Intl.DateTimeFormat('es-CU', {
      day: 'numeric', month: 'long',
    }).format(fecha);
  } catch { return isoStr; }
};

/** Días restantes hasta el evento */
const diasRestantes = computed<number | null>(() => {
  if (!proximoEvento.value) return null;
  const fecha = new Date(proximoEvento.value.fecha);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
});

const configEvento = (tipo: Evento['tipo']) =>
  CONFIG_TIPO[tipo] ?? CONFIG_TIPO.aviso;

// ── Carga de datos ────────────────────────────────────────────────────────────
const cargarEventos = async () => {
  cargando.value = true;
  errorDB.value  = false;
  try {
    // Pedimos eventos desde hoy en adelante, máximo 20 para filtrar en cliente
    const resultado = await pb.collection('eventos').getFullList<Evento>({
      filter:    'publicado = true',
      sort:      'fecha',
      fields:    'id,titulo,fecha,tipo,descripcion,publicado',
    });
    eventos.value = resultado;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
};

onMounted(cargarEventos);
</script>

<template>
  <!-- ── Cargando ────────────────────────────────────────────────────────── -->
  <div v-if="cargando" class="flex flex-col items-center gap-3 animate-pulse py-2">
    <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
    <div class="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
    <div class="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded"></div>
    <div class="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded"></div>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────── -->
  <div v-else-if="errorDB" class="text-center py-2">
    <p class="text-xs text-red-500 dark:text-red-400 mb-1">Sin conexión</p>
    <button @click="cargarEventos" class="text-xs text-primary dark:text-blue-400 hover:underline">
      Reintentar
    </button>
  </div>

  <!-- ── Sin próximos eventos ───────────────────────────────────────────── -->
  <div v-else-if="!proximoEvento" class="text-center py-2">
    <!-- tabler:calendar-check -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-8 h-8 mx-auto mb-2 text-slate-400">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6" />
      <path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" />
      <path d="M15 19l2 2l4 -4" />
    </svg>
    <p class="text-xs text-slate-500 dark:text-slate-400">Sin eventos próximos</p>
  </div>

  <!-- ── Próximo evento ─────────────────────────────────────────────────── -->
  <div v-else class="text-center">
    <!-- Icono + Badge tipo en la misma línea -->
    <div class="flex items-center justify-center gap-2 mb-3">
      <span
        :class="['flex items-center justify-center w-8 h-8 shrink-0', configEvento(proximoEvento.tipo).color]"
        v-html="configEvento(proximoEvento.tipo).icono"
      ></span>
      <span
        :class="[
          'inline-block text-xs font-semibold px-2.5 py-1 rounded-full',
          configEvento(proximoEvento.tipo).badge,
        ]"
      >
        {{ configEvento(proximoEvento.tipo).label }}
      </span>
    </div>

    <!-- Fecha destacada -->
    <p
      :class="[
        'text-2xl font-extrabold mb-1',
        configEvento(proximoEvento.tipo).color,
      ]"
    >
      {{ formatearFecha(proximoEvento.fecha) }}
    </p>

    <!-- Cuenta regresiva -->
    <p v-if="diasRestantes !== null && diasRestantes > 1" class="text-xs text-slate-400 dark:text-slate-500 mb-2">
      en {{ diasRestantes }} días
    </p>

    <!-- Título del evento -->
    <p class="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">
      {{ proximoEvento.titulo }}
    </p>

    <!-- Descripción si existe -->
    <p
      v-if="proximoEvento.descripcion"
      class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2"
    >
      {{ proximoEvento.descripcion }}
    </p>
  </div>
</template>
