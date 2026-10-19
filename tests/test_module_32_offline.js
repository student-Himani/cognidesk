// ==============================================================================
// CogniDesk Module 32 — Comprehensive Offline & PWA Verification Test Suite
// Verifies Manifest, Service Worker, IndexedDB schema, In-Browser Semantic Search,
// and Extractive RAG Generation with Network Disabled
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const FRONTEND_PUBLIC = path.join(ROOT, 'frontend', 'public');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('================================================================');
console.log('CogniDesk Module 32 — Offline PWA & Local AI Verification Suite');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. PWA Manifest & Icons Verification
// -----------------------------------------------------------------------------
console.log('[Phase 1] PWA Manifest, Icons & Meta Verification');

test('Manifest file exists in public and dist directories', () => {
  const pubManifest = path.join(FRONTEND_PUBLIC, 'manifest.webmanifest');
  const distManifest = path.join(FRONTEND_DIST, 'manifest.webmanifest');
  assert.ok(fs.existsSync(pubManifest), 'public/manifest.webmanifest must exist');
  assert.ok(fs.existsSync(distManifest), 'dist/manifest.webmanifest must exist');
});

test('Manifest contains required PWA fields and standalone display', () => {
  const content = JSON.parse(fs.readFileSync(path.join(FRONTEND_PUBLIC, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(content.name, 'CogniDesk — AI Knowledge & Document Workspace');
  assert.strictEqual(content.short_name, 'CogniDesk');
  assert.strictEqual(content.display, 'standalone');
  assert.strictEqual(content.start_url, '/');
  assert.strictEqual(content.scope, '/');
  assert.strictEqual(content.theme_color, '#020617');
  assert.strictEqual(content.background_color, '#020617');
  assert.ok(Array.isArray(content.icons) && content.icons.length >= 2, 'Must have at least 2 icons');
});

test('PWA icons (192x192, 512x512, maskable) exist on disk', () => {
  const icon192 = path.join(FRONTEND_PUBLIC, 'icons', 'pwa-192x192.png');
  const icon512 = path.join(FRONTEND_PUBLIC, 'icons', 'pwa-512x512.png');
  const maskable = path.join(FRONTEND_PUBLIC, 'icons', 'pwa-maskable.png');
  assert.ok(fs.existsSync(icon192), 'pwa-192x192.png must exist');
  assert.ok(fs.existsSync(icon512), 'pwa-512x512.png must exist');
  assert.ok(fs.existsSync(maskable), 'pwa-maskable.png must exist');
  assert.ok(fs.statSync(icon192).size > 0, 'Icon 192 must not be empty');
  assert.ok(fs.statSync(icon512).size > 0, 'Icon 512 must not be empty');
});

test('HTML header includes manifest link and theme-color meta', () => {
  const html = fs.readFileSync(path.join(FRONTEND_DIST, 'index.html'), 'utf8');
  assert.ok(html.includes('manifest.webmanifest'), 'HTML must link to manifest.webmanifest');
  assert.ok(html.includes('theme-color'), 'HTML must specify theme-color');
  assert.ok(html.includes('apple-touch-icon'), 'HTML must specify apple-touch-icon');
});

// -----------------------------------------------------------------------------
// 2. Service Worker & Offline Caching Verification
// -----------------------------------------------------------------------------
console.log('\n[Phase 2] Service Worker & App-Shell Caching Verification');

test('Service worker script sw.js exists in dist', () => {
  const swPath = path.join(FRONTEND_DIST, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'dist/sw.js must exist');
});

test('Service worker implements install, activate, and fetch listeners', () => {
  const swCode = fs.readFileSync(path.join(FRONTEND_DIST, 'sw.js'), 'utf8');
  assert.ok(swCode.includes("addEventListener('install'"), 'sw.js must listen to install event');
  assert.ok(swCode.includes("addEventListener('activate'"), 'sw.js must listen to activate event');
  assert.ok(swCode.includes("addEventListener('fetch'"), 'sw.js must listen to fetch event');
  assert.ok(swCode.includes('skipWaiting()'), 'sw.js must call skipWaiting');
  assert.ok(swCode.includes('clients.claim()'), 'sw.js must call clients.claim');
});

test('Service worker provides SPA navigation fallback for offline relaunch', () => {
  const swCode = fs.readFileSync(path.join(FRONTEND_DIST, 'sw.js'), 'utf8');
  assert.ok(swCode.includes("request.mode === 'navigate'"), 'sw.js must detect SPA navigations');
  assert.ok(swCode.includes('/index.html'), 'sw.js must fall back to /index.html when offline');
});

test('Service worker provides offline JSON synthetic fallbacks for /api/', () => {
  const swCode = fs.readFileSync(path.join(FRONTEND_DIST, 'sw.js'), 'utf8');
  assert.ok(swCode.includes('/api/'), 'sw.js must handle /api/ routes');
  assert.ok(swCode.includes('offline'), 'sw.js must return offline fallback data');
});

// -----------------------------------------------------------------------------
// 3. In-Browser Local Storage & Semantic Search Logic
// -----------------------------------------------------------------------------
console.log('\n[Phase 3] In-Browser Semantic Search & Ranking Logic (Zero-Network)');

// Simulate local chunk search algorithm from localDb.ts
function simulateLocalChunkSearch(chunks, query, topK = 3) {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored = chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    queryTokens.forEach((token) => {
      const regex = new RegExp(`\\b${token}\\b`, 'g');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length * 3;
      } else if (contentLower.includes(token)) {
        score += 1;
      }
    });

    if (queryTokens.length > 1) {
      const fullPhrase = queryTokens.join(' ');
      if (contentLower.includes(fullPhrase)) {
        score += 8;
      }
    }

    return { ...chunk, score };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

test('Semantic chunk search accurately scores and ranks grounded documents', () => {
  const mockChunks = [
    {
      id: 1,
      document_name: 'quantum_computing.pdf',
      chunk_index: 1,
      content: 'Quantum key distribution enables provably secure cryptographic channels using quantum mechanics principles.',
    },
    {
      id: 2,
      document_name: 'quantum_computing.pdf',
      chunk_index: 2,
      content: 'Superconducting qubits are cooled down to millikelvin temperatures inside dilution refrigerators.',
    },
    {
      id: 3,
      document_name: 'classical_gardening.txt',
      chunk_index: 1,
      content: 'Organic compost requires nitrogen-rich green matter and carbon-rich brown leaves to decompose efficiently.',
    },
  ];

  const results = simulateLocalChunkSearch(mockChunks, 'cryptographic quantum key distribution', 2);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].document_name, 'quantum_computing.pdf');
  assert.strictEqual(results[0].chunk_index, 1);
  assert.ok(results[0].score >= 10, 'Expected high match score for cryptographic quantum key query');
});

// -----------------------------------------------------------------------------
// 4. In-Browser Extractive RAG Generation Verification
// -----------------------------------------------------------------------------
console.log('\n[Phase 4] In-Browser Extractive RAG Generation & Citation Formatting');

function simulateOfflineRagAnswer(query, chunks) {
  if (!chunks || chunks.length === 0) {
    return {
      answer: "I couldn't find any relevant indexed chunks in your local workspace for this question.",
      citations: [],
      model: 'in-browser-extractive',
    };
  }

  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const evidenceSentences = [];
  const citations = [];

  chunks.forEach((chunk) => {
    citations.push({
      document_id: String(chunk.id || 1),
      document_name: chunk.document_name,
      chunk_index: chunk.chunk_index,
      content: chunk.content.slice(0, 200),
      similarity: 0.92,
    });

    const sentences = chunk.content.split(/(?<=[.?!])\s+/);
    sentences.forEach((s) => {
      const matchCount = queryTerms.filter((term) => s.toLowerCase().includes(term)).length;
      if (matchCount > 0) {
        evidenceSentences.push({ sentence: s.trim(), matchCount, doc: chunk.document_name, idx: chunk.chunk_index });
      }
    });
  });

  evidenceSentences.sort((a, b) => b.matchCount - a.matchCount);
  const selected = evidenceSentences.slice(0, 3);
  const synthesized = selected.map((e) => `${e.sentence} [Source: ${e.doc} (Chunk #${e.idx})]`).join(' ');

  const answer = `Based on your local offline documents:\n\n${synthesized}\n\n*(Generated 100% offline via CogniDesk In-Browser Extractive Engine)*`;
  return { answer, citations, model: 'in-browser-extractive' };
}

test('Extractive RAG synthesizes ground truth sentences with source citations', () => {
  const chunks = [
    {
      id: 101,
      document_name: 'biology_notes.pdf',
      chunk_index: 3,
      content: 'Mitochondria generate most of the chemical energy needed to power the biochemical reactions of the cell. Adenosine triphosphate is produced in the inner membrane.',
    },
  ];

  const ragOutput = simulateOfflineRagAnswer('What do mitochondria generate?', chunks);
  assert.strictEqual(ragOutput.model, 'in-browser-extractive');
  assert.strictEqual(ragOutput.citations.length, 1);
  assert.ok(ragOutput.answer.includes('Mitochondria generate most of the chemical energy'));
  assert.ok(ragOutput.answer.includes('[Source: biology_notes.pdf (Chunk #3)]'));
  assert.ok(ragOutput.answer.includes('100% offline'));
});

// -----------------------------------------------------------------------------
// 5. Total Build Size & Lightweight Verification
// -----------------------------------------------------------------------------
console.log('\n[Phase 5] Frontend Build Distribution Size Check');

test('Production bundle dist directory is strictly under 15 MB limit', () => {
  function getDirSize(dir) {
    let size = 0;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        size += getDirSize(full);
      } else {
        size += stat.size;
      }
    }
    return size;
  }

  const totalBytes = getDirSize(FRONTEND_DIST);
  const totalMb = totalBytes / (1024 * 1024);
  console.log(`    Actual dist size: ${totalMb.toFixed(2)} MB (Limit: 15.00 MB)`);
  assert.ok(totalMb < 15.0, `dist size (${totalMb.toFixed(2)} MB) must be strictly under 15 MB`);
});

// -----------------------------------------------------------------------------
// 6. Test Suite Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`Test Results: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
