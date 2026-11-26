import React from 'react';

/**
 * Seamlessly blended 3D-rotating copper/terracotta AI head centerpiece
 * without borders, badges, or text overlays.
 */
export default function ContourHero({ compact = false }) {
  return (
    <div
      className={`relative flex items-center justify-center select-none pointer-events-none ${
        compact ? 'opacity-20 scale-95' : 'opacity-85'
      }`}
    >
      {/* Soft ambient copper & honey-gold glow */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          width: compact ? '280px' : '380px',
          height: compact ? '280px' : '380px',
          background:
            'radial-gradient(circle at 45% 55%, rgba(252, 211, 77, 0.2), rgba(234, 88, 12, 0.16) 45%, transparent 75%)',
        }}
      />

      {/* Borderless, edge-feathered 3D rotating head that melts into the background */}
      <div
        className={`relative animate-head-3d ${
          compact ? 'w-56 h-56' : 'w-72 h-72 md:w-88 md:h-88'
        }`}
        style={{
          WebkitMaskImage:
            'radial-gradient(ellipse 68% 72% at 50% 48%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.65) 52%, rgba(0,0,0,0) 76%)',
          maskImage:
            'radial-gradient(ellipse 68% 72% at 50% 48%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.65) 52%, rgba(0,0,0,0) 76%)',
        }}
      >
        <img
          src="/ai-head.jpg"
          alt=""
          className="w-full h-full object-cover object-center mix-blend-lighten contrast-115 saturate-110"
        />
      </div>
    </div>
  );
}
