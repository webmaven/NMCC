/**
 * Curator Studio — Central Entry & Event Orchestrator Module
 * Manages active interactions (drag, resize, scroll panning, keyboard shortcuts)
 * and links state mutations to visual rendering frames.
 */

import { boardState } from './state.js';
import { calculateAlignmentSnapping, calculateResizingSnapping } from './math.js';
import { renderBoard, createTypeIcon } from './dom.js';
import { 
  verifyGithubToken, 
  commitBoardData as apiCommitBoardData, 
  downloadBackupJSON, 
  DATA_FILE_PATH,
  REPO_OWNER
} from './api.js';

// ==========================================================================
// INTERACTION & GESTURE MUTABLE STATES
// ==========================================================================
let isDragging = false;
let isResizing = false;
let isPanning = false;

// Scaled drag starting baseline
let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;
let startWidth = 0, startHeight = 0;
let activeTile = null;

// Viewport scrolling margins displacement
let startScrollLeft = 0;
let startScrollTop = 0;
let edgeScrollDirectionX = 0; // -1 = Left, 1 = Right, 0 = None
let edgeScrollDirectionY = 0; // -1 = Top, 1 = Bottom, 0 = None
let edgeScrollAnimationId = null;

const EDGE_SCROLL_SPEED = 14; // Pixels displaced per animation frame
const EDGE_SCROLL_THRESHOLD = 60; // Distance in px from viewport border that starts scrolling

let currentPointerClientX = 0;
let currentPointerClientY = 0;

// Canvas Background Space Panning
let panStartX = 0, panStartY = 0;
let panScrollLeft = 0, panScrollTop = 0;

let currentTabType = 'color';

// Symmetrical Sidebars Pinned States
let isStackPinned = false;
let isSettingsPinned = false;

// DOM Elements
let viewport = null;
let board = null;
let btnSave = null;
let btnLogin = null;
let btnAddElement = null;
let userPill = null;
let userAvatar = null;
let userName = null;
let modalAdd = null;
let modalAuth = null;

// ==========================================================================
// CORE LIFE LIFECYCLE INITIALIZER
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Bind DOM elements
  viewport = document.getElementById('viewport');
  board = document.getElementById('board');
  btnSave = document.getElementById('btn-save');
  btnLogin = document.getElementById('btn-login');
  btnAddElement = document.getElementById('btn-add-element');
  userPill = document.getElementById('user-pill');
  userAvatar = document.getElementById('user-avatar');
  userName = document.getElementById('user-name');
  modalAdd = document.getElementById('modal-add');
  modalAuth = document.getElementById('modal-auth');

  // Load and subscribe
  setupStateSubscriptions();
  setupCanvasControls();
  setupModalControls();
  setupKeyboardBindings();
  
  loadBoardData();
  checkSavedAuth();
});

// ==========================================================================
// CENTRAL STATE SUBSCRIPTIONS (EVENT HUB BINDINGS)
// ==========================================================================
function setupStateSubscriptions() {
  // Whenever boardData changes (Load, Undo, Redo, Delete, Create, Re-order), patch DOM in-place!
  boardState.subscribe('boardDataChange', () => {
    doRenderBoard();
    renderLayersStack();
  });
  
  // Update undo/redo header buttons
  boardState.subscribe('historyChange', ({ undoLength, redoLength }) => {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = undoLength === 0;
    if (btnRedo) btnRedo.disabled = redoLength === 0;
  });

  // Track active selection changes to toggle outline highlights
  boardState.subscribe('selectionChange', ({ selectedId, oldId }) => {
    if (oldId) {
      const oldTile = document.getElementById(`tile-${oldId}`);
      if (oldTile) oldTile.classList.remove('selected');
    }
    if (selectedId) {
      const newTile = document.getElementById(`tile-${selectedId}`);
      if (newTile) newTile.classList.add('selected');
    }
    renderLayersStack();
  });

  // Handle zooming updates by centering on focal point and applying CSS transforms
  boardState.subscribe('zoomChange', ({ zoom, oldZoom, clientX, clientY }) => {
    if (board) {
      board.style.transform = `scale(${zoom})`;
    }
    
    const rect = viewport.getBoundingClientRect();
    if (clientX === undefined || clientY === undefined) {
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }
    
    const focalX = clientX - rect.left;
    const focalY = clientY - rect.top;
    
    // Find matching unscaled coordinate position
    const boardX = (viewport.scrollLeft - boardState.BOARD_MARGIN + focalX) / oldZoom;
    const boardY = (viewport.scrollTop - boardState.BOARD_MARGIN + focalY) / oldZoom;
    
    // Smoothly shift scrollbars
    viewport.scrollLeft = boardState.BOARD_MARGIN + (boardX * zoom - focalX);
    viewport.scrollTop = boardState.BOARD_MARGIN + (boardY * zoom - focalY);
    
    const indicator = document.getElementById('zoom-indicator');
    if (indicator) {
      indicator.textContent = `${Math.round(zoom * 100)}%`;
    }
    
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomIn) btnZoomIn.disabled = (zoom >= boardState.MAX_ZOOM);
    if (btnZoomOut) btnZoomOut.disabled = (zoom <= boardState.MIN_ZOOM);
  });

  // Pulse amber warning indicator if there are unsaved state differences
  boardState.subscribe('dirtyChange', (isDirty) => {
    if (!btnSave) return;
    if (isDirty) {
      btnSave.classList.add('dirty');
      btnSave.classList.remove('saved');
    } else {
      btnSave.classList.remove('dirty');
      btnSave.classList.add('saved');
    }
  });
}

// ==========================================================================
// TOAST NOTIFICATIONS UI
// ==========================================================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
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
  
  setTimeout(() => toast.classList.add('active'), 50);
  
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==========================================================================
// RE Rendering IN PLACE PATCHING & CANVAS EXPANSION
// ==========================================================================
function doRenderBoard() {
  ensureBoardSizeForAssets();
  
  const callbacks = {
    onStartInteraction,
    onEditTile,
    onLayerChange,
    onDeleteTile
  };
  
  renderBoard(board, boardState.boardData.assets, callbacks, boardState.selectedTileId);
}

function ensureBoardSizeForAssets() {
  let maxRight = 10000;
  let maxBottom = 10000;
  
  boardState.boardData.assets.forEach(asset => {
    const right = (asset.x || 0) + (asset.width || 200);
    const bottom = (asset.y || 0) + (asset.height || 200);
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  });
  
  const neededWidth = Math.max(10000, Math.ceil(maxRight / 800) * 800);
  const neededHeight = Math.max(10000, Math.ceil(maxBottom / 800) * 800);
  
  updateBoardDimensions(neededWidth, neededHeight);
}

function updateBoardDimensions(width, height) {
  if (width > boardState.boardWidth) {
    boardState.boardWidth = width;
    board.style.width = `${boardState.boardWidth}px`;
  }
  if (height > boardState.boardHeight) {
    boardState.boardHeight = height;
    board.style.height = `${boardState.boardHeight}px`;
  }
}

// ==========================================================================
// DRAG, RESIZE, PAN INTERACTION MECHANICS
// ==========================================================================
function setupCanvasControls() {
  // Bind snapping toggles in sidebar HUD
  const chkGrid = document.getElementById('chk-snap-grid');
  const chkAlign = document.getElementById('chk-snap-align');

  if (chkGrid) {
    chkGrid.checked = boardState.snapToGridActive;
    chkGrid.addEventListener('change', (e) => {
      boardState.setSnapToGrid(e.target.checked);
      showToast(boardState.snapToGridActive ? 'Snap to Grid enabled' : 'Snap to Grid disabled', 'info', 1500);
    });
  }

  if (chkAlign) {
    chkAlign.checked = boardState.snapToAlignActive;
    chkAlign.addEventListener('change', (e) => {
      boardState.setSnapToAlign(e.target.checked);
      showToast(boardState.snapToAlignActive ? 'Smart Guides enabled' : 'Smart Guides disabled', 'info', 1500);
    });
  }

  // Click background canvas starts coordinate scroll panning
  viewport.addEventListener('mousedown', (e) => {
    if (e.target === viewport || e.target === board) {
      deselectAll();
      isPanning = true;
      viewport.style.cursor = 'grabbing';
      panStartX = e.pageX - viewport.offsetLeft;
      panStartY = e.pageY - viewport.offsetTop;
      panScrollLeft = viewport.scrollLeft;
      panScrollTop = viewport.scrollTop;
    }
  });

  // Track coordinates and active tile adjustments
  const hudCoords = document.getElementById('hud-coords');
  const handleMove = (e) => {
    const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
    
    if (clientX === undefined || clientY === undefined) return;
    
    const rect = board.getBoundingClientRect();
    const x = Math.round((clientX - rect.left) / boardState.zoom);
    const y = Math.round((clientY - rect.top) / boardState.zoom);
    const logicalX = x - boardState.BOARD_MARGIN;
    const logicalY = y - boardState.BOARD_MARGIN;
    hudCoords.textContent = `X: ${logicalX}px, Y: ${logicalY}px`;
    
    if (isPanning) {
      const pageX = (e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX)) - viewport.offsetLeft;
      const pageY = (e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY)) - viewport.offsetTop;
      const walkX = (pageX - panStartX) * 1.5;
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

  // Mouse wheel trackpad zooms on coordinate point
  viewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomIntensity = 0.05;
      let newZoom = boardState.zoom + (e.deltaY < 0 ? zoomIntensity : -zoomIntensity);
      boardState.setZoom(newZoom, e.clientX, e.clientY);
    }
  }, { passive: false });

  // Lift event handlers
  window.addEventListener('mouseup', () => endInteraction());
  window.addEventListener('touchend', () => endInteraction());

  // Bind top navbar controls
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', () => boardState.undo());

  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) btnRedo.addEventListener('click', () => boardState.redo());

  const btnZoomIn = document.getElementById('btn-zoom-in');
  if (btnZoomIn) btnZoomIn.addEventListener('click', () => boardState.setZoom(boardState.zoom + 0.1));

  const btnZoomOut = document.getElementById('btn-zoom-out');
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => boardState.setZoom(boardState.zoom - 0.1));

  const btnZoomReset = document.getElementById('btn-zoom-reset');
  if (btnZoomReset) btnZoomReset.addEventListener('click', () => boardState.setZoom(1.0));

  const btnZoomFit = document.getElementById('btn-zoom-fit');
  if (btnZoomFit) btnZoomFit.addEventListener('click', () => zoomToFitBoard());

  const btnSaveChange = document.getElementById('btn-save');
  if (btnSaveChange) btnSaveChange.addEventListener('click', () => saveChanges());

  const btnLoginChange = document.getElementById('btn-login');
  if (btnLoginChange) btnLoginChange.addEventListener('click', () => handleLoginClick());

  const btnBackup = document.getElementById('btn-export-backup');
  if (btnBackup) btnBackup.addEventListener('click', () => {
    downloadBackupJSON(boardState.boardData);
    showToast('Mood board JSON exported successfully!', 'success');
  });

  // Symmetrical Sidebars Pinned Toggles and edge-hover effects
  const btnToggleStack = document.getElementById('btn-toggle-stack');
  const stackWidget = document.getElementById('stack-widget');
  if (btnToggleStack && stackWidget) {
    btnToggleStack.addEventListener('click', () => {
      isStackPinned = !isStackPinned;
      if (isStackPinned) {
        stackWidget.classList.add('active');
        btnToggleStack.classList.add('active');
      } else {
        stackWidget.classList.remove('active');
        btnToggleStack.classList.remove('active');
      }
    });
  }

  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const settingsWidget = document.getElementById('settings-widget');
  if (btnToggleSettings && settingsWidget) {
    btnToggleSettings.addEventListener('click', () => {
      isSettingsPinned = !isSettingsPinned;
      if (isSettingsPinned) {
        settingsWidget.classList.add('active');
        btnToggleSettings.classList.add('active');
      } else {
        settingsWidget.classList.remove('active');
        btnToggleSettings.classList.remove('active');
      }
    });
  }

  const btnCloseStack = document.getElementById('btn-close-stack');
  if (btnCloseStack && stackWidget && btnToggleStack) {
    btnCloseStack.addEventListener('click', () => {
      isStackPinned = false;
      stackWidget.classList.remove('active');
      btnToggleStack.classList.remove('active');
    });
  }

  const btnCloseSettings = document.getElementById('btn-close-settings');
  if (btnCloseSettings && settingsWidget && btnToggleSettings) {
    btnCloseSettings.addEventListener('click', () => {
      isSettingsPinned = false;
      settingsWidget.classList.remove('active');
      btnToggleSettings.classList.remove('active');
    });
  }

  // Dual Edge Hover & Widget mouseleave behavior
  window.addEventListener('mousemove', (e) => {
    // Only handle hover popout if mouse is not dragging, resizing, or panning
    if (isDragging || isResizing || isPanning) return;

    const x = e.clientX;
    if (x < 30) {
      if (stackWidget) stackWidget.classList.add('active');
    }
    if (x > window.innerWidth - 30) {
      if (settingsWidget) settingsWidget.classList.add('active');
    }
  });

  if (stackWidget) {
    stackWidget.addEventListener('mouseleave', () => {
      if (!isStackPinned) {
        stackWidget.classList.remove('active');
      }
    });
  }

  if (settingsWidget) {
    settingsWidget.addEventListener('mouseleave', () => {
      if (!isSettingsPinned) {
        settingsWidget.classList.remove('active');
      }
    });
  }
}

function onStartInteraction(e, assetId, tileElement) {
  deselectAll();
  
  boardState.setSelectedTileId(assetId);
  activeTile = tileElement;
  tileElement.classList.add('selected');
  
  boardState.captureDragStart();
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  startX = clientX;
  startY = clientY;
  
  startLeft = parseInt(tileElement.style.left) || 0;
  startTop = parseInt(tileElement.style.top) || 0;
  startWidth = tileElement.offsetWidth;
  startHeight = tileElement.offsetHeight;
  
  startScrollLeft = viewport.scrollLeft;
  startScrollTop = viewport.scrollTop;
  currentPointerClientX = clientX;
  currentPointerClientY = clientY;
  
  e.stopPropagation();
  
  if (e.target.classList.contains('resize-handle')) {
    isResizing = true;
    e.preventDefault();
  } else {
    isDragging = true;
  }
}

function updateActiveTilePosition() {
  if (!activeTile) return;
  
  const clientX = currentPointerClientX;
  const clientY = currentPointerClientY;
  
  const scrollDx = (viewport.scrollLeft - startScrollLeft) / boardState.zoom;
  const scrollDy = (viewport.scrollTop - startScrollTop) / boardState.zoom;
  
  if (isDragging) {
    const dx = (clientX - startX) / boardState.zoom + scrollDx;
    const dy = (clientY - startY) / boardState.zoom + scrollDy;
    
    clearSmartGuides();
    
    let candidateLeft = startLeft + dx;
    let candidateTop = startTop + dy;
    
    let snappedXApplied = false;
    let snappedYApplied = false;
    
    if (boardState.snapToAlignActive) {
      const snapped = calculateAlignmentSnapping(
        candidateLeft, 
        candidateTop, 
        activeTile.offsetWidth, 
        activeTile.offsetHeight,
        boardState.selectedTileId,
        boardState.boardData.assets
      );
      candidateLeft = snapped.x;
      candidateTop = snapped.y;
      snappedXApplied = snapped.snappedX;
      snappedYApplied = snapped.snappedY;
      
      if (snapped.snappedX && snapped.bestXLine !== null) {
        drawSmartGuide('v', snapped.bestXLine);
      }
      if (snapped.snappedY && snapped.bestYLine !== null) {
        drawSmartGuide('h', snapped.bestYLine);
      }
    }
    
    if (boardState.snapToGridActive) {
      if (!snappedXApplied) {
        candidateLeft = Math.round(candidateLeft / 20) * 20;
      }
      if (!snappedYApplied) {
        candidateTop = Math.round(candidateTop / 20) * 20;
      }
    }
    
    let newLeft = Math.max(-boardState.BOARD_MARGIN, candidateLeft);
    let newTop = Math.max(-boardState.BOARD_MARGIN, candidateTop);
    
    const neededWidth = newLeft + activeTile.offsetWidth + 200;
    const neededHeight = newTop + activeTile.offsetHeight + 200;
    updateBoardDimensions(neededWidth, neededHeight);
    
    activeTile.style.left = `${newLeft}px`;
    activeTile.style.top = `${newTop}px`;
    
  } else if (isResizing) {
    const dx = (clientX - startX) / boardState.zoom + scrollDx;
    const dy = (clientY - startY) / boardState.zoom + scrollDy;
    
    clearSmartGuides();
    
    const tileLeft = parseFloat(activeTile.style.left) || 0;
    const tileTop = parseFloat(activeTile.style.top) || 0;
    
    let candidateWidth = startWidth + dx;
    let candidateHeight = startHeight + dy;
    
    let snappedXApplied = false;
    let snappedYApplied = false;
    
    if (boardState.snapToAlignActive) {
      const snapped = calculateResizingSnapping(
        tileLeft, 
        tileTop, 
        candidateWidth, 
        candidateHeight,
        boardState.selectedTileId,
        boardState.boardData.assets
      );
      candidateWidth = snapped.width;
      candidateHeight = snapped.height;
      snappedXApplied = snapped.snappedX;
      snappedYApplied = snapped.snappedY;
      
      if (snapped.snappedX && snapped.bestXLine !== null) {
        drawSmartGuide('v', snapped.bestXLine);
      }
      if (snapped.snappedY && snapped.bestYLine !== null) {
        drawSmartGuide('h', snapped.bestYLine);
      }
    }
    
    if (boardState.snapToGridActive) {
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
    
    let newWidth = Math.max(160, candidateWidth);
    let newHeight = Math.max(160, candidateHeight);
    
    activeTile.style.width = `${newWidth}px`;
    activeTile.style.height = `${newHeight}px`;
    
    const neededWidth = tileLeft + newWidth + 200;
    const neededHeight = tileTop + newHeight + 200;
    updateBoardDimensions(neededWidth, neededHeight);
  }
}

function endInteraction() {
  clearSmartGuides();
  stopEdgeScrollLoop();
  
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = 'grab';
  }
  
  if ((isDragging || isResizing) && activeTile && boardState.selectedTileId) {
    const finalLeft = parseInt(activeTile.style.left);
    const finalTop = parseInt(activeTile.style.top);
    const finalWidth = activeTile.offsetWidth;
    const finalHeight = activeTile.offsetHeight;
    
    const index = boardState.boardData.assets.findIndex(a => a.id === boardState.selectedTileId);
    if (index !== -1) {
      const asset = boardState.boardData.assets[index];
      if (asset.x !== finalLeft || asset.y !== finalTop || asset.width !== finalWidth || asset.height !== finalHeight) {
        // Log mutation in historical stacks
        boardState.commitDragHistory();
        
        asset.x = finalLeft;
        asset.y = finalTop;
        asset.width = finalWidth;
        asset.height = finalHeight;
        
        boardState.setBoardData(boardState.boardData);
      }
    }
  }
  
  isDragging = false;
  isResizing = false;
  activeTile = null;
}

function deselectAll() {
  boardState.setSelectedTileId(null);
}

// ==========================================================================
// TILE EDIT & LAYER ADJUSTMENTS
// ==========================================================================
function onLayerChange(id, action) {
  const index = boardState.boardData.assets.findIndex(a => a.id === id);
  if (index === -1) return;
  
  boardState.pushUndoState();
  
  // Normalize integers starting at 1
  const sorted = [...boardState.boardData.assets].sort((a, b) => (a.z || 1) - (b.z || 1));
  sorted.forEach((asset, idx) => {
    asset.z = idx + 1;
  });
  
  const currentSortedIdx = sorted.findIndex(a => a.id === id);
  
  if (action === 'front') {
    boardState.boardData.assets[index].z = sorted.length + 1;
  } else if (action === 'back') {
    boardState.boardData.assets[index].z = 0;
  } else if (action === 'forward') {
    if (currentSortedIdx < sorted.length - 1) {
      const nextAsset = sorted[currentSortedIdx + 1];
      const tempZ = boardState.boardData.assets[index].z || 1;
      const nextAssetIndexInOriginal = boardState.boardData.assets.findIndex(a => a.id === nextAsset.id);
      
      boardState.boardData.assets[index].z = nextAsset.z;
      if (nextAssetIndexInOriginal !== -1) {
        boardState.boardData.assets[nextAssetIndexInOriginal].z = tempZ;
      }
    }
  } else if (action === 'backward') {
    if (currentSortedIdx > 0) {
      const prevAsset = sorted[currentSortedIdx - 1];
      const tempZ = boardState.boardData.assets[index].z || 1;
      const prevAssetIndexInOriginal = boardState.boardData.assets.findIndex(a => a.id === prevAsset.id);
      
      boardState.boardData.assets[index].z = prevAsset.z;
      if (prevAssetIndexInOriginal !== -1) {
        boardState.boardData.assets[prevAssetIndexInOriginal].z = tempZ;
      }
    }
  }
  
  // Final z normalization compression
  const finalSorted = [...boardState.boardData.assets].sort((a, b) => (a.z || 1) - (b.z || 1));
  finalSorted.forEach((asset, idx) => {
    asset.z = idx + 1;
  });
  
  boardState.setBoardData(boardState.boardData);
  boardState.setSelectedTileId(id);
}

function onDeleteTile(id) {
  const confirmDelete = confirm('Are you sure you want to delete this asset from the mood board?');
  if (!confirmDelete) return;
  
  boardState.pushUndoState();
  
  boardState.boardData.assets = boardState.boardData.assets.filter(a => a.id !== id);
  boardState.setSelectedTileId(null);
  boardState.setBoardData(boardState.boardData);
  showToast('Asset removed from canvas.', 'info');
}

// ==========================================================================
// EDGE SCROLL AUTOMATIONS DURING CARD RESIZE/DRAG
// ==========================================================================
function startEdgeScrollLoop() {
  if (edgeScrollAnimationId) return;
  
  function scrollStep() {
    if (!isDragging && !isResizing) {
      stopEdgeScrollLoop();
      return;
    }
    
    let scrolled = false;
    
    if (edgeScrollDirectionX === 1) {
      viewport.scrollLeft += EDGE_SCROLL_SPEED;
      scrolled = true;
    } else if (edgeScrollDirectionX === -1 && viewport.scrollLeft > 0) {
      viewport.scrollLeft -= EDGE_SCROLL_SPEED;
      scrolled = true;
    }
    
    if (edgeScrollDirectionY === 1) {
      viewport.scrollTop += EDGE_SCROLL_SPEED;
      scrolled = true;
    } else if (edgeScrollDirectionY === -1 && viewport.scrollTop > 0) {
      viewport.scrollTop -= EDGE_SCROLL_SPEED;
      scrolled = true;
    }
    
    if (scrolled) {
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
  
  edgeScrollDirectionX = 0;
  edgeScrollDirectionY = 0;
  
  if (clientX > rect.right - EDGE_SCROLL_THRESHOLD) {
    edgeScrollDirectionX = 1;
  } else if (clientX < rect.left + EDGE_SCROLL_THRESHOLD) {
    if (viewport.scrollLeft > 0) {
      edgeScrollDirectionX = -1;
    }
  }
  
  if (clientY > rect.bottom - EDGE_SCROLL_THRESHOLD) {
    edgeScrollDirectionY = 1;
  } else if (clientY < rect.top + EDGE_SCROLL_THRESHOLD) {
    if (viewport.scrollTop > 0) {
      edgeScrollDirectionY = -1;
    }
  }
  
  if (edgeScrollDirectionX !== 0 || edgeScrollDirectionY !== 0) {
    startEdgeScrollLoop();
  } else {
    stopEdgeScrollLoop();
  }
}

// ==========================================================================
// SMART ALIGNMENT LINES RENDERERS
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

// ==========================================================================
// ADD ASSET MODAL CONTROLLERS
// ==========================================================================
function setupModalControls() {
  btnAddElement.addEventListener('click', () => openModal(modalAdd));
  
  const tabs = document.querySelectorAll('.type-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTabType = tab.dataset.type;
      
      document.querySelectorAll('.form-section').forEach(sec => sec.style.display = 'none');
      document.getElementById(`sec-${currentTabType}`).style.display = 'block';
    });
  });
  
  const imageFileInput = document.getElementById('image-file');
  const uploadZone = document.getElementById('upload-zone');
  
  if (uploadZone) {
    uploadZone.addEventListener('click', () => imageFileInput.click());
  }

  if (imageFileInput) {
    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
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
  }
  
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });

  const btnElementSubmit = document.getElementById('btn-element-submit');
  if (btnElementSubmit) {
    btnElementSubmit.addEventListener('click', () => submitNewElement());
  }

  const btnAuthSave = document.getElementById('btn-auth-save');
  if (btnAuthSave) {
    btnAuthSave.addEventListener('click', () => verifyAndSaveToken());
  }

  const userPillHeader = document.getElementById('user-pill');
  if (userPillHeader) {
    userPillHeader.addEventListener('click', () => logout());
  }
}

function openModal(modal) {
  modal.classList.add('active');
}

function closeAllModals() {
  modalAdd.classList.remove('active');
  modalAuth.classList.remove('active');
  
  if (boardState.editingAssetId) {
    boardState.setEditingAssetId(null);
    const modalHeader = document.querySelector('#modal-add .modal-header h2');
    const modalSubmitBtn = document.querySelector('#modal-add .modal-footer .btn-primary');
    if (modalHeader) modalHeader.textContent = 'Add Design Element';
    if (modalSubmitBtn) modalSubmitBtn.textContent = 'Place on Board';
    
    document.getElementById('element-title').value = '';
    document.getElementById('color-desc').value = '';
    document.getElementById('image-url').value = '';
    document.getElementById('image-desc').value = '';
    document.getElementById('text-body').value = '';
    const spanNode = document.getElementById('upload-zone').querySelector('span');
    if (spanNode) spanNode.textContent = 'Drag and drop or Click to upload (under 2MB)';
  }
}

function submitNewElement() {
  const titleInput = document.getElementById('element-title');
  
  if (boardState.editingAssetId) {
    const index = boardState.boardData.assets.findIndex(a => a.id === boardState.editingAssetId);
    if (index === -1) return;
    
    boardState.pushUndoState();
    
    const asset = boardState.boardData.assets[index];
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
    
    boardState.setBoardData(boardState.boardData);
    closeAllModals();
    showToast('Asset updated successfully!', 'success');
    return;
  }

  const title = titleInput.value.trim() || `New ${currentTabType}`;
  const id = `${currentTabType}-${Date.now()}`;
  
  const viewportRect = viewport.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const scrollX = (viewportRect.left + viewportRect.width / 2 - boardRect.left) / boardState.zoom - 150;
  const scrollY = (viewportRect.top + viewportRect.height / 2 - boardRect.top) / boardState.zoom - 150;
  
  let newAsset = {
    id: id,
    type: currentTabType,
    title: title,
    x: Math.max(-boardState.BOARD_MARGIN, Math.round(scrollX)),
    y: Math.max(-boardState.BOARD_MARGIN, Math.round(scrollY)),
    z: boardState.boardData.assets.length + 1
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
  
  boardState.pushUndoState();
  boardState.boardData.assets.push(newAsset);
  boardState.setBoardData(boardState.boardData);
  
  titleInput.value = '';
  document.getElementById('color-desc').value = '';
  document.getElementById('image-url').value = '';
  document.getElementById('image-desc').value = '';
  document.getElementById('text-body').value = '';
  const uploadLabel = document.getElementById('upload-zone').querySelector('span');
  if (uploadLabel) uploadLabel.textContent = 'Drag and drop or Click to upload (under 2MB)';
  
  closeAllModals();
  showToast('New asset successfully added!', 'success');
}

function onEditTile(id) {
  const asset = boardState.boardData.assets.find(a => a.id === id);
  if (!asset) return;
  
  boardState.setEditingAssetId(id);
  
  const modalHeader = document.querySelector('#modal-add .modal-header h2');
  const modalSubmitBtn = document.querySelector('#modal-add .modal-footer .btn-primary');
  if (modalHeader) modalHeader.textContent = 'Edit Design Element';
  if (modalSubmitBtn) modalSubmitBtn.textContent = 'Update Element';
  
  document.getElementById('element-title').value = asset.title || '';
  
  const tabs = document.querySelectorAll('.type-tab');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.form-section').forEach(sec => sec.style.display = 'none');
  
  const targetTab = Array.from(tabs).find(t => t.dataset.type === asset.type);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  currentTabType = asset.type;
  document.getElementById(`sec-${asset.type}`).style.display = 'block';
  
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
// KEYBOARD CONTROL SHORTCUTS
// ==========================================================================
function setupKeyboardBindings() {
  document.addEventListener('keydown', (e) => {
    const isEditingText = document.activeElement.tagName === 'INPUT' || 
                          document.activeElement.tagName === 'TEXTAREA';
    
    if (e.key === 'Escape') {
      deselectAll();
      closeAllModals();
    }
    
    if ((e.key === 'Delete' || e.key === 'Backspace') && boardState.selectedTileId) {
      if (!isEditingText) {
        onDeleteTile(boardState.selectedTileId);
      }
    }

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (isCmdOrCtrl) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        boardState.setZoom(boardState.zoom + 0.1);
      } else if (e.key === '-') {
        e.preventDefault();
        boardState.setZoom(boardState.zoom - 0.1);
      } else if (e.key === '0') {
        e.preventDefault();
        boardState.setZoom(1.0);
      }
    }

    if (!isEditingText) {
      // Undo
      if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        boardState.undo();
        showToast('Undo action', 'info', 1000);
      }
      
      // Redo
      const isRedoKey = (e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y';
      if (isCmdOrCtrl && isRedoKey) {
        e.preventDefault();
        boardState.redo();
        showToast('Redo action', 'info', 1000);
      }
      
      // Layering Shortcuts
      if (boardState.selectedTileId && isCmdOrCtrl) {
        if (e.key === ']') {
          e.preventDefault();
          if (e.shiftKey) {
            onLayerChange(boardState.selectedTileId, 'front');
            showToast('Brought asset to absolute front', 'info', 1500);
          } else {
            onLayerChange(boardState.selectedTileId, 'forward');
            showToast('Brought asset forward one layer', 'info', 1500);
          }
        } else if (e.key === '[') {
          e.preventDefault();
          if (e.shiftKey) {
            onLayerChange(boardState.selectedTileId, 'back');
            showToast('Sent asset to absolute back', 'info', 1500);
          } else {
            onLayerChange(boardState.selectedTileId, 'backward');
            showToast('Sent asset backward one layer', 'info', 1500);
          }
        }
      }
    }
  });
}

// ==========================================================================
// GITHUB REST INTEGRATION CONTROLLER
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
    const user = await verifyGithubToken(token);
    
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

async function saveChanges() {
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
    await apiCommitBoardData(token, boardState.boardData);
    
    boardState.markAsSaved();
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
// MOOD BOARD LOADER INITIALIZER
// ==========================================================================
async function loadBoardData() {
  try {
    showToast('Loading mood board configuration...', 'info', 2000);
    const response = await fetch(`${DATA_FILE_PATH}?_cb=${Date.now()}`);
    if (!response.ok) throw new Error('Data file not found or corrupted.');
    
    const data = await response.json();
    boardState.setBoardData(data);
    boardState.markAsSaved();
    
    viewport.scrollLeft = boardState.BOARD_MARGIN;
    viewport.scrollTop = boardState.BOARD_MARGIN;
    
    showToast('Inspiration board loaded successfully!', 'success', 2500);
  } catch (error) {
    console.error('Error loading board data:', error);
    showToast('Failed to load board from gh-pages. Loading empty fallback.', 'error', 4000);
    
    const fallbackData = { assets: [] };
    boardState.setBoardData(fallbackData);
    boardState.markAsSaved();
    
    viewport.scrollLeft = boardState.BOARD_MARGIN;
    viewport.scrollTop = boardState.BOARD_MARGIN;
  }
}

// ==========================================================================
// ZOOM TO FIT & LAYERS PALETTE DYNAMIC RENDERERS
// ==========================================================================
function zoomToFitBoard() {
  if (!boardState.boardData.assets || boardState.boardData.assets.length === 0) {
    showToast('No elements on the board to zoom to.', 'info');
    return;
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  boardState.boardData.assets.forEach(asset => {
    const x = asset.x || 0;
    const y = asset.y || 0;
    const w = asset.width || 200;
    const h = asset.height || 200;
    
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  });
  
  const padding = 80;
  const boxWidth = (maxX - minX) + padding * 2;
  const boxHeight = (maxY - minY) + padding * 2;
  
  const zoomX = viewport.clientWidth / boxWidth;
  const zoomY = viewport.clientHeight / boxHeight;
  const targetZoom = Math.max(boardState.MIN_ZOOM, Math.min(boardState.MAX_ZOOM, Math.min(zoomX, zoomY)));
  
  boardState.setZoom(targetZoom);
  
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;
  
  viewport.scrollLeft = boardState.BOARD_MARGIN + (centerX * targetZoom - viewport.clientWidth / 2);
  viewport.scrollTop = boardState.BOARD_MARGIN + (centerY * targetZoom - viewport.clientHeight / 2);
  
  showToast('Viewport zoomed to fit all elements.', 'success', 2000);
}

function renderLayersStack() {
  const stackList = document.getElementById('stack-list');
  if (!stackList) return;
  
  stackList.innerHTML = '';
  const assets = boardState.boardData.assets || [];
  
  // Sort descending by z-index (highest z/front-most on top)
  const sorted = [...assets].sort((a, b) => (b.z || 0) - (a.z || 0));
  
  if (sorted.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '20px';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.textContent = 'No layers to show';
    stackList.appendChild(emptyMsg);
    return;
  }
  
  sorted.forEach((asset, idx) => {
    const item = document.createElement('div');
    item.className = 'stack-item';
    item.setAttribute('draggable', 'true');
    item.setAttribute('data-id', asset.id);
    item.title = `Title: ${asset.title || 'Untitled'}\nType: ${asset.type}\nZ-Index: ${asset.z || 0}`;
    
    if (boardState.selectedTileId === asset.id) {
      item.classList.add('selected');
    }
    
    // Left side: icon + title
    const siLeft = document.createElement('div');
    siLeft.className = 'si-left';
    
    // Icon
    const siIcon = document.createElement('span');
    siIcon.className = 'si-icon';
    siIcon.appendChild(createTypeIcon(asset.type));
    
    // Title
    const siTitle = document.createElement('span');
    siTitle.className = 'si-title';
    siTitle.textContent = asset.title || `Untitled ${asset.type}`;
    
    siLeft.appendChild(siIcon);
    siLeft.appendChild(siTitle);
    
    // Right side: action buttons
    const siActions = document.createElement('div');
    siActions.className = 'si-actions';
    
    const btnUp = document.createElement('button');
    btnUp.className = 'si-btn up';
    btnUp.title = 'Bring Forward';
    btnUp.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    btnUp.addEventListener('click', (e) => {
      e.stopPropagation();
      onLayerChange(asset.id, 'forward');
      showToast('Brought layer forward', 'info', 1000);
    });
    
    const btnDown = document.createElement('button');
    btnDown.className = 'si-btn down';
    btnDown.title = 'Send Backward';
    btnDown.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    btnDown.addEventListener('click', (e) => {
      e.stopPropagation();
      onLayerChange(asset.id, 'backward');
      showToast('Sent layer backward', 'info', 1000);
    });
    
    const btnDel = document.createElement('button');
    btnDel.className = 'si-btn delete';
    btnDel.title = 'Delete Asset';
    btnDel.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      onDeleteTile(asset.id);
    });
    
    siActions.appendChild(btnUp);
    siActions.appendChild(btnDown);
    siActions.appendChild(btnDel);
    
    item.appendChild(siLeft);
    item.appendChild(siActions);
    
    // Highlight selection on click
    item.addEventListener('click', () => {
      boardState.setSelectedTileId(asset.id);
    });
    
    // Double-click to open editing modal
    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      onEditTile(asset.id);
    });
    
    // HTML5 Drag-and-drop Listeners
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', asset.id);
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      const items = stackList.querySelectorAll('.stack-item');
      items.forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const rect = item.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const height = rect.height;
      
      if (mouseY < height / 2) {
        item.classList.add('drag-over-top');
        item.classList.remove('drag-over-bottom');
      } else {
        item.classList.add('drag-over-bottom');
        item.classList.remove('drag-over-top');
      }
    });
    
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      const targetId = asset.id;
      
      if (draggedId === targetId) return;
      
      const rect = item.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const isTop = mouseY < rect.height / 2;
      
      const currentAssets = [...boardState.boardData.assets].sort((a, b) => (b.z || 0) - (a.z || 0));
      const draggedAssetObj = currentAssets.find(a => a.id === draggedId);
      
      if (!draggedAssetObj) return;
      
      const filtered = currentAssets.filter(a => a.id !== draggedId);
      let targetIdx = filtered.findIndex(a => a.id === targetId);
      
      if (isTop) {
        filtered.splice(targetIdx, 0, draggedAssetObj);
      } else {
        filtered.splice(targetIdx + 1, 0, draggedAssetObj);
      }
      
      // Normalize z-indices descending (first element index 0 = front-most, z = length)
      filtered.forEach((a, i) => {
        a.z = filtered.length - i;
      });
      
      boardState.pushUndoState();
      boardState.boardData.assets = filtered;
      boardState.setBoardData(boardState.boardData);
      
      showToast('Layers reordered', 'success', 1000);
    });
    
    stackList.appendChild(item);
  });
  
  // Bring selected item into view inside the stack palette
  const selectedItem = stackList.querySelector('.stack-item.selected');
  if (selectedItem) {
    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
