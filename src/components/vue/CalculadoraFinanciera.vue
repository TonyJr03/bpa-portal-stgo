<script setup lang="ts">
/**
 * @componente  src/components/vue/CalculadoraFinanciera.vue
 * @directiva   client:load  (inyectado desde Herramienta.astro)
 *
 * @descripcion
 *   Calculadora financiera con tres pestañas:
 *     A) Ahorro a la vista  — interés compuesto: M = P × (1 + r)ⁿ
 *     B) Depósito a plazo   — interés simple base 360 días
 *     C) Crédito            — sistema francés (cuota fija)
 *
 * @i18n — tres capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · monedas.nombre_moneda / nombre_moneda_en → nombre completo de la divisa
 *      Ambos se resuelven con tf(base, translated) que aplica el fallback al
 *      español si el campo _en está vacío.
 *
 *   2. Textos semánticos institucionales → t() desde es.ts / en.ts:
 *      · Notas explicativas de cada método de cálculo
 *      · Cabecera institucional de la tabla de tasas
 *      · Disclaimer legal al pie
 *
 *   3. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Labels de tabs, columnas, botones, estados de carga/error
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por Herramienta.astro
 *
 * @coleccion  tasas_intereses
 *   nombre        Text     → nombre del producto en español
 *   tipo          Select   → 'vista' | 'plazo_fijo'
 *   plazo_meses   Number   → 0 para vista; 6/12/18/24/30/36 para plazo fijo
 *   tasa          Number   → porcentaje anual
 *   moneda        Relation → monedas (expand: moneda, nombre_moneda, nombre_moneda_en)
 *   activa        Bool
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, reactive, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

import es from '~/i18n/es';
import en from '~/i18n/en';

import type { Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción desde el diccionario (textos semánticos institucionales) ───────
const dict = computed(() => (props.lang === 'en' ? en : es));
const t    = (key: keyof typeof es) => dict.value[key] ?? key;

// ── Traducción de campos de PocketBase ───────────────────────────────────────
// tf() aplica el campo _en si el idioma es inglés y el campo existe y no está vacío.
// En cualquier otro caso devuelve el campo base en español.
// Esta función se usa en cada lugar donde se muestra un campo de PB traducible.
function tf(base: string, translated?: string | null): string {
  if (props.lang === 'es' || !translated?.trim()) return base;
  return translated.trim();
}

// ── Strings de interfaz pura (NO van a los archivos .ts) ──────────────────────
// IMPORTANTE: computed() es necesario porque depende de props.lang (reactivo).
// Sin computed(), cambiar el idioma NO actualizaría la UI.
const UILocal = computed(() => props.lang === 'en'
  ? {
      tabSight:         'Sight Savings',
      tabTerm:          'Fixed Term',
      tabCredit:        'Loan',
      labelCurrency:    'Currency',
      labelCapital:     'Initial capital',
      labelTerm:        'Term (years)',
      labelDeposit:     'Capital to deposit',
      labelRate:        'Annual rate (%)',
      labelMonths:      'Term (months)',
      labelResult:      'Calculation result',
      labelInterest:    'Interest earned',
      labelTotal:       'Amount at maturity',
      labelTermResult:  'Interest at maturity',
      labelTermTotal:   'Capital + Interest',
      labelCreditResult:'Loan result',
      labelMonthly:     'Fixed monthly installment',
      labelPrincipal:   'Principal',
      labelInterests:   'Total interest',
      labelToPay:       'Total to pay',
      labelTable:       'Amortization schedule',
      labelQuotas:      'installments',
      labelShowAll:     '▼ View all {n} installments',
      labelShowLess:    '▲ View summary',
      colMonth:         'Month',
      colQuota:         'Installment',
      colInterest:      'Interest',
      colCapital:       'Principal',
      colBalance:       'Balance',
      btnSelectRange:   'Select date range',
      labelStart:       'Start date',
      labelEnd:         'Maturity date',
      btnApply:         'Apply',
      perYear:          'per year',
      loading:          'Loading interest rates…',
      retry:            'Retry',
      errorTitle:       'Could not load interest rates.',
      errorSub:         'Connection to server lost.',
      month:            'month',
      months:           'months',
    }
  : {
      tabSight:         'A la Vista',
      tabTerm:          'Plazo Fijo',
      tabCredit:        'Crédito',
      labelCurrency:    'Moneda',
      labelCapital:     'Capital inicial',
      labelTerm:        'Plazo (años)',
      labelDeposit:     'Capital a depositar',
      labelRate:        'Tasa anual (%)',
      labelMonths:      'Plazo (meses)',
      labelResult:      'Resultado del cálculo',
      labelInterest:    'Intereses ganados',
      labelTotal:       'Monto al vencimiento',
      labelTermResult:  'Intereses al vencimiento',
      labelTermTotal:   'Capital + Intereses',
      labelCreditResult:'Resultado del crédito',
      labelMonthly:     'Cuota mensual fija',
      labelPrincipal:   'Capital',
      labelInterests:   'Total intereses',
      labelToPay:       'Total a pagar',
      labelTable:       'Plan de amortización',
      labelQuotas:      'cuotas',
      labelShowAll:     '▼ Ver las {n} cuotas',
      labelShowLess:    '▲ Ver resumen',
      colMonth:         'Mes',
      colQuota:         'Cuota',
      colInterest:      'Interés',
      colCapital:       'Capital',
      colBalance:       'Saldo',
      btnSelectRange:   'Seleccionar rango de fechas',
      labelStart:       'Fecha de inicio',
      labelEnd:         'Fecha de vencimiento',
      btnApply:         'Aceptar',
      perYear:          'anual',
      loading:          'Cargando tasas de interés…',
      retry:            'Reintentar',
      errorTitle:       'No se pudieron cargar las tasas de interés.',
      errorSub:         'Se perdió la conexión con el servidor.',
      month:            'mes',
      months:           'meses',
    }
);
const tUI = (key: keyof (typeof UILocal.value)) => UILocal.value[key];

// ── Tipos ─────────────────────────────────────────────────────────────────────
type TabId = 'vista' | 'plazo' | 'credito';

interface MonedaRel {
  id:               string;
  moneda:           string;
  nombre_moneda:    string;
  nombre_moneda_en: string; // campo _en de PocketBase
}

interface TasaRecord {
  id:          string;
  nombre:      string;
  tipo:        'vista' | 'plazo_fijo';
  plazo_meses: number;
  tasa:        number;
  activa:      boolean;
  expand:      { moneda: MonedaRel };
}

interface FilaAmortizacion {
  mes:     number;
  cuota:   number;
  interes: number;
  capital: number;
  saldo:   number;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const tabActiva     = ref<TabId>('vista');
const cargando      = ref(true);
const errorDB       = ref(false);
const todasLasTasas = ref<TasaRecord[]>([]);

// ── Formularios ───────────────────────────────────────────────────────────────
const vistaForm = reactive({
  monto:      '' as string | number,
  plazoAnios: '' as string | number,
});
const vistaMoneda       = ref('');
const mostrarCalendario = ref(false);
const fechaInicio       = ref('');
const fechaFin          = ref('');
const inputFechaInicio  = ref<HTMLInputElement | null>(null);
const inputFechaFin     = ref<HTMLInputElement | null>(null);

const plazoForm = reactive({
  monto: '' as string | number,
  idx:   0,
});
const plazoMoneda = ref('');

const creditoForm = reactive({
  monto:      '' as string | number,
  tasaAnual:  '' as string | number,
  plazoMeses: '' as string | number,
});
const tablaCompleta = ref(false);

// ── Utilidades ────────────────────────────────────────────────────────────────
function fmtFecha(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmt(v: number): string {
  return v.toLocaleString(props.lang === 'en' ? 'en-US' : 'es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
  obj[key] = Math.max(min, Math.round((parsear(obj[key]) + delta) * 10000) / 10000);
}

// ── PASO 10: labelPlazo ───────────────────────────────────────────────────────
// Genera "6 meses" / "1 mes" desde plazo_meses, sin depender del campo nombre
function labelPlazo(meses: number): string {
  const unidad = meses === 1 ? tUI('month') : tUI('months');
  return `${meses} ${unidad}`;
}

// ── Derivados de monedas ──────────────────────────────────────────────────────
const vistaMonedasDisponibles = computed((): MonedaRel[] => {
  const seen = new Set<string>();
  return todasLasTasas.value
    .filter((t) => t.tipo === 'vista')
    .filter((t) => !seen.has(t.expand.moneda.moneda) && seen.add(t.expand.moneda.moneda))
    .map((t) => t.expand.moneda);
});

const plazoMonedasDisponibles = computed((): MonedaRel[] => {
  const seen = new Set<string>();
  return todasLasTasas.value
    .filter((t) => t.tipo === 'plazo_fijo')
    .filter((t) => !seen.has(t.expand.moneda.moneda) && seen.add(t.expand.moneda.moneda))
    .map((t) => t.expand.moneda);
});

const vistaTasaActual = computed((): TasaRecord | undefined =>
  todasLasTasas.value.find(
    (t) => t.tipo === 'vista' && t.expand.moneda.moneda === vistaMoneda.value,
  ),
);

const plazoTasasFiltradas = computed((): TasaRecord[] =>
  todasLasTasas.value
    .filter((t) => t.tipo === 'plazo_fijo' && t.expand.moneda.moneda === plazoMoneda.value)
    .sort((a, b) => a.plazo_meses - b.plazo_meses),
);

const clasesGridPlazo = computed(() => {
  const n = plazoTasasFiltradas.value.length;
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-2';
  return 'grid-cols-3';
});

// ── Encabezado del resultado Tab B ────────────────────────────────────────────
const labelTabBHeader = computed(() => {
  const tasa = plazoTasasFiltradas.value[plazoForm.idx];
  if (!tasa) return tUI('labelResult');
  return `${labelPlazo(tasa.plazo_meses)} — ${tasa.tasa}% ${tUI('perYear')} (${plazoMoneda.value})`;
});

// ── Calendario: calcular años desde rango de fechas ──────────────────────────
function aplicarRango() {
  if (!fechaInicio.value || !fechaFin.value) return;
  const msI = new Date(fechaInicio.value).getTime();
  const msF = new Date(fechaFin.value).getTime();
  if (msF <= msI) return;
  vistaForm.plazoAnios    = Math.round(((msF - msI) / (1000 * 60 * 60 * 24 * 365)) * 100) / 100;
  mostrarCalendario.value = false;
  fechaInicio.value = fechaFin.value = '';
}

// ── Resultados calculados ─────────────────────────────────────────────────────
const resultadoVista = computed(() => {
  if (!vistaTasaActual.value) return null;
  const P = parsear(vistaForm.monto);
  const n = parsear(vistaForm.plazoAnios);
  if (P <= 0 || n <= 0) return null;
  const r     = vistaTasaActual.value.tasa / 100;
  const monto = P * Math.pow(1 + r, n);
  return { interes: monto - P, monto };
});

const resultadoPlazo = computed(() => {
  const tasa = plazoTasasFiltradas.value[plazoForm.idx];
  if (!tasa) return null;
  const P = parsear(plazoForm.monto);
  if (P <= 0) return null;
  const interes = (P * (tasa.tasa / 100)) / 360 * (tasa.plazo_meses * 30);
  return { interes, total: P + interes, tasa };
});

const resultadoCredito = computed(() => {
  const P         = parsear(creditoForm.monto);
  const n         = Math.round(parsear(creditoForm.plazoMeses));
  const tasaAnual = parsear(creditoForm.tasaAnual);
  if (P <= 0 || n <= 0 || tasaAnual <= 0) return null;

  const r     = tasaAnual / 100 / 12;
  const cuota = r === 0
    ? P / n
    : (P * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);

  const tabla: FilaAmortizacion[] = [];
  let saldo = P;
  for (let mes = 1; mes <= n; mes++) {
    const interesMes = saldo * r;
    const capitalMes = cuota - interesMes;
    saldo -= capitalMes;
    tabla.push({ mes, cuota, interes: interesMes, capital: capitalMes, saldo: Math.max(0, saldo) });
  }

  return { cuota, totalPagar: cuota * n, totalIntereses: cuota * n - P, tabla, n };
});

const filasVisibles = computed((): (FilaAmortizacion | 'ellipsis')[] => {
  if (!resultadoCredito.value) return [];
  const tabla = resultadoCredito.value.tabla;
  if (tablaCompleta.value || tabla.length <= 8) return tabla;
  return [...tabla.slice(0, 4), 'ellipsis', ...tabla.slice(-3)];
});

// ── Carga de datos desde PocketBase ──────────────────────────────────────────
async function cargarTasas() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const registros = await pb.collection('tasas_intereses').getFullList<TasaRecord>({
      filter: 'activa = true',
      // Se solicita el expand de moneda con todos sus campos incluidos los _en
      expand: 'moneda',
      sort:   'plazo_meses',
    });
    todasLasTasas.value = registros;

    const primerVista = registros.find((t) => t.tipo === 'vista');
    if (primerVista) vistaMoneda.value = primerVista.expand.moneda.moneda;

    const primerPlazo = registros.find((t) => t.tipo === 'plazo_fijo');
    if (primerPlazo) plazoMoneda.value = primerPlazo.expand.moneda.moneda;
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
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm">{{ tUI('loading') }}</p>
    </div>

    <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
    <div v-else-if="errorDB" class="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
      <!-- tabler:alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-sm">{{ tUI('errorTitle') }}</p>
      <p class="text-xs text-red-500">{{ tUI('errorSub') }}</p>
      <button @click="cargarTasas" class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors">
        <!-- tabler:refresh -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
        </svg>
        {{ tUI('retry') }}
      </button>
    </div>

    <!-- ── CONTENIDO PRINCIPAL ───────────────────────────────────────────── -->
    <template v-else>

      <!-- Pestañas de selección -->
      <div class="flex rounded-xl overflow-hidden border border-bpa-200 dark:border-bpa-amber-800 mb-6">

        <button @click="tabActiva = 'vista'"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-bpa-200 dark:border-bpa-amber-800"
          :class="tabActiva === 'vista' ? 'bg-primary text-white' : 'bg-white dark:bg-bpa-950/60 text-muted hover:bg-bpa-50 dark:hover:bg-bpa-800/30'">
          <!-- tabler:coins -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 14c0 1.657 2.686 3 6 3s6 -1.343 6 -3s-2.686 -3 -6 -3s-6 1.343 -6 3" /><path d="M9 14v4c0 1.656 2.686 3 6 3s6 -1.344 6 -3v-4" /><path d="M3 6c0 1.072 1.144 2.062 3 2.598s4.144 .536 6 0c1.856 -.536 3 -1.526 3 -2.598c0 -1.072 -1.144 -2.062 -3 -2.598s-4.144 -.536 -6 0c-1.856 .536 -3 1.526 -3 2.598" /><path d="M3 6v10c0 .888 .772 1.45 2 2" /><path d="M3 11c0 .888 .772 1.45 2 2" /></svg>
          <span class="text-xs sm:text-sm leading-tight text-center">{{ tUI('tabSight') }}</span>
        </button>

        <button @click="tabActiva = 'plazo'"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-bpa-200 dark:border-bpa-amber-800"
          :class="tabActiva === 'plazo' ? 'bg-primary text-white' : 'bg-white dark:bg-bpa-950/60 text-muted hover:bg-bpa-50 dark:hover:bg-bpa-800/30'">
          <!-- tabler:building-bank -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 21l18 0" /><path d="M3 10l18 0" /><path d="M5 6l7 -3l7 3" /><path d="M4 10l0 11" /><path d="M20 10l0 11" /><path d="M8 14l0 3" /><path d="M12 14l0 3" /><path d="M16 14l0 3" /></svg>
          <span class="text-xs sm:text-sm leading-tight text-center">{{ tUI('tabTerm') }}</span>
        </button>

        <button @click="tabActiva = 'credito'; tablaCompleta = false"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors"
          :class="tabActiva === 'credito' ? 'bg-primary text-white' : 'bg-white dark:bg-bpa-950/60 text-muted hover:bg-bpa-50 dark:hover:bg-bpa-800/30'">
          <!-- tabler:credit-card -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8" /><path d="M3 10l18 0" /><path d="M7 15l.01 0" /><path d="M11 15l2 0" /></svg>
          <span class="text-xs sm:text-sm leading-tight text-center">{{ tUI('tabCredit') }}</span>
        </button>

      </div>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB A · AHORRO A LA VISTA
      ════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0" mode="out-in">
        <div v-if="tabActiva === 'vista'" key="vista" class="space-y-5">

          <!-- Selector de moneda -->
          <div class="flex items-center gap-3 flex-wrap">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide flex-shrink-0">
              {{ tUI('labelCurrency') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button v-for="mon in vistaMonedasDisponibles" :key="mon.moneda"
                @click="vistaMoneda = mon.moneda"
                class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                :class="vistaMoneda === mon.moneda
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary'">
                {{ mon.moneda }}
              </button>
            </div>
          </div>

          <!-- Nota del método (semántica → diccionario; nombre de moneda → tf()) -->
          <div v-if="vistaTasaActual" class="flex items-start gap-2.5 rounded-lg bg-bpa-50 dark:bg-bpa-950/40 border border-bpa-200 dark:border-bpa-amber-800 px-4 py-3">
            <!-- tabler:info-circle -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0 text-primary mt-0.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>
            <p class="text-xs text-default dark:text-default leading-relaxed">
              <!--
                nombre_moneda / nombre_moneda_en → tf() (campo PB traducible)
                porcentaje y método → t() (texto semántico del diccionario)
              -->
              {{ tf(vistaTasaActual.expand.moneda.nombre_moneda, vistaTasaActual.expand.moneda.nombre_moneda_en) }}:
              <strong>{{ vistaTasaActual.tasa }}% {{ tUI('perYear') }}</strong>
              · {{ t('calculator.sight.method.note') }}
            </p>
          </div>

          <!-- Inputs: Capital + Plazo -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <!-- Capital -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                {{ tUI('labelCapital') }} ({{ vistaMoneda || '…' }})
              </label>
              <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                <input v-model="vistaForm.monto" type="number" min="0" step="0.1" placeholder="0.00" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                  <button type="button" @click="ajustar(vistaForm, 'monto', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(vistaForm, 'monto', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>

            <!-- Plazo + botón calendario -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                {{ tUI('labelTerm') }}
              </label>
              <div class="flex gap-2">
                <div class="campo-numero flex-1 flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                  <input v-model="vistaForm.plazoAnios" type="number" min="0" step="0.5" placeholder="0" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                  <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                    <button type="button" @click="ajustar(vistaForm, 'plazoAnios', 0.5, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                    <button type="button" @click="ajustar(vistaForm, 'plazoAnios', -0.5, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                  </div>
                </div>
                <!-- Botón calendario -->
                <button type="button" @click="mostrarCalendario = !mostrarCalendario" :title="tUI('btnSelectRange')"
                  class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border transition-colors"
                  :class="mostrarCalendario ? 'bg-primary border-primary text-white' : 'border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 text-muted hover:border-primary hover:text-primary'">
                  <!-- tabler:calendar -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path d="M12 15v3" /></svg>
                </button>
              </div>

              <!-- Panel de rango de fechas -->
              <Transition enter-active-class="transition-all duration-150 ease-out" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-100 ease-in" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-1">
                <div v-if="mostrarCalendario" class="mt-2 p-4 rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-950/40 space-y-3">
                  <p class="text-xs text-primary dark:text-primary font-semibold">{{ tUI('btnSelectRange') }}</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[11px] font-medium text-muted mb-1">{{ tUI('labelStart') }}</label>
                      <div @click="inputFechaInicio?.showPicker()" class="flex items-center justify-between rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 px-3 py-2 cursor-pointer select-none">
                        <span class="text-sm" :class="fechaInicio ? 'text-default dark:text-default' : 'text-muted'">{{ fechaInicio ? fmtFecha(fechaInicio) : 'dd/mm/aaaa' }}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path d="M12 15v3" /></svg>
                      </div>
                      <input type="date" v-model="fechaInicio" ref="inputFechaInicio" class="sr-only" />
                    </div>
                    <div>
                      <label class="block text-[11px] font-medium text-muted mb-1">{{ tUI('labelEnd') }}</label>
                      <div @click="inputFechaFin?.showPicker()" class="flex items-center justify-between rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 px-3 py-2 cursor-pointer select-none">
                        <span class="text-sm" :class="fechaFin ? 'text-default dark:text-default' : 'text-muted'">{{ fechaFin ? fmtFecha(fechaFin) : 'dd/mm/aaaa' }}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted flex-shrink-0"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path d="M12 15v3" /></svg>
                      </div>
                      <input type="date" v-model="fechaFin" :min="fechaInicio" ref="inputFechaFin" class="sr-only" />
                    </div>
                  </div>
                  <div class="flex justify-center">
                    <button type="button" @click="aplicarRango" :disabled="!fechaInicio || !fechaFin"
                      class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      :class="fechaInicio && fechaFin ? 'bg-primary hover:bg-secondary text-white' : 'bg-bpa-100 dark:bg-bpa-800/40 text-muted cursor-not-allowed'">
                      {{ tUI('btnApply') }}
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Resultado (siempre visible) -->
          <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden">
            <div class="bg-primary px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
              <span class="font-semibold text-sm">{{ tUI('labelResult') }}</span>
            </div>
            <div class="bg-white dark:bg-bpa-950/60 p-5 grid grid-cols-2 gap-4">
              <div class="text-center p-3 rounded-lg bg-bpa-100/50 dark:bg-bpa-amber-950/30">
                <p class="text-xs text-muted mb-1">{{ tUI('labelInterest') }}</p>
                <p class="text-xl font-bold text-bpa-400 dark:text-bpa-amber-400">{{ fmt(resultadoVista?.interes ?? 0) }}</p>
                <p class="text-xs text-muted mt-0.5">{{ vistaMoneda || '—' }}</p>
              </div>
              <div class="text-center p-3 rounded-lg bg-bpa-100 dark:bg-bpa-amber-950/40">
                <p class="text-xs text-muted mb-1">{{ tUI('labelTotal') }}</p>
                <p class="text-xl font-bold text-primary dark:text-primary">{{ fmt(resultadoVista?.monto ?? 0) }}</p>
                <p class="text-xs text-muted mt-0.5">{{ vistaMoneda || '—' }}</p>
              </div>
            </div>
          </div>

        </div>
      </Transition>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB B · DEPÓSITO A PLAZO FIJO
      ════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0" mode="out-in">
        <div v-if="tabActiva === 'plazo'" key="plazo" class="space-y-5">

          <!-- Selector de moneda -->
          <div class="flex items-center gap-3 flex-wrap">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide flex-shrink-0">{{ tUI('labelCurrency') }}</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="mon in plazoMonedasDisponibles" :key="mon.moneda"
                @click="plazoMoneda = mon.moneda; plazoForm.idx = 0"
                class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                :class="plazoMoneda === mon.moneda ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-200 dark:border-bpa-amber-800 hover:border-primary hover:text-primary'">
                {{ mon.moneda }}
              </button>
            </div>
          </div>

          <!-- Grilla de tasas disponibles -->
          <!--
            Cabecera → t() (semántica: texto institucional del banco)
          -->
          <div class="overflow-hidden rounded-xl border border-bpa-200 dark:border-bpa-amber-800">
            <div class="bg-bpa-800 dark:bg-bpa-amber-950 px-4 py-2.5 flex items-center gap-2 text-white">
              <!-- tabler:percentage -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 18l12 -12" /></svg>
              <span class="text-sm font-semibold">{{ t('calculator.term.rates.header') }} — {{ plazoMoneda }}</span>
            </div>
            <div class="grid bg-white dark:bg-bpa-950/60" :class="clasesGridPlazo">
              <div v-for="(tasa, idx) in plazoTasasFiltradas" :key="tasa.id"
                @click="plazoForm.idx = idx"
                class="cursor-pointer text-center py-4 px-3 transition-colors border border-bpa-200 dark:border-bpa-amber-800 -mt-px -ml-px"
                :class="plazoForm.idx === idx ? 'bg-primary text-white border-primary z-10 relative' : 'hover:bg-bpa-50 dark:hover:bg-bpa-800/20'">
                <p class="text-lg font-bold">{{ tasa.tasa }}%</p>
                <p class="text-md font-light" :class="plazoForm.idx === idx ? 'text-white/80' : 'text-muted'">
                  {{ labelPlazo(tasa.plazo_meses) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Capital -->
          <div>
            <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              {{ tUI('labelDeposit') }} ({{ plazoMoneda || '…' }})
            </label>
            <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
              <input v-model="plazoForm.monto" type="number" min="0" step="0.1" placeholder="0.00" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
              <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                <button type="button" @click="ajustar(plazoForm, 'monto', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                <button type="button" @click="ajustar(plazoForm, 'monto', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
              </div>
            </div>
          </div>

          <!-- Resultado -->
          <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden">
            <div class="bg-primary px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
              <span class="font-semibold text-sm">
                {{ labelTabBHeader }}
              </span>
            </div>
            <div class="bg-white dark:bg-bpa-950/60 p-5 grid grid-cols-2 gap-4">
              <div class="text-center p-3 rounded-lg bg-bpa-100/50 dark:bg-bpa-amber-950/30">
                <p class="text-xs text-muted mb-1">{{ tUI('labelTermResult') }}</p>
                <p class="text-xl font-bold text-bpa-400 dark:text-bpa-amber-400">{{ fmt(resultadoPlazo?.interes ?? 0) }}</p>
                <p class="text-xs text-muted mt-0.5">{{ plazoMoneda || '—' }}</p>
              </div>
              <div class="text-center p-3 rounded-lg bg-bpa-100 dark:bg-bpa-amber-950/40">
                <p class="text-xs text-muted mb-1">{{ tUI('labelTermTotal') }}</p>
                <p class="text-xl font-bold text-primary dark:text-primary">{{ fmt(resultadoPlazo?.total ?? 0) }}</p>
                <p class="text-xs text-muted mt-0.5">{{ plazoMoneda || '—' }}</p>
              </div>
            </div>
          </div>

        </div>
      </Transition>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB C · CRÉDITO
      ════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0" mode="out-in">
        <div v-if="tabActiva === 'credito'" key="credito" class="space-y-5">

          <!-- Nota explicativa del método (semántica → diccionario) -->
          <div class="flex items-start gap-2.5 rounded-lg bg-bpa-50 dark:bg-bpa-950/40 border border-bpa-200 dark:border-bpa-amber-800 px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0 text-primary mt-0.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>
            <p class="text-xs text-default dark:text-default leading-relaxed">
              {{ t('calculator.credit.method.note') }}
            </p>
          </div>

          <!-- 3 inputs -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <!-- Monto -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tUI('labelPrincipal') }} (CUP)</label>
              <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                <input v-model="creditoForm.monto" type="number" min="0" step="0.1" placeholder="0.00" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                  <button type="button" @click="ajustar(creditoForm, 'monto', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'monto', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
            <!-- Tasa -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tUI('labelRate') }}</label>
              <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                <input v-model="creditoForm.tasaAnual" type="number" min="0" step="0.1" placeholder="0.0" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                  <button type="button" @click="ajustar(creditoForm, 'tasaAnual', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'tasaAnual', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
            <!-- Plazo -->
            <div>
              <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{{ tUI('labelMonths') }}</label>
              <div class="campo-numero flex items-center rounded-lg border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 overflow-hidden focus-within:ring-2 focus-within:ring-primary transition">
                <input v-model="creditoForm.plazoMeses" type="number" min="1" step="1" placeholder="0" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-default dark:text-default placeholder:text-muted focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-bpa-200 dark:border-bpa-amber-800">
                  <button type="button" @click="ajustar(creditoForm, 'plazoMeses', 1, 1)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default border-b border-bpa-200 dark:border-bpa-amber-800 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'plazoMeses', -1, 1)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-bpa-50 dark:hover:bg-bpa-800/40 text-muted hover:text-default transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Resumen del crédito (siempre visible) -->
          <div class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden">
            <div class="bg-primary px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
              <span class="font-semibold text-sm">{{ tUI('labelCreditResult') }}</span>
            </div>
            <div class="bg-white dark:bg-bpa-950/60 p-5">
              <!-- Cuota mensual destacada -->
              <div class="text-center mb-5 p-4 rounded-xl bg-bpa-50 dark:bg-bpa-950/40 border border-bpa-200 dark:border-bpa-amber-800">
                <p class="text-xs text-muted mb-1 uppercase tracking-wide font-semibold">{{ tUI('labelMonthly') }}</p>
                <p class="text-3xl font-bold text-primary dark:text-primary">
                  {{ fmt(resultadoCredito?.cuota ?? 0) }}
                  <span class="text-base font-medium text-muted ml-1">CUP</span>
                </p>
              </div>
              <!-- 3 stats -->
              <div class="grid grid-cols-3 gap-3">
                <div class="text-center p-3 rounded-lg bg-bpa-100/50 dark:bg-bpa-amber-950/30">
                  <p class="text-[11px] text-muted mb-1">{{ tUI('labelPrincipal') }}</p>
                  <p class="text-sm font-bold text-default dark:text-default">{{ fmt(parsear(creditoForm.monto)) }}</p>
                </div>
                <div class="text-center p-3 rounded-lg bg-bpa-100/50 dark:bg-bpa-amber-950/30">
                  <p class="text-[11px] text-muted mb-1">{{ tUI('labelInterests') }}</p>
                  <p class="text-sm font-bold text-default dark:text-default">{{ fmt(resultadoCredito?.totalIntereses ?? 0) }}</p>
                </div>
                <div class="text-center p-3 rounded-lg bg-bpa-100/50 dark:bg-bpa-amber-950/30">
                  <p class="text-[11px] text-muted mb-1">{{ tUI('labelToPay') }}</p>
                  <p class="text-sm font-bold text-default dark:text-default">{{ fmt(resultadoCredito?.totalPagar ?? 0) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tabla de amortización (solo cuando hay cálculo válido) -->
          <div v-if="resultadoCredito" class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 overflow-hidden">
            <div class="bg-bpa-800 dark:bg-bpa-amber-950 border-b border-bpa-200 dark:border-bpa-amber-800 px-4 py-2.5 flex items-center gap-2 text-white">
              <!-- tabler:table -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" /><path d="M3 10h18" /><path d="M10 3v18" /></svg>
              <span class="text-sm font-semibold">{{ tUI('labelTable') }}</span>
              <span class="ml-auto text-xs text-bpa-200 dark:text-bpa-amber-600">{{ resultadoCredito.n }} {{ tUI('labelQuotas') }}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-bpa-50 dark:bg-bpa-950/80 border-b border-bpa-200 dark:border-bpa-amber-800">
                    <th class="text-center px-3 py-2.5 text-xs font-semibold text-muted">{{ tUI('colMonth') }}</th>
                    <th class="text-center px-3 py-2.5 text-xs font-semibold text-default">{{ tUI('colQuota') }}</th>
                    <th class="text-center px-3 py-2.5 text-xs font-semibold text-bpa-400 dark:text-bpa-amber-400">{{ tUI('colInterest') }}</th>
                    <th class="text-center px-3 py-2.5 text-xs font-semibold text-bpa-400 dark:text-bpa-amber-400">{{ tUI('colCapital') }}</th>
                    <th class="text-center px-3 py-2.5 text-xs font-semibold text-default">{{ tUI('colBalance') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-bpa-200 dark:divide-bpa-amber-800/50">
                  <template v-for="(fila, idx) in filasVisibles" :key="idx">
                    <tr v-if="fila !== 'ellipsis'" class="hover:bg-bpa-50/50 dark:hover:bg-bpa-800/10 transition-colors" :class="fila.mes === resultadoCredito.n ? 'bg-bpa-50/50 dark:bg-bpa-950/20' : ''">
                      <td class="text-center px-3 py-2 text-muted font-mono text-xs">{{ fila.mes }}</td>
                      <td class="text-center px-3 py-2 text-default dark:text-default font-medium">{{ fmt(fila.cuota) }}</td>
                      <td class="text-center px-3 py-2 text-bpa-400 dark:text-bpa-amber-400 font-medium">{{ fmt(fila.interes) }}</td>
                      <td class="text-center px-3 py-2 text-bpa-400 dark:text-bpa-amber-400 font-medium">{{ fmt(fila.capital) }}</td>
                      <td class="text-center px-3 py-2 text-default dark:text-default font-medium">{{ fmt(fila.saldo) }}</td>
                    </tr>
                    <tr v-else class="bg-bpa-50 dark:bg-bpa-950/40">
                      <td colspan="5" class="text-center py-2 text-xs text-muted tracking-widest">· · ·</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-if="resultadoCredito.n > 8" class="border-t border-bpa-200 dark:border-bpa-amber-800 px-4 py-2.5 bg-white dark:bg-bpa-950/60 flex justify-center">
              <button @click="tablaCompleta = !tablaCompleta" class="text-xs font-medium text-primary dark:text-primary hover:text-secondary dark:hover:text-secondary transition-colors">
                {{ tablaCompleta
                  ? tUI('labelShowLess')
                  : tUI('labelShowAll').replace('{n}', String(resultadoCredito.n)) }}
              </button>
            </div>
          </div>

        </div>
      </Transition>

      <!-- Aviso legal al pie (semántico → diccionario) -->
      <p class="mt-6 text-xs text-muted text-center leading-relaxed">
        {{ t('calculator.disclaimer') }}
      </p>

    </template>
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
