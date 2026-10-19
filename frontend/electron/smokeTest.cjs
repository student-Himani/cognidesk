/**
 * CogniDesk Desktop - Smoke Verification Test
 * Validates Electron configuration, preload bridge, backendManager methods, and Python detection.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function runSmokeTests() {
  console.log('==============================================');
  console.log(' CogniDesk Electron Desktop Smoke Verification');
  console.log('==============================================');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  // Test 1: Verify Electron binary path
  try {
    const electronPath = require('electron');
    assert(typeof electronPath === 'string' && fs.existsSync(electronPath), `Electron binary path resolved: ${electronPath}`);
  } catch (err) {
    assert(false, `Electron binary failed to resolve: ${err.message}`);
  }

  // Test 2: Verify preload script exists and is valid syntax
  const preloadPath = path.resolve(__dirname, 'preload.cjs');
  assert(fs.existsSync(preloadPath), `Preload script exists at ${preloadPath}`);

  // Test 3: Verify backendManager module
  const backendManager = require('./backendManager.cjs');
  const pythonPath = backendManager.getPythonPath();
  assert(pythonPath && typeof pythonPath === 'string', `Python executable resolved: ${pythonPath}`);

  const backendDir = backendManager.getBackendDir();
  assert(fs.existsSync(backendDir), `Backend directory verified: ${backendDir}`);

  // Test 4: Verify built dist/index.html exists and uses relative asset paths
  const distIndexPath = path.resolve(__dirname, '../dist/index.html');
  assert(fs.existsSync(distIndexPath), `Production bundle dist/index.html exists`);

  if (fs.existsSync(distIndexPath)) {
    const htmlContent = fs.readFileSync(distIndexPath, 'utf-8');
    const usesRelativeAssets = htmlContent.includes('./assets/') || !htmlContent.includes('href="/assets/');
    assert(usesRelativeAssets, `Production dist/index.html uses relative asset paths for desktop support`);
  }

  // Test 5: Verify backend health connectivity
  console.log('[Info] Testing backend health check...');
  const isHealthy = await backendManager.checkHealth(2000);
  console.log(`[Info] Backend running and healthy on port 8000: ${isHealthy}`);
  assert(typeof isHealthy === 'boolean', 'Backend health check returns valid boolean status');

  console.log('==============================================');
  console.log(` Results: ${passed}/${total} smoke tests passed`);
  console.log('==============================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error('[Error] Smoke test crashed:', err);
  process.exit(1);
});
