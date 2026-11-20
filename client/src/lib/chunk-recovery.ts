import { BUILD_TIME } from "@/buildTime";

/** An old tab may reference files replaced by a deploy. Reload at most once
 * per build and tab: a network outage must not cause an endless reload loop. */
export function reloadStaleChunkOnce(
  reload = () => window.location.reload(),
): boolean {
  const key = "maran-chunk-reload-build";
  try {
    if (sessionStorage.getItem(key) === BUILD_TIME) return false;
    sessionStorage.setItem(key, BUILD_TIME);
  } catch {
    // Without storage we cannot guard a reload across navigation.
    return false;
  }
  reload();
  return true;
}
