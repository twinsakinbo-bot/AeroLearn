import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {LearningMarkdown} from '../components/learn/LearningMarkdown'
test('math rendering does not inherit a polluted trust setting',()=>{
 const previous=Object.getOwnPropertyDescriptor(Object.prototype,'trust')
 try{
  Object.defineProperty(Object.prototype,'trust',{value:true,configurable:true,writable:true})
  const html=renderToStaticMarkup(createElement(LearningMarkdown,{children:'$\\htmlClass{untrusted-macro}{x}$'}))
  assert.doesNotMatch(html,/class="untrusted-macro"/)
  assert.match(html,/htmlClass|katex-error/)
 }finally{
  if(previous)Object.defineProperty(Object.prototype,'trust',previous)
  else delete (Object.prototype as {trust?:boolean}).trust
 }
})
