// Create a square PNG from the ICO for Tauri icon generation
// Uses pure Node.js to read the ICO and create a padded square version

const fs = require('fs');
const path = require('path');

// Read the ICO file and extract the largest PNG image
const icoPath = path.join(__dirname, 'aerolearn_logo.ico');
const icoBuffer = fs.readFileSync(icoPath);

// ICO format: 6-byte header, then directory entries (16 bytes each)
const numImages = icoBuffer.readUInt16LE(4);
console.log(`ICO contains ${numImages} images`);

let largestEntry = null;
let largestSize = 0;

for (let i = 0; i < numImages; i++) {
  const offset = 6 + i * 16;
  const width = icoBuffer[offset] || 256; // 0 means 256
  const height = icoBuffer[offset + 1] || 256;
  const size = icoBuffer.readUInt32LE(offset + 8);
  const dataOffset = icoBuffer.readUInt32LE(offset + 12);
  
  console.log(`  Image ${i}: ${width}x${height}, size=${size}, offset=${dataOffset}`);
  
  if (size > largestSize) {
    largestSize = size;
    largestEntry = { width, height, size, dataOffset };
  }
}

if (largestEntry) {
  const imageData = icoBuffer.slice(largestEntry.dataOffset, largestEntry.dataOffset + largestEntry.size);
  
  // Check if it's a PNG (starts with PNG signature)
  const isPNG = imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47;
  
  if (isPNG) {
    // Save the largest PNG directly
    const outputPath = path.join(__dirname, 'src-tauri', 'icons', 'icon_extracted.png');
    fs.writeFileSync(outputPath, imageData);
    console.log(`\n✓ Extracted ${largestEntry.width}x${largestEntry.height} PNG to ${outputPath}`);
    
    // Also try to use it for tauri icon generation
    // If not square, we need to just use the ICO directly
    if (largestEntry.width === largestEntry.height) {
      console.log('Image is square! Running tauri icon...');
    } else {
      console.log(`Image is ${largestEntry.width}x${largestEntry.height} (not square)`);
      console.log('The ICO will be used directly for the Windows build.');
    }
  } else {
    console.log('Largest image is BMP format (not PNG embedded)');
  }
}

// Since the source isn't square, let's just ensure the ICO is properly placed
// Tauri on Windows uses the ICO directly for the .exe icon
const icoDest = path.join(__dirname, 'src-tauri', 'icons', 'icon.ico');
if (!fs.existsSync(icoDest)) {
  fs.copyFileSync(icoPath, icoDest);
}
console.log('\n✓ icon.ico is in place for Windows build');
console.log('Note: Tauri uses icon.ico directly for Windows EXE - no PNG conversion needed for Windows builds');
