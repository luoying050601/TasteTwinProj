import {useEffect,useRef,useState} from 'react';
import PixelTwin from './PixelTwin';
import {useI18n} from '../i18n';
type Area='home'|'profile'|'today'|'discover'|'twin';
export default function KitchenRoom({open,busy,selection,vitality,onOpen}:{open:boolean;busy:boolean;selection:boolean;vitality:string;onOpen:(area:Area)=>void}){
 const {t}=useI18n();const room=useRef<HTMLDivElement>(null);const [position,setPosition]=useState({x:50,y:74});const [walking,setWalking]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function move(x:number,y:number){if(open||busy)return;const nextY=Math.max(64,Math.min(90,y));const nextX=Math.max(nextY>=76?36:12,Math.min(nextY>=76?68:88,x));setPosition({x:nextX,y:nextY});setWalking(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setWalking(false),650);}
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 function interact(area:Area,x:number,y:number){move(x,y);onOpen(area);}
 return <div ref={room} className={`play-room ${open?'play-room--open':''}`} role="region" aria-label={t('farmScene')} tabIndex={0} onKeyDown={e=>{if(open||busy)return;const shifts:Record<string,[number,number]>={ArrowLeft:[-3,0],ArrowRight:[3,0],ArrowUp:[0,-3],ArrowDown:[0,3],a:[-3,0],d:[3,0],w:[0,-3],s:[0,3]};const delta=shifts[e.key];if(delta){e.preventDefault();move(position.x+delta[0],position.y+delta[1]);}}}>
 <div className="room-wall" aria-hidden="true"/><div className="room-floor" aria-hidden="true"/><div className="room-skirt" aria-hidden="true"/>
 <div className="room-cabinets" aria-hidden="true"><i/><i/><i/></div><div className="room-counter" aria-hidden="true"><div className="room-stove"><i/><i/></div><div className="room-sink"/><div className="room-cup"/></div>
 <div className="room-daylight" aria-hidden="true"><i/><span/></div><div className="room-pot" aria-hidden="true"><i/><i/><i/></div><div className="room-rug" aria-hidden="true"/>
 <button className="furniture furniture-fridge" aria-label={t('profileTitle')} disabled={open||busy} onClick={()=>interact('profile',22,67)}><span className="fridge-freezer"/><span className="fridge-leaf"/><span className="object-caption">{t('profileTitle')}</span></button>
 <button className="furniture furniture-table" aria-label={t('todayTitle')} disabled={open||busy} onClick={()=>interact('today',34,77)}><span className="table-top"><span className="room-plate"><i/></span><span className="room-fork"/><span className="table-glass"/></span><span className="table-leg leg-one"/><span className="table-leg leg-two"/><span className="object-caption">{t('todayTitle')}</span></button>
 <button className="furniture furniture-map" aria-label={t('discoverTitle')} disabled={open||busy} onClick={()=>interact('discover',75,64)}><span className="map-paper"><i/><span className="map-pin"/></span><span className="object-caption">{t('discoverTitle')}</span></button>
 <button className="furniture furniture-journal" aria-label={t('twinTitle')} disabled={open||busy} onClick={()=>interact('twin',76,79)}><span className="journal-shelf"/><span className="journal-book"><i>♥</i></span><span className="object-caption">{t('twinTitle')}</span></button>
 <div className="walk-floor" aria-hidden="true" onPointerDown={e=>{const b=room.current!.getBoundingClientRect();move((e.clientX-b.left)/b.width*100,(e.clientY-b.top)/b.height*100);room.current?.focus();}}/>
 <div className={`room-avatar ${walking?'room-avatar--walking':''}`} style={{left:`${position.x}%`,top:`${position.y}%`}}><span className="avatar-hearts" aria-label={t('wellbeing.'+vitality)}>{vitality==='balanced'?'♥ ♥ ♥':vitality==='growing'?'♥ ♥ ♡':vitality==='low'?'♥ ♡ ♡':'♡ ♡ ♡'}</span><PixelTwin state={busy?'thinking':selection||vitality==='balanced'?'happy':'idle'}/></div>
 <span className="room-control-hint">{t('roomControls')}</span>
 </div>;
}
