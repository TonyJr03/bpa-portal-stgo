<script setup lang="ts">
/**
 * @componente  src/components/vue/CalculadoraFinanciera.vue
 * @directiva   client:load
 *
 * @coleccion   tasas_calculadora
 *   nombre      Text     "Ahorro a la vista" | "6 meses" | "12 meses" …
 *   tipo        Select   'vista' | 'plazo_fijo'
 *   plazo_meses Number   0 para vista; 6/12/18/24/30/36 para plazo fijo
 *   tasa        Number   porcentaje anual (ej: 1.5, 2.5…)
 *   moneda      Relation → tasas_cambio  (expand devuelve: moneda, nombre_moneda)
 *   activa      Bool
 *
 * @formulas
 *   Vista      → Interés compuesto:  M = P × (1 + r)ⁿ  (n = años decimales)
 *   Plazo fijo → Interés simple año comercial (base 360):
 *                I = (Capital × tasa%) / 360 × (plazo_meses × 30)
 *   Crédito    → Sistema francés (cuota fija):
 *                cuota = P × [r(1+r)ⁿ] / [(1+r)ⁿ−1]   r = tasa_anual/100/12
 */

import { ref, reactive, computed, watch, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type TabId = 'vista' | 'plazo' | 'credito';

interface MonedaRel {
  id:            string;
  moneda:        string;   // código: CUP, USD, EUR…
  nombre_moneda: string;
}

interface TasaRecord {
  id:          string;
  nombre:      string;
  tipo:        'vista' | 'plazo_fijo';
  plazo_meses: number;
  tasa:        number;
  activa:      boolean;
  expand: { moneda: MonedaRel };
}

interface FilaAmortizacion {
  mes:     number;
  cuota:   number;
  interes: number;
  capital: number;
  saldo:   number;
}

// ── Estado global ─────────────────────────────────────────────────────────────
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
function fmt(v: number): string {
  return v.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const nuevo = Math.round((parsear(obj[key]) + delta) * 10000) / 10000;
  obj[key]    = Math.max(min, nuevo);
}

// ── Derivados de monedas ──────────────────────────────────────────────────────
/** Monedas únicas disponibles para el ahorro a la vista. */
const vistaMonedasDisponibles = computed((): MonedaRel[] => {
  const seen = new Set<string>();
  return todasLasTasas.value
    .filter(t => t.tipo === 'vista')
    .filter(t => !seen.has(t.expand.moneda.moneda) && seen.add(t.expand.moneda.moneda))
    .map(t => t.expand.moneda);
});

/** Monedas únicas disponibles para depósitos a plazo fijo. */
const plazoMonedasDisponibles = computed((): MonedaRel[] => {
  const seen = new Set<string>();
  return todasLasTasas.value
    .filter(t => t.tipo === 'plazo_fijo')
    .filter(t => !seen.has(t.expand.moneda.moneda) && seen.add(t.expand.moneda.moneda))
    .map(t => t.expand.moneda);
});

/** Registro de tasa para la moneda seleccionada en vista. */
const vistaTasaActual = computed((): TasaRecord | undefined =>
  todasLasTasas.value.find(
    t => t.tipo === 'vista' && t.expand.moneda.moneda === vistaMoneda.value
  )
);

/** Opciones de plazo fijo filtradas por moneda seleccionada, ordenadas por plazo. */
const plazoTasasFiltradas = computed((): TasaRecord[] =>
  todasLasTasas.value
    .filter(t => t.tipo === 'plazo_fijo' && t.expand.moneda.moneda === plazoMoneda.value)
    .sort((a, b) => a.plazo_meses - b.plazo_meses)
);

// Resetear selección de plazo cuando cambia la moneda
watch(plazoMoneda, () => { plazoForm.idx = 0; });

/**
 * Clase del grid de tarjetas de plazo fijo según cuántas opciones haya.
 * 1 → 1 col · 2 → 2 cols · 3+ → 3 cols
 */
const clasesGridPlazo = computed(() => {
  const n = plazoTasasFiltradas.value.length;
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-2';
  return 'grid-cols-3';
});

// ── Calendario: calcular años desde rango de fechas ──────────────────────────
/**
 * Se llama solo cuando el usuario pulsa "Aceptar" en el panel.
 * Calcula los años decimales (días / 365), los escribe en el input
 * y cierra el panel.
 */
function aplicarRango() {
  if (!fechaInicio.value || !fechaFin.value) return;
  const msI = new Date(fechaInicio.value).getTime();
  const msF = new Date(fechaFin.value).getTime();
  if (msF <= msI) return;
  const dias = (msF - msI) / (1000 * 60 * 60 * 24);
  vistaForm.plazoAnios    = Math.round((dias / 365) * 100) / 100;
  mostrarCalendario.value = false;
  fechaInicio.value       = '';
  fechaFin.value          = '';
}

// ── Resultados calculados ─────────────────────────────────────────────────────
/** Tab A — Interés compuesto: M = P × (1 + r)ⁿ */
const resultadoVista = computed(() => {
  if (!vistaTasaActual.value) return null;
  const P = parsear(vistaForm.monto);
  const n = parsear(vistaForm.plazoAnios);
  if (P <= 0 || n <= 0) return null;
  const r      = vistaTasaActual.value.tasa / 100;
  const monto  = P * Math.pow(1 + r, n);
  const interes = monto - P;
  return { interes, monto };
});

/** Tab B — Interés simple base 360: I = (Capital × tasa%) / 360 × (meses × 30) */
const resultadoPlazo = computed(() => {
  const tasa = plazoTasasFiltradas.value[plazoForm.idx];
  if (!tasa) return null;
  const P = parsear(plazoForm.monto);
  if (P <= 0) return null;
  const dias    = tasa.plazo_meses * 30;
  const interes = (P * (tasa.tasa / 100)) / 360 * dias;
  return { interes, total: P + interes, tasa };
});

/** Tab C — Sistema francés */
const resultadoCredito = computed(() => {
  const P         = parsear(creditoForm.monto);
  const n         = Math.round(parsear(creditoForm.plazoMeses));
  const tasaAnual = parsear(creditoForm.tasaAnual);
  if (P <= 0 || n <= 0 || tasaAnual <= 0) return null;

  const r     = tasaAnual / 100 / 12;
  const cuota = r === 0
    ? P / n
    : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

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

/** Filas visibles con ellipsis si la tabla es larga */
const filasVisibles = computed((): (FilaAmortizacion | 'ellipsis')[] => {
  if (!resultadoCredito.value) return [];
  const t = resultadoCredito.value.tabla;
  if (tablaCompleta.value || t.length <= 8) return t;
  return [...t.slice(0, 4), 'ellipsis', ...t.slice(-3)];
});

// ── Carga desde PocketBase ────────────────────────────────────────────────────
async function cargarTasas() {
  cargando.value  = true;
  errorDB.value   = false;
  try {
    const registros = await pb
      .collection('tasas_calculadora')
      .getFullList<TasaRecord>({
        filter: 'activa = true',
        expand: 'moneda',
        sort:   'plazo_meses',
      });
    todasLasTasas.value = registros;

    // Auto-seleccionar primera moneda de cada pestaña
    const primerVista = registros.find(t => t.tipo === 'vista');
    if (primerVista) vistaMoneda.value = primerVista.expand.moneda.moneda;

    const primerPlazo = registros.find(t => t.tipo === 'plazo_fijo');
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
    <div v-if="cargando"
      class="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
      <!-- tabler:loader-2 -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 animate-spin text-blue-600">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm">Cargando tasas de interés…</p>
    </div>

    <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
    <div v-else-if="errorDB"
      class="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
      <!-- tabler:alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-sm">No se pudieron cargar las tasas de interés.</p>
      <p class="text-xs text-red-500">Verifique la conexión con el servidor.</p>
      <button @click="cargarTasas"
        class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors">
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

    <!-- ── CONTENIDO PRINCIPAL (datos cargados) ──────────────────────────── -->
    <template v-else>

      <!-- Pestañas de navegación -->
      <div class="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-6">
        <button @click="tabActiva = 'vista'"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-slate-200 dark:border-slate-700"
          :class="tabActiva === 'vista' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'">
          <!-- tabler:coins -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M9 14c0 1.657 2.686 3 6 3s6 -1.343 6 -3s-2.686 -3 -6 -3s-6 1.343 -6 3" />
            <path d="M9 14v4c0 1.656 2.686 3 6 3s6 -1.344 6 -3v-4" />
            <path d="M3 6c0 1.072 1.144 2.062 3 2.598s4.144 .536 6 0c1.856 -.536 3 -1.526 3 -2.598c0 -1.072 -1.144 -2.062 -3 -2.598s-4.144 -.536 -6 0c-1.856 .536 -3 1.526 -3 2.598" />
            <path d="M3 6v10c0 .888 .772 1.45 2 2" /><path d="M3 11c0 .888 .772 1.45 2 2" />
          </svg>
          <span class="text-xs sm:text-sm leading-tight text-center">A la Vista</span>
        </button>

        <button @click="tabActiva = 'plazo'"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-slate-200 dark:border-slate-700"
          :class="tabActiva === 'plazo' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'">
          <!-- tabler:building-bank -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M3 21l18 0" /><path d="M3 10l18 0" /><path d="M5 6l7 -3l7 3" />
            <path d="M4 10l0 11" /><path d="M20 10l0 11" />
            <path d="M8 14l0 3" /><path d="M12 14l0 3" /><path d="M16 14l0 3" />
          </svg>
          <span class="text-xs sm:text-sm leading-tight text-center">Plazo Fijo</span>
        </button>

        <button @click="tabActiva = 'credito'; tablaCompleta = false"
          class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors"
          :class="tabActiva === 'credito' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'">
          <!-- tabler:credit-card -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8" />
            <path d="M3 10l18 0" /><path d="M7 15l.01 0" /><path d="M11 15l2 0" />
          </svg>
          <span class="text-xs sm:text-sm leading-tight text-center">Crédito</span>
        </button>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB A · AHORRO A LA VISTA
      ════════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
        mode="out-in">
        <div v-if="tabActiva === 'vista'" key="vista" class="space-y-5">

          <!-- Selector de moneda -->
          <div class="flex items-center gap-3 flex-wrap">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex-shrink-0">Moneda</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="mon in vistaMonedasDisponibles" :key="mon.moneda"
                @click="vistaMoneda = mon.moneda"
                class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                :class="vistaMoneda === mon.moneda
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'">
                {{ mon.moneda }}
              </button>
            </div>
          </div>

          <!-- Nota de tasa vigente -->
          <div v-if="vistaTasaActual"
            class="flex items-start gap-2.5 rounded-lg bg-bpa-alt dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 px-4 py-3">
            <!-- tabler:info-circle -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" />
            </svg>
            <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Tasa vigente para <strong>{{ vistaTasaActual.expand.moneda.nombre_moneda }}</strong>:
              <strong>{{ vistaTasaActual.tasa }}% anual</strong>.
              Cálculo por interés compuesto — los intereses se capitalizan anualmente.
            </p>
          </div>

          <!-- Formulario -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <!-- Capital -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Capital inicial ({{ vistaMoneda || '…' }})
              </label>
              <div class="campo-numero flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                <input v-model="vistaForm.monto" type="number" min="0" step="0.01" placeholder="0.00"
                  class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                  <button type="button" @click="ajustar(vistaForm, 'monto', 0.01, 0)"
                    class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors">
                    <!-- tabler:chevron-up -->
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>
                  </button>
                  <button type="button" @click="ajustar(vistaForm, 'monto', -0.01, 0)"
                    class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                    <!-- tabler:chevron-down -->
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Plazo en años + botón calendario -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Plazo (años)
              </label>
              <div class="flex gap-2">
                <!-- Input con chevrons -->
                <div class="campo-numero flex-1 flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                  <input v-model="vistaForm.plazoAnios" type="number" min="0" step="0.5" placeholder="0"
                    class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
                  <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                    <button type="button" @click="ajustar(vistaForm, 'plazoAnios', 0.5, 0)"
                      class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>
                    </button>
                    <button type="button" @click="ajustar(vistaForm, 'plazoAnios', -0.5, 0)"
                      class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>
                    </button>
                  </div>
                </div>
                <!-- Botón abrir calendario -->
                <button type="button" @click="mostrarCalendario = !mostrarCalendario"
                  title="Seleccionar rango de fechas"
                  class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border transition-colors"
                  :class="mostrarCalendario
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600'">
                  <!-- tabler:calendar -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
                    <path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" />
                    <path d="M11 15h1" /><path d="M12 15v3" />
                  </svg>
                </button>
              </div>

              <!-- Panel de rango de fechas -->
              <Transition enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-1">
                <div v-if="mostrarCalendario"
                  class="mt-2 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-bpa-alt dark:bg-blue-950/40 space-y-3">
                  <p class="text-xs text-blue-700 dark:text-blue-400 font-semibold">Seleccione el rango</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha de inicio</label>
                      <input type="date" v-model="fechaInicio"
                        class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                    <div>
                      <label class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha de vencimiento</label>
                      <input type="date" v-model="fechaFin" :min="fechaInicio"
                        class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                  </div>
                  <div class="flex justify-center">
                    <button type="button" @click="aplicarRango"
                      :disabled="!fechaInicio || !fechaFin"
                      class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      :class="fechaInicio && fechaFin
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'">
                      Aceptar
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Resultado -->
          <div v-if="resultadoVista" class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
            <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
              <span class="font-semibold text-sm">Resultado del cálculo</span>
            </div>
            <div class="bg-white dark:bg-slate-800 p-5 grid grid-cols-2 gap-4">
              <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Intereses ganados</p>
                <p class="text-xl font-bold text-green-600 dark:text-green-400">{{ fmt(resultadoVista.interes) }}</p>
                <p class="text-xs text-slate-400 mt-0.5">{{ vistaMoneda }}</p>
              </div>
              <div class="text-center p-3 rounded-lg bg-bpa-alt dark:bg-blue-900/40">
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Monto al vencimiento</p>
                <p class="text-xl font-bold text-blue-700 dark:text-blue-300">{{ fmt(resultadoVista.monto) }}</p>
                <p class="text-xs text-slate-400 mt-0.5">{{ vistaMoneda }}</p>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-4">
            Seleccione la moneda, ingrese el capital y el plazo para ver el resultado.
          </p>

        </div>
      </Transition>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB B · DEPÓSITO A PLAZO FIJO
      ════════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
        mode="out-in">
        <div v-if="tabActiva === 'plazo'" key="plazo" class="space-y-5">

          <!-- Selector de moneda -->
          <div class="flex items-center gap-3 flex-wrap">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex-shrink-0">Moneda</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="mon in plazoMonedasDisponibles" :key="mon.moneda"
                @click="plazoMoneda = mon.moneda"
                class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                :class="plazoMoneda === mon.moneda
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'">
                {{ mon.moneda }}
              </button>
            </div>
          </div>

          <!-- Grilla de tasas — columnas adaptables según cantidad de opciones -->
          <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="bg-slate-800 dark:bg-slate-900 px-4 py-2.5 flex items-center gap-2 text-white">
              <!-- tabler:percentage -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 18l12 -12" /></svg>
              <span class="text-sm font-semibold">Tasas BPA vigentes — {{ plazoMoneda }}</span>
            </div>
            <!--
              Usamos border en cada celda en lugar de divide-* para que los bordes
              se dibujen siempre, incluso cuando hay menos de una fila completa.
              La clase de columnas viene del computed clasesGridPlazo.
            -->
            <div class="grid bg-white dark:bg-slate-800" :class="clasesGridPlazo">
              <div v-for="(t, idx) in plazoTasasFiltradas" :key="t.id"
                @click="plazoForm.idx = idx"
                class="cursor-pointer text-center py-4 px-3 transition-colors border border-slate-200 dark:border-slate-700 -mt-px -ml-px"
                :class="plazoForm.idx === idx
                  ? 'bg-blue-600 text-white border-blue-600 z-10 relative'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700'">
                <p class="text-lg font-bold">{{ t.tasa }}%</p>
                <p class="text-md font-light"
                  :class="plazoForm.idx === idx ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'">
                  {{ t.nombre }}
                </p>
              </div>
            </div>
          </div>

          <!-- Capital -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Capital a depositar ({{ plazoMoneda || '…' }})
            </label>
            <div class="campo-numero flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <input v-model="plazoForm.monto" type="number" min="0" step="0.01" placeholder="0.00"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
              <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                <button type="button" @click="ajustar(plazoForm, 'monto', 0.01, 0)"
                  class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>
                </button>
                <button type="button" @click="ajustar(plazoForm, 'monto', -0.01, 0)"
                  class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Resultado -->
          <div v-if="resultadoPlazo" class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
            <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
              <span class="font-semibold text-sm">
                {{ resultadoPlazo.tasa.nombre }} — {{ resultadoPlazo.tasa.tasa }}% anual ({{ plazoMoneda }})
              </span>
            </div>
            <div class="bg-white dark:bg-slate-800 p-5 grid grid-cols-2 gap-4">
              <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Intereses al vencimiento</p>
                <p class="text-xl font-bold text-green-600 dark:text-green-400">{{ fmt(resultadoPlazo.interes) }}</p>
                <p class="text-xs text-slate-400 mt-0.5">{{ plazoMoneda }}</p>
              </div>
              <div class="text-center p-3 rounded-lg bg-bpa-alt dark:bg-blue-900/40">
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Capital + Intereses</p>
                <p class="text-xl font-bold text-blue-700 dark:text-blue-300">{{ fmt(resultadoPlazo.total) }}</p>
                <p class="text-xs text-slate-400 mt-0.5">{{ plazoMoneda }}</p>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-4">
            Seleccione la moneda, el plazo y el capital para ver el resultado.
          </p>

        </div>
      </Transition>

      <!-- ════════════════════════════════════════════════════════════════════
          TAB C · CRÉDITO  (sin PocketBase — cuota fija, sistema francés)
      ════════════════════════════════════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
        mode="out-in">
        <div v-if="tabActiva === 'credito'" key="credito" class="space-y-5">

          <div class="flex items-start gap-2.5 rounded-lg bg-bpa-alt dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 px-4 py-3">
            <!-- tabler:info-circle -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>
            <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Cálculo por sistema de cuota fija (método francés). Ingrese la tasa anual que le indique su gestor de crédito en la sucursal.
            </p>
          </div>

          <!-- 3 inputs con chevrons -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Monto del crédito (CUP)</label>
              <div class="campo-numero flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                <input v-model="creditoForm.monto" type="number" min="0" step="0.01" placeholder="0.00" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                  <button type="button" @click="ajustar(creditoForm, 'monto', 0.01, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'monto', -0.01, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Tasa anual (%)</label>
              <div class="campo-numero flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                <input v-model="creditoForm.tasaAnual" type="number" min="0" step="0.1" placeholder="0.0" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                  <button type="button" @click="ajustar(creditoForm, 'tasaAnual', 0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'tasaAnual', -0.1, 0)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Plazo (meses)</label>
              <div class="campo-numero flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                <input v-model="creditoForm.plazoMeses" type="number" min="1" step="1" placeholder="0" class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
                <div class="flex flex-col self-stretch border-l border-slate-200 dark:border-slate-600">
                  <button type="button" @click="ajustar(creditoForm, 'plazoMeses', 1, 1)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b border-slate-200 dark:border-slate-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg></button>
                  <button type="button" @click="ajustar(creditoForm, 'plazoMeses', -1, 1)" class="flex-1 flex items-center justify-center px-2.5 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg></button>
                </div>
              </div>
            </div>
          </div>

          <template v-if="resultadoCredito">
            <!-- Resumen -->
            <div class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
              <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" /><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" /><path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" /><path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" /></svg>
                <span class="font-semibold text-sm">Resultado del crédito</span>
              </div>
              <div class="bg-white dark:bg-slate-800 p-5">
                <div class="text-center mb-5 p-4 rounded-xl bg-bpa-alt dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800">
                  <p class="text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide font-semibold">Cuota mensual fija</p>
                  <p class="text-3xl font-bold text-blue-700 dark:text-blue-300">
                    {{ fmt(resultadoCredito.cuota) }}
                    <span class="text-base font-medium text-blue-400 dark:text-blue-500 ml-1">CUP</span>
                  </p>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Capital</p>
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-200">{{ fmt(parsear(creditoForm.monto)) }}</p>
                  </div>
                  <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Total intereses</p>
                    <p class="text-sm font-bold text-amber-600 dark:text-amber-400">{{ fmt(resultadoCredito.totalIntereses) }}</p>
                  </div>
                  <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Total a pagar</p>
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-200">{{ fmt(resultadoCredito.totalPagar) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tabla de amortización -->
            <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div class="bg-slate-800 dark:bg-slate-900 px-4 py-2.5 flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" /><path d="M3 10h18" /><path d="M10 3v18" /></svg>
                <span class="text-sm font-semibold">Plan de amortización</span>
                <span class="ml-auto text-xs text-slate-400">{{ resultadoCredito.n }} cuotas</span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <th class="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Mes</th>
                      <th class="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Cuota</th>
                      <th class="text-right px-3 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">Interés</th>
                      <th class="text-right px-3 py-2.5 text-xs font-semibold text-green-600 dark:text-green-400">Capital</th>
                      <th class="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Saldo</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                    <template v-for="(fila, idx) in filasVisibles" :key="idx">
                      <tr v-if="fila !== 'ellipsis'"
                        class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        :class="fila.mes === resultadoCredito.n ? 'bg-bpa-alt/50 dark:bg-blue-950/20' : ''">
                        <td class="text-center px-3 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs">{{ fila.mes }}</td>
                        <td class="text-right px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{{ fmt(fila.cuota) }}</td>
                        <td class="text-right px-3 py-2 text-amber-600 dark:text-amber-400">{{ fmt(fila.interes) }}</td>
                        <td class="text-right px-3 py-2 text-green-600 dark:text-green-400">{{ fmt(fila.capital) }}</td>
                        <td class="text-right px-3 py-2 text-slate-700 dark:text-slate-300">{{ fmt(fila.saldo) }}</td>
                      </tr>
                      <tr v-else class="bg-slate-50 dark:bg-slate-800/30">
                        <td colspan="5" class="text-center py-2 text-xs text-slate-400 tracking-widest">· · ·</td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <div v-if="resultadoCredito.n > 8"
                class="border-t border-slate-100 dark:border-slate-700 px-4 py-2.5 bg-white dark:bg-slate-800/50 flex justify-center">
                <button @click="tablaCompleta = !tablaCompleta"
                  class="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors">
                  {{ tablaCompleta ? '▲ Ver resumen' : `▼ Ver las ${resultadoCredito.n} cuotas` }}
                </button>
              </div>
            </div>
          </template>

          <p v-else class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-4">
            Complete los tres campos para calcular la cuota y el plan de pagos.
          </p>

        </div>
      </Transition>

      <!-- Aviso legal -->
      <p class="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
        Resultados orientativos. Las condiciones reales del producto pueden variar.
        Consulte con su gestor en la sucursal BPA más cercana.
      </p>

    </template>
  </div>
</template>

<style scoped>
/* Oculta los spinners nativos del navegador en inputs type=number */
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
