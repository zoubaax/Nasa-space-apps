import React, { useState } from 'react';
import EarthOrbitGlobe from './components/globe/EarthOrbitGlobe';
import { LanguageProvider } from './context/LanguageContext';

export default function App() {
  const [, setSelectedFarm] = useState(null);

  const handleLocationSelect = (locationData, telemetry) => {
    setSelectedFarm(locationData);
  };

  return (
    <LanguageProvider>
      <main className="relative w-screen h-screen overflow-hidden bg-black text-white">
        {/* 3D Earth Orbit Globe with Satellite Lock & Telemetry Discovery */}
        <EarthOrbitGlobe onLocationSelect={handleLocationSelect} />
      </main>
    </LanguageProvider>
  );
}
