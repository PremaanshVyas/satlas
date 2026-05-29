// Full-screen maintenance gate. Rendered (in place of the whole app) when the
// VITE_MAINTENANCE env var is set to '1'. Used while the satellite catalog is being
// refreshed — e.g. during the Space-Track reinstatement window when our CloudFront
// cache has no valid catalog to serve. Flip it off (remove the env var + redeploy)
// once the catalog is loading again.
export default function Maintenance() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center"
      style={{
        background:
          'radial-gradient(circle at 50% 35%, #0b1a2f 0%, #050a14 55%, #02040a 100%)',
        color: '#e6f1ff',
      }}
    >
      {/* Orbiting dot motif — a quiet nod to the globe that normally lives here */}
      <div className="relative mb-10 h-28 w-28">
        <div className="absolute inset-0 rounded-full border border-cyan-400/20" />
        <div className="absolute inset-3 rounded-full border border-cyan-400/10" />
        <div
          className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300"
          style={{ boxShadow: '0 0 18px 4px rgba(103,232,249,0.7)', animation: 'satlas-pulse 1.8s ease-in-out infinite' }}
        />
      </div>

      <h1 className="mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Satlas is performing maintenance
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-cyan-100/70 sm:text-base">
        We&rsquo;re refreshing the live satellite catalog. The 3D globe will be back online
        shortly — thanks for your patience.
      </p>

      <a
        href="/docs"
        className="mt-8 rounded-full border border-cyan-400/30 px-5 py-2 text-sm text-cyan-200/90 transition hover:border-cyan-300/60 hover:text-cyan-100"
      >
        View the API docs in the meantime
      </a>

      <style>{`
        @keyframes satlas-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 1;   }
          50%      { transform: translate(-50%, -50%) scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
