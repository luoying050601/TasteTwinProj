import type { Recommendation } from '../types';
import {useI18n} from '../i18n';
export function MealFacts({item}: {item: Recommendation}) {
 const {t}=useI18n();
 return <div className="facts"><span>¥{item.price} <small>{t('demoPrice')}</small></span><span>{t('minutes',{count:item.walkMinutes})} <small>{t('demoWalk')}</small></span><span>{item.nutritionContribution.proteinG == null ? t('unavailable') : `${item.nutritionContribution.proteinG} g`} <small>{t('demoNutrient',{name:t('protein')})}</small></span><span>{item.nutritionContribution.fiberG == null ? t('unavailable') : `${item.nutritionContribution.fiberG} g`} <small>{t('demoNutrient',{name:t('fiber')})}</small></span></div>;
}
export default function MealRow({item,disabled,onSelect}: {item:Recommendation;disabled:boolean;onSelect:(id:string)=>void}) {
 const {t}=useI18n();
 return <article className="meal"><div className="meal-rank">{String(item.rank).padStart(2,'0')}</div><div className="meal-main"><div className="meal-heading"><div><small>{item.provenance.place==='fixture'?t(item.candidateId+'.place'):item.placeName}</small><h3>{item.provenance.menu==='fixture'?t(item.candidateId+'.menu'):item.menuName}</h3></div><span className="taste">{t('tasteFit')} · {t(item.tasteFit)}</span></div><MealFacts item={item}/><details><summary>{t('sources')}</summary><p>{t('fixtureSources',{date:item.provenance.observedAt})}</p><p>{item.allergenStatus === 'unknown' ? t('unknownIngredients') : t('demoIngredients',{items:item.allergens.map(x=>t(x)).join(', ')})}</p></details></div><button disabled={disabled} onClick={()=>onSelect(item.candidateId)} className="choose">{t('chooseMeal')} ↗</button></article>;
}
