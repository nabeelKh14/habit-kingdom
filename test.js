// Simple test runner
const { spawn } = require('child_process');

console.log('Running tests...');

const testProcess = spawn('npx', ['jest', '--verbose'], {
  cwd: process.cwd(),
  stdio: 'pipe',
  shell: true
});

testProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

testProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

testProcess.on('close', (code) => {
  console.log(`Test process exited with code ${code}`);
  process.exit(code);
});