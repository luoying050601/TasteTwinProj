import { useI18n } from '../i18n';
import type { Gender } from '../useAuth';
type TwinState = 'idle' | 'thinking' | 'happy';
export function twinAgeGroup(birthYear?: number | null, birthMonth?: number | null, now = new Date()) {
  if (!birthYear || !birthMonth) return 'adult';
  const age = now.getUTCFullYear() - birthYear - (now.getUTCMonth() + 1 < birthMonth ? 1 : 0);
  return age < 13 ? 'child' : age < 18 ? 'teen' : age < 60 ? 'adult' : 'senior';
}

/** Original farm companion drawn on a 32 × 40 pixel grid. */
export default function PixelTwin({ state = 'idle', gender = 'female', compact = false, birthYear, birthMonth }: { state?: TwinState; gender?: Gender; compact?: boolean; birthYear?: number | null; birthMonth?: number | null }) {
  const { t } = useI18n();
  const happy = state === 'happy';
  const ageGroup = twinAgeGroup(birthYear, birthMonth);
  const hair = ageGroup === 'senior' ? '#767e80' : '#493025';
  const hairLight = ageGroup === 'senior' ? '#c3cccb' : '#805338';
  const outfit = { child: '#b94e54', teen: '#287c8a', adult: '#698044', senior: '#985362' }[ageGroup];
  const outfitLight = { child: '#e9827d', teen: '#61b6be', adult: '#8ca05a', senior: '#cd8893' }[ageGroup];
  return <div data-age-group={ageGroup} data-gender={gender} className={`pixel-scene pixel-scene--${state}${compact ? ' pixel-scene--compact' : ''}`}>
    <svg className="pixel-twin" viewBox="0 0 32 40" role="img" aria-label={`${t('gender_' + gender)} · ${t('avatarAge_' + ageGroup)}${compact ? '' : ` · ${t(happy ? 'twinHappy' : state === 'thinking' ? 'twinThinking' : 'twinIdle')}`}`} shapeRendering="crispEdges">
      <ellipse cx="16" cy="38" rx="9" ry="1" fill="#7d824c" opacity=".3" />
      <g className="pixel-character">
        <g transform={ageGroup === 'child' ? 'translate(3 7.2) scale(.82)' : ageGroup === 'teen' ? 'translate(1.3 3) scale(.92)' : undefined}>
          {/* Hair bun and stepped silhouette. */}
          {gender === 'female' && <><path d="M19 2h6v2h2v5h-2v3h-6V9h-2V4h2Z" fill={hair} /><path d="M20 3h4v2h2v3h-2v2h-4V8h-2V5h2Z" fill={hairLight} /></>}
          <path d={gender === 'male' ? 'M9 8h14v3h3v8h-3v-4H9v4H6v-8h3Z' : gender === 'female' ? 'M9 7h12v1h3v3h2v11h-2v3H8v-2H6V12h1V9h2Z' : 'M9 7h12v2h3v3h2v10h-3v-7H9v7H6V12h1V9h2Z'} fill={hair} />
          <path d={gender === 'male' ? 'M10 9h12v3h2v3H8v-3h2Z' : gender === 'female' ? 'M10 8h10v1h3v3h1v10h-3v2H9v-3H8V12h2Z' : 'M10 8h10v2h3v3h1v6h-2v-6H10v6H8v-7h2Z'} fill={hairLight} />
          <path d="M10 13h12v9h-2v2h-8v-2h-2Z" fill="#f1be8f" />
          <path d="M10 13h12v2h-2v-3h-3v3h-3v-2h-2v4h-2Z" fill={hair} />
          <path d="M12 15h8v7h-2v1h-4v-1h-2Z" fill="#ffdbad" />
          {/* Flower hair clip. */}
          {gender === 'female' && <><path d="M23 9h2v2h2v2h-2v2h-2v-2h-2v-2h2Z" fill="#fff3cd" /><rect x="23" y="11" width="2" height="2" fill="#d3a33c" /></>}
          <g className="pixel-eyes" fill="#493025">
            {happy ? <path d="M12 18h1v-1h2v1h1v1h-1v-1h-2v1h-1Zm6 0h1v-1h2v1h1v1h-1v-1h-2v1h-1Z" /> : <><rect x="13" y="17" width="2" height="3" /><rect x="19" y="17" width="2" height="3" /></>}
          </g>
          {ageGroup === 'senior' && <g fill="none" stroke="#526468" strokeWidth=".7"><rect x="11.5" y="16.5" width="5" height="4" /><rect x="18" y="16.5" width="5" height="4" /><path d="M16.5 18h1.5" /></g>}
          <g fill="#e59173"><rect x="11" y="20" width="3" height="1" /><rect x="20" y="20" width="3" height="1" /></g>
          {happy ? <path d="M15 20h4v2h-1v1h-2v-1h-1Z" fill="#ab5543" /> : <path d="M16 21h3v1h-3Z" fill="#ab5543" />}
          {/* Cream shirt, green apron and dark boots. */}
          <path d="M11 24h11v2h3v6h-3v3H10v-3H7v-6h4Z" fill="#493025" />
          <path d="M11 25h11v2h2v4h-3v3H11v-3H8v-4h3Z" fill="#f6e3b1" />
          <path d="M12 25h2v4h5v-4h2v10H11v-6h1Z" fill={outfit} />
          <path d="M13 30h6v4h-6Z" fill={outfitLight} />
          <path d="M15 30h2v1h1v2h-4v-2h1Z" fill="#e2dbaa" />
          <rect x="8" y="30" width="3" height="3" fill="#f1be8f" />
          <rect x="22" y="30" width="3" height="3" fill="#f1be8f" />
          <path d="M12 35h3v3h-4v-2h1Zm6 0h3v1h1v2h-4Z" fill="#68412e" />
          <path d="M11 37h4v1h-4Zm7 0h4v1h-4Z" fill="#493025" />
          {happy && <g fill="#d7a445"><path d="M3 8h1v2h2v1H4v2H3v-2H1v-1h2Z" /><path d="M29 19h1v2h2v1h-2v2h-1v-2h-2v-1h2Z" /></g>}
        </g>
      </g>
    </svg>
    {!compact && <span className="pixel-name">TASTE TWIN · {t(state)}</span>}
  </div>;
}
