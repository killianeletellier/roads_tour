export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <rect width="64" height="64" rx="12" fill="#D14F8B" />
    <path d="M16 40 L32 16 L48 40" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="32" cy="44" r="4" fill="white" />
  </svg>
);

export const ManeuverIcon = ({ type, modifier }: { type: string; modifier?: string }) => {
  const rot = modifier === 'left' ? -90 : modifier === 'right' ? 90 : modifier === 'uturn' ? 180 : 0;
  if (type === 'arrive') {
    return (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#D14F8B" strokeWidth="3" />
        <circle cx="24" cy="24" r="6" fill="#D14F8B" />
      </svg>
    );
  }
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M24 8 L24 32 M24 32 L14 22 M24 32 L34 22" stroke="#11151C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const RoleIcon = ({ role }: { role: 'lead' | 'sweep' | 'door' | null }) => {
  const colors = { lead: '#D14F8B', sweep: '#2563eb', door: '#16a34a' };
  const labels = { lead: 'Tête', sweep: 'Balais', door: 'Ouvreuse' };
  if (!role) return null;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill={colors[role]} />
      <text x="14" y="18" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
        {labels[role][0]}
      </text>
    </svg>
  );
};

export const MicIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-1 4v2h-2v-2H9v2H7v-2a7 7 0 0010 0z" />
  </svg>
);

export const MapIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 6l7-2 8 2 7-2v14l-7 2-8-2-7 2V6z" />
    <path d="M8 4v14M16 6v14" />
  </svg>
);

export const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
