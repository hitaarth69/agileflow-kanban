// ----- IndexedDB Wrapper (Level Up!) -----
export class KanbanDB {
    constructor(dbName = 'AgileFlowDB', storeName = 'appState') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('id', 'id', { unique: true });
                }
            };
        });
    }

    async saveState(state) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const data = { id: 'mainState', ...state };
            const request = store.put(data);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async loadState() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get('mainState');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result || null);
            };
        });
    }

    async clearState() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.delete('mainState');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }
}
