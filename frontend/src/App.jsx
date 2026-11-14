import React, { useState } from 'react';
import EarthOrbitGlobe from './components/globe/EarthOrbitGlobe';

export default function App() {
  const [, setSelectedFarm] = useState(null);

  const handleLocationSelect = (locationData, telemetry) => {
    console.log('Selected Farm Location & Environmental Telemetry:', locationData, telemetry);
    setSelectedFarm(locationData);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-white">
      {/* 3D Earth Orbit Globe with Satellite Lock & Telemetry Discovery */}
      <EarthOrbitGlobe onLocationSelect={handleLocationSelect} />
    </main>
  );
}
