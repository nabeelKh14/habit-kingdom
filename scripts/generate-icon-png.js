const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Generate the cute avatar icon as SVG
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- Background -->
  <rect width="1024" height="1024" rx="200" fill="#0F766E"/>
  
  <!-- Subtle background circle -->
  <circle cx="512" cy="512" r="420" fill="#0D9488" opacity="0.5"/>
  
  <!-- Shadow -->
  <ellipse cx="512" cy="880" rx="280" ry="40" fill="rgba(0,0,0,0.1)"/>
  
  <!-- Body - cute round shape -->
  <circle cx="512" cy="520" r="360" fill="#0D9488"/>
  
  <!-- Belly highlight -->
  <ellipse cx="512" cy="590" rx="240" ry="210" fill="#6EE7B7" opacity="0.3"/>
  
  <!-- Eyes - white part -->
  <circle cx="400" cy="450" r="80" fill="#fff"/>
  <circle cx="624" cy="450" r="80" fill="#fff"/>
  
  <!-- Pupils -->
  <circle cx="415" cy="458" r="40" fill="#1E293B"/>
  <circle cx="639" cy="458" r="40" fill="#1E293B"/>
  
  <!-- Eye shine -->
  <circle cx="430" cy="435" r="18" fill="#fff"/>
  <circle cx="654" cy="435" r="18" fill="#fff"/>
  
  <!-- Blush -->
  <ellipse cx="300" cy="555" rx="55" ry="35" fill="#FDA4AF" opacity="0.5"/>
  <ellipse cx="724" cy="555" rx="55" ry="35" fill="#FDA4AF" opacity="0.5"/>
  
  <!-- Smile -->
  <path d="M 435 590 Q 512 660 589 590" stroke="#1E293B" stroke-width="18" stroke-linecap="round" fill="none"/>
  
  <!-- Little ears -->
  <circle cx="200" cy="380" r="70" fill="#0D9488"/>
  <circle cx="200" cy="380" r="42" fill="#6EE7B7" opacity="0.4"/>
  <circle cx="824" cy="380" r="70" fill="#0D9488"/>
  <circle cx="824" cy="380" r="42" fill="#6EE7B7" opacity="0.4"/>
  
  <!-- Arms -->
  <path d="M 180 625 Q 100 590 140 700" stroke="#0D9488" stroke-width="70" stroke-linecap="round" fill="none"/>
  <path d="M 844 625 Q 924 590 884 700" stroke="#0D9488" stroke-width="70" stroke-linecap="round" fill="none"/>
  
  <!-- Feet -->
  <ellipse cx="400" cy="870" rx="85" ry="42" fill="#0D9488"/>
  <ellipse cx="624" cy="870" rx="85" ry="42" fill="#0D9488"/>
  
  <!-- Crown -->
  <path d="M 360 250 L 395 140 L 450 210 L 512 80 L 574 210 L 629 140 L 664 250 Z" fill="#FBBF24" stroke="#F59E0B" stroke-width="10"/>
  <circle cx="512" cy="160" r="22" fill="#EF4444"/>
  <circle cx="420" cy="200" r="15" fill="#3B82F6"/>
  <circle cx="604" cy="200" r="15" fill="#10B981"/>
  
  <!-- Level badge -->
  <circle cx="700" cy="760" r="65" fill="#0D9488" stroke="#fff" stroke-width="14"/>
  <text x="700" y="778" font-family="Arial, sans-serif" font-size="65" font-weight="bold" fill="#fff" text-anchor="middle">1</text>
</svg>`;

async function generateIcons() {
  const imagesDir = path.join(__dirname, '..', 'assets', 'images');
  
  // Ensure directory exists
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  // Generate main icon (1024x1024)
  await sharp(Buffer.from(svgContent))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(imagesDir, 'icon.png'));
  console.log('Generated icon.png (1024x1024)');
  
  // Generate Android adaptive icon foreground (1024x1024)
  await sharp(Buffer.from(svgContent))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(imagesDir, 'android-icon-foreground.png'));
  console.log('Generated android-icon-foreground.png');
  
  // Generate splash icon (200x200)
  await sharp(Buffer.from(svgContent))
    .resize(200, 200)
    .png()
    .toFile(path.join(imagesDir, 'splash-icon.png'));
  console.log('Generated splash-icon.png (200x200)');
  
  // Generate favicon (48x48)
  await sharp(Buffer.from(svgContent))
    .resize(48, 48)
    .png()
    .toFile(path.join(imagesDir, 'favicon.png'));
  console.log('Generated favicon.png (48x48)');
  
  // Generate Android background (solid color)
  const bgSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#E6F4FE"/>
</svg>`;
  await sharp(Buffer.from(bgSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(imagesDir, 'android-icon-background.png'));
  console.log('Generated android-icon-background.png');
  
  // Generate monochrome icon
  const monoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="200" fill="#000"/>
  <circle cx="512" cy="520" r="360" fill="#000"/>
  <ellipse cx="512" cy="590" rx="240" ry="210" fill="#333" opacity="0.3"/>
  <circle cx="400" cy="450" r="80" fill="#fff"/>
  <circle cx="624" cy="450" r="80" fill="#fff"/>
  <circle cx="415" cy="458" r="40" fill="#000"/>
  <circle cx="639" cy="458" r="40" fill="#000"/>
  <circle cx="430" cy="435" r="18" fill="#fff"/>
  <circle cx="654" cy="435" r="18" fill="#fff"/>
  <path d="M 435 590 Q 512 660 589 590" stroke="#000" stroke-width="18" stroke-linecap="round" fill="none"/>
  <circle cx="200" cy="380" r="70" fill="#000"/>
  <circle cx="824" cy="380" r="70" fill="#000"/>
  <path d="M 180 625 Q 100 590 140 700" stroke="#000" stroke-width="70" stroke-linecap="round" fill="none"/>
  <path d="M 844 625 Q 924 590 884 700" stroke="#000" stroke-width="70" stroke-linecap="round" fill="none"/>
  <ellipse cx="400" cy="870" rx="85" ry="42" fill="#000"/>
  <ellipse cx="624" cy="870" rx="85" ry="42" fill="#000"/>
  <path d="M 360 250 L 395 140 L 450 210 L 512 80 L 574 210 L 629 140 L 664 250 Z" fill="#fff"/>
  <circle cx="700" cy="760" r="65" fill="#000" stroke="#fff" stroke-width="14"/>
  <text x="700" y="778" font-family="Arial, sans-serif" font-size="65" font-weight="bold" fill="#fff" text-anchor="middle">1</text>
</svg>`;
  await sharp(Buffer.from(monoSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(imagesDir, 'android-icon-monochrome.png'));
  console.log('Generated android-icon-monochrome.png');
  
  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
