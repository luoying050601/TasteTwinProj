type TwinState = 'idle' | 'thinking' | 'happy';

/** Original farm companion drawn on a 32 × 40 pixel grid. */
export default function PixelTwin({state = 'idle'}: {state?: TwinState}) {
  const happy = state === 'happy';
  return <div className={`pixel-scene pixel-scene--${state}`}>
    <svg className="pixel-twin" viewBox="0 0 32 40" role="img" aria-label={happy ? '开心的像素农场伙伴' : state === 'thinking' ? '思考中的像素农场伙伴' : '穿绿色围裙的像素农场伙伴'} shapeRendering="crispEdges">
      <ellipse cx="16" cy="38" rx="9" ry="1" fill="#7d824c" opacity=".3"/>
      <g className="pixel-character">
        {/* Hair bun and stepped silhouette. */}
        <path d="M19 2h6v2h2v5h-2v3h-6V9h-2V4h2Z" fill="#493025"/>
        <path d="M20 3h4v2h2v3h-2v2h-4V8h-2V5h2Z" fill="#865336"/>
        <path d="M9 7h12v1h3v3h2v11h-2v3H8v-2H6V12h1V9h2Z" fill="#493025"/>
        <path d="M10 8h10v1h3v3h1v10h-3v2H9v-3H8V12h2Z" fill="#805338"/>
        <path d="M10 13h12v9h-2v2h-8v-2h-2Z" fill="#f1be8f"/>
        <path d="M10 13h12v2h-2v-3h-3v3h-3v-2h-2v4h-2Z" fill="#493025"/>
        <path d="M12 15h8v7h-2v1h-4v-1h-2Z" fill="#ffdbad"/>
        {/* Flower hair clip. */}
        <path d="M23 9h2v2h2v2h-2v2h-2v-2h-2v-2h2Z" fill="#fff3cd"/>
        <rect x="23" y="11" width="2" height="2" fill="#d3a33c"/>
        <g className="pixel-eyes" fill="#493025">
          {happy ? <path d="M12 18h1v-1h2v1h1v1h-1v-1h-2v1h-1Zm6 0h1v-1h2v1h1v1h-1v-1h-2v1h-1Z"/> : <><rect x="13" y="17" width="2" height="3"/><rect x="19" y="17" width="2" height="3"/></>}
        </g>
        <g fill="#e59173"><rect x="11" y="20" width="3" height="1"/><rect x="20" y="20" width="3" height="1"/></g>
        {happy ? <path d="M15 20h4v2h-1v1h-2v-1h-1Z" fill="#ab5543"/> : <path d="M16 21h3v1h-3Z" fill="#ab5543"/>}
        {/* Cream shirt, green apron and dark boots. */}
        <path d="M11 24h11v2h3v6h-3v3H10v-3H7v-6h4Z" fill="#493025"/>
        <path d="M11 25h11v2h2v4h-3v3H11v-3H8v-4h3Z" fill="#f6e3b1"/>
        <path d="M12 25h2v4h5v-4h2v10H11v-6h1Z" fill="#698044"/>
        <path d="M13 30h6v4h-6Z" fill="#8ca05a"/>
        <path d="M15 30h2v1h1v2h-4v-2h1Z" fill="#e2dbaa"/>
        <rect x="8" y="30" width="3" height="3" fill="#f1be8f"/>
        <rect x="22" y="30" width="3" height="3" fill="#f1be8f"/>
        <path d="M12 35h3v3h-4v-2h1Zm6 0h3v1h1v2h-4Z" fill="#68412e"/>
        <path d="M11 37h4v1h-4Zm7 0h4v1h-4Z" fill="#493025"/>
        {happy && <g fill="#d7a445"><path d="M3 8h1v2h2v1H4v2H3v-2H1v-1h2Z"/><path d="M29 19h1v2h2v1h-2v2h-1v-2h-2v-1h2Z"/></g>}
      </g>
    </svg>
    <span className="pixel-name">TASTE TWIN · {happy ? '选好啦' : state === 'thinking' ? '想一想' : '陪你选餐'}</span>
  </div>;
}
