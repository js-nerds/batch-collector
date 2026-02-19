/**
 * Batches items and emits a "flush" event after a delay (e.g. after last push).
 * Event-based: create instance, subscribe via subscribe(BATCH_FLUSH_EVENT, callback), call push() from UI.
 * Optional persistence: storageType can be memory, localStorage, or sessionStorage so the batch survives refresh/close.
 */

export type BatchCollectorStorageType = "memory" | "localStorage" | "sessionStorage";

export type BatchCollectorConfig = {
  /** Delay in milliseconds before flushing the batch (e.g. 5000 = 5 seconds). */
  delayMs: number;
  /** If true, timer resets on each push (flush N ms after last push). If false, flush exactly N ms after first push. Default true. */
  resetTimerOnPush?: boolean;
  /** Where to keep the buffer: "memory" (default), "localStorage", or "sessionStorage". When not memory, buffer is persisted and re-flushed on next load if any. */
  storageType?: BatchCollectorStorageType;
  /** Storage key when storageType is localStorage or sessionStorage. Should be unique per collector instance. Default "batch-collector-pending". */
  storageKey?: string;
  /** If true (default), buffer and storage are cleared when the timer fires. If false, only on manual clear() call. */
  autoClear?: boolean;
};

/** Event name emitted when the batch is flushed. */
export const BATCH_FLUSH_EVENT = "flush";

type FlushListener<T> = (items: T[]) => void;

const DEFAULT_STORAGE_KEY = "batch-collector-pending";

/**
 * Collects items in a buffer and emits BATCH_FLUSH_EVENT with the batched array after a delay (e.g. after the last push).
 * Use for batching UI events (clicks, logs) before sending to server or analytics. Item type is generic (objects, numbers, strings, or any T).
 *
 * Parameters (config):
 * - delayMs (required) — delay in ms before emitting the batch (e.g. 5000 = 5 seconds).
 * - resetTimerOnPush (optional) — if true (default), timer resets on each push; if false, emit exactly delayMs after first push.
 * - storageType (optional) — "memory" (default), "localStorage", or "sessionStorage". When not memory, batch is persisted and re-emitted on next load.
 * - storageKey (optional) — storage key when using localStorage/sessionStorage. Unique per instance. Default "batch-collector-pending".
 * - autoClear (optional) — if true (default), buffer and storage are cleared when the timer fires; if false, only on manual clear().
 *
 * Public API:
 * - subscribe(event, callback) — subscribe to flush events; callback receives the batch. Returns unsubscribe function.
 * - push(item) — add an item and (re)start the timer.
 * - items() — returns a copy of the current batch (optional; does not emit or clear).
 * - clear() — clears buffer and storage (optional; e.g. call from the subscriber after a successful send).
 *
 * @example
 * const collector = new BatchCollector<{ action: string; id: string }>({
 *   delayMs: 5000,
 *   storageType: "localStorage",
 *   storageKey: "my-app-log-batch"
 * });
 * collector.subscribe(BATCH_FLUSH_EVENT, (items) => sendToBackend(items));
 * collector.push({ action: "button_click", id: "submit-btn" });
 *
 * Optional:
 * collector.items()  // copy of current batch
 * collector.clear() // clear buffer and storage (e.g. after successful send in subscriber)
 */
export class BatchCollector<T = unknown> {
  private buffer: T[] = [];
  private timerId: ReturnType<typeof setTimeout> | null = null;

  private readonly delayMs: number;
  private readonly resetTimerOnPush: boolean;
  private readonly storageType: BatchCollectorStorageType;
  private readonly storageKey: string;
  private readonly autoClear: boolean;
  private readonly listeners = new Map<string, Set<FlushListener<T>>>();

  /**
   * Creates a batch collector instance.
   *
   * @param {BatchCollectorConfig} config - Configuration object with delay, optional reset behaviour, and optional storageType.
   */
  constructor(config: BatchCollectorConfig) {
    this.delayMs = config.delayMs;
    this.resetTimerOnPush = config.resetTimerOnPush ?? true;
    this.storageType = config.storageType ?? "memory";
    this.storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
    this.autoClear = config.autoClear ?? true;

    if (this.storageType !== "memory") {
      const pending = this.autoClear ? this.claimPersisted() : this.readPersisted();

      if (pending.length !== 0) {
        setTimeout(() => this.emit(BATCH_FLUSH_EVENT, pending), 0);
      }
    }
  }

  /**
   * Subscribe to an event. When the batch is flushed, the "flush" event is emitted with the batched items.
   *
   * @param {string} event - Event name; use BATCH_FLUSH_EVENT ("flush") for flush events.
   * @param {FlushListener<T>} callback - Function called with the batched items when the event is emitted.
   * @returns {() => void} Unsubscribe function; call to remove the listener.
   */
  public subscribe(event: string, callback: FlushListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback);

    return () => this.listeners.get(event)?.delete(callback);
  }

  /**
   * Add an item to the batch and (re)start the flush timer. When storageType is not memory, also persists the buffer.
   *
   * @param {T} item - Item to add to the current batch.
   * @returns {void}
   */
  public push(item: T): void {
    this.buffer.push(item);

    if (this.storageType !== "memory") {
      this.writePersisted(this.buffer);
    }

    this.scheduleFlush();
  }

  /**
   * Returns a copy of the current buffer. Does not emit, clear, or change state.
   *
   * @returns {T[]} Copy of all items in the batch.
   */
  public items(): T[] {
    return [...this.buffer];
  }

  /**
   * Clears the pending timer, the buffer, and persisted storage. Does not emit.
   *
   * @returns {boolean} True.
   */
  public clear(): boolean {
    this.clearTimer();
    this.buffer = [];

    if (this.storageType !== "memory") {
      this.writePersisted([]);
    }

    return true;
  }

  /**
   * Returns the Storage instance for the configured storage type, or null if unavailable (e.g. SSR).
   *
   * @returns {Storage | null} window.localStorage, window.sessionStorage, or null.
   */
  private getStorage(): Storage | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.storageType === "localStorage") {
      return window.localStorage;
    }

    if (this.storageType === "sessionStorage") {
      return window.sessionStorage;
    }

    return null;
  }

  /**
   * Reads the persisted buffer from storage.
   *
   * @returns {T[]} Parsed buffer from storage, or empty array if unavailable or parse error.
   */
  private readPersisted(): T[] {
    const storage = this.getStorage();

    if (!storage) {
      return [];
    }

    try {
      const raw = storage.getItem(this.storageKey);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);

      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Reads and clears persisted batch atomically in the same tick.
   * Used for recovery when autoClear=true to avoid duplicate replays across parallel instances.
   *
   * @returns {T[]} Claimed items or empty array when unavailable.
   */
  private claimPersisted(): T[] {
    const items = this.readPersisted();

    if (items.length !== 0) {
      this.writePersisted([]);
    }

    return items;
  }

  /**
   * Writes the buffer to storage, or removes the key when the buffer is empty.
   *
   * @param {T[]} items - Current buffer to persist.
   * @returns {boolean} True if write succeeded, false otherwise.
   */
  private writePersisted(items: T[]): boolean {
    const storage = this.getStorage();

    if (!storage) {
      return false;
    }

    try {
      if (items.length === 0) {
        storage.removeItem(this.storageKey);
      } else {
        storage.setItem(this.storageKey, JSON.stringify(items));
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Emits the current batch to subscribers and optionally clears buffer and storage. Used internally by the timer.
   * When autoClear is false, the timer calls flush(false) so only manual clear() clears.
   *
   * @param {boolean} clear - If true (default), clear buffer and storage after emit. If false, only emit.
   * @returns {boolean} True if the batch was emitted, false if buffer was empty.
   */
  private flush(clear: boolean = true): boolean {
    this.clearTimer();

    if (this.buffer.length === 0) {
      return false;
    }

    const items = [...this.buffer];

    if (clear) {
      this.buffer = [];

      if (this.storageType !== "memory") {
        this.writePersisted([]);
      }
    }

    this.emit(BATCH_FLUSH_EVENT, items);

    return true;
  }

  /**
   * Emits an event with the given payload to all subscribers of that event.
   *
   * @param {string} event - Event name to emit.
   * @param {T[]} payload - Data to pass to each listener.
   * @returns {void}
   */
  private emit(event: string, payload: T[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch {
        // ignore listener errors to keep emit/flush cycle stable
      }
    });
  }

  /**
   * Schedules a flush after the configured delay. If resetTimerOnPush is true, clears existing timer first.
   *
   * @returns {boolean} True if timer was scheduled, false if already scheduled (resetTimerOnPush false).
   */
  private scheduleFlush(): boolean {
    if (this.resetTimerOnPush) {
      this.clearTimer();
    } else if (this.timerId !== null) {
      return false; // already scheduled from first push
    }

    this.timerId = setTimeout(() => this.flush(this.autoClear), this.delayMs);

    return true;
  }

  /**
   * Clears the pending flush timer if one is set. Does nothing if no timer is set.
   *
   * @returns {boolean} True if a timer was cleared, false if there was no timer.
   */
  private clearTimer(): boolean {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);

      this.timerId = null;

      return true;
    }

    return false;
  }
}
