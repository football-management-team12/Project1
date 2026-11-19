// Real React routes; synthetic intercepted APIs, no application database access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const base=process.env.UC16_BASE_URL||'http://127.0.0.1:5180';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'uc16-browser-'));
const executable=process.env.UC16_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(executable,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const out='docs/uc16-evidence';await fs.mkdir(out,{recursive:true});let socket;
try {
  let port;
  for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port,'Browser debug port');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const pending=new Map(),checks=[],errors=[];let id=0,mode='normal',requestCount=0,lastQuery=null,role='ADMIN',delay=0;
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const fixture=JSON.parse(await fs.readFile(`${out}/sql-fixtures.json`,'utf8')).response;
  const zeroBreakdown=Object.fromEntries(Object.keys(fixture.bookingBreakdown).map(key=>[key,0]));
  socket.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p?.reject(new Error(JSON.stringify(message.error))):p?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);let body={},status=200;
      if(url.pathname==='/api/auth/me')body={user:{UserID:1,Role:role,FullName:'QA Admin',Status:'ACTIVE'}};
      else if(url.pathname==='/api/admin/reviews')body={items:[],total:0,unansweredCount:0};
      else if(url.pathname==='/api/admin/reports/summary'){
        requestCount++;lastQuery=Object.fromEntries(url.searchParams);
        if(mode==='error'){status=503;body={message:'Không thể tổng hợp báo cáo thử nghiệm'};}
        else {
          body=structuredClone(fixture);Object.assign(body,lastQuery);
          if(mode==='empty')Object.assign(body,{grossRevenue:0,refundedAmount:0,revenue:0,bookingCount:0,invoiceCount:0,fieldUtilization:[],
            bookingStatusCount:{},bookingBreakdown:{...zeroBreakdown},invoiceStatusCount:{},dailyRevenue:[{date:body.from,grossRevenue:0,refundedAmount:0,revenue:0}]});
          if(mode==='negative')Object.assign(body,{grossRevenue:0,refundedAmount:80,revenue:-80,dailyRevenue:[{date:body.from,grossRevenue:0,refundedAmount:80,revenue:-80}]});
          if(mode==='deposit-only')Object.assign(body,{bookingCount:0,bookingStatusCount:{},bookingBreakdown:{...zeroBreakdown,deposited:1,total:1}});
          body.depositAmount=mode==='empty'||mode==='negative'?0:100;body.venueCollectedAmount=body.grossRevenue-body.depositAmount;body.dailyRevenue=body.dailyRevenue.map(row=>({...row,depositAmount:0,venueCollectedAmount:row.grossRevenue}));
          body.bookingLifecycleBreakdown={pending:0,confirmed:3,in_progress:0,ended:0,no_show:0,cancelled:3,completed:2,unknown:0,total:8};
          if(mode==='empty'||mode==='negative')body.bookingLifecycleBreakdown=Object.fromEntries(Object.keys(body.bookingLifecycleBreakdown).map(key=>[key,0]));
          if(mode==='deposit-only')body.bookingLifecycleBreakdown={pending:0,confirmed:1,in_progress:0,ended:0,no_show:0,cancelled:0,completed:0,unknown:0,total:1};
          if(mode==='legacy')delete body.bookingLifecycleBreakdown.cancelled;
          if(mode==='unsafe-name')body.fieldUtilization[0].fieldName='=HYPERLINK("https://example.invalid","<img src=x onerror=alert(1)>")';
        }
      }
      const response={requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')};
      const fulfill=()=>send('Fetch.fulfillRequest',response).catch(error=>{if(!error.message.includes('Invalid InterceptionId'))errors.push(error.message);});
      if(delay&&url.pathname==='/api/admin/reports/summary')setTimeout(fulfill,delay);else fulfill();
    }
  };
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',FullName:'QA Admin'}));localStorage.setItem('accessToken','test-only-intercepted');`});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error('Timeout '+expression+' '+JSON.stringify(errors));};
  const fill=async(name,value)=>evaluate(`(()=>{const el=document.querySelector('input[name="${name}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click=async text=>evaluate(`[...document.querySelectorAll('.uc16-page button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'));};
  const ready=()=>wait('document.querySelector(".uc16-metrics") && document.querySelector(".uc16-page").getAttribute("aria-busy")==="false"');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1250,deviceScaleFactor:1,mobile:false});
  delay=600;await send('Page.navigate',{url:base+'/admin/reports'});await wait('document.querySelector(".uc16-state[role=status]")');checks.push('Loading state before report arrives');await ready();delay=0;
  assert.equal(lastQuery.to,await evaluate(`new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())`));
  assert.equal(lastQuery.from.slice(-2),'01');
  assert.equal(await evaluate('document.querySelector(".uc16-booking-summary header p").textContent'),`Ngày đặt sân: ${lastQuery.from} — ${lastQuery.to}`);
  checks.push('Default month-to-date range ends today in Vietnam; summary shows applied boundaries');
  assert.equal(await evaluate('document.querySelectorAll(".uc16-metric").length'),5);
  assert.ok(await evaluate('document.querySelector(".uc16-metrics").textContent.includes("350")'));
  assert.equal(await evaluate('document.querySelectorAll(".uc16-fields tbody tr").length'),3);
  assert.ok(await evaluate('document.querySelector(".uc16-definition").textContent.includes("24 giờ")'));
  assert.equal(await evaluate('document.querySelector(".uc16-page").textContent.includes("Trạng thái thanh toán")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".uc16-metric")[3].textContent.includes("Đã hoàn thành và đã thu đủ tiền")'),true);
  checks.push('Completed fully paid booking count; payment-status section removed; chart and utilization retained');
  assert.equal(await evaluate('document.querySelectorAll(".uc16-booking-summary [data-booking-group]").length'),7);
  assert.equal(await evaluate('document.querySelector("[data-booking-group=cancelled] dd").textContent'),'3');
  assert.equal(await evaluate('document.querySelector(".uc16-booking-total dd").textContent'),'8');
  mode='deposit-only';await click('Làm mới');await ready();
  assert.equal(await evaluate('document.querySelectorAll(".uc16-metric")[3].querySelector("strong").textContent'),'0');
  assert.equal(await evaluate('document.querySelector("[data-booking-group=confirmed] dd").textContent'),'1');
  assert.equal(await evaluate('document.querySelector(".uc16-booking-total dd").textContent'),'1');
  checks.push('Deposit-only booking excluded from completed card; right column shows deposit and reconciled total');
  mode='normal';await click('Làm mới');await ready();
  await fill('from','2026-11-01');await fill('to','2026-11-02');await evaluate('document.querySelector(".uc16-filter").requestSubmit()');await ready();
  assert.deepEqual(lastQuery,{from:'2026-11-01',to:'2026-11-02'});checks.push('Submitted date filters match API query and result period');await shot('report-desktop');
  await evaluate('document.querySelector(".uc16-card summary").click()');
  assert.equal(await evaluate('document.querySelectorAll("details tbody tr").length'),2);checks.push('Accessible daily table matches chart data');
  const before=requestCount;await fill('from','2026-11-03');await evaluate('document.querySelector(".uc16-filter").requestSubmit()');await wait('document.querySelector(".uc16-error[role=alert]")');
  assert.equal(requestCount,before);checks.push('Reversed date validation stops request');
  await fill('from','2020-01-01');await evaluate('document.querySelector(".uc16-filter").requestSubmit()');await wait('document.querySelector(".uc16-error[role=alert]")');
  assert.equal(requestCount,before);checks.push('Over-366-day validation stops request');
  await click('Tháng này');await ready();assert.equal(lastQuery.to,await evaluate(`new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())`));checks.push('Current-month shortcut restores month-to-date and resets date validation');
  mode='empty';await click('Làm mới');await ready();await wait('document.querySelector(".uc16-empty")');
  assert.equal(await evaluate('document.querySelectorAll(".uc16-fields tbody tr").length'),0);checks.push('No-data report returns zero metrics and empty field list');
  mode='negative';await click('Làm mới');await ready();
  assert.ok(await evaluate('document.querySelector(".uc16-metric.featured").textContent.includes("-80")'));checks.push('Refund-only negative net revenue remains visible');
  mode='error';await click('Làm mới');await wait('document.querySelector(".uc16-error[role=alert]")');
  assert.equal(await evaluate('document.querySelector(".uc16-metrics")===null'),true);
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Xuất CSV")).disabled'),true);
  mode='normal';await click('Thử lại');await ready();checks.push('Error hides stale report/export; retry restores report');
  mode='legacy';await click('Làm mới');await ready();
  assert.equal(await evaluate('document.querySelector(".uc16-page").textContent.includes("NaN")'),false);
  assert.equal(await evaluate('document.querySelector("[data-booking-group=cancelled] dd").textContent'),'—');
  assert.equal(await evaluate('document.querySelector(".uc16-booking-total dd").textContent'),'—');
  checks.push('All seven lifecycle groups shown; legacy missing counts show unavailable rather than NaN or fabricated zero');
  mode='unsafe-name';await click('Làm mới');await ready();
  assert.equal(await evaluate('document.querySelector(".uc16-fields img")===null'),true);
  await evaluate('window.__csv=null;URL.createObjectURL=blob=>{window.__csv=blob;return "blob:test-fixture";};HTMLAnchorElement.prototype.click=function(){window.__filename=this.download;};');
  await click('Xuất CSV');const csv=await evaluate('window.__csv.text()');
  assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('"Doanh thu thuần (VND)","350"'));
  assert.ok((await evaluate('window.__filename')).startsWith('bao-cao-'));checks.push('CSV contains same metrics, quotes text and neutralizes formula injection; React escapes field names');
  mode='normal';await click('Làm mới');await ready();
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:1100,deviceScaleFactor:1,mobile:false});await pause(150);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);checks.push('1024px report layout has no page overflow');await shot('report-tablet');
  await send('Emulation.setDeviceMetricsOverride',{width:700,height:1100,deviceScaleFactor:1,mobile:false});await pause(150);
  const pageFits=await evaluate('(()=>{const el=document.querySelector(".uc16-page");return el.scrollWidth<=el.clientWidth+1;})()');
  assert.equal(pageFits,true);checks.push('Narrow report content wraps; tables scroll inside their containers');
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${out}/browser-checks.json`,JSON.stringify({passed:checks.length,scenarios:checks,note:'Real React routes with synthetic intercepted APIs. No live database writes. Desktop/tablet checks; no full mobile shell claim.'},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,scenarios:checks}));
} finally {
  if(socket?.readyState===WebSocket.OPEN) {
    socket.send(JSON.stringify({id:999999,method:'Browser.close'}));
    await pause(500);
  }
  socket?.close();child.kill();child.unref();
}
