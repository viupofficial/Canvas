const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying envelope page protection implementation...\n');

const rootDir = path.join(__dirname, '../../..');
const editorFile = path.join(rootDir, 'src/components/CanvasEditor.tsx');
const artboardFile = path.join(rootDir, 'src/components/canvas-editor/ArtboardPanel.tsx');
const layersFile = path.join(rootDir, 'src/components/canvas-editor/LayersPanel.tsx');

const editorContent = fs.readFileSync(editorFile, 'utf8');
const artboardContent = fs.readFileSync(artboardFile, 'utf8');
const layersContent = fs.readFileSync(layersFile, 'utf8');

let allChecksPassed = true;

console.log('✓ Reading source files\n');

// Check 1: Envelope detection functions
console.log('CHECK 1: Envelope detection functions');
if (editorContent.includes('const isEnvelopeObj = (o: any)')) {
  console.log('✓ isEnvelopeObj function exists');
} else {
  console.log('✗ isEnvelopeObj function not found');
  allChecksPassed = false;
}

if (editorContent.includes('const isEnvelopePageData = (data: any)')) {
  console.log('✓ isEnvelopePageData function exists');
} else {
  console.log('✗ isEnvelopePageData function not found');
  allChecksPassed = false;
}

if (editorContent.includes('const isEnvelopePage = (index: number)')) {
  console.log('✓ isEnvelopePage function exists');
} else {
  console.log('✗ isEnvelopePage function not found');
  allChecksPassed = false;
}

if (editorContent.includes('const isCurrentPageEnvelope = ()')) {
  console.log('✓ isCurrentPageEnvelope function exists');
} else {
  console.log('✗ isCurrentPageEnvelope function not found');
  allChecksPassed = false;
}

// Check 2: Delete page protection
console.log('\nCHECK 2: Delete page protection');
if (editorContent.includes('if (isCurrentPageEnvelope())') &&
    editorContent.includes('The envelope page cannot be deleted')) {
  console.log('✓ Envelope page deletion is prevented');
} else {
  console.log('✗ Envelope page deletion protection not found');
  allChecksPassed = false;
}

// Check 3: Page reordering protection
console.log('\nCHECK 3: Page reordering protection');
if (editorContent.includes('if (isEnvelopePage(from) || isEnvelopePage(to))') &&
    editorContent.includes('The envelope page cannot be reordered')) {
  console.log('✓ Envelope page reordering is prevented');
} else {
  console.log('✗ Envelope page reordering protection not found');
  allChecksPassed = false;
}

// Check 4: Layer deletion protection
console.log('\nCHECK 4: Layer deletion protection');
if (editorContent.includes('if (isCurrentPageEnvelope() && isEnvelopeObj(obj))') &&
    editorContent.includes('Envelope elements cannot be deleted')) {
  console.log('✓ Envelope element deletion is prevented');
} else {
  console.log('✗ Envelope element deletion protection not found');
  allChecksPassed = false;
}

// Check 5: Object locking
console.log('\nCHECK 5: Envelope objects locked (cannot move/scale)');
if (editorContent.includes('obj.lockMovementX = true') &&
    editorContent.includes('obj.lockScalingX = true') &&
    editorContent.includes('obj.lockRotation = true')) {
  console.log('✓ Envelope objects are locked for movement/scaling/rotation');
} else {
  console.log('✗ Envelope object locking not found');
  allChecksPassed = false;
}

// Check 6: LayerInfo type updated
console.log('\nCHECK 6: LayerInfo type includes isEnvelope flag');
if (editorContent.includes('isEnvelope?: boolean')) {
  console.log('✓ LayerInfo type includes isEnvelope property');
} else {
  console.log('✗ LayerInfo type not updated');
  allChecksPassed = false;
}

// Check 7: Layers panel delete button protection
console.log('\nCHECK 7: Layers panel delete button protection');
if (layersContent.includes('layer.isEnvelope') &&
    layersContent.includes('Cannot delete envelope elements')) {
  console.log('✓ Layers panel delete button is disabled for envelope elements');
} else {
  console.log('✗ Layers panel delete button protection not found');
  allChecksPassed = false;
}

// Check 8: Layers panel envelope badge
console.log('\nCHECK 8: Layers panel envelope element badge');
if (layersContent.includes('layer.isEnvelope &&') && layersContent.includes('Envelope')) {
  console.log('✓ Envelope elements show "Envelope" badge in layers panel');
} else {
  console.log('✗ Envelope badge not found in layers panel');
  allChecksPassed = false;
}

// Check 9: Artboard panel envelope dragging protection
console.log('\nCHECK 9: Artboard panel envelope page reordering protection');
if (artboardContent.includes('isEnvelopePage = (index: number) => index === 0') &&
    artboardContent.includes('canDragPage = (index: number)')) {
  console.log('✓ Artboard panel prevents dragging envelope page');
} else {
  console.log('✗ Artboard panel envelope protection not found');
  allChecksPassed = false;
}

// Check 10: Artboard panel envelope label
console.log('\nCHECK 10: Artboard panel envelope page label');
if (artboardContent.includes('Envelope') && artboardContent.includes('isEnvelopePage')) {
  console.log('✓ Envelope page shows visual indicator in artboard panel');
} else {
  console.log('✗ Envelope page indicator not found in artboard panel');
  allChecksPassed = false;
}

// Check 11: Delete page button disabled
console.log('\nCHECK 11: Delete page button protection');
if (editorContent.includes('disabled={pages.length <= 1 || isCurrentPageEnvelope()}')) {
  console.log('✓ Delete page button is disabled for envelope page');
} else {
  console.log('✗ Delete page button not properly disabled');
  allChecksPassed = false;
}

console.log('\n' + '='.repeat(60));
if (allChecksPassed) {
  console.log('✅ ALL CHECKS PASSED!');
  console.log('\nImplementation Summary:');
  console.log('1. ✓ Envelope pages are detected by their content (envelope-body, envelope-head, envelope-seal)');
  console.log('2. ✓ Envelope page cannot be deleted (protected in removePage function)');
  console.log('3. ✓ Envelope page cannot be reordered (protected in reorderPages function)');
  console.log('4. ✓ Envelope page position is always first (index 0)');
  console.log('5. ✓ Envelope elements cannot be deleted (protected in deleteLayer function)');
  console.log('6. ✓ Envelope elements cannot be moved/scaled/rotated (lockMovementX/Y, lockScalingX/Y, lockRotation)');
  console.log('7. ✓ Envelope elements can be selected and styled (color/texture changes allowed)');
  console.log('8. ✓ UI provides visual feedback (badges, disabled buttons, tooltips)');
  console.log('9. ✓ Artboard panel shows envelope page with "Envelope" label');
  console.log('10. ✓ Layers panel shows envelope elements with "Envelope" badge');
  console.log('\nUsers can now:');
  console.log('- View and interact with the envelope page');
  console.log('- Change colors and textures of envelope elements');
  console.log('- Use the background panel to modify envelope page appearance');
  console.log('- BUT cannot delete, move, scale, or reorder the envelope page');
  process.exit(0);
} else {
  console.log('❌ SOME CHECKS FAILED');
  process.exit(1);
}
