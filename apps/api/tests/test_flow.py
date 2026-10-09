from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app, sessions
from app.models import DailySummary
from app.nutrition import calculate_gap

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean():
    sessions.clear()


def parse(message='日式 安静 一个人 1000 日元以内 附近', city='Tokyo', allergens=None, summary=True):
    sid = str(uuid4())
    response = client.post('/api/interpret', json={'sessionId':sid,'message':message,'location':{'city':city},'allergens':allergens or [],'dailySummary':{'proteinG':42,'targetProteinG':65,'sourceType':'fixture'} if summary else None})
    assert response.status_code == 200, response.json()
    return sid, response.json()['data']


def recommend(sid, enabled=True):
    response = client.post('/api/recommend',json={'sessionId':sid,'qlooEnabled':enabled})
    assert response.status_code == 200, response.json()
    return response.json()['data']

@pytest.mark.parametrize('ratio,expected',[(.699,'high_gap'),(.700,'medium_gap'),(.899,'medium_gap'),(.900,'low_attention')])
def test_attention_boundaries(ratio, expected):
    gap=calculate_gap(DailySummary(proteinG=ratio*100,targetProteinG=100))
    assert gap['level'] == expected


def test_primary_gap_and_missing_summary():
    assert calculate_gap(None)['level']=='unavailable'
    assert calculate_gap(DailySummary(proteinG=42,targetProteinG=65,fiberG=10,targetFiberG=25))['nutrient']=='fiber'


def test_flow_toggle_refine_preview():
    sid, parsed=parse()
    assert parsed['constraints']['budgetMax']==1000
    assert parsed['nutritionGap']['missingAmount']==23
    on=recommend(sid)
    off=recommend(sid,False)
    assert len(on['recommendations'])==3
    assert on['dataMode']=='fixture' and not on['qlooUsed']
    assert off['dataMode']=='baseline' and off['candidateSource']=='fixture'
    assert on['comparison']['candidateIds']==off['comparison']['candidateIds']
    assert on['comparison']['withTaste']!=on['comparison']['withoutTaste']
    refined=client.post('/api/refine',json={'sessionId':sid,'refinement':'再近一点'}).json()['data']
    assert refined['constraints']['maxWalkMinutes']==10
    assert len(refined['recommendations'])==2
    assert all(x['walkMinutes']<=10 for x in refined['recommendations'])
    item=refined['recommendations'][0]
    selected=client.post('/api/select',json={'sessionId':sid,'candidateId':item['candidateId']}).json()['data']
    assert selected['preview']['proteinG']==item['nutritionContribution']['proteinG']
    assert selected['preview']['price']==item['price']
    assert selected['recommendation']['candidateId']==item['candidateId']


def test_allergen_and_unknown_hard_filter():
    sid,_=parse(message='日式 1000 日元以内 附近',allergens=['peanut'])
    data=recommend(sid)
    ids=data['comparison']['candidateIds']
    assert 'demo-aki' not in ids and 'demo-unknown' not in ids
    assert all('peanut' not in x['allergens'] for x in data['recommendations'])


def test_spicy_and_budget_refinement():
    sid,_=parse(message='日式 1000 日元以内 附近')
    recommend(sid)
    data=client.post('/api/refine',json={'sessionId':sid,'refinement':'不要辣，更便宜'}).json()['data']
    assert data['constraints']['budgetMax']==800
    assert data['constraints']['excludeSpicy']
    assert 'demo-aki' not in data['comparison']['candidateIds']
    assert all(x['price']<=800 for x in data['recommendations'])


def test_empty_does_not_relax_allergens():
    sid,_=parse(message='日式 10 日元以内 附近',allergens=['peanut'])
    data=recommend(sid)
    assert not data['recommendations'] and data['emptyMessage']
    assert data['constraints']['allergens']==['peanut']


def test_location_and_currency_clarification():
    sid,p=parse(city='')
    assert p['needsClarification']
    assert client.post('/api/recommend',json={'sessionId':sid}).status_code==400
    sid,p=parse(message='日式 under 1000')
    assert p['needsClarification'] and p['constraints']['currency'] is None


def test_unknown_nutrition_not_fabricated():
    sid,p=parse(message='日式 1000 日元以内 附近',summary=False)
    assert p['nutritionGap']['level']=='unavailable'
    data=recommend(sid)
    sid2,_=parse(message='日式 1000 日元以内 附近')
    recommend(sid2)
    # inspect full eligible set directly for null fixture fields
    from app.ranking import rank
    s=sessions[sid2]
    all_items=rank(s['candidates'],s['parsed']['nutritionGap'],s['tasteOrder'],True,10)
    unknown=next(x for x in all_items if x['candidateId']=='demo-unknown')
    assert unknown['nutritionContribution']['proteinG'] is None


def test_session_delete_stale_selection_and_validation():
    sid,_=parse()
    recommend(sid)
    assert client.post('/api/select',json={'sessionId':sid,'candidateId':'not-real'}).status_code==409
    client.delete('/api/sessions/'+sid)
    assert client.post('/api/recommend',json={'sessionId':sid}).status_code==404
    bad=client.post('/api/interpret',json={'sessionId':str(uuid4()),'message':'','location':{'lat':35}})
    assert bad.status_code==422 and not bad.json()['ok']
    assert 'input' not in bad.json()['error']


def test_fixture_never_reports_live(monkeypatch):
    sid,_=parse()
    monkeypatch.setenv('DATA_MODE','live_qloo')
    response=client.post('/api/recommend',json={'sessionId':sid})
    assert response.status_code==503
    assert response.json()['error']['code']=='LIVE_NOT_IMPLEMENTED'


def test_fixture_location_scope():
    sid,_=parse(city='Paris')
    response=client.post('/api/recommend',json={'sessionId':sid})
    assert response.json()['error']['code']=='FIXTURE_LOCATION_UNSUPPORTED'
