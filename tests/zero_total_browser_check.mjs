// Standalone DepositPanel checks in the running Vite app; all APIs intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base = process.env.ZERO_TOTAL_BASE_URL || 'http://localhost:5173';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 't161-browser-'));
const child = spawn(process.env.ZERO_TOTAL_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
let socket;
try {
  let port;
  for(let i=0;i<100;i++) {try {port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch {await pause(100);}}
  assert.ok(port,'Edge starts');
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0, status='PENDING', free=true, posts=0;
  const pending=new Map(), errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const fixture=()=>({booking:{bookingId:10,totalAmount:free?0:600000,status},requiresDeposit:!free,isComplimentary:free,
    depositAmount:free?0:200000,deadline:free?null:'2099-01-01T00:00:00Z',isExpired:false,
    currentPaymentStatus:free?'NOT_REQUIRED':'PENDING',demoMode:false,
    payment:free?null:{paymentId:7,status:'PENDING',reference:'TEST-ONLY'},
    vietQr:free?null:{imageUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=',amount:200000}});
  socket.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const task=pending.get(m.id);pending.delete(m.id);m.error?task?.reject(new Error(JSON.stringify(m.error))):task?.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;let body=[];
      if(new URL(request.url).pathname==='/api/bookings/10/deposit'){
        if(request.method==='POST'){posts++;status='CONFIRMED';}
        body=fixture();
      }
      send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')})
        .catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await send('Page.navigate',{url:base+'/'});
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const wait=async expression=>{
    for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}
    throw new Error('Timeout: '+expression);
  };
  await wait('document.querySelector("#root") && document.readyState === "complete"');
  await evaluate(`(async()=>{
    const React=await import('/node_modules/.vite/deps/react.js');
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
    const Panel=await import('/src/components/DepositPanel/DepositPanel.jsx');
    document.querySelector('#root').style.display='none';
    const host=document.createElement('main');host.id='zero-fixture';host.style.cssText='max-width:600px;margin:30px auto;padding:20px';document.body.append(host);
    window.fixtureRoot=ReactDOM.default.createRoot(host);window.renderFixture=(key)=>window.fixtureRoot.render(React.default.createElement(Panel.default,{key,bookingId:10,bookingStatus:'PENDING',onPaymentChanged:()=>{window.refreshed=(window.refreshed||0)+1;}}));
    window.renderFixture('free');
  })()`);
  await wait('document.querySelector("#zero-fixture").textContent.includes("Xác nhận booking miễn phí")');
  assert.equal(await evaluate('document.querySelectorAll("#zero-fixture img").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#zero-fixture .deposit-countdown").length'),0);
  await evaluate('document.querySelector("#zero-fixture button").click()');
  await wait('document.querySelector("#zero-fixture").textContent.includes("Booking đã được xác nhận")');
  assert.equal(posts,1);assert.equal(await evaluate('window.refreshed'),1);
  status='CANCELLED';await evaluate('window.renderFixture("cancelled")');
  await wait('document.querySelector("#zero-fixture").textContent.includes("Booking đã hủy")');
  assert.equal(await evaluate('document.querySelectorAll("#zero-fixture button").length'),0);
  free=false;status='PENDING';await evaluate('window.renderFixture("positive")');
  await wait('document.querySelector("#zero-fixture img")');
  assert.match(await evaluate('document.querySelector("#zero-fixture").textContent'),/200[.,]000/);
  assert.deepEqual(errors,[]);
  const result={passed:3,scenarios:['Free booking: no QR/countdown, one confirmation and refresh','Cancelled free booking: no confirmation action','Positive booking: existing 200000 VND QR flow retained'],note:'Intercepted API fixtures; no SQL writes.'};
  await fs.writeFile('docs/T123-161-browser-checks.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {socket?.close();child.kill();}
