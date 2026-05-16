const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const isMonorepo = fs.existsSync(path.join(monorepoRoot, "pnpm-workspace.yaml"));

const config = getDefaultConfig(projectRoot);

if (isMonorepo) {
  config.watchFolders = [monorepoRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ];
} else {
  config.watchFolders = [projectRoot];
  config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
}

config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
