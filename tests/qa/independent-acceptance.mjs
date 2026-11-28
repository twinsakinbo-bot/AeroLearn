/** Independent release acceptance, using only an unlinked disposable Supabase stack. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { chromium } from '@playwright/test'

const base = 'http://127.0.0.1:4322'
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
  loopback(cfg.API_URL,'http:','54321')
  loopback(cfg.DB_URL,'postgresql:','54322')
  const local = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } }
  pool = new pg.Pool({ connectionString: cfg.DB_URL })
  const admin = createClient(cfg.API_URL, cfg.SERVICE_ROLE_KEY,local)
  const accounts = new Map()
  for (const name of ['desktop','mobile','operator','admin-a','admin-b','teacher','unaffiliated']) {
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
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','4322'],{env,stdio:'ignore'})
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
        await econ.click()
        await page.locator('select').filter({has:page.locator('option[value="revision"]')}).selectOption('revision')
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
