'use client';
export default function AuthBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-success/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[...Array(30)].map((_, i) => {
          const x = ((i * 37) % 100);
          const y = ((i * 53) % 100);
          const size = 0.15 + (i % 3) * 0.1;
          return (
            <circle key={i} cx={x} cy={y} r={size} fill="#06b6d4" opacity="0.3">
              <animate attributeName="cy"
                values={`${y};${(y + 20) % 100};${y}`}
                dur={`${8 + (i % 4) * 3}s`}
                repeatCount="indefinite" />
              <animate attributeName="opacity"
                values="0.1;0.4;0.1"
                dur={`${3 + (i % 3) * 2}s`}
                repeatCount="indefinite" />
            </circle>
          );
        })}
      </svg>

      <svg className="absolute bottom-0 left-0 right-0 h-40 opacity-20" viewBox="0 0 1000 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="authChart" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path fill="none" stroke="url(#authChart)" strokeWidth="2" strokeLinecap="round"
          d="M0,120 Q100,90 200,100 T400,70 T600,90 T800,50 T1000,70">
          <animate attributeName="d" dur="10s" repeatCount="indefinite"
            values="M0,120 Q100,90 200,100 T400,70 T600,90 T800,50 T1000,70;
                    M0,100 Q100,120 200,80 T400,100 T600,70 T800,90 T1000,60;
                    M0,120 Q100,90 200,100 T400,70 T600,90 T800,50 T1000,70" />
        </path>
      </svg>
    </div>
  );
}
