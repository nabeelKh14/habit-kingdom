module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    assumptions: {
      privateFieldsAsProperties: true,
      setPublicClassFields: true,
    },
    plugins: [
      "react-native-reanimated/plugin",
      "@babel/plugin-transform-class-properties",
      "@babel/plugin-transform-private-methods",
      "@babel/plugin-transform-private-property-in-object",
    ],
    overrides: [{
      test: /node_modules\/react-native-reanimated\//,
      plugins: [], // clear plugins for reanimated — it ships pre-compiled JS now
    }],
  };
};