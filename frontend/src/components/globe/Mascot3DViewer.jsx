import React, { useEffect, useState } from 'react';

export default function Mascot3DViewer({
  modelSrc = '/models/gardener.glb',
  className = '',
}) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Dynamically register Google's model-viewer web component
    if (typeof window !== 'undefined') {
      import('@google/model-viewer')
        .then(() => setIsReady(true))
        .catch((err) => console.warn('Could not register model-viewer:', err));
    }
  }, []);

  return (
    <div className={`relative w-full h-full flex items-center justify-center select-none ${className}`}>
      {isReady ? (
        <model-viewer
          src={modelSrc}
          alt="3D Cartoon Gardener Mascot"
          auto-rotate
          camera-controls
          autoplay
          shadow-intensity="1.5"
          shadow-softness="0.9"
          exposure="1.1"
          interaction-prompt="none"
          rotation-per-second="24deg"
          camera-orbit="0deg 75deg auto"
          min-camera-orbit="auto auto 50%"
          max-camera-orbit="auto auto 200%"
          touch-action="pan-y"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            outline: 'none',
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
