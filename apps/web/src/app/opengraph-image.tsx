import { ImageResponse } from 'next/og';

export const alt = 'Risk Whisperer - AI x RWA on Mantle';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #07110f 0%, #0b1220 48%, #111827 100%)',
          color: '#f8fafc',
          padding: 64,
          fontFamily: 'Inter, Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -120,
            width: 440,
            height: 440,
            borderRadius: 440,
            background: 'rgba(37, 99, 235, 0.28)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -160,
            bottom: -190,
            width: 520,
            height: 520,
            borderRadius: 520,
            background: 'rgba(16, 185, 129, 0.22)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 22, position: 'relative' }}>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: 24,
              background: '#020617',
              border: '1px solid rgba(96, 165, 250, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 48px rgba(37, 99, 235, 0.35)',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                border: '3px solid #38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#67e8f9',
                fontSize: 28,
                fontWeight: 900,
              }}
            >
              RW
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>Risk Whisperer</div>
            <div style={{ fontSize: 22, color: '#a7f3d0' }}>Mantle RWA AI Agent</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 18px',
              borderRadius: 999,
              border: '1px solid rgba(52, 211, 153, 0.45)',
              color: '#86efac',
              fontSize: 22,
              fontWeight: 700,
              background: 'rgba(6, 78, 59, 0.32)',
              alignSelf: 'flex-start',
            }}
          >
            AI x RWA
          </div>
          <div
            style={{
              fontSize: 76,
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: 0,
              maxWidth: 880,
            }}
          >
            Dynamic yield strategies for USDY and mETH
          </div>
          <div style={{ fontSize: 30, color: '#cbd5e1', maxWidth: 930, lineHeight: 1.28 }}>
            Automated risk management built for Mantle&apos;s RWA infrastructure, with transparent
            AI recommendation logs.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, position: 'relative' }}>
          {['mETH risk controls', 'USDY peg monitoring', 'OpenRouter AI', 'DeFiLlama data'].map(
            (item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  padding: '12px 18px',
                  borderRadius: 18,
                  background: 'rgba(15, 23, 42, 0.78)',
                  border: '1px solid rgba(148, 163, 184, 0.26)',
                  color: '#e2e8f0',
                  fontSize: 20,
                  fontWeight: 650,
                }}
              >
                {item}
              </div>
            )
          )}
        </div>
      </div>
    ),
    size
  );
}
