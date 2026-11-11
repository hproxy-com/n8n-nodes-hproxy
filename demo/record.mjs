// Records the demo video for n8n's verification review in one take (.github/workflows/demo-video.yml runs it on a
// throwaway GitHub machine): sign in to a fresh n8n, install @hproxy/n8n-nodes-hproxy from npm, create the HProxy
// credential and show its test passing, run three actions, then give an AI agent (a small open model through Ollama)
// the HProxy node as its tool and ask it something. Selectors follow n8n's own Playwright tests at n8n@2.44.7.
// A drawn cursor shows where each click lands; every step leaves a screenshot in out/ for debugging.
import { appendFileSync, mkdirSync } from "node:fs";
import { chromium, selectors } from "playwright";

// n8n marks its elements with data-test-id (its own Playwright config sets the same).
selectors.setTestIdAttribute("data-test-id");

const BASE = "http://localhost:5678";
const OUT = new URL("./out/", import.meta.url).pathname;
const KEY = process.env.HPROXY_API_KEY;
const PKG = (process.env.NODE_PACKAGE || "@hproxy/n8n-nodes-hproxy").replace(/@[\d.]+$/, "");
const WANT_VERSION = (process.env.NODE_PACKAGE || "").match(/@([\d.]+)$/)?.[1] || "";
const OWNER = { email: "demo@example.com", password: "Hproxy-demo-2026", firstName: "HProxy", lastName: "Demo" };
mkdirSync(OUT, { recursive: true });
if (!KEY) throw new Error("HPROXY_API_KEY is not set");

const started = Date.now();
const log = (m) => {
  const line = `[${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s] ${m}`;
  console.log(line);
  appendFileSync(`${OUT}steps.log`, `${line}\n`);
};

// The owner account is made through the API before the camera runs (a fresh n8n asks for it once).
const setup = await fetch(`${BASE}/rest/owner/setup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(OWNER),
});
log(`owner setup: HTTP ${setup.status}`);

const CURSOR = `
(() => {
  const draw = () => {
    if (document.getElementById('__demo_cursor') || !document.body) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(720px,450px);';
    const ring = document.createElement('div');
    ring.id = '__demo_ring';
    ring.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border:3px solid #ff3d7f;border-radius:50%;z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .35s, transform .35s;';
    document.body.appendChild(ring);
    document.body.appendChild(c);
    document.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    document.addEventListener('mousedown', (e) => {
      ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(.6)';
      requestAnimationFrame(() => { ring.style.transition = 'opacity .45s, transform .45s'; ring.style.opacity = '0'; ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(1.6)'; });
    }, true);
  };
  document.addEventListener('DOMContentLoaded', draw);
  setInterval(draw, 500);
})();`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
await context.addInitScript(CURSOR);
const page = await context.newPage();
page.setDefaultTimeout(30000);

let shots = 0;
const shot = async (name) => page.screenshot({ path: `${OUT}${String(++shots).padStart(2, "0")}-${name}.png` }).catch(() => {});
const pause = (ms) => page.waitForTimeout(ms);
const moveTo = async (locator) => {
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = await locator.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
};
const clickOn = async (locator, wait = 450) => {
  const target = locator.first();
  await moveTo(target);
  await pause(120);
  await target.click();
  await pause(wait);
};
const typeInto = async (locator, text, delay = 45) => {
  await clickOn(locator);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay });
};
const popper = () => page.locator('.el-popper:visible, [data-state="open"][role="listbox"], [data-state="open"][role="menu"], [data-state="open"][role="dialog"]');
const pickOption = async (name) => clickOn(popper().getByRole("option", { name }).filter({ visible: true }));
const dismiss = async () => {
  for (let i = 0; i < 2; i++) {
    const close = page.getByRole("dialog").getByRole("button", { name: /close/i }).filter({ visible: true });
    if (await close.count()) await close.first().click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await pause(300);
  }
};
const step = async (name, fn) => {
  log(`step: ${name}`);
  try {
    await fn();
    await shot(name);
  } catch (e) {
    await shot(`FAILED-${name}`);
    log(`FAILED ${name}: ${String(e.message).split("\n")[0]}`);
    throw e;
  }
};
const nodeCreatorItem = (text) => page.getByTestId("node-creator-item-name").getByText(text, { exact: true });
const createCredential = async () => {
  const ndv = page.getByTestId("ndv");
  const empty = ndv.getByTestId("node-credentials-empty-state").getByRole("button");
  if (await empty.count()) {
    await clickOn(empty);
  } else {
    await clickOn(ndv.getByRole("combobox", { name: "Select Credential" }));
    await clickOn(popper().getByText("Create new credential"));
  }
  const modal = page.getByTestId("editCredential-modal");
  await modal.waitFor();
  return modal;
};
const saveCredential = async (modal) => {
  await clickOn(modal.getByTestId("credential-save-button"));
  await page.getByText(/Connection tested successfully/i).first().waitFor({ timeout: 60000 });
  await pause(2500);
  await clickOn(page.getByRole("dialog").filter({ has: modal }).getByRole("button", { name: /close/i }));
};
const execute = async () => {
  await clickOn(page.getByTestId("node-execute-button"));
  await page.getByTestId("output-panel").getByTestId("ndv-data-container").or(page.getByTestId("output-panel").getByText(/No output data|item/i)).first().waitFor({ timeout: 90000 });
  await pause(3500);
};
const setDropdown = async (param, option) => {
  await clickOn(page.getByTestId(`parameter-input-${param}`));
  await pickOption(option);
};

try {
  await step("sign-in", async () => {
    await page.goto(`${BASE}/signin`);
    await pause(1500);
    await typeInto(page.getByRole("textbox", { name: "Email" }), OWNER.email);
    await typeInto(page.getByRole("textbox", { name: "Password" }), OWNER.password, 25);
    await clickOn(page.getByRole("button", { name: "Sign in", exact: true }));
    await page.waitForURL((u) => !/signin/.test(u.pathname), { timeout: 30000 });
    await pause(1500);
    await dismiss();
  });

  await step("install-from-npm", async () => {
    await page.goto(`${BASE}/settings/community-nodes`);
    await pause(2000);
    await clickOn(page.getByTestId("empty-state").locator("button").or(page.getByRole("button", { name: "Install" })));
    const modal = page.getByTestId("communityPackageInstall-modal");
    await modal.waitFor();
    await typeInto(modal.locator("input").first(), PKG, 55);
    await clickOn(page.getByTestId("user-agreement-checkbox"));
    await clickOn(page.getByTestId("install-community-package-button"));
    const card = page.getByTestId("community-package-card").filter({ hasText: PKG });
    await card.waitFor({ timeout: 240000 });
    const text = await card.innerText();
    log(`installed card: ${text.replace(/\s+/g, " ").slice(0, 120)}`);
    if (WANT_VERSION && !text.includes(WANT_VERSION)) log(`WARNING: the card does not show version ${WANT_VERSION}`);
    await moveTo(card);
    await pause(3000);
  });

  await step("add-hproxy-node", async () => {
    await page.goto(`${BASE}/workflow/new`);
    await pause(2500);
    await dismiss();
    await clickOn(page.getByTestId("node-creator-plus-button"));
    await typeInto(page.getByTestId("node-creator-search-bar"), "HProxy", 80);
    await pause(800);
    await clickOn(nodeCreatorItem("HProxy"));
    await pause(1200);
    await clickOn(nodeCreatorItem("Get the bandwidth history of the account"));
    await page.getByTestId("ndv").waitFor();
    await pause(1500);
  });

  await step("credential-test", async () => {
    const modal = await createCredential();
    await typeInto(modal.getByTestId("parameter-input-apiKey").locator("input, textarea"), KEY, 6);
    await saveCredential(modal);
  });

  await step("run-bandwidth-history", async () => {
    await execute();
  });

  await step("run-free-proxies", async () => {
    await setDropdown("resource", "Free Tool");
    await setDropdown("operation", "Get Free Proxies");
    await pause(600);
    await typeInto(page.getByTestId("parameter-input-limit").locator("input"), "5");
    await page.keyboard.press("Tab");
    await execute();
  });

  await step("run-ip-lookup", async () => {
    await setDropdown("operation", "Look Up IP");
    await pause(600);
    await typeInto(page.getByTestId("parameter-input-ip").locator("input, textarea"), "8.8.8.8", 70);
    await page.keyboard.press("Tab");
    await execute();
    await clickOn(page.getByTestId("ndv-close-button"));
    await page.keyboard.press("ControlOrMeta+s");
    await pause(2000);
  });

  await step("agent", async () => {
    await page.goto(`${BASE}/workflow/new`);
    await pause(2500);
    await dismiss();
    await clickOn(page.getByTestId("node-creator-plus-button"));
    await typeInto(page.getByTestId("node-creator-search-bar"), "AI Agent", 70);
    await pause(800);
    await clickOn(nodeCreatorItem("AI Agent"));
    await pause(2000);
    if (await page.getByTestId("ndv").isVisible()) await clickOn(page.getByTestId("ndv-close-button"));
    await pause(1000);
  });

  await step("agent-model", async () => {
    await clickOn(page.locator('[data-test-id="canvas-node-input-handle"][data-connection-type="ai_languageModel"][data-node-name="AI Agent"] [data-test-id="canvas-handle-plus"]'));
    await typeInto(page.getByTestId("node-creator-search-bar"), "Ollama Chat Model", 50);
    await pause(800);
    await clickOn(nodeCreatorItem("Ollama Chat Model"));
    await page.getByTestId("ndv").waitFor();
    await pause(1000);
    const modal = await createCredential();
    await typeInto(modal.getByTestId("parameter-input-baseUrl").locator("input, textarea"), "http://ollama:11434", 40);
    await saveCredential(modal);
    await setDropdown("model", "qwen2.5:3b");
    await pause(800);
    await clickOn(page.getByTestId("ndv-close-button"));
  });

  await step("agent-tool", async () => {
    await clickOn(page.locator('[data-test-id="canvas-node-input-handle"][data-connection-type="ai_tool"][data-node-name="AI Agent"] [data-test-id="canvas-handle-plus"]'));
    await typeInto(page.getByTestId("node-creator-search-bar"), "HProxy", 80);
    await pause(900);
    const tool = page.getByTestId("node-creator-item-name").getByText(/^HProxy( Tool)?$/);
    await clickOn(tool);
    await pause(1200);
    const action = nodeCreatorItem("Look up an IP address");
    if (await action.count()) await clickOn(action);
    await page.getByTestId("ndv").waitFor();
    await pause(1000);
    if (!(await page.getByTestId("parameter-input-ip").count())) {
      await setDropdown("resource", "Free Tool");
      await setDropdown("operation", "Look Up IP");
    }
    const ipField = page.getByTestId("parameter-input-ip");
    await moveTo(ipField);
    await pause(500);
    const fromAi = ipField.getByTestId("from-ai-override-button");
    if (await fromAi.count()) await clickOn(fromAi);
    else log("no 'let the model define this' button on the IP field");
    await pause(1500);
    await clickOn(page.getByTestId("ndv-close-button"));
  });

  await step("agent-chat", async () => {
    await clickOn(page.getByTestId("workflow-chat-button"));
    const chat = page.getByTestId("canvas-chat");
    await chat.waitFor();
    await typeInto(chat.locator(".chat-inputs textarea"), "Where is the IP address 1.1.1.1 located, and which network runs it?", 35);
    await clickOn(chat.locator(".chat-input-send-button"));
    const reply = chat.locator(".chat-messages-list .chat-message.chat-message-from-bot:not(.chat-message-typing)").last();
    await reply.waitFor({ timeout: 240000 });
    log(`agent answered: ${(await reply.innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
    await pause(7000);
  });
  log("all steps done");
} finally {
  await pause(1500).catch(() => {});
  await context.close();
  await browser.close();
  log(`video closed after ${Math.round((Date.now() - started) / 1000)}s`);
}
