import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { institutionalHttp } from '../lib/institutional/http'
import { parseCommand } from '../lib/institutional/contracts'
const a='a0000000-0000-4000-8000-000000000001'
const b='b0000000-0000-4000-8000-000000000002'
const command = { action: 'create_cohort', institution_id:a, payload: {name:'Synthetic cohort'} }
const request = (body: unknown = command, org=a) => new Request('http://localhost/api/institutional', {method:'POST', headers:{Authorization:'Bearer synthetic-token','X-Institution-Id':org},body:JSON.stringify(body)})
test('command contract rejects identity overrides, missing context and excessive personal data',()=>{
 assert.deepEqual(parseCommand(command),command)
 for (const bad of [{...command,actor_id:a},{...command,institution_id:null},{...command,payload:{name:'Test',role:'school_admin'}},{...command,payload:{name:'Test',dob:'2008-01-01'}},{...command,payload:{name:'x'.repeat(101)}},{action:'grant_operator',institution_id:a,payload:{}},{action:'enroll_learner',institution_id:a,payload:{user_id:b,alias:'Full Name Here'}}]) assert.equal(parseCommand(bad),null)
})
test('disabled and unauthenticated requests never create a database client',async()=>{
 const noClient = ()=>{throw new Error('Client should not be created')}
 assert.equal((await institutionalHttp(request(),{enabled:false},noClient)).status,404)
 assert.equal((await institutionalHttp(new Request('http://localhost/api/institutional'),{enabled:true},noClient)).status,401)
})
test('real Supabase HTTP transport uses caller token, validates school context, sanitizes errors and disables caching',async()=>{
 const calls: {path:string;auth:string|undefined;body:string}[]=[]
 let rejectAuth=false; let rejectCommand=false; let hideSchool=false
 const server=http.createServer(async(req,res)=>{
  let body=''; for await (const chunk of req) body+=chunk
  calls.push({path:req.url!,auth:req.headers.authorization,body})
  res.setHeader('Content-Type','application/json')
  if(req.url?.startsWith('/auth/v1/user')) {
   res.statusCode=rejectAuth?401:200;res.end(JSON.stringify(rejectAuth?{message:'invalid token'}:{id:a,email:'synthetic@example.invalid',aud:'authenticated'}));return
  }
  if(req.url?.startsWith('/rest/v1/rpc/institutional_command')) {
   res.statusCode=rejectCommand?403:200;res.end(JSON.stringify(rejectCommand?{code:'42501',message:'private token and schema details'}:{id:b}));return
  }
  if(req.url?.startsWith('/rest/v1/institutions')) {res.end(JSON.stringify(hideSchool?[]:[{id:a,name:'Synthetic school',active:true,created_at:'2026-01-01'}]));return}
  res.end('[]')
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 const address=server.address() as {port:number};const config={enabled:true,url:`http://127.0.0.1:${address.port}`,key:'synthetic-publishable-key'}
 try {
  let response=await institutionalHttp(request(),config)
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:b})
  assert.match(response.headers.get('cache-control')!,/private, no-store/)
  assert.match(response.headers.get('vary')!,/Authorization.*X-Institution-Id/)
  assert.ok(calls.every(call=>call.auth==='Bearer synthetic-token'))
  const sent=JSON.parse(calls.find(c=>c.path.includes('/rpc/'))!.body)
  assert.deepEqual(sent,{p_action:'create_cohort',p_institution_id:a,p_payload:{name:'Synthetic cohort'}})
  calls.length=0
  assert.equal((await institutionalHttp(request(command,b),config)).status,400)
  assert.ok(calls.every(c=>c.path.startsWith('/auth/')))
  assert.equal((await institutionalHttp(request({...command,payload:{name:'x'.repeat(5000)}}),config)).status,413)
  rejectCommand=true
  response=await institutionalHttp(request(),config)
  assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/private token|schema/)
  rejectAuth=true;calls.length=0
  assert.equal((await institutionalHttp(request(),config)).status,401)
  assert.equal(calls.length,1)
  rejectAuth=false;calls.length=0
  response=await institutionalHttp(new Request('http://localhost/api/institutional',{headers:{Authorization:'Bearer synthetic-token','X-Institution-Id':a}}),config)
  assert.equal(response.status,200)
  for(const c of calls.filter(c=>c.path.startsWith('/rest/')&&!c.path.startsWith('/rest/v1/institutions'))) assert.ok(c.path.includes(`institution_id=eq.${a}`))
  hideSchool=true;calls.length=0
  response=await institutionalHttp(new Request('http://localhost/api/institutional',{headers:{Authorization:'Bearer synthetic-token','X-Institution-Id':b}}),config)
  assert.equal(response.status,403)
  assert.equal(calls.length,2,'Denied context must not issue roster queries')
 } finally { await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve())) }
})
