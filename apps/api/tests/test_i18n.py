import re
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app.i18n import DICTIONARIES

client=TestClient(app)

def test_dictionary_keys_and_placeholders_match():
    en=DICTIONARIES['en-US']
    for locale,dictionary in DICTIONARIES.items():
        assert set(dictionary)==set(en),locale
        for key in en:
            assert set(re.findall(r'\{(\w+)\}',en[key]))==set(re.findall(r'\{(\w+)\}',dictionary[key])),(locale,key)


def test_three_languages_complete_flow():
    for locale,sample in [('en-US','Japanese, quiet, solo, under 1000 JPY, nearby.'),('ja-JP','和食、静か、一人、1000円以内、近くで。'),('zh-CN','日式，安静，一个人，1000日元以内，附近')]:
        headers={'Accept-Language':locale}
        sid=str(uuid4())
        p=client.post('/api/interpret',headers=headers,json={'sessionId':sid,'message':sample,'locale':locale,'location':{'city':'Tokyo'},'dailySummary':{'proteinG':42,'targetProteinG':65,'sourceType':'fixture'}})
        assert p.status_code==200,p.json()
        c=p.json()['data']['constraints']
        assert c['cuisines']==['Japanese'] and c['ambience']==['quiet']
        assert c['partySize']==1 and c['budgetMax']==1000 and c['currency']=='JPY' and c['maxWalkMinutes']==15
        data=client.post('/api/recommend',headers=headers,json={'sessionId':sid}).json()['data']
        item=data['recommendations'][0]
        assert item['menuName']==DICTIONARIES[locale][item['candidateId']+'.menu']
        refinement={'en-US':'Closer','ja-JP':'もっと近く','zh-CN':'再近一点'}[locale]
        refined=client.post('/api/refine',headers=headers,json={'sessionId':sid,'refinement':refinement}).json()['data']
        assert refined['constraints']['maxWalkMinutes']==10
        assert len(refined['recommendations'])==2
        no_spicy={'en-US':'Not spicy','ja-JP':'辛くないもの','zh-CN':'不要辣'}[locale]
        response=client.post('/api/refine',headers=headers,json={'sessionId':sid,'refinement':no_spicy})
        assert response.status_code==200,response.json()
        assert response.json()['data']['constraints']['excludeSpicy']
        chosen=response.json()['data']['recommendations'][0]
        result=client.post('/api/select',headers=headers,json={'sessionId':sid,'candidateId':chosen['candidateId']}).json()['data']
        assert result['twinMessage']==DICTIONARIES[locale]['twinFeedback']
        assert result['preview']['price']==chosen['price']


def test_language_switch_does_not_change_candidates():
    sid=str(uuid4())
    client.post('/api/interpret',json={'sessionId':sid,'message':'Japanese under 1000 JPY nearby','location':{'city':'Tokyo'}})
    data=[]
    for locale in DICTIONARIES:
        response=client.post('/api/recommend',headers={'Accept-Language':locale},json={'sessionId':sid}).json()['data']
        data.append([(x['candidateId'],x['price'],x['nutritionContribution']) for x in response['recommendations']])
    assert data[0]==data[1]==data[2]


def test_errors_localized_and_body_not_echoed():
    for locale in DICTIONARIES:
        response=client.post('/api/interpret',headers={'Accept-Language':locale},json={'sessionId':str(uuid4()),'message':'test','private_note':'DO_NOT_REFLECT_THIS'})
        assert response.status_code==422
        assert response.json()['error']['message']==DICTIONARIES[locale]['VALIDATION_ERROR']
        assert 'DO_NOT_REFLECT_THIS' not in response.text
