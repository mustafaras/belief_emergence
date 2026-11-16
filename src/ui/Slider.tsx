import { useId, type KeyboardEvent } from 'react'
import styles from './Interactive.module.css'

export type SliderMark = { value: number; label: string }

type SliderProps = {
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  marks?: SliderMark[]
  paperValue?: number
  label: string
}

export function Slider({ min, max, step, value, onChange, marks = [], paperValue, label }: SliderProps) {
  const id = useId()
  const precision = `${step}`.split('.')[1]?.length ?? 0
  const position = (mark: number) => `${((mark - min) / (max - min)) * 100}%`
  const commit = (nextValue: number) => {
    const clamped = Math.min(max, Math.max(min, nextValue))
    onChange(Number(clamped.toFixed(precision)))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const pageStep = Math.max(step, (max - min) / 10)
    const changes: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + pageStep,
      PageDown: value - pageStep,
      Home: min,
      End: max
    }
    if (!(event.key in changes)) return
    event.preventDefault()
    commit(changes[event.key])
  }

  return (
    <div className={styles.slider}>
      <label htmlFor={id}>{label}</label>
      <input
        aria-valuetext={value.toLocaleString('en-US', { maximumFractionDigits: 6 })}
        id={id}
        max={max}
        min={min}
        onChange={event => commit(Number(event.currentTarget.value))}
        onKeyDown={handleKeyDown}
        step={step}
        type="range"
        value={value}
      />
      <div aria-hidden="true" className={styles.sliderMarks}>
        {marks.map(mark => <span key={`${mark.value}-${mark.label}`} style={{ left: position(mark.value) }}>{mark.label}</span>)}
        {paperValue !== undefined && <span className={styles.paperMark} style={{ left: position(paperValue) }}>paper</span>}
      </div>
    </div>
  )
}
