/**
 * dsh-browser
 *
 * Browser automation for DeepSeek Harness. Registers a `browser_*` tool
 * family backed by a single reusable Playwright Chromium instance:
 *
 * - `browser_open` / `browser_navigate` — load pages
 * - `browser_click` / `browser_type` / `browser_select` — interact
 * - `browser_get_text` / `browser_get_html` / `browser_eval` — inspect
 * - `browser_screenshot` — capture the page to a workspace file (the model
 *   can then view it with the `read_image` tool)
 * - `browser_wait` / `browser_close` / `browser_install` — lifecycle
 *
 * The browser persists across tool calls: open once, drive many times, close
 * when done. Screenshots default to `<workspace>/browser-screenshots/`.
 *
 * @module dsh-browser
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type BrowserLaunchConfig } from './browser-manager.ts';
export declare const name = "browser";
export declare const inject: string[];
/** Plugin configuration. */
export interface Config extends BrowserLaunchConfig {
    /** Directory name for screenshots under the workspace (default browser-screenshots). */
    screenshotDir?: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
