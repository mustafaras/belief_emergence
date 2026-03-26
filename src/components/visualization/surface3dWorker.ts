/// <reference lib="webworker" />

import type { BeliefParameters } from '../../types'
import { calculateModel } from '../../utils/calculateModel'
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN } from '../../utils/modelContract'
import { uiToModelParams } from '../../utils/uiToModelTransform'

type SurfacePayload = {
  xVals: number[]
  yVals: number[]
  zGrid: Array<Array<number | null>>
  currentZ: number | null
  computedAt: number
  nx: number
  ny: number
}

type ComputeMessage = {
  type: 'compute'
  token: number
  nx: number
  ny: number
  params: BeliefParameters
  useStd: boolean
  canonicalZ: number | null
}

type ResultMessage = { type: 'result'; token: number; payload: SurfacePayload; hasValid: boolean }

type ErrorMessage = { type: 'error'; token: number; message: string }

function linspace(min: number, max: number, n: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(n) || n <= 1) {
    return [min, max]
  }
  const step = (max - min) / (n - 1)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i += 1) out[i] = min + step * i
  return out
}

function safeZ(nextParams: BeliefParameters, modifiersAreStandardized: boolean): number | null {
  try {
    const result = calculateModel(uiToModelParams(nextParams), {
      modifiersAreStandardized,
      debug: false,
    })

    const z = result?.Z
    if (!Number.isFinite(z)) return null
    return z
  } catch {
    return null
  }
}

function computeSurface(msg: ComputeMessage): { payload: SurfacePayload; hasValid: boolean } {
  const { nx, ny, params, useStd, canonicalZ } = msg

  const xVals = linspace(PANEL_X_MIN, PANEL_X_MAX, nx)
  const yVals = linspace(PANEL_Y_MIN, PANEL_Y_MAX, ny)

  const zGrid: Array<Array<number | null>> = []
  let anyValid = false

  for (let j = 0; j < yVals.length; j += 1) {
    const y = yVals[j]
    const row: Array<number | null> = new Array(xVals.length)

    for (let i = 0; i < xVals.length; i += 1) {
      const x = xVals[i]
      const z = safeZ({ ...params, X: x, Y: y }, useStd)
      row[i] = z
      if (z != null) anyValid = true
    }

    zGrid.push(row)
  }

  const computedCurrent = safeZ(params, useStd)
  const currentZ = canonicalZ ?? computedCurrent

  return {
    payload: {
      xVals,
      yVals,
      zGrid,
      currentZ: Number.isFinite(currentZ as number) ? (currentZ as number) : null,
      computedAt: Date.now(),
      nx,
      ny,
    },
    hasValid: anyValid,
  }
}

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ComputeMessage>) => {
  const data = event.data
  if (!data || data.type !== 'compute') return

  try {
    const result = computeSurface(data)
    const message: ResultMessage = {
      type: 'result',
      token: data.token,
      payload: result.payload,
      hasValid: result.hasValid,
    }
    self.postMessage(message)
  } catch (err) {
    const message: ErrorMessage = {
      type: 'error',
      token: data.token,
      message: err instanceof Error ? err.message : 'Worker surface compute failed',
    }
    self.postMessage(message)
  }
}

export {}
