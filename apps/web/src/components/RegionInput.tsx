import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Search, MapPin } from 'lucide-react';
import { useI18n } from '../i18n';

type Region = { id: string; value: string; detail: string };
const endpoint = (import.meta.env.VITE_GEOCODER_URL || 'https://photon.komoot.io').replace(/\/$/, '');

export default function RegionInput({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
    const { locale, t } = useI18n();
    const [regions, setRegions] = useState<Region[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [active, setActive] = useState(-1);
    const [searching, setSearching] = useState(false);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);
    const [query, setQuery] = useState<string | null>(null);
    const sequence = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const cache = useRef(new Map<string, Region[]>());
    const alive = useRef(false);

    function cancel() { sequence.current++; controller.current?.abort(); setSearching(false); setLocating(false); }
    useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; controller.current?.abort(); }; }, []);
    function parseRegions(data: unknown): Region[] {
        if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) throw new Error('Invalid region response');
        const result: Region[] = [];
        for (const feature of data.features) {
            const properties = feature?.properties;
            if (!properties || typeof properties !== 'object') continue;
            const parts = [properties.name, properties.city, properties.state].filter((part): part is string => typeof part === 'string' && !!part.trim());
            const unique = [...new Set(parts)];
            if (!unique.length) continue;
            const regionValue = unique.join(', ').slice(0, 80);
            if (result.some(region => region.value === regionValue)) continue;
            let country = typeof properties.country === 'string' ? properties.country : '';
            if (typeof properties.countrycode === 'string' && /^[a-z]{2}$/i.test(properties.countrycode)) country = new Intl.DisplayNames([locale], { type: 'region' }).of(properties.countrycode.toUpperCase()) || country;
            result.push({ id: String(properties.osm_type || '') + String(properties.osm_id || result.length), value: regionValue, detail: country });
        }
        return result.slice(0, 5);
    }
    async function request(url: URL, signal: AbortSignal) {
        const response = await fetch(url, { signal, referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Region service unavailable');
        return parseRegions(await response.json());
    }
    async function search(text: string) {
        if (disabled || text.trim().length < 2) return;
        cancel(); const current = sequence.current;
        setError(''); setActive(-1); setExpanded(true); setSearched(false);
        const key = locale + ':' + text.trim();
        const cached = cache.current.get(key);
        if (cached) { setRegions(cached); setSearched(true); return; }
        setSearching(true); setRegions([]);
        const abort = new AbortController(); controller.current = abort;
        const timeout = window.setTimeout(() => abort.abort(), 10000);
        try {
            const url = new URL(endpoint + '/api/'); url.searchParams.set('q', text.trim()); url.searchParams.set('limit', '5');
            for (const layer of ['city', 'district', 'locality', 'county', 'state']) url.searchParams.append('layer', layer);
            if (locale === 'en-US') url.searchParams.set('lang', 'en');
            let matches = await request(url, abort.signal);
            if (!alive.current || current !== sequence.current) return;
            if (!matches.length && locale === 'zh-CN') {
                const {Converter} = await import('opencc-js/cn2t');
                const converted = Converter({from:'cn',to:'t'})(text.trim());
                if (converted !== text.trim() && alive.current && current === sequence.current) {
                    url.searchParams.set('q',converted);
                    matches = await request(url,abort.signal);
                }
            }
            if (!alive.current || current !== sequence.current) return;
            if (cache.current.size >= 20) cache.current.delete(cache.current.keys().next().value!);
            cache.current.set(key, matches); setRegions(matches); setSearched(true);
        } catch { if (alive.current && current === sequence.current) { setError('region.unavailable'); setExpanded(false); } }
        finally { window.clearTimeout(timeout); if (alive.current && current === sequence.current) setSearching(false); }
    }
    useEffect(() => {
        if (query === null || query.trim().length < 2 || disabled) return;
        const timer = window.setTimeout(() => void search(query), 1000);
        return () => window.clearTimeout(timer);
    }, [query, locale, disabled]);
    function choose(region: Region) { cancel(); setQuery(null); onChange(region.value); setExpanded(false); setRegions([]); setError(''); input.current?.focus(); }
    function locate() {
        if (disabled) return;
        if (!navigator.geolocation) { setError('region.unsupported'); return; }
        cancel(); setQuery(null); setError(''); setExpanded(false); setLocating(true);
        const current = sequence.current;
        navigator.geolocation.getCurrentPosition(async position => {
            if (!alive.current || current !== sequence.current) return;
            const abort = new AbortController(); controller.current = abort;
            const timeout = window.setTimeout(() => abort.abort(), 10000);
            try {
                const url = new URL(endpoint + '/reverse/'); url.searchParams.set('lat', String(position.coords.latitude)); url.searchParams.set('lon', String(position.coords.longitude)); url.searchParams.set('limit', '1');
                url.searchParams.set('radius', '5'); url.searchParams.append('layer', 'city'); url.searchParams.append('layer', 'district');
                if (locale === 'en-US') url.searchParams.set('lang', 'en');
                const matches = await request(url, abort.signal);
                if (!alive.current || current !== sequence.current) return;
                if (!matches.length) { setError('region.noLocation'); return; }
                onChange(matches[0].value); setRegions([]); setSearched(false);
            } catch { if (alive.current && current === sequence.current) setError('region.unavailable'); }
            finally { window.clearTimeout(timeout); if (alive.current && current === sequence.current) setLocating(false); }
        }, reason => {
            if (!alive.current || current !== sequence.current) return;
            setLocating(false); setError(reason.code === 1 ? 'region.denied' : reason.code === 3 ? 'region.timeout' : 'region.noLocation');
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }
    return <div className="region-field">
        <label htmlFor="notebook-city">{t('region.label')}</label>
        <div className="region-controls"><input ref={input} id="notebook-city" role="combobox" aria-autocomplete="list" aria-expanded={expanded && regions.length > 0} aria-controls="notebook-regions" aria-activedescendant={expanded && active >= 0 ? `notebook-region-${active}` : undefined} value={value} maxLength={80} placeholder={t('region.placeholder')} disabled={disabled} autoComplete="off" onChange={event => { cancel(); onChange(event.target.value); setQuery(event.target.value); setRegions([]); setExpanded(false); setError(''); setSearched(false); }} onKeyDown={event => {
            if (event.key === 'ArrowDown' && regions.length) { event.preventDefault(); event.stopPropagation(); setExpanded(true); setActive(previous => (previous + 1) % regions.length); }
            else if (event.key === 'ArrowUp' && regions.length) { event.preventDefault(); event.stopPropagation(); setExpanded(true); setActive(previous => (previous - 1 + regions.length) % regions.length); }
            else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (expanded && active >= 0) choose(regions[active]); else { setQuery(null); void search(value); } }
            else if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); setActive(-1); }
        }} /><button type="button" className="icon-button" aria-label={t('region.search')} title={t('region.search')} disabled={disabled || locating || value.trim().length < 2} onClick={() => { setQuery(null); void search(value); }}><Search size={18} /></button><button type="button" className="icon-button" aria-label={t('region.locate')} title={t('region.locate')} disabled={disabled || locating} onClick={locate}><LocateFixed size={18} /></button></div>
        {expanded && regions.length > 0 && <ul id="notebook-regions" className="region-results" role="listbox" aria-label={t('region.results')}>{regions.map((region, index) => <li key={region.id} id={`notebook-region-${index}`} role="option" aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => choose(region)}><MapPin size={16} /><span>{region.value}{region.detail && <small>{region.detail}</small>}</span></li>)}</ul>}
        {(searching || locating) && <p className="region-status" role="status">{t(locating ? 'region.locating' : 'region.searching')}</p>}
        {searched && expanded && !regions.length && !searching && <p className="region-status">{t('region.noResults')}</p>}
        {error && <p className="auth-error" role="alert">{t(error)}</p>}
        <small className="region-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a></small>
    </div>;
}