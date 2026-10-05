// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton, SkeletonGroup, SkeletonLines } from '../../src/components/common/Skeleton'

describe('Skeleton', () => {
  it('renders an aria-hidden block and a labelled loading group', () => {
    render(
      <SkeletonGroup label="code editor">
        <SkeletonLines lines={3} />
        <Skeleton circle width={40} />
      </SkeletonGroup>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading code editor')
    expect(document.querySelectorAll('.skeleton')).toHaveLength(4)
    expect(document.querySelector('.skeleton--circle')).toHaveStyle({
      width: '40px',
      height: '40px',
    })
  })
})
