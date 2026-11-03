declare const __BUILD_REVISION__: string;
// Frozen into the server bundle, so runtime health identifies the code serving
// the request rather than a mutable environment variable or a frontend cache.
export const BUILD_REVISION = typeof __BUILD_REVISION__ !== "undefined" ? __BUILD_REVISION__ : "development";
