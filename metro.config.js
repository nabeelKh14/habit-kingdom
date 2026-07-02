const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for .wasm files
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts, 'wasm'],
  sourceExts: [...config.resolver.sourceExts, 'wasm'],

  // Use 'main' before 'react-native' so reanimated's pre-compiled lib/ is used
  // instead of src/ TypeScript. 'react-native' field in reanimated points to src/.
  resolverMainFields: ['browser', 'main', 'react-native']
};

// Prevent metro from processing node_modules TypeScript
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Exclude react-native-reanimated source TS files - use pre-compiled JS
config.transformer.unstable_allowRequireContext = true;
config.watchFolders = [__dirname];

module.exports = config;