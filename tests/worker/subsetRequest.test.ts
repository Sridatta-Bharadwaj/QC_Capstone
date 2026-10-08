// V2-7: 'subset' requests through the worker handler and the EngineClient.
import { describe, expect, it } from 'vitest'
import { basisParts } from '../../src/components/Teaching/format'
import { EngineClient } from '../../src/worker/engineClient'
import { handleRequest } from '../../src/worker/handleRequest'
import type { SubsetResult } from '../../src/worker/protocol'
import { circuit, expectClose } from '../engine/helpers'

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])

describe("'subset' requests", () => {
  it('returns the reduced ρ, purity and entropy', () => {
    const res = handleRequest(
      { type: 'subset', requestId: 4, circuit: bell, keep: [1], explicit: true },
      () => 0,
    )
    expect(res.type).toBe('subset-result')
    if (res.type !== 'subset-result') return
    expect(res.requestId).toBe(4)
    expectClose(res.result.entropy, 1)
    expectClose(res.result.purity, 0.5)
    expect(res.result.entries).toHaveLength(4)
  })

  it('an invalid keep set becomes an error response, not a crash', () => {
    const res = handleRequest(
      { type: 'subset', requestId: 5, circuit: bell, keep: [0, 0], explicit: false },
      () => 0,
    )
    expect(res).toMatchObject({ type: 'error', requestId: 5 })
  })

  it('EngineClient delivers only the latest subset reply', () => {
    const delivered: SubsetResult[] = []
    const client = new EngineClient({
      createWorker: () => null, // synchronous fallback
      onResult: () => {},
      onOtherResult: (r) => {
        if (r.type === 'subset-result') delivered.push(r)
      },
      onError: () => {},
      onComputingChange: () => {},
    })
    client.send({ type: 'subset', circuit: bell, keep: [0, 1], explicit: false })
    expect(delivered).toHaveLength(1)
    expect(delivered[0].result.keep).toEqual([0, 1])
    client.dispose()
  })
})

describe('basisParts with a kept set', () => {
  it('flags every kept qubit', () => {
    expect(basisParts(5, 3, [0, 2]).map((p) => p.highlighted)).toEqual([true, false, true])
  })
})
