// Monorepo-aware Metro configuration.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Use TypeScript sources of workspace packages ("react-native" field).
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
