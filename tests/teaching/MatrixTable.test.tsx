// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MatrixTable } from '../../src/components/Teaching/MatrixTable'

afterEach(cleanup)

describe('MatrixTable', () => {
  it('sizes every value column to the longest entry, so columns are even', () => {
    const matrix = [
      [
        { re: 0.5, im: 0 },
        { re: 0.25, im: 0.25 },
      ],
      [
        { re: 0.25, im: -0.25 },
        { re: 0, im: 0 },
      ],
    ]
    render(<MatrixTable matrix={matrix} numQubits={1} label="ρ" testId="m" />)
    // "0.250 + 0.250i" is the longest entry: 14 characters.
    expect(screen.getByTestId('m').style.getPropertyValue('--cell-ch')).toBe('14')
  })
})
