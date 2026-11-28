/** Independent release acceptance, using only an unlinked disposable Supabase stack. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
  for (const name of ['desktop','mobile','operator','admin-a','admin-b','teacher','unaffiliated','hardening']) {
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
  await pool.query('insert into institutional_private.operators(user_id) values($1)',[accounts.get('operator').uid])
  const env={ PATH:process.env.PATH, HOME:process.env.HOME, TMPDIR:process.env.RUNNER_TEMP || process.env.TMPDIR,
    NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SITE_URL:base, NEXT_PUBLIC_SUPABASE_URL:cfg.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:cfg.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY:cfg.SERVICE_ROLE_KEY,
    INSTITUTIONAL_MVP_ENABLED:'true', MOCK_DRAFT_REVIEW_ENABLED:'false', VERCEL_ENV:'preview' }
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
