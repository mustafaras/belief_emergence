import { createContext, useContext } from 'react'

export type InspectorContextValue = {
  openClaim: (id: string, returnTarget?: HTMLElement | SVGElement | null) => void
  closeClaim: () => void
}

export const InspectorContext = createContext<InspectorContextValue>({
  openClaim: () => {},
  closeClaim: () => {}
})

export function useClaimInspector(): InspectorContextValue {
  return useContext(InspectorContext)
}
