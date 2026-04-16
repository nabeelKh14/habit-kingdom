const fs = require('fs');
const path = require('path');

console.log('Applying react-native-worklets web fixes...');

const workletsLibPath = path.join(__dirname, '../node_modules/react-native-worklets/lib/module');

// Fix 1: Platform checker (now a single JS file)
const platformCheckerPath = path.join(workletsLibPath, 'platformChecker.js');
if (fs.existsSync(platformCheckerPath)) {
  let platformCheckerContent = fs.readFileSync(platformCheckerPath, 'utf8');
  if (!platformCheckerContent.includes('initializePlatform()')) {
    platformCheckerContent = platformCheckerContent.replace(
      `if (globalThis.__RUNTIME_KIND === RuntimeKind.ReactNative) {
  IS_JEST = RN_IS_JEST;
  IS_WEB = RN_IS_WEB;
  IS_WINDOWS = RN_IS_WINDOWS;
  SHOULD_BE_USE_WEB = RN_SHOULD_BE_USE_WEB;
}`,
      `// Fix for web platform checker initialization - lazy evaluate
function initializePlatform() {
  if (typeof globalThis.__RUNTIME_KIND !== 'undefined' && globalThis.__RUNTIME_KIND === RuntimeKind.ReactNative) {
    IS_JEST = RN_IS_JEST;
    IS_WEB = RN_IS_WEB;
    IS_WINDOWS = RN_IS_WINDOWS;
    SHOULD_BE_USE_WEB = RN_SHOULD_BE_USE_WEB;
  } else if (typeof window !== 'undefined') {
    IS_WEB = true;
    SHOULD_BE_USE_WEB = true;
  }
}

initializePlatform();`
    );
    fs.writeFileSync(platformCheckerPath, platformCheckerContent);
    console.log('✓ Fixed PlatformChecker initialization');
  }
}

// Fix 2: JSWorklets createSerializable implementations
const jsWorkletsPath = path.join(workletsLibPath, 'WorkletsModule/JSWorklets.js');
if (fs.existsSync(jsWorkletsPath)) {
  let jsWorkletsContent = fs.readFileSync(jsWorkletsPath, 'utf8');

  const methodPattern = /(\s+)(\w+)\(\) \{\s+throw new WorkletsError\('.*?'\);\s+\}/g;
  let match;
  const matches = [];
  while ((match = methodPattern.exec(jsWorkletsContent)) !== null) {
    matches.push(match);
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const [fullMatch, indent, methodName] = matches[i];
    let replacement;
    
    if (methodName.startsWith('createSerializable')) {
      replacement = `${indent}${methodName}(value) { return value; }`;
    } else if (methodName === 'synchronizableGetDirty' || methodName === 'synchronizableGetBlocking') {
      replacement = `${indent}${methodName}() { return false; }`;
    } else {
      replacement = `${indent}${methodName}() {}`;
    }
    
    jsWorkletsContent = jsWorkletsContent.slice(0, matches[i].index) + replacement + jsWorkletsContent.slice(matches[i].index + fullMatch.length);
  }

  fs.writeFileSync(jsWorkletsPath, jsWorkletsContent);
  console.log('✓ Fixed JSWorklets serialization methods');
}

console.log('All fixes applied successfully!');
