import { useSurface3DSurfaceModel, type Props } from './Surface3DSurfaceModel'
import Surface3DSurfaceView from './Surface3DSurfaceView'

export default function Surface3DSurface(props: Props) {
  const model = useSurface3DSurfaceModel(props)
  return <Surface3DSurfaceView model={model} />
}
