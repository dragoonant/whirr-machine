import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'

const BOARD = 48 // inches; Recon tables are 36

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#14161a' }}>
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 40, 42], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 40, 10]} intensity={1.2} />
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[BOARD, BOARD]} />
          <meshStandardMaterial color="#3b3a33" />
        </mesh>
        <Grid args={[BOARD, BOARD]} position-y={0.01} cellSize={1} sectionSize={6} cellColor="#4a4840" sectionColor="#c9a227" fadeDistance={200} />
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
      <div data-testid="title" style={{ position: 'absolute', top: 12, left: 16, color: '#c9a227', font: '600 20px system-ui' }}>
        Whirr Machine — M0
      </div>
    </div>
  )
}
