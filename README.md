# @js-nerds/batch-collector

[![npm version](https://img.shields.io/npm/v/@js-nerds/batch-collector)](https://www.npmjs.com/package/@js-nerds/batch-collector)
[![npm downloads](https://img.shields.io/npm/dm/@js-nerds/batch-collector)](https://www.npmjs.com/package/@js-nerds/batch-collector)
[![tests](https://github.com/js-nerds/batch-collector/actions/workflows/build-test.yml/badge.svg?branch=main&label=tests)](https://github.com/js-nerds/batch-collector/actions/workflows/build-test.yml)
[![coverage](https://codecov.io/gh/js-nerds/batch-collector/branch/main/graph/badge.svg)](https://codecov.io/gh/js-nerds/batch-collector)

Lightweight TypeScript batch collector with delayed flush, optional timer reset, and local/session storage persistence.

## Install

```bash
npm install @js-nerds/batch-collector
```

```bash
pnpm add @js-nerds/batch-collector
```

```bash
yarn add @js-nerds/batch-collector
```

## Usage

```ts
import { BATCH_FLUSH_EVENT, BatchCollector } from "@js-nerds/batch-collector";

const collector = new BatchCollector<{ action: string; id: string }>({
	delayMs: 5000,
	resetTimerOnPush: true,
	storageType: "localStorage",
	storageKey: "my-app-log-batch"
});

collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
	console.log("Flush:", items);
});

collector.push({ action: "button_click", id: "submit-btn" });
collector.push({ action: "menu_open", id: "profile" });
```

## API

### `new BatchCollector(config)`

Creates a collector instance.

**Config**
- `delayMs: number` — delay before flush.
- `resetTimerOnPush?: boolean` — reset timer on every push (default `true`).
- `storageType?: "memory" | "localStorage" | "sessionStorage"` — where to keep pending batch (default `"memory"`).
- `storageKey?: string` — key for local/session storage (default `"batch-collector-pending"`).
- `autoClear?: boolean` — clear after timer flush (default `true`).

### `subscribe(event, callback)`

Subscribes to collector events.

**Params**
- `event: string` — use `BATCH_FLUSH_EVENT` (`"flush"`).
- `callback: (items: T[]) => void`

**Returns**
- `() => void` — unsubscribe function.

### `push(item)`

Adds item to batch and schedules flush.

### `items()`

Returns a shallow copy of current batch.

### `clear()`

Clears timer, in-memory batch, and persisted batch.

## License

MIT

## Changelog

See `CHANGELOG.md`.
