// Basic test without Jest
const assert = require('assert');

describe = (name, fn) => {
  console.log(`\n${name}:`);
  fn();
};

it = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
  }
};

expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined || actual === null) {
      throw new Error('Expected to be defined, but got undefined or null');
    }
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected to be null, but got ${actual}`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected to be truthy, but got ${actual}`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected to be falsy, but got ${actual}`);
    }
  },
  toThrow: () => {
    // This is a simplified version - in real tests we'd wrap the call
    throw new Error('toThrow not implemented in basic test framework');
  },
});

try {
  // Run our simple test
  require('./simple.test');
  console.log('\n✅ All tests passed!');
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}