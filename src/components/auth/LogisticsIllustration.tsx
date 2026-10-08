import React from 'react';

interface LogisticsIllustrationProps {
  className?: string;
}

export function LogisticsIllustration({ className = 'w-full h-auto' }: LogisticsIllustrationProps) {
  return (
    <svg
      viewBox="0 0 620 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Ilustrasi Pergudangan & Logistik Distribusi HANTARAN"
    >
      <defs>
        {/* Soft Background Radial Gradient */}
        <radialGradient id="bgGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#d3e3fd" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#d3e3fd" stopOpacity="0" />
        </radialGradient>

        {/* Truck Body Gradient in Brand Colors */}
        <linearGradient id="truckBodyGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a73e8" />
          <stop offset="60%" stopColor="#0b57d0" />
          <stop offset="100%" stopColor="#0842a0" />
        </linearGradient>

        <linearGradient id="truckCabGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a73e8" />
          <stop offset="100%" stopColor="#0b57d0" />
        </linearGradient>

        {/* Soft Shadows */}
        <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#041e49" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* --- BACKGROUND CIRCLE GLOW --- */}
      <circle cx="280" cy="240" r="210" fill="url(#bgGlow)" />

      {/* Ground Line & Shadow */}
      <line x1="40" y1="440" x2="580" y2="440" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="80" y1="448" x2="340" y2="448" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />

      {/* --- WAREHOUSE ENVIRONMENT --- */}

      {/* Industrial Ceiling Lamp */}
      <line x1="130" y1="40" x2="130" y2="105" stroke="#64748b" strokeWidth="2.5" />
      <polygon points="110,120 150,120 140,105 120,105" fill="#475569" stroke="#334155" strokeWidth="1.5" />
      <ellipse cx="130" cy="120" rx="18" ry="4" fill="#fbbf24" fillOpacity="0.8" />
      {/* Light Cone */}
      <polygon points="130,122 70,220 190,220" fill="#fef3c7" fillOpacity="0.15" />

      {/* Ventilation Wall Louver */}
      <g opacity="0.85">
        <rect x="360" y="80" width="105" height="65" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
        <line x1="368" y1="95" x2="457" y2="95" stroke="#94a3b8" strokeWidth="2" />
        <line x1="368" y1="108" x2="457" y2="108" stroke="#94a3b8" strokeWidth="2" />
        <line x1="368" y1="121" x2="457" y2="121" stroke="#94a3b8" strokeWidth="2" />
        <line x1="368" y1="134" x2="457" y2="134" stroke="#94a3b8" strokeWidth="2" />
      </g>

      {/* Warehouse Metal Storage Racking */}
      <g opacity="0.95">
        {/* Vertical Uprights */}
        <rect x="115" y="125" width="10" height="270" fill="#64748b" rx="2" />
        <rect x="235" y="125" width="10" height="270" fill="#64748b" rx="2" />
        <rect x="330" y="125" width="10" height="270" fill="#64748b" rx="2" />

        {/* Shelving Beams (Blue / Indigo Accent) */}
        <rect x="110" y="185" width="235" height="10" fill="#0b57d0" rx="2" />
        <rect x="110" y="275" width="235" height="10" fill="#0b57d0" rx="2" />
        <rect x="110" y="365" width="235" height="10" fill="#0b57d0" rx="2" />

        {/* Cross Bracing Bars */}
        <line x1="125" y1="195" x2="235" y2="275" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="235" y1="195" x2="125" y2="275" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="245" y1="195" x2="330" y2="275" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="330" y1="195" x2="245" y2="275" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* Upper Shelf Cartons */}
        <rect x="135" y="135" width="45" height="50" rx="3" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="135" y1="150" x2="180" y2="150" stroke="#a5b4fc" strokeWidth="1.5" />
        <rect x="190" y="130" width="40" height="55" rx="3" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1.5" />
        <rect x="255" y="140" width="65" height="45" rx="3" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="287" y1="140" x2="287" y2="185" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />

        {/* Middle Shelf Cartons */}
        <rect x="250" y="215" width="75" height="60" rx="4" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.8" />
        {/* Label on middle box */}
        <rect x="260" y="235" width="25" height="16" rx="2" fill="#ffffff" />
        <line x1="264" y1="241" x2="280" y2="241" stroke="#4f46e5" strokeWidth="1.5" />
        <line x1="264" y1="245" x2="275" y2="245" stroke="#4f46e5" strokeWidth="1.5" />

        {/* Lower Shelf Cartons */}
        <rect x="250" y="305" width="80" height="60" rx="4" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.8" />
        <rect x="260" y="325" width="22" height="14" rx="2" fill="#ffffff" />
      </g>

      {/* Secondary Stock Boxes behind Truck */}
      <g>
        <rect x="375" y="210" width="75" height="65" rx="4" fill="#ede9fe" stroke="#7c3aed" strokeWidth="1.8" />
        <rect x="388" y="228" width="25" height="16" rx="2" fill="#ffffff" />
        <line x1="392" y1="234" x2="408" y2="234" stroke="#7c3aed" strokeWidth="1.5" />
        <line x1="392" y1="238" x2="404" y2="238" stroke="#7c3aed" strokeWidth="1.5" />
      </g>

      {/* --- DELIVERY TRUCK (BRAND COLOR #0b57d0) --- */}
      <g filter="url(#softShadow)">
        {/* Truck Shadow */}
        <ellipse cx="440" cy="442" rx="140" ry="12" fill="#0f172a" fillOpacity="0.22" />

        {/* Truck Cargo Box */}
        <rect x="360" y="175" width="210" height="235" rx="10" fill="#f8fafc" stroke="#0b57d0" strokeWidth="3" />
        <rect x="365" y="180" width="200" height="225" rx="6" fill="#eff6ff" />
        {/* Cargo Box Panel Lines */}
        <line x1="365" y1="235" x2="565" y2="235" stroke="#bfdbfe" strokeWidth="1.5" />
        <line x1="365" y1="290" x2="565" y2="290" stroke="#bfdbfe" strokeWidth="1.5" />
        <line x1="365" y1="345" x2="565" y2="345" stroke="#bfdbfe" strokeWidth="1.5" />

        {/* Interior Cargo Box (Open Section) */}
        <path d="M375 220 L445 220 L445 390 L375 390 Z" fill="#1e293b" opacity="0.08" />
        
        {/* Interior Packed Boxes */}
        <rect x="380" y="325" width="55" height="65" rx="3" fill="#fed7aa" stroke="#ea580c" strokeWidth="1.5" />
        <line x1="380" y1="350" x2="435" y2="350" stroke="#ea580c" strokeWidth="1.5" />
        <rect x="385" y="270" width="45" height="55" rx="3" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />

        {/* Truck Cabin (Blue #0b57d0) */}
        <path
          d="M330 240 
             C345 240, 360 250, 360 270 
             L360 410 
             L290 410 
             L290 330 
             C290 315, 300 280, 315 255 
             Z"
          fill="url(#truckCabGrad)"
          stroke="#0842a0"
          strokeWidth="3"
        />

        {/* Front Hood Extension */}
        <path
          d="M290 330 
             L240 340 
             C230 342, 225 352, 225 362 
             L225 410 
             L290 410 
             Z"
          fill="url(#truckCabGrad)"
          stroke="#0842a0"
          strokeWidth="3"
        />

        {/* Windshield Glass */}
        <path
          d="M322 252 
             L350 252 
             L350 315 
             L285 315 
             C298 290, 310 265, 322 252 Z"
          fill="#c2e7ff"
          stroke="#0b57d0"
          strokeWidth="2"
        />
        {/* Windshield Reflection */}
        <path d="M330 258 L340 258 L310 310 L300 310 Z" fill="#ffffff" fillOpacity="0.6" />

        {/* Driver Cabin Door Line */}
        <path d="M295 322 L355 322 L355 400 L295 400 Z" fill="none" stroke="#0842a0" strokeWidth="1.8" />
        {/* Door Handle */}
        <rect x="335" y="350" width="14" height="4" rx="2" fill="#ffffff" />

        {/* Front Headlight (Yellow Beam) */}
        <path d="M225 365 L232 365 L232 385 L225 385 Z" fill="#fde047" stroke="#ca8a04" strokeWidth="1.5" />
        <ellipse cx="218" cy="375" rx="8" ry="12" fill="#fef08a" fillOpacity="0.4" />

        {/* Truck Front Grille & Bumper */}
        <rect x="220" y="390" width="12" height="22" rx="2" fill="#334155" />
        <line x1="222" y1="395" x2="230" y2="395" stroke="#64748b" strokeWidth="1.5" />
        <line x1="222" y1="400" x2="230" y2="400" stroke="#64748b" strokeWidth="1.5" />
        <line x1="222" y1="405" x2="230" y2="405" stroke="#64748b" strokeWidth="1.5" />

        {/* Front Bumper */}
        <rect x="215" y="408" width="55" height="14" rx="3" fill="#1e293b" />

        {/* Side Mirror */}
        <rect x="278" y="305" width="7" height="15" rx="2" fill="#0842a0" stroke="#ffffff" strokeWidth="1" />
        <line x1="285" y1="312" x2="295" y2="315" stroke="#0842a0" strokeWidth="2" />

        {/* Truck Wheels (Front & Rear) */}
        {/* Front Wheel */}
        <g>
          {/* Wheel Arch */}
          <path d="M250 415 A28 28 0 0 1 306 415" fill="#f8fafc" stroke="#0842a0" strokeWidth="3" />
          <circle cx="278" cy="425" r="24" fill="#0f172a" stroke="#334155" strokeWidth="2" />
          <circle cx="278" cy="425" r="14" fill="#94a3b8" />
          <circle cx="278" cy="425" r="6" fill="#0f172a" />
          {/* Rim Details */}
          <circle cx="278" cy="416" r="1.5" fill="#ffffff" />
          <circle cx="278" cy="434" r="1.5" fill="#ffffff" />
          <circle cx="269" cy="425" r="1.5" fill="#ffffff" />
          <circle cx="287" cy="425" r="1.5" fill="#ffffff" />
        </g>

        {/* Rear Wheel (Cargo) */}
        <g>
          {/* Wheel Arch */}
          <path d="M470 415 A30 30 0 0 1 530 415" fill="#f8fafc" stroke="#0b57d0" strokeWidth="3" />
          <circle cx="500" cy="425" r="26" fill="#0f172a" stroke="#334155" strokeWidth="2" />
          <circle cx="500" cy="425" r="16" fill="#94a3b8" />
          <circle cx="500" cy="425" r="7" fill="#0f172a" />
          {/* Rim Details */}
          <circle cx="500" cy="415" r="1.5" fill="#ffffff" />
          <circle cx="500" cy="435" r="1.5" fill="#ffffff" />
          <circle cx="490" cy="425" r="1.5" fill="#ffffff" />
          <circle cx="510" cy="425" r="1.5" fill="#ffffff" />
        </g>

        {/* Truck Branding / Text */}
        <g>
          <rect x="420" y="240" width="125" height="38" rx="6" fill="#0b57d0" />
          <text x="482" y="264" fill="#ffffff" fontSize="15" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="2">
            HANTARAN
          </text>
          <text x="482" y="273" fill="#d3e3fd" fontSize="7" fontWeight="700" fontFamily="sans-serif" textAnchor="middle" letterSpacing="0.5">
            LOGISTICS CA
          </text>
        </g>

        {/* Loading Ramp */}
        <polygon points="360,405 320,440 370,440" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />
      </g>

      {/* --- LOGISTICS COURIER / WAREHOUSE WORKER (BRAND COLOR #0b57d0) --- */}
      <g>
        {/* Courier Shadow */}
        <ellipse cx="145" cy="442" rx="42" ry="8" fill="#0f172a" fillOpacity="0.25" />

        {/* Back Leg / Foot */}
        <path d="M125 365 L115 425 L102 428 L100 435 L125 435 L135 375 Z" fill="#1e293b" />
        {/* Front Leg / Stepping Forward */}
        <path d="M148 355 L165 410 L175 425 L190 432 L160 435 L145 375 Z" fill="#334155" />

        {/* Courier Body (Blue Polo Shirt #0b57d0) */}
        <path
          d="M135 270 
             C155 265, 175 275, 185 295 
             L165 375 
             L130 370 
             L120 305 
             Z"
          fill="#0b57d0"
          stroke="#0842a0"
          strokeWidth="2"
        />

        {/* Belt */}
        <rect x="128" y="365" width="40" height="7" rx="1.5" fill="#0f172a" />
        <rect x="144" y="366" width="8" height="5" rx="1" fill="#cbd5e1" />

        {/* Head & Neck */}
        <path d="M145 255 L155 272 L142 272 Z" fill="#fcd34d" />
        <circle cx="152" cy="242" r="16" fill="#fed7aa" stroke="#f97316" strokeWidth="1" />

        {/* Courier Cap (Blue #0842a0 with Visor) */}
        <path d="M138 238 C140 226, 162 226, 168 238 Z" fill="#0842a0" stroke="#041e49" strokeWidth="1.5" />
        {/* Cap Visor pointing forward */}
        <path d="M152 238 L176 235 L174 241 L152 242 Z" fill="#041e49" />

        {/* Face Profile Details */}
        <ellipse cx="160" cy="244" rx="1.8" ry="2.2" fill="#1e293b" />
        <path d="M165 248 C163 252, 158 252, 156 250" stroke="#c2410c" strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* --- CARDBOARD BOX HELD IN ARMS (With Upward Arrows) --- */}
        <g transform="rotate(-6 195 330)">
          {/* Main Box */}
          <rect x="155" y="295" width="85" height="70" rx="4" fill="#fed7aa" stroke="#ea580c" strokeWidth="2.5" />
          
          {/* Packing Tape Strip */}
          <line x1="197" y1="295" x2="197" y2="365" stroke="#f97316" strokeWidth="9" />
          <line x1="197" y1="295" x2="197" y2="365" stroke="#fdba74" strokeWidth="5" />

          {/* "This Way Up" Arrows (Black) */}
          <g transform="translate(165, 312)">
            {/* Arrow 1 */}
            <path d="M6 18 L6 4 M3 7 L6 2 L9 7" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="2" y1="21" x2="10" y2="21" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />

            {/* Arrow 2 */}
            <path d="M18 18 L18 4 M15 7 L18 2 L21 7" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="14" y1="21" x2="22" y2="21" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Fragile Glass Icon or Barcode */}
          <rect x="210" y="315" width="22" height="15" rx="2" fill="#ffffff" stroke="#9a3412" strokeWidth="1" />
          <line x1="214" y1="319" x2="228" y2="319" stroke="#1e293b" strokeWidth="1.2" />
          <line x1="214" y1="323" x2="225" y2="323" stroke="#1e293b" strokeWidth="1.2" />
        </g>

        {/* Courier Arms Hugging the Box */}
        {/* Left Arm (Behind) */}
        <path d="M135 285 L160 325 L180 330" stroke="#0842a0" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="180" cy="330" r="7" fill="#fed7aa" />

        {/* Right Arm (Forefront Wrapping Around Box) */}
        <path d="M155 285 L185 320 L220 335 L225 348" stroke="#0b57d0" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="225" cy="348" r="8" fill="#fed7aa" />
      </g>

      {/* --- FLOATING LOGISTICS ACCENTS (MODERN TECH SAAS FEEL) --- */}
      {/* Motion Sparks & Stars */}
      <circle cx="85" cy="190" r="3" fill="#0b57d0" />
      <circle cx="210" cy="100" r="2.5" fill="#3b82f6" />
      <circle cx="560" cy="140" r="3.5" fill="#6366f1" />
      <circle cx="590" cy="280" r="2.5" fill="#0b57d0" />

      {/* Modern Badge / Tag Floating */}
      <g opacity="0.95" transform="translate(40, 260)">
        <rect x="0" y="0" width="85" height="32" rx="16" fill="#ffffff" stroke="#d3e3fd" strokeWidth="1.5" filter="url(#softShadow)" />
        <circle cx="16" cy="16" r="6" fill="#137333" />
        <path d="M13 16 L15 18 L19 14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <text x="28" y="20" fill="#041e49" fontSize="10" fontWeight="700" fontFamily="sans-serif">
          Ready Antar
        </text>
      </g>
    </svg>
  );
}
export default LogisticsIllustration;
