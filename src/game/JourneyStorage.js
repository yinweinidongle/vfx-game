import {SAVE_KEY} from './GameData.js';

export const BACKUP_KEY = 'frostbound.rpg.backup';
const TRANSFER_KEY = 'frostbound.rpg.transfer.v1';

function put(storage, key, value) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

// A title-screen switch touches two legacy slots. Recover the previous backup if
// the page closed between the two writes. Ordinary autosaves use one setItem.
export function recoverJourneyTransfer(storage) {
  const raw = storage.getItem(TRANSFER_KEY);
  if (!raw) return;
  let transaction;
  try { transaction = JSON.parse(raw); } catch { /* A damaged journal cannot identify a valid slot. */ }
  if (!transaction || typeof transaction.before !== 'string' ||
      (typeof transaction.previousBackup !== 'string' && transaction.previousBackup !== null)) {
    storage.removeItem(TRANSFER_KEY);
    return;
  }
  if (storage.getItem(SAVE_KEY) === transaction.before &&
      storage.getItem(BACKUP_KEY) === transaction.before) {
    put(storage, BACKUP_KEY, transaction.previousBackup);
  }
  storage.removeItem(TRANSFER_KEY);
}

export class JourneyStorage {
  constructor(storage) {
    this.storage = storage;
    recoverJourneyTransfer(storage);
    this.lastSave = storage.getItem(SAVE_KEY);
    this.previousBackup = storage.getItem(BACKUP_KEY);
    this.switching = false;
    this.conflict = false;
  }

  getItem(key) { return this.storage.getItem(key); }

  // Called by GameState.write only after the new session finishes loading.
  setItem(key, value) {
    if (key !== SAVE_KEY) throw new Error('Unexpected save slot');
    const storage = this.storage;
    if (this.conflict || storage.getItem(key) !== this.lastSave ||
        (this.switching && storage.getItem(BACKUP_KEY) !== this.previousBackup)) {
      this.conflict = true;
      throw new Error('Journey changed in another tab');
    }
    const movePrevious = this.switching && this.lastSave !== null;
    try {
      if (movePrevious) {
        storage.setItem(TRANSFER_KEY, JSON.stringify({before: this.lastSave, previousBackup: this.previousBackup}));
        storage.setItem(BACKUP_KEY, this.lastSave);
      }
      storage.setItem(key, value);
    } catch (error) {
      if (movePrevious) {
        try { recoverJourneyTransfer(storage); } catch { /* Recovery is retried on next entry. */ }
      }
      throw error;
    }
    this.lastSave = value;
    this.switching = false;
    if (movePrevious) {
      try { storage.removeItem(TRANSFER_KEY); } catch { /* Both slots already committed. */ }
    }
  }
}
