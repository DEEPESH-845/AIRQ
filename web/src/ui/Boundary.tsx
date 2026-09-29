import { Component, type ReactNode } from 'react'

/** Keeps one broken overlay from blanking the whole map; the rest of AIRQ keeps working. */
export class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('AIRQ overlay failed', error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
