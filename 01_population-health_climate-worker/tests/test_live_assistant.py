"""Conversation storage and request scoping, without model or cloud calls."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from heat_safe import live_assistant as assistant


class Service:
    def actor_from_request(self, request):
        return request.cookies.get('actor')

    def read_case(self, actor):
        return {'case_id': 'case-1', 'version': 3, 'clock': '2025-08-04T08:00:00+04:00', 'story': {}}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('HEAT_SAFE_LOCAL_DIR', str(tmp_path))
    app = FastAPI()
    app.state.service = Service()
    app.include_router(assistant.router)
    with TestClient(app) as client:
        yield client


def test_history_requires_signed_in_persona(client):
    assert client.get('/api/chat/history').status_code == 401
    assert client.post('/api/chat', json={'case_id': 'case-1', 'message': 'Hello'}).status_code == 401


def test_history_is_persistent_and_scoped_by_case_and_persona(client):
    assistant.save_message('case-1:P03', 'first', 'assistant', 'Maya’s answer', {'sources': []})
    assistant.save_message('case-1:C05', 'second', 'assistant', 'Rana’s answer')
    client.cookies.set('actor', 'C05')
    messages = client.get('/api/chat/history').json()['messages']
    assert [m['text'] for m in messages] == ['Rana’s answer']
    assert client.delete('/api/chat/history').status_code == 200
    assert client.get('/api/chat/history').json()['messages'] == []
    client.cookies.set('actor', 'P03')
    assert client.get('/api/chat/history').json()['messages'][0]['text'] == 'Maya’s answer'


def test_mismatched_case_never_invokes_model(client):
    client.cookies.set('actor', 'P03')
    result = client.post('/api/chat', json={'case_id': 'old-case', 'message': 'What next?'})
    assert result.status_code == 409


def test_message_retries_do_not_duplicate_records(client):
    assistant.save_message('case-1:P03', 'same', 'user', 'Question')
    assistant.save_message('case-1:P03', 'same', 'user', 'Question')
    assert len(assistant.messages('case-1:P03')) == 1
    assert assistant.thread_id('case-1:P03') == assistant.thread_id('case-1:P03')
