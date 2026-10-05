// The engine Web Worker. Runs the math off the main thread so the UI never
// freezes while a circuit is being simulated. All logic lives in handleRequest.
import { handleRequest } from './handleRequest'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * The parts of the worker global scope we use. The app tsconfig uses the DOM
 * lib (where `self` is a Window), so we describe the worker scope ourselves
 * instead of pulling the WebWorker lib into every file.
 */
interface EngineWorkerScope {
  postMessage(message: WorkerResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
}

const scope = self as unknown as EngineWorkerScope

scope.addEventListener('message', (event) => {
  scope.postMessage(handleRequest(event.data))
})
