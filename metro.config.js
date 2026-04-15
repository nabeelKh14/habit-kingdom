const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add support for .wasm files - exclude them from transformation
config.resolver = {
  ...config.resolver,
  resolverMainFields: ["react-native", "browser", "main"],
  sourceExts: [
    ...config.resolver.sourceExts,
    "wasm",
  ],
  assetExts: [
    ...config.resolver.assetExts,
    "wasm",
  ],
};

// Fix react-native-worklets web compatibility issue
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-worklets') {
    return context.resolveRequest(context, 'react-native-worklets/lib/module/WorkletsModule/JSWorklets.js', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Tell Metro to not transform wasm files
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Exclude wasm from being transformed
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
};

module.exports = config;
