module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { 
        unstable_transformImportMeta: true,
        jsxRuntime: 'automatic'
      }],
    ],
    assumptions: {
      privateFieldsAsProperties: true,
      setPublicClassFields: true,
    },
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};