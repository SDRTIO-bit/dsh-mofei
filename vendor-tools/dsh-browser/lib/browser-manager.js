/**
 * Browser manager: a single reusable Playwright Chromium instance shared by
 * every browser_* tool in the plugin, so the agent can drive a page across
 * multiple tool calls without losing state.
 */
import { chromium } from 'playwright-core';
/** Channels tried in order when neither executablePath nor channel is set. */
const CHANNEL_CANDIDATES = ['chromium', 'chrome', 'msedge'];
export class BrowserManager {
    browser;
    currentPage;
    config;
    constructor(config) {
        this.config = config;
    }
    get isOpen() {
        return this.browser !== undefined && this.browser.isConnected();
    }
    async launch() {
        if (this.isOpen)
            return;
        const { executablePath, channel, viewport } = this.config;
        const attempts = [];
        if (executablePath) {
            attempts.push({ executablePath });
        }
        else if (channel) {
            attempts.push({ channel });
        }
        else {
            attempts.push(...CHANNEL_CANDIDATES.map((c) => ({ channel: c })));
        }
        let lastError;
        for (const opts of attempts) {
            try {
                this.browser = await chromium.launch({
                    headless: true,
                    ...opts,
                    args: ['--no-sandbox', '--disable-dev-shm-usage'],
                });
                this.currentPage = await this.browser.newPage({
                    viewport: viewport ?? { width: 1280, height: 800 },
                });
                if (this.config.navigationTimeoutMs) {
                    this.currentPage.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
                    this.currentPage.setDefaultTimeout(this.config.navigationTimeoutMs);
                }
                return;
            }
            catch (err) {
                lastError = err;
            }
        }
        const detail = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Browser launch failed: ${detail}. ` +
            'Install a browser with: npx playwright install chromium — ' +
            'or configure launch.executablePath / launch.channel in the plugin config.');
    }
    /** Return the current page, launching the browser on first use. */
    async page() {
        if (!this.currentPage || !this.browser?.isConnected()) {
            await this.launch();
        }
        return this.currentPage;
    }
    async close() {
        try {
            await this.browser?.close();
        }
        catch {
            // Browser already gone; nothing to do.
        }
        this.browser = undefined;
        this.currentPage = undefined;
    }
}
/** Best-effort JSON-safe serialization of a page-eval result. */
export function toJsonSafe(value) {
    if (value === undefined)
        return null;
    if (typeof value !== 'object' || value === null)
        return value;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return String(value);
    }
}
