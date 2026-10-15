const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. react-native-maps is native-only; stub it on web so the bundle builds
// (app/jobs/[id].tsx already falls back when the module is unavailable).
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const webStubs = {
    'react-native-maps': 'web-stubs/react-native-maps.js',
    'expo-secure-store': 'web-stubs/expo-secure-store.js',
  };
  if (platform === 'web' && webStubs[moduleName]) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, webStubs[moduleName]),
    };
  }
  return (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;

