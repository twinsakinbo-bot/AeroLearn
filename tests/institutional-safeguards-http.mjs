import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
// Local stub implements only Auth identity + guard lookup. Any other backend
// access fails the test. No real Supabase, mail, provider or account is used.
const learner='a0000000-0000-4000-8000-000000000006'
const retail='a0000000-0000-4000-8000-000000000010'
const unexpected=[]
let unavailable=false
const backend=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk
 res.setHeader('Content-Type','application/json')
 if(req.url==='/auth/v1/user') {
  res.end(JSON.stringify({id:req.headers.authorization==='Bearer retail-token'?retail:learner,email:'synthetic@example.invalid',aud:'authenticated',user_metadata:{}}));return
 }
 if(req.url==='/rest/v1/rpc/institutional_learner_guard') {
  if(unavailable){res.statusCode=503;res.end(JSON.stringify({message:'synthetic failure'}));return}
  res.end(JSON.stringify(JSON.parse(body).p_uid===learner));return
 }
 unexpected.push(req.url);res.statusCode=500;res.end('{}')
})
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve))
const backendPort=backend.address().port
const port=4320,base=`http://127.0.0.1:${port}`
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
 stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${backendPort}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon-key',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',INSTITUTIONAL_MVP_ENABLED:'false',INSTITUTIONAL_LICENSING_ENABLED:'true',RESEND_API_KEY:'',GROQ_API_KEY:'',AETHER_API_KEY:'',COARENA_API_KEY:''},
})
let logs='';app.stdout.on('data',v=>{logs=(logs+v).slice(-4000)});app.stderr.on('data',v=>{logs=(logs+v).slice(-4000)})
try {
 let ready=false
 for(let i=0;i<60;i++) {
  if(app.exitCode!==null)throw new Error(logs)
  try{if((await fetch(base)).ok){ready=true;break}}catch{}
  await delay(500)
 }
 assert.ok(ready,'Local production server did not start')
 const paths=['ai-chat','ai-tutor','ai-quiz','ai-flashcards','ai-timetable','ai-essay-grader','friends','conversations/leave','challenges/generate','gamification/add-coins','onboarding/welcome']
 for(const path of paths) {
  const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{Authorization:'Bearer learner-token','Content-Type':'application/json'},body:'{}'})
  assert.equal(response.status,403,`${path}: ${await response.text()}`)
 }
 const target=await fetch(`${base}/api/friends`,{method:'POST',headers:{Authorization:'Bearer retail-token','Content-Type':'application/json'},body:JSON.stringify({action:'request',targetId:learner})})
 assert.equal(target.status,403,'Retail user must not contact a protected learner')
 unavailable=true
 const failed=await fetch(`${base}/api/ai-tutor`,{method:'POST',headers:{Authorization:'Bearer learner-token','Content-Type':'application/json'},body:'{}'})
 assert.equal(failed.status,503,'Unavailable safeguards must fail closed')
 for(const [path,method] of [['/api/institutional/licensing','GET'],['/api/institutional/licensing','POST'],['/app/institutional','GET']]) {
  const response=await fetch(base+path,{method,headers:{Authorization:'Bearer learner-token','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})})
  assert.equal(response.status,404,`${method} ${path}: institutional master switch must disable licensing`)
 }
 assert.deepEqual(unexpected,[],'Protected routes reached business data/provider preparation')
 console.log('16 local production HTTP safeguard checks passed; no real accounts, provider calls or email.')
} finally {
 app.kill('SIGTERM');await new Promise(resolve=>app.exitCode!==null?resolve():app.once('exit',resolve))
 await new Promise(resolve=>backend.close(resolve))
}
