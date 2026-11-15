"""Conversation storage and request scoping, without model or cloud calls."""
import inspect

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


@pytest.mark.parametrize('persona,has_what_if', [('P02', True), ('C01', True), ('P03', True), ('C05', False), ('C08', False)])
def test_only_supervisors_and_responders_get_the_what_if_tool(persona, has_what_if):
    from heat_safe.application.what_if import tools_for
    names = [tool.__name__ for tool in tools_for(persona, lambda: {}, 'http://solver')]
    assert names == (['what_if_crew_plan'] if has_what_if else [])


def test_case_agent_uses_the_persona_gate_and_says_nothing_is_applied():
    source = inspect.getsource(assistant.build_agent)
    assert 'tools_for(actor, current, service.solver_url)' in source and '*what_if' in source
    assert 'nothing was recorded or applied' in source


def test_message_retries_do_not_duplicate_records(client):
    assistant.save_message('case-1:P03', 'same', 'user', 'Question')
    assistant.save_message('case-1:P03', 'same', 'user', 'Question')
    assert len(assistant.messages('case-1:P03')) == 1
    assert assistant.thread_id('case-1:P03') == assistant.thread_id('case-1:P03')
