import type { HTMLAttributes } from 'react'
import styles from './Card.module.css'

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
}

export function Card({ as: Element = 'article', className = '', ...props }: CardProps) {
  return <Element {...props} className={[styles.card, className].filter(Boolean).join(' ')} />
}
