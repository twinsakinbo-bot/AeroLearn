/** Independent release acceptance, using only an unlinked disposable Supabase stack. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { chromium } from '@playwright/test'

const base = 'http://127.0.0.1:4324'
const evidence = resolve(process.env.QA_EVIDENCE || '.qa-evidence')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
mkdirSync(evidence, { recursive: true })
const rows = []
const note = (item, verdict, detail) => {
  rows.push({ item, verdict, detail })
  console.log(`${verdict} ${item}: ${detail}`)
}
const guard = async (name, action) => {
  try { note(name, 'PASS', await action()) }
  catch (e) {
    note(name, 'FAIL', e.message?.startsWith('QA:') ? e.message : e instanceof assert.AssertionError ? 'Expected and observed values differ' : e.name || 'Unexpected error')
    process.exitCode = 1
  }
}
const loopback = (raw, protocol, port) => {
  const url = new URL(raw)
  assert.ok(url.protocol === protocol && url.hostname === '127.0.0.1' && url.port === port, 'QA: Expected a loopback URL on the designated port')
  return url
}
const ok = ({ data, error }) => {
  assert.ok(!error, `QA: Local Supabase request failed (${error?.status || error?.code || 'unknown'})`)
  return data
}
const fixture = n => {
  const cents = 11 + 3 * n
  const packs = 2 + n % 5
  const expected = cents * packs
  return { n, cents, packs, expected, wrong: expected + 1 }
}
const letters = ['A','B','C','D']
const ordered = (n, expected) => {
  const options = [expected + 1, expected + 2, expected + 3]
  options.splice(n % 4, 0, expected)
  return Object.fromEntries(options.map((value, i) => [letters[i], String(value)]))
}
let app, browser, pool
let stage = 'preflight'
async function main() {
  assert.ok(!existsSync('supabase/.temp/project-ref') && !existsSync('.supabase/project.json'), 'QA: Refusing hosted project links')
  assert.ok(readdirSync('.').filter(x => /^\.env(?:\.|$)/.test(x)).every(x => x === '.env.example'), 'QA: Refusing local or production environment files in checkout')
  const cfg = JSON.parse(execFileSync('npx',['--yes','supabase@3.4.0','status','-o','json'],{ encoding:'utf8', stdio:['ignore','pipe','pipe'] }))
  loopback(cfg.API_URL,'http:','59321')
  loopback(cfg.DB_URL,'postgresql:','59322')
  const local = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } }
  pool = new pg.Pool({ connectionString: cfg.DB_URL })
  const admin = createClient(cfg.API_URL, cfg.SERVICE_ROLE_KEY,local)
  const accounts = new Map()
  for (const name of ['desktop','mobile','operator','admin-a','admin-b','teacher','unaffiliated','hardening','wallet','profile-version','daily','licences','badges','daily-cap','lic-a1','lic-a2']) {
    const email = `qa-${name}-${randomUUID().slice(0,8)}@example.invalid`
    const password = randomUUID() + '!Q9a'
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm:true })).user
    const profile = { role:'student', displayName:'Synthetic QA learner', onboardingCompleted:true, learningMode:'exam', examType:'WAEC', subjects:['Economics'], subscription:'free', xp:0, coins:0, streak:0, inventory:[] }
    assert.equal((await pool.query('update public.users set data=data || $2::jsonb where id=$1',[user.id, JSON.stringify(profile)])).rowCount,1)
    const apiClient = createClient(cfg.API_URL,cfg.ANON_KEY,local)
    const signIn = ok(await apiClient.auth.signInWithPassword({ email, password }))
    assert.equal(ok(await apiClient.auth.getUser()).user.id,user.id)
    accounts.set(name,{ email,password,uid:user.id,token:signIn.session.access_token,apiClient })
  }
  for(let n=1;n<=40;n++){
    const f=fixture(n)
    const options=ordered(n,f.expected)
    const correctAnswer=letters[n%4]
    await pool.query('insert into public.practice_questions(id,data) values($1,$2)',[`qa-econ-${n}`,{
      exam:'WAEC',subject:'Economics',year:2026,question:`QA case ${n}: if each pack costs ${f.cents} units, what do ${f.packs} packs cost?`,
      options,correctAnswer,explanation:`Worked QA ${n}: ${f.cents} × ${f.packs} = ${f.expected} units.`,source:'Synthetic QA only, not teaching content'
    }])
  }
  await pool.query('update institutional_private.controls set enabled=true')
  await pool.query('update institutional_private.licensing_controls set enabled=true where id=true')
  await pool.query('insert into institutional_private.operators(user_id) values($1)',[accounts.get('operator').uid])
  const env={ PATH:process.env.PATH, HOME:process.env.HOME, TMPDIR:process.env.RUNNER_TEMP || process.env.TMPDIR,
    NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SITE_URL:base, NEXT_PUBLIC_SUPABASE_URL:cfg.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:cfg.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY:cfg.SERVICE_ROLE_KEY,
    INSTITUTIONAL_MVP_ENABLED:'true', INSTITUTIONAL_LICENSING_ENABLED:'true', MOCK_DRAFT_REVIEW_ENABLED:'false', VERCEL_ENV:'preview' }
  stage='local app startup'
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','4324'],{env,stdio:'ignore'})
  let ready=false
  for(let i=0;i<90;i++){
    if(app.exitCode!==null) break
    try { if ((await fetch(base+'/auth/login',{signal:AbortSignal.timeout(3000)})).ok) { ready=true;break } } catch {}
    await wait(750)
  }
  assert.ok(ready,'QA: Loopback app did not respond')
  stage='browser runtime'
  browser=await chromium.launch()
  for(const [width, actor] of [[1280,'desktop'],[360,'mobile']]){
    const context=await browser.newContext({viewport:{width,height:900}})
    const page=await context.newPage()
    page.setDefaultTimeout(45_000)
    let authed=false, check='sign-in'
    const snap = name => page.screenshot({path:resolve(evidence,`${width}-${name}.png`)})
    const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'QA: Horizontal overflow')
    await guard(`learner ${width}px`,async()=>{
      try {
        const { email, password }=accounts.get(actor)
        await page.goto(base+'/auth/login')
        await page.locator('#email').fill(email)
        await page.locator('#password').fill(password)
        await page.getByRole('button',{name:'Sign in',exact:true}).click()
        await page.waitForURL(/\/app(?:\/|$)/)
        authed=true
        check='availability'
        await page.goto(base+'/app/mock-exams')
        await page.getByLabel('Exam type',{exact:true}).selectOption('WAEC')
        const econ=page.getByRole('button',{name:'Economics 40 available · 40 with explanations',exact:true})
        await econ.waitFor()
        assert.ok(await page.getByRole('button',{name:'Mathematics Unavailable',exact:true}).isDisabled())
        assert.equal(await page.getByRole('button',{name:'Review draft Mathematics'}).count(),0)
        await noOverflow()
        await snap('bank')
        note(`learner ${width}px login and bank`, 'PASS', 'Password sign-in; 40 Economics questions with explanations; draft Mathematics unavailable; bank fits viewport')
        await page.getByLabel('Activity length',{exact:true}).selectOption('revision')
        await econ.click()
        assert.equal(await econ.getAttribute('aria-pressed'),'true','QA: Economics subject was not selected after changing activity mode')
        check='timer and navigation'
        await page.getByRole('button',{name:'Start exam',exact:true}).click()
        await page.getByText('Question 1 of 8',{exact:false}).waitFor()
        const timer=page.getByRole('timer')
        const before=await timer.innerText()
        await wait(2100)
        const after=await timer.innerText()
        const seconds=t=>{const m=t.match(/^(\d+)m (\d+)s$/);assert.ok(m);return +m[1]*60 + +m[2]}
        assert.ok(seconds(after)<seconds(before),'QA: Timer did not decrease')
        const selected=[]
        for(let i=0;i<4;i++){
          const prompt=await page.getByText(/QA case \d+:/).innerText()
          const f=fixture(+prompt.match(/QA case (\d+):/)[1])
          const value=i===3 ? f.wrong : f.expected
          await page.getByRole('button',{name:new RegExp(`^[ABCD] ${value}$`)}).click()
          selected.push({ f,value })
          if(i<3) await page.getByRole('button',{name:'Next',exact:true}).click()
        }
        for(let i=0;i<3;i++) await page.getByRole('button',{name:'Previous',exact:true}).click()
        assert.match(await page.getByRole('button',{name:new RegExp(`^[ABCD] ${selected[0].value}$`)}).getAttribute('class'),/ring-accent/)
        await noOverflow()
        await snap('timer')
        note(`learner ${width}px timed practice`, 'PASS', `8 questions; countdown ${before} to ${after}; selection retained; no horizontal overflow`)
        check='submit and review'
        let submits=0
        page.on('request',req=>{ if(req.url()===base+'/api/mock-exams' && req.method()==='POST' && req.postDataJSON()?.action==='submit') submits++ })
        await page.getByRole('button',{name:'Submit exam',exact:true}).click()
        const dialog=page.getByRole('dialog',{name:'Submit exam?'})
        await dialog.getByText('4 of 8 answered.',{exact:false}).waitFor()
        await dialog.getByRole('button',{name:'Keep working'}).click()
        await page.getByRole('button',{name:'Submit exam',exact:true}).click()
        await dialog.getByRole('button',{name:'Confirm submission'}).click()
        await page.getByRole('heading',{name:'3 of 8 correct'}).waitFor()
        assert.equal(submits,1)
        assert.equal(await page.getByText('Worked explanation:',{exact:true}).count(),8)
        for(const {f} of selected) await page.getByText(`Worked QA ${f.n}: ${f.cents} × ${f.packs} = ${f.expected} units.`,{exact:false}).waitFor()
        await noOverflow()
        await snap('score-review')
        note(`learner ${width}px scoring and review`, 'PASS', '3/8 expected and observed; one submit; eight worked explanations')
        check='persistence'
        await page.getByRole('link',{name:'View progress and history'}).click()
        const entry=page.getByText('WAEC · Economics · 3/8',{exact:false})
        await entry.waitFor()
        await page.reload()
        await entry.waitFor()
        assert.equal(await entry.count(),1)
        await entry.click()
        await page.getByText('Worked QA',{exact:false}).first().waitFor()
        const profile=(await pool.query('select data from public.users where id=$1',[accounts.get(actor).uid])).rows[0].data
        assert.equal(profile.totalQuestionsAnswered,8)
        assert.equal(profile.totalQuestionsCorrect,3)
        await noOverflow()
        await snap('history')
        return `Auth, bank, countdown ${before} to ${after}, 3/8 expected and observed (3 correct, 1 wrong, 4 blank), eight explanations, one result after refresh, no horizontal overflow`
      } catch(e) {
        if(authed) await snap('failure').catch(()=>{})
        throw new Error(`QA: ${check}`,{cause:e})
      }
    })
    await context.close()
  }
  const request=async(actor,path,org,command)=>{
    const response=await fetch(base+path,{signal:AbortSignal.timeout(15_000),method:command?'POST':'GET',headers:{
      ...(actor ? {Authorization:`Bearer ${accounts.get(actor).token}`} : {}),
      ...(org?{'X-Institution-Id':org}:{}), ...(command?{'Content-Type':'application/json'}:{})
    },...(command?{body:JSON.stringify(command)}:{})})
    return {status:response.status,body:await response.json()}
  }
  const school=(actor,org)=>request(actor,'/api/institutional',org)
  const command=async(actor,action,org,payload)=>{
    const r=await request(actor,'/api/institutional',org,{action,institution_id:org,payload})
    assert.equal(r.status,200,`QA: ${action} returned ${r.status}; expected 200`)
    return r.body
  }
  const join=async(actor,org,role)=>{
    const {token}=await command('operator','invite_staff',org,{email:accounts.get(actor).email,role})
    return (await command(actor,'accept_invite',org,{token})).id
  }
  await guard('anonymous requests and unaffiliated identity',async()=>{
    assert.equal((await school(null,null)).status,401)
    assert.equal((await request(null,'/api/mock-exams',null,{action:'start',exam:'WAEC',subjects:['Economics'],mode:'revision',requestId:randomUUID()})).status,401)
    const r=await school('unaffiliated',null)
    assert.equal(r.status,200)
    assert.deepEqual(r.body.institutions,[])
    return 'Unauthenticated requests denied (401); signed-in non-member sees no schools'
  })
  stage='synthetic school setup'
  const a=(await command('operator','create_institution',null,{name:'QA Amber School'})).institution_id
  const b=(await command('operator','create_institution',null,{name:'QA Blue School'})).institution_id
  await join('admin-a',a,'school_admin')
  await join('admin-b',b,'school_admin')
  const teacherA=await join('teacher',a,'teacher'), teacherB=await join('teacher',b,'teacher')
  const cohortA=(await command('admin-a','create_cohort',a,{name:'QA Amber cohort'})).id
  const cohortB=(await command('admin-b','create_cohort',b,{name:'QA Blue cohort'})).id
  const memberA=(await command('operator','enroll_learner',a,{user_id:accounts.get('desktop').uid,alias:'QA-AMBER'})).id
  const memberB=(await command('operator','enroll_learner',b,{user_id:accounts.get('mobile').uid,alias:'QA-BLUE'})).id
  for(const [actor,org,cohort,ids] of [['admin-a',a,cohortA,[teacherA,memberA]],['admin-b',b,cohortB,[teacherB,memberB]]]) {
    for(const membership_id of ids) await command(actor,'assign_cohort',org,{membership_id,cohort_id:cohort})
  }
  await guard('cross-school isolation',async()=>{
    for(const [actor,org,foreign,member,notMember] of [['admin-a',a,b,memberA,memberB],['admin-b',b,a,memberB,memberA]]){
      const own=await school(actor,org),blocked=await school(actor,foreign)
      assert.equal(own.status,200)
      assert.equal(blocked.status,403)
      assert.ok(own.body.memberships.some(x=>x.id===member))
      assert.ok(own.body.memberships.every(x=>x.institution_id===org&&x.id!==notMember))
      assert.ok(own.body.cohorts.every(x=>x.institution_id===org))
    }
    assert.equal((await school('unaffiliated',a)).status,403)
    return 'Each school admin can see its own enrolled learner only; opposite school and non-member denied (403)'
  })
  await guard('staff revocation on unchanged session',async()=>{
    for(const org of [a,b]) assert.equal((await school('teacher',org)).status,200)
    await command('admin-a','revoke_member',a,{id:teacherA})
    assert.equal((await school('teacher',a)).status,403)
    const retained=await school('teacher',b)
    assert.equal(retained.status,200)
    assert.deepEqual(retained.body.cohorts.map(x=>x.id),[cohortB])
    return 'Same session lost Amber access immediately (403) and retained the assigned Blue cohort (200)'
  })
  // Independent hardening checks: normal synthetic workflows and passive grants inspection.
  // Time compression is only in the disposable fixture, never in application code.
  await command('operator','enroll_learner',a,{user_id:accounts.get('hardening').uid,alias:'QA-TIME'})
  const actor='hardening'
  const uid=accounts.get(actor).uid
  const mock=payload=>request(actor,'/api/mock-exams',null,payload)
  const status=(r,n)=>assert.equal(r.status,n,`QA: Expected HTTP ${n}, observed ${r.status}`)
  const expected=(key,actual,want)=>assert.deepEqual(actual,want,`QA: ${key} expected ${JSON.stringify(want)}, observed ${JSON.stringify(actual)}`)
  const moveClock=async(id,secondsPast)=>{
    const changed=await pool.query(`update mock_private.attempts
      set started_at=clock_timestamp()-(duration_seconds+$2)*interval '1 second',
          checkpoint_at=case when checkpoint_at is not null then clock_timestamp()-($2+1)*interval '1 second' end
      where id=$1 and user_id=$3`,[id,secondsPast,uid])
    assert.equal(changed.rowCount,1)
  }
  let full, publicAnswers
  await guard('full mock server deadline',async()=>{
    const r=await mock({action:'start',exam:'WAEC',subjects:['Economics'],mode:'full',requestId:randomUUID()})
    status(r,200)
    full=r.body
    expected('full item count',full.questions.length,40)
    expected('full mock class',full.assessmentType,'formative')
    expected('server deadline minus start',Date.parse(full.deadlineAt)-Date.parse(full.startedAt),2400000)
    const prompt=full.questions[0]
    const f=fixture(+prompt.question.match(/QA case (\d+):/)[1])
    publicAnswers={[prompt.id]:letters[f.n%4]}
    const backup=await mock({action:'checkpoint',attemptId:full.id,answers:publicAnswers})
    status(backup,200)
    expected('backed up',backup.body.result,true)
    await moveClock(full.id,10)
    const late=await mock({action:'checkpoint',attemptId:full.id,answers:publicAnswers})
    status(late,409)
    return 'Expected and observed: 40-minute server deadline, pre-deadline 200 and expired checkpoint 409'
  })
  await guard('full mock checkpoint persistence and retry',async()=>{
    assert.ok(full?.id && publicAnswers,'QA: Full fixture not established')
    const first=await mock({action:'submit',attemptId:full.id,answers:{}})
    status(first,200)
    const saved=first.body.result
    expected('checkpoint-backed score',saved.score,1)
    expected('checkpoint-backed answers',saved.answers,publicAnswers)
    expected('timing',saved.timing,'recovered')
    expected('formative report eligibility',saved.reportEligible,false)
    const before=(await pool.query('select data from public.users where id=$1',[uid])).rows[0].data
    const retry=await mock({action:'submit',attemptId:full.id,answers:{}})
    status(retry,200)
    assert.deepEqual(retry.body.result,saved,'QA: Retry did not return the identical saved result')
    const after=(await pool.query('select data from public.users where id=$1',[uid])).rows[0].data
    expected('XP and coins after retry',[after.xp,after.coins],[before.xp,before.coins])
    const count=await pool.query('select count(*)::int as n from public.quiz_results where id=$1',['mock:'+full.id])
    expected('number of durable results',count.rows[0].n,1)
    return 'Expected and observed: 1/40 from checkpoint despite blank resumed submission, formative only; identical retry, one durable result and no second reward'
  })
  await guard('trusted question boundary',async()=>{
    const apiConfig=JSON.parse(readFileSync('supabase/config.jsonc','utf8')).api
    expected('PostgREST exposed schemas',apiConfig.schemas,['public'])
    const q=(await pool.query(`
      select c.relrowsecurity as rls,
      has_schema_privilege('anon','mock_private','USAGE') as anon_schema,
      has_schema_privilege('authenticated','mock_private','USAGE') as learner_schema,
      has_table_privilege('anon',c.oid,'SELECT') as anon_read,
      has_table_privilege('authenticated',c.oid,'SELECT') as learner_read,
      has_function_privilege('authenticated','public.start_mock_attempt(uuid,text,jsonb,text,jsonb,boolean,uuid)','EXECUTE') as learner_issuance,
      has_function_privilege('service_role','public.start_mock_attempt(uuid,text,jsonb,text,jsonb,boolean,uuid)','EXECUTE') as service_issuance
      from pg_class c where c.oid='mock_private.assessment_questions'::regclass`)).rows[0]
    expected('trusted access rules',q,{rls:true,anon_schema:false,learner_schema:false,anon_read:false,learner_read:false,learner_issuance:false,service_issuance:true})
    const bank=ok(await accounts.get(actor).apiClient.from('mock_question_bank').select('id').eq('exam_key','WAEC'))
    expected('public Economics fixtures',bank.filter(x=>x.id.startsWith('qa-econ-')).length,40)
    expected('private IDs in formative bank',bank.filter(x=>x.id.startsWith('qa-trusted-')).length,0)
    return 'Expected and observed: RLS on; no learner/anonymous private schema or key-read grant, no learner issuance grant; service issuance enabled and formative bank has 40 fixtures'
  })
  await guard('trusted 120-second recovery window',async()=>{
    for(const [offset,want,eligible] of [[20,'recovered',true],[135,'expired',false]]){
      const id=`qa-trusted-${offset}`
      const question={publicationStatus:'approved',exam:'WAEC',subject:'Economics',question:`Independent trusted case: ${offset} plus eight is what?`,options:{A:String(offset+8),B:String(offset+7),C:String(offset+9),D:String(offset+10)},correctAnswer:'A',explanation:`Add eight to ${offset}.`}
      await pool.query('insert into mock_private.assessment_questions(id,data) values($1,$2)',[id,question])
      const requestId=randomUUID()
      const started=(await pool.query(`select public.start_mock_attempt($1,'WAEC','["Economics"]','trusted',$2,false,$3) as v`,[uid,JSON.stringify([{...question,id}]),requestId])).rows[0].v
      expected('server-issued classification',started.assessmentType,'trusted')
      status(await mock({action:'checkpoint',attemptId:requestId,answers:{[id]:'A'}}),200)
      await moveClock(requestId,offset)
      const response=await mock({action:'submit',attemptId:requestId,answers:{}})
      status(response,200)
      const v=response.body.result
      expected('trusted timing',v.timing,want)
      expected('trusted score from checkpoint',v.score,1)
      expected('trusted report eligibility',v.reportEligible,eligible)
      const rows=await pool.query('select count(*)::int as n from mock_private.verified_assessment_results where id=$1 and institution_id=$2',[requestId,a])
      expected('rows visible to private reporting',rows.rows[0].n,Number(eligible))
    }
    const bank=ok(await accounts.get(actor).apiClient.from('mock_question_bank').select('id').eq('exam_key','WAEC'))
    expected('issued trusted keys in formative bank',bank.filter(x=>x.id.startsWith('qa-trusted-')).length,0)
    return 'Expected and observed: at +20s, recovered 1/1 and reported; at +135s, expired 1/1 saved for review but not reported; neither private item in formative bank'
  })
  await guard('server-owned rewards and idempotency',async()=>{
    const q=(await pool.query(`select
      exists(select 1 from pg_trigger where tgname='reward_fields' and tgrelid='public.users'::regclass and tgenabled='O') as profile_guard,
      has_function_privilege('authenticated','public.retail_reward(uuid,text,jsonb)','EXECUTE') as learner_rpc,
      has_function_privilege('service_role','public.retail_reward(uuid,text,jsonb)','EXECUTE') as service_rpc`)).rows[0]
    expected('reward guard and grants',q,{profile_guard:true,learner_rpc:false,service_rpc:true})
    const lesson='qa-reward-lesson'
    await pool.query('insert into public.lessons(id,data) values($1,$2)',[lesson,{subject:'Economics',status:'published',topicTitle:'QA reward lesson'}])
    const profile=async()=>(await pool.query('select data from public.users where id=$1',[uid])).rows[0].data
    const before=await profile()
    const payload={action:'lesson',payload:{lesson}}
    const first=await request(actor,'/api/gamification/reward',null,payload)
    status(first,200)
    expected('first verified award',first.body,{xp:10,coins:5})
    const again=await request(actor,'/api/gamification/reward',null,payload)
    status(again,200)
    expected('duplicate claim',again.body,{duplicate:true})
    const after=await profile()
    expected('persisted reward delta',[after.xp-before.xp,after.coins-before.coins],[10,5])
    expected('completion entries',after.completedLessons.filter(x=>x===lesson).length,1)
    return 'Expected and observed: enabled profile guard, award RPC service-only, +10 XP/+5 coins once, second completion idempotent'
  })

  // Product-level independent additions for the profile-integrity follow-up.
  stage='profile follow-up'
  const rewardPath='/api/gamification/reward'
  const call=async(who,path,payload)=>{
    const r=await fetch(base+path,{
      signal:AbortSignal.timeout(65_000),
      method:payload===undefined?'GET':'POST',
      headers:{Authorization:'Bearer '+accounts.get(who).token,...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    })
    const body=await r.json()
    status(r,200)
    return body
  }
  const reward=(who,action,payload)=>call(who,rewardPath,{action,payload})
  const whoId=who=>accounts.get(who).uid
  const readProfile=async who=>{
    const r=await pool.query('select data,version from public.users where id=$1',[whoId(who)])
    assert.equal(r.rowCount,1)
    return r.rows[0]
  }
  const seedProfile=(who,data)=>pool.query('update public.users set data=data||$2::jsonb where id=$1',[whoId(who),JSON.stringify(data)])
  const seedLesson=id=>pool.query('insert into public.lessons(id,data) values($1,$2)',[id,{subject:'Economics',status:'published',topicTitle:'Independent synthetic lesson'}])
  const dayMs=86_400_000
  const lagosDate=t=>new Date(t+3_600_000).toISOString().slice(0,10)

  // Start real requests while a temporary synthetic fixture lock is held.
  // Confirm two database writers are actually queued before lifting the lock.
  const overlap=async(who,actions)=>{
    const blocker=await pool.connect()
    let pending, seen=0
    try {
      await blocker.query('begin')
      await blocker.query('select id from public.users where id=$1 for update',[whoId(who)])
      pending=Promise.allSettled(actions.map(a=>a()))
      for(let i=0;i<120;i++){
        const r=await pool.query(`with recursive waiting(pid) as (
            select $1::int
            union
            select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid))
          ) select count(*)::int-1 as n from waiting`,[blocker.processID])
        seen=r.rows[0].n
        if(seen>=2) break
        await wait(200)
      }
    } finally {
      try { await blocker.query('rollback') } finally { blocker.release() }
    }
    const results=await pending
    assert.ok(seen>=2,'QA: Infrastructure did not observe two overlapping profile writers')
    const error=results.find(x=>x.status==='rejected')
    if(error) throw error.reason
    return results.map(x=>x.value)
  }

  await guard('concurrent purchases and lesson rewards',async()=>{
    const w='wallet', lesson='qa-profile-race-lesson'
    await seedProfile(w,{coins:1000})
    await seedLesson(lesson)
    const [one,two,...claims]=await overlap(w,[
      ()=>reward(w,'purchase',{item:'gold_frame'}),
      ()=>reward(w,'purchase',{item:'sapphire_frame'}),
      ()=>reward(w,'lesson',{lesson}),()=>reward(w,'lesson',{lesson})
    ])
    assert.ok(Number.isInteger(one.balance)&&Number.isInteger(two.balance),'QA: Both purchases must return a balance')
    expected('lesson grants',claims.filter(x=>x.xp===10&&x.coins===5).length,1)
    expected('lesson duplicates',claims.filter(x=>x.duplicate===true).length,1)
    const {data:d}=await readProfile(w)
    expected('coins after both purchases plus one award',d.coins,1000-500-450+5)
    expected('XP',d.xp,10)
    expected('owned items',[...d.inventory].sort(),['gold_frame','sapphire_frame'])
    expected('completed lessons',d.completedLessons,[lesson])
    return 'Expected and observed: 1000−500−450+5 = 55 coins; 10 XP; both items persisted; one award and one duplicate after overlapping writers'
  })

  await guard('stale profile update rejection',async()=>{
    const w='profile-version'
    await seedProfile(w,{coins:600})
    const old=await readProfile(w)
    const purchase=await reward(w,'purchase',{item:'gold_frame'})
    expected('new purchase balance',purchase.balance,100)
    const after=await readProfile(w)
    expected('canonical version delta',Number(after.version)-Number(old.version),1)
    const patch=v=>pool.query("select * from public.doc_patch('users',$1,null,$2::jsonb,'[]'::jsonb,false,$3,true)",[whoId(w),JSON.stringify({displayName:'QA profile update'}),v])
    let code='success'
    try { await patch(old.version) } catch(e) { code=e.code??'unknown' }
    expected('stale write status',code,'40001')
    const unchanged=await readProfile(w)
    assert.deepEqual(unchanged,after,'QA: Rejected stale update changed the stored profile')
    await patch(after.version)
    const fresh=await readProfile(w)
    expected('fresh patch version delta',Number(fresh.version)-Number(after.version),1)
    expected('fresh patch and preserved purchase',[fresh.data.displayName,fresh.data.coins,fresh.data.inventory],['QA profile update',100,['gold_frame']])
    return 'Expected and observed: stale version rejected (40001), purchase and version unchanged; fresh patch succeeds and advances exactly one version'
  })

  await guard('duplicate login and quest rewards',async()=>{
    const w='daily'
    const now=Date.now(), today=lagosDate(now), twoDaysBack=lagosDate(now-2*dayMs)
    await seedProfile(w,{coins:25,inventory:['streak_freeze'],streak:4,longestStreak:4,lastActiveDate:twoDaysBack,lastLoginDate:twoDaysBack})
    for(let i=0;i<5;i++){const lesson='qa-profile-qualify-'+i;await seedLesson(lesson);await reward(w,'lesson',{lesson})}
    const before=await readProfile(w)
    expected('verified lesson fixture wallet',[before.data.coins,before.data.xp],[50,50])
    const login=()=>call(w,'/api/gamification/login',{})
    const loginPair=await overlap(w,[login,login])
    expected('login updated flags',loginPair.map(r=>r.updated).sort(),[false,true])
    expected('freeze used once',loginPair.filter(r=>r.usedFreeze===true).length,1)
    const claim=()=>call(w,'/api/gamification/claim',{type:'xp',tier:1})
    const claims=await overlap(w,[claim,claim])
    expected('quest coins',claims.map(r=>r.reward).sort((a,b)=>a-b),[0,20])
    expected('quest duplicates',claims.filter(r=>r.duplicate===true).length,1)
    const {data:d}=await readProfile(w)
    expected('daily profile outcome',[d.coins,d.xp,d.streak,d.lastActiveDate,d.lastLoginDate,d.inventory,d.quests.xpTier],[80,50,5,today,today,[],2])
    const ledger=(await pool.query("select event_key,coins from mock_private.reward_events where user_id=$1 and (event_key like 'login:%' or event_key like 'quest:%') order by event_key",[whoId(w)])).rows
    expected('daily and quest ledger',ledger,[{event_key:'login:'+today,coins:10},{event_key:'quest:xp:1',coins:20}])
    return 'Expected and observed: two logins grant +10 once and consume one freeze; two tier-1 claims grant +20 once; 50→80 coins, streak 4→5, quest tier 1→2'
  })

  await guard('concurrent licence extensions',async()=>{
    const w='licences'
    const anchor=Math.floor(Date.now()/1000)+11*86400
    await seedProfile(w,{subscription:'monthly',proExpiresAt:{__ts:{s:anchor,n:0}}})
    const planCodes=['monthly','term'].map(plan=>({plan,code:'AL'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}))
    for(const {plan,code} of planCodes){
      const hash=createHash('sha256').update(code).digest('hex')
      await pool.query("insert into public.licence_codes(id,plan_id,status) values($1,$2,'available')",[hash,plan])
    }
    const receipts=await overlap(w,planCodes.map(({code})=>()=>call(w,'/api/licences/redeem',{code})))
    expected('redemption success',receipts.map(r=>r.ok),[true,true])
    const days=receipts.map(r=>(Date.parse(r.expiresAt)-Date.parse(r.extendedFrom))/dayMs).sort((a,b)=>a-b)
    expected('successive added days',days,[30,90])
    const {data:d}=await readProfile(w)
    expected('final seconds after original expiry',d.proExpiresAt.__ts.s-anchor,120*86400)
    const r=await pool.query("select count(*)::int as n from public.licence_codes where redeemed_by=$1 and status='used'",[whoId(w)])
    expected('redeemed code rows',r.rows[0].n,2)
    return 'Expected and observed: overlapping 30- and 90-day redemptions both accepted, two redeemed rows, existing expiry extended by exactly 120 days'
  })

  const seedPractice=async(w,prefix,n)=>{
    const session=randomUUID()
    const items=Array.from({length:n},(_,i)=>({id:prefix+'-'+i,subject:'Economics',question:'Synthetic QA '+prefix+' item '+i,options:{A:'One',B:'Two',C:'Three',D:'Four'},correctAnswer:'A'}))
    await pool.query('select public.register_practice_session($1,$2,$3)',[whoId(w),session,JSON.stringify(items)])
    return items.map(x=>answer=>reward(w,'practice',{session,question:x.id,answer}))
  }

  await guard('verified quiz badge eligibility',async()=>{
    const w='badges'
    await pool.query('insert into public.quiz_results(id,data) values($1,$2)',['qa-legacy-normal-completion',{userId:whoId(w),subject:'Economics',source:'practice',score:2,totalQuestions:2}])
    const counts=async()=>{const r=await call(w,rewardPath);return [r.quizzes,r.perfect,r.legacy]}
    const context=await browser.newContext({viewport:{width:1280,height:900}})
    const page=await context.newPage()
    page.setDefaultTimeout(40_000)
    const badge=(label)=>page.getByRole('listitem').filter({has:page.getByText(label,{exact:true})})
    const openProgress=async()=>{await page.goto(base+'/app/progress');await page.getByText(/Quiz badges count server-verified results/).waitFor()}
    const state=async (label,earned)=>badge(label).getByText(earned?'Earned':label==='Quiz Taker'?'Complete your first quiz':'Get 100% on a quiz',{exact:true}).waitFor()
    try {
      await page.goto(base+'/auth/login')
      await page.locator('#email').fill(accounts.get(w).email)
      await page.locator('#password').fill(accounts.get(w).password)
      await page.getByRole('button',{name:'Sign in',exact:true}).click()
      await page.waitForURL(/\/app(?:\/|$)/)
      const more=await seedPractice(w,'nonperfect',2)
      await more[0]('A')
      expected('legacy and incomplete are not badges',await counts(),[0,0,1])
      await openProgress()
      await state('Quiz Taker',false)
      await state('Perfect Score',false)
      await more[1]('B')
      expected('one finished nonperfect quiz',await counts(),[1,0,1])
      await openProgress()
      await state('Quiz Taker',true)
      await state('Perfect Score',false)
      const perfect=await seedPractice(w,'exact',2)
      for(const answer of perfect) await answer('A')
      expected('two private-backed completions, one perfect',await counts(),[2,1,1])
      await openProgress()
      await state('Perfect Score',true)
    } finally {await context.close()}
    return 'Expected and observed: legacy perfect score and incomplete session unlock neither badge; 1/2 unlocks Quiz Taker only; a private-backed 2/2 unlocks Perfect Score; legacy remains separate'
  })

  await guard('Lagos daily reward boundary and cap',async()=>{
    const c=await pool.connect()
    try {
      await c.query('begin')
      const expectedCuts=[Date.parse('2026-11-14T23:00:00Z')/1000,Date.parse('2026-11-15T23:00:00Z')/1000,Date.parse('2026-11-15T23:00:00Z')/1000]
      for(const tz of ['America/Los_Angeles','Asia/Tokyo']){
        await c.query("select set_config('TimeZone',$1,true)",[tz])
        const r=await c.query(`select extract(epoch from mock_private.reward_day_start(x::timestamptz))::bigint as t
          from unnest($1::text[]) with ordinality as f(x,i) order by i`,
          [['2026-11-15T22:59:59Z','2026-11-15T23:00:00Z','2026-11-15T23:00:01Z']])
        expected('WAT midnight epoch with host timezone '+tz,r.rows.map(y=>Number(y.t)),expectedCuts)
      }
    } finally {try{await c.query('rollback')}finally{c.release()}}
    const w='daily-cap'
    const nowMs=Date.now()
    const stamp=Date.parse(lagosDate(nowMs)+'T00:00:00Z')-3600000
    await pool.query(`insert into mock_private.reward_events(user_id,event_key,xp,coins,created_at)
      select $1::uuid,'practice:qa-cap-new-'||n,10,5,$2::timestamptz from generate_series(1,99) n
      union all select $1::uuid,'practice:qa-cap-old-'||n,10,5,$3::timestamptz from generate_series(1,5) n`,
      [whoId(w),new Date(stamp),new Date(stamp-1000)])
    const quiz=await seedPractice(w,'at-cap',2)
    const allowed=await quiz[0]('A'),capped=await quiz[1]('A')
    expected('last rewarded answer',[allowed.xp,allowed.coins],[10,5])
    expected('over-cap correct answer pays no reward',[capped.xp,capped.coins],[0,0])
    const q=await call(w,rewardPath)
    expected('capped correct answer still counts for perfect quiz',[q.quizzes,q.perfect],[1,1])
    return 'Expected and observed: Lagos day rolls at 23:00 UTC in two different host time zones; prior-day events excluded; correct #100 awards +10 XP/+5 coins, #101 awards zero and still scores'
  })

  // P0-B business and acceptance scenarios, exercised only as ordinary synthetic actors.
  stage='P0-B licensing fixtures'
  const lpath='/api/institutional/licensing'
  const change=(w,schoolId,action,payload)=>request(w,lpath,schoolId,{action,institution_id:schoolId,payload})
  const read=(w,schoolId)=>request(w,lpath,schoolId)
  const mutate=async(w,schoolId,action,payload)=>{
    const out=await change(w,schoolId,action,payload)
    expected('licensing '+action+' HTTP',out.status,200)
    return out.body
  }
  const termState=async(w,schoolId,id)=>{
    const out=await read(w,schoolId)
    expected('dashboard HTTP',out.status,200)
    const t=out.body.terms.find(t=>t.id===id)
    assert.ok(t,'QA: term not in dashboard')
    return t
  }
  const capState=async(w,schoolId,id)=>{
    const t=await termState(w,schoolId,id)
    return [t.available,t.reserved,t.assigned,t.frozen,t.suspended]
  }
  const grants=async id=>(await pool.query('select count(*)::int n from public.institutional_grants where term_id=$1',[id])).rows[0].n
  const count=async id=>(await pool.query('select count(*)::int n from public.institutional_seats where term_id=$1',[id])).rows[0].n
  const events=async (id,action)=>(await pool.query('select count(*)::int n from public.institutional_license_events where term_id=$1 and action=$2',[id,action])).rows[0].n
  const now=Date.now(), end=now+2*dayMs
  const iso=n=>new Date(n).toISOString()
  const term=randomUUID()
  const price=(70_000+10*2_200)*100
  const cur={id:term,cohort_id:cohortA,starts_at:iso(now-3_600_000),ends_at:iso(end),seat_cap:35,quoted_minor:price,renewal_of:null}
  const receipt='QA-RECONCILIATION-001'
  const issue=(termId,quantity,expiresAt=now+dayMs)=>({id:randomUUID(),term_id:termId,quantity,expires_at:iso(expiresAt)})
  const cohortActor=async(w,org,admin,cohort,alias)=>{
    const m=(await command('operator','enroll_learner',org,{user_id:whoId(w),alias})).id
    await command(admin,'assign_cohort',org,{membership_id:m,cohort_id:cohort})
    return m
  }
  const learners=['lic-a1','lic-a2']
  const member=new Map()
  for(const [i,w] of learners.entries()) member.set(w,await cohortActor(w,a,'admin-a',cohortA,'QA-LIC-'+i))
  const holdRace=async (schoolId,actions)=>{
    const c=await pool.connect()
    let pending, overlapCount=0
    try {
      await c.query('begin')
      await c.query('select id from public.institutions where id=any($1::uuid[]) order by id for update',[Array.isArray(schoolId)?schoolId:[schoolId]])
      pending=Promise.allSettled(actions.map(fn=>fn()))
      for(let i=0;i<50;i++){
        const r=await pool.query(`with recursive waiting(pid) as (
          select $1::int union select a.pid from pg_stat_activity a
          join waiting w on w.pid=any(pg_blocking_pids(a.pid))
        ) select count(*)::int-1 as n from waiting`,[c.processID])
        overlapCount=r.rows[0].n
        if(overlapCount>=2)break
        await wait(200)
      }
    } finally {try{await c.query('rollback')}finally{c.release()}}
    const all=await pending
    assert.ok(overlapCount>=2,'QA: no pair of overlapping school term transactions observed')
    const fault=all.find(x=>x.status==='rejected')
    if(fault)throw fault.reason
    return all.map(x=>x.value)
  }

  await guard('B01 seat order and fixed quote',async()=>{
    await mutate('operator',a,'draft_term',cur)
    const draft=await termState('admin-a',a,term)
    expected('draft quote and capacity',[draft.state,Number(draft.quoted_minor),draft.currency,draft.seat_cap],['draft',9_200_000,'NGN',35])
    expected('draft pool and grants',[await count(term),await grants(term)],[0,0])
    const replay=await mutate('operator',a,'draft_term',cur)
    expected('exact draft replay',[replay.id===term,replay.replayed,await events(term,'draft_term')],[true,true,1])
    expected('repeat count',await count(term),0)
    return 'Expected and observed: 35 seats, NGN 92,000 recorded as 9,200,000 minor units, one draft after replay, zero usable seats. Rate-band approval remains external.'
  })

  await guard('B02 manual approval, then activation',async()=>{
    for(const w of ['admin-a','teacher','lic-a1']) status(await change(w,a,'approve_term',{id:term,approval_ref:receipt}),403)
    status(await change('operator',a,'activate_term',{id:term}),400)
    expected('pending pool',await count(term),0)
    await mutate('operator',a,'approve_term',{id:term,approval_ref:receipt})
    const t=await termState('admin-a',a,term)
    expected('approved authority and reference',[t.state,t.approval_ref,t.approved_by===whoId('operator'),Boolean(t.approved_at),await count(term)],['approved',receipt,true,true,0])
    status(await change('operator',a,'approve_term',{id:term,approval_ref:receipt}),400)
    await mutate('operator',a,'activate_term',{id:term})
    status(await change('operator',a,'activate_term',{id:term}),400)
    expected('approval and activation effects',[await count(term),await events(term,'approve_term'),await events(term,'activate_term')],[35,1,1])
    return 'Expected and observed: non-operators 403, no preapproval or approved-only seats; separate activation creates 35 once. Receipt reconciliation is operator attestation, not a built-in payment validation.'
  })

  let rawCodes, winner, loser, winGrant
  await guard('B03 bulk issuance and cap',async()=>{
    const spec=issue(term,30)
    const batch=await mutate('admin-a',a,'issue_batch',spec)
    rawCodes=batch.codes
    expected('distinct delivered codes',new Set(rawCodes.map(x=>x.code)).size,30)
    expected('after bulk issue',await capState('admin-a',a,term),[5,30,0,0,0])
    const reply=await mutate('admin-a',a,'issue_batch',spec)
    expected('issuance replay without recopy',[reply.replayed,reply.codes===undefined||(Array.isArray(reply.codes)&&reply.codes.length===0),await events(term,'issue_batch')],[true,true,1])
    status(await change('admin-a',a,'issue_batch',{...spec,quantity:29}),400)
    status(await change('admin-a',a,'issue_batch',issue(term,6)),409)
    expected('after too large batch',await capState('admin-a',a,term),[5,30,0,0,0])
    return 'Expected and observed: 30 unique codes and 5 available seats; exact retry discloses no code or new allocation; request for 6 rejected atomically (409).'
  })

  await guard('B04 same-code concurrent redemption',async()=>{
    assert.ok(rawCodes?.length===30,'QA: no test batch')
    const payload={code:rawCodes[0].code}
    const results=await holdRace(a,learners.map(w=>()=>change(w,a,'redeem',payload)))
    expected('one winner and one denial',results.map(x=>x.status).sort((x,y)=>x-y),[200,409])
    const idx=results.findIndex(x=>x.status===200)
    winner=learners[idx];loser=learners[1-idx];winGrant=results[idx].body.id
    const repeat=await mutate(winner,a,'redeem',payload)
    expected('same grant on successful retry',[repeat.id===winGrant,repeat.replayed],[true,true])
    expected('actual assigned seat and success count',[await grants(term),await events(term,'redeem')],[1,1])
    expected('after one claim',await capState('admin-a',a,term),[5,29,1,0,0])
    return 'Expected and observed: two transactions overlapped; exactly one 200 and one 409, one grant/seat/success event; winner retries without a second grant.'
  })

  await guard('B05 code expiry and retired batch',async()=>{
    assert.ok(rawCodes&&loser,'QA: code race not established')
    const q="update institutional_private.learner_codes set expires_at=clock_timestamp()-interval '1 second' where institution_id=$1 and seat_id=$2 and redeemed_at is null"
    const r=await pool.query(q,[a,rawCodes[1].seat_id])
    expected('expired fixture rows',r.rowCount,1)
    status(await change(loser,a,'redeem',{code:rawCodes[1].code}),409)
    const small=issue(term,1)
    const extra=await mutate('admin-a',a,'issue_batch',small)
    await mutate('admin-a',a,'cancel_batch',{id:small.id,reason:'Synthetic retirement'})
    status(await change(loser,a,'redeem',{code:extra.codes[0].code}),409)
    expected('expiry and cancel did not grant',[await grants(term),await events(term,'redeem')],[1,1])
    expected('unused expiry reopened capacity; retired extra returned',await capState('admin-a',a,term),[6,28,1,0,0])
    return 'Expected and observed: before-expiry success in B04, expired and retired codes both 409, no new grants, expired unused capacity became available. Exact instant checked by server rule, not by external network timing.'
  })

  await guard('B06 suspension and revocation',async()=>{
    assert.ok(winGrant&&winner,'QA: winning grant not established')
    const p=async()=>request(winner,'/api/mock-exams',a,{action:'start',exam:'WAEC',subjects:['Economics'],mode:'revision',requestId:randomUUID(),institutionId:a})
    await seedProfile(winner,{subscription:'monthly',proExpiresAt:{__ts:{s:Math.floor(now/1000)+45*86400,n:0}}})
    const original=await readProfile(winner)
    const prior=await p()
    status(prior,200)
    expected('scoped existing entitlement',(await read(winner,a)).body.entitlement.namespace,'institutional_revision')
    await mutate('admin-a',a,'suspend_grant',{id:winGrant,reason:'Synthetic suspension'})
    expected('same session entitlement after suspension',(await read(winner,a)).body.entitlement,null)
    status(await p(),403)
    status(await change('admin-a',a,'resume_grant',{id:winGrant,reason:'Synthetic role check'}),403)
    await mutate('operator',a,'resume_grant',{id:winGrant,reason:'Synthetic review complete'})
    expected('operator restored existing grant',(await read(winner,a)).body.entitlement.grant_id===winGrant,true)
    status(await change('operator',a,'revoke_grant',{id:winGrant,reason:'Synthetic early reclaim',reclaim:true}),400)
    await mutate('operator',a,'revoke_grant',{id:winGrant,reason:'Synthetic offboarding pending',reclaim:false})
    status(await p(),403)
    status(await change('operator',a,'revoke_grant',{id:winGrant,reason:'Synthetic replay',reclaim:false}),400)
    const submit=await request(winner,'/api/mock-exams',null,{action:'submit',attemptId:prior.body.id,answers:{}})
    status(submit,200)
    const profile=await readProfile(winner)
    expected('retail subscription and allowance untouched',[profile.data.subscription,profile.data.proExpiresAt??null,profile.data.lastMockExamDate??null],[original.data.subscription,original.data.proExpiresAt??null,original.data.lastMockExamDate??null])
    await command('admin-a','revoke_member',a,{id:member.get(winner)})
    await mutate('operator',a,'release_seat',{id:rawCodes[0].seat_id,reason:'Synthetic member offboarded'})
    status(await change(loser,a,'redeem',{code:rawCodes[0].code}),409)
    expected('released seat, old grant retained',[await grants(term),...(await capState('admin-a',a,term))],[1,7,28,0,0,0])
    return 'Expected and observed: same-session school mock 403 after suspension/revocation; old attempt can finish; no retail change. Reclaim blocked until offboarding; released seat needs fresh code.'
  })

  await guard('B07 term renewal and scheduling',async()=>{
    assert.ok(loser,'QA: renewal actor missing')
    const next={...cur,id:randomUUID(),starts_at:iso(end),ends_at:iso(end+2*dayMs),renewal_of:term}
    status(await change('operator',a,'draft_term',{...next,id:randomUUID(),starts_at:iso(end-1000)}),400)
    await mutate('operator',a,'draft_term',next)
    status(await change('operator',a,'activate_term',{id:next.id}),400)
    expected('pending renewal pool',await count(next.id),0)
    await mutate('operator',a,'approve_term',{id:next.id,approval_ref:'QA-RECONCILIATION-002'})
    await mutate('operator',a,'activate_term',{id:next.id})
    status(await change('operator',a,'activate_term',{id:next.id}),400)
    const t=await termState('admin-a',a,next.id)
    expected('scheduled separate pool',[t.effective_state,t.renewal_of===term,await count(next.id),await grants(next.id)],['scheduled',true,35,0])
    const f=await mutate('admin-a',a,'issue_batch',issue(next.id,1,end+dayMs))
    status(await change(loser,a,'redeem',{code:f.codes[0].code}),409)
    // Clock-state fixture advances the synthetic renewal while retaining date order.
    await pool.query('update public.institutional_terms set ends_at=clock_timestamp()-interval \'2 minutes\' where institution_id=$1 and id=$2',[a,term])
    await pool.query('update public.institutional_terms set starts_at=clock_timestamp()-interval \'1 minute\' where institution_id=$1 and id=$2',[a,next.id])
    await mutate(loser,a,'redeem',{code:f.codes[0].code})
    expected('fresh code after new term starts',[(await read(loser,a)).body.entitlement.term_id===next.id,await grants(next.id),await count(term)],[true,1,35])
    return 'Expected and observed: overlap and unpaid activation rejected, scheduled pool 35 with no copied access, early claim 409; fresh code gives one grant after synthetic boundary.'
  })

  await guard('B08 School A/B isolation',async()=>{
    const other={...cur,id:randomUUID(),cohort_id:cohortB,seat_cap:2,quoted_minor:500_000}
    await mutate('operator',b,'draft_term',other)
    await mutate('operator',b,'approve_term',{id:other.id,approval_ref:'QA-RECONCILIATION-B'})
    await mutate('operator',b,'activate_term',{id:other.id})
    const bb=await mutate('admin-b',b,'issue_batch',issue(other.id,1))
    status(await read('admin-b',a),403)
    status(await read('admin-a',b),403)
    assert.ok(rawCodes?.[2],'QA: independent A code is missing')
    status(await change('mobile',b,'redeem',{code:rawCodes[2].code}),409)
    status(await change('mobile',a,'redeem',{code:rawCodes[2].code}),403)
    const visible=(await read('admin-b',b)).body
    expected('School B visible terms',visible.terms.map(x=>x.id===other.id),[true])
    expected('School B pool unchanged',await capState('admin-b',b,other.id),[1,1,0,0,0])
    expected('no grant for School B learner before own code',(await read('mobile',b)).body.entitlement,null)
    await mutate('mobile',b,'redeem',{code:bb.codes[0].code})
    expected('School B grant only after own code',[(await read('mobile',b)).body.entitlement.term_id===other.id,await grants(other.id)],[true,1])
    return 'Expected and observed: opposite-school admin views 403; alternate-school claim grants nothing, and School B requires its own code. Both ledgers and grant ownership preserved.'
  })

  await guard('B09 inactive school reconciliation is read-only',async()=>{
    const orig=await read('operator',b)
    status(orig,200)
    const selected=orig.body.terms[0]
    assert.ok(selected,'QA: School B term not available')
    await pool.query('update public.institutions set active=false where id=$1',[b])
    const history=await read('operator',b)
    status(history,200)
    expected('operator inactive reconciliation',[history.body.institution_active,history.body.terms[0].id===selected.id,history.body.terms[0].effective_state,history.body.grants.length],[false,true,'school inactive',1])
    status(await change('operator',b,'issue_batch',issue(selected.id,1)),403)
    status(await read('admin-b',b),403)
    const noNew=await request('mobile','/api/mock-exams',b,{action:'start',exam:'WAEC',subjects:['Economics'],mode:'revision',requestId:randomUUID(),institutionId:b})
    status(noNew,403)
    status(await read('admin-a',a),200)
    return 'Expected and observed: operator retains inactive-school history; new issuance/learner mock denied, school admin cannot load inactive context, other school unaffected.'
  })

  // Additional independent business invariants for the payment-integrity revision.
  // Re-open only the disposable B fixture closed in B09; other earlier checks stay unchanged.
  await pool.query('update public.institutions set active=true where id=$1',[b])
  const financialDraft=async (org,cohort)=>{
    const id=randomUUID()
    await mutate('operator',org,'draft_term',{...cur,id,cohort_id:cohort,seat_cap:3,quoted_minor:800_000})
    return id
  }
  const approve=(org,id,approval_ref)=>change('operator',org,'approve_term',{id,approval_ref})
  const reconcile=async id=>(await pool.query(
    'select state,approval_ref,approval_ref_key,approved_by,approved_at,quoted_minor,currency from public.institutional_terms where id=$1',[id]
  )).rows[0]
  const draftUnchanged=async id=>{
    const q=await reconcile(id)
    expected('unconsumed draft and no side effects',[q.state,q.approval_ref,q.approval_ref_key,q.approved_at,await events(id,'approve_term'),await count(id)],['draft',null,null,null,0,0])
  }
  const privateConflict=(r,sensitive)=>{
    status(r,409)
    expected('duplicate response keys',Object.keys(r.body),['error'])
    assert.match(r.body.error,/already assigned/i,'QA: expected actionable duplicate notice')
    for(const value of sensitive) assert.ok(!r.body.error.includes(value),'QA: duplicate response contains an unrelated tenant identifier')
  }

  await guard('F01 canonical payment identity and same-school conflict',async()=>{
    const first=await financialDraft(a,cohortA), second=await financialDraft(a,cohortA)
    status(await approve(a,first,' qa:north / 0526\t'),200)
    const q=await reconcile(first)
    expected('canonical payment, immutable amount, approval count',[q.approval_ref,q.approval_ref_key,q.quoted_minor,q.currency,await events(first,'approve_term'),await count(first)],['QA:NORTH/0526','QA:NORTH/0526','800000','NGN',1,0])
    for(const ref of ['QA:NORTH/0526','qA :NoRtH/05 26']) privateConflict(await approve(a,second,ref),[a,first])
    await draftUnchanged(second)
    return 'Expected and observed: ASCII case/spacing normalize to one reference; both duplicate approvals returned 409; losing term stayed draft with zero seats and no approval event.'
  })

  await guard('F02 simultaneous cross-school approvals',async()=>{
    const left=await financialDraft(a,cohortA),right=await financialDraft(b,cohortB)
    // Hold both independent tenant rows until both signed-in operator calls are waiting.
    const out=await holdRace([a,b],[
      ()=>approve(a,left,'QA:EAST-804'),
      ()=>approve(b,right,'qa: east - 804'),
    ])
    expected('one cross-school approval',out.map(r=>r.status).sort(),[200,409])
    const approved=out[0].status===200?left:right
    const losing=approved===left?right:left
    privateConflict(out.find(r=>r.status===409),[a,b,left,right])
    const q=await reconcile(approved)
    expected('winning reference and event',[q.state,q.approval_ref_key,await events(approved,'approve_term'),await count(approved)],['approved','QA:EAST-804',1,0])
    await draftUnchanged(losing)
    const distinctA=await financialDraft(a,cohortA),distinctB=await financialDraft(b,cohortB)
    const two=await holdRace([a,b],[()=>approve(a,distinctA,'QA:EAST-805'),()=>approve(b,distinctB,'QA:WEST-804')])
    expected('distinct payments both approved',two.map(r=>r.status),[200,200])
    return 'Expected and observed: database barriers verified overlap. Equal canonical references yielded one 200 and one private 409 with zero losing side effects; two distinct references both yielded 200.'
  })

  await guard('F03 cancelled term keeps its payment reservation',async()=>{
    const id=await financialDraft(a,cohortA), retry=await financialDraft(b,cohortB)
    status(await approve(a,id,'QA:SOUTH-116'),200)
    const before=await reconcile(id)
    await mutate('operator',a,'cancel_term',{id,reason:'Synthetic operator closed a term; no refund simulated'})
    expected('cancel preserves financial record',await reconcile(id),{...before,state:'cancelled'})
    privateConflict(await approve(b,retry,' qa :south-116 '),[a,b,id,retry])
    await draftUnchanged(retry)
    const triggers=(await pool.query("select tgtype::int as kind,tgenabled from pg_trigger where tgrelid='public.institutional_terms'::regclass and tgname='institutional_payment_reconciliation' and not tgisinternal")).rows
    assert.equal(triggers.length,1,'QA: missing immutable reconciliation trigger')
    // PostgreSQL bits: before 2, row 1, delete 8, update 16.
    expected('retention enabled for per-row UPDATE/DELETE',[triggers[0].kind,triggers[0].tgenabled],[27,'O'])
    return 'Expected and observed: cancellation kept original reference, actor, timestamp and quote; attempted normal reapproval in other school returned 409 and left the draft intact. UPDATE/DELETE retention trigger independently inspected, not invoked in this check.'
  })

  await guard('F04 school mock preflight and school-free retail control',async()=>{
    const start=(actor,org,fields={})=>request(actor,'/api/mock-exams',org,{
      action:'start',exam:'WAEC',subjects:['Economics'],mode:'revision',requestId:randomUUID(),...fields
    })
    status(await start('mobile',b),400)
    status(await start('mobile',b,{institutionId:a}),400)
    status(await start('lic-a1',b,{institutionId:b}),403)
    status(await start('mobile',b,{institutionId:b,mode:'draft_review',subjects:['Mathematics']}),403)
    status(await start('mobile',b,{institutionId:b}),200)
    status(await start('desktop',null),200)
    const route=readFileSync('app/api/mock-exams/route.ts','utf8').split('export async function POST')[1]
    const contextAt=route.indexOf("'institutional_licensing_context'")
    const featureAt=route.indexOf('process.env.INSTITUTIONAL_LICENSING_ENABLED')
    const bankAt=route.indexOf('let questions: MockQuestion[]')
    const serviceAt=route.indexOf('"start_institutional_mock"')
    assert.ok(featureAt>=0&&featureAt<contextAt&&contextAt<bankAt&&bankAt<serviceAt,'QA: school context checks must precede question lookup and transactional service start')
    return 'Expected and observed: header-only and mismatched context 400; non-entitled actor and school draft review 403; entitled school and retail revision 200. Source order matches preflight before bank lookup and service recheck after; no independent request-level bank instrumentation.'
  })


}
try { await main() }
catch(e) {
  note(stage, 'FAIL', e instanceof assert.AssertionError && e.message.startsWith('QA:') ? e.message : e.name || 'Setup blocked')
  process.exitCode=1
} finally {
  await browser?.close()
  if(app?.exitCode===null) app.kill('SIGTERM')
  await pool?.end()
  const verdict=process.exitCode?'FAIL':'PASS'
  writeFileSync(resolve(evidence,'checks.log'),rows.map(x=>x.verdict+' '+x.item+': '+x.detail).join('\n')+'\n')
  const report={commit,scope:'Linux local Supabase and Chromium. 360px emulation, not Windows or a physical phone. Synthetic content only.',expected:'3/8; isolated schools; immediate A-only revocation; deny unauthorized requests.',verdict,checks:rows}
  writeFileSync(resolve(evidence,'results.json'),JSON.stringify(report,null,2))
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Independent Linux acceptance: ${verdict}\n\nCommit: \`${commit}\`\n\n${rows.map(x=>`- **${x.verdict}** ${x.item}: ${x.detail}`).join('\n')}\n\nSynthetic only; no Windows or hosted verdict.\n`)
}
