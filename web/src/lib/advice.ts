// Deterministic health guidance. Wording follows the CPCB 2014 NAQI health statements and
// CAQM GRAP citizen charters; persona advice is a fixed matrix (no generated text).
import { catIndex } from './naqi'
import matrix from './advice-matrix.json'

export type Persona = 'parent' | 'runner' | 'sensitive' | 'worker'

export const PERSONAS: { id: Persona; label: string }[] = [
  { id: 'parent', label: 'Parent' },
  { id: 'runner', label: 'Runner' },
  { id: 'sensitive', label: 'Asthma, 60+' },
  { id: 'worker', label: 'Outdoor job' },
]

type Row = { cpcb: string; grap: string | null; verdict: string } & Record<Persona, string>

// Index matches CATS: Good, Satisfactory, Moderate, Poor, Very Poor, Severe, Severe+.
// Shared with the General agent (infra/general) so both surfaces give identical guidance.
export const MATRIX: Row[] = matrix

export const adviceFor = (aqi: number) => MATRIX[catIndex(aqi)]

const KEY = 'airq.persona'
export function loadPersona(): Persona {
  try {
    const v = localStorage.getItem(KEY) as Persona | null
    return v && PERSONAS.some((p) => p.id === v) ? v : 'parent'
  } catch {
    return 'parent'
  }
}
export function savePersona(p: Persona) {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* private mode: persona just won't persist */
  }
}
