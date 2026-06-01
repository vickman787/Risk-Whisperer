'use client';

const LOGO_URL = 'https://raw.createusercontent.com/ef83fbea-b45f-4d4d-8f71-c23d5eb0a565/';

export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0D0D0D',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      {/* Logo with pulsing ring */}
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <img
          src={LOGO_URL}
          alt="Risk Whisperer"
          style={{ width: 80, height: 80, borderRadius: 16, display: 'block' }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16,
            backgroundColor: 'rgba(59,130,246,0.2)',
            animation: 'logoPulse 1.8s ease-in-out infinite',
          }}
        />
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 18, margin: 0 }}>Risk Whisperer</p>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>Mantle RWA AI Agent</p>
      </div>

      {/* Animated dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#3B82F6',
              display: 'inline-block',
              animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes logoPulse {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(1.25); opacity: 0; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
