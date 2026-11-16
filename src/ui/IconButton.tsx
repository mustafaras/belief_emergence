import type { ButtonHTMLAttributes } from 'react'
import styles from './IconButton.module.css'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  'aria-label': string
}

export function IconButton({ className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[styles.button, className].filter(Boolean).join(' ')}
    />
  )
}
