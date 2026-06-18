/**
 * Curator Studio — Programmatic DOM Builder & Rendering Engine
 * Implements high-performance in-place DOM patching, safe markdown parsing,
 * and CSP-compliant, XSS-free DOM constructions.
 */

/**
 * Creates an SVG icon programmatically from constant path markup.
 * @param {string} innerHtml - The static SVG elements/paths.
 * @param {string} viewBox - SVG coordinate box.
 * @returns {SVGSVGElement}
 */
export function createSVGIcon(innerHtml, viewBox = '0 0 24 24') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', viewBox);
  svg.innerHTML = innerHtml; // Safe because it only loads predefined static vectors
  return svg;
}

/**
 * Generates the beautiful SVG Seven-pointed star motif programmatically.
 * @returns {SVGSVGElement}
 */
export function createSevenPointedStarSVG() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tile-motif-svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('fill', 'none');
  
  const cx = 50;
  const cy = 50;
  const R = 45; // Outer radius
  const r = 18; // Inner radius (peak-to-valley balance)
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
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('stroke', 'rgba(255,255,255,0.2)');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r', '12');
  circle.setAttribute('fill', '#0f1115');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);
  
  return svg;
}

/**
 * Creates the appropriate type icon SVG based on the asset type.
 * @param {string} type - Asset type.
 * @returns {SVGSVGElement}
 */
export function createTypeIcon(type) {
  switch (type) {
    case 'color':
      return createSVGIcon('<path d="M12 22C17.52 22 22 17.52 22 12S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"></path><circle cx="7.5" cy="10.5" r="1.5"></circle><circle cx="11.5" cy="7.5" r="1.5"></circle><circle cx="16.5" cy="9.5" r="1.5"></circle><circle cx="15.5" cy="14.5" r="1.5"></circle>');
    case 'image':
      return createSVGIcon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>');
    case 'text':
      return createSVGIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>');
    case 'motif':
      return createSVGIcon('<path d="M12 2c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z"></path>');
    default:
      return createSVGIcon('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>');
  }
}

/**
 * Safely parses basic markdown features into a safe DOM DocumentFragment.
 * @param {string} text - The input markdown text.
 * @returns {DocumentFragment} Safe DOM fragment representing the parsed content.
 */
export function parseMarkdownToDOM(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;
  
  const lines = text.split('\n');
  let currentList = null;
  
  // Helper to handle inline bold and links on a container element
  function processInlineStyles(element, rawText) {
    const regex = /(\*\*.*?\*\*|\[.*?\]\(.*?\))/g;
    const parts = rawText.split(regex);
    
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const bold = document.createElement('strong');
        bold.textContent = part.slice(2, -2);
        element.appendChild(bold);
      } else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const closeBracketIdx = part.indexOf(']');
        const linkText = part.slice(1, closeBracketIdx);
        const linkUrl = part.slice(closeBracketIdx + 2, -1);
        
        const link = document.createElement('a');
        link.href = linkUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = linkText;
        element.appendChild(link);
      } else if (part) {
        element.appendChild(document.createTextNode(part));
      }
    }
  }
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    
    if (trimmed.startsWith('# ')) {
      currentList = null;
      const h1 = document.createElement('h1');
      processInlineStyles(h1, trimmed.slice(2));
      fragment.appendChild(h1);
    } else if (trimmed.startsWith('## ')) {
      currentList = null;
      const h2 = document.createElement('h2');
      processInlineStyles(h2, trimmed.slice(3));
      fragment.appendChild(h2);
    } else if (trimmed.startsWith('### ')) {
      currentList = null;
      const h3 = document.createElement('h3');
      processInlineStyles(h3, trimmed.slice(4));
      fragment.appendChild(h3);
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      if (!currentList) {
        currentList = document.createElement('ul');
        fragment.appendChild(currentList);
      }
      const li = document.createElement('li');
      processInlineStyles(li, trimmed.slice(2));
      currentList.appendChild(li);
    } else {
      currentList = null;
      const p = document.createElement('p');
      processInlineStyles(p, trimmed);
      fragment.appendChild(p);
    }
  }
  
  return fragment;
}

/**
 * Programmatically builds the safe, interactive inner body content of a card.
 * @param {HTMLElement} bodyElement - Target container.
 * @param {Object} asset - The asset data.
 */
export function populateTileBody(bodyElement, asset) {
  bodyElement.innerHTML = ''; // safe clear
  
  switch (asset.type) {
    case 'color': {
      const preview = document.createElement('div');
      preview.className = 'tile-color-preview';
      preview.style.backgroundColor = asset.value;
      bodyElement.appendChild(preview);
      
      const value = document.createElement('div');
      value.className = 'tile-color-value';
      value.textContent = asset.value;
      bodyElement.appendChild(value);
      
      const desc = document.createElement('div');
      desc.className = 'tile-color-desc';
      desc.textContent = asset.description || '';
      bodyElement.appendChild(desc);
      break;
    }
    case 'image': {
      const container = document.createElement('div');
      container.className = 'tile-image-container';
      
      const img = document.createElement('img');
      img.src = asset.url;
      img.alt = asset.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.src = 'https://placehold.co/400?text=Image+Load+Error';
      });
      container.appendChild(img);
      
      const overlay = document.createElement('div');
      overlay.className = 'tile-image-overlay';
      
      const overlayTitle = document.createElement('div');
      overlayTitle.className = 'tile-image-title';
      overlayTitle.textContent = asset.title;
      overlay.appendChild(overlayTitle);
      
      const overlayDesc = document.createElement('div');
      overlayDesc.className = 'tile-image-desc';
      overlayDesc.textContent = asset.description || '';
      overlay.appendChild(overlayDesc);
      
      container.appendChild(overlay);
      bodyElement.appendChild(container);
      break;
    }
    case 'text': {
      const content = document.createElement('div');
      content.className = 'tile-text-content';
      content.appendChild(parseMarkdownToDOM(asset.content));
      bodyElement.appendChild(content);
      break;
    }
    case 'motif': {
      const container = document.createElement('div');
      container.className = 'tile-motif-container';
      
      if (asset.motifType === 'star') {
        container.appendChild(createSevenPointedStarSVG());
      }
      
      const desc = document.createElement('div');
      desc.className = 'tile-motif-desc';
      desc.textContent = asset.description || '';
      container.appendChild(desc);
      
      bodyElement.appendChild(container);
      break;
    }
  }
}

/**
 * Programmatically builds a single card DOM element and registers callbacks.
 * @param {Object} asset - The asset definition.
 * @param {Object} callbacks - Interaction functions.
 * @returns {HTMLDivElement} Programmatic interactive card element.
 */
export function createTileDOM(asset, callbacks) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = `tile-${asset.id}`;
  tile.style.left = `${asset.x}px`;
  tile.style.top = `${asset.y}px`;
  tile.style.width = `${asset.width}px`;
  tile.style.height = `${asset.height}px`;
  tile.style.zIndex = asset.z || 1;
  
  if (asset.type === 'text') {
    if (asset.background) {
      tile.style.backgroundColor = asset.background;
    }
    if (asset.color) {
      tile.style.color = asset.color;
    }
  }
  
  // Header
  const header = document.createElement('div');
  header.className = 'tile-header';
  
  const title = document.createElement('div');
  title.className = 'tile-title';
  title.textContent = asset.title;
  header.appendChild(title);
  
  const headerActions = document.createElement('div');
  headerActions.className = 'tile-header-actions';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'tile-edit-btn';
  editBtn.title = 'Edit Card Content';
  editBtn.appendChild(createSVGIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>'));
  const editLabel = document.createTextNode(' Edit');
  editBtn.appendChild(editLabel);
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onEditTile(asset.id);
  });
  headerActions.appendChild(editBtn);
  
  const typeIcon = document.createElement('div');
  typeIcon.className = 'tile-type-icon';
  typeIcon.appendChild(createTypeIcon(asset.type));
  headerActions.appendChild(typeIcon);
  
  header.appendChild(headerActions);
  tile.appendChild(header);
  
  // Body
  const body = document.createElement('div');
  body.className = 'tile-body';
  populateTileBody(body, asset);
  body.dataset.fingerprint = JSON.stringify({
    type: asset.type,
    value: asset.value,
    content: asset.content,
    url: asset.url,
    motifType: asset.motifType,
    description: asset.description,
    background: asset.background,
    color: asset.color
  });
  tile.appendChild(body);
  
  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  tile.appendChild(resizeHandle);
  
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'tile-toolbar';
  
  const btnFront = document.createElement('button');
  btnFront.className = 'tb-btn';
  btnFront.title = 'Bring to Front (To Top)';
  btnFront.appendChild(createSVGIcon('<line x1="5" y1="4" x2="19" y2="4"></line><polyline points="17 14 12 9 7 14"></polyline><line x1="12" y1="9" x2="12" y2="20"></line>'));
  btnFront.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onLayerChange(asset.id, 'front');
  });
  toolbar.appendChild(btnFront);
  
  const btnForward = document.createElement('button');
  btnForward.className = 'tb-btn';
  btnForward.title = 'Bring Forward (Up 1 Layer)';
  btnForward.appendChild(createSVGIcon('<polyline points="18 15 12 9 6 15"></polyline>'));
  btnForward.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onLayerChange(asset.id, 'forward');
  });
  toolbar.appendChild(btnForward);
  
  const btnBackward = document.createElement('button');
  btnBackward.className = 'tb-btn';
  btnBackward.title = 'Send Backward (Down 1 Layer)';
  btnBackward.appendChild(createSVGIcon('<polyline points="6 9 12 15 18 9"></polyline>'));
  btnBackward.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onLayerChange(asset.id, 'backward');
  });
  toolbar.appendChild(btnBackward);
  
  const btnBack = document.createElement('button');
  btnBack.className = 'tb-btn';
  btnBack.title = 'Send to Back (To Bottom)';
  btnBack.appendChild(createSVGIcon('<line x1="5" y1="20" x2="19" y2="20"></line><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="4"></line>'));
  btnBack.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onLayerChange(asset.id, 'back');
  });
  toolbar.appendChild(btnBack);
  
  const divider = document.createElement('div');
  divider.className = 'tb-divider';
  toolbar.appendChild(divider);
  
  const btnToolbarEdit = document.createElement('button');
  btnToolbarEdit.className = 'tb-btn';
  btnToolbarEdit.title = 'Edit Card Content';
  btnToolbarEdit.appendChild(createSVGIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>'));
  btnToolbarEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onEditTile(asset.id);
  });
  toolbar.appendChild(btnToolbarEdit);
  
  const btnDelete = document.createElement('button');
  btnDelete.className = 'tb-btn delete';
  btnDelete.title = 'Delete Asset';
  btnDelete.appendChild(createSVGIcon('<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>'));
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onDeleteTile(asset.id);
  });
  toolbar.appendChild(btnDelete);
  
  tile.appendChild(toolbar);
  
  // Event Bindings
  tile.addEventListener('mousedown', (e) => callbacks.onStartInteraction(e, asset.id, tile));
  tile.addEventListener('touchstart', (e) => callbacks.onStartInteraction(e, asset.id, tile), { passive: false });
  tile.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    callbacks.onEditTile(asset.id);
  });
  
  return tile;
}

/**
 * Renders the mood board with modular incremental in-place patching.
 * @param {HTMLElement} boardElement - Viewport draftboard root div.
 * @param {Array} assets - Current state asset data array.
 * @param {Object} callbacks - Interactive triggers.
 * @param {string|null} selectedTileId - Active card selection indicator.
 */
export function renderBoard(boardElement, assets, callbacks, selectedTileId) {
  // 1. Map active asset element IDs
  const activeIds = new Set(assets.map(a => `tile-${a.id}`));
  
  // 2. Remove stale nodes no longer present in state
  const existingTiles = boardElement.querySelectorAll('.tile');
  existingTiles.forEach(tile => {
    if (!activeIds.has(tile.id)) {
      tile.remove();
    }
  });
  
  // 3. Patch or append tiles incrementally
  assets.forEach(asset => {
    const tileId = `tile-${asset.id}`;
    let tile = boardElement.querySelector(`#${tileId}`);
    
    if (!tile) {
      tile = createTileDOM(asset, callbacks);
      boardElement.appendChild(tile);
    } else {
      // Patch coordinates & properties in-place
      const nextLeft = `${asset.x}px`;
      const nextTop = `${asset.y}px`;
      const nextWidth = `${asset.width}px`;
      const nextHeight = `${asset.height}px`;
      const nextZ = asset.z || 1;
      
      if (tile.style.left !== nextLeft) tile.style.left = nextLeft;
      if (tile.style.top !== nextTop) tile.style.top = nextTop;
      if (tile.style.width !== nextWidth) tile.style.width = nextWidth;
      if (tile.style.height !== nextHeight) tile.style.height = nextHeight;
      if (tile.style.zIndex != nextZ) tile.style.zIndex = nextZ;
      
      // Update text card backgrounds / colors
      if (asset.type === 'text') {
        const nextBg = asset.background || '';
        const nextColor = asset.color || '';
        if (tile.style.backgroundColor !== nextBg) tile.style.backgroundColor = nextBg;
        if (tile.style.color !== nextColor) tile.style.color = nextColor;
      } else {
        tile.style.backgroundColor = '';
        tile.style.color = '';
      }
      
      // Update Title Text safely
      const titleDiv = tile.querySelector('.tile-title');
      if (titleDiv && titleDiv.textContent !== asset.title) {
        titleDiv.textContent = asset.title;
      }
      
      // Verify body footprint to prevent unnecessary redraws
      const bodyDiv = tile.querySelector('.tile-body');
      if (bodyDiv) {
        const contentFingerprint = JSON.stringify({
          type: asset.type,
          value: asset.value,
          content: asset.content,
          url: asset.url,
          motifType: asset.motifType,
          description: asset.description,
          background: asset.background,
          color: asset.color
        });
        if (bodyDiv.dataset.fingerprint !== contentFingerprint) {
          populateTileBody(bodyDiv, asset);
          bodyDiv.dataset.fingerprint = contentFingerprint;
        }
      }
    }
    
    // Manage Selection outlines
    if (asset.id === selectedTileId) {
      tile.classList.add('selected');
    } else {
      tile.classList.remove('selected');
    }
  });
}
