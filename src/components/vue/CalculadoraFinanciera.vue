<script setup lang="ts">
/**
 * @componente  src/components/vue/CalculadoraFinanciera.vue
 * @directiva   client:load  (inyectado desde CalculadoraWidget.astro)
 *
 * @responsabilidad
 *   Calculadora financiera autónoma con tres pestañas. No conecta a
 *   PocketBase — todas las tasas y fórmulas son locales y hardcoded.
 *
 * @pestañas
 *   A · Interés a la Vista   → I = P × r × t  (tasa BPA: 2% anual)
 *   B · Depósito a Plazo Fijo → capital + intereses según plazo/tasa fija BPA
 *   C · Crédito               → cuota mensual + tabla de amortización simplificada
 *
 * @colecciones  ninguna — componente completamente autónomo
 */

import { ref, reactive, computed } from 'vue';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type TabId = 'vista' | 'plazo' | 'credito';

// ── Estado de navegación ─────────────────────────────────────────────────────
const tabActiva = ref<TabId>('vista');

// ── Catálogos hardcoded (tasas oficiales BPA vigentes) ────────────────────────
/** Tasa anual de la cuenta de ahorro a la vista (%). */
const TASA_VISTA = 2;

/**
 * Tasas BPA para depósitos a plazo fijo, en %.
 * Fuente: Resolución interna BPA vigente.
 */
const PLAZOS_FIJOS = [
  { meses: 12,  label: '1 año',   tasa: 2.5  },
  { meses: 24,  label: '2 años',  tasa: 3.0  },
  { meses: 36,  label: '3 años',  tasa: 3.5  },
  { meses: 60,  label: '5 años',  tasa: 4.0  },
] as const;

// ── Modelos de datos por pestaña ──────────────────────────────────────────────
const vistaForm = reactive({
  monto:      '' as string | number,
  plazoAnios: '' as string | number,
});

const plazoForm = reactive({
  monto:      '' as string | number,
  plazoIdx:   0,   // índice en PLAZOS_FIJOS
});

const creditoForm = reactive({
  monto:       '' as string | number,
  tasaAnual:   '' as string | number,
  plazoMeses:  '' as string | number,
});

/** Controla si se muestra la tabla completa o truncada */
const tablaCompleta = ref(false);

// ── Utilidades de formato ─────────────────────────────────────────────────────
function fmt(valor: number): string {
  return valor.toLocaleString('es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parsear(v: string | number): number {
  const n = parseFloat(String(v));
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Incrementa o decrementa el campo `key` de un objeto reactivo en `delta`,
 * sin bajar de `min`. Usa redondeo a 4 decimales para evitar imprecisiones
 * de punto flotante (ej: 0.1 + 0.2 ≠ 0.3 sin redondeo).
 */
function ajustar(
  obj: Record<string, string | number>,
  key: string,
  delta: number,
  min: number,
) {
  const actual = parsear((obj as Record<string, string | number>)[key]);
  const nuevo  = Math.round((actual + delta) * 10000) / 10000;
  obj[key]     = Math.max(min, nuevo);
}

// ── Tab A: Interés a la Vista ─────────────────────────────────────────────────
const resultadoVista = computed(() => {
  const P = parsear(vistaForm.monto);
  const t = parsear(vistaForm.plazoAnios);
  if (P <= 0 || t <= 0) return null;
  const r = TASA_VISTA / 100;
  const interes   = P * r * t;
  const totalFinal = P + interes;
  return { interes, totalFinal };
});

// ── Tab B: Depósito a Plazo Fijo ──────────────────────────────────────────────
const plazoSeleccionado = computed(() => PLAZOS_FIJOS[plazoForm.plazoIdx]);

const resultadoPlazo = computed(() => {
  const P    = parsear(plazoForm.monto);
  if (P <= 0) return null;
  const { meses, tasa } = plazoSeleccionado.value;
  const r     = tasa / 100;
  const anios = meses / 12;
  // Interés simple (fórmula BPA para plazo fijo)
  const interes    = P * r * anios;
  const totalFinal = P + interes;
  return { interes, totalFinal, tasa };
});

// ── Tab C: Crédito ────────────────────────────────────────────────────────────
interface FilaAmortizacion {
  mes:      number;
  cuota:    number;
  interes:  number;
  capital:  number;
  saldo:    number;
}

const resultadoCredito = computed(() => {
  const P = parsear(creditoForm.monto);
  const n = Math.round(parsear(creditoForm.plazoMeses));
  const tasaAnual = parsear(creditoForm.tasaAnual);
  if (P <= 0 || n <= 0 || tasaAnual <= 0) return null;

  const r = tasaAnual / 100 / 12; // tasa mensual

  // Cuota mensual fija (sistema francés)
  const cuota = r === 0
    ? P / n
    : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const totalPagar  = cuota * n;
  const totalIntereses = totalPagar - P;

  // Tabla de amortización completa
  const tabla: FilaAmortizacion[] = [];
  let saldo = P;
  for (let mes = 1; mes <= n; mes++) {
    const interesMes = saldo * r;
    const capitalMes = cuota - interesMes;
    saldo -= capitalMes;
    tabla.push({
      mes,
      cuota,
      interes:  interesMes,
      capital:  capitalMes,
      saldo:    Math.max(0, saldo),
    });
  }

  return { cuota, totalPagar, totalIntereses, tabla, n };
});

/**
 * Filas visibles de la tabla: si son ≤ 8 muestra todas; si no,
 * muestra las primeras 4 y las últimas 3 con una fila de separación,
 * salvo que el usuario pida ver la tabla completa.
 */
const filasVisibles = computed((): (FilaAmortizacion | 'ellipsis')[] => {
  if (!resultadoCredito.value) return [];
  const tabla = resultadoCredito.value.tabla;
  if (tablaCompleta.value || tabla.length <= 8) return tabla;
  return [
    ...tabla.slice(0, 4),
    'ellipsis',
    ...tabla.slice(-3),
  ];
});
</script>

<template>
  <div class="w-full">

    <!-- ── Pestañas de navegación ──────────────────────────────────────────── -->
    <div class="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-6">

      <!-- Tab A: Interés a la Vista -->
      <button
        @click="tabActiva = 'vista'"
        class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-slate-200 dark:border-slate-700"
        :class="tabActiva === 'vista'
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'"
      >
        <!-- tabler:coins -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4 flex-shrink-0">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M9 14c0 1.657 2.686 3 6 3s6 -1.343 6 -3s-2.686 -3 -6 -3s-6 1.343 -6 3" />
          <path d="M9 14v4c0 1.656 2.686 3 6 3s6 -1.344 6 -3v-4" />
          <path d="M3 6c0 1.072 1.144 2.062 3 2.598s4.144 .536 6 0c1.856 -.536 3 -1.526 3 -2.598c0 -1.072 -1.144 -2.062 -3 -2.598s-4.144 -.536 -6 0c-1.856 .536 -3 1.526 -3 2.598" />
          <path d="M3 6v10c0 .888 .772 1.45 2 2" />
          <path d="M3 11c0 .888 .772 1.45 2 2" />
        </svg>
        <span class="text-xs sm:text-sm leading-tight text-center">A la Vista</span>
      </button>

      <!-- Tab B: Plazo Fijo -->
      <button
        @click="tabActiva = 'plazo'"
        class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors border-r border-slate-200 dark:border-slate-700"
        :class="tabActiva === 'plazo'
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'"
      >
        <!-- tabler:building-bank -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4 flex-shrink-0">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M3 21l18 0" />
          <path d="M3 10l18 0" />
          <path d="M5 6l7 -3l7 3" />
          <path d="M4 10l0 11" />
          <path d="M20 10l0 11" />
          <path d="M8 14l0 3" />
          <path d="M12 14l0 3" />
          <path d="M16 14l0 3" />
        </svg>
        <span class="text-xs sm:text-sm leading-tight text-center">Plazo Fijo</span>
      </button>

      <!-- Tab C: Crédito -->
      <button
        @click="tabActiva = 'credito'; tablaCompleta = false"
        class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium transition-colors"
        :class="tabActiva === 'credito'
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'"
      >
        <!-- tabler:credit-card -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4 flex-shrink-0">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8" />
          <path d="M3 10l18 0" />
          <path d="M7 15l.01 0" />
          <path d="M11 15l2 0" />
        </svg>
        <span class="text-xs sm:text-sm leading-tight text-center">Crédito</span>
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB A · INTERÉS A LA VISTA                                            -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      mode="out-in"
    >
      <div v-if="tabActiva === 'vista'" key="vista" class="space-y-5">

        <!-- Nota de tasa vigente -->
        <div class="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 px-4 py-3">
          <!-- tabler:info-circle -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 9h.01" />
            <path d="M11 12h1v4h1" />
          </svg>
          <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            Tasa de interés anual vigente para cuentas de ahorro a la vista:
            <strong>{{ TASA_VISTA }}%</strong>. Cálculo orientativo mediante interés simple.
          </p>
        </div>

        <!-- Formulario -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Capital inicial (CUP)
            </label>
            <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <button type="button" @click="ajustar(vistaForm, 'monto', -0.01, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
              <input v-model="vistaForm.monto"
                type="number" min="0" step="0.01" placeholder="0.00"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
              <button type="button" @click="ajustar(vistaForm, 'monto', 0.01, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Plazo (años)
            </label>
            <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <button type="button" @click="ajustar(vistaForm, 'plazoAnios', -0.5, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
              <input v-model="vistaForm.plazoAnios"
                type="number" min="0" step="0.5" placeholder="0"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" />
              <button type="button" @click="ajustar(vistaForm, 'plazoAnios', 0.5, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
            </div>
          </div>
        </div>

        <!-- Resultado -->
        <div v-if="resultadoVista"
          class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
          <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
            <!-- tabler:calculator -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" />
              <path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" />
              <path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" />
              <path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" />
            </svg>
            <span class="font-semibold text-sm">Resultado del cálculo</span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 grid grid-cols-2 gap-4">
            <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Intereses ganados</p>
              <p class="text-xl font-bold text-green-600 dark:text-green-400">
                {{ fmt(resultadoVista.interes) }}
              </p>
              <p class="text-xs text-slate-400 mt-0.5">CUP</p>
            </div>
            <div class="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/40">
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Total al vencimiento</p>
              <p class="text-xl font-bold text-blue-700 dark:text-blue-300">
                {{ fmt(resultadoVista.totalFinal) }}
              </p>
              <p class="text-xs text-slate-400 mt-0.5">CUP</p>
            </div>
          </div>
        </div>

        <p v-else class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-4">
          Ingrese el capital y el plazo para ver el resultado.
        </p>

      </div>
    </Transition>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB B · DEPÓSITO A PLAZO FIJO                                         -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      mode="out-in"
    >
      <div v-if="tabActiva === 'plazo'" key="plazo" class="space-y-5">

        <!-- Tabla de tasas vigentes -->
        <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="bg-slate-800 dark:bg-slate-900 px-4 py-2.5 flex items-center gap-2 text-white">
            <!-- tabler:percentage -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
              <path d="M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
              <path d="M6 18l12 -12" />
            </svg>
            <span class="text-sm font-semibold">Tasas BPA vigentes — Plazo Fijo</span>
          </div>
          <div class="grid grid-cols-4 bg-white dark:bg-slate-800">
            <div
              v-for="(p, idx) in PLAZOS_FIJOS" :key="idx"
              @click="plazoForm.plazoIdx = idx"
              class="cursor-pointer text-center py-3 px-1 border-r last:border-r-0 border-slate-100 dark:border-slate-700 transition-colors"
              :class="plazoForm.plazoIdx === idx
                ? 'bg-blue-600 text-white'
                : 'hover:bg-slate-50 dark:hover:bg-slate-700'"
            >
              <p class="text-lg font-bold">{{ p.tasa }}%</p>
              <p class="text-[11px] mt-0.5"
                :class="plazoForm.plazoIdx === idx ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'">
                {{ p.label }}
              </p>
            </div>
          </div>
        </div>

        <!-- Formulario -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
            Capital a depositar (CUP)
          </label>
          <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
            <button type="button" @click="ajustar(plazoForm, 'monto', -0.01, 0)"
              class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
            <input
              v-model="plazoForm.monto"
              type="number" min="0" step="0.01" placeholder="0.00"
              class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
            <button type="button" @click="ajustar(plazoForm, 'monto', 0.01, 0)"
              class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
          </div>
        </div>

        <!-- Resultado -->
        <div v-if="resultadoPlazo"
          class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
          <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
            <!-- tabler:calculator -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" />
              <path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" />
              <path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" />
              <path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" />
            </svg>
            <span class="font-semibold text-sm">
              Resultado — {{ plazoSeleccionado.label }} al {{ resultadoPlazo.tasa }}%
            </span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 grid grid-cols-2 gap-4">
            <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Intereses al vencimiento</p>
              <p class="text-xl font-bold text-green-600 dark:text-green-400">
                {{ fmt(resultadoPlazo.interes) }}
              </p>
              <p class="text-xs text-slate-400 mt-0.5">CUP</p>
            </div>
            <div class="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/40">
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Capital + Intereses</p>
              <p class="text-xl font-bold text-blue-700 dark:text-blue-300">
                {{ fmt(resultadoPlazo.totalFinal) }}
              </p>
              <p class="text-xs text-slate-400 mt-0.5">CUP</p>
            </div>
          </div>
        </div>

        <p v-else class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-4">
          Ingrese el capital para ver el resultado del plazo seleccionado.
        </p>

      </div>
    </Transition>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB C · CRÉDITO                                                       -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      mode="out-in"
    >
      <div v-if="tabActiva === 'credito'" key="credito" class="space-y-5">

        <!-- Nota informativa -->
        <div class="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 px-4 py-3">
          <!-- tabler:info-circle -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 flex-shrink-0 text-blue-500 mt-0.5">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 9h.01" />
            <path d="M11 12h1v4h1" />
          </svg>
          <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            Cálculo por sistema de cuota fija (método francés). La cuota mensual
            incluye amortización de capital e intereses. Ingrese la tasa anual
            que le indique su gestor de crédito.
          </p>
        </div>

        <!-- Formulario -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Monto del crédito (CUP)
            </label>
            <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <button type="button" @click="ajustar(creditoForm, 'monto', -0.01, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
              <input
                v-model="creditoForm.monto"
                type="number" min="0" step="0.01" placeholder="0.00"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button type="button" @click="ajustar(creditoForm, 'monto', 0.01, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Tasa de interés anual (%)
            </label>
            <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <button type="button" @click="ajustar(creditoForm, 'tasaAnual', -0.1, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
              <input
                v-model="creditoForm.tasaAnual"
                type="number" min="0" step="0.1" placeholder="0.0"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button type="button" @click="ajustar(creditoForm, 'tasaAnual', 0.1, 0)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Plazo (meses)
            </label>
            <div class="campo-numero flex items-stretch rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
              <button type="button" @click="ajustar(creditoForm, 'plazoMeses', -1, 1)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-r border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">−</button>
              <input
                v-model="creditoForm.plazoMeses"
                type="number" min="1" step="1" placeholder="0"
                class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button type="button" @click="ajustar(creditoForm, 'plazoMeses', 1, 1)"
                class="px-3 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 border-l border-slate-200 dark:border-slate-600 transition-colors text-base font-bold select-none">+</button>
            </div>
          </div>
        </div>

        <template v-if="resultadoCredito">

          <!-- Resumen de cuota -->
          <div class="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
            <div class="bg-blue-600 px-5 py-3 flex items-center gap-2 text-white">
              <!-- tabler:calculator -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                class="w-4 h-4">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14" />
                <path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1" />
                <path d="M8 14l0 .01" /><path d="M12 14l0 .01" /><path d="M16 14l0 .01" />
                <path d="M8 17l0 .01" /><path d="M12 17l0 .01" /><path d="M16 17l0 .01" />
              </svg>
              <span class="font-semibold text-sm">Resultado del crédito</span>
            </div>
            <div class="bg-white dark:bg-slate-800 p-5">
              <!-- Cuota destacada -->
              <div class="text-center mb-5 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800">
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide font-semibold">
                  Cuota mensual fija
                </p>
                <p class="text-3xl font-bold text-blue-700 dark:text-blue-300">
                  {{ fmt(resultadoCredito.cuota) }}
                  <span class="text-base font-medium text-blue-400 dark:text-blue-500 ml-1">CUP</span>
                </p>
              </div>
              <!-- Subtotales -->
              <div class="grid grid-cols-3 gap-3">
                <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Capital</p>
                  <p class="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {{ fmt(parsear(creditoForm.monto)) }}
                  </p>
                </div>
                <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Total intereses</p>
                  <p class="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {{ fmt(resultadoCredito.totalIntereses) }}
                  </p>
                </div>
                <div class="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Total a pagar</p>
                  <p class="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {{ fmt(resultadoCredito.totalPagar) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tabla de amortización -->
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div class="bg-slate-800 dark:bg-slate-900 px-4 py-2.5 flex items-center gap-2 text-white">
              <!-- tabler:table -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                class="w-4 h-4">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
                <path d="M3 10h18" />
                <path d="M10 3v18" />
              </svg>
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
                    <!-- Fila de datos -->
                    <tr v-if="fila !== 'ellipsis'"
                      class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      :class="fila.mes === resultadoCredito.n ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''"
                    >
                      <td class="text-center px-3 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs">
                        {{ fila.mes }}
                      </td>
                      <td class="text-right px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">
                        {{ fmt(fila.cuota) }}
                      </td>
                      <td class="text-right px-3 py-2 text-amber-600 dark:text-amber-400">
                        {{ fmt(fila.interes) }}
                      </td>
                      <td class="text-right px-3 py-2 text-green-600 dark:text-green-400">
                        {{ fmt(fila.capital) }}
                      </td>
                      <td class="text-right px-3 py-2 text-slate-700 dark:text-slate-300">
                        {{ fmt(fila.saldo) }}
                      </td>
                    </tr>
                    <!-- Fila separadora (ellipsis) -->
                    <tr v-else class="bg-slate-50 dark:bg-slate-800/30">
                      <td colspan="5" class="text-center py-2 text-xs text-slate-400 dark:text-slate-500 tracking-widest">
                        · · ·
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- Botón mostrar todo / colapsar -->
            <div
              v-if="resultadoCredito.n > 8"
              class="border-t border-slate-100 dark:border-slate-700 px-4 py-2.5 bg-white dark:bg-slate-800/50 flex justify-center"
            >
              <button
                @click="tablaCompleta = !tablaCompleta"
                class="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
              >
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

    <!-- Aviso legal general -->
    <p class="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
      Resultados orientativos. Las condiciones reales del producto pueden variar.
      Consulte con su gestor en la sucursal BPA más cercana.
    </p>

  </div>
</template>

<style scoped>
/*
 * Oculta los botones de incremento/decremento nativos del navegador en los
 * inputs de tipo number, para que solo se vean los botones +/− propios.
 * Funciona en Chrome/Chromium (webkit) y Firefox (moz).
 */
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
