const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm monorepo: Metro must resolve hoisted deps from the workspace root.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

/**
 * Hard gate for sample Match / Waves-map fixtures.
 * Metro still resolves `require()` inside `if (EXPO_PUBLIC_TEST_PHOTOS === "1")`
 * branches, so without this the JPEGs + metadata leak into production exports.
 * When the flag is off, every test-photos module resolves to an empty stub.
 */
const testPhotosOn = process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";
if (!testPhotosOn) {
  const stub = path.resolve(projectRoot, "assets/test-photos/stub.disabled.js");
  const defaultResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.replace(/\\/g, "/");
    if (
      name.includes("assets/test-photos/") ||
      name.includes("test-photos/catalog") ||
      name.includes("test-photos/fixtures") ||
      name.includes("test-photos/sampleIds") ||
      name.includes("test-photos/SamplePhotosToggleRow") ||
      /test-photos\/\d{2}-[^/]+\.jpe?g$/i.test(name)
    ) {
      // Never stub the stub itself (avoid recursion).
      if (!name.includes("stub.disabled")) {
        return { type: "sourceFile", filePath: stub };
      }
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
