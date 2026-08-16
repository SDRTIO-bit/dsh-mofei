/**
 * Browser manager: a single reusable Playwright Chromium instance shared by
 * every browser_* tool in the plugin, so the agent can drive a page across
 * multiple tool calls without losing state.
 */
import { type Page } from 'playwright-core';
export interface BrowserLaunchConfig {
    /** Absolute path to a browser binary (takes precedence over channel). */
    executablePath?: string;
    /** Browser channel: 'chromium' | 'chrome' | 'msedge'. */
    channel?: string;
    /** Default navigation/action timeout in milliseconds. */
    navigationTimeoutMs?: number;
    /** Viewport size for the page. */
    viewport?: {
        width: number;
        height: number;
    };
}
export declare class BrowserManager {
    private browser;
    private currentPage;
    private readonly config;
    constructor(config: BrowserLaunchConfig);
    get isOpen(): boolean;
    launch(): Promise<void>;
    /** Return the current page, launching the browser on first use. */
    page(): Promise<Page>;
    close(): Promise<void>;
}
/** Best-effort JSON-safe serialization of a page-eval result. */
export declare function toJsonSafe(value: unknown): unknown;
