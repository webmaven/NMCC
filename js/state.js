/**
 * Curator Studio — State Management Module
 * Implements centralized state tracking, undo/redo history stacks,
 * dirty checks, and settings persistence.
 */

class BoardState {
  constructor() {
    this.boardData = { assets: [] };
    this.undoStack = [];
    this.redoStack = [];
    this.lastSavedState = '';
    this.dragStartSnapshot = null;
    
    this.selectedTileId = null;
    this.editingAssetId = null;
    this.zoom = 1.0;
    this.isDirty = false;
    
    // Canvas dimensions
    this.boardWidth = 10000;
    this.boardHeight = 10000;
    this.BOARD_MARGIN = 3000;
    
    // Zoom limits
    this.MIN_ZOOM = 0.2;
    this.MAX_ZOOM = 3.0;

    // Load initial snapping settings from localStorage
    this.snapToGridActive = localStorage.getItem('snapToGridActive') !== 'false'; // default true
    this.snapToAlignActive = localStorage.getItem('snapToAlignActive') !== 'false'; // default true
    
    // Subscriber callbacks
    this.listeners = new Map();
  }

  // Event Subscription Hub
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  // State Mutators
  setBoardData(data) {
    this.boardData = data;
    this.checkDirtyState();
    this.emit('boardDataChange', this.boardData);
  }

  setZoom(level, clientX, clientY) {
    const oldZoom = this.zoom;
    const targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, level));
    
    if (targetZoom === oldZoom) return false;
    
    this.zoom = targetZoom;
    this.emit('zoomChange', { zoom: this.zoom, oldZoom, clientX, clientY });
    return true;
  }

  setSelectedTileId(id) {
    if (this.selectedTileId === id) return;
    const oldId = this.selectedTileId;
    this.selectedTileId = id;
    this.emit('selectionChange', { selectedId: id, oldId });
  }

  setEditingAssetId(id) {
    this.editingAssetId = id;
  }

  setSnapToGrid(active) {
    this.snapToGridActive = active;
    localStorage.setItem('snapToGridActive', active);
    this.emit('settingsChange', { snapToGridActive: active });
  }

  setSnapToAlign(active) {
    this.snapToAlignActive = active;
    localStorage.setItem('snapToAlignActive', active);
    this.emit('settingsChange', { snapToAlignActive: active });
  }

  // History Stack Logging
  captureDragStart() {
    this.dragStartSnapshot = JSON.stringify(this.boardData);
  }

  commitDragHistory() {
    if (this.dragStartSnapshot) {
      const current = JSON.stringify(this.boardData);
      if (this.dragStartSnapshot !== current) {
        this.undoStack.push(this.dragStartSnapshot);
        this.redoStack = []; // flush redo stack
        this.emit('historyChange', { undoLength: this.undoStack.length, redoLength: this.redoStack.length });
        this.checkDirtyState();
      }
      this.dragStartSnapshot = null;
    }
  }

  pushUndoState() {
    const snapshot = JSON.stringify(this.boardData);
    this.undoStack.push(snapshot);
    this.redoStack = []; // flush redo stack
    this.checkDirtyState();
    this.emit('historyChange', { undoLength: this.undoStack.length, redoLength: this.redoStack.length });
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    
    const currentSnapshot = JSON.stringify(this.boardData);
    this.redoStack.push(currentSnapshot);
    
    const previousSnapshot = this.undoStack.pop();
    this.boardData = JSON.parse(previousSnapshot);
    
    this.checkDirtyState();
    this.emit('boardDataChange', this.boardData);
    this.emit('historyChange', { undoLength: this.undoStack.length, redoLength: this.redoStack.length });
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    
    const currentSnapshot = JSON.stringify(this.boardData);
    this.undoStack.push(currentSnapshot);
    
    const nextSnapshot = this.redoStack.pop();
    this.boardData = JSON.parse(nextSnapshot);
    
    this.checkDirtyState();
    this.emit('boardDataChange', this.boardData);
    this.emit('historyChange', { undoLength: this.undoStack.length, redoLength: this.redoStack.length });
    return true;
  }

  checkDirtyState() {
    const currentStateStr = JSON.stringify(this.boardData);
    const wasDirty = this.isDirty;
    this.isDirty = currentStateStr !== this.lastSavedState;
    if (this.isDirty !== wasDirty) {
      this.emit('dirtyChange', this.isDirty);
    }
  }

  markAsSaved() {
    this.lastSavedState = JSON.stringify(this.boardData);
    this.isDirty = false;
    this.emit('dirtyChange', false);
  }
}

// Export a single shared state instance (Singleton Pattern)
export const boardState = new BoardState();
