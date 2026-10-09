import json
from pathlib import Path

DEFAULT_LOCALE = 'en-US'
DICTIONARIES = {p.stem: json.loads(p.read_text()) for p in Path(__file__).with_name('locales').glob('*.json')}

def normalize_locale(value: str):
    language = value.split(',')[0].split(';')[0].strip().lower()
    if language.startswith('ja'): return 'ja-JP'
    if language.startswith('zh'): return 'zh-CN'
    return DEFAULT_LOCALE

def text(locale: str, key: str, **values):
    dictionary = DICTIONARIES.get(locale, DICTIONARIES[DEFAULT_LOCALE])
    return dictionary.get(key, DICTIONARIES[DEFAULT_LOCALE].get(key, key)).format(**values)

def localize_recommendation(item, locale, gap=None):
    result = dict(item)
    if item['provenance']['place'] != 'fixture': return result
    result['placeName'] = text(locale, item['candidateId']+'.place')
    result['menuName'] = text(locale, item['candidateId']+'.menu')
    rank = {'demo-sora':1,'demo-hana':2,'demo-mori':3,'demo-aki':4,'demo-unknown':5}[item['candidateId']]
    taste_reason = text(locale,'baselineReason') if item['tasteFit']=='unavailable' else text(locale,'tasteReason',rank=rank)
    nutrient = (gap or {}).get('nutrient')
    key = {'protein':'proteinG','fiber':'fiberG','fat':'fatG'}.get(nutrient)
    amount = item['nutritionContribution'].get(key) if key else None
    result['reason'] = [taste_reason, text(locale,'nutritionReason',amount=amount,nutrient=text(locale,nutrient)) if amount is not None else text(locale,'nutritionUnknown')]
    return result
