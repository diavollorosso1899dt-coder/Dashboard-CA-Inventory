import React from 'react';

interface SpeedingCarLogoProps {
  className?: string;
}

export function SpeedingCarLogo({ className = 'h-5 w-5' }: SpeedingCarLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Logo 2D Mobil Melaju HANTARAN"
    >
      {/* 2D Speed Motion Trails */}
      <path d="M1 8h3" />
      <path d="M0.5 12h4.5" />
      <path d="M2 16h2.5" />

      {/* Aerodynamic Speeding Car / Van Silhouette */}
      <path d="M7 8.5h5.5l3.5 4h5a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 1-1 1h-1.5" />
      <path d="M7 18H5.5a1.5 1.5 0 0 1-1.5-1.5v-6a2 2 0 0 1 2-2h1" />

      {/* Windshield / Cab Glass */}
      <path d="M12.5 9v3.5h3.5" />

      {/* Front Headlight Accent */}
      <path d="M22 14.5h1" />

      {/* Wheels */}
      <circle cx="9" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </svg>
  );
}
