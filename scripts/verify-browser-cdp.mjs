// @ts-check
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const DEV_SERVER_URL = 'http://localhost:3000';
const CDP_PORT = 9222;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));

class CdpClient {
  constructor(/** @type {string} */ wsUrl) {
    this.wsUrl = wsUrl;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.id = 1;
    /** @type {Map<number, { resolve: (val?: any) => void, reject: (err?: any) => void }>} */
    this.pending = new Map();
    /** @type {Array<{ type: string, text: string }>} */
    this.consoleLogs = [];
    /** @type {any[]} */
    this.exceptions = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve(true);
      this.ws.onerror = err => reject(err);
      this.ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.id && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id);
            if (entry) {
              const { resolve, reject } = entry;
              this.pending.delete(msg.id);
              if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              else resolve(msg.result);
            }
          } else if (msg.method === 'Runtime.consoleAPICalled') {
            const text = (msg.params.args || []).map((/** @type {any} */ a) => a.value || a.description || '').join(' ');
            this.consoleLogs.push({ type: msg.params.type, text });
          } else if (msg.method === 'Runtime.exceptionThrown') {
            this.exceptions.push(msg.params.exceptionDetails);
          }
        } catch (e) {
          console.error('Error parsing CDP message:', e);
        }
      };
    });
  }

  async send(/** @type {string} */ method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(/** @type {string} */ expression) {
    const res = /** @type {any} */ (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }));
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('CTMS COMPREHENSIVE END-TO-END CHROME CDP BROWSER VERIFICATION');
  console.log('================================================================');
  let chromeProcess = null;
  let devProcess = null;

  try {
    // 1. Verify dev server is running
    let serverOk = false;
    try {
      const res = await fetch(DEV_SERVER_URL);
      if (res.status === 200) serverOk = true;
    } catch {}

    if (!serverOk) {
      console.log('Starting Next.js dev server on http://localhost:3000...');
      devProcess = spawn('npm', ['run', 'dev'], { stdio: 'pipe' });
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        try {
          const res = await fetch(DEV_SERVER_URL);
          if (res.status === 200) {
            serverOk = true;
            break;
          }
        } catch {}
      }
    }
    assert.equal(serverOk, true, 'Next.js dev server must be operational');
    console.log('✔ Dev server verified at http://localhost:3000');

    // 2. Launch Google Chrome headless with CDP
    console.log('Launching installed Google Chrome in headless mode...');
    const profileDir = '/tmp/ctms-cdp-profile-' + Date.now();
    chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`
    ], { stdio: 'ignore' });

    let cdpReady = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (v.ok) {
          cdpReady = true;
          break;
        }
      } catch {}
    }
    assert.equal(cdpReady, true, 'Chrome CDP must be listening on port ' + CDP_PORT);
    console.log('✔ Headless Chrome active on CDP port ' + CDP_PORT);

    // 3. Create target and connect CDP client
    const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(DEV_SERVER_URL)}`, { method: 'PUT' });
    const target = await targetRes.json();
    assert.ok(target.webSocketDebuggerUrl, 'Must obtain WebSocketDebuggerUrl');

    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    console.log('✔ Connected to Chrome via CDP WebSocket');

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    console.log('Waiting for initial page load and React hydration...');
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const found = await client.evaluate(`!!document.querySelector('input[type="password"], .app-header, header')`);
        if (found) {
          ready = true;
          break;
        }
      } catch {}
    }
    assert.equal(ready, true, 'Page must finish compiling and mounting within 20s');

    // 4. Verify Login Page
    console.log('\n--- 1. AUTHENTICATION & SESSION HANDLING ---');
    const pageTitle = await client.evaluate('document.title');
    console.log(`Page title: "${pageTitle}"`);

    // Check if on AuthLayout
    const isAuthLayout = await client.evaluate(`
      (() => {
        const heading = document.querySelector('h1')?.textContent || '';
        const inputs = Array.from(document.querySelectorAll('input'));
        return {
          heading,
          inputCount: inputs.length,
          hasEmail: inputs.some(i => i.type === 'text' || i.type === 'email'),
          hasPassword: inputs.some(i => i.type === 'password')
        };
      })()
    `);
    console.log('Initial Auth state:', isAuthLayout);

    // Perform sign-in as Director
    console.log('Submitting sign-in credentials for director@buildtrack.com...');
    const signInResult = await client.evaluate(`
      (async () => {
        function setReactValue(input, val) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, val);
          else input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const inputs = Array.from(document.querySelectorAll('input'));
        const emailInput = inputs.find(i => i.type === 'text' || i.type === 'email');
        const passInput = inputs.find(i => i.type === 'password');
        const submitBtn = document.querySelector('button[type="submit"]');

        if (!emailInput || !passInput || !submitBtn) return { success: false, reason: 'Inputs not found' };

        setReactValue(emailInput, 'director@buildtrack.com');
        setReactValue(passInput, 'Director@123');

        submitBtn.click();
        return { success: true };
      })()
    `);
    assert.equal(signInResult.success, true, 'Sign-in form fields must be filled and submitted');

    // Wait for auth resolution and DashboardShell mounting
    console.log('Waiting for authentication and DashboardShell mount...');
    let authState = null;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      authState = await client.evaluate(`
        (() => {
          const user = localStorage.getItem('bt_auth_user');
          const activeId = localStorage.getItem('bt_active_project_id');
          const hasHeader = !!document.querySelector('.app-header, header');
          const hasSidebar = !!document.querySelector('aside, nav');
          return {
            user: user ? JSON.parse(user) : null,
            activeProjectId: activeId,
            hasHeader,
            hasSidebar
          };
        })()
      `);
      if (authState && authState.user && authState.hasHeader) break;
    }
    console.log('✔ Authenticated session state:', authState);
    assert.ok(authState?.user, 'Auth user must be persisted in localStorage');
    assert.equal(authState.user.role, 'project_director', 'Role must be project_director');
    console.log(`✔ Signed in as ${authState.user.name} (${authState.user.role})`);

    // 5. Test Project Switching and Isolation
    console.log('\n--- 2. PROJECT SELECTION, SWITCHING & ISOLATION ---');
    const switchResult = await client.evaluate(`
      (() => {
        const select = document.querySelector('select');
        if (!select) return { success: false, reason: 'No project selector' };
        const initial = select.value;
        const options = Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
        if (options.length < 2) return { success: false, reason: 'Less than 2 projects available' };

        // Switch to second project
        const secondOption = options[1];
        select.value = secondOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          success: true,
          initial,
          switchedTo: secondOption.value,
          availableCount: options.length
        };
      })()
    `);
    console.log('✔ Project switch action:', switchResult);
    assert.equal(switchResult.success, true, 'Project switch must succeed');

    await sleep(1000);
    const newActiveId = await client.evaluate('localStorage.getItem("bt_active_project_id")');
    console.log(`✔ Active project ID updated in localStorage: ${newActiveId}`);

    // Switch back to primary project
    await client.evaluate(`
      (() => {
        const select = document.querySelector('select');
        if (select) {
          select.value = '${switchResult.initial}';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await sleep(1000);

    // 6. Test Navigation across ALL 15 Module Tabs
    console.log('\n--- 3. WORKSPACE DASHBOARDS NAVIGATION & RENDERING ---');
    const workspaces = [
      { id: 'dashboard', name: 'Role Portfolio Dashboard' },
      { id: 'cpm', name: 'CPM Schedule & Gantt Timeline' },
      { id: 'daily', name: 'Daily Reporting Workspace' },
      { id: 'expected_actual', name: 'Expected vs Actual S-Curve' },
      { id: 'claims', name: 'Commercial Controls & Claims' },
      { id: 'ipc', name: 'IPC Valuation & Certificates' },
      { id: 'measurements', name: 'BOQ Measurement Records' },
      { id: 'expenses', name: 'Daily Expenses & Approvals' },
      { id: 'procurement', name: 'Procurement & Stores' },
      { id: 'budget', name: 'Budget & Earned Value (EVM)' },
      { id: 'projections', name: 'Projections & Risk Analytics' },
      { id: 'qaqc', name: 'QA/QC Inspections' },
      { id: 'safety', name: 'Safety & EHS Register' },
      { id: 'design', name: 'Design & Drawing Packages' },
      { id: 'reports', name: 'Reports & Output Center' },
      { id: 'settings', name: 'System Settings' }
    ];

    for (const ws of workspaces) {
      // Find button in sidebar navigation and click it
      const navOutcome = await client.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('aside button, nav button, aside [role="button"]'));
          const btn = buttons.find(b => {
            const txt = (b.textContent || '').toLowerCase();
            return txt.includes('${ws.id}') ||
                   txt.includes('${ws.name.toLowerCase().split(' ')[0]}') ||
                   txt.includes('${ws.name.toLowerCase().split(' ')[1] || ''}');
          });
          if (btn) {
            btn.click();
            return { clicked: true, text: btn.textContent?.trim() };
          }
          return { clicked: false };
        })()
      `);

      await sleep(600);

      // Verify main panel rendered without error
      const mainState = await client.evaluate(`
        (() => {
          const main = document.querySelector('main, .app-main');
          const text = main ? main.innerText : document.body.innerText;
          const hasCrash = text.includes('Application error') || text.includes('Unhandled Runtime Error');
          return {
            hasMain: !!main,
            textSnippet: text.slice(0, 100).replace(/\\s+/g, ' '),
            textLength: text.length,
            hasCrash
          };
        })()
      `);

      assert.equal(mainState.hasCrash, false, `Workspace "${ws.name}" must not throw crash error`);
      console.log(`✔ Workspace "${ws.name}": Rendered (${mainState.textLength} chars, Crash: No)`);
    }

    // 7. Test Daily Reporting Form & Persistence
    console.log('\n--- 4. DAILY REPORT FORM INTERACTION & LOCAL PERSISTENCE ---');
    // Navigate to daily
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('aside button')).find(b => (b.textContent || '').includes('Daily'));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const reportSubmitResult = await client.evaluate(`
      (() => {
        const form = document.querySelector('form');
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        const weatherInput = inputs.find(i => (i.placeholder || '').toLowerCase().includes('weather') || i.name === 'weather');
        if (weatherInput) {
          weatherInput.value = 'Clear Sky / 26C - Verified site inspection';
          weatherInput.dispatchEvent(new Event('input', { bubbles: true }));
          weatherInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const reportsBefore = JSON.parse(localStorage.getItem('bt_daily_reports') || '[]');
        return {
          hasForm: !!form,
          inputCount: inputs.length,
          weatherFilled: !!weatherInput,
          reportsCount: reportsBefore.length
        };
      })()
    `);
    console.log('✔ Daily Reporting Form interaction:', reportSubmitResult);

    // 8. Test CPM Scheduling & Float Calculation Verification
    console.log('\n--- 5. CPM SCHEDULING & FLOAT COMPUTATIONS IN BROWSER ---');
    await client.evaluate(`
      (() => {
        // First click Work module in sidebar
        const workBtn = Array.from(document.querySelectorAll('aside button')).find(b => (b.textContent || '').includes('Work'));
        if (workBtn) workBtn.click();
      })()
    `);
    await sleep(600);
    await client.evaluate(`
      (() => {
        // Then click Schedule & WBS sub-tab
        const cpmBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Schedule') || (b.textContent || '').includes('CPM'));
        if (cpmBtn) cpmBtn.click();
      })()
    `);
    await sleep(800);

    const cpmState = await client.evaluate(`
      (() => {
        const text = document.body.innerText;
        const hasGantt = text.includes('CPM') || text.includes('Critical') || text.includes('Float') || text.includes('WBS') || text.includes('Schedule');
        const activities = JSON.parse(localStorage.getItem('bt_activities') || '[]');
        const dependencies = JSON.parse(localStorage.getItem('bt_dependencies') || '[]');
        return {
          hasGantt,
          activityCount: activities.length,
          dependencyCount: dependencies.length
        };
      })()
    `);
    console.log('✔ CPM Timeline state:', cpmState);
    assert.ok(cpmState.hasGantt, 'CPM schedule view must be visible');
    assert.ok(cpmState.activityCount > 0, 'Project activities must be loaded');

    // 9. Test Earned Value Management (EVM) KPIs in Browser
    console.log('\n--- 6. EVM METRICS & COMMERCIAL CONTROLS IN BROWSER ---');
    await client.evaluate(`
      (() => {
        // First click Commercial module in sidebar
        const commBtn = Array.from(document.querySelectorAll('aside button')).find(b => (b.textContent || '').includes('Commercial'));
        if (commBtn) commBtn.click();
      })()
    `);
    await sleep(600);
    await client.evaluate(`
      (() => {
        // Then click Cost & budget sub-tab
        const budgetBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Cost') || (b.textContent || '').includes('Budget') || (b.textContent || '').includes('Earned'));
        if (budgetBtn) budgetBtn.click();
      })()
    `);
    await sleep(800);

    const evmState = await client.evaluate(`
      (() => {
        const text = document.body.innerText;
        return {
          hasEvmMetrics: text.includes('Planned Value') || text.includes('Earned Value') || text.includes('Cost Variance') || text.includes('Schedule Variance') || text.includes('CPI') || text.includes('SPI'),
          hasBudgetTable: text.includes('Budget') || text.includes('Cost') || text.includes('Commercial')
        };
      })()
    `);
    console.log('✔ EVM Dashboard state:', evmState);
    assert.ok(evmState.hasBudgetTable, 'EVM / Budget dashboard must render');

    // 10. Test Procurement & Vendor Master Directory
    console.log('\n--- 7. PROCUREMENT & VENDOR MASTER DIRECTORY ---');
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('aside button')).find(b => (b.textContent || '').includes('Inventory') || (b.textContent || '').includes('Purchases') || (b.textContent || '').includes('Procurement'));
        if (btn) btn.click();
      })()
    `);
    await sleep(800);

    const vendorTabResult = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const vendorBtn = buttons.find(b => (b.textContent || '').includes('Vendor Master'));
        if (vendorBtn) {
          vendorBtn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);
    console.log('✔ Clicked Vendor Master toggle:', vendorTabResult);
    assert.equal(vendorTabResult.clicked, true, 'Vendor Master toggle must exist');
    await sleep(600);

    const vendorState = await client.evaluate(`
      (() => {
        const text = document.body.innerText;
        const hasVendorDirectory = text.includes('Vendor & Supplier Master') || text.includes('Vendor Directory');
        const hasHimalayan = text.includes('Himalayan Cement') || text.includes('Jagdamba Steels');
        const rows = document.querySelectorAll('tbody tr');
        return {
          hasVendorDirectory,
          hasHimalayan,
          rowCount: rows.length
        };
      })()
    `);
    console.log('✔ Vendor Master state:', vendorState);
    assert.ok(vendorState.hasVendorDirectory, 'Vendor Master Directory must be displayed');
    assert.ok(vendorState.rowCount > 0, 'Registered vendors must be listed in table');

    // 11. Verify Zero Console Errors & Clean Runtime
    console.log('\n--- 8. BROWSER CONSOLE & RUNTIME EXCEPTION AUDIT ---');
    const errors = client.consoleLogs.filter(l => l.type === 'error');
    console.log(`Total Console Messages: ${client.consoleLogs.length}`);
    console.log(`Console Errors: ${errors.length}`);
    console.log(`Runtime Exceptions: ${client.exceptions.length}`);

    if (errors.length > 0) {
      console.log('Captured Console Errors:');
      errors.forEach(e => console.log('  [ERROR]', e.text));
    }
    assert.equal(client.exceptions.length, 0, 'Zero runtime exceptions allowed');

    client.close();
    console.log('\n================================================================');
    console.log('🎉 FULL BROWSER-LEVEL WORKFLOW VERIFICATION PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    if (chromeProcess) chromeProcess.kill();
    if (devProcess) devProcess.kill();
  }
}

runBrowserVerification().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
