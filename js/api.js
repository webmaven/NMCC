/**
 * Curator Studio — GitHub REST API & Local Backup persistence module.
 * Manages secure commits to gh-pages and client-side JSON downloads.
 */

export const REPO_OWNER = 'webmaven';
export const REPO_NAME = 'NMCC';
export const DATA_FILE_PATH = 'moodboard-data.json';
export const BRANCH_NAME = 'gh-pages';

/**
 * Validates a GitHub Personal Access Token by hitting the users API.
 * @param {string} token - Fine-grained PAT.
 * @returns {Promise<Object>} The authenticated user object.
 */
export async function verifyGithubToken(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `token ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Unauthorized or invalid token.');
  }
  return await response.json();
}

/**
 * Commits updated board state directly to the GitHub repository file on the gh-pages branch.
 * Handles auto-resolving the file's latest SHA to prevent commit conflicts.
 * @param {string} token - Authenticated PAT.
 * @param {Object} boardData - Active serializable board assets.
 * @returns {Promise<void>} Resolves on successful commit.
 */
export async function commitBoardData(token, boardData) {
  const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE_PATH}?ref=${BRANCH_NAME}&_cb=${Date.now()}`;
  
  // 1. Fetch current file metadata to retrieve latest remote commit SHA
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
    throw new Error(`Failed to query existing file SHA from GitHub: ${getResponse.statusText}`);
  }
  
  // 2. Format board state to pretty-printed JSON & encode in UTF-8 Base64
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
  
  // 3. Perform PUT request to write data file
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
}

/**
 * Serializes and exports the board data as a browser download download.
 * @param {Object} boardData - Serializable state.
 */
export function downloadBackupJSON(boardData) {
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
}
