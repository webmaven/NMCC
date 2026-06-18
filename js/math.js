/**
 * Curator Studio — Mathematical & Snapping Physics Module
 * Handles scale-invariant calculations, grid snapping, and smart guide alignments.
 */

/**
 * Calculates alignment snapping (Smart Guides) for dragging/repositioning a tile.
 * @param {number} candidateLeft - The unsnapped target X coordinate.
 * @param {number} candidateTop - The unsnapped target Y coordinate.
 * @param {number} width - Current width of the active tile.
 * @param {number} height - Current height of the active tile.
 * @param {string} selectedTileId - The ID of the currently selected/active tile.
 * @param {Array} assets - The list of all assets on the board.
 * @returns {Object} Snapped coordinates and alignment flags.
 */
export function calculateAlignmentSnapping(candidateLeft, candidateTop, width, height, selectedTileId, assets) {
  let snappedX = candidateLeft;
  let snappedY = candidateTop;
  let snappedXApplied = false;
  let snappedYApplied = false;
  
  const threshold = 8; // threshold in pixels
  
  // Compare against all other assets currently rendered that are "nearby" (within 800px center-to-center)
  const activeCenterX = candidateLeft + width / 2;
  const activeCenterY = candidateTop + height / 2;
  
  const otherAssets = assets.filter(a => {
    if (a.id === selectedTileId) return false;
    const targetCenterX = a.x + a.width / 2;
    const targetCenterY = a.y + a.height / 2;
    return Math.abs(activeCenterX - targetCenterX) < 800 && Math.abs(activeCenterY - targetCenterY) < 800;
  });
  
  let minDiffX = threshold + 1;
  let bestXLine = null;
  
  let minDiffY = threshold + 1;
  let bestYLine = null;
  
  // Horizontal alignments (X-axis, determines Left coordinate, draws Vertical guide lines)
  const activeLeft = candidateLeft;
  const activeRight = candidateLeft + width;
  
  for (const a of otherAssets) {
    const targetLeft = a.x;
    const targetCenterX = a.x + a.width / 2;
    const targetRight = a.x + a.width;
    
    // Combinations:
    // 1. Active Left aligns with Target Left, Center, Right
    // 2. Active Center aligns with Target Left, Center, Right
    // 3. Active Right aligns with Target Left, Center, Right
    const opts = [
      { diff: Math.abs(activeLeft - targetLeft), snap: targetLeft, line: targetLeft },
      { diff: Math.abs(activeLeft - targetCenterX), snap: targetCenterX, line: targetCenterX },
      { diff: Math.abs(activeLeft - targetRight), snap: targetRight, line: targetRight },
      
      { diff: Math.abs(activeCenterX - targetLeft), snap: targetLeft - width / 2, line: targetLeft },
      { diff: Math.abs(activeCenterX - targetCenterX), snap: targetCenterX - width / 2, line: targetCenterX },
      { diff: Math.abs(activeCenterX - targetRight), snap: targetRight - width / 2, line: targetRight },
      
      { diff: Math.abs(activeRight - targetLeft), snap: targetLeft - width, line: targetLeft },
      { diff: Math.abs(activeRight - targetCenterX), snap: targetCenterX - width, line: targetCenterX },
      { diff: Math.abs(activeRight - targetRight), snap: targetRight - width, line: targetRight }
    ];
    
    for (const opt of opts) {
      if (opt.diff < minDiffX) {
        minDiffX = opt.diff;
        snappedX = opt.snap;
        bestXLine = opt.line;
        snappedXApplied = true;
      }
    }
  }
  
  // Vertical alignments (Y-axis, determines Top coordinate, draws Horizontal guide lines)
  const activeTop = candidateTop;
  const activeBottom = candidateTop + height;
  
  for (const a of otherAssets) {
    const targetTop = a.y;
    const targetCenterY = a.y + a.height / 2;
    const targetBottom = a.y + a.height;
    
    // Combinations:
    // 1. Active Top aligns with Target Top, Middle, Bottom
    // 2. Active Middle aligns with Target Top, Middle, Bottom
    // 3. Active Bottom aligns with Target Top, Middle, Bottom
    const opts = [
      { diff: Math.abs(activeTop - targetTop), snap: targetTop, line: targetTop },
      { diff: Math.abs(activeTop - targetCenterY), snap: targetCenterY, line: targetCenterY },
      { diff: Math.abs(activeTop - targetBottom), snap: targetBottom, line: targetBottom },
      
      { diff: Math.abs(activeCenterY - targetTop), snap: targetTop - height / 2, line: targetTop },
      { diff: Math.abs(activeCenterY - targetCenterY), snap: targetCenterY - height / 2, line: targetCenterY },
      { diff: Math.abs(activeCenterY - targetBottom), snap: targetBottom - height / 2, line: targetBottom },
      
      { diff: Math.abs(activeBottom - targetTop), snap: targetTop - height, line: targetTop },
      { diff: Math.abs(activeBottom - targetCenterY), snap: targetCenterY - height, line: targetCenterY },
      { diff: Math.abs(activeBottom - targetBottom), snap: targetBottom - height, line: targetBottom }
    ];
    
    for (const opt of opts) {
      if (opt.diff < minDiffY) {
        minDiffY = opt.diff;
        snappedY = opt.snap;
        bestYLine = opt.line;
        snappedYApplied = true;
      }
    }
  }
  
  return {
    x: snappedX,
    y: snappedY,
    snappedX: snappedXApplied,
    snappedY: snappedYApplied,
    bestXLine,
    bestYLine
  };
}

/**
 * Calculates alignment snapping (Smart Guides) for resizing a tile from its bottom-right corner.
 * @param {number} tileLeft - Current X coordinate of the tile.
 * @param {number} tileTop - Current Y coordinate of the tile.
 * @param {number} candidateWidth - Unsnapped target width.
 * @param {number} candidateHeight - Unsnapped target height.
 * @param {string} selectedTileId - The ID of the currently selected/active tile.
 * @param {Array} assets - The list of all assets on the board.
 * @returns {Object} Snapped dimensions and alignment flags.
 */
export function calculateResizingSnapping(tileLeft, tileTop, candidateWidth, candidateHeight, selectedTileId, assets) {
  let snappedWidth = candidateWidth;
  let snappedHeight = candidateHeight;
  let snappedXApplied = false;
  let snappedYApplied = false;
  
  const threshold = 8; // threshold in pixels
  
  // Compare against all other assets currently rendered that are "nearby" (within 800px center-to-center)
  const activeCenterX = tileLeft + candidateWidth / 2;
  const activeCenterY = tileTop + candidateHeight / 2;
  
  const otherAssets = assets.filter(a => {
    if (a.id === selectedTileId) return false;
    const targetCenterX = a.x + a.width / 2;
    const targetCenterY = a.y + a.height / 2;
    return Math.abs(activeCenterX - targetCenterX) < 800 && Math.abs(activeCenterY - targetCenterY) < 800;
  });
  
  let minDiffX = threshold + 1;
  let bestXLine = null;
  
  let minDiffY = threshold + 1;
  let bestYLine = null;
  
  // Resizing right edge (determines width, draws Vertical guide lines)
  const activeRight = tileLeft + candidateWidth;
  
  for (const a of otherAssets) {
    const targetLeft = a.x;
    const targetCenterX = a.x + a.width / 2;
    const targetRight = a.x + a.width;
    
    const opts = [
      { diff: Math.abs(activeRight - targetLeft), snapWidth: targetLeft - tileLeft, line: targetLeft },
      { diff: Math.abs(activeRight - targetCenterX), snapWidth: targetCenterX - tileLeft, line: targetCenterX },
      { diff: Math.abs(activeRight - targetRight), snapWidth: targetRight - tileLeft, line: targetRight }
    ];
    
    for (const opt of opts) {
      if (opt.diff < minDiffX) {
        if (opt.snapWidth >= 160) {
          minDiffX = opt.diff;
          snappedWidth = opt.snapWidth;
          bestXLine = opt.line;
          snappedXApplied = true;
        }
      }
    }
  }
  
  // Resizing bottom edge (determines height, draws Horizontal guide lines)
  const activeBottom = tileTop + candidateHeight;
  
  for (const a of otherAssets) {
    const targetTop = a.y;
    const targetCenterY = a.y + a.height / 2;
    const targetBottom = a.y + a.height;
    
    const opts = [
      { diff: Math.abs(activeBottom - targetTop), snapHeight: targetTop - tileTop, line: targetTop },
      { diff: Math.abs(activeBottom - targetCenterY), snapHeight: targetCenterY - tileTop, line: targetCenterY },
      { diff: Math.abs(activeBottom - targetBottom), snapHeight: targetBottom - tileTop, line: targetBottom }
    ];
    
    for (const opt of opts) {
      if (opt.diff < minDiffY) {
        if (opt.snapHeight >= 160) {
          minDiffY = opt.diff;
          snappedHeight = opt.snapHeight;
          bestYLine = opt.line;
          snappedYApplied = true;
        }
      }
    }
  }
  
  return {
    width: snappedWidth,
    height: snappedHeight,
    snappedX: snappedXApplied,
    snappedY: snappedYApplied,
    bestXLine,
    bestYLine
  };
}
