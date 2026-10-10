import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
try {
    await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
    for (const file of ['202610100001_basic_profiles.sql', '202610100002_user_notebook.sql']) {
        await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [owner, 'a@example.com', other, 'b@example.com']);
    async function asUser(user, sql, params = []) {
        await db.exec('set role authenticated');
        try { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); return await db.query(sql, params); }
        finally { await db.exec('reset role'); }
    }
    const insert = `insert into public.user_health_records
    (id,user_id,weight_kg,height_cm,body_fat_status,goal,chronotype,breakfast_habit,lunch_habit,dinner_habit)
    values ($1,$2,$3,165,'unknown','wellness','morning','often','often','sometimes') returning id,weight_kg,recorded_at`;
    const first = '33333333-3333-4333-8333-333333333333';
    const second = '44444444-4444-4444-8444-444444444444';
    await asUser(owner, insert, [first, owner, 60]);
    await asUser(owner, insert, [second, owner, 65]);
    const records = await asUser(owner, 'select id,weight_kg from public.user_health_records order by recorded_at desc,id desc');
    assert.equal(records.rows.length, 2); assert.equal(records.rows[0].id, second);
    assert.equal(Number(records.rows[1].weight_kg), 60);
    assert.equal((await asUser(other, 'select * from public.user_health_records')).rows.length, 0);
    await assert.rejects(asUser(other, insert, ['55555555-5555-4555-8555-555555555555', owner, 66]), /row-level security/);
    await assert.rejects(asUser(owner, 'update public.user_health_records set weight_kg=70 where id=$1', [first]), /permission denied/);
    await assert.rejects(asUser(owner, 'delete from public.user_health_records where id=$1', [first]), /permission denied/);
    await assert.rejects(asUser(owner, `insert into public.user_health_records
    (user_id,weight_kg,height_cm,body_fat_status,goal,chronotype,breakfast_habit,lunch_habit,dinner_habit,recorded_at)
    values ($1,60,165,'unknown','wellness','morning','often','often','often','2000-01-01')`, [owner]), /permission denied/);
    await asUser(owner, `insert into public.user_dietary_preferences(user_id,allergy_status,allergens)
    values ($1,'selected',array['tree_nut','mango'])`, [owner]);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610100003_notebook_city.sql', import.meta.url), 'utf8'));
    const originalPreferences = (await asUser(owner, 'select city,allergens from public.user_dietary_preferences')).rows[0];
    assert.equal(originalPreferences.city, ''); assert.deepEqual(originalPreferences.allergens, ['tree_nut', 'mango']);
    await asUser(owner, "update public.user_dietary_preferences set city='Tokyo' where user_id=$1", [owner]);
    assert.equal((await asUser(owner, 'select city from public.user_dietary_preferences')).rows[0].city, 'Tokyo');
    await assert.rejects(asUser(owner, "update public.user_dietary_preferences set city=$1 where user_id=$2", ['x'.repeat(81), owner]), /check constraint/);
    await asUser(owner, "update public.user_dietary_preferences set allergens=array['milk'] where user_id=$1", [owner]);
    assert.equal((await asUser(other, 'select * from public.user_dietary_preferences')).rows.length, 0);
    await assert.rejects(asUser(owner, "update public.user_dietary_preferences set allergy_status='none' where user_id=$1", [owner]), /check constraint/);
    await assert.rejects(asUser(owner, "update public.user_dietary_preferences set allergens=array['milk','milk'] where user_id=$1", [owner]), /check constraint/);
    await assert.rejects(asUser(owner, "update public.user_dietary_preferences set user_id=$1 where user_id=$2", [other, owner]), /permission denied/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.user_health_records'), /permission denied/);
    await assert.rejects(db.query('select * from public.user_dietary_preferences'), /permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as total from public.user_health_records')).rows[0].total, 2);
    assert.equal((await db.query('select count(*)::int as total from public.profiles')).rows[0].total, 2);
    console.log('Migrations, append-only health history, two-user RLS, anonymous denial and immutable timestamps: passed');
} finally { await db.close(); }