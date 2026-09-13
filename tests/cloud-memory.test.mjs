import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('cloud memory persists imports and enforces account and brain boundaries in PostgreSQL', async () => {
  const db = new PGlite();
  const alice = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const bob = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${alice}'), ('${bob}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    const migration = await readFile(
      new URL('../supabase/migrations/001_cloud_memory.sql', import.meta.url),
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration); // Safe to retry the setup, without replacing user data.
    const researchMigration = await readFile(
      new URL('../supabase/migrations/002_research_queue.sql', import.meta.url),
      'utf8',
    );
    await db.exec(researchMigration);
    const asUser = async (uid) => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
        uid,
      ]);
    };
    const api = async (path, body = null) =>
      (
        await db.query('select public.continuum_api($1, $2::jsonb) as value', [
          path,
          body === null ? null : JSON.stringify(body),
        ])
      ).rows[0].value;
    await asUser(alice);
    const brain = await api('brains', {
      name: 'Jarvis',
      direction: 'Useful observations',
    });
    const otherBrain = await api('brains', { name: 'Astrology' });
    const item = {
      title: 'Feedback loops',
      body: 'Feedback connects observations to experiments.',
      origin: 'file:notes.md',
      metadata: { file_name: 'notes.md', page: 2 },
    };
    const saved = await api(`brains/${brain.id}/imports`, item);
    assert.equal(saved.status, 'imported');
    const duplicate = await api(`brains/${brain.id}/imports`, {
      ...item,
      title: 'Renamed duplicate',
    });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(duplicate.source_id, saved.source_id);
    assert.equal((await api(`brains/${otherBrain.id}`)).sources.length, 0);
    assert.equal((await api(`brains/${brain.id}`)).sources[0].metadata.page, 2);
    await api(`brains/${brain.id}/sources`, {
      title: 'Second source',
      body: 'Feedback observations become experiments.',
    });
    const queued = await db.query(
      'select public.continuum_enqueue_research($1, $2) as result',
      [brain.id, saved.source_id],
    );
    assert.equal(queued.rows[0].result.queued, true);
    assert.equal(
      (await db.query('select * from public.continuum_jobs')).rows.length,
      1,
    );
    const researchSnapshot = (
      await db.query('select public.continuum_research_snapshot($1) as value', [
        brain.id,
      ])
    ).rows[0].value;
    assert.equal(researchSnapshot.worker_connected, true);
    assert.equal(researchSnapshot.pending, 1);
    assert.equal(
      (await api('brains')).find((b) => b.id === brain.id).source_count,
      2,
    );
    assert.equal(
      (
        await api(`brains/${brain.id}/import-status`, {
          source_ids: [saved.source_id],
        })
      )[0].status,
      'saved',
    );
    assert.equal(
      (
        await api(`brains/${otherBrain.id}/import-status`, {
          source_ids: [saved.source_id],
        })
      ).length,
      0,
    );
    const answer = await api(`brains/${brain.id}/ask`, {
      question: 'feedback',
    });
    assert.equal(answer.citations[0].source_id, saved.source_id);
    assert.match(answer.answer, /retrieval/i);
    assert.equal(
      (await api(`brains/${otherBrain.id}/ask`, { question: 'feedback' }))
        .citations.length,
      0,
    );
    const fork = await api(`brains/${brain.id}/fork`, {
      name: 'Research fork',
      direction: 'Experiments',
    });
    const forkData = await api(`brains/${fork.id}`);
    assert.equal(forkData.sources.length, 2);
    assert.notEqual(forkData.sources[0].id, saved.source_id);
    await api(`brains/${brain.id}/sources`, {
      title: 'New',
      body: 'New information only in the original.',
    });
    assert.equal((await api(`brains/${fork.id}`)).sources.length, 2);
    assert.equal((await api(`brains/${brain.id}`)).sources.length, 3);
    await assert.rejects(
      api(`brains/${brain.id}/sources`, { title: 'Empty', body: '   ' }),
      /Source text/,
    );
    await assert.rejects(
      api(`brains/${brain.id}/sources`, {
        title: 'Too big',
        body: 'x'.repeat(200001),
      }),
      /200,000/,
    );
    await assert.rejects(
      api(`brains/${brain.id}/configure`, { active: true }),
      /worker/,
    );
    await assert.rejects(api(`brains/${brain.id}/experiments`, {}), /local/);

    await asUser(bob);
    assert.deepEqual(await api('brains'), []);
    assert.equal(
      (await db.query('select * from public.continuum_sources')).rows.length,
      0,
    );
    await assert.rejects(api(`brains/${brain.id}`), /not found/);
    await assert.rejects(api(`brains/${brain.id}/imports`, item), /not found/);
    await assert.rejects(
      api(`brains/${brain.id}/fork`, { name: 'Stolen' }),
      /not found/,
    );
    await assert.rejects(
      api(`brains/${brain.id}/ask`, { question: 'feedback' }),
      /not found/,
    );
    await assert.rejects(
      db.query(
        'insert into public.continuum_sources (brain_id, owner_id, title, body) values ($1,$2,$3,$4)',
        [brain.id, alice, 'Injected', 'Not allowed'],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        'insert into public.continuum_sources (brain_id, title, body) values ($1,$2,$3)',
        [brain.id, 'Injected', 'Not allowed'],
      ),
      /foreign key/,
    );
    assert.equal(
      (
        await db.query(
          "update public.continuum_brains set name='Changed' where id=$1 returning id",
          [brain.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query('delete from public.continuum_sources'),
      /permission denied/,
    );

    await db.exec('reset role; set role anon;');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    assert.equal(
      (await db.query('select public.continuum_schema_status() as status'))
        .rows[0].status.version,
      1,
    );
    await assert.rejects(api('brains'), /permission denied/);
    await assert.rejects(
      db.query('select * from public.continuum_sources'),
      /permission denied/,
    );
    await asUser(alice);
    assert.equal((await api(`brains/${brain.id}`)).sources.length, 3);
    assert.equal((await api(`brains/${brain.id}`)).worker_connected, false);
  } finally {
    await db.close();
  }
});
