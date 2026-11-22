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
 *
 * LocationDiagPanel is an exception in local __DEV__ (NODE_ENV !== production)
 * so the hidden diagnostic works without sample JPEGs. Production exports still
 * stub it along with the rest of test-photos.
 */
const testPhotosOn = process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";
const stubLocationDiag = !testPhotosOn && process.env.NODE_ENV === "production";
if (!testPhotosOn) {
  const stub = path.resolve(projectRoot, "assets/test-photos/stub.disabled.js");
  const defaultResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.replace(/\\/g, "/");
    const isLocationDiag =
      name.includes("test-photos/LocationDiagPanel") ||
      name.includes("test-photos/LocationDiagScreen") ||
      name.includes("test-photos/LocationDiagAccountRow");
    if (isLocationDiag && !stubLocationDiag) {
      if (defaultResolveRequest) {
        return defaultResolveRequest(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    }
    if (
      name.includes("assets/test-photos/") ||
      name.includes("test-photos/catalog") ||
      name.includes("test-photos/fixtures") ||
      name.includes("test-photos/sampleIds") ||
      name.includes("test-photos/SamplePhotosToggleRow") ||
      name.includes("test-photos/LocationDiagPanel") ||
      name.includes("test-photos/LocationDiagScreen") ||
      name.includes("test-photos/LocationDiagAccountRow") ||
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
