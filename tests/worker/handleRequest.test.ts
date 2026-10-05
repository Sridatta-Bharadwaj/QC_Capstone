import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/engine'
import { handleRequest } from '../../src/worker/handleRequest'
import type { AnalyzeRequest } from '../../src/worker/protocol'
import { circuit, expectClose } from '../engine/helpers'

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])

function req(overrides: Partial<AnalyzeRequest> = {}): AnalyzeRequest {
  return { type: 'analyze', requestId: 7, circuit: bell, explicitQubit: null, ...overrides }
}

describe('handleRequest', () => {
  it('returns the analysis with the request id and elapsed time', () => {
    const res = handleRequest(req())
    expect(res.type).toBe('result')
    if (res.type !== 'result') return
    expect(res.requestId).toBe(7)
    expect(res.analysis).toEqual(analyze(bell))
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0)
    // Bell state: both qubits maximally mixed.
    expectClose(res.analysis.qubits[0].length, 0)
    expect(res.analysis.qubits[1].entangled).toBe(true)
  })

  it('skips the explicit partial trace when no qubit is selected', () => {
    const res = handleRequest(req({ explicitQubit: null }))
    expect(res.type === 'result' && res.explicit).toBeNull()
  })

  it('includes the explicit partial trace for the selected qubit', () => {
    const res = handleRequest(req({ explicitQubit: 1 }))
    if (res.type !== 'result' || !res.explicit) throw new Error('expected explicit result')
    expect(res.explicit.qubit).toBe(1)
    expect(res.explicit.fullRho).toHaveLength(4)
    // Textbook trace and direct method agree.
    const direct = res.analysis.qubits[1].rho
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        expectClose(res.explicit.reduced[a][b].re, direct[a][b].re)
        expectClose(res.explicit.reduced[a][b].im, direct[a][b].im)
      }
  })

  it('returns an error response for an invalid circuit', () => {
    const bad = circuit(1, ['CX', 0, [0, 1]])
    const res = handleRequest(req({ requestId: 3, circuit: bad }))
    expect(res).toMatchObject({ type: 'error', requestId: 3 })
    if (res.type === 'error') expect(res.message.length).toBeGreaterThan(0)
  })

  it('returns an error response for an out-of-range explicit qubit', () => {
    expect(handleRequest(req({ explicitQubit: 5 })).type).toBe('error')
  })

  it('produces responses that survive structuredClone (postMessage)', () => {
    const res = handleRequest(req({ explicitQubit: 0 }))
    expect(structuredClone(res)).toEqual(res)
    const err = handleRequest(req({ circuit: { numQubits: 0, operations: [] } }))
    expect(structuredClone(err)).toEqual(err)
  })

  it('measures elapsed time with the given clock', () => {
    let t = 100
    const res = handleRequest(req(), () => (t += 5))
    expect(res.type === 'result' && res.elapsedMs).toBe(5)
  })
})
