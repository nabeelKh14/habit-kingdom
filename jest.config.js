const { getDefaultConfig } = require('jest-expo');

module.exports = getDefaultConfig(__dirname, {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@expo-react-native-action-sheet|@expo/vector-icons|@expo/webpack-config|react-native-web|@storybook/addon-react-native-web|nativewind)'
  ],
});