///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

// Helpers for loading third-party libraries (Leaflet, ECharts, …) at runtime.
// ThingsBoard does not expose these to extension bundles, so widgets pull them
// from a CDN once and reuse the cached global.

/** Inject a stylesheet once (no-op if an element with the id already exists). */
export function injectCss(id: string, href: string): void {
  if (document.getElementById(id)) {
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Inject a script once, resolving when it has loaded (shared across callers). */
export function injectScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as (HTMLScriptElement & { _loaded?: boolean }) | null;
    if (existing) {
      if (existing._loaded) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
      }
      return;
    }
    const script = document.createElement("script") as HTMLScriptElement & { _loaded?: boolean };
    script.id = id;
    script.src = src;
    script.onload = () => {
      script._loaded = true;
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
