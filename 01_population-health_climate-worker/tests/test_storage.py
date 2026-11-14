"""PostgreSQL checks run when POSTGRES_TEST_URL points at a disposable database."""
import asyncio
import os

import pytest

from heat_safe.application import service as module, storage
from heat_safe import live_assistant


def test_qmark_compilation_preserves_literals():
    assert storage._postgres_sql("SELECT '?' AS literal, value FROM t WHERE id=? AND name='it''s ?'") == (
        "SELECT '?' AS literal, value FROM t WHERE id=%s AND name='it''s ?'")


def test_explicit_sqlite_path_ignores_cloud_url(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://unused/unused')
    with storage.connection(tmp_path / 'local.sqlite3') as db:
        assert db.execute('SELECT ? AS value', (7,)).fetchone()['value'] == 7


@pytest.mark.skipif(not os.getenv('POSTGRES_TEST_URL'), reason='No disposable PostgreSQL test URL')
def test_postgres_shared_case_and_assistant(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', os.environ['POSTGRES_TEST_URL'])
    storage.initialize()
    with storage.connection() as db:
        db.execute('TRUNCATE events, runs, cases, sessions, chat_threads, chat_messages, agent_runs RESTART IDENTITY CASCADE')

    calls = []

    async def graph(request, _url):
        calls.append(request['request_id'])
        await asyncio.sleep(0.03)
        return 200, {'crew_rest': {'planning_status': 'blocked', 'intervals': []},
                     'restart': {'status': 'blocked'}}, ['stubbed']

    monkeypatch.setattr(module, 'run_graph', graph)

    async def exercise():
        first, second = module.CaseService(), module.CaseService()
        await asyncio.gather(first.start(), second.start())
        assert first.read_case()['case_id'] == second.read_case()['case_id']
        body = {'action': 'issue', 'command_id': 'one', 'expected_version': 0, 'payload': {}}
        await asyncio.gather(first.command('P03', body), second.command('P03', body))
        view = second.read_case('P03')
        assert view['version'] == 1
        assert len(view['story']['events']) == 1
        assert len(first.runs()) == 2
        assert calls == [view['request']['request_id'].replace('-v1', '-v0'), view['request']['request_id']]
        await second.replay_unfinished()
        assert len(first.runs()) == 2
        with storage.connection() as db:
            db.execute("UPDATE runs SET status='processing' WHERE id=?", (first.runs()[0]['id'],))
        async with storage.run_lock(f"{view['case_id']}:1") as acquired:
            assert acquired
            await second.replay_unfinished()
            assert len(first.runs()) == 2
        await second.replay_unfinished()
        assert [run['status'] for run in first.runs()[:2]] == ['completed', 'interrupted']

    asyncio.run(exercise())
    key = 'test-case:P03'
    sid = live_assistant.thread_id(key)
    live_assistant.save_message(key, 'one', 'user', 'Test message')
    assert live_assistant.thread_id(key) == sid
    assert live_assistant.messages(key) == [{'id': 'one', 'author': 'user', 'text': 'Test message'}]
    with storage.connection() as db:
        assert db.execute('SELECT 1 AS value').fetchone()[0] == 1
    assert storage.ping()


def test_socket_url_preserves_password(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_HOST', '/cloudsql/project:region:instance')
    monkeypatch.setenv('DATABASE_NAME', 'preview')
    monkeypatch.setenv('DATABASE_USER', 'operator')
    monkeypatch.setenv('DATABASE_PASSWORD', 'a:@/b?c')
    from sqlalchemy.engine import make_url

    url = make_url(storage.database_url())
    assert url.password == 'a:@/b?c'
    assert url.query['host'] == '/cloudsql/project:region:instance'
    assert make_url(storage.adk_database_url()).drivername == 'postgresql+asyncpg'


def test_connection_error_omits_credentials(monkeypatch):
    marker = 'private-password-marker'
    monkeypatch.setenv('DATABASE_URL', f'postgresql://user:{marker}@localhost/db')

    def fail(_url):
        raise RuntimeError(f'failed to connect using {marker}')

    monkeypatch.setattr(storage, '_pool', fail)
    with pytest.raises(ConnectionError) as error:
        storage.connection()
    assert marker not in str(error.value)
