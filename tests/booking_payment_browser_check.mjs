// Verify real React admin controls with intercepted APIs; no customer data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base=process.env.BOOKING_TEST_BASE_URL || 'http://127.0.0.1:5173';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'booking-pay-test-'));
const child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try {
  let port;
  for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port,'Browser starts');
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0,paid=false,confirmations=0;
  const pending=new Map(),errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const row=(n,status,deposit,canComplete)=>({BookingID:n,UserID:2,CustomerName:'QA Customer',Phone:'000',Email:'qa.invalid',
    FieldID:5,FieldName:'QA Field',FieldType:'7 player',Location:'QA',BookingDate:'2026-11-12',StartTime:'06:00',EndTime:'16:00',
    TotalAmount:350000,Status:status,DepositAmount:deposit,PaidAmount:n===4&&paid?350000:deposit,
    RemainingAmount:350000-(n===4&&paid?350000:deposit),CanConfirmBooking:deposit>0,CanCompleteBooking:canComplete});
  const rows=()=>[row(1,'PENDING',0,false),row(2,'CANCELLED',0,false),row(3,'CONFIRMED',100000,false),row(4,'COMPLETED',100000,true),row(5,'COMPLETED',0,false)];
  socket.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;const pathname=new URL(request.url).pathname;let body={};
      if(pathname==='/api/bookings/' || pathname==='/api/bookings')body={Bookings:rows()};
      else if(/\/settlement$/.test(pathname)){
        const bad=pathname.includes('/5/');const deposit=bad?0:100000;
        body={bookingId:bad?5:4,bookingStatus:'COMPLETED',totalAmount:350000,depositAmount:deposit,
          paidAmount:!bad&&paid?350000:deposit,remainingAmount:!bad&&paid?0:350000-deposit,
          status:!bad&&paid?'PAID':deposit?'PARTIALLY_PAID':'UNPAID',canConfirm:!bad&&!paid};
      } else if(pathname.endsWith('/confirm-final-payment')){paid=true;confirmations++;body={status:'PAID',amount:250000};}
      else if(/\/api\/bookings\/\d+$/.test(pathname))body=rows().find(r=>r.BookingID===Number(pathname.split('/').at(-1)));
      else if(pathname.includes('cancellation-requests'))body={requests:[]};
      send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')})
        .catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error('Timeout: '+expression+' '+JSON.stringify(await evaluate('({text:document.querySelector("#booking-fixture")?.textContent,alert:window.lastAlert})'))+' '+JSON.stringify(errors));};
  await send('Page.navigate',{url:base+'/'});
  await wait('document.readyState==="complete" && document.querySelector("#root")');
  await evaluate(`(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const DOM=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const pageSource=await (await fetch('/src/pages/Admin/BookingManagement.jsx')).text();
    const routerPath=pageSource.split('\\n').find(line=>line.includes('from "')&&line.includes('react-router-dom')).split('"')[1];
    const R=await import(routerPath);
    const Page=(await import('/src/pages/Admin/BookingManagement.jsx')).default;
    window.confirm=()=>true;window.alert=message=>{window.lastAlert=message;};
    document.querySelector('#root').style.display='none';
    const host=document.createElement('main');host.id='booking-fixture';document.body.append(host);
    const root=DOM.createRoot(host);
    window.renderBookingFixture=key=>root.render(React.createElement(R.MemoryRouter,{key},React.createElement(R.Routes,null,
      React.createElement(R.Route,{element:React.createElement(R.Outlet,{context:{user:{UserID:1,Role:'ADMIN'}}})},
        React.createElement(R.Route,{path:'*',element:React.createElement(Page)})))));
    window.renderBookingFixture('initial');
  })()`);
  await wait('document.querySelectorAll("#booking-fixture tbody tr").length===5');
  assert.equal(await evaluate('document.querySelector("#booking-fixture tbody tr:nth-child(1) .booking-action-confirm").disabled'),true);
  assert.equal(await evaluate('document.querySelector("#booking-fixture tbody tr:nth-child(3) .booking-action-complete").disabled'),true);
  assert.equal(await evaluate('document.querySelector("#booking-fixture tbody tr:nth-child(2) .booking-action-complete")'),null);
  await evaluate('document.querySelector("#booking-fixture tbody tr:nth-child(4) .booking-action-detail").click()');
  await wait('document.querySelector("#booking-fixture .settlement-confirm")');
  assert.equal(await evaluate('document.querySelector("#booking-fixture .settlement-confirm").textContent.trim()'),'Xác nhận đã thu đủ');
  await evaluate('document.querySelector("#booking-fixture .settlement-confirm").click()');
  await wait('!document.querySelector("#booking-fixture .settlement-confirm") && document.querySelector("#booking-fixture .settlement-panel")?.textContent.includes("Đã thanh toán")');
  assert.equal(confirmations,1);
  await evaluate('window.renderBookingFixture("legacy")');
  await wait('document.querySelectorAll("#booking-fixture tbody tr").length===5');
  await evaluate('document.querySelector("#booking-fixture tbody tr:nth-child(5) .booking-action-detail").click()');
  await wait('document.querySelector("#booking-fixture .settlement-panel")?.textContent.includes("Đơn chưa cọc thành công")');
  assert.equal(await evaluate('document.querySelector("#booking-fixture .settlement-confirm")'),null);
  assert.equal(confirmations,1);assert.deepEqual(errors,[]);
  console.log('PASS: unpaid confirmation disabled, future completion disabled, cancelled has no completion, eligible cash button/refresh, legacy unpaid guidance');
} finally {socket?.close();child.kill();}
