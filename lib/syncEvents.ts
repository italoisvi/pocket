type SyncEventCallback = () => void;

class SyncEventEmitter {
  private listeners: Set<SyncEventCallback> = new Set();

  subscribe(callback: SyncEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  emit(): void {
    console.log(
      '[SyncEvents] Emitting sync event to',
      this.listeners.size,
      'listeners'
    );
    this.listeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[SyncEvents] Error in listener:', error);
      }
    });
  }
}

export const syncEvents = new SyncEventEmitter();
