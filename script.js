import { KanbanDB } from './db.js';

// ----- DOM Refs -----
const boardEl = document.getElementById('board');
const statusBar = document.getElementById('status-bar');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const addColumnBtn = document.getElementById('add-column-btn');
const modal = document.getElementById('card-modal');
const modalClose = document.getElementById('modal-close');
const modalOverlay = modal.querySelector('.modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalCardTitle = document.getElementById('modal-card-title');
const modalCardDesc = document.getElementById('modal-card-desc');
const modalLabelsDisplay = document.getElementById('modal-labels-display');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const labelPicker = document.getElementById('label-picker');

// ----- State -----
let state = {
    columns: [
        { id: 'col-1', title: '📝 To Do', cards: [] },
        { id: 'col-2', title: '🚧 In Progress', cards: [] },
        { id: 'col-3', title: '✅ Done', cards: [] },
    ],
};
let history = [];
let historyIndex = -1;
let maxHistory = 50;
let editingCardId = null;
let editingColumnId = null;
let currentSearchQuery = '';
let isDarkTheme = true;
let db = new KanbanDB();

// ----- Utility Functions -----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function debounce(fn, delay = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ----- History (Undo/Redo) -----
function pushHistory() {
    // Remove any future states if we're in the middle of history
    history = history.slice(0, historyIndex + 1);
    history.push(deepClone(state));
    if (history.length > maxHistory) {
        history.shift();
    }
    historyIndex = history.length - 1;
    updateUndoRedoButtons();
    saveToDB();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        state = deepClone(history[historyIndex]);
        renderBoard();
        updateUndoRedoButtons();
        setStatus('↩️ Undo', '#f59e0b');
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        state = deepClone(history[historyIndex]);
        renderBoard();
        updateUndoRedoButtons();
        setStatus('↪️ Redo', '#3b82f6');
    }
}

function updateUndoRedoButtons() {
    undoBtn.style.opacity = historyIndex > 0 ? 1 : 0.3;
    redoBtn.style.opacity = historyIndex < history.length - 1 ? 1 : 0.3;
}

// ----- Save to IndexedDB -----
async function saveToDB() {
    try {
        await db.saveState({ columns: state.columns });
        setStatus('💾 All changes saved automatically', '#22c55e');
    } catch (err) {
        setStatus('❌ Failed to save to database', '#ef4444');
        console.error(err);
    }
}

async function loadFromDB() {
    try {
        const data = await db.loadState();
        if (data && data.columns) {
            state.columns = data.columns;
            setStatus('📂 Loaded from database', '#3b82f6');
            return true;
        }
    } catch (err) {
        console.error('Failed to load from DB:', err);
    }
    return false;
}

// ----- Set Status -----
function setStatus(message, color = '#8892a8') {
    statusBar.textContent = message;
    statusBar.style.color = color;
    setTimeout(() => {
        if (statusBar.textContent === message) {
            statusBar.style.color = '#8892a8';
        }
    }, 3000);
}

// ----- Render Board -----
function renderBoard() {
    const filteredColumns = state.columns.map(col => {
        const cards = col.cards.filter(card => {
            if (!currentSearchQuery) return true;
            const query = currentSearchQuery.toLowerCase();
            return card.title.toLowerCase().includes(query) ||
                   (card.description && card.description.toLowerCase().includes(query));
        });
        return { ...col, cards };
    });

    boardEl.innerHTML = filteredColumns.map(col => `
        <div class="column" data-column-id="${col.id}">
            <div class="column-header">
                <div class="column-title">
                    ${col.title}
                    <span class="column-count">${col.cards.length}</span>
                </div>
                <div class="column-actions">
                    <button class="add-card-btn" data-column-id="${col.id}" title="Add Card">+</button>
                    <button class="delete-column-btn" data-column-id="${col.id}" title="Delete Column">✕</button>
                </div>
            </div>
            <div class="card-list" data-column-id="${col.id}">
                ${col.cards.length === 0 ? `<div class="empty-state">Drop cards here</div>` : ''}
                ${col.cards.map(card => `
                    <div class="card" draggable="true" data-card-id="${card.id}" data-column-id="${col.id}">
                        ${card.labels && card.labels.length > 0 ? `
                            <div class="card-labels">
                                ${card.labels.map(color => `<span class="card-label" style="background:${color}"></span>`).join('')}
                            </div>
                        ` : ''}
                        <div class="card-title" data-card-id="${card.id}" data-column-id="${col.id}">${escapeHtml(card.title)}</div>
                        ${card.description ? `<div class="card-meta"><span class="card-desc-preview">${escapeHtml(card.description.substring(0, 60))}${card.description.length > 60 ? '...' : ''}</span></div>` : ''}
                        <div class="card-meta">
                            <span></span>
                            <button class="card-delete-btn" data-card-id="${card.id}" data-column-id="${col.id}">✕</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Attach event listeners
    attachColumnEvents();
    attachCardEvents();
    attachDragDropEvents();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ----- Column Events -----
function attachColumnEvents() {
    // Add Card
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const colId = btn.dataset.columnId;
            const title = prompt('Enter card title:');
            if (title && title.trim()) {
                addCard(colId, { title: title.trim(), description: '', labels: [] });
            }
        });
    });

    // Delete Column
    document.querySelectorAll('.delete-column-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const colId = btn.dataset.columnId;
            if (state.columns.length <= 1) {
                alert('You need at least one column.');
                return;
            }
            if (confirm('Delete this column and all its cards?')) {
                deleteColumn(colId);
            }
        });
    });
}

// ----- Card Events (Click to open modal, delete) -----
function attachCardEvents() {
    // Card title click -> open modal
    document.querySelectorAll('.card-title').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = el.dataset.cardId;
            const colId = el.dataset.columnId;
            openCardModal(colId, cardId);
        });
    });

    // Card delete
    document.querySelectorAll('.card-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = btn.dataset.cardId;
            const colId = btn.dataset.columnId;
            if (confirm('Delete this card?')) {
                deleteCard(colId, cardId);
            }
        });
    });
}

// ----- Drag & Drop (Level Up!) -----
function attachDragDropEvents() {
    const cards = document.querySelectorAll('.card');
    const lists = document.querySelectorAll('.card-list');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                cardId: card.dataset.cardId,
                sourceColId: card.dataset.columnId,
            }));
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
            document.querySelectorAll('.card-list').forEach(l => l.classList.remove('drag-over'));
        });
    });

    lists.forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            list.classList.add('drag-over');
        });
        list.addEventListener('dragleave', (e) => {
            list.classList.remove('drag-over');
        });
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            list.classList.remove('drag-over');
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const targetColId = list.dataset.columnId;
            if (data.sourceColId !== targetColId) {
                moveCard(data.sourceColId, targetColId, data.cardId);
            } else {
                // Reorder within same column (optional: implement reordering)
                setStatus('ℹ️ Reordering within same column', '#8892a8');
            }
        });
    });

    // Allow dropping on empty state
    document.querySelectorAll('.empty-state').forEach(el => {
        const list = el.closest('.card-list');
        if (list) {
            list.addEventListener('dragover', (e) => e.preventDefault());
            list.addEventListener('drop', (e) => {
                e.preventDefault();
                list.classList.remove('drag-over');
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const targetColId = list.dataset.columnId;
                if (data.sourceColId !== targetColId) {
                    moveCard(data.sourceColId, targetColId, data.cardId);
                }
            });
        }
    });
}

// ----- State Mutations (with History) -----
function addColumn(title) {
    const col = { id: generateId(), title: title, cards: [] };
    state.columns.push(col);
    pushHistory();
    renderBoard();
    setStatus(`✅ Added column: ${title}`, '#22c55e');
}

function deleteColumn(colId) {
    state.columns = state.columns.filter(c => c.id !== colId);
    pushHistory();
    renderBoard();
    setStatus('🗑️ Column deleted', '#ef4444');
}

function addCard(colId, cardData) {
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    const card = {
        id: generateId(),
        title: cardData.title,
        description: cardData.description || '',
        labels: cardData.labels || [],
    };
    col.cards.push(card);
    pushHistory();
    renderBoard();
    setStatus(`✅ Added card: ${cardData.title}`, '#22c55e');
}

function deleteCard(colId, cardId) {
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    col.cards = col.cards.filter(c => c.id !== cardId);
    pushHistory();
    renderBoard();
    setStatus('🗑️ Card deleted', '#ef4444');
}

function moveCard(sourceColId, targetColId, cardId) {
    const sourceCol = state.columns.find(c => c.id === sourceColId);
    const targetCol = state.columns.find(c => c.id === targetColId);
    if (!sourceCol || !targetCol) return;
    const cardIndex = sourceCol.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;
    const card = sourceCol.cards.splice(cardIndex, 1)[0];
    targetCol.cards.push(card);
    pushHistory();
    renderBoard();
    setStatus(`📦 Moved "${card.title}" to ${targetCol.title}`, '#8b5cf6');
}

function updateCard(colId, cardId, updates) {
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    const card = col.cards.find(c => c.id === cardId);
    if (!card) return;
    Object.assign(card, updates);
    pushHistory();
    renderBoard();
    setStatus('💾 Card updated', '#3b82f6');
}

function getCard(colId, cardId) {
    const col = state.columns.find(c => c.id === colId);
    if (!col) return null;
    return col.cards.find(c => c.id === cardId) || null;
}

// ----- Modal Logic -----
function openCardModal(colId, cardId) {
    const card = getCard(colId, cardId);
    if (!card) return;
    editingCardId = cardId;
    editingColumnId = colId;
    modalTitle.textContent = '✏️ Edit Card';
    modalCardTitle.value = card.title;
    modalCardDesc.value = card.description || '';
    // Render labels
    renderLabelPicker(card.labels || []);
    modal.classList.add('visible');
}

function closeModal() {
    modal.classList.remove('visible');
    editingCardId = null;
    editingColumnId = null;
}

function renderLabelPicker(selectedLabels) {
    modalLabelsDisplay.innerHTML = selectedLabels.map(color => `
        <span class="label-chip" style="background:${color}"></span>
    `).join('');

    document.querySelectorAll('.label-opt').forEach(btn => {
        const color = btn.dataset.color;
        btn.classList.toggle('active', selectedLabels.includes(color));
        btn.onclick = () => {
            const current = editingCardId ? getCard(editingColumnId, editingCardId) : null;
            if (!current) return;
            let labels = current.labels || [];
            if (labels.includes(color)) {
                labels = labels.filter(c => c !== color);
            } else {
                labels.push(color);
            }
            // Update card
            const col = state.columns.find(c => c.id === editingColumnId);
            if (col) {
                const card = col.cards.find(c => c.id === editingCardId);
                if (card) {
                    card.labels = labels;
                    renderLabelPicker(labels);
                    pushHistory();
                    renderBoard();
                }
            }
        };
    });
}

// Modal events
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

modalSaveBtn.addEventListener('click', () => {
    if (!editingCardId || !editingColumnId) return;
    const title = modalCardTitle.value.trim();
    if (!title) {
        alert('Title is required.');
        return;
    }
    updateCard(editingColumnId, editingCardId, {
        title: title,
        description: modalCardDesc.value.trim(),
    });
    closeModal();
});

modalDeleteBtn.addEventListener('click', () => {
    if (!editingCardId || !editingColumnId) return;
    if (confirm('Delete this card?')) {
        deleteCard(editingColumnId, editingCardId);
        closeModal();
    }
});

// Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
    }
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ----- Search (Debounced) -----
const debouncedSearch = debounce((query) => {
    currentSearchQuery = query;
    renderBoard();
}, 300);

searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});

// ----- Theme Toggle -----
themeToggle.addEventListener('click', () => {
    isDarkTheme = !isDarkTheme;
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
    themeToggle.textContent = isDarkTheme ? '🌙' : '☀️';
    localStorage.setItem('agileflow-theme', isDarkTheme ? 'dark' : 'light');
});

// ----- Export / Import -----
exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agileflow-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('📤 Board exported successfully!', '#3b82f6');
});

importBtn.addEventListener('click', () => {
    importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.columns && Array.isArray(data.columns)) {
                state.columns = data.columns;
                pushHistory();
                renderBoard();
                setStatus('📥 Board imported successfully!', '#22c55e');
            } else {
                throw new Error('Invalid format');
            }
        } catch (err) {
            setStatus('❌ Invalid file format', '#ef4444');
        }
    };
    reader.readAsText(file);
    importFileInput.value = '';
});

// ----- Add Column -----
addColumnBtn.addEventListener('click', () => {
    const title = prompt('Enter column title:');
    if (title && title.trim()) {
        addColumn(title.trim());
    }
});

// ----- Initialize App -----
async function init() {
    // Load theme
    const savedTheme = localStorage.getItem('agileflow-theme');
    if (savedTheme === 'light') {
        isDarkTheme = false;
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.textContent = '☀️';
    }

    // Init DB
    await db.init();

    // Try loading from DB
    const loaded = await loadFromDB();
    if (!loaded) {
        // Seed with default columns
        pushHistory(); // push initial state
    } else {
        // Push loaded state to history
        history = [];
        historyIndex = -1;
        pushHistory();
    }

    renderBoard();
    setStatus('🚀 AgileFlow ready!', '#22c55e');
}

init().catch(console.error);
