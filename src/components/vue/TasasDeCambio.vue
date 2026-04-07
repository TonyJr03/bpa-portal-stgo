<script setup lang="ts">
/**
 * @componente  src/components/vue/TasasDeCambio.vue
 * @directiva   client:load  (inyectado desde Herramienta.astro)
 *
 * @descripcion
 *   Tabla de tasas de cambio oficiales del BPA con conversor rápido.
 *
 * @i18n — tres capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · monedas.nombre_moneda / nombre_moneda_en → nombre completo de la divisa
 *      Se resuelve con tf(base, translated) con fallback al español.
 *
 *   2. Textos semánticos institucionales → t() desde es.ts / en.ts:
 *      · Cabecera institucional de la tabla
 *      · Nota explicativa compra/venta
 *      · Disclaimer del conversor
 *
 *   3. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Labels de columnas, botones, estados de carga/error
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por Herramienta.astro
 *
 * @coleccion  monedas
 *   moneda           Text    → código ISO (USD, EUR, MLC…)
 *   nombre_moneda    Text    → nombre completo en español
 *   nombre_moneda_en Text    → nombre completo en inglés (puede estar vacío)
 *   compra           Number  → tasa de compra en CUP
 *   venta            Number  → tasa de venta en CUP
 *   activa           Bool
 *   orden            Number
 *   updated          Date    → campo automático (última modificación)
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, reactive, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';
import { useTranslations, useFieldTranslation, useLocalTranslations, type Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción ────────────────────────────────────────────────────────────────
const t  = useTranslations(props.lang);
const tf = useFieldTranslation(props.lang);

// ── Strings de interfaz pura (local — no van a los archivos .ts) ───────────────
const tl = useLocalTranslations(props.lang, {
  es: {
    colCurrency:     'Moneda',
    colName:         'Nombre',
    colBuy:          'Compra (CUP)',
    colSell:         'Venta (CUP)',
    labelUpdated:    'Última actualización:',
    btnRefresh:      'Actualizar',
    labelConverter:  'Conversor Rápido',
    labelAmount:     'Cantidad',
    labelCurrency:   'Moneda',
    labelDirection:  'Dirección',
    labelResult:     'Resultado aproximado',
    labelEmpty:      'Ingrese una cantidad y seleccione una moneda para ver el resultado',
    labelBuy:        'compra',
    labelSell:       'venta',
    labelCalculated: 'Calculado con la tasa de',
    labelRateOf:     'del',
    loading:         'Consultando tasas de cambio…',
    retry:           'Reintentar',
    errorTitle:      'No se pudo conectar con el servidor',
    errorMsg:        'El servicio de tasas de cambio no está disponible en este momento.',
    emptyTitle:      'No hay tasas publicadas',
    emptyMsg:        'Active registros en la colección',
    emptyCollection: 'monedas',
    emptyPost:       'de PocketBase para que aparezcan aquí.',
    noRates:         'No hay tasas disponibles',
    divisa:          'Divisa',
  },
  en: {
    colCurrency:     'Currency',
    colName:         'Name',
    colBuy:          'Buy (CUP)',
    colSell:         'Sell (CUP)',
    labelUpdated:    'Last updated:',
    btnRefresh:      'Refresh',
    labelConverter:  'Quick Converter',
    labelAmount:     'Amount',
    labelCurrency:   'Currency',
    labelDirection:  'Direction',
    labelResult:     'Approximate result',
    labelEmpty:      'Enter an amount and select a currency to see the result',
    labelBuy:        'buy',
    labelSell:       'sell',
    labelCalculated: 'Calculated using the',
    labelRateOf:     'rate of',
    loading:         'Loading exchange rates…',
    retry:           'Retry',
    errorTitle:      'Could not connect to server',
    errorMsg:        'Exchange rate service is not available at this time.',
    emptyTitle:      'No rates published',
    emptyMsg:        'Activate records in the',
    emptyCollection: 'monedas',
    emptyPost:       'collection in PocketBase.',
    noRates:         'No rates available',
    divisa:          'Currency',
  },
});

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TasaCambio {
  id:               string;
  moneda:           string;
  nombre_moneda:    string;
  nombre_moneda_en: string; // campo _en de PocketBase
  compra:           number;
  venta:            number;
  activa:           boolean;
  orden:            number;
  updated:          string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const tasas    = ref<TasaCambio[]>([]);
const cargando = ref(true);
const errorDB  = ref(false);

const conversor = reactive({
  monto:              '' as string | number,
  monedaSeleccionada: '',
  // 'a_cup'    → divisa → CUP (usa tasa compra)
  // 'desde_cup'→ CUP → divisa (usa tasa venta)
  direccion: 'a_cup' as 'a_cup' | 'desde_cup',
});

// ── Computed ──────────────────────────────────────────────────────────────────
const tasasActivas = computed(() => tasas.value.filter((t) => t.activa));

const ultimaActualizacion = computed(() => {
  if (!tasas.value.length) return null;
  const mas = tasas.value.reduce((prev, curr) =>
    new Date(curr.updated) > new Date(prev.updated) ? curr : prev,
  );
  return new Date(mas.updated);
});

const textoActualizacion = computed(() => {
  if (!ultimaActualizacion.value) return '';
  return ultimaActualizacion.value.toLocaleString(
    props.lang === 'en' ? 'en-US' : 'es-CU',
    { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
});

const tasaSeleccionada = computed(() =>
  tasasActivas.value.find((t) => t.moneda === conversor.monedaSeleccionada) ?? null,
);

const resultadoConversor = computed<string | null>(() => {
  const monto = parseFloat(String(conversor.monto));
  if (!monto || isNaN(monto) || monto <= 0 || !tasaSeleccionada.value) return null;
  if (conversor.direccion === 'a_cup') {
    return `${formatCup(monto * tasaSeleccionada.value.compra)} CUP`;
  }
  const tasaVenta = tasaSeleccionada.value.venta;
  if (tasaVenta <= 0) return null;
  return `${(monto / tasaVenta).toFixed(2)} ${conversor.monedaSeleccionada}`;
});

// La etiqueta de la dirección usa el código de moneda (no traducible) o "CUP"
const etiquetaTiene = computed(() => {
  if (!conversor.monedaSeleccionada) return tl('divisa');
  return conversor.direccion === 'a_cup' ? conversor.monedaSeleccionada : 'CUP';
});

const etiquetaRecibe = computed(() => {
  if (!conversor.monedaSeleccionada) return tl('divisa');
  return conversor.direccion === 'a_cup' ? 'CUP' : conversor.monedaSeleccionada;
});

// ── Utilidades ────────────────────────────────────────────────────────────────
function parsear(v: string | number): number {
  const n = parseFloat(String(v));
  return isNaN(n) || n < 0 ? 0 : n;
}

function ajustar(
  obj: Record<string, string | number>,
  key: string,
  delta: number,
  min: number,
) {
  obj[key] = Math.max(min, Math.round((parsear(obj[key]) + delta) * 100) / 100);
}

function formatCup(valor: number): string {
  return valor.toLocaleString(props.lang === 'en' ? 'en-US' : 'es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function intercambiarDireccion() {
  conversor.direccion = conversor.direccion === 'a_cup' ? 'desde_cup' : 'a_cup';
}

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarTasas() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    // Se solicitan todos los campos incluidos los _en
    const registros = await pb.collection('monedas').getFullList<TasaCambio>({ sort: 'orden' });
    tasas.value = registros;
    const primera = registros.find((t) => t.activa);
    if (primera) conversor.monedaSeleccionada = primera.moneda;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarTasas);
</script>

<template>
  <div class="w-full">

    <!-- ── ESTADO: Cargando ──────────────────────────────────────────────── -->
    <div v-if="cargando" class="flex flex-col items-center justify-center gap-4 py-20 text-muted">
      <!-- tabler:loader-2 -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 animate-spin text-primary">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm font-medium">{{ tl('loading') }}</p>
    </div>

    <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
    <div v-else-if="errorDB" class="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-8 text-center">
      <!-- tabler:alert-triangle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 mx-auto mb-3 text-red-500">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" /><path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-red-700 dark:text-red-400 mb-1">{{ tl('errorTitle') }}</p>
      <p class="text-sm text-red-600 dark:text-red-500 mb-4">{{ tl('errorMsg') }}</p>
      <button @click="cargarTasas" class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors">
        <!-- tabler:refresh -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
        {{ tl('retry') }}
      </button>
    </div>

    <!-- ── ESTADO: Sin tasas activas ────────────────────────────────────── -->
    <div v-else-if="!tasasActivas.length" class="rounded-xl border border-bpa-100 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-950/60 p-8 text-center">
      <!-- tabler:database-off -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 mx-auto mb-3 text-primary opacity-60">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12.983 8.978c3.955-.182 7.017-1.446 7.017-2.978c0-1.657-3.582-3-8-3c-1.661 0-3.204.19-4.483.515m-2.766 1.246A2.53 2.53 0 0 0 4 6c0 1.22 1.944 2.271 4.734 2.74" /><path d="M4 6v6c0 1.657 3.582 3 8 3c.986 0 1.93-.067 2.802-.19m3.187-.82C19.24 13.46 20 12.762 20 12V6" /><path d="M4 12v6c0 1.657 3.582 3 8 3c3.217 0 5.991-.712 7.261-1.74M20 16v-4M3 3l18 18" />
      </svg>
      <p class="font-semibold text-default dark:text-default mb-1">{{ tl('emptyTitle') }}</p>
      <p class="text-sm text-muted">
        {{ tl('emptyMsg') }}
        <code class="font-mono text-xs bg-bpa-100 dark:bg-bpa-amber-800/40 px-1 rounded">{{ tl('emptyCollection') }}</code>
        {{ tl('emptyPost') }}
      </p>
    </div>

    <!-- ── ESTADO: Datos disponibles ────────────────────────────────────── -->
    <div v-else class="space-y-8">

      <!-- Tabla de tasas -->
      <div class="overflow-hidden rounded-xl border border-bpa-200 dark:border-bpa-amber-800 shadow-sm">

        <!-- Cabecera institucional (semántica → diccionario) -->
        <div class="bg-primary px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-2 text-white">
            <!-- tabler:exchange -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0" /><path d="M19 8v5a5 5 0 0 1-5 5h-3l3-3m0 6l-3-3m-6-2v-5a5 5 0 0 1 5-5h3l-3-3m0 6l3-3" /></svg>
            <span class="font-semibold text-sm">{{ t('rates.table.title') }}</span>
          </div>
          <span class="text-white/70 text-xs font-medium hidden sm:block">CUP</span>
        </div>

        <!-- Tabla responsive -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-bpa-50 dark:bg-bpa-950/80 border-b border-bpa-200 dark:border-bpa-amber-800">
                <th class="text-left px-6 py-3 font-semibold text-default dark:text-default w-20">{{ tl('colCurrency') }}</th>
                <th class="text-left px-6 py-3 font-semibold text-default dark:text-default hidden sm:table-cell">{{ tl('colName') }}</th>
                <th class="text-right px-6 py-3 font-semibold text-default dark:text-default">{{ tl('colBuy') }}</th>
                <th class="text-right px-6 py-3 font-semibold text-default dark:text-default">{{ tl('colSell') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-bpa-100 dark:divide-bpa-800/50">
              <tr v-for="tasa in tasasActivas" :key="tasa.id" class="hover:bg-bpa-50/50 dark:hover:bg-bpa-800/10 transition-colors">
                <td class="px-6 py-4">
                  <span class="inline-flex items-center justify-center rounded-md bg-bpa-100 dark:bg-bpa-800/40 text-bpa-800 dark:text-bpa-200 font-bold text-xs px-2.5 py-1 min-w-[3rem]">
                    {{ tasa.moneda }}
                  </span>
                </td>
                <!-- nombre_moneda / nombre_moneda_en → tf() (campo PB traducible) -->
                <td class="px-6 py-4 text-default dark:text-default hidden sm:table-cell">
                  {{ tf(tasa.nombre_moneda, tasa.nombre_moneda_en) }}
                </td>
                <!-- Compra: emerald — distinción financiera semántica universal -->
                <td class="px-6 py-4 text-right">
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400">{{ formatCup(tasa.compra) }}</span>
                </td>
                <!-- Venta: rose — distinción financiera semántica universal -->
                <td class="px-6 py-4 text-right">
                  <span class="font-semibold text-rose-700 dark:text-rose-400">{{ formatCup(tasa.venta) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pie: última actualización + botón refrescar -->
        <div class="px-6 py-3 bg-bpa-50 dark:bg-bpa-950/60 border-t border-bpa-200 dark:border-bpa-amber-800 flex items-center justify-between gap-4 flex-wrap">
          <p v-if="textoActualizacion" class="text-xs text-muted">{{ tl('labelUpdated') }} {{ textoActualizacion }}</p>
          <button @click="cargarTasas" class="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary dark:text-primary hover:text-primary-600 transition-colors">
            <!-- tabler:refresh -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
            {{ tl('btnRefresh') }}
          </button>
        </div>
      </div>

      <!-- Nota informativa (semántica → diccionario) -->
      <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-amber-950/30 px-5 py-4 text-sm text-default dark:text-default">
        <!-- tabler:info-circle -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-primary flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>
        {{ t('rates.table.note') }}
      </div>

      <!-- Conversor rápido -->
      <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden shadow-sm">

        <div class="bg-bpa-800 dark:bg-bpa-950 px-6 py-4 flex items-center gap-2 text-white border-b border-bpa-amber-800">
          <!-- tabler:arrows-exchange -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 10h14l-4 -4" /><path d="M17 14h-14l4 4" /></svg>
          <span class="font-semibold text-sm">{{ tl('labelConverter') }}</span>
        </div>

        <div class="p-6 bg-white dark:bg-bpa-950/60">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">

            <!-- Monto -->
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tl('labelAmount') }}</label>
              <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                <input v-model="conversor.monto" type="number" min="0" step="0.01" placeholder="0.00" class="flex-1 min-w-0 bg-transparent px-4 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                  <button type="button" @click="ajustar(conversor, 'monto', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default dark:hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(conversor, 'monto', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default dark:hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>

            <!-- Selector de moneda -->
            <!-- nombre_moneda / nombre_moneda_en → tf() en las opciones del select -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tl('labelCurrency') }}</label>
              <div class="relative">
                <select v-model="conversor.monedaSeleccionada" class="w-full appearance-none rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 text-default dark:text-default px-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition">
                  <option v-for="tasa in tasasActivas" :key="tasa.moneda" :value="tasa.moneda">
                    {{ tasa.moneda }} — {{ tf(tasa.nombre_moneda, tasa.nombre_moneda_en) }}
                  </option>
                </select>
                <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>
                </span>
              </div>
            </div>

            <!-- Botón intercambiar dirección -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tl('labelDirection') }}</label>
              <button @click="intercambiarDireccion" class="w-full flex items-center justify-center gap-2 rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-amber-950/60 hover:bg-bpa-100 dark:hover:bg-bpa-amber-800/30 text-default dark:text-default px-4 py-2.5 text-sm font-medium transition-colors">
                <!-- tabler:switch-horizontal -->
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16 3l4 4l-4 4" /><path d="M10 7l10 0" /><path d="M8 13l-4 4l4 4" /><path d="M4 17l9 0" /></svg>
                <span>{{ etiquetaTiene }} <span class="text-muted mx-1">→</span> {{ etiquetaRecibe }}</span>
              </button>
            </div>
          </div>

          <!-- Panel de resultado -->
          <div class="mt-5">
            <div v-if="resultadoConversor" class="rounded-xl bg-primary text-white px-6 py-5 text-center">
              <p class="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">{{ tl('labelResult') }}</p>
              <p class="text-3xl font-bold tracking-tight">{{ resultadoConversor }}</p>
              <p class="text-xs text-white/70 mt-2">
                {{ tl('labelCalculated') }}
                {{ conversor.direccion === 'a_cup' ? tl('labelBuy') : tl('labelSell') }}
                {{ tl('labelRateOf') }} {{ tasaSeleccionada?.moneda }}
                ({{ conversor.direccion === 'a_cup'
                  ? formatCup(tasaSeleccionada?.compra ?? 0)
                  : formatCup(tasaSeleccionada?.venta ?? 0) }} CUP)
              </p>
            </div>
            <div v-else class="rounded-xl border-2 border-dashed border-bpa-200 dark:border-bpa-amber-800 px-6 py-5 text-center text-muted text-sm">
              {{ tl('labelEmpty') }}
            </div>
          </div>

          <!-- Aviso legal del conversor (semántico → diccionario) -->
          <p class="mt-3 text-xs text-muted text-center">
            {{ t('rates.converter.disclaimer') }}
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.campo-numero input[type='number']::-webkit-outer-spin-button,
.campo-numero input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.campo-numero input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
