const {execSync} = require('child_process');
const fs = require('fs');

console.log('====================================');
console.log('🔧 Banana Report — Setup Started');
console.log('====================================\n');

// -----------------------------
// 1. Check OpenSSL availability
// -----------------------------
try {
  execSync('openssl version', {stdio: 'ignore'});
  console.log('✔ OpenSSL found');
} catch (err) {
  console.error('❌ OpenSSL is not installed or not in PATH');
  console.error('   Install OpenSSL and try again.');
  process.exit(1);
}

// -----------------------------
// 2. Check Node dependencies
// -----------------------------
console.log('\n🔍 Checking Node.js dependencies...');

let missingDeps = [];

try {
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const deps = Object.keys(pkg.dependencies || {});

  deps.forEach((dep) => {
    try {
      require.resolve(dep);
    } catch (err) {
      missingDeps.push(dep);
    }
  });
} catch (err) {
  console.error('❌ Failed to read package.json:', err.message);
  process.exit(1);
}

if (missingDeps.length > 0) {
  console.log('⚠️ Missing dependencies detected:');
  missingDeps.forEach((d) => console.log('   - ' + d));

  console.log('\n📦 Installing missing dependencies...');
  try {
    execSync('npm install', {stdio: 'inherit'});
    console.log('✔ Dependencies installed');
  } catch (err) {
    console.error('❌ Failed to install dependencies:', err.message);
    process.exit(1);
  }
} else {
  console.log('✔ All dependencies are installed');
}

// -----------------------------
// 3. Create cert folder
// -----------------------------
if (!fs.existsSync('./cert')) {
  try {
    fs.mkdirSync('./cert');
    console.log('✔ Created cert/ folder');
  } catch (err) {
    console.error('❌ Failed to create cert/ folder:', err.message);
    process.exit(1);
  }
} else {
  console.log('✔ cert/ folder already exists');
}

// -----------------------------
// 4. Check write permissions
// -----------------------------
try {
  fs.writeFileSync('./cert/test.tmp', 'test');
  fs.unlinkSync('./cert/test.tmp');
  console.log('✔ Write permissions OK');
} catch (err) {
  console.error('❌ No write permissions for cert/ folder:', err.message);
  process.exit(1);
}

// -----------------------------
// 5. Generate certificates
// -----------------------------
try {
  console.log('🔐 Generating HTTPS certificates...');
  execSync(
    'openssl req -nodes -new -x509 -subj "/CN=localhost" -keyout ./cert/key.pem -out ./cert/cert.pem -days 365',
    {stdio: 'inherit'},
  );
  console.log('✔ Certificates generated successfully');
} catch (err) {
  console.error('❌ Failed to generate certificates:', err.message);
  process.exit(1);
}

// -----------------------------
// 6. Final check
// -----------------------------
if (fs.existsSync('./cert/key.pem') && fs.existsSync('./cert/cert.pem')) {
  console.log('\n====================================');
  console.log('🎉 Setup complete!');
  console.log('🔐 HTTPS certificates ready');
  console.log('🚀 You can now run: npm start');
  console.log('====================================');
} else {
  console.error('❌ Certificates missing after generation');
  process.exit(1);
}
