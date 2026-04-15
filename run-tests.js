const { execSync } = require('child_process');

try {
  console.log('Running database tests...');
  execSync('npx jest D:\\kidhabit\\__tests__\\db.test.ts --verbose', { stdio: 'inherit' });
  console.log('Database tests completed successfully!');
} catch (error) {
  console.error('Test execution failed:', error.message);
  process.exit(1);
}