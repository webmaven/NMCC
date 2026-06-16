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

// Dragging & Resizing Math
let startX, startY;
let startLeft, startTop;
let startWidth, startHeight;
let activeTile = null;

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

    // Undo / Redo Shortcuts (Bypass when editing text inputs to preserve native field history)
    if (!isEditingText) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
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
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
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
    // Fetch data from local server / github pages
    const response = await fetch(DATA_FILE_PATH);
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

function renderBoard() {
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
  return `
    <svg class="tile-motif-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 5 L59 36 L90 24 L72 50 L90 76 L59 64 L50 95 L41 64 L10 76 L28 50 L10 24 L41 36 Z" 
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
  
  // Inner structure template
  tile.innerHTML = `
    <div class="tile-header">
      <div class="tile-title">${asset.title}</div>
      <div class="tile-type-icon">${getTypeIcon(asset.type)}</div>
    </div>
    <div class="tile-body">
      ${getTileBodyContent(asset)}
    </div>
    <div class="resize-handle"></div>
    <div class="tile-toolbar">
      <button class="tb-btn" title="Bring to Front" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'front')">▲</button>
      <button class="tb-btn" title="Send to Back" onclick="event.stopPropagation(); changeLayer('${asset.id}', 'back')">▼</button>
      <div class="tb-divider"></div>
      <button class="tb-btn delete" title="Delete Asset" onclick="event.stopPropagation(); deleteTile('${asset.id}')">🗑️</button>
    </div>
  `;
  
  // Event Listeners for Interaction
  tile.addEventListener('mousedown', (e) => startInteraction(e, asset.id, tile));
  tile.addEventListener('touchstart', (e) => startInteraction(e, asset.id, tile), { passive: false });
  
  board.appendChild(tile);
  return tile;
}

function getTypeIcon(type) {
  switch (type) {
    case 'color': return '🎨';
    case 'image': return '🖼️';
    case 'text': return '📝';
    case 'motif': return '✨';
    default: return '📎';
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
  viewport.addEventListener('mousemove', (e) => {
    const rect = board.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    if (x >= 0 && x <= 3200 && y >= 0 && y <= 2400) {
      hudCoords.textContent = `X: ${x}px, Y: ${y}px`;
    }
    
    // Perform actions depending on active state
    if (isPanning) {
      const pageX = e.pageX - viewport.offsetLeft;
      const pageY = e.pageY - viewport.offsetTop;
      const walkX = (pageX - panStartX) * 1.5; // Scroll speed modifier
      const walkY = (pageY - panStartY) * 1.5;
      viewport.scrollLeft = panScrollLeft - walkX;
      viewport.scrollTop = panScrollTop - walkY;
    } else if (isDragging && activeTile) {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      const dx = clientX - startX;
      const dy = clientY - startY;
      
      // Calculate and clamp coordinates to keep them inside the large board
      let newLeft = Math.max(0, Math.min(3200 - activeTile.offsetWidth, startLeft + dx));
      let newTop = Math.max(0, Math.min(2400 - activeTile.offsetHeight, startTop + dy));
      
      activeTile.style.left = `${newLeft}px`;
      activeTile.style.top = `${newTop}px`;
    } else if (isResizing && activeTile) {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      const dx = clientX - startX;
      const dy = clientY - startY;
      
      // Keep min dimension 150px
      let newWidth = Math.max(160, startWidth + dx);
      let newHeight = Math.max(160, startHeight + dy);
      
      activeTile.style.width = `${newWidth}px`;
      activeTile.style.height = `${newHeight}px`;
    }
  });

  // End interaction
  window.addEventListener('mouseup', () => endInteraction());
  window.addEventListener('touchend', () => endInteraction());
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
  
  const currentZ = boardData.assets[index].z || 1;
  const zs = boardData.assets.map(a => a.z || 0);
  const minZ = Math.min(...zs, 1);
  const maxZ = Math.max(...zs, 1);
  
  if (action === 'front') {
    boardData.assets[index].z = maxZ + 1;
  } else if (action === 'back') {
    boardData.assets[index].z = Math.max(1, minZ - 1);
  }
  
  checkDirtyState();
  // Sort elements in DOM or re-render to reflect new ordering
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
}

function submitNewElement() {
  const titleInput = document.getElementById('element-title');
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
    showToast('Failed to authenticate token. Please check validity and permissions.', 'error');
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
    const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE_PATH}?ref=${BRANCH_NAME}`;
    
    // 1. Get the current file details to retrieve the latest commit SHA (prevents conflicts)
    const getResponse = await fetch(getUrl, {
      headers: { 'Authorization': `token ${token}` }
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
    showToast(`Failed to save: ${error.message}`, 'error', 6000);
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

