// descargar-tiles.mjs
// Ejecutar desde la raíz del proyecto: node descargar-tiles.mjs
// Descarga tiles de OpenStreetMap para Santiago de Cuba, zoom 10-15

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// ── Configuración ─────────────────────────────────────────────────────────────
const CONFIG = {
  minZoom:   10,
  maxZoom:   16,
  // Bounding box de la provincia de Santiago de Cuba
  // [oeste, sur, este, norte]
  bbox: { west: -77.25, south: 19.70, east: -75.20, north: 20.65 },
  outputDir: './public/tiles',
  delayMs:   600,  // ms entre peticiones (respetar límite de OSM)
  source:    'https://tile.openstreetmap.org',
};

// ── Conversión grados → número de tile ────────────────────────────────────────
function lonToTileX(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function latToTileY(lat, zoom) {
  const rad = lat * Math.PI / 180;
  return Math.floor(
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom)
  );
}

// ── Descarga de un tile individual ───────────────────────────────────────────
function descargarTile(z, x, y) {
  return new Promise((resolve, reject) => {
    const dir      = path.join(CONFIG.outputDir, String(z), String(x));
    const filePath = path.join(dir, `${y}.png`);

    // Si ya existe, saltar
    if (fs.existsSync(filePath)) {
      resolve('skip');
      return;
    }

    fs.mkdirSync(dir, { recursive: true });

    const url     = `${CONFIG.source}/${z}/${x}/${y}.png`;
    const options = {
      headers: {
        'User-Agent': 'BPA-Portal-Santiago/1.0 (intranet institucional)',
      },
    };

    const file = fs.createWriteStream(filePath);
    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filePath);
        reject(new Error(`HTTP ${res.statusCode} para ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve('ok'); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      reject(err);
    });
  });
}

// ── Delay ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Calcular total de tiles ───────────────────────────────────────────────────
function contarTiles() {
  let total = 0;
  for (let z = CONFIG.minZoom; z <= CONFIG.maxZoom; z++) {
    const x1 = lonToTileX(CONFIG.bbox.west,  z);
    const x2 = lonToTileX(CONFIG.bbox.east,  z);
    const y1 = latToTileY(CONFIG.bbox.north, z);
    const y2 = latToTileY(CONFIG.bbox.south, z);
    total += (x2 - x1 + 1) * (y2 - y1 + 1);
  }
  return total;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const totalEstimado = contarTiles();
  console.log(`\n  Descarga de tiles — Santiago de Cuba`);
  console.log(`  Zoom: ${CONFIG.minZoom}–${CONFIG.maxZoom}`);
  console.log(`  Total estimado: ${totalEstimado} tiles`);
  console.log(`  Destino: ${CONFIG.outputDir}\n`);

  let descargados = 0;
  let saltados    = 0;
  let errores     = 0;
  let procesados  = 0;

  for (let z = CONFIG.minZoom; z <= CONFIG.maxZoom; z++) {
    const x1 = lonToTileX(CONFIG.bbox.west,  z);
    const x2 = lonToTileX(CONFIG.bbox.east,  z);
    const y1 = latToTileY(CONFIG.bbox.north, z);
    const y2 = latToTileY(CONFIG.bbox.south, z);

    const tilesEnZoom = (x2 - x1 + 1) * (y2 - y1 + 1);
    console.log(`  Zoom ${z} → ${tilesEnZoom} tiles (x: ${x1}–${x2}, y: ${y1}–${y2})`);

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        procesados++;
        try {
          const resultado = await descargarTile(z, x, y);
          if (resultado === 'skip') {
            saltados++;
          } else {
            descargados++;
            await sleep(CONFIG.delayMs);
          }
        } catch (err) {
          errores++;
          console.error(`  Error ${z}/${x}/${y}: ${err.message}`);
        }

        // Progreso cada 10 tiles
        if (procesados % 10 === 0) {
          const pct = Math.round(procesados / totalEstimado * 100);
          process.stdout.write(`  >> ${procesados}/${totalEstimado} (${pct}%) — Descargados: ${descargados} — Saltados: ${saltados} — Errores: ${errores}\r`);
        }
      }
    }
  }

  console.log(`\n\n  Descarga completada`);
  console.log(`   Descargados: ${descargados}`);
  console.log(`   Ya existían: ${saltados}`);
  console.log(`   Errores:     ${errores}`);
}

main().catch(console.error);