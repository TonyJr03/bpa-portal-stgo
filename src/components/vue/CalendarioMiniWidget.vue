<script setup lang="ts">
/**
 * @componente  src/components/vue/CalendarioMiniWidget.vue
 * @directiva   client:visible  (inyectado desde AccesoRapidoHome.astro)
 *
 * @descripcion
 *   Micro-widget del calendario para la tarjeta de Acceso Rápido del Home.
 *   Muestra el próximo evento relevante (pago o aviso) — excluye feriados.
 *
 * @i18n — tres capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · eventos.titulo      / titulo_en      → título del evento
 *      · eventos.descripcion / descripcion_en → descripción breve
 *      Ambos se resuelven con tf(base, translated).
 *
 *   2. Campos Select que se traducen en el código (no en PB):
 *      · eventos.tipo (pago_jubilados / feriado / aviso) → t('calendar.type.*')
 *      Compartido con CalendarioEventos.vue para coherencia.
 *
 *   3. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Cuenta regresiva ("mañana", "en X días", "hoy")
 *      · Estados de carga/error/vacío
 *
 * @nota-tecnica fechas
 *   PocketBase devuelve fechas con componente UTC. Se extrae solo YYYY-MM-DD
 *   para construir un Date local sin desfase horario (parsearFechaLocal).
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por AccesoRapidoHome.astro
 *
 * @coleccion  eventos
 *   titulo         Text   → título en español
 *   titulo_en      Text   → título en inglés (puede estar vacío)
 *   fecha          Date   → fecha del evento (YYYY-MM-DD)
 *   tipo           Select → 'pago_jubilados' | 'feriado' | 'aviso'
 *   descripcion    Text   → descripción breve en español
 *   descripcion_en Text   → descripción breve en inglés (puede estar vacío)
 *   publicado      Bool   → true si debe mostrarse
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';
import { useTranslations, useFieldTranslation, useLocalTranslations, type Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción ────────────────────────────────────────────────────────────────
const t = useTranslations(props.lang);
const tf = useFieldTranslation(props.lang);

// ── Strings de interfaz pura (local — no van a los archivos .ts) ───────────────
const tl = useLocalTranslations(props.lang, {
  es: {
    noPending: 'Sin eventos próximos',
    tomorrow: 'mañana',
    today: 'hoy',
    retry: 'Reintentar',
    errorMsg: 'No disponible. Sin conexión con el servidor.',
  },
  en: {
    noPending: 'No upcoming events',
    tomorrow: 'tomorrow',
    today: 'today',
    retry: 'Retry',
    errorMsg: 'Not available. No server connection.',
  },
});

const inDays = (n: number) => (props.lang === 'en' ? `in ${n} days` : `en ${n} días`);

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Evento {
  id: string;
  titulo: string;
  titulo_en: string; // campo _en de PocketBase
  fecha: string;
  tipo: 'pago_jubilados' | 'feriado' | 'aviso';
  descripcion: string;
  descripcion_en: string; // campo _en de PocketBase
  publicado: boolean;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const eventos = ref<Evento[]>([]);
const cargando = ref(true);
const errorDB = ref(false);

// ── Configuración visual por tipo ─────────────────────────────────────────────
// Los labels de tipo → t() desde el diccionario (compartido con CalendarioEventos).
// Los colores son constantes de diseño; no se traducen.
const CONFIG_TIPO = computed(() => ({
  pago_jubilados: {
    label: t('calendar.type.pension'),
    color: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
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
  aviso: {
    label: t('calendar.type.notice'),
    color: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
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
}));

// ── Lógica de fechas sin desfase UTC ──────────────────────────────────────────
function parsearFechaLocal(isoStr: string): Date {
  const soloFecha = isoStr.substring(0, 10);
  const [y, m, d] = soloFecha.split('-').map(Number);
  return new Date(y, m - 1, d); // medianoche hora local
}

function formatearFecha(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat(props.lang === 'en' ? 'en-US' : 'es-CU', {
      day: 'numeric',
      month: 'long',
    }).format(parsearFechaLocal(isoStr));
  } catch {
    return isoStr.substring(0, 10);
  }
}

function hoyLocal(): Date {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
}

// ── Computed: próximo evento que no haya pasado (excluye feriados) ────────────
const PRIORIDAD: Record<string, number> = { pago_jubilados: 0, aviso: 1 };

const proximoEvento = computed<Evento | null>(() => {
  const hoy = hoyLocal();
  const futuros = eventos.value
    .filter((e) => e.publicado && parsearFechaLocal(e.fecha) >= hoy && e.tipo !== 'feriado')
    .sort((a, b) => {
      const diffFecha = parsearFechaLocal(a.fecha).getTime() - parsearFechaLocal(b.fecha).getTime();
      if (diffFecha !== 0) return diffFecha;
      return (PRIORIDAD[a.tipo] ?? 99) - (PRIORIDAD[b.tipo] ?? 99);
    });
  return futuros[0] ?? null;
});

const diasRestantes = computed<number | null>(() => {
  if (!proximoEvento.value) return null;
  const hoy = hoyLocal();
  const eventoMs = parsearFechaLocal(proximoEvento.value.fecha).getTime();
  return Math.round((eventoMs - hoy.getTime()) / (1000 * 60 * 60 * 24));
});

function configEvento(tipo: Evento['tipo']) {
  // Fallback a 'aviso' si el tipo no tiene config explícita (ej: feriado no se muestra)
  return CONFIG_TIPO.value[tipo as keyof typeof CONFIG_TIPO.value] ?? CONFIG_TIPO.value.aviso;
}

// ── Carga de datos ────────────────────────────────────────────────────────────
const cargarEventos = async () => {
  cargando.value = true;
  errorDB.value = false;
  try {
    // Se solicitan todos los campos incluidos titulo_en y descripcion_en
    const resultado = await pb.collection('eventos').getFullList<Evento>({
      filter: 'publicado = true',
      sort: 'fecha',
      fields: 'id,titulo,titulo_en,fecha,tipo,descripcion,descripcion_en,publicado',
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
  <div v-if="cargando" class="flex flex-col items-center gap-3 py-4 animate-pulse">
    <div class="w-8 h-8 rounded-full bg-bpa-100 dark:bg-bpa-800/40" />
    <div class="h-3 w-24 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
    <div class="h-6 w-20 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
    <div class="h-3 w-32 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────── -->
  <div v-else-if="errorDB" class="text-center py-2">
    <p class="text-xs text-red-500 dark:text-red-400 mb-1">{{ tl('errorMsg') }}</p>
    <button @click="cargarEventos" class="text-xs text-primary dark:text-primary hover:underline">
      {{ tl('retry') }}
    </button>
  </div>

  <!-- ── Sin próximos eventos ───────────────────────────────────────────── -->
  <div v-else-if="!proximoEvento" class="text-center py-2">
    <!-- tabler:calendar-check -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-8 h-8 mx-auto mb-2 text-muted"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M4 11h16" />
      <path d="M15 19l2 2l4 -4" />
    </svg>
    <p class="text-xs text-muted">{{ tl('noPending') }}</p>
  </div>

  <!-- ── Próximo evento ─────────────────────────────────────────────────── -->
  <div v-else class="text-center">
    <!-- Ícono + Badge de tipo (label → diccionario) -->
    <div class="flex items-center justify-center gap-2 mb-3">
      <span
        :class="['flex items-center justify-center w-8 h-8 shrink-0', configEvento(proximoEvento.tipo).color]"
        v-html="configEvento(proximoEvento.tipo).icono"
      />
      <span
        :class="['inline-block text-xs font-semibold px-2.5 py-1 rounded-full', configEvento(proximoEvento.tipo).badge]"
      >
        {{ configEvento(proximoEvento.tipo).label }}
      </span>
    </div>

    <!-- Fecha destacada (Intl.DateTimeFormat → idioma del prop) -->
    <p :class="['text-2xl font-extrabold mb-1', configEvento(proximoEvento.tipo).color]">
      {{ formatearFecha(proximoEvento.fecha) }}
    </p>

    <!-- Cuenta regresiva (interfaz pura → objeto local) -->
    <p v-if="diasRestantes !== null && diasRestantes > 0" class="text-xs text-muted mb-2">
      {{ diasRestantes === 1 ? tl('tomorrow') : inDays(diasRestantes) }}
    </p>
    <p v-else-if="diasRestantes === 0" class="text-xs font-semibold text-muted mb-2">
      {{ tl('today') }}
    </p>

    <!-- Título del evento → tf() (campo PB traducible) -->
    <p class="text-sm font-semibold text-default dark:text-default leading-snug line-clamp-2">
      {{ tf(proximoEvento.titulo, proximoEvento.titulo_en) }}
    </p>

    <!-- Descripción del evento → tf() (campo PB traducible) -->
    <p v-if="proximoEvento.descripcion || proximoEvento.descripcion_en" class="text-xs text-muted mt-1 line-clamp-2">
      {{ tf(proximoEvento.descripcion, proximoEvento.descripcion_en) }}
    </p>
  </div>
</template>
