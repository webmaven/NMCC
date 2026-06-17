/**
 * Creative Mood Board App - Core Application Logic
 * Implements canvas drag & resize, state tracking, and GitHub API persistence.
 */

// ==========================================================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================================================
let boardData = { assets: [] };
let undoStack = [];
let redoStack = [];
let lastSavedState = '';
let dragStartSnapshot = null;
let selectedTileId = null;
let isDirty = false;
let isDragging = false;
let isResizing = false;
let isPanning = false;

// Dynamic Canvas Dimensions
let boardWidth = 10000;
let boardHeight = 10000;

// Zoom & Editing Globals
let zoom = 1.0;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.0;
let editingAssetId = null;

// Snapping Globals
let snapToGridActive = true;
let snapToAlignActive = true;

// Dragging & Resizing Math
let startX, startY;
let startLeft, startTop;
let startWidth, startHeight;
let activeTile = null;

// Edge scrolling and scroll tracking variables
let startScrollLeft = 0;
let startScrollTop = 0;
let edgeScrollDirectionX = 0; // -1 = Left, 1 = Right, 0 = None
let edgeScrollDirectionY = 0; // -1 = Top, 1 = Bottom, 0 = None
let edgeScrollAnimationId = null;
const EDGE_SCROLL_SPEED = 14; // pixels per frame
const EDGE_SCROLL_THRESHOLD = 60; // distance from viewport bounds in pixels
let currentPointerClientX = 0;
let currentPointerClientY = 0;

// Panning Math
let panStartX, panStartY;
let panScrollLeft, panScrollTop;

// Github Auth & Repo details
const REPO_OWNER = 'webmaven';
const REPO_NAME = 'NMCC';
const DATA_FILE_PATH = 'moodboard-data.json';
const BRANCH_NAME = 'gh-pages';

// DOM Selectors
const viewport = document.getElementById('viewport');
const board = document.getElementById('board');
const btnSave = document.getElementById('btn-save');
const btnLogin = document.getElementById('btn-login');
const btnAddElement = document.getElementById('btn-add-element');
const userPill = document.getElementById('user-pill');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Modals
const modalAdd = document.getElementById('modal-add');
const modalAuth = document.getElementById('modal-auth');

// ==========================================================================
// APPLICATION INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadBoardData();
  setupCanvasControls();
  setupModalControls();
  checkSavedAuth();
  
  // Keyboard listeners for interactions, delete, escape, and undo/redo
  document.addEventListener('keydown', (e) => {
    const isEditingText = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
    
    if (e.key === 'Escape') {
      deselectAll();
      closeAllModals();
    }
    
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTileId) {
      // Don't trigger if user is typing in an input
      if (!isEditingText) {
        deleteTile(selectedTileId);
      }
    }

    // Zoom Shortcuts: Cmd/Ctrl + '+', '-', '0' (Always enabled to override default browser zooming)
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (isCmdOrCtrl) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        zoomReset();
      }
    }

    // Undo / Redo Shortcuts (Bypass when editing text inputs to preserve native field history)
    if (!isEditingText) {
      // Undo: Cmd+Z or Ctrl+Z
      if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      
      // Redo: Cmd+Shift+Z, Ctrl+Shift+Z, Cmd+Y, or Ctrl+Y
      const isRedoKey = (e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y';
      if (isCmdOrCtrl && isRedoKey) {
        e.preventDefault();
        redo();
      }
      
      // Layering Shortcuts (Cmd/Ctrl + [ or ] with optional Shift)
      if (selectedTileId && isCmdOrCtrl) {
        if (e.key === ']') {
          e.preventDefault();
          if (e.shiftKey) {
            changeLayer(selectedTileId, 'front');
            showToast('Brought asset to absolute front', 'info', 1500);
          } else {
            changeLayer(selectedTileId, 'forward');
            showToast('Brought asset forward one layer', 'info', 1500);
          }
        } else if (e.key === '[') {
          e.preventDefault();
          if (e.shiftKey) {
            changeLayer(selectedTileId, 'back');
            showToast('Sent asset to absolute back', 'info', 1500);
          } else {
            changeLayer(selectedTileId, 'backward');
            showToast('Sent asset backward one layer', 'info', 1500);
          }
        }
      }
    }
  });
});

// ==========================================================================
// DRAFT STYLISH NOTIFICATIONS (TOASTS)
// ==========================================================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconMarkup = '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  if (type === 'success') {
    iconMarkup = '<svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (type === 'error' || type === 'warning') {
    iconMarkup = '<svg class="icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  }
  
  toast.innerHTML = `${iconMarkup}<span>${message}</span>`;
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('active'), 50);
  
  // Remove
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


// ==========================================================================
// MOOD BOARD LOADING & RENDERING
// ==========================================================================
async function loadBoardData() {
  try {
    showToast('Loading mood board configuration...', 'info', 2000);
    // Fetch data from local server / github pages with cache buster
    const response = await fetch(`${DATA_FILE_PATH}?_cb=${Date.now()}`);
    if (!response.ok) throw new Error('Data file not found or corrupted.');
    
    boardData = await response.json();
    
    // Initialize history baseline
    lastSavedState = JSON.stringify(boardData);
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    
    renderBoard();
    showToast('Inspiration board loaded successfully!', 'success', 2500);
  } catch (error) {
    console.error('Error loading board data:', error);
    showToast('Failed to load board from gh-pages. Loading empty fallback.', 'error', 4000);
    boardData = { assets: [] };
    
    // Initialize empty history baseline
    lastSavedState = JSON.stringify(boardData);
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    
    renderBoard();
  }
}

// Helper functions for dynamic infinite board expansion
function updateBoardDimensions(width, height) {
  if (width > boardWidth) {
    boardWidth = width;
    board.style.width = `${boardWidth}px`;
  }
  if (height > boardHeight) {
    boardHeight = height;
    board.style.height = `${boardHeight}px`;
  }
}

// Edge scrolling and active tile positioning helper functions
function updateActiveTilePosition() {
  if (!activeTile) return;
  
  const clientX = currentPointerClientX;
  const clientY = currentPointerClientY;
  
  // Calculate viewport scroll deltas
  const scrollDx = (viewport.scrollLeft - startScrollLeft) / zoom;
  const scrollDy = (viewport.scrollTop - startScrollTop) / zoom;
  
  if (isDragging) {
    const dx = (clientX - startX) / zoom + scrollDx;
    const dy = (clientY - startY) / zoom + scrollDy;
    
    clearSmartGuides();
    
    let candidateLeft = startLeft + dx;
    let candidateTop = startTop + dy;
    
    let snappedXApplied = false;
    let snappedYApplied = false;
    
    if (snapToAlignActive) {
      const snapped = calculateAlignmentSnapping(candidateLeft, candidateTop, activeTile.offsetWidth, activeTile.offsetHeight);
      candidateLeft = snapped.x;
      candidateTop = snapped.y;
      snappedXApplied = snapped.snappedX;
      snappedYApplied = snapped.snappedY;
    }
    
    if (snapToGridActive) {
      if (!snappedXApplied) {
        candidateLeft = Math.round(candidateLeft / 20) * 20;
      }
      if (!snappedYApplied) {
        candidateTop = Math.round(candidateTop / 20) * 20;
      }
    }
    
    // Keep inside top-left bounds but allow infinite right-bottom scrolling
    let newLeft = Math.max(0, candidateLeft);
    let newTop = Math.max(0, candidateTop);
    
    // Dynamically expand the board if dragging near or past boundaries
    const neededWidth = newLeft + activeTile.offsetWidth + 200;
    const neededHeight = newTop + activeTile.offsetHeight + 200;
    updateBoardDimensions(neededWidth, neededHeight);
    
    activeTile.style.left = `${newLeft}px`;
    activeTile.style.top = `${newTop}px`;
    
    // Update coordinates in the HUD
    const hudCoords = document.getElementById('hud-coords');
    if (hudCoords) {
      const boardRect = board.getBoundingClientRect();
      const x = Math.round(clientX - boardRect.left);
      const y = Math.round(clientY - boardRect.top);
      if (x >= 0 && x <= boardWidth && y >= 0 && y <= boardHeight) {
        hudCoords.textContent = `X: ${x}px, Y: ${y}px`;
      }
    }
    
  } else if (isResizing) {
    const dx = (clientX - startX) / zoom + scrollDx;
    const dy = (clientY - startY) / zoom + scrollDy;
    
    clearSmartGuides();
    
    const tileLeft = parseFloat(activeTile.style.left) || 0;
    const tileTop = parseFloat(activeTile.style.top) || 0;
    
    let candidateWidth = startWidth + dx;
    let candidateHeight = startHeight + dy;
    
    let snappedXApplied = false;
    let snappedYApplied = false;
    
    if (snapToAlignActive) {
      const snapped = calculateResizingSnapping(tileLeft, tileTop, candidateWidth, candidateHeight);
      candidateWidth = snapped.width;
      candidateHeight = snapped.height;
      snappedXApplied = snapped.snappedX;
      snappedYApplied = snapped.snappedY;
    }
    
    if (snapToGridActive) {
      if (!snappedXApplied) {
        const rawRight = tileLeft + candidateWidth;
        const snappedRight = Math.round(rawRight / 20) * 20;
        candidateWidth = snappedRight - tileLeft;
      }
      if (!snappedYApplied) {
        const rawBottom = tileTop + candidateHeight;
        const snappedBottom = Math.round(rawBottom / 20) * 20;
        candidateHeight = snappedBottom - tileTop;
      }
    }
    
    // Keep min dimension 160px
    let newWidth = Math.max(160, candidateWidth);
    let newHeight = Math.max(160, candidateHeight);
    
    activeTile.style.width = `${newWidth}px`;
    activeTile.style.height = `${newHeight}px`;
    
    // Dynamically expand the board if resizing near or past boundaries
    const neededWidth = tileLeft + newWidth + 200;
    const neededHeight = tileTop + newHeight + 200;
    updateBoardDimensions(neededWidth, neededHeight);
  }
}

function startEdgeScrollLoop() {
  if (edgeScrollAnimationId) return;
  
  function scrollStep() {
    if (!isDragging && !isResizing) {
      stopEdgeScrollLoop();
      return;
    }
    
    let scrolled = false;
    
    // Check horizontal scroll limits
    if (edgeScrollDirectionX === 1) {
      viewport.scrollLeft += EDGE_SCROLL_SPEED;
      scrolled = true;
    } else if (edgeScrollDirectionX === -1 && viewport.scrollLeft > 0) {
      viewport.scrollLeft -= EDGE_SCROLL_SPEED;
      scrolled = true;
    }
    
    // Check vertical scroll limits
    if (edgeScrollDirectionY === 1) {
      viewport.scrollTop += EDGE_SCROLL_SPEED;
      scrolled = true;
    } else if (edgeScrollDirectionY === -1 && viewport.scrollTop > 0) {
      viewport.scrollTop -= EDGE_SCROLL_SPEED;
      scrolled = true;
    }
    
    if (scrolled) {
      // Re-trigger displacement and coordinate updates since scroll position changed!
      updateActiveTilePosition();
    }
    
    edgeScrollAnimationId = requestAnimationFrame(scrollStep);
  }
  
  edgeScrollAnimationId = requestAnimationFrame(scrollStep);
}

function stopEdgeScrollLoop() {
  if (edgeScrollAnimationId) {
    cancelAnimationFrame(edgeScrollAnimationId);
    edgeScrollAnimationId = null;
  }
  edgeScrollDirectionX = 0;
  edgeScrollDirectionY = 0;
}

function checkEdgeScrollThreshold(clientX, clientY) {
  if (!isDragging && !isResizing) {
    stopEdgeScrollLoop();
    return;
  }
  
  const rect = viewport.getBoundingClientRect();
  
  // Reset directions
  edgeScrollDirectionX = 0;
  edgeScrollDirectionY = 0;
  
  // Check horizontal edges
  if (clientX > rect.right - EDGE_SCROLL_THRESHOLD) {
    edgeScrollDirectionX = 1; // Scroll right
  } else if (clientX < rect.left + EDGE_SCROLL_THRESHOLD) {
    if (viewport.scrollLeft > 0) {
      edgeScrollDirectionX = -1; // Scroll left
    }
  }
  
  // Check vertical edges
  if (clientY > rect.bottom - EDGE_SCROLL_THRESHOLD) {
    edgeScrollDirectionY = 1; // Scroll down
  } else if (clientY < rect.top + EDGE_SCROLL_THRESHOLD) {
    if (viewport.scrollTop > 0) {
      edgeScrollDirectionY = -1; // Scroll up
    }
  }
  
  // Start or stop loop accordingly
  if (edgeScrollDirectionX !== 0 || edgeScrollDirectionY !== 0) {
    startEdgeScrollLoop();
  } else {
    stopEdgeScrollLoop();
  }
}

function ensureBoardSizeForAssets() {
  let maxRight = 10000;
  let maxBottom = 10000;
  
  if (boardData && boardData.assets) {
    boardData.assets.forEach(asset => {
      const right = (asset.x || 0) + (asset.width || 200);
      const bottom = (asset.y || 0) + (asset.height || 200);
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });
  }
  
  // Expand in 800px increments if we exceed our starting baseline
  const neededWidth = Math.max(10000, Math.ceil(maxRight / 800) * 800);
  const neededHeight = Math.max(10000, Math.ceil(maxBottom / 800) * 800);
  
  updateBoardDimensions(neededWidth, neededHeight);
}

function renderBoard() {
  ensureBoardSizeForAssets();
  
  // Clear any existing tiles on the board, keep the HUD/background
  const existingTiles = board.querySelectorAll('.tile');
  existingTiles.forEach(tile => tile.remove());
  
  // Sort by z-index to render correct overlapping layering
  const sortedAssets = [...boardData.assets].sort((a, b) => (a.z || 0) - (b.z || 0));
  
  sortedAssets.forEach(asset => {
    createTileDOM(asset);
  });
}

// Simple and robust parser for markdown inside text cards
function parseMarkdown(text) {
  if (!text) return '';
  let html = text;
  
  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  
  // Links: [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  
  // Wrap list items in <ul>
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  // Clean up duplicate nested <ul> tags
  html = html.replace(/<\/ul>\s*<ul>/gim, '');
  
  // Paragraph line breaks (excluding list items & headers)
  html = html.split('\n').map(line => {
    if (line.trim() === '') return '';
    if (line.startsWith('<h') || line.startsWith('<li>') || line.startsWith('<ul>') || line.startsWith('</ul')) return line;
    return `<p>${line}</p>`;
  }).join('\n');
  
  return html;
}

// Generate the beautiful SVG Seven-pointed star motif
function getSevenPointedStarSVG() {
  const cx = 50;
  const cy = 50;
  const R = 45; // Outer radius
  const r = 18; // Inner radius - r = 18 balances the peak-to-valley ratio perfectly
  const numPoints = 7;
  let pathData = '';
  
  for (let i = 0; i < numPoints; i++) {
    // Outer point (peak)
    const angleOuter = -Math.PI / 2 + (i * 2 * Math.PI) / numPoints;
    const xOuter = cx + R * Math.cos(angleOuter);
    const yOuter = cy + R * Math.sin(angleOuter);
    
    // Inner point (valley)
    const angleInner = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / numPoints;
    const xInner = cx + r * Math.cos(angleInner);
    const yInner = cy + r * Math.sin(angleInner);
    
    if (i === 0) {
      pathData += `M ${xOuter.toFixed(2)} ${yOuter.toFixed(2)} `;
    } else {
      pathData += `L ${xOuter.toFixed(2)} ${yOuter.toFixed(2)} `;
    }
    pathData += `L ${xInner.toFixed(2)} ${yInner.toFixed(2)} `;
  }
  pathData += 'Z';
  
  return `
    <svg class="tile-motif-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${pathData}" 
            fill="currentColor" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="50" cy="50" r="12" fill="#0f1115" stroke="currentColor" stroke-width="2"/>
    </svg>
  `;
}

function createTileDOM(asset) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = `tile-${asset.id}`;
  tile.style.left = `${asset.x}px`;
  tile.style.top = `${asset.y}px`;
  tile.style.width = `${asset.width}px`;
  tile.style.height = `${asset.height}px`;
  tile.style.zIndex = asset.z || 1;
  
  // Apply custom background and text color for text/sticky cards
  if (asset.type === 'text') {
    if (asset.background) {
      tile.style.backgroundColor = asset.background;
    }
    if (asset.color) {
      tile.style.color = asset.color;
    }
  }
  
  // Inner structure template
  tile.innerHTML = `
    <div class="tile-header">
      <div class="tile-title">${asset.title}</div>
      <div class="tile-header-actions">
        <button class="tile-edit-btn" title="Edit Card Content" onclick="event.stopPropagation(); editTile('${asset.id}')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Edit
        </button>
        <div class="tile-type-icon">${getTypeIcon(asset.type)}</div>
      </div>
    </div>
    <div class="tile-body">
      ${getTileBodyContent(asset)}
    </div>
    <div class="resize-handle"></div>
    <div class="tile-toolbar">
      <button class="tb-btn" title="Bring to Front (To Top)" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'front')">
        <svg class="icon" viewBox="0 0 24 24"><line x1="5" y1="4" x2="19" y2="4"></line><polyline points="17 14 12 9 7 14"></polyline><line x1="12" y1="9" x2="12" y2="20"></line></svg>
      </button>
      <button class="tb-btn" title="Bring Forward (Up 1 Layer)" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'forward')">
        <svg class="icon" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"></polyline></svg>
      </button>
      <button class="tb-btn" title="Send Backward (Down 1 Layer)" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'backward')">
        <svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <button class="tb-btn" title="Send to Back (To Bottom)" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'back')">
        <svg class="icon" viewBox="0 0 24 24"><line x1="5" y1="20" x2="19" y2="20"></line><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="4"></line></svg>
      </button>
      <div class="tb-divider"></div>
      <button class="tb-btn" title="Edit Card Content" onclick="event.stopPropagation(); editTile('${asset.id}')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
      </button>
      <button class="tb-btn delete" title="Delete Asset" onclick="event.stopPropagation(); deleteTile('${asset.id}')">
        <svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>
    </div>
  `;
  
  // Event Listeners for Interaction
  tile.addEventListener('mousedown', (e) => startInteraction(e, asset.id, tile));
  tile.addEventListener('touchstart', (e) => startInteraction(e, asset.id, tile), { passive: false });
  tile.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    editTile(asset.id);
  });
  
  board.appendChild(tile);
  return tile;
}

function getTypeIcon(type) {
  switch (type) {
    case 'color':
      return `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22C17.52 22 22 17.52 22 12S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"></path><circle cx="7.5" cy="10.5" r="1.5"></circle><circle cx="11.5" cy="7.5" r="1.5"></circle><circle cx="16.5" cy="9.5" r="1.5"></circle><circle cx="15.5" cy="14.5" r="1.5"></circle></svg>`;
    case 'image':
      return `<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
    case 'text':
      return `<svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    case 'motif':
      return `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z"></path></svg>`;
    default:
      return `<svg class="icon" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
  }
}

function getTileBodyContent(asset) {
  switch (asset.type) {
    case 'color':
      return `
        <div class="tile-color-preview" style="background-color: ${asset.value};"></div>
        <div class="tile-color-value">${asset.value}</div>
        <div class="tile-color-desc">${asset.description || ''}</div>
      `;
    case 'image':
      return `
        <div class="tile-image-container">
          <img src="${asset.url}" alt="${asset.title}" loading="lazy" onerror="this.src='https://placehold.co/400?text=Image+Load+Error'">
          <div class="tile-image-overlay">
            <div class="tile-image-title">${asset.title}</div>
            <div class="tile-image-desc">${asset.description || ''}</div>
          </div>
        </div>
      `;
    case 'text':
      return `<div class="tile-text-content">${parseMarkdown(asset.content)}</div>`;
    case 'motif':
      if (asset.motifType === 'star') {
        return `
          <div class="tile-motif-container">
            ${getSevenPointedStarSVG()}
            <div class="tile-motif-desc">${asset.description || ''}</div>
          </div>
        `;
      }
      return `<div class="tile-motif-desc">${asset.description || ''}</div>`;
    default:
      return '';
  }
}

// ==========================================================================
// DRAG, RESIZE, PAN INTERACTION MECHANICS
// ==========================================================================
function setupCanvasControls() {
  // Initialize Snapping Settings from DOM/LocalStorage
  const chkGrid = document.getElementById('chk-snap-grid');
  const chkAlign = document.getElementById('chk-snap-align');
  
  if (chkGrid) {
    const savedGrid = localStorage.getItem('snapToGridActive');
    if (savedGrid !== null) {
      snapToGridActive = savedGrid === 'true';
      chkGrid.checked = snapToGridActive;
    } else {
      snapToGridActive = chkGrid.checked;
    }
    chkGrid.addEventListener('change', (e) => {
      snapToGridActive = e.target.checked;
      localStorage.setItem('snapToGridActive', snapToGridActive);
      showToast(snapToGridActive ? 'Snap to Grid enabled' : 'Snap to Grid disabled', 'info', 1500);
    });
  }
  
  if (chkAlign) {
    const savedAlign = localStorage.getItem('snapToAlignActive');
    if (savedAlign !== null) {
      snapToAlignActive = savedAlign === 'true';
      chkAlign.checked = snapToAlignActive;
    } else {
      snapToAlignActive = chkAlign.checked;
    }
    chkAlign.addEventListener('change', (e) => {
      snapToAlignActive = e.target.checked;
      localStorage.setItem('snapToAlignActive', snapToAlignActive);
      showToast(snapToAlignActive ? 'Smart Guides enabled' : 'Smart Guides disabled', 'info', 1500);
    });
  }

  // Deselect when clicking canvas background
  viewport.addEventListener('mousedown', (e) => {
    if (e.target === viewport || e.target === board) {
      deselectAll();
      
      // Start drag scroll (panning background)
      isPanning = true;
      viewport.style.cursor = 'grabbing';
      panStartX = e.pageX - viewport.offsetLeft;
      panStartY = e.pageY - viewport.offsetTop;
      panScrollLeft = viewport.scrollLeft;
      panScrollTop = viewport.scrollTop;
    }
  });
  
  // Track mouse coordinates on status HUD
  const hudCoords = document.getElementById('hud-coords');
  const handleMove = (e) => {
    const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
    
    // Fallback if no coordinates available
    if (clientX === undefined || clientY === undefined) return;
    
    const rect = board.getBoundingClientRect();
    const x = Math.round(clientX - rect.left);
    const y = Math.round(clientY - rect.top);
    if (x >= 0 && x <= boardWidth && y >= 0 && y <= boardHeight) {
      hudCoords.textContent = `X: ${x}px, Y: ${y}px`;
    }
    
    // Perform actions depending on active state
    if (isPanning) {
      const pageX = (e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX)) - viewport.offsetLeft;
      const pageY = (e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY)) - viewport.offsetTop;
      const walkX = (pageX - panStartX) * 1.5; // Scroll speed modifier
      const walkY = (pageY - panStartY) * 1.5;
      viewport.scrollLeft = panScrollLeft - walkX;
      viewport.scrollTop = panScrollTop - walkY;
    } else if ((isDragging || isResizing) && activeTile) {
      currentPointerClientX = clientX;
      currentPointerClientY = clientY;
      updateActiveTilePosition();
      checkEdgeScrollThreshold(clientX, clientY);
    }
  };
  
  viewport.addEventListener('mousemove', handleMove);
  viewport.addEventListener('touchmove', (e) => {
    if (isDragging || isResizing) {
      if (e.cancelable) e.preventDefault();
    }
    handleMove(e);
  }, { passive: false });

  // End interaction
  window.addEventListener('mouseup', () => endInteraction());
  window.addEventListener('touchend', () => endInteraction());

  // Trackpad pinch-to-zoom and Ctrl+wheel / Cmd+wheel zoom on viewport
  viewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomIntensity = 0.05;
      let newZoom = zoom + (e.deltaY < 0 ? zoomIntensity : -zoomIntensity);
      setZoom(newZoom, e.clientX, e.clientY);
    }
  }, { passive: false });
}

function startInteraction(e, assetId, tileElement) {
  // Deselect any previous target
  deselectAll();
  
  // Set current selected asset
  selectedTileId = assetId;
  activeTile = tileElement;
  tileElement.classList.add('selected');
  
  // Capture snapshot for history undo before modification
  dragStartSnapshot = JSON.stringify(boardData);
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  startX = clientX;
  startY = clientY;
  
  startLeft = parseInt(tileElement.style.left) || 0;
  startTop = parseInt(tileElement.style.top) || 0;
  startWidth = tileElement.offsetWidth;
  startHeight = tileElement.offsetHeight;
  
  // Viewport scroll capture
  startScrollLeft = viewport.scrollLeft;
  startScrollTop = viewport.scrollTop;
  currentPointerClientX = clientX;
  currentPointerClientY = clientY;
  
  // Prevent propagation to canvas
  e.stopPropagation();
  
  // Check if click was on the resize-handle
  if (e.target.classList.contains('resize-handle')) {
    isResizing = true;
    e.preventDefault();
  } else {
    isDragging = true;
  }
}

function endInteraction() {
  clearSmartGuides();
  stopEdgeScrollLoop();
  
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = 'grab';
  }
  
  if ((isDragging || isResizing) && activeTile && selectedTileId) {
    const finalLeft = parseInt(activeTile.style.left);
    const finalTop = parseInt(activeTile.style.top);
    const finalWidth = activeTile.offsetWidth;
    const finalHeight = activeTile.offsetHeight;
    
    // Find index in database state and check if modified
    const index = boardData.assets.findIndex(a => a.id === selectedTileId);
    if (index !== -1) {
      const asset = boardData.assets[index];
      if (asset.x !== finalLeft || asset.y !== finalTop || asset.width !== finalWidth || asset.height !== finalHeight) {
        // A real modification occurred! Save to history stack first
        if (dragStartSnapshot) {
          undoStack.push(dragStartSnapshot);
          redoStack = [];
          updateUndoRedoButtons();
        }
        
        asset.x = finalLeft;
        asset.y = finalTop;
        asset.width = finalWidth;
        asset.height = finalHeight;
        
        checkDirtyState();
      }
    }
  }
  
  isDragging = false;
  isResizing = false;
  activeTile = null;
}

function deselectAll() {
  const tiles = board.querySelectorAll('.tile');
  tiles.forEach(tile => tile.classList.remove('selected'));
  selectedTileId = null;
}

function markAsUnsaved() {
  isDirty = true;
  btnSave.classList.add('dirty');
  btnSave.classList.remove('saved');
}

function markAsSaved() {
  isDirty = false;
  btnSave.classList.remove('dirty');
  btnSave.classList.add('saved');
}

// ==========================================================================
// TILE EDIT & ACTIONS (DELETE, LAYERING)
// ==========================================================================
function changeLayer(id, action) {
  const index = boardData.assets.findIndex(a => a.id === id);
  if (index === -1) return;
  
  // Push state to undoStack before modifying
  undoStack.push(JSON.stringify(boardData));
  redoStack = [];
  updateUndoRedoButtons();
  
  // Normalize z-indices to solid sequential integers starting from 1
  const sorted = [...boardData.assets].sort((a, b) => (a.z || 1) - (b.z || 1));
  sorted.forEach((asset, idx) => {
    asset.z = idx + 1;
  });
  
  const currentSortedIdx = sorted.findIndex(a => a.id === id);
  
  if (action === 'front') {
    boardData.assets[index].z = sorted.length + 1;
  } else if (action === 'back') {
    boardData.assets[index].z = 0;
  } else if (action === 'forward') {
    if (currentSortedIdx < sorted.length - 1) {
      const nextAsset = sorted[currentSortedIdx + 1];
      const tempZ = boardData.assets[index].z || 1;
      const nextAssetIndexInOriginal = boardData.assets.findIndex(a => a.id === nextAsset.id);
      
      boardData.assets[index].z = nextAsset.z;
      if (nextAssetIndexInOriginal !== -1) {
        boardData.assets[nextAssetIndexInOriginal].z = tempZ;
      }
    }
  } else if (action === 'backward') {
    if (currentSortedIdx > 0) {
      const prevAsset = sorted[currentSortedIdx - 1];
      const tempZ = boardData.assets[index].z || 1;
      const prevAssetIndexInOriginal = boardData.assets.findIndex(a => a.id === prevAsset.id);
      
      boardData.assets[index].z = prevAsset.z;
      if (prevAssetIndexInOriginal !== -1) {
        boardData.assets[prevAssetIndexInOriginal].z = tempZ;
      }
    }
  }
  
  // Normalize once more to compress any gaps and save clean 1..N sequence
  const finalSorted = [...boardData.assets].sort((a, b) => (a.z || 1) - (b.z || 1));
  finalSorted.forEach((asset, idx) => {
    asset.z = idx + 1;
  });
  
  checkDirtyState();
  renderBoard();
  
  // Re-select the element after rendering
  const updatedDOM = document.getElementById(`tile-${id}`);
  if (updatedDOM) {
    selectedTileId = id;
    activeTile = updatedDOM;
    updatedDOM.classList.add('selected');
  }
}

function deleteTile(id) {
  const confirmDelete = confirm('Are you sure you want to delete this asset from the mood board?');
  if (!confirmDelete) return;
  
  // Push state to undoStack before modifying
  undoStack.push(JSON.stringify(boardData));
  redoStack = [];
  updateUndoRedoButtons();
  
  boardData.assets = boardData.assets.filter(a => a.id !== id);
  deselectAll();
  renderBoard();
  checkDirtyState();
  showToast('Asset removed from canvas.', 'info');
}

// ==========================================================================
// ADD ASSET MODAL MECHANICS
// ==========================================================================
let currentTabType = 'color';

function setupModalControls() {
  // Floating Add element button
  btnAddElement.addEventListener('click', () => openModal(modalAdd));
  
  // Selector tabs in element addition modal
  const tabs = document.querySelectorAll('.type-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTabType = tab.dataset.type;
      
      // Toggle form sections
      document.querySelectorAll('.form-section').forEach(sec => sec.style.display = 'none');
      document.getElementById(`sec-${currentTabType}`).style.display = 'block';
    });
  });
  
  // Handle local image file upload base64 encoding
  const imageFileInput = document.getElementById('image-file');
  const uploadZone = document.getElementById('upload-zone');
  
  uploadZone.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Limit to 2MB to keep JSON small
        showToast('Image file too large (max 2MB for browser persistence).', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        document.getElementById('image-url').value = event.target.result;
        uploadZone.querySelector('span').textContent = `Loaded: ${file.name}`;
        showToast('Image successfully encoded!', 'success', 2000);
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Close modals clicking outside or on close buttons
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });
}

function openModal(modal) {
  modal.classList.add('active');
}

function closeAllModals() {
  modalAdd.classList.remove('active');
  modalAuth.classList.remove('active');
  
  // Reset editing mode if it was active
  if (editingAssetId) {
    editingAssetId = null;
    const modalHeader = document.querySelector('#modal-add .modal-header h2');
    const modalSubmitBtn = document.querySelector('#modal-add .modal-footer .btn-primary');
    if (modalHeader) modalHeader.textContent = 'Add Design Element';
    if (modalSubmitBtn) modalSubmitBtn.textContent = 'Place on Board';
    
    // Clear inputs
    document.getElementById('element-title').value = '';
    document.getElementById('color-desc').value = '';
    document.getElementById('image-url').value = '';
    document.getElementById('image-desc').value = '';
    document.getElementById('text-body').value = '';
    document.getElementById('upload-zone').querySelector('span').textContent = 'Drag and drop or Click to upload (under 2MB)';
  }
}

function submitNewElement() {
  const titleInput = document.getElementById('element-title');
  
  if (editingAssetId) {
    const index = boardData.assets.findIndex(a => a.id === editingAssetId);
    if (index === -1) return;
    
    // Push state to undoStack before modifying
    undoStack.push(JSON.stringify(boardData));
    redoStack = [];
    updateUndoRedoButtons();
    
    const asset = boardData.assets[index];
    asset.title = titleInput.value.trim() || `Untitled ${asset.type}`;
    
    if (asset.type === 'color') {
      asset.value = document.getElementById('color-picker-val').value;
      asset.description = document.getElementById('color-desc').value.trim();
    } else if (asset.type === 'image') {
      const url = document.getElementById('image-url').value.trim();
      if (!url) {
        showToast('Please specify an image link or upload a file.', 'error');
        return;
      }
      asset.url = url;
      asset.description = document.getElementById('image-desc').value.trim();
    } else if (asset.type === 'text') {
      const content = document.getElementById('text-body').value.trim();
      if (!content) {
        showToast('Please type some card text.', 'error');
        return;
      }
      asset.content = content;
      asset.background = document.getElementById('text-bg').value;
      asset.color = document.getElementById('text-color').value;
    } else if (asset.type === 'motif') {
      asset.motifType = document.getElementById('motif-select').value;
      asset.description = document.getElementById('motif-desc').value.trim();
    }
    
    // Re-render and dirty check
    renderBoard();
    checkDirtyState();
    
    // Close & reset
    closeAllModals();
    showToast('Asset updated successfully!', 'success');
    return;
  }

  const title = titleInput.value.trim() || `New ${currentTabType}`;
  const id = `${currentTabType}-${Date.now()}`;
  
  // Default coordinates at viewport scroll center to be visible immediately
  const scrollX = viewport.scrollLeft + (viewport.offsetWidth / 2) - 150;
  const scrollY = viewport.scrollTop + (viewport.offsetHeight / 2) - 150;
  
  let newAsset = {
    id: id,
    type: currentTabType,
    title: title,
    x: Math.max(50, Math.round(scrollX)),
    y: Math.max(50, Math.round(scrollY)),
    z: boardData.assets.length + 1
  };
  
  if (currentTabType === 'color') {
    const val = document.getElementById('color-picker-val').value;
    const desc = document.getElementById('color-desc').value.trim();
    newAsset.value = val;
    newAsset.description = desc;
    newAsset.width = 220;
    newAsset.height = 220;
  } else if (currentTabType === 'image') {
    const url = document.getElementById('image-url').value.trim();
    const desc = document.getElementById('image-desc').value.trim();
    if (!url) {
      showToast('Please specify an image link or upload a file.', 'error');
      return;
    }
    newAsset.url = url;
    newAsset.description = desc;
    newAsset.width = 340;
    newAsset.height = 380;
  } else if (currentTabType === 'text') {
    const content = document.getElementById('text-body').value.trim();
    const bg = document.getElementById('text-bg').value;
    const txtColor = document.getElementById('text-color').value;
    if (!content) {
      showToast('Please type some card text.', 'error');
      return;
    }
    newAsset.content = content;
    newAsset.background = bg;
    newAsset.color = txtColor;
    newAsset.width = 300;
    newAsset.height = 340;
  } else if (currentTabType === 'motif') {
    const motifType = document.getElementById('motif-select').value;
    const desc = document.getElementById('motif-desc').value.trim();
    newAsset.motifType = motifType;
    newAsset.description = desc;
    newAsset.width = 300;
    newAsset.height = 280;
  }
  
  // Push state to undoStack before modifying
  undoStack.push(JSON.stringify(boardData));
  redoStack = [];
  updateUndoRedoButtons();
  
  // Push & Save state
  boardData.assets.push(newAsset);
  createTileDOM(newAsset);
  checkDirtyState();
  
  // Clear inputs & close
  titleInput.value = '';
  document.getElementById('color-desc').value = '';
  document.getElementById('image-url').value = '';
  document.getElementById('image-desc').value = '';
  document.getElementById('text-body').value = '';
  document.getElementById('upload-zone').querySelector('span').textContent = 'Drag and drop or Click to upload (under 2MB)';
  
  closeAllModals();
  showToast('New asset successfully added!', 'success');
}

// ==========================================================================
// GITHUB REST API PERSISTENCE INTEGRATION
// ==========================================================================
function checkSavedAuth() {
  const token = localStorage.getItem('nmcc_github_pat');
  if (token) {
    btnLogin.textContent = 'Change Token';
    userPill.style.display = 'flex';
    userName.textContent = REPO_OWNER;
    userAvatar.textContent = REPO_OWNER[0].toUpperCase();
  } else {
    btnLogin.textContent = 'Login with GitHub';
    userPill.style.display = 'none';
  }
}

function handleLoginClick() {
  const tokenInput = document.getElementById('pat-token');
  const savedToken = localStorage.getItem('nmcc_github_pat');
  if (savedToken) {
    tokenInput.value = savedToken;
  }
  openModal(modalAuth);
}

async function verifyAndSaveToken() {
  const tokenInput = document.getElementById('pat-token');
  const token = tokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a GitHub Personal Access Token.', 'error');
    return;
  }
  
  try {
    showToast('Verifying token credentials with GitHub...', 'info');
    const response = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${token}` }
    });
    
    if (!response.ok) throw new Error('Unauthorized or invalid token.');
    const user = await response.json();
    
    if (user.login.toLowerCase() !== REPO_OWNER.toLowerCase()) {
      showToast(`Logged in as ${user.login}. Please note that saving is reserved for the repository owner "${REPO_OWNER}".`, 'error', 6000);
    } else {
      showToast(`Welcome webmaven! Credentials authenticated successfully.`, 'success', 4000);
    }
    
    localStorage.setItem('nmcc_github_pat', token);
    checkSavedAuth();
    closeAllModals();
  } catch (error) {
    console.error('Auth verification error:', error);
    if (error.message && error.message.includes('Failed to fetch')) {
      showToast('Failed to connect: GitHub API request blocked. Please check your internet connection or disable ad-blockers/Brave Shields.', 'error', 8000);
    } else {
      showToast('Failed to authenticate token. Please check validity and permissions.', 'error');
    }
  }
}

function logout() {
  if (confirm('Delete saved GitHub token from this browser?')) {
    localStorage.removeItem('nmcc_github_pat');
    checkSavedAuth();
    showToast('Logged out. Credentials cleared.', 'info');
  }
}

async function commitBoardData() {
  const token = localStorage.getItem('nmcc_github_pat');
  if (!token) {
    showToast('Authorization required. Please paste your GitHub token to save changes.', 'warning');
    handleLoginClick();
    return;
  }
  
  btnSave.textContent = 'Saving...';
  btnSave.classList.add('saving');
  
  try {
    showToast('Connecting to GitHub repository API...', 'info', 1500);
    const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE_PATH}?ref=${BRANCH_NAME}&_cb=${Date.now()}`;
    
    // 1. Get the current file details to retrieve the latest commit SHA (prevents conflicts)
    const getResponse = await fetch(getUrl, {
      headers: { 
        'Authorization': `token ${token}`
      }
    });
    
    let fileSha = null;
    if (getResponse.ok) {
      const fileData = await getResponse.json();
      fileSha = fileData.sha;
    } else if (getResponse.status !== 404) {
      throw new Error(`Failed to query existing file SHA: ${getResponse.statusText}`);
    }
    
    // 2. Prepare payload - pretty printed JSON, base64 encoded
    const jsonContent = JSON.stringify(boardData, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));
    
    const putBody = {
      message: 'chore: update mood board assets through-the-web arrangement',
      content: base64Content,
      branch: BRANCH_NAME
    };
    
    if (fileSha) {
      putBody.sha = fileSha;
    }
    
    // 3. PUT request to write back to branch
    const putResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });
    
    if (!putResponse.ok) {
      const errorDetail = await putResponse.json();
      throw new Error(errorDetail.message || 'Commit request rejected by GitHub.');
    }
    
    lastSavedState = JSON.stringify(boardData);
    markAsSaved();
    updateUndoRedoButtons();
    showToast('Saved directly to gh-pages! Rebuilding site in background (takes ~30-60s).', 'success', 6000);
  } catch (error) {
    console.error('Error committing data to branch:', error);
    if (error.message && error.message.includes('Failed to fetch')) {
      showToast('Failed to save: Browser blocked network request (Failed to fetch). If you use Brave or have an ad-blocker (like uBlock), please disable shields/ad-blocker for this site and try again, or use "Export Backup" to save your files locally.', 'error', 12000);
    } else {
      showToast(`Failed to save: ${error.message}`, 'error', 6000);
    }
  } finally {
    btnSave.textContent = 'Save Changes';
    btnSave.classList.remove('saving');
  }
}

// ==========================================================================
// UNDO / REDO HISTORY ENGINE
// ==========================================================================
function undo() {
  if (undoStack.length === 0) return;
  
  // Push current state to redoStack
  redoStack.push(JSON.stringify(boardData));
  
  // Restore previous state
  boardData = JSON.parse(undoStack.pop());
  
  deselectAll();
  renderBoard();
  updateUndoRedoButtons();
  checkDirtyState();
  showToast('Undo action', 'info', 1000);
}

function redo() {
  if (redoStack.length === 0) return;
  
  // Push current state to undoStack
  undoStack.push(JSON.stringify(boardData));
  
  // Restore next state
  boardData = JSON.parse(redoStack.pop());
  
  deselectAll();
  renderBoard();
  updateUndoRedoButtons();
  checkDirtyState();
  showToast('Redo action', 'info', 1000);
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) {
    btnUndo.disabled = undoStack.length === 0;
  }
  if (btnRedo) {
    btnRedo.disabled = redoStack.length === 0;
  }
}

function checkDirtyState() {
  const currentStateStr = JSON.stringify(boardData);
  if (currentStateStr === lastSavedState) {
    markAsSaved();
  } else {
    markAsUnsaved();
  }
}

// ==========================================================================
// CANVAS ZOOM ENGINE & CARD EDITING
// ==========================================================================
function setZoom(level, clientX, clientY) {
  const oldZoom = zoom;
  
  // Clamp zoom level between MIN_ZOOM (20%) and MAX_ZOOM (300%)
  const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
  
  if (targetZoom === oldZoom) return; // No change in zoom
  
  // Calculate focal coordinates relative to viewport bounding client rect
  const rect = viewport.getBoundingClientRect();
  
  // Fallback to viewport center if coordinates not provided
  if (clientX === undefined || clientY === undefined) {
    clientX = rect.left + rect.width / 2;
    clientY = rect.top + rect.height / 2;
  }
  
  const focalX = clientX - rect.left;
  const focalY = clientY - rect.top;
  
  // Find current point on unscaled board coordinates
  const boardX = (viewport.scrollLeft + focalX) / oldZoom;
  const boardY = (viewport.scrollTop + focalY) / oldZoom;
  
  // Apply new zoom level
  zoom = targetZoom;
  
  if (board) {
    board.style.transform = `scale(${zoom})`;
  }
  
  // Update scrollbars to center precisely on the focal coordinate
  viewport.scrollLeft = boardX * zoom - focalX;
  viewport.scrollTop = boardY * zoom - focalY;
  
  // Update button HUD indicator
  const indicator = document.getElementById('zoom-indicator');
  if (indicator) {
    indicator.textContent = `${Math.round(zoom * 100)}%`;
  }
  
  // Update button disabled states if zoom is at limits
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  if (btnZoomIn) btnZoomIn.disabled = (zoom >= MAX_ZOOM);
  if (btnZoomOut) btnZoomOut.disabled = (zoom <= MIN_ZOOM);
}

function zoomIn() {
  setZoom(zoom + 0.1);
}

function zoomOut() {
  setZoom(zoom - 0.1);
}

function zoomReset() {
  setZoom(1.0);
}

function editTile(id) {
  const asset = boardData.assets.find(a => a.id === id);
  if (!asset) return;
  
  editingAssetId = id;
  
  // Update Modal UI labels for Editing state
  const modalHeader = document.querySelector('#modal-add .modal-header h2');
  const modalSubmitBtn = document.querySelector('#modal-add .modal-footer .btn-primary');
  if (modalHeader) modalHeader.textContent = 'Edit Design Element';
  if (modalSubmitBtn) modalSubmitBtn.textContent = 'Update Element';
  
  // Populate Title
  document.getElementById('element-title').value = asset.title || '';
  
  // Hide all form sections and remove active tab class
  const tabs = document.querySelectorAll('.type-tab');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.form-section').forEach(sec => sec.style.display = 'none');
  
  // Activate correct tab and show correct form section
  const targetTab = Array.from(tabs).find(t => t.dataset.type === asset.type);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  currentTabType = asset.type;
  document.getElementById(`sec-${asset.type}`).style.display = 'block';
  
  // Populate specific fields
  if (asset.type === 'color') {
    document.getElementById('color-picker-val').value = asset.value || '#000000';
    document.getElementById('color-desc').value = asset.description || '';
  } else if (asset.type === 'image') {
    document.getElementById('image-url').value = asset.url || '';
    document.getElementById('image-desc').value = asset.description || '';
    const fileLabel = document.getElementById('upload-zone').querySelector('span');
    if (fileLabel) fileLabel.textContent = asset.url && asset.url.startsWith('data:') ? 'Base64 Encoded Image' : 'Drag and drop or Click to upload (under 2MB)';
  } else if (asset.type === 'text') {
    document.getElementById('text-body').value = asset.content || '';
    document.getElementById('text-bg').value = asset.background || '#1e222b';
    document.getElementById('text-color').value = asset.color || '#f8f9fa';
  } else if (asset.type === 'motif') {
    document.getElementById('motif-select').value = asset.motifType || 'star';
    document.getElementById('motif-desc').value = asset.description || '';
  }
  
  openModal(modalAdd);
}

// ==========================================================================
// DYNAMIC SMART ALIGNMENT GUIDES & GRID SNAPPING ENGINE
// ==========================================================================
function clearSmartGuides() {
  const guides = board.querySelectorAll('.smart-guide-v, .smart-guide-h');
  guides.forEach(g => g.remove());
}

function drawSmartGuide(orientation, position) {
  const guide = document.createElement('div');
  if (orientation === 'v') {
    guide.className = 'smart-guide-v';
    guide.style.left = `${position}px`;
  } else {
    guide.className = 'smart-guide-h';
    guide.style.top = `${position}px`;
  }
  board.appendChild(guide);
}

function calculateAlignmentSnapping(candidateLeft, candidateTop, width, height) {
  let snappedX = candidateLeft;
  let snappedY = candidateTop;
  let snappedXApplied = false;
  let snappedYApplied = false;
  
  const threshold = 8; // threshold in pixels
  
  // Compare against all other assets currently rendered that are "nearby" (within 800px center-to-center)
  const activeCenterX = candidateLeft + width / 2;
  const activeCenterY = candidateTop + height / 2;
  
  const otherAssets = boardData.assets.filter(a => {
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
  
  // Render guides if snapping occurred
  if (snappedXApplied && bestXLine !== null) {
    drawSmartGuide('v', bestXLine);
  }
  if (snappedYApplied && bestYLine !== null) {
    drawSmartGuide('h', bestYLine);
  }
  
  return {
    x: snappedX,
    y: snappedY,
    snappedX: snappedXApplied,
    snappedY: snappedYApplied
  };
}

function calculateResizingSnapping(tileLeft, tileTop, candidateWidth, candidateHeight) {
  let snappedWidth = candidateWidth;
  let snappedHeight = candidateHeight;
  let snappedXApplied = false;
  let snappedYApplied = false;
  
  const threshold = 8; // threshold in pixels
  
  // Compare against all other assets currently rendered that are "nearby" (within 800px center-to-center)
  const activeCenterX = tileLeft + candidateWidth / 2;
  const activeCenterY = tileTop + candidateHeight / 2;
  
  const otherAssets = boardData.assets.filter(a => {
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
  
  // Render guides if snapping occurred
  if (snappedXApplied && bestXLine !== null) {
    drawSmartGuide('v', bestXLine);
  }
  if (snappedYApplied && bestYLine !== null) {
    drawSmartGuide('h', bestYLine);
  }
  
  return {
    width: snappedWidth,
    height: snappedHeight,
    snappedX: snappedXApplied,
    snappedY: snappedYApplied
  };
}

// ==========================================================================================
// FALLBACK CLIENT-SIDE EXPORT/DOWNLOAD OF BOARD STATE
// ==========================================================================
function downloadBackupJSON() {
  try {
    const jsonContent = JSON.stringify(boardData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moodboard-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Mood board JSON exported to downloads successfully!', 'success');
  } catch (error) {
    console.error('Error exporting JSON:', error);
    showToast(`Failed to export: ${error.message}`, 'error');
  }
}


